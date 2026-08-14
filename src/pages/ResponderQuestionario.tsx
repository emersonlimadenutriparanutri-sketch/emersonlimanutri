import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePaciente } from '../contexts/AuthContext'
import { useDados } from '../hooks/useDados'
import { Cabecalho, Pagina } from '../components/Layout'
import { Aviso, Carregando, Vazio } from '../components/Estado'
import { buscarQuestionarios } from '../lib/consultas'
import { supabase } from '../lib/supabase'
import type { Pergunta } from '../lib/types'

type Valor = string | number | string[] | undefined

function Campo({
  pergunta,
  valor,
  aoMudar,
}: {
  pergunta: Pergunta
  valor: Valor
  aoMudar: (v: Valor) => void
}) {
  const id = `p-${pergunta.id}`

  switch (pergunta.type) {
    case 'section':
      return (
        <div className="pt-3">
          <h2 className="text-base font-semibold text-marca-900">{pergunta.text}</h2>
          {pergunta.description && (
            <p className="mt-1 text-sm leading-relaxed text-marca-500">{pergunta.description}</p>
          )}
        </div>
      )

    case 'long':
      return (
        <textarea
          id={id}
          className="campo min-h-[110px]"
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
          required={pergunta.required}
        />
      )

    case 'number':
      return (
        <input
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          className="campo"
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
          required={pergunta.required}
        />
      )

    case 'date':
      return (
        <input
          id={id}
          type="date"
          className="campo"
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
          required={pergunta.required}
        />
      )

    case 'scale': {
      const atual = typeof valor === 'number' ? valor : 3
      return (
        <div>
          <input
            id={id}
            type="range"
            min={1}
            max={5}
            step={1}
            value={atual}
            onChange={(e) => aoMudar(Number(e.target.value))}
            className="w-full accent-marca-600"
          />
          <div className="flex justify-between text-xs text-marca-400">
            <span>1</span>
            <span className="font-semibold text-marca-700">{atual}</span>
            <span>5</span>
          </div>
        </div>
      )
    }

    case 'single':
      return (
        <div className="space-y-2">
          {(pergunta.options ?? []).map((opcao) => (
            <label
              key={opcao.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                valor === opcao.id
                  ? 'border-marca-500 bg-marca-50 text-marca-900'
                  : 'border-marca-200 text-marca-700'
              }`}
            >
              <input
                type="radio"
                name={id}
                value={opcao.id}
                checked={valor === opcao.id}
                onChange={() => aoMudar(opcao.id)}
                className="h-4 w-4 accent-marca-600"
              />
              {opcao.label}
            </label>
          ))}
        </div>
      )

    case 'multiple': {
      const marcados = Array.isArray(valor) ? valor : []
      return (
        <div className="space-y-2">
          {(pergunta.options ?? []).map((opcao) => {
            const marcado = marcados.includes(opcao.id)
            return (
              <label
                key={opcao.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                  marcado ? 'border-marca-500 bg-marca-50 text-marca-900' : 'border-marca-200 text-marca-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() =>
                    aoMudar(marcado ? marcados.filter((m) => m !== opcao.id) : [...marcados, opcao.id])
                  }
                  className="h-4 w-4 rounded accent-marca-600"
                />
                {opcao.label}
              </label>
            )
          })}
        </div>
      )
    }

    case 'short':
    default:
      return (
        <input
          id={id}
          type="text"
          className="campo"
          value={(valor as string) ?? ''}
          onChange={(e) => aoMudar(e.target.value)}
          required={pergunta.required}
        />
      )
  }
}

export default function ResponderQuestionario() {
  const { envioId = '' } = useParams()
  const { paciente } = usePaciente()
  const navigate = useNavigate()

  const { dados, carregando, erro } = useDados(
    () => buscarQuestionarios(paciente.id),
    [paciente.id]
  )

  const [respostas, setRespostas] = useState<Record<string, Valor>>({})
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)

  const envio = dados?.envios.find((e) => e.id === envioId)
  const modelo = envio ? dados?.modelos[envio.modelo_id] : undefined

  const perguntas = useMemo(() => modelo?.perguntas ?? [], [modelo])

  const faltando = useMemo(
    () =>
      perguntas.filter((p) => {
        if (p.type === 'section' || !p.required) return false
        const v = respostas[p.id]
        if (Array.isArray(v)) return v.length === 0
        return v === undefined || v === ''
      }),
    [perguntas, respostas]
  )

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErroEnvio(null)

    if (faltando.length > 0) {
      setErroEnvio(`Faltou responder: ${faltando.map((p) => p.text).join(', ')}`)
      return
    }

    setEnviando(true)

    const limpas: Record<string, unknown> = {}
    for (const [chave, valor] of Object.entries(respostas)) {
      if (valor === undefined || valor === '') continue
      if (Array.isArray(valor) && valor.length === 0) continue
      limpas[chave] = valor
    }

    const { error } = await supabase.from('questionario_respostas').insert({
      envio_id: envioId,
      patient_id: paciente.id,
      respostas: limpas,
      respondido_em: new Date().toISOString(),
    })

    if (error) {
      setErroEnvio(error.message)
      setEnviando(false)
      return
    }

    // Melhor esforço: se a policy de update não permitir, a resposta já foi salva.
    await supabase.from('questionario_envios').update({ status: 'respondido' }).eq('id', envioId)

    navigate('/questionarios', { replace: true })
  }

  if (carregando) return <Carregando />

  if (erro || !envio || !modelo) {
    return (
      <>
        <Cabecalho titulo="Questionário" voltar />
        <Pagina>
          {erro ? <Aviso>{erro}</Aviso> : (
            <Vazio
              titulo="Questionário não encontrado"
              descricao="Ele pode ter sido removido pelo seu nutricionista."
            />
          )}
        </Pagina>
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo={modelo.nome} voltar />
      <Pagina>
        <form onSubmit={enviar} className="space-y-4">
          <div className="cartao space-y-5">
            {perguntas.map((pergunta) => (
              <div key={pergunta.id}>
                {pergunta.type !== 'section' && (
                  <label className="rotulo" htmlFor={`p-${pergunta.id}`}>
                    {pergunta.text}
                    {pergunta.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                )}
                {pergunta.type !== 'section' && pergunta.description && (
                  <p className="mb-1.5 text-xs text-marca-500">{pergunta.description}</p>
                )}
                <Campo
                  pergunta={pergunta}
                  valor={respostas[pergunta.id]}
                  aoMudar={(v) => setRespostas((atual) => ({ ...atual, [pergunta.id]: v }))}
                />
              </div>
            ))}
          </div>

          {erroEnvio && <Aviso>{erroEnvio}</Aviso>}

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar respostas'}
          </button>
        </form>
      </Pagina>
    </>
  )
}
