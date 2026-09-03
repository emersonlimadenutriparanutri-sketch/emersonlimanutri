import { addMonths } from "date-fns";
import { addDays, paraISODate, dataLocal } from "./format";
import type { JornadaTemplate } from "@/types/db";

/**
 * Converte a estrutura de um template em linhas da tabela `jornada`,
 * ancorando cada tarefa na data de início do acompanhamento.
 */
export function tarefasDoTemplate(
  template: JornadaTemplate,
  patientId: string,
  inicio: Date = new Date(),
) {
  const linhas: Record<string, any>[] = [];
  let ordem = 0;

  for (const mes of template.estrutura ?? []) {
    for (const semana of mes.semanas ?? []) {
      for (const tarefa of semana.tarefas ?? []) {
        linhas.push({
          patient_id: patientId,
          mes: mes.mes,
          semana: semana.semana,
          titulo: tarefa.titulo,
          tipo: tarefa.tipo ?? "tarefa",
          data_prevista: paraISODate(addDays(inicio, tarefa.dia_offset ?? 0)),
          ordem: ordem++,
        });
      }
    }
  }
  return linhas;
}

/** Vencimento do plano a partir do início e da duração do serviço. */
export function calcularVencimento(inicio: string | Date | null | undefined, meses = 1) {
  const d = dataLocal(inicio as any) ?? new Date();
  return paraISODate(addMonths(d, meses || 1));
}
