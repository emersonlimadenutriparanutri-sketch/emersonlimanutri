import { useState } from 'react'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Bloqueado, Carregando, Vazio } from '../components/Estado'
import { Markdown } from '../components/Markdown'
import { supabase } from '../lib/supabase'
import { dataLonga } from '../lib/formato'

type Analise = {
  id?: string
  date?: string
  perfil?: string
  analiseClinica?: string
  observacoesFinais?: string
  condutaExames?: string
  aiReport?: string
  marcadores?: Record<string, string> | null
}

type LinhaExame = {
  id: string
  created_at: string
  analises: Analise[] | null
}

function Marcadores({ valores }: { valores: Record<string, string> }) {
  const itens = Object.entries(valores).filter(([, v]) => v !== null && v !== '')
  if (itens.length === 0) return null

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-marca-500">Valores</h4>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {itens.map(([chave, valor]) => (
          <div key={chave} className="flex items-baseline justify-between gap-2 border-b border-marca-50 py-1">
            <dt className="truncate text-xs uppercase text-marca-500">{chave}</dt>
            <dd className="shrink-0 text-sm font-medium text-marca-800">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function Exames() {
  const { paciente, permissoes } = usePaciente()
  const [tecnicoAberto, setTecnicoAberto] = useState<string | null>(null)

  const { dados, carregando, erro } = useDados(async () => {
    const { data, error } = await supabase.rpc('meus_exames', { p_patient_id: paciente.id })
    if (error) throw new Error(error.message)
    return (data as LinhaExame[]) ?? []
  }, [paciente.id])

  if (!permissoes.ver_exames) {
    return (
      <>
        <Cabecalho titulo="Meus exames" voltar />
        <Pagina><Bloqueado recurso="Seus exames" /></Pagina>
      </>
    )
  }

  const analises = (dados ?? []).flatMap((linha) =>
    (linha.analises ?? []).map((a, i) => ({ ...a, chave: `${linha.id}-${a.id ?? i}` }))
  )

  return (
    <>
      <Cabecalho titulo="Meus exames" voltar />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          analises.length === 0 ? (
            <Vazio
              titulo="Nenhuma análise por aqui ainda"
              descricao="Quando seu nutricionista liberar a análise dos seus exames, ela aparece nesta tela."
            />
          ) : (
            <div className="space-y-4">
              <Aviso tom="info">
                Esta é a leitura do seu nutricionista sobre os seus exames. Qualquer dúvida sobre um
                valor, traga na conversa — não use esta tela para se autodiagnosticar.
              </Aviso>

              {analises.map((analise) => (
                <article key={analise.chave} className="cartao">
                  <h2 className="font-semibold text-marca-900">
                    Análise de {analise.date ? dataLonga(analise.date) : 'data não informada'}
                  </h2>

                  {analise.analiseClinica && (
                    <div className="mt-3">
                      <Markdown texto={analise.analiseClinica} />
                    </div>
                  )}

                  {analise.observacoesFinais && (
                    <div className="mt-3 rounded-xl bg-marca-50 p-3">
                      <h3 className="text-sm font-semibold text-marca-800">Observações</h3>
                      <div className="mt-1">
                        <Markdown texto={analise.observacoesFinais} />
                      </div>
                    </div>
                  )}

                  {analise.condutaExames && (
                    <div className="mt-3">
                      <h3 className="text-sm font-semibold text-marca-800">Conduta</h3>
                      <div className="mt-1">
                        <Markdown texto={analise.condutaExames} />
                      </div>
                    </div>
                  )}

                  {analise.marcadores && <Marcadores valores={analise.marcadores} />}

                  {analise.aiReport && (
                    <div className="mt-3 border-t border-marca-100 pt-3">
                      <button
                        type="button"
                        className="btn-texto -ml-2"
                        onClick={() =>
                          setTecnicoAberto(tecnicoAberto === analise.chave ? null : analise.chave)
                        }
                      >
                        {tecnicoAberto === analise.chave
                          ? 'Ocultar relatório completo'
                          : 'Ver relatório completo'}
                      </button>
                      {tecnicoAberto === analise.chave && (
                        <div className="mt-2">
                          <Markdown texto={analise.aiReport} />
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        )}
      </Pagina>
    </>
  )
}
