import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Bloqueado, Carregando, Vazio } from '../components/Estado'
import { buscarConsultas, buscarJornada } from '../lib/consultas'
import { dataHora, dataLonga } from '../lib/formato'
import type { JornadaEtapa, JornadaTarefa } from '../lib/types'

function tituloDe(item: { titulo?: string; nome?: string }): string {
  return item.titulo ?? item.nome ?? 'Sem título'
}

function tarefasDe(etapa: JornadaEtapa): JornadaTarefa[] {
  return etapa.tarefas ?? etapa.itens ?? []
}

function concluida(tarefa: JornadaTarefa): boolean {
  return tarefa.concluida ?? tarefa.concluido ?? false
}

function Etapa({ etapa }: { etapa: JornadaEtapa }) {
  const tarefas = tarefasDe(etapa)
  const feitas = tarefas.filter(concluida).length
  const progresso = tarefas.length ? Math.round((feitas / tarefas.length) * 100) : null

  return (
    <article className="cartao">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-marca-900">{tituloDe(etapa)}</h3>
          {(etapa.dataInicio || etapa.dataFim) && (
            <p className="mt-0.5 text-sm text-marca-500">
              {etapa.dataInicio ? dataLonga(etapa.dataInicio) : '—'}
              {etapa.dataFim ? ` até ${dataLonga(etapa.dataFim)}` : ''}
            </p>
          )}
        </div>
        {etapa.status && (
          <span className="selo shrink-0 bg-marca-100 text-marca-800">{etapa.status}</span>
        )}
      </div>

      {etapa.descricao && <p className="mt-2 text-sm text-marca-600">{etapa.descricao}</p>}

      {progresso !== null && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-marca-100">
            <div className="h-full rounded-full bg-marca-500 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-marca-500">
            {feitas} de {tarefas.length} concluídas
          </p>
        </div>
      )}

      {tarefas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tarefas.map((tarefa, i) => (
            <li key={tarefa.id ?? i} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  concluida(tarefa) ? 'bg-marca-600 text-white' : 'bg-marca-100 text-marca-400'
                }`}
                aria-hidden
              >
                {concluida(tarefa) ? '✓' : ''}
              </span>
              <div className="min-w-0">
                <p className={`text-sm ${concluida(tarefa) ? 'text-marca-400 line-through' : 'text-marca-800'}`}>
                  {tituloDe(tarefa)}
                </p>
                {tarefa.descricao && <p className="text-xs text-marca-500">{tarefa.descricao}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export default function Jornada() {
  const { paciente, permissoes } = usePaciente()

  const { dados, carregando, erro } = useDados(async () => {
    const [jornada, consultas] = await Promise.all([
      permissoes.ver_jornada ? buscarJornada(paciente.id) : Promise.resolve(null),
      permissoes.ver_consultas ? buscarConsultas(paciente.id) : Promise.resolve([]),
    ])
    return { jornada, consultas }
  }, [paciente.id])

  if (!permissoes.ver_jornada) {
    return (
      <>
        <Cabecalho titulo="Meu plano" />
        <Pagina><Bloqueado recurso="Seu plano" /></Pagina>
      </>
    )
  }

  const plano = dados?.jornada?.data ?? null
  const etapas = plano?.jornadas ?? []
  const estrategias = plano?.estrategias ?? []
  const proximas = (dados?.consultas ?? [])
    .filter((c) => !c.concluido && new Date(c.data_inicio) >= new Date())
    .slice(0, 5)

  return (
    <>
      <Cabecalho
        titulo="Meu plano"
        subtitulo={plano?.tipoPlano ? `Plano ${plano.tipoPlano}` : undefined}
      />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          <div className="space-y-4">
            {(plano?.dataInicio || plano?.dataFim) && (
              <section className="cartao">
                <h2 className="font-semibold text-marca-900">Período do acompanhamento</h2>
                <p className="mt-1 text-sm text-marca-600">
                  {plano?.dataInicio ? dataLonga(plano.dataInicio) : '—'}
                  {plano?.dataFim ? ` até ${dataLonga(plano.dataFim)}` : ''}
                </p>
              </section>
            )}

            {plano?.estrategia && (
              <section className="cartao">
                <h2 className="font-semibold text-marca-900">Estratégia</h2>
                <p className="mt-1.5 whitespace-pre-line text-sm text-marca-600">{plano.estrategia}</p>
              </section>
            )}

            {estrategias.length > 0 && (
              <section className="cartao">
                <h2 className="font-semibold text-marca-900">Pilares desta fase</h2>
                <ul className="mt-2 space-y-2">
                  {estrategias.map((item, i) => {
                    const texto = typeof item === 'string' ? item : item.titulo ?? ''
                    const detalhe = typeof item === 'string' ? null : item.descricao
                    return (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-500" aria-hidden />
                        <div>
                          <p className="text-marca-800">{texto}</p>
                          {detalhe && <p className="text-xs text-marca-500">{detalhe}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {etapas.length > 0 ? (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                  Etapas da jornada
                </h2>
                {etapas.map((etapa, i) => (
                  <Etapa key={etapa.id ?? i} etapa={etapa} />
                ))}
              </section>
            ) : (
              !plano?.estrategia &&
              estrategias.length === 0 && (
                <Vazio
                  titulo="Seu plano está sendo montado"
                  descricao="Assim que seu nutricionista publicar a jornada, ela aparece aqui."
                />
              )
            )}

            {proximas.length > 0 && (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                  Próximos encontros
                </h2>
                {proximas.map((consulta) => (
                  <div key={consulta.id} className="cartao">
                    <p className="font-medium text-marca-900">{consulta.titulo}</p>
                    <p className="mt-0.5 text-sm text-marca-500">{dataHora(consulta.data_inicio)}</p>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </Pagina>
    </>
  )
}
