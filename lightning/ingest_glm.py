#!/usr/bin/env python3
"""
Ingestão de atividade elétrica (GOES-19 / GLM) — roda FORA da Vercel.

Por que existe: o produto bruto do GLM é NetCDF4 por flash, um arquivo a cada
20 segundos. Parsear isso dentro de uma function da Vercel seria exatamente o
custo de Fluid Active CPU que este projeto já está cortando em todo lugar (ver
CLAUDE.md, "Relay de balneabilidade" e "feature-flags.ts"). Então: GitHub
Actions processa, publica um snapshot pequeno num host estático, e a Vercel só
faz `fetch` (src/lib/lightning/fontes.ts).

Fonte: NOAA Open Data on AWS, `s3://noaa-goes19/GLM-L2-LCFA/`.
  - ANÔNIMA (nenhuma credencial, nenhum token que expira — requisito do brief:
    um cron rodando sozinho por meses não pode depender de renovação manual).
  - Near-real-time: medido ao vivo, ~10s entre o fim da janela de observação e
    o objeto aparecer no S3.
  - Produto L2 LCFA (Lightning Cluster Filter Algorithm): por-flash, com
    lat/lon. O GHRC DAAC foi descartado — o produto de lá é L3 GRADEADO e
    exige Earthdata Login.

O que este script NÃO faz, de propósito:
  - Não sabe nada sobre as ~1.750 praias do catálogo. Publica células ao longo
    da costa; o recorte por praia acontece no render da Vercel, em memória
    (mesmo desenho de `placasProximas`). Assim o job não quebra quando o
    catálogo muda, e uma ingestão regional serve todas as praias.
  - Não guarda histórico. Publica o ESTADO ATUAL e sobrescreve — o brief é
    explícito sobre não manter série temporal por praia.
  - Não classifica risco, não estima probabilidade, não pontua nada. Só conta
    o que o satélite observou, onde e quando.

Uso:
    python ingest_glm.py                 # processa e publica
    python ingest_glm.py --dry-run       # processa e imprime, sem publicar

Ambiente (via secrets do GitHub Actions):
    LIGHTNING_UPLOAD_URL     endpoint PHP que recebe o snapshot
    LIGHTNING_UPLOAD_SECRET  segredo compartilhado (header x-relay-secret)
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import numpy as np
import requests
from netCDF4 import Dataset

BUCKET_URL = "https://noaa-goes19.s3.amazonaws.com"
PREFIXO = "GLM-L2-LCFA"
SATELITE = "GOES-19"
PRODUTO = "GLM-L2-LCFA"

# Janela máxima publicada. As janelas mais apertadas (15/30) são contagens
# derivadas dentro da mesma passada — nunca um segundo download.
JANELA_MAX_MIN = 60
JANELAS_MIN = (15, 30, 60)

# Caixa costeira do Brasil, com folga suficiente pro raio de proximidade que a
# Vercel aplica (20km) e pra incerteza de geolocalização do GLM fora do nadir.
# A maior parte do volume de flashes do hemisfério é convecção continental que
# nunca chega perto do litoral — este recorte derruba o volume logo na entrada,
# antes de qualquer agregação.
LAT_MIN, LAT_MAX = -35.0, 6.0
LON_MIN, LON_MAX = -55.0, -29.0

# Lado da célula de agregação, em graus. ~11km, mesma ordem da resolução
# espacial nominal do GLM (~10km perto do nadir) — agregar mais fino
# publicaria uma precisão que o instrumento não tem.
CELULA_GRAU = 0.1

# Abaixo desta fração de arquivos processados com sucesso, o job NÃO publica.
# Um snapshot com metade da janela faltando poderia virar "nenhuma atividade"
# na tela — um "não" que ninguém checou de verdade. Sem publicação, o snapshot
# anterior envelhece sozinho e a Vercel passa a dizer "sem dados recentes",
# que é honesto.
COBERTURA_MINIMA = 0.85

TIMEOUT_S = 30
# Threads de DOWNLOAD apenas (I/O puro, `requests` é thread-safe). O parse do
# NetCDF nunca roda em paralelo — ver `parsear_flashes`.
WORKERS = 12
# Baixa em lotes em vez de tudo de uma vez: `Executor.map` agenda a lista
# inteira e segura todos os bytes na memória até serem consumidos. Numa
# tempestade grande os arquivos ficam bem maiores que o normal.
LOTE = 24


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def listar_objetos(prefixo: str) -> list[str]:
    """Lista as chaves sob um prefixo (S3 anônimo, ListObjectsV2 em XML)."""
    chaves: list[str] = []
    token: str | None = None
    while True:
        params = {"list-type": "2", "prefix": prefixo, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        resp = requests.get(BUCKET_URL, params=params, timeout=TIMEOUT_S)
        resp.raise_for_status()
        raiz = ET.fromstring(resp.content)
        ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
        for c in raiz.findall("s3:Contents", ns):
            k = c.find("s3:Key", ns)
            if k is not None and k.text:
                chaves.append(k.text)
        truncado = raiz.find("s3:IsTruncated", ns)
        if truncado is None or truncado.text != "true":
            break
        prox = raiz.find("s3:NextContinuationToken", ns)
        token = prox.text if prox is not None else None
        if not token:
            break
    return chaves


def inicio_da_janela(chave: str) -> datetime | None:
    """
    Extrai o início da janela de observação do nome do arquivo.

    Formato: OR_GLM-L2-LCFA_G19_sYYYYDDDHHMMSSm_e..._c....nc
    O campo `s` é o start: ano(4) dia-do-ano(3) hora(2) min(2) seg(2) décimo(1).

    Usar o timestamp do ARQUIVO (e não o offset por evento dentro do NetCDF) é
    deliberado: cada arquivo cobre 20 segundos, e as janelas do produto são de
    15/30/60 MINUTOS — 20s de granularidade é ordens de grandeza mais preciso
    do que o necessário, e evita depender de detalhes de decodificação de tempo
    do formato.
    """
    nome = chave.rsplit("/", 1)[-1]
    for parte in nome.split("_"):
        if not parte.startswith("s") or len(parte) < 15:
            continue
        d = parte[1:15]
        if not d.isdigit():
            continue
        try:
            base = datetime(int(d[0:4]), 1, 1, tzinfo=timezone.utc)
            return base + timedelta(
                days=int(d[4:7]) - 1,
                hours=int(d[7:9]),
                minutes=int(d[9:11]),
                seconds=int(d[11:13]),
            )
        except ValueError:
            return None
    return None


def chaves_da_janela(agora: datetime, janela_min: int) -> list[tuple[str, datetime]]:
    """Chaves cuja janela de observação cai dentro dos últimos `janela_min`."""
    inicio = agora - timedelta(minutes=janela_min)
    horas: list[datetime] = []
    cursor = inicio.replace(minute=0, second=0, microsecond=0)
    while cursor <= agora:
        horas.append(cursor)
        cursor += timedelta(hours=1)

    achadas: list[tuple[str, datetime]] = []
    for h in horas:
        prefixo = f"{PREFIXO}/{h.year:04d}/{h.timetuple().tm_yday:03d}/{h.hour:02d}/"
        try:
            chaves = listar_objetos(prefixo)
        except Exception as e:  # noqa: BLE001 — hora ausente não derruba o job
            print(f"aviso: falha ao listar {prefixo}: {e}", file=sys.stderr)
            continue
        for k in chaves:
            if not k.endswith(".nc"):
                continue
            t = inicio_da_janela(k)
            if t is not None and inicio <= t <= agora:
                achadas.append((k, t))
    achadas.sort(key=lambda par: par[1])
    return achadas


def baixar(chave: str) -> bytes | None:
    """
    Baixa um LCFA e devolve os bytes crus. `None` em qualquer falha — o
    chamador contabiliza a cobertura.

    Só isto roda em thread: é I/O puro, e `requests` é thread-safe. O parse
    fica de fora de propósito (ver `parsear_flashes`).
    """
    try:
        resp = requests.get(f"{BUCKET_URL}/{chave}", timeout=TIMEOUT_S)
        resp.raise_for_status()
        return resp.content
    except Exception as e:  # noqa: BLE001
        print(f"aviso: falha ao baixar {chave}: {e}", file=sys.stderr)
        return None


def parsear_flashes(dados: bytes) -> tuple[np.ndarray, np.ndarray]:
    """
    Extrai (lats, lons) de um LCFA já baixado, recortados pra caixa costeira.

    NUNCA CHAME ISTO DE MAIS DE UMA THREAD. A HDF5 por baixo do netCDF4 não é
    thread-safe nas wheels do PyPI: abrir vários `Dataset` em paralelo derruba
    o processo com SIGSEGV, sem exceção em Python pra capturar. Foi exatamente
    o que aconteceu na primeira execução real deste job (exit 139).

    Passa por arquivo temporário em vez de `Dataset(..., memory=bytes)` pelo
    mesmo motivo: a leitura in-memory do netCDF4-python é uma API instável, e o
    custo de escrever ~200 KB em disco no runner é irrelevante perto de um
    crash que não dá pra tratar.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".nc", delete=False)
    try:
        tmp.write(dados)
        tmp.close()
        with Dataset(tmp.name, mode="r") as ds:
            if "flash_lat" not in ds.variables or "flash_lon" not in ds.variables:
                return np.empty(0), np.empty(0)
            # Sem máscara: o filtro de caixa costeira logo abaixo já descarta
            # qualquer fill value, e o autoscale (int16 -> graus) continua.
            ds.set_auto_mask(False)
            lats = np.asarray(ds.variables["flash_lat"][:], dtype=float)
            lons = np.asarray(ds.variables["flash_lon"][:], dtype=float)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    if lats.size == 0:
        return np.empty(0), np.empty(0)

    dentro = (
        (lats >= LAT_MIN) & (lats <= LAT_MAX) & (lons >= LON_MIN) & (lons <= LON_MAX)
    )
    return lats[dentro], lons[dentro]


