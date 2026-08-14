import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDados } from '../../hooks/useDados'
import { Aviso, Carregando, Vazio } from '../../components/Estado'
import { supabase } from '../../lib/supabase'
import { quando } from '../../lib/formato'
import type { Mensagem } from '../../lib/types'

type Conversa = {
  patientId: string
  nome: string
  ultima: Mensagem
  naoLidas: number
}

export default function NutriConversas() {
  const { session } = useAuth()
  const [aberta, setAberta] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const { data: msgs, error } = await supabase
      .from('patient_messages')
      .select('id, user_id, patient_id, autor, corpo, anexo_url, anexo_tipo, lida_em, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw new Error(error.message)

    const lista = (msgs as Mensagem[]) ?? []
    if (lista.length === 0) return [] as Conversa[]

    const ids = Array.from(new Set(lista.map((m) => m.patient_id)))
    const { data: pacientes } = await supabase
      .from('patients')
      .select('id, nome')
      .in('id', ids)

    const nomes: Record<string, string> = {}
    for (const p of (pacientes as Array<{ id: string; nome: string }>) ?? []) nomes[p.id] = p.nome

    const porPaciente: Record<string, Conversa> = {}
    for (const m of lista) {
      const atual = porPaciente[m.patient_id]
      if (!atual) {
        porPaciente[m.patient_id] = {
          patientId: m.patient_id,
          nome: nomes[m.patient_id] ?? 'Paciente',
          ultima: m,
          naoLidas: m.autor === 'paciente' && !m.lida_em ? 1 : 0,
        }
      } else {
        if (m.autor === 'paciente' && !m.lida_em) atual.naoLidas += 1
      }
    }

    return Object.values(porPaciente).sort((a, b) =>
      b.ultima.created_at.localeCompare(a.ultima.created_at)
    )
  }, [session?.user.id])

  async function abrir(conversa: Conversa) {
    setAberta(conversa)
    setCarregandoConversa(true)
    setErroEnvio(null)

    const { data, error } = await supabase
      .from('patient_messages')
      .select('id, user_id, patient_id, autor, corpo, anexo_url, anexo_tipo, lida_em, created_at')
      .eq('patient_id', conversa.patientId)
      .order('created_at', { ascending: true })

    setCarregandoConversa(false)

    if (error) {
      setErroEnvio(error.message)
      return
    }

    const lista = (data as Mensagem[]) ?? []
    setMensagens(lista)

    const naoLidas = lista.filter((m) => m.autor === 'paciente' && !m.lida_em).map((m) => m.id)
    if (naoLidas.length > 0) {
      await supabase
        .from('patient_messages')
        .update({ lida_em: new Date().toISOString() })
        .in('id', naoLidas)
      recarregar()
    }
  }

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function responder(e: FormEvent) {
    e.preventDefault()
    const corpo = texto.trim()
    if (!corpo || !aberta || enviando) return

    setEnviando(true)
    setErroEnvio(null)

    const { data, error } = await supabase
      .from('patient_messages')
      .insert({
        patient_id: aberta.patientId,
        user_id: session!.user.id,
        autor: 'nutri',
        corpo,
      })
      .select()
      .single()

    setEnviando(false)

    if (error) {
      setErroEnvio(error.message)
      return
    }

    setTexto('')
    setMensagens((atual) => [...atual, data as Mensagem])
    recarregar()
  }

  if (aberta) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-marca-100 bg-areia-50/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
            <button
              type="button"
              onClick={() => { setAberta(null); setMensagens([]) }}
              className="-ml-1 rounded-lg p-1.5 text-marca-700 hover:bg-marca-50"
              aria-label="Voltar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <h1 className="truncate text-lg font-semibold text-marca-900">{aberta.nome}</h1>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-2.5 px-4 py-4 pb-28">
          {carregandoConversa && <Carregando />}
          {mensagens.map((m) => {
            const minha = m.autor === 'nutri'
            return (
              <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    minha
                      ? 'rounded-br-md bg-marca-700 text-white'
                      : 'rounded-bl-md bg-white text-marca-900 ring-1 ring-marca-100'
                  }`}
                >
                  {m.anexo_url && (
                    <a href={m.anexo_url} target="_blank" rel="noreferrer" className="mb-2 block">
                      <img src={m.anexo_url} alt="Anexo" className="max-h-64 rounded-xl object-cover" />
                    </a>
                  )}
                  {m.corpo && <p className="whitespace-pre-line text-sm leading-relaxed">{m.corpo}</p>}
                  <p className={`mt-1 text-[11px] ${minha ? 'text-marca-200' : 'text-marca-400'}`}>
                    {quando(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={fim} />
        </div>

        <form onSubmit={responder} className="fixed inset-x-0 bottom-0 border-t border-marca-100 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Responder…"
              rows={1}
              className="campo max-h-32 min-h-[46px] resize-none py-3"
            />
            <button type="submit" className="btn-primario shrink-0 px-4 py-3" disabled={!texto.trim() || enviando}>
              Enviar
            </button>
          </div>
          {erroEnvio && <div className="mx-auto max-w-3xl px-4 pb-2"><Aviso>{erroEnvio}</Aviso></div>}
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-marca-100 bg-areia-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3.5">
          <h1 className="flex-1 text-lg font-semibold text-marca-900">Conversas</h1>
          <Link to="/nutri" className="btn-secundario px-3 py-2 text-sm">Pacientes</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-4">
        {carregando && <Carregando />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && !erro && (
          (dados ?? []).length === 0 ? (
            <Vazio
              titulo="Nenhuma conversa ainda"
              descricao="Quando um paciente escrever pelo app, a conversa aparece aqui."
            />
          ) : (
            dados!.map((conversa) => (
              <button
                key={conversa.patientId}
                type="button"
                onClick={() => abrir(conversa)}
                className="cartao flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-marca-900">{conversa.nome}</p>
                  <p className="truncate text-sm text-marca-500">
                    {conversa.ultima.autor === 'nutri' ? 'Você: ' : ''}
                    {conversa.ultima.corpo ?? 'Anexo'}
                  </p>
                  <p className="mt-0.5 text-xs text-marca-400">{quando(conversa.ultima.created_at)}</p>
                </div>
                {conversa.naoLidas > 0 && (
                  <span className="selo shrink-0 bg-marca-700 text-white">{conversa.naoLidas}</span>
                )}
              </button>
            ))
          )
        )}
      </main>
    </div>
  )
}
