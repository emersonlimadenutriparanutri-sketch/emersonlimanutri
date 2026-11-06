#!/usr/bin/env python3
"""Transcreve a fala do vídeo com tempo de cada palavra (para legenda dinâmica).

Saída: JSON  {"idioma": "pt", "palavras": [{"w": "Você", "ini": 0.12, "fim": 0.40}, ...]}

Motor: faster-whisper (roda local, grátis). Instale uma vez:
  pip install faster-whisper

Uso:
  python3 transcrever.py video.mp4 palavras.json --modelo small
  (modelos: tiny, base, small, medium, large-v3 — maior = mais preciso e mais lento)

Dica: se o vídeo veio do HeyGen com legenda (.srt), pule este passo e passe o
.srt direto para legendar.py.
"""
import argparse
import json
import sys


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("entrada")
    p.add_argument("saida")
    p.add_argument("--modelo", default="small")
    p.add_argument("--idioma", default="pt")
    p.add_argument("--glossario", default="", help="termos para ajudar o reconhecimento, ex.: 'tirzepatida, Método HERO'")
    a = p.parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster-whisper não instalado. Rode: pip install faster-whisper")

    model = WhisperModel(a.modelo, device="auto", compute_type="int8")
    segs, info = model.transcribe(a.entrada, language=a.idioma, word_timestamps=True,
                                  vad_filter=True, initial_prompt=a.glossario or None)
    palavras = []
    for s in segs:
        for w in s.words or []:
            txt = w.word.strip()
            if txt:
                palavras.append({"w": txt, "ini": round(w.start, 3), "fim": round(w.end, 3)})
    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump({"idioma": info.language, "palavras": palavras}, f, ensure_ascii=False, indent=1)
    print(f"{len(palavras)} palavras → {a.saida}")
    print("Revise nomes próprios e termos técnicos no JSON antes de legendar.")


if __name__ == "__main__":
    main()
