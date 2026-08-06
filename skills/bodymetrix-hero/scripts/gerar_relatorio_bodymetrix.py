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
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

BASE = Path(__file__).resolve().parent.parent
BRANDING = json.loads((BASE / "assets" / "branding.json").read_text(encoding="utf-8"))
C = {k: colors.HexColor(v) for k, v in BRANDING["cores"].items()}

STATUS = {
    "otimo":     ("●", "Ótimo",     "otimo"),
    "aceitavel": ("●", "Aceitável", "verde_medio"),
    "atencao":   ("▲", "Atenção",   "atencao"),
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


def num(valor, casas=1, sufixo="") -> str:
    """Numero no padrao brasileiro — virgula decimal.

    Relatorio clinico em portugues com ponto decimal parece exportacao de
    planilha, nao documento do consultorio.
    """
    if valor is None or valor == "":
        return "—"
    try:
        return f"{float(valor):.{casas}f}".replace(".", ",") + sufixo
    except (TypeError, ValueError):
        return f"{valor}{sufixo}"


# --------------------------------------------------------------------------
# Estilos
# --------------------------------------------------------------------------

def estilo(nome, tamanho=10, cor="texto", fonte=None, **kw):
    return ParagraphStyle(nome, fontName=fonte or FONTE, fontSize=tamanho,
                          leading=tamanho * 1.55, textColor=C[cor], **kw)


E = {
    # keepWithNext impede titulo orfao no rodape sem congelar a secao inteira
    # num bloco indivisivel — tabela longa continua podendo quebrar de pagina.
    "titulo_secao": estilo("titulo_secao", 12.5, "verde", FONTE_BOLD,
                           spaceBefore=11, spaceAfter=5, keepWithNext=1),
    "texto": estilo("texto", 10, "texto", alignment=TA_JUSTIFY, spaceAfter=7),
    "bullet": estilo("bullet", 10, "texto", alignment=TA_JUSTIFY,
                     leftIndent=12, bulletIndent=2, spaceAfter=4),
    "destaque": estilo("destaque", 10.5, "texto", alignment=TA_JUSTIFY, spaceAfter=8),
    "celula": estilo("celula", 9, "texto"),
    "celula_bold": estilo("celula_bold", 9, "texto", FONTE_BOLD),
    "cabecalho_tabela": estilo("cabecalho_tabela", 8.5, "verde", FONTE_BOLD),
    "legenda": estilo("legenda", 8, "texto_suave", spaceAfter=4, spaceBefore=2),
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
    falta para a faixa seguinte, sem precisar decorar numero. Os limites vao como
    numeros embaixo da barra, e nao como texto dentro das faixas — faixa estreita
    cortava o rotulo no meio.
    """

    def __init__(self, percentual: float, faixas: list[tuple[float, str]],
                 categoria: str = "", largura=165 * mm, altura=26 * mm):
        super().__init__()
        self.percentual = percentual
        self.faixas = faixas
        self.categoria = categoria
        self.width = largura
        self.height = altura

    def draw(self):
        c = self.canv
        maximo = max(self.faixas[-1][0], self.percentual * 1.1, 1)
        y = self.height - 15 * mm
        alt = 7 * mm
        tons = [C["verde"], C["verde_medio"], colors.HexColor("#C7CFA8"),
                C["atencao"], C["fora"]]

        inicio = 0.0
        for i, (limite, _) in enumerate(self.faixas):
            x0 = self.width * inicio / maximo
            x1 = self.width * min(limite, maximo) / maximo
            c.setFillColor(tons[min(i, len(tons) - 1)])
            c.rect(x0, y, max(x1 - x0, 0), alt, stroke=0, fill=1)
            inicio = limite

        # Limites numericos abaixo da barra
        c.setFont(FONTE, 6.5)
        c.setFillColor(C["texto_suave"])
        for limite, _ in self.faixas[:-1]:
            x = self.width * limite / maximo
            c.setStrokeColor(colors.white)
            c.setLineWidth(0.7)
            c.line(x, y, x, y + alt)
            c.setFillColor(C["texto_suave"])
            c.drawCentredString(x, y - 4 * mm, num(limite, 0, "%"))

        # Marcador do paciente
        x = self.width * min(self.percentual, maximo) / maximo
        c.setStrokeColor(C["texto"])
        c.setLineWidth(1.6)
        c.line(x, y - 1.5 * mm, x, y + alt + 3 * mm)
        etiqueta = num(self.percentual, 1, "%")
        if self.categoria:
            etiqueta += f" — {self.categoria}"
        c.setFont(FONTE_BOLD, 9)
        largura_texto = pdfmetrics.stringWidth(etiqueta, FONTE_BOLD, 9)
        ancora = min(max(x, largura_texto / 2), self.width - largura_texto / 2)
        c.setFillColor(C["texto"])
        c.drawCentredString(ancora, y + alt + 5.5 * mm, etiqueta)


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
    canv.line(20 * mm, 14 * mm, largura - 20 * mm, 14 * mm)
    canv.setFillColor(C["texto_suave"])
    canv.setFont(FONTE, 7.5)
    canv.drawString(20 * mm, 9.5 * mm,
                    f"{BRANDING['profissional']} — {BRANDING['registro']}")
    canv.restoreState()


class CanvasNumerado(canvas.Canvas):
    """Numera as paginas com o total e imprime a citacao no rodape da ultima.

    Precisa de duas passagens porque o total de paginas so e conhecido no fim.
    Antes a citacao entrava como flowable no fim do texto e, quando nao cabia,
    ganhava uma pagina inteira so para ela — pagina em branco com uma frase.
    """

    def __init__(self, *args, citacao="", **kwargs):
        super().__init__(*args, **kwargs)
        self._citacao = citacao
        self._paginas = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for indice, estado in enumerate(self._paginas, start=1):
            self.__dict__.update(estado)
            largura = A4[0]
            self.setFillColor(C["texto_suave"])
            self.setFont(FONTE, 7.5)
            self.drawRightString(largura - 20 * mm, 9.5 * mm,
                                 f"Página {indice} de {total}")
            if indice == total and self._citacao:
                self.setFillColor(C["verde"])
                self.setFont(FONTE, 9)
                self.drawCentredString(largura / 2, 18 * mm, self._citacao)
            super().showPage()
        super().save()


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
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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


def bloco(titulo: str, corpo: list, agrupar=False) -> list:
    """Titulo + conteudo de uma secao.

    O titulo usa keepWithNext, entao nunca cai sozinho no rodape — era o que
    motivava o KeepTogether no layout original. A diferenca e que aqui o
    conteudo continua podendo quebrar entre paginas: travar a secao inteira
    empurrava tabelas grandes para a pagina seguinte e deixava meia pagina em
    branco. Use agrupar=True so para conjuntos curtos que perdem sentido
    separados (tabela + grafico + legenda da mesma leitura).
    """
    corpo = [KeepTogether(corpo)] if agrupar else corpo
    return [Paragraph(titulo, E["titulo_secao"])] + corpo


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
        return "estável"
    marca = "▼" if valor < 0 else "▲"
    if SEM_SIMBOLOS:
        marca = "-" if valor < 0 else "+"
    return f"{marca} {num(valor)}" if valor < 0 else f"{marca} +{num(valor)}"


def faixas_do_paciente(calc: dict) -> list[tuple[float, str]]:
    """Extrai os limites da string de referencia para desenhar a regua."""
    numeros = [float(n) for n in re.findall(r"(\d+(?:\.\d+)?)%", calc["faixa_referencia"])]
    rotulos = ["Excelente", "Bom", "Médio", "Acima da média", "Elevado"]
    if len(numeros) < 4:
        return [(15, "Baixo"), (25, "Médio"), (35, "Alto"), (45, "Elevado")]
    faixas = list(zip(numeros[:4], rotulos[:4]))
    faixas.append((max(numeros[3] + 12, calc["percentual_gordura"] + 4), rotulos[4]))
    return faixas


def conteudo_tecnico(dados: dict) -> list:
    paciente = dados["paciente"]
    atual = dados["avaliacao_atual"]
    calc = atual["calculado"]
    rel = dados.get("relatorio_tecnico", {})
    story: list = []

    peso_atual = atual.get("peso_kg", paciente.get("peso_kg"))
    feminino = str(paciente.get("sexo", "")).upper().startswith("F")

    # Identificacao
    ident = [
        ["PACIENTE", "IDADE", "SEXO", "PESO", "ALTURA", "DATA"],
        [paciente.get("nome", "—"),
         f"{paciente.get('idade', '—')} anos",
         "Feminino" if feminino else "Masculino",
         num(peso_atual, 1, " kg"),
         num(paciente.get("altura_cm"), 0, " cm"),
         atual.get("data", "—")],
    ]
    story.append(tabela(ident, [50 * mm, 20 * mm, 24 * mm, 22 * mm, 22 * mm, 26 * mm]))
    story.append(Spacer(1, 6 * mm))

    if rel.get("resumo"):
        story += bloco("RESUMO DA AVALIAÇÃO", render_itens([rel["resumo"]]))

    # Composicao corporal
    comp = [["INDICADOR", "RESULTADO", "LEITURA"],
            ["Percentual de gordura", num(calc["percentual_gordura"], 1, "%"),
             f"{calc['categoria']} — {icone(calc['status'])}"],
            ["Massa gorda", num(calc["massa_gorda_kg"], 1, " kg"), ""],
            ["Massa magra", num(calc["massa_magra_kg"], 1, " kg"), ""],
            ["Somatório das espessuras", num(calc["soma_mm"], 1, " mm"),
             f"{calc['protocolo']} — {len(calc['sitios_usados'])} pontos"],
            ["Densidade corporal", num(calc["densidade_corporal"], 4),
             f"Equação de {calc['equacao']}"]]
    if "imc" in calc:
        comp.insert(4, ["IMC", num(calc["imc"], 1, " kg/m²"), calc["imc_classificacao"]])
    if "percentual_software" in calc:
        comp.append(["% do software BodyMetrix", num(calc["percentual_software"], 1, "%"),
                     f"divergência de {num(abs(calc['divergencia_software']))} p.p. "
                     f"{'para menos' if calc['divergencia_software'] < 0 else 'para mais'}"])

    corpo = [tabela(comp, [58 * mm, 38 * mm, 68 * mm], alinhar_direita=(1,)),
             Spacer(1, 4 * mm),
             BarraClassificacao(calc["percentual_gordura"], faixas_do_paciente(calc),
                                calc["categoria"]),
             Paragraph("Referência: " + calc["faixa_referencia"].replace("<=", "≤")
                       + f" (ACSM, {'mulheres' if feminino else 'homens'}, "
                       f"{paciente.get('idade', '—')} anos).", E["legenda"])]
    story += bloco("COMPOSIÇÃO CORPORAL", corpo, agrupar=True)

    # Espessuras ponto a ponto
    if dados.get("incluir_tabela_sitios", True) and atual.get("sitios"):
        from composicao import SITIOS_ACENTUADOS as ROTULOS
        anteriores = [b for b in dados.get("avaliacoes_anteriores", []) if b.get("sitios")]
        ref = anteriores[-1] if anteriores else None
        cab = ["PONTO ANATÔMICO", "ATUAL (mm)"]
        if ref:
            cab += [f"{ref.get('data', 'ANTERIOR')} (mm)", "VARIAÇÃO"]
        linhas = [cab]
        for chave, valor in atual["sitios"].items():
            linha = [ROTULOS.get(chave, chave.replace("_", " ").title()), num(valor)]
            if ref:
                antes = ref["sitios"].get(chave)
                linha += ["—", "—"] if antes is None else [
                    num(antes), _seta(round(valor - antes, 1))]
            linhas.append(linha)
        larguras = [58 * mm, 30 * mm] + ([38 * mm, 38 * mm] if ref else [])
        # A nota vem antes da tabela: como esta tabela pode quebrar de pagina,
        # uma legenda depois dela acabava orfa no topo da pagina seguinte.
        story += bloco("ESPESSURA DE GORDURA SUBCUTÂNEA POR PONTO", [
            Paragraph("Espessura de gordura subcutânea medida por ultrassom A-mode "
                      "(BodyMetrix). Não equivale à dobra cutânea de adipômetro, que é "
                      "uma prega dupla.", E["legenda"]),
            tabela(linhas, larguras, alinhar_direita=tuple(range(1, len(cab))))])

    # Evolucao
    comparacao = atual.get("comparacao_com_anterior")
    if comparacao:
        linhas = [["INDICADOR", f"EM {comparacao['data_referencia']}", "ATUAL", "VARIAÇÃO"]]
        ref_calc = [b for b in dados.get("avaliacoes_anteriores", [])
                    if b.get("data") == comparacao["data_referencia"]]
        ref_calc = ref_calc[0]["calculado"] if ref_calc else {}
        for rotulo, chave, delta_chave, unidade in [
            ("Percentual de gordura", "percentual_gordura", "delta_percentual_gordura", "%"),
            ("Massa gorda", "massa_gorda_kg", "delta_massa_gorda_kg", " kg"),
            ("Massa magra", "massa_magra_kg", "delta_massa_magra_kg", " kg"),
            ("Somatório das espessuras", "soma_mm", "delta_soma_mm", " mm"),
        ]:
            linhas.append([rotulo,
                           num(ref_calc.get(chave), 1, unidade),
                           num(calc.get(chave), 1, unidade),
                           _seta(comparacao.get(delta_chave))])
        corpo = [tabela(linhas, [55 * mm, 35 * mm, 35 * mm, 35 * mm],
                        alinhar_direita=(1, 2, 3))]
        if rel.get("leitura_evolucao"):
            corpo += render_itens([rel["leitura_evolucao"]])
        story += bloco("EVOLUÇÃO", corpo)

    # Secoes narrativas livres
    for secao in rel.get("secoes", []):
        story += bloco(secao["titulo"].upper(), render_itens(secao["itens"]))

    # Metas
    if dados.get("metas_percentual"):
        from composicao import meta_peso
        linhas = [["% DE GORDURA ALVO", "PESO CORRESPONDENTE", "GORDURA A REDUZIR"]]
        for alvo in dados["metas_percentual"]:
            peso_alvo = meta_peso(calc["massa_magra_kg"], alvo)
            a_reduzir = round((peso_atual or 0) - peso_alvo, 1)
            linhas.append([num(alvo, 0, "%"), num(peso_alvo, 1, " kg"),
                           num(a_reduzir, 1, " kg") if a_reduzir > 0.05 else "meta já atingida"])
        story += bloco("PROJEÇÃO DE METAS", [
            tabela(linhas, [45 * mm, 55 * mm, 55 * mm], alinhar_direita=(1, 2)),
            Paragraph("Projeção feita mantendo a massa magra atual constante — o objetivo "
                      "é preservar massa magra enquanto a gordura reduz.", E["legenda"])],
            agrupar=True)

    if calc.get("avisos"):
        story += bloco("NOTAS TÉCNICAS",
                       render_itens([("bullet", a) for a in calc["avisos"]]))

    return story


def conteudo_paciente(dados: dict) -> list:
    paciente = dados["paciente"]
    atual = dados["avaliacao_atual"]
    calc = atual["calculado"]
    rel = dados.get("relatorio_paciente", {})
    story: list = []

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(num(calc["percentual_gordura"], 1, "%"), E["numero_gigante"]))
    story.append(Paragraph("do seu peso hoje é gordura corporal", E["numero_rotulo"]))
    story.append(Spacer(1, 6 * mm))
    story.append(BarraClassificacao(calc["percentual_gordura"], faixas_do_paciente(calc),
                                    calc["categoria"]))
    story.append(Spacer(1, 4 * mm))

    resumo = [["Seu peso", num(atual.get("peso_kg", paciente.get("peso_kg")), 1, " kg")],
              ["Gordura corporal", num(calc["massa_gorda_kg"], 1, " kg")],
              ["Massa magra (músculo, osso, água)", num(calc["massa_magra_kg"], 1, " kg")],
              ["Como está hoje", calc["categoria"]]]
    story.append(tabela([["O QUE FOI MEDIDO", "RESULTADO"]] + resumo,
                        [95 * mm, 60 * mm], alinhar_direita=(1,)))
    story.append(Spacer(1, 4 * mm))

    if rel.get("abertura"):
        story += bloco("O QUE ESSA AVALIAÇÃO MOSTRA", render_itens([rel["abertura"]]))

    comparacao = atual.get("comparacao_com_anterior")
    if comparacao and rel.get("evolucao"):
        story += bloco("O QUE MUDOU DESDE A ÚLTIMA VEZ", render_itens([rel["evolucao"]]))

    for secao in rel.get("secoes", []):
        story += bloco(secao["titulo"].upper(), render_itens(secao["itens"]))

    return story


# --------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------

def montar(caminho: Path, story: list, titulo: str, subtitulo: str, citacao: str):
    doc = BaseDocTemplate(str(caminho), pagesize=A4,
                          leftMargin=20 * mm, rightMargin=20 * mm,
                          topMargin=36 * mm, bottomMargin=22 * mm,
                          title=titulo, author=BRANDING["profissional"])
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="corpo")
    doc.addPageTemplates([PageTemplate(
        id="padrao", frames=[frame],
        onPage=lambda c, d: cabecalho_rodape(c, d, titulo, subtitulo))])
    doc.build(story, canvasmaker=lambda *a, **kw: CanvasNumerado(*a, citacao=citacao, **kw))


def slug(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "paciente")
    texto = texto.encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-") or "paciente"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dados")
    ap.add_argument("--saida", default=".")
    ap.add_argument("--apenas", choices=["tecnico", "paciente"],
                    help="gera só um dos dois PDFs")
    args = ap.parse_args()

    dados = json.loads(Path(args.dados).read_text(encoding="utf-8"))
    if "calculado" not in dados.get("avaliacao_atual", {}):
        sys.exit("Faltou rodar calcular_composicao.py neste dados.json — "
                 "o gerador não calcula %GC, ele só apresenta o que já foi calculado.")

    citacao = dados.get("citacao", BRANDING["citacao_final"])
    saida = Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    nome = slug(dados["paciente"].get("nome", "paciente"))
    data = slug(dados["avaliacao_atual"].get("data", ""))
    base = f"{nome}-bodymetrix{'-' + data if data else ''}"
    gerados = []

    if args.apenas != "paciente":
        caminho = saida / f"{base}-tecnico.pdf"
        montar(caminho, conteudo_tecnico(dados), "AVALIAÇÃO BODYMETRIX",
               f"{dados['paciente'].get('nome', '')} — {dados['avaliacao_atual'].get('data', '')}",
               citacao)
        gerados.append(caminho)

    if args.apenas != "tecnico" and dados.get("relatorio_paciente"):
        caminho = saida / f"{base}-paciente.pdf"
        montar(caminho, conteudo_paciente(dados), "SUA AVALIAÇÃO CORPORAL",
               f"{dados['paciente'].get('nome', '')} — {dados['avaliacao_atual'].get('data', '')}",
               citacao)
        gerados.append(caminho)

    for g in gerados:
        print("Gerado:", g)


if __name__ == "__main__":
    main()
