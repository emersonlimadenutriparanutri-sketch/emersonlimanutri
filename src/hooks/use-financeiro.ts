import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { dataLocal, paraISODate } from "@/lib/format";

/**
 * Lança uma venda ou despesa em regime de competência e gera as parcelas.
 * Cada parcela vence 30 dias depois da anterior e vira um lançamento
 * com baixa individual em Contas a receber / a pagar.
 */
export function useLancarMovimento(tipo: "receita" | "despesa") {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tabela = tipo === "receita" ? "receitas" : "despesas";

  return useMutation({
    mutationFn: async (dados: Record<string, any>) => {
      if (!user) throw new Error("Sessão expirada.");
      const parcelas = Math.max(1, Number(dados.parcelas) || 1);
      const valorTotal = Number(dados.valor) || 0;

      const { data: movimento, error } = await supabase
        .from(tabela)
        .insert({ ...dados, parcelas, valor: valorTotal, user_id: user.id })
        .select().single();
      if (error) throw error;

      const base = dataLocal(dados.data_competencia) ?? new Date();
      // Divide em centavos e joga a diferença na última parcela.
      const centavos = Math.round(valorTotal * 100);
      const porParcela = Math.floor(centavos / parcelas);
      const sobra = centavos - porParcela * parcelas;

      const lancamentos = Array.from({ length: parcelas }, (_, i) => ({
        user_id: user.id,
        tipo: tipo === "receita" ? "receber" : "pagar",
        descricao: parcelas > 1 ? `${dados.descricao} (${i + 1}/${parcelas})` : dados.descricao,
        valor: (porParcela + (i === parcelas - 1 ? sobra : 0)) / 100,
        vencimento: paraISODate(addDays(base, i * 30)),
        conta_id: dados.conta_id ?? null,
        parcela: i + 1,
        total_parcelas: parcelas,
        ...(tipo === "receita" ? { receita_id: movimento.id } : { despesa_id: movimento.id }),
      }));

      const { error: erroLanc } = await supabase.from("lancamentos").insert(lancamentos);
      if (erroLanc) throw erroLanc;
      return movimento;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tabela] });
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success(tipo === "receita" ? "Venda lançada." : "Despesa lançada.");
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível lançar."),
  });
}

/** Baixa (ou estorna) um lançamento. */
export function useBaixarLancamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pago, data }: { id: string; pago: boolean; data?: string }) => {
      const { error } = await supabase
        .from("lancamentos")
        .update({ pago, data_pagamento: pago ? (data ?? paraISODate(new Date())) : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Lançamento atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Remove o movimento e, em cascata, as parcelas geradas por ele. */
export function useRemoverMovimento(tipo: "receita" | "despesa") {
  const queryClient = useQueryClient();
  const tabela = tipo === "receita" ? "receitas" : "despesas";
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tabela] });
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Lançamento removido.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
