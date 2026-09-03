import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Falso quando o .env ainda não foi preenchido — o app mostra a tela de setup. */
export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

export const funcoesUrl = url ? `${url}/functions/v1` : "";
