import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Bloqueado, Carregando, Vazio } from '../components/Estado'
import { Markdown } from '../components/Markdown'
import { buscarAvaliacoes, buscarCheckIns, buscarRelatorios } from '../lib/consultas'
import { dataCurta, dataLonga, diferenca, numero } from '../lib/formato'
import type { Avaliacao } from '../lib/types'

type Metrica = {
  chave: keyof Avaliacao
  rotulo: string
  unidade: string
  casas: number
}

const METRICAS: Metrica[] = [
  { chave: 'peso', rotulo: 'Peso', unidade: 'kg', casas: 1 },
  { chave: 'percentual_gordura', rotulo: 'Gordura', unidade: '%', casas: 1 },
  { chave: 'massa_magra', rotulo: 'Massa magra', unidade: 'kg', casas: 1 },
  { chave: 'cintura', rotulo: 'Cintura', unidade: 'cm', casas: 1 },
  { chave: 'imc', rotulo: 'IMC', unidade: '', casas: 1 },
  { chave: 'shaped_score', rotulo: 'Shaped Score', unidade: '', casas: 0 },
]

function Grafico({ avaliacoes, metrica }: { avaliacoes: Avaliacao[]; metrica: Metrica }) {
  const pontos = avaliacoes
    .map((a) => ({ data: dataCurta(a.data_avaliacao), valor: a[metrica.chave] as number | null }))
    .filter((p) => p.valor !== null && p.valor !== undefined)

  if (pontos.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-marca-400">
        O gráfico aparece a partir da segunda avaliação.
      </p>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pontos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#e2ecdb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#7ea564' }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#7ea564' }}
            tickLine={false}
            axisLine={false}
            domain={['dataMin - 2', 'dataMax + 2']}
          />
          <Tooltip
            formatter={(v: number) => [`${numero(v, metrica.casas)} ${metrica.unidade}`.trim(), metrica.rotulo]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2ecdb', fontSize: 13 }}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke="#4a6e35"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#4a6e35' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Evolucao() {
  const { paciente, permissoes } = usePaciente()
  const [metrica, setMetrica] = useState<Metrica>(METRICAS[0])
  const [relatorioAberto, setRelatorioAberto] = useState<string | null>(null)

  const { dados, carregando, erro } = useDados(async () => {
    const [avaliacoes, relatorios, checkins] = await Promise.all([
      buscarAvaliacoes(paciente.id),
      permissoes.ver_relatorios ? buscarRelatorios(paciente.id) : Promise.resolve([]),
      buscarCheckIns(paciente.id, 12),
    ])
    return { avaliacoes, relatorios, checkins }
  }, [paciente.id])

  if (!permissoes.ver_evolucao) {
    return (
      <>
        <Cabecalho titulo="Minha evolução" voltar />
        <Pagina><Bloqueado recurso="Sua evolução" /></Pagina>
      </>
    )
  }

  const avaliacoes = dados?.avaliacoes ?? []
  const primeira = avaliacoes[0]
  const ultima = avaliacoes[avaliacoes.length - 1]

  // Peso reportado no check-in semanal complementa as avaliações formais.
  const pesosCheckin = (dados?.checkins ?? [])
    .filter((c) => typeof c.data?.peso === 'number')
    .map((c) => ({ semana: c.data!.semana_referencia, peso: c.data!.peso as number }))
    .reverse()

  return (
    <>
      <Cabecalho titulo="Minha evolução" voltar />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          <div className="space-y-4">
            {avaliacoes.length === 0 ? (
              <Vazio
                titulo="Nenhuma avaliação registrada ainda"
                descricao="Depois da sua primeira avaliação física, os gráficos aparecem aqui."
              />
            ) : (
              <>
                {primeira && ultima && primeira.id !== ultima.id && (
                  <section className="cartao">
                    <h2 className="font-semibold text-marca-900">Do começo até agora</h2>
                    <p className="mt-0.5 text-sm text-marca-500">
                      {dataLonga(primeira.data_avaliacao)} → {dataLonga(ultima.data_avaliacao)}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                      {(['peso', 'percentual_gordura', 'cintura'] as const).map((campo) => {
                        const delta = diferenca(ultima[campo], primeira[campo])
                        const rotulos = { peso: 'Peso', percentual_gordura: 'Gordura', cintura: 'Cintura' }
                        return (
                          <div key={campo}>
                            <p className="text-xs text-marca-400">{rotulos[campo]}</p>
                            <p className="text-lg font-semibold text-marca-900">{delta ?? '—'}</p>
                            <p className="text-xs text-marca-500">
                              agora {numero(ultima[campo], 1)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section className="cartao">
                  <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
                    {METRICAS.filter((m) => avaliacoes.some((a) => a[m.chave] !== null)).map((m) => (
                      <button
                        key={m.chave}
                        type="button"
                        onClick={() => setMetrica(m)}
                        className={`selo shrink-0 ${
                          metrica.chave === m.chave
                            ? 'bg-marca-700 text-white'
                            : 'bg-marca-50 text-marca-700 ring-1 ring-marca-100'
                        }`}
                      >
                        {m.rotulo}
                      </button>
                    ))}
                  </div>
                  <Grafico avaliacoes={avaliacoes} metrica={metrica} />
                </section>

                <section className="cartao">
                  <h2 className="font-semibold text-marca-900">Avaliações</h2>
                  <ul className="mt-2 divide-y divide-marca-100">
                    {[...avaliacoes].reverse().map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-marca-800">{dataLonga(a.data_avaliacao)}</p>
                          {a.observacoes && (
                            <p className="truncate text-xs text-marca-500">{a.observacoes}</p>
                          )}
                        </div>
                        <p className="shrink-0 text-sm text-marca-600">
                          {numero(a.peso, 1, ' kg')} · {numero(a.percentual_gordura, 1, '%')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {pesosCheckin.length > 0 && (
              <section className="cartao">
                <h2 className="font-semibold text-marca-900">Peso que você registrou nos check-ins</h2>
                <ul className="mt-2 divide-y divide-marca-100">
                  {pesosCheckin.slice(-8).reverse().map((p) => (
                    <li key={p.semana} className="flex justify-between py-2 text-sm">
                      <span className="text-marca-600">{dataCurta(p.semana)}</span>
                      <span className="font-medium text-marca-800">{numero(p.peso, 1, ' kg')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {permissoes.ver_relatorios && (dados?.relatorios.length ?? 0) > 0 && (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                  Relatórios do seu nutricionista
                </h2>
                {dados!.relatorios.map((r) => {
                  const aberto = relatorioAberto === r.id
                  return (
                    <article key={r.id} className="cartao">
                      <button
                        type="button"
                        onClick={() => setRelatorioAberto(aberto ? null : r.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-marca-900">{r.titulo}</p>
                          <p className="text-sm text-marca-500">{dataLonga(r.report_date ?? r.created_at)}</p>
                        </div>
                        <span className="shrink-0 text-sm text-marca-500">{aberto ? 'fechar' : 'abrir'}</span>
                      </button>
                      {aberto && (
                        <div className="mt-3 border-t border-marca-100 pt-3">
                          <Markdown texto={r.conteudo} />
                        </div>
                      )}
                    </article>
                  )
                })}
              </section>
            )}

            {permissoes.ver_exames && (
              <Link to="/exames" className="cartao flex items-center justify-between">
                <div>
                  <p className="font-medium text-marca-900">Meus exames</p>
                  <p className="text-sm text-marca-500">Análises liberadas pelo seu nutricionista</p>
                </div>
                <span className="text-marca-500">→</span>
              </Link>
            )}
          </div>
        )}
      </Pagina>
    </>
  )
}
