import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLista } from "./use-crud";
import { paraISODate, dataLocal } from "@/lib/format";
import type { AgendaTask, Lead, Paciente, TarefaJornada, TipoEvento } from "@/types/db";

export type FonteEvento = "agenda" | "jornada" | "lead" | "consulta";

export interface EventoUnificado {
  id: string;
  origemId: string;
  fonte: FonteEvento;
  titulo: string;
  descricao?: string | null;
  tipo: TipoEvento;
  data: string;              // YYYY-MM-DD
  hora?: string | null;
  concluida: boolean;
  cor?: string | null;
  patientId?: string | null;
  leadId?: string | null;
  linkReuniao?: string | null;
  /** Eventos de fora da agenda não são editáveis aqui — só concluídos ou abertos na origem. */
  editavel: boolean;
  linkOrigem?: string;
}

export const CORES_TIPO: Record<TipoEvento, string> = {
  tarefa: "hsl(var(--muted-foreground))",
  consulta: "hsl(var(--primary))",
  raio_x: "hsl(var(--info))",
  contato: "hsl(var(--success))",
  lembrete: "hsl(var(--warning))",
  envio_material: "hsl(var(--secondary))",
  ajuste_plano: "hsl(var(--destructive))",
  retorno: "hsl(var(--primary))",
  outro: "hsl(var(--muted-foreground))",
};

export const ROTULOS_TIPO: Record<TipoEvento, string> = {
  tarefa: "Tarefa", consulta: "Consulta", raio_x: "Raio-X", contato: "Contato",
  lembrete: "Lembrete", envio_material: "Envio de material", ajuste_plano: "Ajuste de plano",
  retorno: "Retorno", outro: "Outro",
};

/** Junta as quatro fontes de evento do app em uma agenda só. */
export function useEventos() {
  const { data: tarefas = [], isLoading: c1 } = useLista<AgendaTask>("agenda_tasks", { ordenarPor: "data", crescente: true });
  const { data: jornada = [], isLoading: c2 } = useLista<TarefaJornada>("jornada", { ordenarPor: "data_prevista", crescente: true });
  const { data: leads = [], isLoading: c3 } = useLista<Lead>("leads");
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });

  const eventos = React.useMemo<EventoUnificado[]>(() => {
    const nomePaciente = (id?: string | null) => pacientes.find((p) => p.id === id)?.nome;
    const lista: EventoUnificado[] = [];

    for (const t of tarefas) {
      lista.push({
        id: `agenda:${t.id}`, origemId: t.id, fonte: "agenda",
        titulo: t.titulo, descricao: t.descricao, tipo: t.tipo, data: t.data, hora: t.hora,
        concluida: t.concluida, cor: t.cor, patientId: t.patient_id, leadId: t.lead_id,
        linkReuniao: t.link_reuniao, editavel: true,
      });
    }

    for (const j of jornada) {
      if (!j.data_prevista) continue;
      const nome = nomePaciente(j.patient_id);
      lista.push({
        id: `jornada:${j.id}`, origemId: j.id, fonte: "jornada",
        titulo: nome ? `${j.titulo} — ${nome}` : j.titulo,
        descricao: j.descricao, tipo: (j.tipo as TipoEvento) ?? "tarefa",
        data: j.data_prevista, concluida: j.concluida,
        patientId: j.patient_id, editavel: false,
        linkOrigem: `/paciente/${j.patient_id}?t=jornada`,
      });
    }

    for (const l of leads) {
      if (l.proxima_acao && l.proxima_acao_data) {
        lista.push({
          id: `lead:${l.id}`, origemId: l.id, fonte: "lead",
          titulo: `${l.proxima_acao} — ${l.nome}`, tipo: "contato",
          data: l.proxima_acao_data, concluida: false, leadId: l.id, editavel: false,
          linkOrigem: "/consultorio?aba=leads",
        });
      }
      if (l.data_consulta) {
        const d = dataLocal(l.data_consulta);
        if (d) {
          lista.push({
            id: `consulta:${l.id}`, origemId: l.id, fonte: "consulta",
            titulo: `Consulta — ${l.nome}`, tipo: "consulta",
            data: paraISODate(d), hora: d.toTimeString().slice(0, 5),
            concluida: l.status === "fechado", leadId: l.id, editavel: false,
            linkOrigem: "/consultorio?aba=leads",
          });
        }
      }
    }

    return lista.sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""));
  }, [tarefas, jornada, leads, pacientes]);

  return { eventos, carregando: c1 || c2 || c3 };
}

/** Marca concluído respeitando a tabela de origem do evento. */
export function useConcluirEvento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ evento, concluida }: { evento: EventoUnificado; concluida: boolean }) => {
      const agora = concluida ? new Date().toISOString() : null;

      if (evento.fonte === "agenda") {
        const { error } = await supabase.from("agenda_tasks")
          .update({ concluida, concluida_em: agora }).eq("id", evento.origemId);
        if (error) throw error;
        return "agenda_tasks";
      }
      if (evento.fonte === "jornada") {
        const { error } = await supabase.from("jornada")
          .update({ concluida, concluida_em: agora }).eq("id", evento.origemId);
        if (error) throw error;
        return "jornada";
      }
      if (evento.fonte === "lead") {
        // Concluir a próxima ação do lead significa limpá-la do calendário.
        const { error } = await supabase.from("leads")
          .update(concluida ? { proxima_acao: null, proxima_acao_data: null } : {})
          .eq("id", evento.origemId);
        if (error) throw error;
        return "leads";
      }
      const { error } = await supabase.from("leads")
        .update({ status: concluida ? "fechado" : "agendado" }).eq("id", evento.origemId);
      if (error) throw error;
      return "leads";
    },
    onSuccess: (tabela) => {
      queryClient.invalidateQueries({ queryKey: [tabela] });
      toast.success("Evento atualizado.");
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível atualizar."),
  });
}
