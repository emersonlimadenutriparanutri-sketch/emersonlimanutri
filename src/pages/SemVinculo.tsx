import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Carregando } from '../components/Estado'

export default function SemVinculo() {
  const { carregando, session, vinculo, sair } = useAuth()

  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/entrar" replace />
  if (vinculo) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="cartao w-full max-w-sm text-center">
        <img src="/icone.svg" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl" />
        <h1 className="text-lg font-semibold text-marca-900">Sua conta ainda não está vinculada</h1>
        <p className="mt-2 text-sm text-marca-500">
          Este login existe, mas nenhum nutricionista liberou o acompanhamento para ele. Abra o link
          de convite que seu nutricionista enviou, usando este mesmo e-mail.
        </p>

        <div className="mt-6 space-y-2">
          <Link to="/nutri" className="btn-secundario w-full">Sou nutricionista, ir para minha área</Link>
          <button className="btn-texto w-full" onClick={sair}>Sair desta conta</button>
        </div>
      </div>
    </div>
  )
}
