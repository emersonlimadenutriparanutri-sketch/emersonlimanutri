import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { resgatarConvitePendente } from '../lib/convite'
import { Aviso } from '../components/Estado'

export default function Entrar() {
  const { session, carregando, recarregar } = useAuth()
  const navigate = useNavigate()
  const local = useLocation() as { state?: { de?: string } }

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!carregando && session) return <Navigate to={local.state?.de ?? '/'} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    if (error) {
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos.'
          : error.message
      )
      setEnviando(false)
      return
    }

    await resgatarConvitePendente()
    await recarregar()
    setEnviando(false)
    navigate(local.state?.de ?? '/', { replace: true })
  }

  async function recuperarSenha() {
    if (!email.trim()) {
      setErro('Escreva seu e-mail acima para receber o link de recuperação.')
      return
    }
    setErro(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/entrar`,
    })
    if (error) setErro(error.message)
    else setAviso('Enviamos um link de recuperação para o seu e-mail.')
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-areia-50 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icone.svg" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-semibold text-marca-900">Meu Acompanhamento</h1>
          <p className="mt-1 text-sm text-marca-500">
            Entre para acompanhar sua jornada com seu nutricionista.
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
          {aviso && <Aviso tom="info">{aviso}</Aviso>}

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          <button type="button" className="btn-texto w-full" onClick={recuperarSenha}>
            Esqueci minha senha
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-marca-500">
          Ainda não tem acesso? Peça o link de convite ao seu nutricionista.
        </p>
        <p className="mt-2 text-center">
          <Link to="/nutri/entrar" className="text-sm font-medium text-marca-700 underline">
            Sou nutricionista
          </Link>
        </p>
      </div>
    </div>
  )
}
