import { useEffect, useState, type FormEvent } from 'react'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Carregando } from '../components/Estado'
import { buscarCheckIns } from '../lib/consultas'
import { supabase } from '../lib/supabase'
import { rotuloSemana, semanaAtual } from '../lib/formato'
import type { RaioXRespostas } from '../lib/types'

const VAZIO: RaioXRespostas = {
  semana_referencia: semanaAtual(),
  peso: null,
  adesao_plano: 7,
  adesao_treino: 7,
  qualidade_sono: 7,
  nivel_energia: 7,
  nivel_estresse: 5,
  agua_litros: 2,
  dias_treino: 3,
  intestino: 'regular',
  fome: 'normal',
  vitorias: '',
  dificuldades: '',
  observacoes: '',
}

const INTESTINO = [
  { valor: 'otimo', rotulo: 'Funcionando bem todo dia' },
  { valor: 'regular', rotulo: 'Regular, com altos e baixos' },
  { valor: 'preso', rotulo: 'Preso na maior parte da semana' },
  { valor: 'solto', rotulo: 'Solto na maior parte da semana' },
]

const FOME = [
  { valor: 'baixa', rotulo: 'Pouca fome' },
  { valor: 'normal', rotulo: 'Fome normal' },
  { valor: 'alta', rotulo: 'Muita fome' },
  { valor: 'compulsao', rotulo: 'Tive episódios de descontrole' },
]

function Escala({
  id,
  rotulo,
  ajuda,
  valor,
  aoMudar,
}: {
  id: string
  rotulo: string
  ajuda?: string
  valor: number
  aoMudar: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="rotulo" htmlFor={id}>{rotulo}</label>
        <span className="text-sm font-semibold text-marca-700">{valor}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="w-full accent-marca-600"
      />
      {ajuda && <p className="mt-1 text-xs text-marca-400">{ajuda}</p>}
    </div>
  )
}

