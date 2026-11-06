#!/usr/bin/env python3
"""Letterings e efeitos a partir de uma "linha do tempo" em JSON.

Uso:
  python3 letterings.py video.mp4 timeline.json final.mp4
  python3 letterings.py --exemplo > timeline.json      (gera um modelo comentado)

Elementos suportados na timeline (todos opcionais):
  letterings  textos na tela: estilos titulo | tarja | destaque | numero | rodape
              animações pop | desliza | fade | sobe | nenhuma; posição topo | centro | base
  zooms       "punch-in" (aproxima o rosto) para dar ritmo: ini, fim, escala (1.08–1.25)
  flashes     piscada branca curta na troca de ideia: t
  imagens     PNG (logo, selo, emoji, print) com ini/fim, x/y e largura
  barra_progresso  barra fina que enche até o fim (retém atenção)
  cta         texto final de chamada; "ini" negativo = segundos antes do fim

Tempos em segundos. Cores em #RRGGBB.
"""
import argparse
import json
import subprocess
import sys

EXEMPLO = {
    "marca": {"fonte": "Montserrat", "cor_primaria": "#0F3D3E", "cor_destaque": "#FFD23F",
              "cor_texto": "#FFFFFF"},
    "letterings": [
        {"texto": "3 ERROS NA MENOPAUSA", "ini": 0.0, "fim": 2.8, "estilo": "titulo", "pos": "topo", "anim": "pop"},
        {"texto": "ERRO 1", "ini": 3.0, "fim": 4.5, "estilo": "numero", "pos": "centro", "anim": "pop"},
        {"texto": "Cortar carboidrato de vez", "ini": 4.5, "fim": 7.0, "estilo": "tarja", "pos": "topo", "anim": "desliza"},
        {"texto": "Emerson Lima • Nutricionista", "ini": 0.5, "fim": 4.0, "estilo": "rodape", "pos": "base", "anim": "fade"}
    ],
    "zooms": [{"ini": 3.0, "fim": 4.5, "escala": 1.15}],
    "flashes": [{"t": 3.0}],
    "imagens": [{"arquivo": "logo.png", "ini": 0, "fim": -0.1, "x": "W-w-50", "y": "60", "largura": 160}],
    "barra_progresso": {"cor": "#FFD23F", "altura": 10},
    "cta": {"texto": "Toque em SAIBA MAIS", "ini": -3.5, "estilo": "tarja", "pos": "centro", "anim": "pop"}
}


def hex_ass(h, alpha="00"):
    h = h.lstrip("#")
    return f"&H{alpha}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def ffcolor(h):
    return "0x" + h.lstrip("#")


def ts(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def dur_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                        "default=nw=1:nk=1", path], capture_output=True, text=True)
    return float(r.stdout.strip())


def size_of(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True)
    w, h = r.stdout.strip().split(",")[:2]
    return int(w), int(h)


def rel(t, dur):
    return dur + t if t < 0 else t


