#!/usr/bin/env python3
"""
Etapa de calculo: le o dados.json (paciente + espessuras), calcula a composicao
corporal de cada avaliacao, grava os resultados de volta no proprio arquivo e
imprime um resumo legivel.

Uso:
    python3 calcular_composicao.py dados.json

Rode SEMPRE antes de escrever as secoes narrativas — os numeros que aparecem no
resumo sao os que devem aparecer no texto. Nunca estime %GC de cabeca.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from composicao import calcular, comparar, meta_peso, SITIOS  # noqa: E402


def _avaliar(bloco, paciente_base, protocolo, equacao):
    paciente = dict(paciente_base)
    for campo in ("peso_kg", "altura_cm", "idade", "percentual_software"):
        if bloco.get(campo) is not None:
            paciente[campo] = bloco[campo]
    return calcular(paciente, bloco.get("sitios", {}), protocolo, equacao)


def main():
    if len(sys.argv) < 2:
        sys.exit("Uso: python3 calcular_composicao.py dados.json")

    caminho = Path(sys.argv[1])
    dados = json.loads(caminho.read_text(encoding="utf-8"))

    paciente = dados["paciente"]
    protocolo = dados.get("protocolo", "auto")
    equacao = dados.get("equacao", "siri")

    atual = dados["avaliacao_atual"]
    try:
        calc_atual = _avaliar(atual, paciente, protocolo, equacao)
    except (ValueError, KeyError) as erro:
        sys.exit(f"Nao foi possivel calcular a avaliacao atual: {erro}")
    atual["calculado"] = calc_atual

    anteriores = dados.get("avaliacoes_anteriores", [])
    for bloco in anteriores:
        try:
            bloco["calculado"] = _avaliar(bloco, paciente, protocolo, equacao)
        except ValueError as erro:
            bloco["calculado"] = {"erro": str(erro)}

    validas = [b for b in anteriores if "erro" not in b.get("calculado", {"erro": 1})]
    if validas:
        ref = validas[-1]
        atual["comparacao_com_anterior"] = comparar(calc_atual, ref["calculado"])
        atual["comparacao_com_anterior"]["data_referencia"] = ref.get("data", "anterior")
        if len(validas) > 1:
            atual["comparacao_com_primeira"] = comparar(calc_atual, validas[0]["calculado"])
            atual["comparacao_com_primeira"]["data_referencia"] = validas[0].get("data", "primeira")

    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------ resumo
    p = calc_atual
    print("=" * 62)
    print(f"  {paciente.get('nome', 'Paciente')} — {atual.get('data', 's/ data')}")
    print("=" * 62)
    print(f"  Protocolo ....... {p['protocolo']} ({', '.join(p['sitios_usados'])})")
    print(f"  Equacao ......... {p['equacao']}  |  Densidade: {p['densidade_corporal']}")
    print(f"  Somatorio ....... {p['soma_mm']} mm")
    print(f"  % Gordura ....... {p['percentual_gordura']}%  -> {p['categoria']}")
    print(f"  Massa gorda ..... {p['massa_gorda_kg']} kg")
    print(f"  Massa magra ..... {p['massa_magra_kg']} kg")
    if "imc" in p:
        print(f"  IMC ............. {p['imc']} ({p['imc_classificacao']})")
    if "percentual_software" in p:
        print(f"  Software ........ {p['percentual_software']}% "
              f"(divergencia {p['divergencia_software']:+.1f} p.p.)")
    print(f"  Referencia ...... {p['faixa_referencia']}")

    print("\n  Espessuras (mm):")
    for chave, valor in atual.get("sitios", {}).items():
        rotulo = SITIOS.get(chave, (chave.replace("_", " ").title(), []))[0]
        print(f"    {rotulo:<18} {valor} mm")

    if "comparacao_com_anterior" in atual:
        c = atual["comparacao_com_anterior"]
        print(f"\n  Evolucao vs. {c['data_referencia']}:")
        for rotulo, chave, unidade in [
            ("% Gordura", "delta_percentual_gordura", "p.p."),
            ("Massa gorda", "delta_massa_gorda_kg", "kg"),
            ("Massa magra", "delta_massa_magra_kg", "kg"),
            ("Somatorio", "delta_soma_mm", "mm"),
        ]:
            v = c.get(chave)
            if v is not None:
                print(f"    {rotulo:<14} {v:+.1f} {unidade}")

    for alvo in dados.get("metas_percentual", []):
        print(f"\n  Meta {alvo}% de gordura -> peso de "
              f"{meta_peso(p['massa_magra_kg'], alvo)} kg (mantendo a massa magra atual)")

    if p["avisos"]:
        print("\n  ATENCAO:")
        for aviso in p["avisos"]:
            print(f"    - {aviso}")

    print("\n" + "=" * 62)
    print("  Numeros gravados em", caminho)
    print("  Agora escreva as secoes narrativas usando EXATAMENTE estes valores.")
    print("=" * 62)


if __name__ == "__main__":
    main()