export default function CheckIn() {
  const { paciente, vinculo } = usePaciente()
  const semana = semanaAtual()

  const { dados, carregando, erro, recarregar } = useDados(
    () => buscarCheckIns(paciente.id, 8),
    [paciente.id]
  )

  const existente = dados?.find((c) => c.data?.semana_referencia === semana) ?? null

  const [form, setForm] = useState<RaioXRespostas>(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  // Quando já existe check-in da semana, o formulário abre preenchido para edição.
  useEffect(() => {
    if (existente?.data) setForm({ ...VAZIO, ...existente.data, semana_referencia: semana })
  }, [existente, semana])

  function definir<K extends keyof RaioXRespostas>(campo: K, valor: RaioXRespostas[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setSucesso(false)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErroEnvio(null)
    setSalvando(true)

    const conteudo: RaioXRespostas = {
      ...form,
      semana_referencia: semana,
      enviado_pelo_app: true,
      enviado_em: new Date().toISOString(),
    }

    const { error } = existente
      ? await supabase.from('raio_x_semanal').update({ data: conteudo }).eq('id', existente.id)
      : await supabase.from('raio_x_semanal').insert({
          patient_id: paciente.id,
          user_id: vinculo.nutri_user_id,
          data: conteudo,
        })

    setSalvando(false)

    if (error) {
      setErroEnvio(error.message)
      return
    }

    setSucesso(true)
    recarregar()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <Cabecalho titulo="Check-in da semana" subtitulo={rotuloSemana(semana)} voltar />
      <Pagina>
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && (
          <form onSubmit={enviar} className="space-y-4">
            {sucesso && (
              <Aviso tom="info">
                Check-in {existente ? 'atualizado' : 'enviado'}. Seu nutricionista já consegue ver.
              </Aviso>
            )}

            {existente && !sucesso && (
              <Aviso tom="info">
                Você já enviou o check-in desta semana. Pode ajustar e salvar de novo.
              </Aviso>
            )}

            <section className="cartao space-y-4">
              <h2 className="font-semibold text-marca-900">Números da semana</h2>

              <div>
                <label className="rotulo" htmlFor="peso">Peso de hoje (kg)</label>
                <input
                  id="peso"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  className="campo"
                  placeholder="Opcional"
                  value={form.peso ?? ''}
                  onChange={(e) => definir('peso', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="rotulo" htmlFor="agua">Água por dia (L)</label>
                  <input
                    id="agua"
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    className="campo"
                    value={form.agua_litros ?? ''}
                    onChange={(e) => definir('agua_litros', e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor="treinos">Dias de treino</label>
                  <input
                    id="treinos"
                    type="number"
                    min={0}
                    max={7}
                    inputMode="numeric"
                    className="campo"
                    value={form.dias_treino ?? ''}
                    onChange={(e) => definir('dias_treino', e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </div>
              </div>
            </section>

            <section className="cartao space-y-5">
              <h2 className="font-semibold text-marca-900">Como foi sua semana</h2>
              <Escala
                id="adesao-plano"
                rotulo="Segui o plano alimentar"
                ajuda="0 = não consegui seguir · 10 = segui inteiro"
                valor={form.adesao_plano ?? 7}
                aoMudar={(v) => definir('adesao_plano', v)}
              />
              <Escala
                id="adesao-treino"
                rotulo="Consegui treinar como combinamos"
                valor={form.adesao_treino ?? 7}
                aoMudar={(v) => definir('adesao_treino', v)}
              />
              <Escala
                id="sono"
                rotulo="Qualidade do sono"
                valor={form.qualidade_sono ?? 7}
                aoMudar={(v) => definir('qualidade_sono', v)}
              />
              <Escala
                id="energia"
                rotulo="Nível de energia no dia a dia"
                valor={form.nivel_energia ?? 7}
                aoMudar={(v) => definir('nivel_energia', v)}
              />
              <Escala
                id="estresse"
                rotulo="Nível de estresse"
                ajuda="0 = tranquila · 10 = semana muito pesada"
                valor={form.nivel_estresse ?? 5}
                aoMudar={(v) => definir('nivel_estresse', v)}
              />
            </section>

            <section className="cartao space-y-4">
              <h2 className="font-semibold text-marca-900">Corpo e apetite</h2>

              <div>
                <label className="rotulo" htmlFor="intestino">Intestino</label>
                <select
                  id="intestino"
                  className="campo"
                  value={form.intestino ?? 'regular'}
                  onChange={(e) => definir('intestino', e.target.value)}
                >
                  {INTESTINO.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="rotulo" htmlFor="fome">Fome e vontade de comer</label>
                <select
                  id="fome"
                  className="campo"
                  value={form.fome ?? 'normal'}
                  onChange={(e) => definir('fome', e.target.value)}
                >
                  {FOME.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="cartao space-y-4">
              <h2 className="font-semibold text-marca-900">Em palavras</h2>

              <div>
                <label className="rotulo" htmlFor="vitorias">O que deu certo</label>
                <textarea
                  id="vitorias"
                  className="campo min-h-[90px]"
                  placeholder="Uma conquista da semana, por menor que pareça."
                  value={form.vitorias ?? ''}
                  onChange={(e) => definir('vitorias', e.target.value)}
                />
              </div>

              <div>
                <label className="rotulo" htmlFor="dificuldades">O que travou</label>
                <textarea
                  id="dificuldades"
                  className="campo min-h-[90px]"
                  placeholder="Onde você sentiu mais dificuldade."
                  value={form.dificuldades ?? ''}
                  onChange={(e) => definir('dificuldades', e.target.value)}
                />
              </div>

              <div>
                <label className="rotulo" htmlFor="observacoes">Algo mais que queira contar</label>
                <textarea
                  id="observacoes"
                  className="campo min-h-[70px]"
                  value={form.observacoes ?? ''}
                  onChange={(e) => definir('observacoes', e.target.value)}
                />
              </div>
            </section>

            {erroEnvio && <Aviso>{erroEnvio}</Aviso>}

            <button type="submit" className="btn-primario w-full" disabled={salvando}>
              {salvando ? 'Enviando…' : existente ? 'Salvar alterações' : 'Enviar check-in'}
            </button>
          </form>
        )}
      </Pagina>
    </>
  )
}
