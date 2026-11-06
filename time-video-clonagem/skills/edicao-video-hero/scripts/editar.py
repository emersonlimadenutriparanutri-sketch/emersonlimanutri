#!/usr/bin/env python3
"""Edição de vídeo HERO — cortes, silêncios, formato vertical, áudio e trilha.

Requer apenas ffmpeg/ffprobe instalados. Subcomandos:

  info        mostra duração, resolução, fps e áudio
  silencios   remove pausas/respiros longos (jump cut automático)
  cortar      mantém só um trecho (início/fim) ou remove trechos
  vertical    converte para 9:16 (1080x1920) com corte central ou fundo desfocado
  normalizar  ajusta volume da voz para o padrão de redes (-14 LUFS)
  trilha      adiciona música de fundo com "ducking" (abaixa quando a voz fala)
  juntar      concatena vários vídeos (gancho + corpo + CTA, por exemplo)

Exemplos:
  python3 editar.py silencios bruto.mp4 limpo.mp4 --limiar -32 --min 0.45 --folga 0.12
  python3 editar.py vertical limpo.mp4 vertical.mp4 --modo desfoque
  python3 editar.py trilha vertical.mp4 trilha.mp3 final.mp4 --volume 0.18
"""
import argparse
import json
import re
import subprocess
import sys

VCODEC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p"]
ACODEC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]


def run(cmd):
    print("+", " ".join(cmd), file=sys.stderr)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ffmpeg falhou:\n{r.stderr[-3000:]}")
    return r


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                        "-show_streams", path], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Não consegui ler {path}: {r.stderr}")
    d = json.loads(r.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    fps = None
    if v and v.get("avg_frame_rate", "0/0") != "0/0":
        n, m = v["avg_frame_rate"].split("/")
        fps = round(int(n) / int(m), 3)
    return {"duracao": float(d["format"]["duration"]),
            "largura": v and v["width"], "altura": v and v["height"], "fps": fps,
            "tem_audio": a is not None}


def keep_filter(segs, has_audio):
    expr = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in segs)
    vf = f"select='{expr}',setpts=N/FRAME_RATE/TB"
    af = f"aselect='{expr}',asetpts=N/SR/TB" if has_audio else None
    return vf, af


def render_keep(src, dst, segs):
    info = probe(src)
    vf, af = keep_filter(segs, info["tem_audio"])
    cmd = ["ffmpeg", "-y", "-i", src, "-vf", vf]
    if af:
        cmd += ["-af", af]
    run(cmd + VCODEC + ACODEC + ["-movflags", "+faststart", dst])


def cmd_info(a):
    print(json.dumps(probe(a.entrada), indent=2, ensure_ascii=False))


