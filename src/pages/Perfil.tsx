import { useState } from 'react'
import { useAuth, usePaciente } from '../contexts/AuthContext'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso } from '../components/Estado'
import { supabase } from '../lib/supabase'
import { dataLonga, iniciais } from '../lib/formato'

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-marca-50 py-2.5 last:border-0">
      <dt className="text-sm text-marca-500">{rotulo}</dt>
      <dd className="text-right text-sm font-medium text-marca-800">{valor}</dd>
    </div>
  )
}

export default function Perfil() {
  const { paciente, permissoes } = usePaciente()
  const { nutri, session, sair } = useAuth()

  const [senhaAberta, setSenhaAberta] = useState(false)
  const [novaSenha, setNovaSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function trocarSenha() {
    setErro(null)
    setMensagem(null)

    if (novaSenha.length < 8) {
      setErro('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (novaSenha !== repetir) {
      setErro('As senhas não são iguais.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setMensagem('Senha atualizada.')
    setNovaSenha('')
    setRepetir('')
    setSenhaAberta(false)
  }

  const liberados = [
    permissoes.ver_jornada && 'plano',
    permissoes.ver_evolucao && 'evolução',
    permissoes.ver_relatorios && 'relatórios',
    permissoes.ver_exames && 'exames',
    permissoes.chat_ativo && 'conversa',
    permissoes.diario_ativo && 'diário',
    permissoes.materiais_ativo && 'materiais',
  ].filter(Boolean) as string[]

  return (
    <>
      <Cabecalho titulo="Meu perfil" voltar />
      <Pagina>
        <div className="space-y-4">
          <section className="cartao text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-marca-100 text-lg font-semibold text-marca-700">
              {iniciais(paciente.nome)}
            </span>
            <h2 className="mt-3 text-lg font-semibold text-marca-900">{paciente.nome}</h2>
            {paciente.objetivo && <p className="text-sm text-marca-500">{paciente.objetivo}</p>}
          </section>

          <section className="cartao">
            <h3 className="font-semibold text-marca-900">Meus dados</h3>
            <dl className="mt-2">
              <Linha rotulo="E-mail" valor={session?.user.email} />
              <Linha rotulo="Telefone" valor={paciente.telefone} />
              <Linha rotulo="Nascimento" valor={paciente.data_nascimento ? dataLonga(paciente.data_nascimento) : null} />
              <Linha rotulo="Acompanhamento desde" valor={paciente.data_entrada ? dataLonga(paciente.data_entrada) : null} />
            </dl>
            <p className="mt-3 text-xs text-marca-400">
              Para corrigir algum destes dados, fale com seu nutricionista pela conversa.
            </p>
          </section>

          {nutri && (
            <section className="cartao">
              <h3 className="font-semibold text-marca-900">Quem acompanha você</h3>
              <div className="mt-3 flex items-center gap-3">
                {nutri.avatar_url ? (
                  <img src={nutri.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-700">
                    {iniciais(nutri.nome_completo)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-marca-900">{nutri.nome_completo ?? 'Seu nutricionista'}</p>
                  <p className="text-sm text-marca-500">
                    {[nutri.especialidade, nutri.crn && `CRN ${nutri.crn}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="cartao">
            <h3 className="font-semibold text-marca-900">O que está liberado para você</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {liberados.map((item) => (
                <span key={item} className="selo bg-marca-50 text-marca-700">{item}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-marca-400">
              Quem define o que aparece no app é o seu nutricionista.
            </p>
          </section>

          <section className="cartao">
            <h3 className="font-semibold text-marca-900">Segurança</h3>

            {!senhaAberta ? (
              <button type="button" className="btn-secundario mt-3 w-full" onClick={() => setSenhaAberta(true)}>
                Trocar minha senha
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="rotulo" htmlFor="nova">Nova senha</label>
                  <input
                    id="nova"
                    type="password"
                    className="campo"
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="repetir">Repita a senha</label>
                  <input
                    id="repetir"
                    type="password"
                    className="campo"
                    autoComplete="new-password"
                    value={repetir}
                    onChange={(e) => setRepetir(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-primario w-full" onClick={trocarSenha} disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar nova senha'}
                </button>
                <button type="button" className="btn-texto w-full" onClick={() => setSenhaAberta(false)}>
                  Cancelar
                </button>
              </div>
            )}

            {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}
            {mensagem && <div className="mt-3"><Aviso tom="info">{mensagem}</Aviso></div>}
          </section>

          <button type="button" onClick={sair} className="btn-secundario w-full">
            Sair da minha conta
          </button>
        </div>
      </Pagina>
    </>
  )
}
