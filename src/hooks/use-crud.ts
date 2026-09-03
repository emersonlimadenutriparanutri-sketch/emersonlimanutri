import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

type Filtros = Record<string, string | number | boolean | null | undefined>;

interface OpcoesLista {
  filtros?: Filtros;
  ordenarPor?: string;
  crescente?: boolean;
  select?: string;
  habilitado?: boolean;
  staleTime?: number;
}

/** Chave estável de cache — sempre [tabela, userId, filtros]. */
export const chave = (tabela: string, userId?: string, filtros?: Filtros) =>
  [tabela, userId ?? "anon", filtros ?? {}] as const;

/**
 * Listagem genérica com RLS: o filtro por user_id é aplicado no cliente
 * também, para que o cache nunca misture usuários.
 */
export function useLista<T = any>(tabela: string, opcoes: OpcoesLista = {}) {
  const { user } = useAuth();
  const {
    filtros = {},
    ordenarPor = "created_at",
    crescente = false,
    select = "*",
    habilitado = true,
    staleTime = 5 * 60 * 1000,
  } = opcoes;

  return useQuery<T[]>({
    queryKey: chave(tabela, user?.id, filtros),
    enabled: Boolean(user?.id) && habilitado,
    staleTime,
    queryFn: async () => {
      let q = supabase.from(tabela).select(select).eq("user_id", user!.id);
      for (const [campo, valor] of Object.entries(filtros)) {
        if (valor === undefined || valor === null || valor === "") continue;
        q = q.eq(campo, valor as any);
      }
      const { data, error } = await q.order(ordenarPor, { ascending: crescente });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useItem<T = any>(tabela: string, id?: string, select = "*") {
  const { user } = useAuth();
  return useQuery<T | null>({
    queryKey: [tabela, "item", id],
    enabled: Boolean(user?.id && id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from(tabela).select(select).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as T) ?? null;
    },
  });
}

/**
 * Insert/update com escrita direta no cache (setQueryData).
 * Evita invalidar a árvore inteira a cada salvamento.
 */
export function useSalvar<T extends { id?: string }>(tabela: string, mensagem = "Salvo com sucesso.") {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (registro: Partial<T> & Record<string, any>) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      const payload = { ...registro, user_id: user.id };
      const query = registro.id
        ? supabase.from(tabela).update(payload).eq("id", registro.id).select().single()
        : supabase.from(tabela).insert(payload).select().single();
      const { data, error } = await query;
      if (error) throw error;
      return data as T & { id: string };
    },
    onSuccess: (salvo) => {
      queryClient.setQueriesData<any[]>({ queryKey: [tabela] }, (antigo) => {
        if (!Array.isArray(antigo)) return antigo;
        const idx = antigo.findIndex((r) => r?.id === (salvo as any).id);
        if (idx >= 0) {
          const copia = [...antigo];
          copia[idx] = { ...copia[idx], ...salvo };
          return copia;
        }
        return [salvo, ...antigo];
      });
      queryClient.setQueryData([tabela, "item", (salvo as any).id], salvo);
      if (mensagem) toast.success(mensagem);
    },
    onError: (erro: any) => toast.error(traduzir(erro)),
  });
}

export function useRemover(tabela: string, mensagem = "Removido.") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueriesData<any[]>({ queryKey: [tabela] }, (antigo) =>
        Array.isArray(antigo) ? antigo.filter((r) => r?.id !== id) : antigo,
      );
      queryClient.removeQueries({ queryKey: [tabela, "item", id] });
      if (mensagem) toast.success(mensagem);
    },
    onError: (erro: any) => toast.error(traduzir(erro)),
  });
}

/** Grava várias linhas de uma vez (jornada aplicada por template, parcelas). */
export function useSalvarLote(tabela: string, mensagem = "Salvo.") {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (registros: Record<string, any>[]) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      if (!registros.length) return [];
      const payload = registros.map((r) => ({ ...r, user_id: user.id }));
      const { data, error } = await supabase.from(tabela).insert(payload).select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tabela] });
      if (mensagem) toast.success(mensagem);
    },
    onError: (erro: any) => toast.error(traduzir(erro)),
  });
}

function traduzir(erro: any) {
  const m = String(erro?.message ?? erro ?? "");
  if (m.includes("duplicate key")) return "Já existe um registro com esses dados.";
  if (m.includes("violates row-level security")) return "Você não tem permissão para esta ação.";
  if (m.includes("Failed to fetch")) return "Sem conexão com o servidor.";
  return m || "Não foi possível concluir a operação.";
}
