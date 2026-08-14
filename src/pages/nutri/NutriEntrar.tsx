import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Aviso } from '../../components/Estado'

export default function NutriEntrar() {
  const { session, carregando, vinculo, recarregar } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Se quem está logado é paciente, o lugar dele é a área do paciente.
  if (!carregando && session) return <Navigate to={vinculo ? '/' : '/nutri'} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    if (error) {
      setErro(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message)
      setEnviando(false)
      return
    }

    await recarregar()
    setEnviando(false)
    navigate('/nutri', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-areia-50 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-marca-900">Área do nutricionista</h1>
          <p className="mt-1 text-sm text-marca-500">
            Use o mesmo login do app De Nutri para Nutri.
          </p>
        </div>

        <form onSubmit={entrar} className="cartao space-y-4">
          <div>
            <label className="rotulo" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              className="campo"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              className="campo"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {erro && <Aviso>{erro}</Aviso>}

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center">
          <Link to="/entrar" className="text-sm font-medium text-marca-700 underline">
            Sou paciente
          </Link>
        </p>
      </div>
    </div>
  )
}
