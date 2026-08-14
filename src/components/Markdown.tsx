import { Fragment, type ReactNode } from 'react'

/**
 * Renderizador enxuto do Markdown que o app do nutricionista grava nos
 * relatórios: títulos, parágrafos, listas, tabelas, negrito e itálico.
 * Não é um parser completo — é só o suficiente para exibir bem o conteúdo
 * sem trazer uma biblioteca inteira para dentro do bundle.
 */

function inline(texto: string): ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return <strong key={i} className="font-semibold text-marca-900">{parte.slice(2, -2)}</strong>
    }
    if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
      return <em key={i}>{parte.slice(1, -1)}</em>
    }
    if (parte.startsWith('`') && parte.endsWith('`') && parte.length > 2) {
      return (
        <code key={i} className="rounded bg-marca-50 px-1 py-0.5 text-[0.9em]">
          {parte.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={i}>{parte}</Fragment>
  })
}

function celulas(linha: string): string[] {
  return linha.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

const SEPARADOR_TABELA = /^\|?[\s:-]+\|[\s|:-]*$/

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n')
  const blocos: ReactNode[] = []

  let i = 0
  let chave = 0

  while (i < linhas.length) {
    const linha = linhas[i]

    // Linha em branco
    if (!linha.trim()) {
      i++
      continue
    }

    // Tabela: cabeçalho + separador + corpo
    if (linha.trim().startsWith('|') && SEPARADOR_TABELA.test(linhas[i + 1] ?? '')) {
      const cabecalho = celulas(linha)
      const corpo: string[][] = []
      i += 2
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        corpo.push(celulas(linhas[i]))
        i++
      }
      blocos.push(
        <div key={chave++} className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-marca-200">
                {cabecalho.map((c, j) => (
                  <th key={j} className="px-2 py-2 text-left font-semibold text-marca-800">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((linhaCorpo, j) => (
                <tr key={j} className="border-b border-marca-100 last:border-0">
                  {linhaCorpo.map((c, k) => (
                    <td key={k} className="px-2 py-2 text-marca-700">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Títulos
    const titulo = /^(#{1,4})\s+(.*)$/.exec(linha)
    if (titulo) {
      const nivel = titulo[1].length
      const conteudo = inline(titulo[2])
      const estilos = [
        'text-xl font-semibold text-marca-900 mt-4 first:mt-0',
        'text-lg font-semibold text-marca-900 mt-4 first:mt-0',
        'text-base font-semibold text-marca-800 mt-3 first:mt-0',
        'text-sm font-semibold uppercase tracking-wide text-marca-500 mt-3 first:mt-0',
      ]
      const classe = estilos[nivel - 1]
      blocos.push(
        nivel === 1 ? <h2 key={chave++} className={classe}>{conteudo}</h2>
        : nivel === 2 ? <h3 key={chave++} className={classe}>{conteudo}</h3>
        : <h4 key={chave++} className={classe}>{conteudo}</h4>
      )
      i++
      continue
    }

    // Listas
    if (/^\s*[-*+]\s+/.test(linha)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*[-*+]\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocos.push(
        <ul key={chave++} className="ml-1 space-y-1.5">
          {itens.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm text-marca-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-400" aria-hidden />
              <span>{inline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(linha)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*\d+\.\s+/.test(linhas[i])) {
        itens.push(linhas[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocos.push(
        <ol key={chave++} className="ml-5 list-decimal space-y-1.5">
          {itens.map((item, j) => (
            <li key={j} className="text-sm text-marca-700">{inline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Parágrafo
    const paragrafo: string[] = []
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !/^(#{1,4})\s/.test(linhas[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(linhas[i]) &&
      !linhas[i].trim().startsWith('|')
    ) {
      paragrafo.push(linhas[i].trim())
      i++
    }
    blocos.push(
      <p key={chave++} className="text-sm leading-relaxed text-marca-700">
        {inline(paragrafo.join(' '))}
      </p>
    )
  }

  return <div className="space-y-3">{blocos}</div>
}
