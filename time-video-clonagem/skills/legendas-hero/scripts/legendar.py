#!/usr/bin/env python3
"""Gera legenda dinâmica estilo Reels (palavra ativa destacada) e grava no vídeo.

Entrada de texto: JSON de palavras (transcrever.py) OU arquivo .srt (ex.: HeyGen).
Saída: arquivo .ass editável + vídeo com a legenda "queimada".

Uso:
  python3 legendar.py video.mp4 palavras.json final.mp4
  python3 legendar.py video.mp4 legenda.srt final.mp4 --estilo caixa --destaques "insulina,menopausa"
  python3 legendar.py video.mp4 palavras.json - --so-ass legenda.ass   (só gera o .ass)

Estilos: pop (padrão, palavra ativa colorida e maior), caixa (palavra ativa com
fundo colorido), limpo (sem animação, só blocos de texto).
"""
import argparse
import json
import re
import subprocess
import sys


def hex_to_ass(h, alpha="00"):
    h = h.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()


def ts(t):
    t = max(0.0, t)
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def parse_srt_time(x):
    h, m, rest = x.strip().replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)


def load_words(path):
    if path.lower().endswith(".json"):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d["palavras"] if isinstance(d, dict) else d
    # SRT: distribui o tempo do bloco entre as palavras, proporcional ao tamanho
    with open(path, encoding="utf-8-sig") as f:
        blocks = re.split(r"\n\s*\n", f.read().strip())
    words = []
    for b in blocks:
        lines = [l for l in b.splitlines() if l.strip()]
        tl = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if tl is None:
            continue
        ini, fim = (parse_srt_time(x) for x in lines[tl].split("-->"))
        toks = " ".join(lines[tl + 1:]).split()
        if not toks:
            continue
        total = sum(len(t) + 2 for t in toks)
        t = ini
        for tok in toks:
            d = (fim - ini) * (len(tok) + 2) / total
            words.append({"w": tok, "ini": round(t, 3), "fim": round(t + d, 3)})
            t += d
    return words


def chunk(words, max_palavras, max_chars, pausa):
    grupos, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        txt = " ".join(x["w"] for x in cur)
        prox = words[i + 1] if i + 1 < len(words) else None
        fim_frase = re.search(r"[.!?…:;]$", w["w"])
        quebra = (len(cur) >= max_palavras or len(txt) >= max_chars or fim_frase
                  or (prox and prox["ini"] - w["fim"] > pausa) or (prox and w["w"].endswith(",") and len(cur) >= 2))
        if quebra or prox is None:
            grupos.append(cur)
            cur = []
    return grupos


def norm(s):
    return re.sub(r"[^\wÀ-ÿ]", "", s.lower())


def build_ass(words, a):
    W, H = a.largura, a.altura
    branco = hex_to_ass(a.cor_texto)
    contorno = hex_to_ass(a.cor_contorno)
    destaque = hex_to_ass(a.cor_destaque)
    marcar = {norm(x) for x in a.destaques.split(",") if x.strip()}
    margem_v = int(H * a.posicao)
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Leg,{a.fonte},{a.tamanho},{branco},{branco},{contorno},&H64000000,-1,0,0,0,100,100,0,0,1,{a.contorno},2,2,80,80,{margem_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for g in chunk(words, a.max_palavras, a.max_chars, a.pausa):
        g_ini, g_fim = g[0]["ini"], g[-1]["fim"]
        toks = [(w["w"].upper() if a.maiusculas else w["w"]) for w in g]
        if a.estilo == "limpo":
            lines.append(f"Dialogue: 0,{ts(g_ini)},{ts(g_fim)},Leg,,0,0,0,,{' '.join(toks)}")
            continue
        for i, w in enumerate(g):
            ini = w["ini"]
            fim = g[i + 1]["ini"] if i + 1 < len(g) else g_fim
            if fim <= ini:
                continue
            parts = []
            for j, t in enumerate(toks):
                fixo = norm(g[j]["w"]) in marcar
                if j == i:
                    if a.estilo == "caixa":
                        parts.append(f"{{\\3c{destaque}\\bord{int(a.contorno*3)}\\1c&H00FFFFFF&}}{t}{{\\r}}")
                    else:
                        parts.append(f"{{\\1c{destaque}\\fscx112\\fscy112\\t(0,90,\\fscx118\\fscy118)\\t(90,180,\\fscx112\\fscy112)}}{t}{{\\r}}")
                elif fixo:
                    parts.append(f"{{\\1c{destaque}}}{t}{{\\r}}")
                else:
                    parts.append(t)
            entrada = "{\\fad(60,0)}" if i == 0 else ""
            lines.append(f"Dialogue: 0,{ts(ini)},{ts(fim)},Leg,,0,0,0,,{entrada}{' '.join(parts)}")
    return head + "\n".join(lines) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video"); p.add_argument("texto", help=".json de palavras ou .srt"); p.add_argument("saida")
    p.add_argument("--estilo", choices=["pop", "caixa", "limpo"], default="pop")
    p.add_argument("--fonte", default="Montserrat")
    p.add_argument("--tamanho", type=int, default=84)
    p.add_argument("--contorno", type=float, default=5)
    p.add_argument("--cor-texto", default="#FFFFFF")
    p.add_argument("--cor-contorno", default="#000000")
    p.add_argument("--cor-destaque", default="#FFD23F")
    p.add_argument("--destaques", default="", help="palavras sempre coloridas, separadas por vírgula")
    p.add_argument("--max-palavras", type=int, default=3)
    p.add_argument("--max-chars", type=int, default=22)
    p.add_argument("--pausa", type=float, default=0.35)
    p.add_argument("--posicao", type=float, default=0.30, help="distância da base, em fração da altura (0.30 = terço inferior seguro)")
    p.add_argument("--maiusculas", action="store_true")
    p.add_argument("--largura", type=int, default=1080); p.add_argument("--altura", type=int, default=1920)
    p.add_argument("--so-ass", help="apenas salva o .ass neste caminho (não renderiza)")
    p.add_argument("--fontsdir", default="", help="pasta com .ttf da marca (opcional)")
    a = p.parse_args()

    words = load_words(a.texto)
    if not words:
        sys.exit("Nenhuma palavra encontrada no arquivo de texto.")
    ass = build_ass(words, a)
    ass_path = a.so_ass or (a.saida.rsplit(".", 1)[0] + ".ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass)
    print(f"Legenda: {ass_path}")
    if a.so_ass:
        return
    esc = ass_path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    vf = f"ass='{esc}'" + (f":fontsdir='{a.fontsdir}'" if a.fontsdir else "")
    cmd = ["ffmpeg", "-y", "-i", a.video, "-vf", vf, "-c:v", "libx264", "-crf", "19",
           "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", a.saida]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr[-3000:])
    print(f"Vídeo legendado: {a.saida}")


if __name__ == "__main__":
    main()
