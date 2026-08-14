import { useEffect, useState, type FormEvent } from 'react'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Carregando, Vazio } from '../components/Estado'
import { supabase } from '../lib/supabase'
import { buscarLembretes } from '../lib/consultas'
import { DIAS_SEMANA } from '../lib/formato'
import { ativarPush, desativarPush, pushAtivo, pushDisponivel } from '../lib/push'

const TIPOS = [
  { valor: 'agua', rotulo: 'Água' },
  { valor: 'suplemento', rotulo: 'Suplemento' },
  { valor: 'refeicao', rotulo: 'Refeição' },
  { valor: 'checkin', rotulo: 'Check-in' },
  { valor: 'consulta', rotulo: 'Consulta' },
  { valor: 'outro', rotulo: 'Outro' },
]

export default function Lembretes() {
  const { paciente, vinculo } = usePaciente()

  const { dados, carregando, erro, recarregar } = useDados(
    () => buscarLembretes(paciente.id),
    [paciente.id]
  )

  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('agua')
  const [horario, setHorario] = useState('08:00')
  const [dias, setDias] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [notificacoes, setNotificacoes] = useState(false)
  const [mexendoPush, setMexendoPush] = useState(false)
  const [erroPush, setErroPush] = useState<string | null>(null)

  useEffect(() => {
    void pushAtivo().then(setNotificacoes)
  }, [])

  async function alternarPush() {
    setErroPush(null)
    setMexendoPush(true)
    try {
      if (notificacoes) {
        await desativarPush()
        setNotificacoes(false)
      } else {
        await ativarPush(paciente.id)
        setNotificacoes(true)
      }
    } catch (e) {
      setErroPush(e instanceof Error ? e.message : 'Não foi possível alterar as notificações.')
    } finally {
      setMexendoPush(false)
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return

    setErroForm(null)
    setSalvando(true)

    const { error } = await supabase.from('lembretes').insert({
      patient_id: paciente.id,
      user_id: vinculo.nutri_user_id,
      criado_por: 'paciente',
      tipo,
      titulo: titulo.trim(),
      horario,
      dias_semana: dias.length > 0 ? dias : [0, 1, 2, 3, 4, 5, 6],
    })

    setSalvando(false)

    if (error) {
      setErroForm(error.message)
      return
    }

    setTitulo('')
    setAberto(false)
    recarregar()
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    await supabase.from('lembretes').update({ ativo: !ativo }).eq('id', id)
    recarregar()
  }

  async function remover(id: string) {
    await supabase.from('lembretes').delete().eq('id', id)
    recarregar()
  }

  const lembretes = dados ?? []

  return (
    <>
      <Cabecalho
        titulo="Lembretes"
        voltar
        acao={
          <button type="button" className="btn-primario px-3 py-2 text-sm" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Fechar' : 'Novo'}
          </button>
        }
      />
      <Pagina>
        <div className="space-y-4">
          <section className="cartao">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-marca-900">Notificações no celular</h2>
                <p className="mt-0.5 text-sm text-marca-500">
                  {pushDisponivel()
                    ? 'Receba os lembretes e avisos do seu nutricionista mesmo com o app fechado.'
                    : 'Este navegador não permite notificações. No iPhone, adicione o app à tela de início primeiro.'}
                </p>
              </div>
              {pushDisponivel() && (
                <button
                  type="button"
                  onClick={alternarPush}
                  disabled={mexendoPush}
                  className={`selo shrink-0 ${
                    notificacoes ? 'bg-marca-700 text-white' : 'bg-marca-50 text-marca-700 ring-1 ring-marca-200'
                  }`}
                >
                  {mexendoPush ? '…' : notificacoes ? 'Ativas' : 'Ativar'}
                </button>
              )}
            </div>
            {erroPush && <div className="mt-3"><Aviso>{erroPush}</Aviso></div>}
          </section>

          {aberto && (
            <form onSubmit={criar} className="cartao space-y-4">
              <div>
                <label className="rotulo" htmlFor="titulo">O que lembrar</label>
                <input
                  id="titulo"
                  type="text"
                  className="campo"
                  placeholder="Tomar 500ml de água"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rotulo" htmlFor="tipo">Tipo</label>
                  <select id="tipo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS.map((t) => (
                      <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="rotulo" htmlFor="horario">Horário</label>
                  <input
                    id="horario"
                    type="time"
                    className="campo"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <span className="rotulo">Dias</span>
                <div className="flex gap-1.5">
                  {DIAS_SEMANA.map((dia, indice) => {
                    const marcado = dias.includes(indice)
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() =>
                          setDias((atual) =>
                            marcado ? atual.filter((d) => d !== indice) : [...atual, indice].sort()
                          )
                        }
                        className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                          marcado ? 'bg-marca-700 text-white' : 'bg-marca-50 text-marca-600'
                        }`}
                      >
                        {dia}
                      </button>
                    )
                  })}
                </div>
              </div>

              {erroForm && <Aviso>{erroForm}</Aviso>}

              <button type="submit" className="btn-primario w-full" disabled={salvando}>
                {salvando ? 'Criando…' : 'Criar lembrete'}
              </button>
            </form>
          )}

          {carregando && <Carregando />}
          {erro && <Aviso>{erro}</Aviso>}

          {!carregando && !erro && (
            lembretes.length === 0 ? (
              <Vazio
                titulo="Nenhum lembrete ainda"
                descricao="Crie lembretes para água, suplementos ou o horário das refeições."
                acao={
                  <button type="button" className="btn-primario" onClick={() => setAberto(true)}>
                    Criar meu primeiro lembrete
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {lembretes.map((lembrete) => (
                  <article key={lembrete.id} className={`cartao ${lembrete.ativo ? '' : 'opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-marca-900">{lembrete.titulo}</p>
                        <p className="mt-0.5 text-sm text-marca-500">
                          {lembrete.horario?.slice(0, 5) ?? 'sem horário'} ·{' '}
                          {lembrete.dias_semana.length === 7
                            ? 'todos os dias'
                            : lembrete.dias_semana.map((d) => DIAS_SEMANA[d]).join(', ')}
                        </p>
                        {lembrete.criado_por === 'nutri' && (
                          <span className="selo mt-2 bg-marca-50 text-marca-700">
                            Do seu nutricionista
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          className="btn-texto"
                          onClick={() => alternarAtivo(lembrete.id, lembrete.ativo)}
                        >
                          {lembrete.ativo ? 'Pausar' : 'Retomar'}
                        </button>
                        {lembrete.criado_por === 'paciente' && (
                          <button
                            type="button"
                            className="btn-texto text-red-600 hover:text-red-700"
                            onClick={() => remover(lembrete.id)}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
        </div>
      </Pagina>
    </>
  )
}