def montar_snapshot(agora: datetime) -> dict | None:
    alvos = chaves_da_janela(agora, JANELA_MAX_MIN)
    if not alvos:
        print("erro: nenhum arquivo GLM na janela", file=sys.stderr)
        return None

    esperado = len(alvos)
    print(f"{esperado} arquivos na janela de {JANELA_MAX_MIN}min")

    # celula -> {"ultima": datetime, "contagens": {15: n, 30: n, 60: n}}
    celulas: dict[tuple[int, int], dict] = {}
    processados = 0
    observado_ate: datetime | None = None

    # Duas fases, deliberadamente separadas: baixa em paralelo (I/O), parseia em
    # série (a HDF5 não é thread-safe — ver `parsear_flashes`).
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i in range(0, len(alvos), LOTE):
            lote = alvos[i : i + LOTE]
            baixados = list(pool.map(lambda par: baixar(par[0]), lote))

            for (chave, t), dados in zip(lote, baixados):
                if dados is None:
                    continue
                try:
                    lats, lons = parsear_flashes(dados)
                except Exception as e:  # noqa: BLE001 — um arquivo corrompido não derruba a janela
                    print(f"aviso: falha ao parsear {chave}: {e}", file=sys.stderr)
                    continue

                processados += 1
                # `t` é o INÍCIO da janela do arquivo; cada arquivo cobre 20s.
                fim = t + timedelta(seconds=20)
                if observado_ate is None or fim > observado_ate:
                    observado_ate = fim
                if lats.size == 0:
                    continue
                idade_min = (agora - t).total_seconds() / 60.0
                ilat = np.rint(lats / CELULA_GRAU).astype(int)
                ilon = np.rint(lons / CELULA_GRAU).astype(int)
                for a, o in zip(ilat.tolist(), ilon.tolist()):
                    c = celulas.get((a, o))
                    if c is None:
                        c = {"ultima": t, "contagens": {j: 0 for j in JANELAS_MIN}}
                        celulas[(a, o)] = c
                    elif t > c["ultima"]:
                        c["ultima"] = t
                    for j in JANELAS_MIN:
                        if idade_min <= j:
                            c["contagens"][j] += 1

    cobertura = processados / esperado if esperado else 0.0
    print(f"processados {processados}/{esperado} ({cobertura:.0%}), {len(celulas)} células")
    if cobertura < COBERTURA_MINIMA:
        print(
            f"erro: cobertura {cobertura:.0%} abaixo do mínimo de {COBERTURA_MINIMA:.0%} — "
            "não publicando (um snapshot incompleto viraria um 'nenhuma atividade' falso)",
            file=sys.stderr,
        )
        return None

    lista = [
        {
            "lat": round(a * CELULA_GRAU, 4),
            "lon": round(o * CELULA_GRAU, 4),
            "ultimaDeteccao": c["ultima"].isoformat().replace("+00:00", "Z"),
            "contagem15": c["contagens"][15],
            "contagem30": c["contagens"][30],
            "contagem60": c["contagens"][60],
        }
        for (a, o), c in celulas.items()
    ]
    lista.sort(key=lambda x: (x["lat"], x["lon"]))

    return {
        "geradoEm": agora.isoformat().replace("+00:00", "Z"),
        "observadoAte": (observado_ate or agora).isoformat().replace("+00:00", "Z"),
        "satelite": SATELITE,
        "produto": PRODUTO,
        "celulas": lista,
    }


