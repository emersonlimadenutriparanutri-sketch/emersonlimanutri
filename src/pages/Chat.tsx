import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth, usePaciente } from '../contexts/AuthContext'
import { BarraInferior, Cabecalho } from '../components/Layout'
import { Aviso, Bloqueado, Carregando } from '../components/Estado'
import { supabase } from '../lib/supabase'
import { buscarMensagens } from '../lib/consultas'
import { quando } from '../lib/formato'
import type { Mensagem } from '../lib/types'

export default function Chat() {
  const { paciente, vinculo, permissoes } = usePaciente()
  const { nutri } = useAuth()

  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  const marcarLidas = useCallback(async (lista: Mensagem[]) => {
    const naoLidas = lista.filter((m) => m.autor === 'nutri' && !m.lida_em).map((m) => m.id)
    if (naoLidas.length === 0) return
    await supabase
      .from('patient_messages')
      .update({ lida_em: new Date().toISOString() })
      .in('id', naoLidas)
  }, [])

  useEffect(() => {
    if (!permissoes.chat_ativo) {
      setCarregando(false)
      return
    }

    let ativo = true

    buscarMensagens(paciente.id)
      .then((lista) => {
        if (!ativo) return
        setMensagens(lista)
        void marcarLidas(lista)
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir a conversa.')
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    // Realtime: mensagens do nutri chegam sem precisar recarregar a tela.
    const canal = supabase
      .channel(`conversa-${paciente.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patient_messages',
          filter: `patient_id=eq.${paciente.id}`,
        },
        (payload) => {
          const nova = payload.new as Mensagem
          setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]))
          if (nova.autor === 'nutri') void marcarLidas([nova])
        }
      )
      .subscribe()

    return () => {
      ativo = false
      void supabase.removeChannel(canal)
    }
  }, [paciente.id, permissoes.chat_ativo, marcarLidas])

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const corpo = texto.trim()
    if (!corpo || enviando) return

    setEnviando(true)
    setErro(null)

    const { data, error } = await supabase
      .from('patient_messages')
      .insert({
        patient_id: paciente.id,
        user_id: vinculo.nutri_user_id,
        autor: 'paciente',
        corpo,
      })
      .select()
      .single()

    setEnviando(false)

    if (error) {
      setErro(error.message)
      return
    }

    setTexto('')
    const nova = data as Mensagem
    setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]))
  }

  if (!permissoes.chat_ativo) {
    return (
      <>
        <Cabecalho titulo="Conversa" />
        <div className="mx-auto max-w-2xl px-4 py-4 pb-nav">
          <Bloqueado recurso="A conversa" />
        </div>
        <BarraInferior />
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo={nutri?.nome_completo ?? 'Meu nutricionista'}
        subtitulo="As respostas podem levar algumas horas"
      />

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))]">
        {carregando && <Carregando texto="Abrindo a conversa…" />}
        {erro && <Aviso>{erro}</Aviso>}

        {!carregando && mensagens.length === 0 && (
          <div className="cartao text-center">
            <p className="font-medium text-marca-800">Nenhuma mensagem ainda</p>
            <p className="mt-1 text-sm text-marca-500">
              Este é o canal direto com seu nutricionista. Escreva o que precisar.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {mensagens.map((m) => {
            const minha = m.autor === 'paciente'
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
      </div>

      <form
        onSubmit={enviar}
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-marca-100 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-4 py-2.5">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void enviar(e as unknown as FormEvent)
              }
            }}
            placeholder="Escreva sua mensagem…"
            rows={1}
            className="campo max-h-32 min-h-[46px] resize-none py-3"
          />
          <button
            type="submit"
            disabled={!texto.trim() || enviando}
            className="btn-primario shrink-0 px-4 py-3"
            aria-label="Enviar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
            </svg>
          </button>
        </div>
      </form>

      <BarraInferior />
    </div>
  )
}
