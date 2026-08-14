import { useRef, useState, type FormEvent } from 'react'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Bloqueado, Carregando, Vazio } from '../components/Estado'
import { supabase } from '../lib/supabase'
import { buscarDiario } from '../lib/consultas'
import { NOMES_REFEICAO, dataLonga } from '../lib/formato'
import type { RegistroDiario } from '../lib/types'

const REFEICOES = Object.entries(NOMES_REFEICAO)

function agora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Diario() {
  const { paciente, vinculo, permissoes } = usePaciente()
  const inputFoto = useRef<HTMLInputElement>(null)

  const { dados, carregando, erro, recarregar } = useDados(
    () => (permissoes.diario_ativo ? buscarDiario(paciente.id) : Promise.resolve([])),
    [paciente.id, permissoes.diario_ativo]
  )

  const [aberto, setAberto] = useState(false)
  const [refeicao, setRefeicao] = useState('almoco')
  const [descricao, setDescricao] = useState('')
  const [horario, setHorario] = useState(agora())
  const [data, setData] = useState(hoje())
  const [fome, setFome] = useState(5)
  const [saciedade, setSaciedade] = useState(5)
  const [contexto, setContexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)

  function limpar() {
    setDescricao('')
    setContexto('')
    setFoto(null)
    setHorario(agora())
    setFome(5)
    setSaciedade(5)
    if (inputFoto.current) inputFoto.current.value = ''
  }

  async function enviarFoto(): Promise<string | null> {
    if (!foto) return null

    const extensao = foto.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const caminho = `${paciente.id}/${Date.now()}.${extensao}`

    const { error } = await supabase.storage
      .from('paciente-diario')
      .upload(caminho, foto, { cacheControl: '3600', upsert: false })

    if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`)

    const { data: publica } = supabase.storage.from('paciente-diario').getPublicUrl(caminho)
    return publica.publicUrl
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErroEnvio(null)
    setSalvando(true)

    try {
      const fotoUrl = await enviarFoto()

      const { error } = await supabase.from('diario_alimentar').insert({
        patient_id: paciente.id,
        user_id: vinculo.nutri_user_id,
        data,
        horario,
        refeicao,
        descricao: descricao.trim() || null,
        foto_url: fotoUrl,
        fome_antes: fome,
        saciedade,
        contexto: contexto.trim() || null,
      })

      if (error) throw new Error(error.message)

      limpar()
      setAberto(false)
      recarregar()
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  if (!permissoes.diario_ativo) {
    return (
      <>
        <Cabecalho titulo="Diário alimentar" voltar />
        <Pagina><Bloqueado recurso="O diário alimentar" /></Pagina>
      </>
    )
  }

  // Agrupa por dia para o histórico ficar legível.
  const porDia = (dados ?? []).reduce<Record<string, RegistroDiario[]>>((acc, registro) => {
    ;(acc[registro.data] ??= []).push(registro)
    return acc
  }, {})

  return (
    <>
      <Cabecalho
        titulo="Diário alimentar"
        voltar
        acao={
          <button type="button" className="btn-primario px-3 py-2 text-sm" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Fechar' : 'Registrar'}
          </button>
        }
      />
      <Pagina>
        {aberto && (
          <form onSubmit={salvar} className="cartao mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="rotulo" htmlFor="data">Dia</label>
                <input
                  id="data"
                  type="date"
                  className="campo"
                  value={data}
                  max={hoje()}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div>
                <label className="rotulo" htmlFor="horario">Hora</label>
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
              <label className="rotulo" htmlFor="refeicao">Refeição</label>
              <select
                id="refeicao"
                className="campo"
                value={refeicao}
                onChange={(e) => setRefeicao(e.target.value)}
              >
                {REFEICOES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo" htmlFor="descricao">O que você comeu</label>
              <textarea
                id="descricao"
                className="campo min-h-[90px]"
                placeholder="Arroz, feijão, frango grelhado e salada."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="foto">Foto do prato (opcional)</label>
              <input
                id="foto"
                ref={inputFoto}
                type="file"
                accept="image/*"
                capture="environment"
                className="campo file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-1.5 file:text-sm file:text-marca-700"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="rotulo" htmlFor="fome">Fome antes: {fome}</label>
                <input
                  id="fome"
                  type="range"
                  min={0}
                  max={10}
                  value={fome}
                  onChange={(e) => setFome(Number(e.target.value))}
                  className="w-full accent-marca-600"
                />
              </div>
              <div>
                <label className="rotulo" htmlFor="saciedade">Saciedade depois: {saciedade}</label>
                <input
                  id="saciedade"
                  type="range"
                  min={0}
                  max={10}
                  value={saciedade}
                  onChange={(e) => setSaciedade(Number(e.target.value))}
                  className="w-full accent-marca-600"
                />
              </div>
            </div>

            <div>
              <label className="rotulo" htmlFor="contexto">Como você estava se sentindo</label>
              <input
                id="contexto"
                type="text"
                className="campo"
                placeholder="Correria, ansiedade, tranquila…"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
              />
            </div>

            {erroEnvio && <Aviso>{erroEnvio}</Aviso>}

            <button type="submit" className="btn-primario w-full" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar registro'}
            </button>
          </form>
        )}

        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          Object.keys(porDia).length === 0 ? (
            <Vazio
              titulo="Seu diário está vazio"
              descricao="Registrar as refeições ajuda seu nutricionista a enxergar o seu dia real, não o dia ideal."
              acao={
                <button type="button" className="btn-primario" onClick={() => setAberto(true)}>
                  Fazer o primeiro registro
                </button>
              }
            />
          ) : (
            <div className="space-y-5">
              {Object.entries(porDia).map(([dia, registros]) => (
                <section key={dia}>
                  <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-marca-500">
                    {dataLonga(dia)}
                  </h2>
                  <div className="space-y-3">
                    {registros.map((r) => (
                      <article key={r.id} className="cartao">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-medium text-marca-900">
                            {NOMES_REFEICAO[r.refeicao ?? ''] ?? 'Refeição'}
                          </p>
                          <p className="shrink-0 text-sm text-marca-500">{r.horario?.slice(0, 5) ?? ''}</p>
                        </div>

                        {r.foto_url && (
                          <img
                            src={r.foto_url}
                            alt=""
                            loading="lazy"
                            className="mt-2 max-h-60 w-full rounded-xl object-cover"
                          />
                        )}

                        {r.descricao && <p className="mt-2 text-sm text-marca-700">{r.descricao}</p>}

                        {(r.fome_antes !== null || r.contexto) && (
                          <p className="mt-2 text-xs text-marca-500">
                            {r.fome_antes !== null && `Fome ${r.fome_antes}/10`}
                            {r.saciedade !== null && ` · saciedade ${r.saciedade}/10`}
                            {r.contexto && ` · ${r.contexto}`}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        )}
      </Pagina>
    </>
  )
}
