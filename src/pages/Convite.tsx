import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { aceitarConvite, guardarConvitePendente } from '../lib/convite'
import { Aviso, Carregando } from '../components/Estado'
import { primeiroNome } from '../lib/formato'

type InfoConvite = {
  valido: boolean
  motivo: string | null
  paciente: string | null
  email: string | null
  nutri: string | null
  nutri_avatar: string | null
}

export default function Convite() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { session, recarregar } = useAuth()

  const [info, setInfo] = useState<InfoConvite | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true
    supabase
      .rpc('convite_info', { p_token: token })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          // Falha de rede ou do servidor — o paciente não precisa ver o erro cru.
          setErro('Não conseguimos verificar seu convite agora. Confira sua conexão e tente de novo.')
        } else {
          const linha = (Array.isArray(data) ? data[0] : data) as InfoConvite | undefined
          setInfo(linha ?? null)
          if (linha?.email) setEmail(linha.email)
        }
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [token])

  // Já está logado: basta vincular esta conta ao convite.
  async function vincularContaAtual() {
    setErro(null)
    setEnviando(true)
    try {
      await aceitarConvite(token)
      await recarregar()
      navigate('/', { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível usar este convite.')
      setEnviando(false)
    }
  }

  async function criarConta(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)

    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não são iguais.')
      return
    }

    setEnviando(true)
    guardarConvitePendente(token)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setErro('Este e-mail já tem conta. Entre com sua senha e o convite será aplicado.')
      } else {
        setErro(error.message)
      }
      setEnviando(false)
      return
    }

    // Sem sessão = o projeto exige confirmação de e-mail. O token fica guardado
    // e é resgatado no primeiro login.
    if (!data.session) {
      setAviso('Conta criada. Confirme o e-mail que enviamos e depois entre no app.')
      setEnviando(false)
      return
    }

    try {
      await aceitarConvite(token)
      await recarregar()
      navigate('/', { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Conta criada, mas o convite falhou.')
      setEnviando(false)
    }
  }

  if (carregando) return <Carregando texto="Verificando seu convite…" />

  if (!info?.valido) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <div className="cartao max-w-sm text-center">
          <h1 className="text-lg font-semibold text-marca-900">Convite indisponível</h1>
          <p className="mt-2 text-sm text-marca-500">
            {info?.motivo ?? erro ?? 'Este link não é válido.'}
          </p>
          <p className="mt-4 text-sm text-marca-500">
            Peça um novo link ao seu nutricionista.
          </p>
          <Link to="/entrar" className="btn-secundario mt-5 w-full">Ir para o login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-areia-50 px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-7 text-center">
          {info.nutri_avatar ? (
            <img src={info.nutri_avatar} alt="" className="mx-auto mb-4 h-16 w-16 rounded-full object-cover" />
          ) : (
            <img src="/icone.svg" alt="" className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          )}
          <h1 className="text-2xl font-semibold text-marca-900">
            Olá, {primeiroNome(info.paciente) || 'seja bem-vindo'}!
          </h1>
          <p className="mt-1.5 text-sm text-marca-500">
            {info.nutri ? `${info.nutri} preparou seu acesso.` : 'Seu nutricionista preparou seu acesso.'}{' '}
            Crie uma senha para começar.
          </p>
        </div>

        {session ? (
          <div className="cartao space-y-4 text-center">
            <p className="text-sm text-marca-600">
              Você já está logado. Quer vincular este convite à conta atual?
            </p>
            {erro && <Aviso>{erro}</Aviso>}
            <button className="btn-primario w-full" onClick={vincularContaAtual} disabled={enviando}>
              {enviando ? 'Vinculando…' : 'Vincular a esta conta'}
            </button>
          </div>
        ) : (
          <form onSubmit={criarConta} className="cartao space-y-4">
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
                readOnly={!!info.email}
                required
              />
              {info.email && (
                <p className="mt-1.5 text-xs text-marca-400">
                  Este convite foi feito para este e-mail.
                </p>
              )}
            </div>

            <div>
              <label className="rotulo" htmlFor="senha">Crie uma senha</label>
              <input
                id="senha"
                type="password"
                className="campo"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={8}
                required
              />
              <p className="mt-1.5 text-xs text-marca-400">Mínimo de 8 caracteres.</p>
            </div>

            <div>
              <label className="rotulo" htmlFor="confirmacao">Repita a senha</label>
              <input
                id="confirmacao"
                type="password"
                className="campo"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required
              />
            </div>

            {erro && <Aviso>{erro}</Aviso>}
            {aviso && <Aviso tom="info">{aviso}</Aviso>}

            <button type="submit" className="btn-primario w-full" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar meu acesso'}
            </button>

            <Link to="/entrar" className="btn-texto w-full">Já tenho conta</Link>
          </form>
        )}
      </div>
    </div>
  )
}
