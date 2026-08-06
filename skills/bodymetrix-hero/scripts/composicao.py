"""
Modulo de calculo de composicao corporal a partir de espessuras de gordura
subcutanea medidas por ultrassom BodyMetrix.

Usado por calcular_composicao.py e por gerar_relatorio_bodymetrix.py.
Nao roda sozinho — importe as funcoes.

Referencias das equacoes: ver ../references/protocolos-e-calculos.md
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Sitios anatomicos: chave canonica -> (rotulo PT-BR, sinonimos aceitos)
# ---------------------------------------------------------------------------

SITIOS = {
    "peitoral":     ("Peitoral",       ["chest", "pectoral", "peito", "torax"]),
    "axilar_media": ("Axilar media",   ["midaxillary", "mid-axillary", "axilar", "axila"]),
    "triceps":      ("Triceps",        ["tricep", "triceps braquial"]),
    "subescapular": ("Subescapular",   ["subscapular", "subescapula"]),
    "abdominal":    ("Abdominal",      ["abdomen", "abdominal", "abdome"]),
    "suprailiaca":  ("Supra-iliaca",   ["suprailiac", "supra-iliac", "supra iliaca", "iliaca"]),
    "coxa":         ("Coxa",           ["thigh", "coxa anterior", "quadriceps"]),
    # Sitios extras que o BodyMetrix costuma medir. Nao entram nas equacoes
    # JP, mas sao muito uteis para acompanhar evolucao regional.
    "biceps":       ("Biceps",         ["bicep", "biceps braquial"]),
    "panturrilha":  ("Panturrilha",    ["calf", "gemeos"]),
    "lombar":       ("Lombar",         ["lower back", "lombo"]),
}

JP7 = ["peitoral", "axilar_media", "triceps", "subescapular",
       "abdominal", "suprailiaca", "coxa"]
JP3_HOMEM = ["peitoral", "abdominal", "coxa"]
JP3_MULHER = ["triceps", "suprailiaca", "coxa"]


def normalizar_sitio(nome: str) -> str | None:
    """Converte um rotulo qualquer (PT ou EN, com/sem acento) na chave canonica."""
    limpo = (nome or "").strip().lower()
    for acentuado, simples in [("á", "a"), ("â", "a"), ("ã", "a"), ("é", "e"),
                               ("ê", "e"), ("í", "i"), ("ó", "o"), ("ô", "o"),
                               ("õ", "o"), ("ú", "u"), ("ç", "c")]:
        limpo = limpo.replace(acentuado, simples)
    limpo = limpo.replace("-", " ").replace("_", " ").strip()
    for chave, (rotulo, sinonimos) in SITIOS.items():
        candidatos = [chave.replace("_", " "), rotulo.lower()] + sinonimos
        if limpo in candidatos:
            return chave
    return None


# ---------------------------------------------------------------------------
# Densidade corporal
# ---------------------------------------------------------------------------

def densidade_jp7(soma: float, idade: float, sexo: str) -> float:
    if sexo == "M":
        return 1.112 - 0.00043499 * soma + 0.00000055 * soma ** 2 - 0.00028826 * idade
    return 1.097 - 0.00046971 * soma + 0.00000056 * soma ** 2 - 0.00012828 * idade


def densidade_jp3(soma: float, idade: float, sexo: str) -> float:
    if sexo == "M":
        return 1.10938 - 0.0008267 * soma + 0.0000016 * soma ** 2 - 0.0002574 * idade
    return 1.0994921 - 0.0009929 * soma + 0.0000023 * soma ** 2 - 0.0001392 * idade


def siri(densidade: float) -> float:
    return (495.0 / densidade) - 450.0


def brozek(densidade: float) -> float:
    return (457.0 / densidade) - 414.2


# ---------------------------------------------------------------------------
# Classificacao do %GC (ACSM / Pollock & Wilmore, por sexo e faixa etaria)
# ---------------------------------------------------------------------------

# (limite_excelente, limite_bom, limite_medio, limite_acima) — acima do ultimo = "Ruim"
_TABELA = {
    "M": [(29, 11, 13, 16, 19), (39, 12, 14, 17, 21), (49, 14, 16, 19, 23),
          (59, 15, 17, 21, 24), (200, 16, 18, 21, 25)],
    "F": [(29, 16, 19, 23, 27), (39, 17, 20, 24, 28), (49, 18, 22, 26, 30),
          (59, 20, 24, 28, 32), (200, 21, 25, 29, 33)],
}

_FAIXAS_ESPECIAIS = {
    "M": [(5.0, "Abaixo da gordura essencial"), (13.0, "Atletico")],
    "F": [(12.0, "Abaixo da gordura essencial"), (20.0, "Atletico")],
}


def classificar_gordura(percentual: float, idade: float, sexo: str) -> dict:
    """Devolve categoria, faixa de referencia da idade e um status visual."""
    for limite, rotulo in _FAIXAS_ESPECIAIS[sexo]:
        if percentual < limite:
            especial = rotulo
            break
    else:
        especial = None

    linha = next(l for l in _TABELA[sexo] if idade <= l[0])
    _, exc, bom, med, acima = linha
    if percentual <= exc:
        categoria, status = "Excelente", "otimo"
    elif percentual <= bom:
        categoria, status = "Bom", "otimo"
    elif percentual <= med:
        categoria, status = "Medio", "aceitavel"
    elif percentual <= acima:
        categoria, status = "Acima da media", "atencao"
    else:
        categoria, status = "Elevado", "fora"

    if especial == "Abaixo da gordura essencial":
        categoria, status = "Abaixo da gordura essencial", "atencao"
    elif especial == "Atletico" and status == "otimo":
        categoria = "Atletico"

    return {
        "categoria": categoria,
        "status": status,
        "faixa_referencia": f"Excelente <={exc}% | Bom <={bom}% | Medio <={med}% "
                            f"| Acima da media <={acima}% | Elevado >{acima}%",
    }


def classificar_imc(imc: float) -> str:
    if imc < 18.5:
        return "Baixo peso"
    if imc < 25:
        return "Eutrofia"
    if imc < 30:
        return "Sobrepeso"
    if imc < 35:
        return "Obesidade grau I"
    if imc < 40:
        return "Obesidade grau II"
    return "Obesidade grau III"


# ---------------------------------------------------------------------------
# Calculo principal
# ---------------------------------------------------------------------------

def calcular(paciente: dict, sitios: dict, protocolo: str = "auto",
             equacao: str = "siri") -> dict:
    """
    paciente: {"sexo": "M"|"F", "idade": num, "peso_kg": num, "altura_cm": num,
               "percentual_software": num|None}
    sitios:   {"triceps": 8.4, "abdominal": 22.1, ...}  espessuras em mm
    protocolo: "auto" | "jp7" | "jp3"
    """
    sexo = (paciente.get("sexo") or "").strip().upper()[:1]
    if sexo not in ("M", "F"):
        raise ValueError("sexo deve ser 'M' ou 'F' — as equacoes JP sao sexo-especificas")
    idade = float(paciente["idade"])
    peso = float(paciente["peso_kg"])

    medidos = {normalizar_sitio(k) or k: float(v)
               for k, v in sitios.items() if v is not None}

    jp3_sitios = JP3_HOMEM if sexo == "M" else JP3_MULHER
    tem_jp7 = all(s in medidos for s in JP7)
    tem_jp3 = all(s in medidos for s in jp3_sitios)

    if protocolo == "auto":
        protocolo = "jp7" if tem_jp7 else ("jp3" if tem_jp3 else "insuficiente")

    avisos = []
    if protocolo == "jp7" and not tem_jp7:
        faltando = [SITIOS[s][0] for s in JP7 if s not in medidos]
        if tem_jp3:
            protocolo = "jp3"
            avisos.append("JP7 pedido, mas faltaram os sitios: " + ", ".join(faltando)
                          + ". Usado JP3 (fallback).")
        else:
            protocolo = "insuficiente"
    if protocolo == "jp3" and not tem_jp3:
        protocolo = "insuficiente"

    if protocolo == "insuficiente":
        faltando_jp3 = [SITIOS[s][0] for s in jp3_sitios if s not in medidos]
        raise ValueError(
            "Sitios insuficientes para calcular %GC. Para JP3 ("
            + ("homem" if sexo == "M" else "mulher") + ") faltam: "
            + ", ".join(faltando_jp3)
            + ". Peca ao usuario os valores ou confirme se deve usar o %GC do software."
        )

    usados = JP7 if protocolo == "jp7" else jp3_sitios
    soma = round(sum(medidos[s] for s in usados), 1)
    densidade = (densidade_jp7 if protocolo == "jp7" else densidade_jp3)(soma, idade, sexo)
    percentual = (siri if equacao == "siri" else brozek)(densidade)
    percentual = round(percentual, 1)

    if percentual <= 0 or percentual >= 70:
        raise ValueError(
            f"%GC calculado ({percentual}%) esta fora do plausivel. "
            "Confira se as espessuras estao em milimetros e se os sitios foram "
            "mapeados corretamente."
        )

    massa_gorda = round(peso * percentual / 100, 1)
    massa_magra = round(peso - massa_gorda, 1)

    resultado = {
        "protocolo": protocolo.upper(),
        "equacao": equacao.capitalize(),
        "sitios_usados": [SITIOS[s][0] for s in usados],
        "soma_mm": soma,
        "densidade_corporal": round(densidade, 5),
        "percentual_gordura": percentual,
        "massa_gorda_kg": massa_gorda,
        "massa_magra_kg": massa_magra,
        "avisos": avisos,
    }

    altura = paciente.get("altura_cm")
    if altura:
        imc = round(peso / (float(altura) / 100) ** 2, 1)
        resultado["imc"] = imc
        resultado["imc_classificacao"] = classificar_imc(imc)

    resultado.update(classificar_gordura(percentual, idade, sexo))

    # Confronto com o valor que o software imprimiu — divergencia grande quase
    # sempre significa protocolo/sitio diferente, nao erro de conta.
    software = paciente.get("percentual_software")
    if software is not None:
        divergencia = round(percentual - float(software), 1)
        resultado["percentual_software"] = float(software)
        resultado["divergencia_software"] = divergencia
        if abs(divergencia) > 1.5:
            resultado["avisos"].append(
                f"Divergencia de {divergencia:+.1f} p.p. em relacao ao %GC do software "
                f"({software}%). Confira o protocolo configurado no BodyView e se todos "
                f"os sitios foram lidos corretamente antes de usar o valor recalculado."
            )
    return resultado


def meta_peso(massa_magra_kg: float, percentual_alvo: float) -> float:
    """Peso corporal correspondente a um %GC alvo, mantendo a massa magra atual."""
    return round(massa_magra_kg / (1 - percentual_alvo / 100), 1)


def comparar(atual: dict, anterior: dict) -> dict:
    """Deltas entre duas avaliacoes ja calculadas."""
    def delta(campo):
        a, b = atual.get(campo), anterior.get(campo)
        if a is None or b is None:
            return None
        return round(a - b, 1)

    return {
        "delta_percentual_gordura": delta("percentual_gordura"),
        "delta_massa_gorda_kg": delta("massa_gorda_kg"),
        "delta_massa_magra_kg": delta("massa_magra_kg"),
        "delta_soma_mm": delta("soma_mm"),
    }
