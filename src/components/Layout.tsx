import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { iniciais, primeiroNome } from '../lib/formato'

type Aba = { para: string; rotulo: string; icone: ReactNode }

function Icone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const ABAS: Aba[] = [
  { para: '/', rotulo: 'Início', icone: <Icone d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" /> },
  { para: '/jornada', rotulo: 'Jornada', icone: <Icone d="M4 6h16M4 12h16M4 18h10M20 18l-2-2m2 2-2 2" /> },
  { para: '/checkin', rotulo: 'Check-in', icone: <Icone d="M9 12.5l2.5 2.5L16 9M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> },
  { para: '/chat', rotulo: 'Conversa', icone: <Icone d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9Z" /> },
  { para: '/mais', rotulo: 'Mais', icone: <Icone d="M4 7h16M4 12h16M4 17h16" /> },
]

export function Cabecalho({
  titulo,
  subtitulo,
  voltar,
  acao,
}: {
  titulo: string
  subtitulo?: string
  voltar?: boolean
  acao?: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 border-b border-marca-100 bg-areia-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3.5">
        {voltar && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="-ml-1 rounded-lg p-1.5 text-marca-700 hover:bg-marca-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-marca-900">{titulo}</h1>
          {subtitulo && <p className="truncate text-sm text-marca-500">{subtitulo}</p>}
        </div>
        {acao}
      </div>
    </header>
  )
}

export function CabecalhoInicio() {
  const { paciente, nutri } = useAuth()

  return (
    <header className="bg-marca-700 px-4 pb-8 pt-6 text-white">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-marca-100">Olá, {primeiroNome(paciente?.nome) || 'tudo bem?'}</p>
          <p className="truncate text-xl font-semibold">Sua jornada de hoje</p>
        </div>
        <NavLink to="/perfil" aria-label="Seu perfil" className="shrink-0">
          {nutri?.avatar_url ? (
            <img
              src={nutri.avatar_url}
              alt={nutri.nome_completo ?? 'Nutricionista'}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-marca-500"
            />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-marca-600 text-sm font-semibold ring-2 ring-marca-500">
              {iniciais(nutri?.nome_completo ?? paciente?.nome)}
            </span>
          )}
        </NavLink>
      </div>
    </header>
  )
}

export function BarraInferior() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-marca-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.para === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition ${
                isActive ? 'text-marca-700' : 'text-marca-400'
              }`
            }
          >
            {aba.icone}
            {aba.rotulo}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function Pagina({ children, semNav }: { children: ReactNode; semNav?: boolean }) {
  return (
    <div className={`min-h-dvh ${semNav ? '' : 'pb-nav'}`}>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
      {!semNav && <BarraInferior />}
    </div>
  )
}