def build_ass(tl, W, H, dur):
    m = tl.get("marca", {})
    fonte = m.get("fonte", "Montserrat")
    prim = m.get("cor_primaria", "#0F3D3E")
    dest = m.get("cor_destaque", "#FFD23F")
    txt = m.get("cor_texto", "#FFFFFF")
    s = W / 1080
    # Name, Font, Size, Primary, Secondary, Outline, Back, Bold, BorderStyle, Outline, Shadow
    estilos = {
        "titulo":   (fonte, int(92 * s), txt, txt, "#000000", "#000000", 1, 6 * s, 3),
        "tarja":    (fonte, int(68 * s), txt, txt, prim, prim, 3, 18 * s, 0),
        "destaque": (fonte, int(80 * s), "#111111", "#111111", dest, dest, 3, 16 * s, 0),
        "numero":   (fonte, int(190 * s), dest, dest, "#000000", "#000000", 1, 9 * s, 4),
        "rodape":   (fonte, int(44 * s), txt, txt, prim, prim, 3, 12 * s, 0),
    }
    head = [f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 0\n"
            "ScaledBorderAndShadow: yes\n\n[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
            "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
            "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"]
    for nome, (f, sz, c1, c2, c3, c4, bs, ol, sh) in estilos.items():
        head.append(f"Style: {nome},{f},{sz},{hex_ass(c1)},{hex_ass(c2)},{hex_ass(c3)},{hex_ass(c4, '20')},"
                    f"-1,0,0,0,100,100,1,0,{bs},{ol:.0f},{sh},5,90,90,0,1")
    head.append("\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

    ypos = {"topo": int(H * 0.17), "centro": int(H * 0.45), "base": int(H * 0.86)}
    itens = list(tl.get("letterings", []))
    if tl.get("cta"):
        c = dict(tl["cta"]); c.setdefault("fim", dur); c.setdefault("estilo", "tarja")
        c.setdefault("pos", "centro"); c.setdefault("anim", "pop"); itens.append(c)
    ev = []
    for it in itens:
        ini, fim = rel(it["ini"], dur), rel(it.get("fim", dur), dur)
        if fim <= ini:
            continue
        x = W // 2
        y = int(it["y"]) if "y" in it else ypos.get(it.get("pos", "topo"), ypos["topo"])
        anim = it.get("anim", "pop")
        if anim == "pop":
            fx = f"\\pos({x},{y})\\fscx20\\fscy20\\t(0,140,\\fscx112\\fscy112)\\t(140,240,\\fscx100\\fscy100)\\fad(0,120)"
        elif anim == "desliza":
            fx = f"\\move({-W // 2},{y},{x},{y},0,220)\\fad(0,120)"
        elif anim == "sobe":
            fx = f"\\move({x},{y + 120},{x},{y},0,250)\\fad(150,120)"
        elif anim == "fade":
            fx = f"\\pos({x},{y})\\fad(250,250)"
        else:
            fx = f"\\pos({x},{y})"
        texto = it["texto"].replace("\n", "\\N")
        ev.append(f"Dialogue: 1,{ts(ini)},{ts(fim)},{it.get('estilo', 'titulo')},,0,0,0,,{{{fx}}}{texto}")
    return "\n".join(head) + "\n" + "\n".join(ev) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video", nargs="?"); p.add_argument("timeline", nargs="?"); p.add_argument("saida", nargs="?")
    p.add_argument("--exemplo", action="store_true", help="imprime uma timeline modelo")
    p.add_argument("--fontsdir", default="")
    a = p.parse_args()
    if a.exemplo:
        print(json.dumps(EXEMPLO, indent=2, ensure_ascii=False)); return
    if not (a.video and a.timeline and a.saida):
        p.error("informe video, timeline e saida (ou use --exemplo)")

    with open(a.timeline, encoding="utf-8") as f:
        tl = json.load(f)
    W, H = size_of(a.video)
    dur = dur_of(a.video)

    chain = []
    zooms = tl.get("zooms", [])
    if zooms:
        termos = []
        for z in zooms:
            i0, i1, e = rel(z["ini"], dur), rel(z["fim"], dur), z.get("escala", 1.15)
            rampa = z.get("rampa", 0.18)
            termos.append(f"between(t,{i0:.3f},{i1:.3f})*{e - 1:.3f}*min(1,(t-{i0:.3f})/{rampa})")
        fator = "1+" + "+".join(termos)
        chain.append(f"scale=w='trunc(iw*({fator})/2)*2':h=-2:eval=frame,crop={W}:{H},setsar=1")
    for fl in tl.get("flashes", []):
        t0 = rel(fl["t"], dur)
        chain.append(f"drawbox=x=0:y=0:w=iw:h=ih:c=white@{fl.get('intensidade', 0.55)}:t=fill:"
                     f"enable='between(t,{t0:.3f},{t0 + 0.07:.3f})'")

    ass_path = a.saida.rsplit(".", 1)[0] + "_letterings.ass"
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(build_ass(tl, W, H, dur))
    esc = ass_path.replace(":", "\\:").replace("'", "\\'")
    chain.append(f"ass='{esc}'" + (f":fontsdir='{a.fontsdir}'" if a.fontsdir else ""))

    bp = tl.get("barra_progresso")
    if bp:
        h = bp.get("altura", 10)
        y = "0" if bp.get("pos") == "topo" else f"ih-{h}"
        chain.append(f"drawbox=x=0:y={y}:w='iw*t/{dur:.3f}':h={h}:c={ffcolor(bp.get('cor', '#FFD23F'))}:t=fill")

    inputs = ["-i", a.video]
    graph = [f"[0:v]{','.join(chain)}[v0]"]
    last = "v0"
    for k, im in enumerate(tl.get("imagens", []), start=1):
        inputs += ["-loop", "1", "-i", im["arquivo"]]
        i0, i1 = rel(im.get("ini", 0), dur), rel(im.get("fim", dur), dur)
        graph.append(f"[{k}:v]scale={im.get('largura', 200)}:-1,format=rgba[im{k}]")
        graph.append(f"[{last}][im{k}]overlay=x={im.get('x', 'W-w-40')}:y={im.get('y', '40')}:"
                     f"enable='between(t,{i0:.3f},{i1:.3f})':shortest=1[v{k}]")
        last = f"v{k}"

    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", ";".join(graph), "-map", f"[{last}]",
           "-map", "0:a?", "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
           "-c:a", "copy", "-t", f"{dur:.3f}", "-movflags", "+faststart", a.saida]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr[-3000:])
    print(f"Letterings: {ass_path}\nVídeo final: {a.saida}")


if __name__ == "__main__":
    main()
