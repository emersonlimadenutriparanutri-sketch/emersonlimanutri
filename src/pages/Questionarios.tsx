import { Link } from 'react-router-dom'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Carregando, Vazio } from '../components/Estado'
import { buscarQuestionarios } from '../lib/consultas'
import { dataCurta, dataLonga } from '../lib/formato'

export default function Questionarios() {
  const { paciente } = usePaciente()

  const { dados, carregando, erro } = useDados(
    () => buscarQuestionarios(paciente.id),
    [paciente.id]
  )

  const envios = dados?.envios ?? []
  const respostas = dados?.respostas ?? []
  const modelos = dados?.modelos ?? {}

  const pendentes = envios.filter((e) => !respostas.some((r) => r.envio_id === e.id))
  const respondidos = envios.filter((e) => respostas.some((r) => r.envio_id === e.id))

  return (
    <>
      <Cabecalho titulo="Questionários" voltar />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          envios.length === 0 ? (
            <Vazio
              titulo="Nenhum questionário por enquanto"
              descricao="Quando seu nutricionista enviar um formulário, ele aparece aqui."
            />
          ) : (
            <div className="space-y-5">
              {pendentes.length > 0 && (
                <section className="space-y-3">
                  <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                    Para responder
                  </h2>
                  {pendentes.map((envio) => {
                    const atrasado = envio.prazo ? new Date(envio.prazo) < new Date() : false
                    return (
                      <Link key={envio.id} to={`/questionarios/${envio.id}`} className="cartao block">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-marca-900">
                              {modelos[envio.modelo_id]?.nome ?? 'Questionário'}
                            </p>
                            <p className="mt-0.5 text-sm text-marca-500">
                              Enviado em {dataCurta(envio.data_envio)}
                              {envio.prazo ? ` · prazo ${dataCurta(envio.prazo)}` : ''}
                            </p>
                          </div>
                          <span
                            className={`selo shrink-0 ${
                              atrasado ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {atrasado ? 'Atrasado' : 'Responder'}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </section>
              )}

              {respondidos.length > 0 && (
                <section className="space-y-3">
                  <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                    Já respondidos
                  </h2>
                  {respondidos.map((envio) => {
                    const resposta = respostas.find((r) => r.envio_id === envio.id)!
                    const podeRefazer = envio.permite_multiplas
                    return (
                      <div key={envio.id} className="cartao">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-marca-900">
                              {modelos[envio.modelo_id]?.nome ?? 'Questionário'}
                            </p>
                            <p className="mt-0.5 text-sm text-marca-500">
                              Respondido em {dataLonga(resposta.respondido_em)}
                            </p>
                          </div>
                          <span className="selo shrink-0 bg-marca-100 text-marca-800">Feito</span>
                        </div>
                        {podeRefazer && (
                          <Link to={`/questionarios/${envio.id}`} className="btn-secundario mt-3 w-full">
                            Responder de novo
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </section>
              )}
            </div>
          )
        )}
      </Pagina>
    </>
  )
}
