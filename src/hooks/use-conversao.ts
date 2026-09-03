import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { tarefasDoTemplate, calcularVencimento } from "@/lib/jornada";
import { paraISODate, dataLocal } from "@/lib/format";
import type { JornadaTemplate, Lead, Paciente, Servico } from "@/types/db";

/**
 * Converte um lead em paciente:
 * copia os dados pessoais, aplica a jornada modelo e joga a data da
 * consulta direto na agenda. Nunca duplica um lead já convertido.
 */
export function useConverterLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (lead: Lead) => {
      if (!user) throw new Error("Sessão expirada.");

      if (lead.convertido_em) {
        const { data } = await supabase.from("patients").select("id").eq("id", lead.convertido_em).maybeSingle();
        if (data) return { pacienteId: data.id, jaExistia: true };
      }

      let servico: Servico | null = null;
      if (lead.servico_id) {
        const { data } = await supabase.from("servicos").select("*").eq("id", lead.servico_id).maybeSingle();
        servico = data as Servico | null;
      }

      const inicio = dataLocal(lead.data_consulta) ?? new Date();

      const { data: paciente, error: erroPaciente } = await supabase
        .from("patients")
        .insert({
          user_id: user.id,
          nome: lead.nome,
          telefone: lead.telefone,
          email: lead.email,
          cidade: lead.cidade,
          estado: lead.estado,
          instagram: lead.instagram,
          data_nascimento: lead.data_nascimento,
          sexo: lead.sexo,
          profissao: lead.profissao,
          origem: lead.origem,
          observacoes: lead.observacoes,
          servico_id: lead.servico_id,
          plano_tipo: servico?.tipo ?? "mensal",
          plano_valor: lead.valor_potencial ?? servico?.valor ?? 0,
          plano_inicio: paraISODate(inicio),
          plano_vencimento: calcularVencimento(inicio, servico?.duracao_meses ?? 1),
          lead_id: lead.id,
          status: "ativo",
        })
        .select()
        .single();
      if (erroPaciente) throw erroPaciente;
      const novo = paciente as Paciente;

      // Jornada modelo (se houver template padrão cadastrado)
      const { data: template } = await supabase
        .from("jornada_templates").select("*").eq("user_id", user.id).eq("padrao", true).maybeSingle();
      if (template) {
        const linhas = tarefasDoTemplate(template as JornadaTemplate, novo.id, inicio).map((l) => ({ ...l, user_id: user.id }));
        if (linhas.length) await supabase.from("jornada").insert(linhas);
      }

      // Consulta agendada entra na Torre de Controle
      if (lead.data_consulta) {
        await supabase.from("agenda_tasks").insert({
          user_id: user.id,
          titulo: `Consulta — ${lead.nome}`,
          tipo: "consulta",
          data: paraISODate(inicio),
          hora: inicio.toTimeString().slice(0, 5),
          patient_id: novo.id,
        });
      }

      await supabase.from("leads")
        .update({ status: "fechado", convertido_em: novo.id, em_recuperacao: false })
        .eq("id", lead.id);

      return { pacienteId: novo.id, jaExistia: false };
    },
    onSuccess: ({ jaExistia }) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["agenda_tasks"] });
      queryClient.invalidateQueries({ queryKey: ["jornada"] });
      toast.success(jaExistia ? "Este lead já tinha um paciente vinculado." : "Lead convertido em paciente.");
    },
    onError: (erro: any) => toast.error(erro.message ?? "Não foi possível converter o lead."),
  });
}

/**
 * Devolve um paciente para o funil: marca como inativo (nunca apaga)
 * e recria um lead com o histórico anexado, permitindo reativação.
 */
export function useDevolverParaLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ paciente, motivo }: { paciente: Paciente; motivo?: string }) => {
      if (!user) throw new Error("Sessão expirada.");

      const [{ count: anamneses }, { count: exames }, { count: avaliacoes }] = await Promise.all([
        supabase.from("anamnese").select("id", { count: "exact", head: true }).eq("patient_id", paciente.id),
        supabase.from("analise_exames").select("id", { count: "exact", head: true }).eq("patient_id", paciente.id),
        supabase.from("avaliacoes_fisicas").select("id", { count: "exact", head: true }).eq("patient_id", paciente.id),
      ]);

      const historico = [
        motivo ? `Motivo da saída: ${motivo}` : null,
        `Histórico clínico preservado — anamneses: ${anamneses ?? 0}, exames: ${exames ?? 0}, avaliações: ${avaliacoes ?? 0}.`,
        paciente.observacoes,
      ].filter(Boolean).join("\n");

      const { data: lead, error } = await supabase.from("leads").insert({
        user_id: user.id,
        nome: paciente.nome,
        telefone: paciente.telefone,
        email: paciente.email,
        cidade: paciente.cidade,
        estado: paciente.estado,
        instagram: paciente.instagram,
        data_nascimento: paciente.data_nascimento,
        sexo: paciente.sexo,
        profissao: paciente.profissao,
        origem: paciente.origem,
        status: "perdido",
        temperatura: "morno",
        em_recuperacao: true,
        motivo_perda: motivo || "Encerrou o acompanhamento",
        valor_potencial: paciente.plano_valor ?? 0,
        servico_id: paciente.servico_id,
        convertido_em: paciente.id,
        observacoes: historico,
      }).select().single();
      if (error) throw error;

      await supabase.from("patients").update({ status: "inativo" }).eq("id", paciente.id);
      return lead as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Paciente devolvido ao funil. O histórico clínico foi mantido.");
    },
    onError: (erro: any) => toast.error(erro.message ?? "Não foi possível devolver o paciente."),
  });
}
