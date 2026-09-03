import * as React from "react";
import { useLista } from "./use-crud";
import { diasAte, faseCiclo } from "@/lib/format";
import type { Paciente } from "@/types/db";

export type GrupoPaciente = "ativos" | "vencidos" | "sem_plano" | "inativos";

/**
 * Regra de negócio central do app:
 * paciente com plano vencido NÃO conta como ativo — ele migra para "Vencidos".
 * Ativo sem data de vencimento cai em "Ativos sem plano".
 */
export function grupoDoPaciente(p: Paciente): GrupoPaciente {
  if (p.status === "inativo") return "inativos";
  if (!p.plano_vencimento) return "sem_plano";
  const dias = diasAte(p.plano_vencimento);
  return dias !== null && dias < 0 ? "vencidos" : "ativos";
}

export function usePacientes() {
  const query = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });
  const pacientes = query.data ?? [];

  const grupos = React.useMemo(() => {
    const base: Record<GrupoPaciente, Paciente[]> = { ativos: [], vencidos: [], sem_plano: [], inativos: [] };
    for (const p of pacientes) base[grupoDoPaciente(p)].push(p);
    return base;
  }, [pacientes]);

  const indicadores = React.useMemo(() => {
    const ativos = grupos.ativos;
    const premium = ativos.filter((p) => p.plano_tipo === "premium");
    const mensal = ativos.filter((p) => p.plano_tipo !== "premium");
    const aVencer = ativos.filter((p) => {
      const d = diasAte(p.plano_vencimento);
      return d !== null && d >= 0 && d <= 7;
    });
    const ciclo = [...ativos, ...grupos.sem_plano].filter((p) => {
      const f = faseCiclo(p.ciclo_ultima_menstruacao, p.ciclo_duracao ?? 28, p.ciclo_duracao_menstruacao ?? 5);
      return f?.fase === "tpm" || f?.fase === "menstrual";
    });
    return { premium, mensal, aVencer, ciclo };
  }, [grupos]);

  return { ...query, pacientes, grupos, indicadores };
}
