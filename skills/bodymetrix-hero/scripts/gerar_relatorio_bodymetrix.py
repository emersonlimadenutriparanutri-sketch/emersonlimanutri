#!/usr/bin/env python3
"""
Gerador oficial dos PDFs da avaliacao BodyMetrix — layout da marca Emerson Lima Nutre.

Uso:
    python3 gerar_relatorio_bodymetrix.py dados.json --saida ./

Gera:
    <nome>-bodymetrix-<data>-tecnico.pdf   relatorio clinico completo
    <nome>-bodymetrix-<data>-paciente.pdf  versao em linguagem acessivel

Rode calcular_composicao.py ANTES — este script usa os valores ja calculados e
nao inventa numero nenhum. Se faltar o bloco "calculado", ele avisa e para.

Nao edite o layout para casos pontuais: o desenho (cabecalho branco com logo,
linha verde, tabelas minimalistas) foi aprovado e mantem os relatorios
reconheciveis como uma familia so.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

BASE = Path(__file__).resolve().parent.parent
BRANDING = json.loads((BASE / "assets" / "branding.json").read_text(encoding="utf-8"))
C = {k: colors.HexColor(v) for k, v in BRANDING["cores"].items()}

STATUS = {
    "otimo":     ("●", "Otimo",     "otimo"),
    "aceitavel": ("●", "Aceitavel", "verde_medio"),
    "atencao":   ("▲", "Atencao",   "atencao"),
    "fora":      ("✕", "Fora",      "fora"),
}


# --------------------------------------------------------------------------
# Fontes
# --------------------------------------------------------------------------

def registrar_fontes() -> tuple[str, str]:
    """DejaVu quando disponivel (tem os simbolos das tabelas); Helvetica se nao."""
    for caminho in BRANDING["fonte"]["caminhos"]:
        p = Path(caminho)
        if p.exists():
            negrito = p.with_name(p.stem + "-Bold" + p.suffix)
            try:
                pdfmetrics.registerFont(TTFont("Corpo", str(p)))
                pdfmetrics.registerFont(
                    TTFont("CorpoBold", str(negrito if negrito.exists() else p)))
                return "Corpo", "CorpoBold"
            except Exception:
                break
    return "Helvetica", "Helvetica-Bold"


FONTE, FONTE_BOLD = registrar_fontes()
SEM_SIMBOLOS = FONTE == "Helvetica"


def icone(status: str) -> str:
    simbolo, rotulo, _ = STATUS[status]
    return f"{rotulo}" if SEM_SIMBOLOS else f"{simbolo} {rotulo}"


# --------------------------------------------------------------------------
# Estilos
# --------------------------------------------------------------------------

def estilo(nome, tamanho=10, cor="texto", fonte=None, **kw):
    return ParagraphStyle(nome, fontName=fonte or FONTE, fontSize=tamanho,
                          leading=tamanho * 1.55, textColor=C[cor], **kw)


E = {
    "titulo_secao": estilo("titulo_secao", 12.5, "verde", FONTE_BOLD,
                           spaceBefore=14, spaceAfter=6),
    "texto": estilo("texto", 10, "texto", alignment=TA_JUSTIFY, spaceAfter=7),
    "bullet": estilo("bullet", 10, "texto", alignment=TA_JUSTIFY,
                     leftIndent=12, bulletIndent=2, spaceAfter=4),
    "destaque": estilo("destaque", 10.5, "texto", alignment=TA_JUSTIFY, spaceAfter=8),
    "celula": estilo("celula", 9, "texto"),
    "celula_bold": estilo("celula_bold", 9, "texto", FONTE_BOLD),
    "cabecalho_tabela": estilo("cabecalho_tabela", 8.5, "verde", FONTE_BOLD),
    "legenda": estilo("legenda", 8, "texto_suave", spaceAfter=6),
    "citacao": estilo("citacao", 9.5, "verde", alignment=TA_CENTER),
    "numero_gigante": estilo("numero_gigante", 40, "verde", FONTE_BOLD,
                             alignment=TA_CENTER),
    "numero_rotulo": estilo("numero_rotulo", 9.5, "texto_suave", alignment=TA_CENTER),
}


# --------------------------------------------------------------------------
# Elementos graficos
# --------------------------------------------------------------------------

class BarraClassificacao(Flowable):
    """Regua de %GC com as faixas de referencia e um marcador na posicao do paciente.

    Vale mais que um paragrafo: o paciente ve num relance onde esta e o quanto
    falta para a faixa seguinte, sem precisar decorar numero.
    """

    def __init__(self, percentual: float, faixas: list[tuple[float, str]],
                 largura=165 * mm, altura=22 * mm):
        super().__init__()
        self.percentual = percentual
        self.faixas = faixas
        self.width = largura
        self.height = altura

    def draw(self):
        c = self.canv
        maximo = max(self.faixas[-1][0], self.percentual * 1.15, 1)
        y = self.height - 12 * mm
        alt = 7 * mm
        tons = [C["verde"], C["verde_medio"], colors.HexColor("#C7CFA8"),
                C["atencao"], C["fora"]]
        inicio = 0.0
        for i, (limite, rotulo) in enumerate(self.faixas):
            x0 = self.width * inicio / maximo
            x1 = self.width * min(limite, maximo) / maximo
            c.setFillColor(tons[min(i, len(tons) - 1)])
            c.rect(x0, y, max(x1 - x0, 0), alt, stroke=0, fill=1)
            if x1 - x0 > 16 * mm:
                c.setFillColor(colors.white)
                c.setFont(FONTE, 6.5)
                c.drawCentredString((x0 + x1) / 2, y + alt / 2 - 2.2, rotulo.upper())
            inicio = limite

        x = self.width * min(self.percentual, maximo) / maximo
        c.setStrokeColor(C["texto"])
        c.setLineWidth(1.6)
        c.line(x, y - 3 * mm, x, y + alt + 3 * mm)
        c.setFillColor(C["texto"])
        c.setFont(FONTE_BOLD, 9)
        rotulo = f"{self.percentual:.1f}%"
        anchor = max(min(x, self.width - 12 * mm), 12 * mm)
        c.drawCentredString(anchor, y + alt + 5 * mm, rotulo)


def cabecalho_rodape(canv, doc, titulo: str, subtitulo: str):
    canv.saveState()
    largura, altura = A4
    topo = altura - 20 * mm

    logo = BASE / BRANDING["logo"]
    if logo.exists():
        try:
            img = ImageReader(str(logo))
            lw, lh = img.getSize()
            alt_logo = 13 * mm
            canv.drawImage(img, 20 * mm, topo - alt_logo + 3 * mm,
                           width=alt_logo * lw / lh, height=alt_logo,
                           mask="auto")
        except Exception:
            logo = None
    if not logo or not logo.exists():
        canv.setFillColor(C["verde"])
        canv.setFont(FONTE_BOLD, 12)
        canv.drawString(20 * mm, topo - 2 * mm, BRANDING["marca"].upper())
        canv.setFillColor(C["texto_suave"])
        canv.setFont(FONTE, 7.5)
        canv.drawString(20 * mm, topo - 7 * mm, BRANDING["registro"])

    canv.setFillColor(C["verde"])
    canv.setFont(FONTE_BOLD, 11)
    canv.drawRightString(largura - 20 * mm, topo - 2 * mm, titulo)
    canv.setFillColor(C["texto_suave"])
    canv.setFont(FONTE, 8)
    canv.drawRightString(largura - 20 * mm, topo - 7.5 * mm, subtitulo)

    canv.setStrokeColor(C["verde"])
    canv.setLineWidth(1.1)
    canv.line(20 * mm, topo - 12 * mm, largura - 20 * mm, topo - 12 * mm)

    canv.setStrokeColor(C["linha"])
    canv.setLineWidth(0.5)
    canv.line(20 * mm, 16 * mm, largura - 20 * mm, 16 * mm)
    canv.setFillColor(C["texto_suave"])
    canv.setFont(FONTE, 7.5)
    canv.drawString(20 * mm, 11.5 * mm,
                    f"{BRANDING['profissional']} — {BRANDING['registro']}")
    canv.drawRightString(largura - 20 * mm, 11.5 * mm, f"Pagina {doc.page}")
    canv.restoreState()


def tabela(linhas, larguras, alinhar_direita=()):
    t = Table(linhas, colWidths=larguras, repeatRows=1, hAlign="LEFT")
    estilo_tabela = [
        ("FONTNAME", (0, 0), (-1, -1), FONTE),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), C["verde"]),
        ("FONTNAME", (0, 0), (-1, 0), FONTE_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, C["verde"]),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, C["linha"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(linhas)):
        if i % 2 == 1:
            estilo_tabela.append(("BACKGROUND", (0, i), (-1, i), C["verde_claro"]))
    for col in alinhar_direita:
        estilo_tabela.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    t.setStyle(TableStyle(estilo_tabela))
    return t


def bloco(titulo: str, corpo: list) -> KeepTogether:
    """Titulo + inicio do conteudo sempre na mesma pagina.

    Sem isso, um titulo cai sozinho no rodape e o relatorio parece amador —
    foi justamente o que motivou essa trava no layout aprovado.
    """
    return KeepTogether([Paragraph(titulo, E["titulo_secao"])] + corpo)


def render_itens(itens) -> list:
    """Converte a lista de secoes narrativas em flowables."""
    saida = []
    for item in itens:
        if isinstance(item, str):
            tipo, conteudo = "texto", item
        else:
            tipo, conteudo = item[0], item[1]
        if tipo == "bullet":
            saida.append(Paragraph(conteudo, E["bullet"], bulletText="•"))
        elif tipo == "destaque":
            saida.append(Paragraph(f"<b>{conteudo}</b>", E["destaque"]))
        else:
            saida.append(Paragraph(conteudo, E["texto"]))
    return saida


# --------------------------------------------------------------------------
# Conteudo dos relatorios
# --------------------------------------------------------------------------

def _seta(valor: float, menor_e_melhor=True) -> str:
    """Variacao com direcao visivel. O sinal ja diz se subiu ou desceu; a seta
    existe para que o Emerson leia a coluna inteira de relance."""
    if valor is None:
        return "—"
    if abs(valor) < 0.05:
        return "estavel"
    marca = "▼" if valor < 0 else "▲"
    if SEM_SIMBOLOS:
        marca = "-" if valor < 0 else "+"
    return f"{marca} {valor:+.1f}"


def faixas_do_paciente(calc: dict) -> list[tuple[float, str]]:
    """Extrai os limites da string de referencia para desenhar a regua."""
    numeros = [float(n) for n in re.findall(r"(\d+(?:\.\d+)?)%", calc["faixa_referencia"])]
    rotulos = ["Excelente", "Bom", "Medio", "Acima da media", "Elevado"]
    if len(numeros) < 4:
        return [(15, "Baixo"), (25, "Medio"), (35, "Alto"), (45, "Elevado")]
    faixas = list(zip(numeros[:4], rotulos[:4]))
    faixas.append((max(numeros[3] + 12, calc["percentual_gordura"] + 4), rotulos[4]))
    return faixas


def conteudo_tecnico(dados: dict) -> list:
    paciente = dados["paciente"]
    atual = dados["avaliacao_atual"]
    calc = atual["calculado"]
    rel = dados.get("relatorio_tecnico", {})
    story: list = []

    # Identificacao
    ident = [
        ["PACIENTE", "IDADE", "SEXO", "PESO", "ALTURA", "DATA"],
        [paciente.get("nome", "—"),
         f"{paciente.get('idade', '—')} anos",
         "Feminino" if str(paciente.get("sexo", "")).upper().startswith("F") else "Masculino",
         f"{atual.get('peso_kg', paciente.get('peso_kg', '—'))} kg",
         f"{paciente.get('altura_cm', '—')} cm",
         atual.get("data", "—")],
    ]
    story.append(tabela(ident, [50 * mm, 20 * mm, 24 * mm, 22 * mm, 22 * mm, 26 * mm]))
    story.append(Spacer(1, 6 * mm))

    if rel.get("resumo"):
        story.append(bloco("RESUMO DA AVALIACAO", render_itens([rel["resumo"]])))

    # Composicao corporal
    comp = [["INDICADOR", "RESULTADO", "LEITURA"],
            ["Percentual de gordura", f"{calc['percentual_gordura']}%",
             f"{calc['categoria']} — {icone(calc['status'])}"],
            ["Massa gorda", f"{calc['massa_gorda_kg']} kg", ""],
            ["Massa magra", f"{calc['massa_magra_kg']} kg", ""],
            ["Somatorio das espessuras", f"{calc['soma_mm']} mm",
             f"{calc['protocolo']} — {len(calc['sitios_usados'])} pontos"],
            ["Densidade corporal", f"{calc['densidade_corporal']}",
             f"Equacao de {calc['equacao']}"]]
    if "imc" in calc:
        comp.insert(4, ["IMC", f"{calc['imc']} kg/m2", calc["imc_classificacao"]])
    if "percentual_software" in calc:
        comp.append(["% do software BodyMetrix", f"{calc['percentual_software']}%",
                     f"divergencia {calc['divergencia_software']:+.1f} p.p."])

    corpo = [tabela(comp, [58 * mm, 38 * mm, 68 * mm], alinhar_direita=(1,)),
             Spacer(1, 4 * mm),
             BarraClassificacao(calc["percentual_gordura"], faixas_do_paciente(calc)),
             Paragraph("Referencia: " + calc["faixa_referencia"] +
                       f" (ACSM, {'homens' if str(paciente.get('sexo','')).upper().startswith('M') else 'mulheres'}, "
                       f"{paciente.get('idade','—')} anos).", E["legenda"])]
    story.append(bloco("COMPOSICAO CORPORAL", corpo))

    # Espessuras ponto a ponto
    if dados.get("incluir_tabela_sitios", True) and atual.get("sitios"):
        from composicao import SITIOS
        anteriores = [b for b in dados.get("avaliacoes_anteriores", []) if b.get("sitios")]
        ref = anteriores[-1] if anteriores else None
        cab = ["PONTO ANATOMICO", "ATUAL (mm)"]
        if ref:
            cab += [f"{ref.get('data', 'ANTERIOR')} (mm)", "VARIACAO"]
        linhas = [cab]
        for chave, valor in atual["sitios"].items():
            rotulo = SITIOS.get(chave, (chave.replace("_", " ").title(), []))[0]
            linha = [rotulo, f"{valor}"]
            if ref:
                antes = ref["sitios"].get(chave)
                if antes is None:
                    linha += ["—", "—"]
                else:
                    linha += [f"{antes}", _seta(round(valor - antes, 1))]
            linhas.append(linha)
        larguras = [58 * mm, 30 * mm] + ([38 * mm, 38 * mm] if ref else [])
        story.append(bloco("ESPESSURA DE GORDURA SUBCUTANEA POR PONTO", [
            tabela(linhas, larguras, alinhar_direita=tuple(range(1, len(cab)))),
            Paragraph("Valores de espessura de gordura subcutanea medidos por ultrassom "
                      "A-mode (BodyMetrix). Nao equivalem a dobra cutanea de adipometro.",
                      E["legenda"])]))

    # Evolucao
    comparacao = atual.get("comparacao_com_anterior")
    if comparacao:
        linhas = [["INDICADOR", f"EM {comparacao['data_referencia']}", "ATUAL", "VARIACAO"]]
        ref_calc = [b for b in dados.get("avaliacoes_anteriores", [])
                    if b.get("data") == comparacao["data_referencia"]]
        ref_calc = ref_calc[0]["calculado"] if ref_calc else {}
        for rotulo, chave, delta_chave, unidade in [
            ("Percentual de gordura", "percentual_gordura", "delta_percentual_gordura", "%"),
            ("Massa gorda", "massa_gorda_kg", "delta_massa_gorda_kg", " kg"),
            ("Massa magra", "massa_magra_kg", "delta_massa_magra_kg", " kg"),
            ("Somatorio das espessuras", "soma_mm", "delta_soma_mm", " mm"),
        ]:
            menor_melhor = chave != "massa_magra_kg"
            linhas.append([rotulo,
                           f"{ref_calc.get(chave, '—')}{unidade}",
                           f"{calc.get(chave)}{unidade}",
                           _seta(comparacao.get(delta_chave), menor_melhor)])
        corpo = [tabela(linhas, [55 * mm, 35 * mm, 35 * mm, 35 * mm],
                        alinhar_direita=(1, 2, 3))]
        if rel.get("leitura_evolucao"):
            corpo += render_itens([rel["leitura_evolucao"]])
        story.append(bloco("EVOLUCAO", corpo))

    # Secoes narrativas livres
    for secao in rel.get("secoes", []):
        story.append(bloco(secao["titulo"].upper(), render_itens(secao["itens"])))

    # Metas
    if dados.get("metas_percentual"):
        from composicao import meta_peso
        linhas = [["% DE GORDURA ALVO", "PESO CORRESPONDENTE", "GORDURA A REDUZIR"]]
        for alvo in dados["metas_percentual"]:
            peso_alvo = meta_peso(calc["massa_magra_kg"], alvo)
            linhas.append([f"{alvo}%", f"{peso_alvo} kg",
                           f"{round(atual.get('peso_kg', 0) - peso_alvo, 1)} kg"])
        story.append(bloco("PROJECAO DE METAS", [
            tabela(linhas, [45 * mm, 55 * mm, 55 * mm], alinhar_direita=(1, 2)),
            Paragraph("Projecao feita mantendo a massa magra atual constante — o objetivo "
                      "e preservar massa magra enquanto a gordura reduz.", E["legenda"])]))

    if calc.get("avisos"):
        story.append(bloco("NOTAS TECNICAS",
                           render_itens([("bullet", a) for a in calc["avisos"]])))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(dados.get("citacao", BRANDING["citacao_final"]), E["citacao"]))
    return story


def conteudo_paciente(dados: dict) -> list:
    paciente = dados["paciente"]
    atual = dados["avaliacao_atual"]
    calc = atual["calculado"]
    rel = dados.get("relatorio_paciente", {})
    story: list = []

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(f"{calc['percentual_gordura']}%", E["numero_gigante"]))
    story.append(Paragraph("do seu peso hoje e gordura corporal", E["numero_rotulo"]))
    story.append(Spacer(1, 6 * mm))
    story.append(BarraClassificacao(calc["percentual_gordura"], faixas_do_paciente(calc)))
    story.append(Spacer(1, 4 * mm))

    resumo = [["Seu peso", f"{atual.get('peso_kg', paciente.get('peso_kg', '—'))} kg"],
              ["Gordura corporal", f"{calc['massa_gorda_kg']} kg"],
              ["Massa magra (musculo, osso, agua)", f"{calc['massa_magra_kg']} kg"],
              ["Como esta hoje", calc["categoria"]]]
    story.append(tabela([["O QUE FOI MEDIDO", "RESULTADO"]] + resumo,
                        [95 * mm, 60 * mm], alinhar_direita=(1,)))
    story.append(Spacer(1, 4 * mm))

    if rel.get("abertura"):
        story.append(bloco("O QUE ESSA AVALIACAO MOSTRA", render_itens([rel["abertura"]])))

    comparacao = atual.get("comparacao_com_anterior")
    if comparacao and rel.get("evolucao"):
        story.append(bloco("O QUE MUDOU DESDE A ULTIMA VEZ", render_itens([rel["evolucao"]])))

    for secao in rel.get("secoes", []):
        story.append(bloco(secao["titulo"].upper(), render_itens(secao["itens"])))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(dados.get("citacao", BRANDING["citacao_final"]), E["citacao"]))
    return story


# --------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------

def montar(caminho: Path, story: list, titulo: str, subtitulo: str):
    doc = BaseDocTemplate(str(caminho), pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=36 * mm, bottomMargin=22 * mm,
                          title=titulo, author=BRANDING["profissional"])
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="corpo")
    doc.addPageTemplates([PageTemplate(
        id="padrao", frames=[frame],
        onPage=lambda c, d: cabecalho_rodape(c, d, titulo, subtitulo))])
    doc.build(story)


def slug(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "paciente")
    texto = texto.encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-") or "paciente"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dados")
    ap.add_argument("--saida", default=".")
    ap.add_argument("--apenas", choices=["tecnico", "paciente"],
                    help="gera so um dos dois PDFs")
    args = ap.parse_args()

    dados = json.loads(Path(args.dados).read_text(encoding="utf-8"))
    if "calculado" not in dados.get("avaliacao_atual", {}):
        sys.exit("Faltou rodar calcular_composicao.py neste dados.json — "
                 "o gerador nao calcula %GC, ele so apresenta o que ja foi calculado.")

    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    nome = slug(dados["paciente"].get("nome", "paciente"))
    data = slug(dados["avaliacao_atual"].get("data", ""))
    base = f"{nome}-bodymetrix{'-' + data if data else ''}"
    gerados = []

    if args.apenas != "paciente":
        caminho = saida / f"{base}-tecnico.pdf"
        montar(caminho, conteudo_tecnico(dados), "AVALIACAO BODYMETRIX",
               f"{dados['paciente'].get('nome', '')} — {dados['avaliacao_atual'].get('data', '')}")
        gerados.append(caminho)

    if args.apenas != "tecnico" and dados.get("relatorio_paciente"):
        caminho = saida / f"{base}-paciente.pdf"
        montar(caminho, conteudo_paciente(dados), "SUA AVALIACAO CORPORAL",
               f"{dados['paciente'].get('nome', '')} — {dados['avaliacao_atual'].get('data', '')}")
        gerados.append(caminho)

    for g in gerados:
        print("Gerado:", g)


if __name__ == "__main__":
    main()
