import jsPDF from "jspdf";

/**
 * Exporta um relatório clínico em PDF, com cabeçalho da marca.
 * Trabalha com texto puro (os relatórios são texto) para gerar
 * arquivo leve e selecionável, em vez de imagem.
 */
export function exportarRelatorioPDF(opcoes: {
  titulo: string;
  subtitulo?: string;
  conteudo: string;
  rodape?: string;
  arquivo?: string;
}) {
  const { titulo, subtitulo, conteudo, rodape, arquivo } = opcoes;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 48;
  const util = largura - margem * 2;

  // Faixa do cabeçalho
  doc.setFillColor(7, 23, 57);
  doc.rect(0, 0, largura, 96, "F");
  doc.setTextColor(166, 135, 104);
  doc.setFontSize(8);
  doc.text("RELATÓRIO CLÍNICO", margem, 40);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(titulo, util), margem, 62);
  if (subtitulo) {
    doc.setFontSize(9);
    doc.setTextColor(220, 225, 235);
    doc.text(subtitulo, margem, 82);
  }

  let y = 132;
  doc.setTextColor(20, 25, 35);
  doc.setFontSize(10.5);

  for (const paragrafo of conteudo.split("\n")) {
    const limpo = paragrafo.replace(/[*#]/g, "").trimEnd();
    if (!limpo.trim()) {
      y += 8;
      continue;
    }
    const linhas = doc.splitTextToSize(limpo, util);
    for (const linha of linhas) {
      if (y > altura - 64) {
        doc.addPage();
        y = margem + 12;
      }
      doc.text(linha, margem, y);
      y += 15;
    }
    y += 4;
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 160);
    doc.text(rodape ?? "", margem, altura - 28);
    doc.text(`${p}/${total}`, largura - margem, altura - 28, { align: "right" });
  }

  doc.save(arquivo ?? `${titulo.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

/** Exporta um elemento da tela (usado no mapa mental). */
export async function exportarElemento(el: HTMLElement, nome: string, formato: "png" | "pdf") {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: "#FAFAFA", scale: 2, useCORS: true });

  if (formato === "png") {
    const link = document.createElement("a");
    link.download = `${nome}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return;
  }

  const img = canvas.toDataURL("image/png");
  const paisagem = canvas.width >= canvas.height;
  const doc = new jsPDF({ orientation: paisagem ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const lp = doc.internal.pageSize.getWidth();
  const ap = doc.internal.pageSize.getHeight();
  const escala = Math.min((lp - 40) / canvas.width, (ap - 40) / canvas.height);
  doc.addImage(img, "PNG", 20, 20, canvas.width * escala, canvas.height * escala);
  doc.save(`${nome}.pdf`);
}
