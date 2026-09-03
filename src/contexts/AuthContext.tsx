import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseConfigurado } from "@/lib/supabase";
import type { Perfil } from "@/types/db";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  isAdmin: boolean;
  features: string[];
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  cadastrar: (email: string, senha: string, nome: string) => Promise<void>;
  entrarComGoogle: () => Promise<void>;
  recuperarSenha: (email: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<Session | null>(null);
  const [perfil, setPerfil] = React.useState<Perfil | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [features, setFeatures] = React.useState<string[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const carregarDadosDoUsuario = React.useCallback(async (userId: string) => {
    const [{ data: p }, { data: papeis }, { data: feats }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_features").select("feature").eq("user_id", userId).eq("habilitado", true),
    ]);
    setPerfil((p as Perfil) ?? null);
    setIsAdmin(Boolean(papeis?.some((r: any) => r.role === "admin")));
    setFeatures((feats ?? []).map((f: any) => f.feature));
  }, []);

  React.useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }

    // O listener é registrado ANTES do getSession para não perder o evento inicial.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
      if (novaSessao?.user) {
        // Chamadas ao banco ficam fora do callback para evitar deadlock no client.
        setTimeout(() => carregarDadosDoUsuario(novaSessao.user.id), 0);
      } else {
        setPerfil(null);
        setIsAdmin(false);
        setFeatures([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await carregarDadosDoUsuario(data.session.user.id);
      setCarregando(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [carregarDadosDoUsuario]);

  const entrar = async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduzirErro(error.message));
  };

  const cadastrar = async (email: string, senha: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome }, emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) throw new Error(traduzirErro(error.message));
  };

  const entrarComGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw new Error(traduzirErro(error.message));
  };

  const recuperarSenha = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/entrar`,
    });
    if (error) throw new Error(traduzirErro(error.message));
  };

  const sair = async () => {
    await supabase.auth.signOut();
    // Limpa o cache para não vazar dados de um usuário para o próximo.
    queryClient.clear();
    setPerfil(null);
    setIsAdmin(false);
    setFeatures([]);
  };

  const recarregarPerfil = async () => {
    if (session?.user) await carregarDadosDoUsuario(session.user.id);
  };

  const valor: AuthContextValue = {
    session,
    user: session?.user ?? null,
    perfil,
    isAdmin,
    features,
    carregando,
    entrar,
    cadastrar,
    entrarComGoogle,
    recuperarSenha,
    sair,
    recarregarPerfil,
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

function traduzirErro(mensagem: string) {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um instante.";
  return mensagem;
}
