import type { ReactNode } from 'react'

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-marca-500">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-marca-200 border-t-marca-600" />
      <p className="text-sm">{texto}</p>
    </div>
  )
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="cartao flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-semibold text-marca-800">{titulo}</p>
      {descricao && <p className="max-w-xs text-sm text-marca-500">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}

export function Aviso({ children, tom = 'erro' }: { children: ReactNode; tom?: 'erro' | 'info' }) {
  const estilo =
    tom === 'erro'
      ? 'bg-red-50 text-red-800 ring-red-100'
      : 'bg-marca-50 text-marca-800 ring-marca-100'
  return <div className={`rounded-xl px-3.5 py-3 text-sm ring-1 ${estilo}`}>{children}</div>
}

export function Bloqueado({ recurso }: { recurso: string }) {
  return (
    <Vazio
      titulo={`${recurso} ainda não liberado`}
      descricao="Seu nutricionista controla o que aparece aqui. Fale com ele se precisar deste conteúdo."
    />
  )
}