def publicar(snapshot: dict) -> None:
    url = os.environ.get("LIGHTNING_UPLOAD_URL", "").strip()
    segredo = os.environ.get("LIGHTNING_UPLOAD_SECRET", "").strip()
    if not url or not segredo:
        raise SystemExit("erro: LIGHTNING_UPLOAD_URL/LIGHTNING_UPLOAD_SECRET não definidos")

    corpo = json.dumps(snapshot, ensure_ascii=False).encode("utf-8")

    # Assinatura de autenticidade (2026-09-07), distinta do segredo de upload.
    # O segredo de upload mora na HostGator (constante no .php) e só prova pro
    # PHP quem está gravando; esta assinatura prova pra VERCEL que os bytes
    # saíram deste runner — HMAC-SHA256 com RELAY_SIGNING_SECRET, um segredo
    # que existe só no GitHub Actions e na Vercel. Mensagem: "lightning\n" +
    # assinadoEm + "\n" + corpo (a chave fixa impede que outro artefato
    # assinado seja colocado no lugar; o timestamp impede replay). O PHP guarda
    # num sidecar e devolve em header; a Vercel confere
    # (src/lib/relay/assinatura.ts). Sem o segredo, publica sem assinar.
    segredo_assinatura = os.environ.get("RELAY_SIGNING_SECRET", "").strip()
    headers_assinatura: dict[str, str] = {}
    if segredo_assinatura:
        assinado_em = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        mensagem = f"lightning\n{assinado_em}\n".encode("utf-8") + corpo
        headers_assinatura = {
            "x-relay-signed-at": assinado_em,
            "x-relay-signature": hmac.new(
                segredo_assinatura.encode("utf-8"), mensagem, hashlib.sha256
            ).hexdigest(),
        }
    else:
        print("aviso: RELAY_SIGNING_SECRET ausente — publicando SEM assinatura", file=sys.stderr)

    sessao = requests.Session()
    ultimo_erro: Exception | None = None
    for tentativa in (1, 2, 3):
        try:
            resp = sessao.post(
                url,
                data=corpo,
                headers={
                    **headers_assinatura,
                    "content-type": "application/json",
                    "x-relay-secret": segredo,
                    # O mod_security da HostGator devolve 406 ("Not Acceptable")
                    # pra qualquer User-Agent que contenha `python-`. Medido
                    # contra o servidor real, com o mesmo corpo e o mesmo
                    # segredo, variando só o UA:
                    #
                    #   python-requests/2.32.3 -> 406   (o default do requests)
                    #   python-urllib3/2.2.1   -> 406
                    #   Mozilla/... Chrome/128 -> 406   (fingir navegador é PIOR)
                    #   curl/8.5.0             -> 403   (passa; 403 = o PHP respondeu)
                    #   node / undici          -> 403
                    #   praiashoje-relay/1.0   -> 403
                    #   (sem header UA)        -> 403
                    #
                    # O relay de balneabilidade nunca esbarrou nisso porque
                    # publica pelo `fetch` do Node. Aqui vai um UA próprio e
                    # honesto — descreve o que o cliente é, em vez de fingir
                    # ser um navegador (que nem funcionaria).
                    "user-agent": "praiashoje-relay/1.0",
                    "accept": "application/json",
                },
                timeout=TIMEOUT_S,
            )
            if resp.status_code == 200:
                print(f"publicado ({len(corpo)} bytes)")
                return

            # Desafio de cookie da HostGator ("Bot Protection"). Em vez de
            # responder, o servidor devolve HTML mandando o cliente gravar um
            # cookie e recarregar:
            #
            #   HTTP 409
            #   <script>document.cookie = "humans_21909=1";
            #           document.location.reload(true)</script>
            #
            # Um navegador cumpre isso sem o usuário ver; `requests` só enxerga
            # um 409 com HTML no corpo. O retry antigo repetia a MESMA
            # requisição sem cookie nenhum, então o desafio nunca era cumprido e
            # as duas tentativas falhavam igual (medido em 2026-09-07).
            #
            # Aqui a gente faz o que o próprio servidor está pedindo: lê o par
            # nome=valor do script, grava na sessão e repete. O nome carrega um
            # número que muda por instalação/host, então é extraído do corpo em
            # vez de ficar fixo no código.
            # A aspa de fechamento NÃO é exigida de propósito: a mesma proteção
            # às vezes anexa atributos ao valor (`"humans_1=1; path=/"`), e
            # exigir o fecho faria o casamento falhar justo aí. Ancorar em
            # `document.cookie` já é específico o bastante pra não casar com
            # resposta legítima do PHP (conferido contra os JSON de 200/403).
            desafio = re.search(r'document\.cookie\s*=\s*"([^"=]+)=([^";]*)', resp.text)
            if desafio and tentativa < 3:
                nome, valor = desafio.group(1), desafio.group(2)
                sessao.cookies.set(nome, valor)
                print(
                    f"aviso: desafio de cookie da hospedagem (HTTP {resp.status_code}); "
                    f"reenviando com {nome}={valor}",
                    file=sys.stderr,
                )
                continue

            ultimo_erro = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:  # noqa: BLE001
            ultimo_erro = e
        if tentativa < 3:
            print(f"aviso: upload falhou ({ultimo_erro}), tentando de novo", file=sys.stderr)
    raise SystemExit(f"erro: upload falhou: {ultimo_erro}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="processa e imprime, sem publicar")
    args = p.parse_args()

    snapshot = montar_snapshot(_agora_utc())
    if snapshot is None:
        raise SystemExit(1)

    com_atividade = [c for c in snapshot["celulas"] if c["contagem60"] > 0]
    print(f"{len(com_atividade)} células com atividade na janela de 60min")
    for c in com_atividade[:10]:
        print(f"  {c['lat']:.1f},{c['lon']:.1f}  60m={c['contagem60']}  última={c['ultimaDeteccao']}")

    if args.dry_run:
        print(json.dumps(snapshot, ensure_ascii=False)[:2000])
        return
    publicar(snapshot)


if __name__ == "__main__":
    main()