def detect_silences(src, limiar, minimo):
    r = subprocess.run(["ffmpeg", "-i", src, "-af", f"silencedetect=noise={limiar}dB:d={minimo}",
                        "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return starts, ends


def cmd_silencios(a):
    info = probe(a.entrada)
    if not info["tem_audio"]:
        sys.exit("O vídeo não tem áudio — nada a cortar.")
    dur = info["duracao"]
    starts, ends = detect_silences(a.entrada, a.limiar, a.min)
    if len(ends) < len(starts):
        ends.append(dur)
    segs, cur = [], 0.0
    for s, e in zip(starts, ends):
        fim = min(dur, s + a.folga)
        if fim - cur > 0.08:
            segs.append((cur, fim))
        cur = max(cur, e - a.folga)
    if dur - cur > 0.08:
        segs.append((cur, dur))
    if not segs:
        sys.exit("Tudo foi detectado como silêncio — aumente o --limiar (ex.: -40).")
    removido = dur - sum(b - a_ for a_, b in segs)
    print(f"{len(starts)} pausas encontradas; removendo {removido:.1f}s de {dur:.1f}s", file=sys.stderr)
    render_keep(a.entrada, a.saida, segs)
    print(json.dumps({"saida": a.saida, "segundos_removidos": round(removido, 2),
                      "trechos_mantidos": [[round(x, 2), round(y, 2)] for x, y in segs]}, indent=2))


def parse_t(x):
    parts = [float(p) for p in str(x).split(":")]
    t = 0.0
    for p in parts:
        t = t * 60 + p
    return t


def cmd_cortar(a):
    dur = probe(a.entrada)["duracao"]
    ini = parse_t(a.inicio) if a.inicio else 0.0
    fim = parse_t(a.fim) if a.fim else dur
    segs = [(ini, fim)]
    for r in a.remover or []:
        x, y = (parse_t(v) for v in r.split("-"))
        nova = []
        for s, e in segs:
            if y <= s or x >= e:
                nova.append((s, e))
                continue
            if x > s:
                nova.append((s, x))
            if y < e:
                nova.append((y, e))
        segs = nova
    render_keep(a.entrada, a.saida, segs)


def cmd_vertical(a):
    W, H = a.largura, a.altura
    if a.modo == "corte":
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H}:(iw-{W})/2+{a.desloc_x}*iw:(ih-{H})/2,setsar=1")
        cmd = ["ffmpeg", "-y", "-i", a.entrada, "-vf", vf]
    else:
        fc = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H},boxblur=30:5,eq=brightness=-0.08[bg];"
              f"[b]scale={W}:{H}:force_original_aspect_ratio=decrease[fg];"
              f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]")
        cmd = ["ffmpeg", "-y", "-i", a.entrada, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?"]
    run(cmd + ["-r", str(a.fps)] + VCODEC + ACODEC + ["-movflags", "+faststart", a.saida])


def cmd_normalizar(a):
    af = f"highpass=f=80,loudnorm=I={a.lufs}:TP=-1.5:LRA=11"
    run(["ffmpeg", "-y", "-i", a.entrada, "-c:v", "copy", "-af", af] + ACODEC + [a.saida])


def cmd_trilha(a):
    dur = probe(a.entrada)["duracao"]
    fade_out = max(0.0, dur - 1.5)
    fc = (f"[1:a]volume={a.volume},afade=t=in:d=0.8,afade=t=out:st={fade_out:.2f}:d=1.5[m];"
          f"[0:a]asplit[voz][sc];"
          f"[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];"
          f"[voz][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
    run(["ffmpeg", "-y", "-i", a.entrada, "-stream_loop", "-1", "-i", a.musica,
         "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy"] + ACODEC +
        ["-t", f"{dur:.3f}", "-movflags", "+faststart", a.saida])


def cmd_juntar(a):
    n = len(a.entradas)
    ref = probe(a.entradas[0])
    W, H, fps = ref["largura"], ref["altura"], ref["fps"] or 30
    cmd = ["ffmpeg", "-y"]
    for e in a.entradas:
        cmd += ["-i", e]
    parts = []
    for i, e in enumerate(a.entradas):
        parts.append(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                     f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v{i}]")
        if probe(e)["tem_audio"]:
            parts.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo[a{i}]")
        else:
            d = probe(e)["duracao"]
            parts.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{d}[a{i}]")
    parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]")
    run(cmd + ["-filter_complex", ";".join(parts), "-map", "[v]", "-map", "[a]"] + VCODEC +
        ACODEC + ["-movflags", "+faststart", a.saida])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)

    s = sp.add_parser("info"); s.add_argument("entrada"); s.set_defaults(f=cmd_info)

    s = sp.add_parser("silencios"); s.add_argument("entrada"); s.add_argument("saida")
    s.add_argument("--limiar", type=float, default=-32, help="dB abaixo do qual é silêncio (padrão -32)")
    s.add_argument("--min", type=float, default=0.45, help="pausa mínima em s para cortar (padrão 0.45)")
    s.add_argument("--folga", type=float, default=0.12, help="respiro mantido em cada lado do corte")
    s.set_defaults(f=cmd_silencios)

    s = sp.add_parser("cortar"); s.add_argument("entrada"); s.add_argument("saida")
    s.add_argument("--inicio"); s.add_argument("--fim")
    s.add_argument("--remover", action="append", help="trecho a remover, ex.: 12.5-15 ou 0:12-0:15")
    s.set_defaults(f=cmd_cortar)

    s = sp.add_parser("vertical"); s.add_argument("entrada"); s.add_argument("saida")
    s.add_argument("--modo", choices=["corte", "desfoque"], default="corte")
    s.add_argument("--desloc-x", type=float, default=0.0, help="ajuste horizontal do corte (-0.3 a 0.3)")
    s.add_argument("--largura", type=int, default=1080); s.add_argument("--altura", type=int, default=1920)
    s.add_argument("--fps", type=int, default=30)
    s.set_defaults(f=cmd_vertical)

    s = sp.add_parser("normalizar"); s.add_argument("entrada"); s.add_argument("saida")
    s.add_argument("--lufs", type=float, default=-14); s.set_defaults(f=cmd_normalizar)

    s = sp.add_parser("trilha"); s.add_argument("entrada"); s.add_argument("musica"); s.add_argument("saida")
    s.add_argument("--volume", type=float, default=0.18); s.set_defaults(f=cmd_trilha)

    s = sp.add_parser("juntar"); s.add_argument("saida"); s.add_argument("entradas", nargs="+")
    s.set_defaults(f=cmd_juntar)

    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
