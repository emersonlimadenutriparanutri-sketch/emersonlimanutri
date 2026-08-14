import { Link } from 'react-router-dom'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { BarraInferior, CabecalhoInicio } from '../components/Layout'
import { Aviso, Carregando } from '../components/Estado'
import {
  buscarAvaliacoes,
  buscarCheckIns,
  buscarConsultas,
  buscarMensagens,
  buscarQuestionarios,
} from '../lib/consultas'
import { dataHora, diferenca, numero, semanaAtual } from '../lib/formato'

export default function Inicio() {
  const { paciente, permissoes } = usePaciente()

  const { dados, carregando, erro } = useDados(async () => {
    const [consultas, checkins, avaliacoes, questionarios, mensagens] = await Promise.all([
      permissoes.ver_consultas ? buscarConsultas(paciente.id) : Promise.resolve([]),
      buscarCheckIns(paciente.id, 4),
      permissoes.ver_evolucao ? buscarAvaliacoes(paciente.id) : Promise.resolve([]),
      buscarQuestionarios(paciente.id),
      permissoes.chat_ativo ? buscarMensagens(paciente.id) : Promise.resolve([]),
    ])
    return { consultas, checkins, avaliacoes, questionarios, mensagens }
  }, [paciente.id])

  const semana = semanaAtual()

  const proximaConsulta = dados?.consultas
    .filter((c) => !c.concluido && new Date(c.data_inicio) >= new Date())
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))[0]

  const checkinFeito = dados?.checkins.some((c) => c.data?.semana_referencia === semana) ?? false

  const pendentes =
    dados?.questionarios.envios.filter(
      (e) => !dados.questionarios.respostas.some((r) => r.envio_id === e.id)
    ) ?? []

  const naoLidas = dados?.mensagens.filter((m) => m.autor === 'nutri' && !m.lida_em).length ?? 0

  const avaliacoes = dados?.avaliacoes ?? []
  const ultima = avaliacoes[avaliacoes.length - 1]
  const penultima = avaliacoes[avaliacoes.length - 2]
  const variacaoPeso = diferenca(ultima?.peso, penultima?.peso)

  return (
    <div className="min-h-dvh pb-nav">
      <CabecalhoInicio />

      <main className="mx-auto -mt-5 max-w-2xl space-y-4 px-4">
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          <>
            {/* Check-in da semana — a ação mais importante da tela. */}
            <section className="cartao">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-marca-900">
                    {checkinFeito ? 'Check-in desta semana enviado' : 'Check-in da semana'}
                  </h2>
                  <p className="mt-1 text-sm text-marca-500">
                    {checkinFeito
                      ? 'Seu nutricionista já recebeu. Pode editar se quiser ajustar algo.'
                      : 'Cinco minutos contando como foi sua semana. É o que guia os próximos ajustes.'}
                  </p>
                </div>
                <span
                  className={`selo shrink-0 ${
                    checkinFeito ? 'bg-marca-100 text-marca-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {checkinFeito ? 'Feito' : 'Pendente'}
                </span>
              </div>
              <Link to="/checkin" className={checkinFeito ? 'btn-secundario mt-3 w-full' : 'btn-primario mt-3 w-full'}>
                {checkinFeito ? 'Revisar meu check-in' : 'Fazer meu check-in'}
              </Link>
            </section>

            {/* Alertas curtos */}
            {(pendentes.length > 0 || naoLidas > 0) && (
              <section className="space-y-2">
                {pendentes.length > 0 && (
                  <Link to="/questionarios" className="cartao flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-marca-900">
                        {pendentes.length === 1
                          ? '1 questionário esperando você'
                          : `${pendentes.length} questionários esperando você`}
                      </p>
                      <p className="text-sm text-marca-500">Responder ajuda a preparar sua consulta.</p>
                    </div>
                    <span className="selo bg-amber-100 text-amber-800">Responder</span>
                  </Link>
                )}

                {naoLidas > 0 && (
                  <Link to="/chat" className="cartao flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-marca-900">
                        {naoLidas === 1 ? 'Nova mensagem do seu nutri' : `${naoLidas} mensagens novas`}
                      </p>
                      <p className="text-sm text-marca-500">Toque para abrir a conversa.</p>
                    </div>
                    <span className="selo bg-marca-100 text-marca-800">Ler</span>
                  </Link>
                )}
              </section>
            )}

            {/* Próxima consulta */}
            {permissoes.ver_consultas && (
              <section className="cartao">
                <h2 className="font-semibold text-marca-900">Próxima consulta</h2>
                {proximaConsulta ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-marca-800">{proximaConsulta.titulo}</p>
                    <p className="text-sm text-marca-500">{dataHora(proximaConsulta.data_inicio)}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-marca-500">
                    Nenhuma consulta marcada por enquanto.
                  </p>
                )}
              </section>
            )}

            {/* Resumo da evolução */}
            {permissoes.ver_evolucao && ultima && (
              <Link to="/evolucao" className="cartao block">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-marca-900">Sua evolução</h2>
                  <span className="text-sm text-marca-500">ver tudo →</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-marca-400">Peso</p>
                    <p className="text-lg font-semibold text-marca-900">{numero(ultima.peso, 1, ' kg')}</p>
                    {variacaoPeso && <p className="text-xs text-marca-500">{variacaoPeso} kg</p>}
                  </div>
                  <div>
                    <p className="text-xs text-marca-400">Gordura</p>
                    <p className="text-lg font-semibold text-marca-900">
                      {numero(ultima.percentual_gordura, 1, '%')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-marca-400">Cintura</p>
                    <p className="text-lg font-semibold text-marca-900">{numero(ultima.cintura, 1, ' cm')}</p>
                  </div>
                </div>
              </Link>
            )}

            {/* Atalhos */}
            <section className="grid grid-cols-2 gap-3">
              {permissoes.ver_jornada && (
                <Link to="/jornada" className="cartao">
                  <p className="font-medium text-marca-900">Meu plano</p>
                  <p className="mt-0.5 text-sm text-marca-500">Etapas e metas</p>
                </Link>
              )}
              {permissoes.diario_ativo && (
                <Link to="/diario" className="cartao">
                  <p className="font-medium text-marca-900">Diário</p>
                  <p className="mt-0.5 text-sm text-marca-500">Registrar refeição</p>
                </Link>
              )}
              {permissoes.materiais_ativo && (
                <Link to="/materiais" className="cartao">
                  <p className="font-medium text-marca-900">Materiais</p>
                  <p className="mt-0.5 text-sm text-marca-500">Receitas e guias</p>
                </Link>
              )}
              <Link to="/lembretes" className="cartao">
                <p className="font-medium text-marca-900">Lembretes</p>
                <p className="mt-0.5 text-sm text-marca-500">Água, suplementos</p>
              </Link>
            </section>
          </>
        )}
      </main>

      <BarraInferior />
    </div>
  )
}
