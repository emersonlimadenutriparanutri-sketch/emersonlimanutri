import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { PERMISSOES_PADRAO, type Paciente, type Permissoes, type PerfilNutri, type Vinculo } from '../lib/types'

type EstadoAuth = {
  carregando: boolean
  session: Session | null
  vinculo: Vinculo | null
  paciente: Paciente | null
  nutri: PerfilNutri | null
  permissoes: Permissoes | null
  /** true quando há login mas nenhum vínculo de paciente (provavelmente é um nutricionista). */
  semVinculo: boolean
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Ctx = createContext<EstadoAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [nutri, setNutri] = useState<PerfilNutri | null>(null)
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)

  const limpar = useCallback(() => {
    setVinculo(null)
    setPaciente(null)
    setNutri(null)
    setPermissoes(null)
  }, [])

  const carregarVinculo = useCallback(async (userId: string) => {
    const { data: vinculos } = await supabase
      .from('patient_users')
      .select('id, auth_user_id, patient_id, nutri_user_id, ativo')
      .eq('auth_user_id', userId)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1)

    const v = (vinculos?.[0] as Vinculo | undefined) ?? null
    setVinculo(v)

    if (!v) {
      setPaciente(null)
      setNutri(null)
      setPermissoes(null)
      return
    }

    const [{ data: pac }, { data: perfil }, { data: perms }] = await Promise.all([
      supabase
        .from('patients')
        .select('id, user_id, nome, email, telefone, status, objetivo, sexo, data_nascimento, data_entrada')
        .eq('id', v.patient_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, nome_completo, especialidade, crn, avatar_url, instagram, telefone')
        .eq('id', v.nutri_user_id)
        .maybeSingle(),
      supabase
        .from('patient_app_settings')
        .select('*')
        .eq('patient_id', v.patient_id)
        .maybeSingle(),
    ])

    setPaciente((pac as Paciente) ?? null)
    setNutri((perfil as PerfilNutri) ?? null)
    setPermissoes(
      (perms as Permissoes) ?? { patient_id: v.patient_id, ...PERMISSOES_PADRAO }
    )
  }, [])

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session?.user) {
      await carregarVinculo(data.session.user.id)
    } else {
      limpar()
    }
  }, [carregarVinculo, limpar])

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSession(data.session)
      if (data.session?.user) await carregarVinculo(data.session.user.id)
      if (ativo) setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, nova) => {
      if (!ativo) return
      setSession(nova)
      if (evento === 'SIGNED_OUT' || !nova?.user) {
        limpar()
        return
      }
      // TOKEN_REFRESHED não muda quem é o usuário; evita recarga desnecessária.
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') {
        await carregarVinculo(nova.user.id)
      }
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [carregarVinculo, limpar])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    limpar()
  }, [limpar])

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      session,
      vinculo,
      paciente,
      nutri,
      permissoes,
      semVinculo: !!session && !vinculo,
      recarregar,
      sair,
    }),
    [carregando, session, vinculo, paciente, nutri, permissoes, recarregar, sair]
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

/** Atalho para telas que só rodam com paciente vinculado. */
export function usePaciente() {
  const { paciente, vinculo, permissoes } = useAuth()
  if (!paciente || !vinculo) {
    throw new Error('Tela de paciente renderizada sem vínculo carregado')
  }
  return { paciente, vinculo, permissoes: permissoes ?? { patient_id: paciente.id, ...PERMISSOES_PADRAO } }
}
