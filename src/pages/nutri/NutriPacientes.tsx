import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDados } from '../../hooks/useDados'
import { Aviso, Carregando, Vazio } from '../../components/Estado'
import { supabase } from '../../lib/supabase'
import { PERMISSOES_PADRAO, type Permissoes } from '../../lib/types'

type PacienteLinha = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  status: string | null
}

const CAMPOS_PERMISSAO: Array<{ chave: keyof typeof PERMISSOES_PADRAO; rotulo: string }> = [
  { chave: 'ver_jornada', rotulo: 'Plano e jornada' },
  { chave: 'ver_evolucao', rotulo: 'Evolução e avaliações' },
  { chave: 'ver_relatorios', rotulo: 'Relatórios' },
  { chave: 'ver_exames', rotulo: 'Análise de exames' },
  { chave: 'ver_consultas', rotulo: 'Agenda de consultas' },
  { chave: 'chat_ativo', rotulo: 'Conversa' },
  { chave: 'diario_ativo', rotulo: 'Diário alimentar' },
  { chave: 'materiais_ativo', rotulo: 'Materiais' },
]

function linkDoConvite(token: string): string {
  return `${window.location.origin}/convite/${token}`
}

export default function NutriPacientes() {
  const { session, sair } = useAuth()
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [convites, setConvites] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [{ data: pacientes, error: erroPacientes }, { data: vinculos }, { data: permissoes }] =
      await Promise.all([
        supabase
          .from('patients')
          .select('id, nome, email, telefone, status')
          .order('nome', { ascending: true }),
        supabase.from('patient_users').select('patient_id, ativo, email'),
        supabase.from('patient_app_settings').select('*'),
      ])

    if (erroPacientes) throw new Error(erroPacientes.message)

    const vinculados = new Set(
      ((vinculos as Array<{ patient_id: string; ativo: boolean }>) ?? [])
        .filter((v) => v.ativo)
        .map((v) => v.patient_id)
    )

    const porPaciente: Record<string, Permissoes> = {}
    for (const p of (permissoes as Permissoes[]) ?? []) porPaciente[p.patient_id] = p

    return {
      pacientes: (pacientes as PacienteLinha[]) ?? [],
      vinculados,
      permissoes: porPaciente,
    }
  }, [session?.user.id])

  async function gerarConvite(patientId: string, email: string | null) {
    setErroAcao(null)
    setOcupado(patientId)

    const { data, error } = await supabase.rpc('criar_convite_paciente', {
      p_patient_id: patientId,
      p_email: email || null,
    })

    setOcupado(null)

    if (error) {
      setErroAcao(error.message)
      return
    }

    const linha = (Array.isArray(data) ? data[0] : data) as { token: string } | undefined
    if (linha?.token) {
      setConvites((atual) => ({ ...atual, [patientId]: linkDoConvite(linha.token) }))
      recarregar()
    }
  }

  async function copiar(patientId: string) {
    const link = convites[patientId]
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(patientId)
      window.setTimeout(() => setCopiado(null), 2000)
    } catch {
      setErroAcao('Não consegui copiar. Selecione o link e copie manualmente.')
    }
  }

  async function alterarPermissao(
    patientId: string,
    campo: keyof typeof PERMISSOES_PADRAO,
    valor: boolean
  ) {
    setErroAcao(null)

    const atual = dados?.permissoes[patientId]
    const { error } = await supabase.from('patient_app_settings').upsert(
      {
        patient_id: patientId,
        user_id: session!.user.id,
        ...PERMISSOES_PADRAO,
        ...(atual ?? {}),
        [campo]: valor,
      },
      { onConflict: 'patient_id' }
    )

    if (error) setErroAcao(error.message)
    recarregar()
  }

  const pacientes = (dados?.pacientes ?? []).filter((p) =>
    p.nome.toLowerCase().includes(busca.trim().toLowerCase())
  )

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-marca-100 bg-areia-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-marca-900">Acesso dos pacientes</h1>
            <p className="text-sm text-marca-500">Convites e o que cada um enxerga no app</p>
          </div>
          <Link to="/nutri/conversas" className="btn-secundario px-3 py-2 text-sm">Conversas</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {erroAcao && <Aviso>{erroAcao}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && <Carregando />}

        {!carregando && !erro && (
          <>
            <input
              type="search"
              className="campo"
              placeholder="Buscar paciente pelo nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

            {pacientes.length === 0 ? (
              <Vazio titulo="Nenhum paciente encontrado" />
            ) : (
              <div className="space-y-3">
                {pacientes.map((paciente) => {
                  const vinculado = dados!.vinculados.has(paciente.id)
                  const permissoes = dados!.permissoes[paciente.id]
                  const aberto = expandido === paciente.id
                  const link = convites[paciente.id]

                  return (
                    <article key={paciente.id} className="cartao">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-marca-900">{paciente.nome}</p>
                          <p className="truncate text-sm text-marca-500">
                            {paciente.email || paciente.telefone || 'sem contato cadastrado'}
                          </p>
                        </div>
                        <span
                          className={`selo shrink-0 ${
                            vinculado ? 'bg-marca-100 text-marca-800' : 'bg-areia-200 text-marca-600'
                          }`}
                        >
                          {vinculado ? 'No app' : 'Sem acesso'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secundario flex-1 py-2.5 text-sm"
                          onClick={() => gerarConvite(paciente.id, paciente.email)}
                          disabled={ocupado === paciente.id}
                        >
                          {ocupado === paciente.id
                            ? 'Gerando…'
                            : vinculado
                              ? 'Gerar novo convite'
                              : 'Gerar convite'}
                        </button>
                        <button
                          type="button"
                          className="btn-secundario flex-1 py-2.5 text-sm"
                          onClick={() => setExpandido(aberto ? null : paciente.id)}
                        >
                          {aberto ? 'Fechar permissões' : 'Permissões'}
                        </button>
                      </div>

                      {link && (
                        <div className="mt-3 rounded-xl bg-marca-50 p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-marca-500">
                            Link do convite (vale 30 dias)
                          </p>
                          <p className="mt-1 break-all text-sm text-marca-800">{link}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="btn-secundario flex-1 py-2 text-sm"
                              onClick={() => copiar(paciente.id)}
                            >
                              {copiado === paciente.id ? 'Copiado!' : 'Copiar link'}
                            </button>
                            {paciente.telefone && (
                              <a
                                className="btn-primario flex-1 py-2 text-sm"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://wa.me/55${paciente.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `Oi, ${paciente.nome.split(' ')[0]}! Preparei seu acesso ao app do acompanhamento. É só criar sua senha por aqui: ${link}`
                                )}`}
                              >
                                Enviar no WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {aberto && (
                        <div className="mt-3 border-t border-marca-100 pt-3">
                          <p className="mb-2 text-sm text-marca-500">
                            O que este paciente enxerga dentro do app:
                          </p>
                          <div className="space-y-1.5">
                            {CAMPOS_PERMISSAO.map(({ chave, rotulo }) => {
                              const ligado = permissoes ? permissoes[chave] : PERMISSOES_PADRAO[chave]
                              return (
                                <label
                                  key={chave}
                                  className="flex cursor-pointer items-center justify-between gap-3 py-1.5"
                                >
                                  <span className="text-sm text-marca-800">{rotulo}</span>
                                  <input
                                    type="checkbox"
                                    checked={ligado}
                                    onChange={(e) => alterarPermissao(paciente.id, chave, e.target.checked)}
                                    className="h-5 w-5 rounded accent-marca-600"
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            <button type="button" className="btn-secundario w-full" onClick={sair}>
              Sair
            </button>
          </>
        )}
      </main>
    </div>
  )
}
