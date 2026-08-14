import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushDisponivel(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID
  )
}

function base64ParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const normalizado = preenchido.replace(/-/g, '+').replace(/_/g, '/')
  const bruto = window.atob(normalizado)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

/**
 * Registra este dispositivo para receber push. A inscrição fica guardada em
 * push_subscriptions; o envio em si é feito por uma Edge Function (ver README).
 */
export async function ativarPush(patientId: string): Promise<void> {
  if (!pushDisponivel()) throw new Error('Este navegador não suporta notificações push.')

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Permissão de notificação negada.')

  const registro = await navigator.serviceWorker.ready

  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaBytes(VAPID!),
    }))

  const bruta = inscricao.toJSON()
  const { data: sessao } = await supabase.auth.getUser()
  if (!sessao.user) throw new Error('Sessão expirada.')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      auth_user_id: sessao.user.id,
      patient_id: patientId,
      endpoint: inscricao.endpoint,
      p256dh: bruta.keys?.p256dh ?? '',
      auth_key: bruta.keys?.auth ?? '',
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  )

  if (error) throw new Error(error.message)
}

export async function desativarPush(): Promise<void> {
  const registro = await navigator.serviceWorker.ready
  const inscricao = await registro.pushManager.getSubscription()
  if (!inscricao) return

  await supabase.from('push_subscriptions').delete().eq('endpoint', inscricao.endpoint)
  await inscricao.unsubscribe()
}

export async function pushAtivo(): Promise<boolean> {
  if (!pushDisponivel() || Notification.permission !== 'granted') return false
  const registro = await navigator.serviceWorker.ready
  return !!(await registro.pushManager.getSubscription())
}
