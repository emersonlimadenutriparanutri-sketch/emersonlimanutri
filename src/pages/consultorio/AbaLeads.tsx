import * as React from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import {
  Plus, Download, Upload, UserCheck, Pencil, Trash2, CalendarClock,
  TrendingUp, Flame, Snowflake, Thermometer, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsappButton } from "@/components/shared/whatsapp-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LeadDialog, ETAPAS } from "@/components/shared/lead-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { useConverterLead } from "@/hooks/use-conversao";
import { fmtData, fmtMoeda, fmtDataHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lead, StatusLead, Temperatura } from "@/types/db";

const CORES_ETAPA: Record<StatusLead, string> = {
  novo_lead: "bg-muted-foreground/40",
  contato_feito: "bg-info",
  qualificado: "bg-secondary",
  proposta_enviada: "bg-warning",
  agendado: "bg-primary",
  fechado: "bg-success",
  perdido: "bg-destructive",
};

const TEMPERATURAS: Record<Temperatura, { rotulo: string; variante: "info" | "warning" | "danger"; icone: React.ElementType }> = {
  frio: { rotulo: "Frio", variante: "info", icone: Snowflake },
  morno: { rotulo: "Morno", variante: "warning", icone: Thermometer },
  quente: { rotulo: "Quente", variante: "danger", icone: Flame },
};

function CardLead({
  lead, aoEditar, aoConverter, aoExcluir,
}: { lead: Lead; aoEditar: () => void; aoConverter: () => void; aoExcluir: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const temp = TEMPERATURAS[lead.temperatura] ?? TEMPERATURAS.frio;
  const IconeTemp = temp.icone;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "card-surface cursor-grab space-y-2 p-3 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{lead.nome}</p>
        <Badge variant={temp.variante} className="shrink-0">
          <IconeTemp className="h-3 w-3" /> {temp.rotulo}
        </Badge>
      </div>

      {lead.origem && <p className="text-[11px] text-muted-foreground">Origem: {lead.origem}</p>}

      {Boolean(lead.valor_potencial) && (
        <p className="font-display text-sm font-semibold text-secondary">{fmtMoeda(lead.valor_potencial)}</p>
      )}

      {lead.status === "agendado" && lead.data_consulta && (
        <p className="flex items-center gap-1.5 text-[11px] text-primary">
          <CalendarClock className="h-3 w-3" /> {fmtDataHora(lead.data_consulta)}
        </p>
      )}

      {lead.proxima_acao && (
        <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {lead.proxima_acao}
          {lead.proxima_acao_data && ` · ${fmtData(lead.proxima_acao_data)}`}
        </p>
      )}

      {Boolean(lead.tags?.length) && (
        <div className="flex flex-wrap gap-1">
          {lead.tags!.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-secondary-soft px-2 py-0.5 text-[10px] text-secondary-foreground">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-border pt-2" onPointerDown={(e) => e.stopPropagation()}>
        <WhatsappButton telefone={lead.telefone} mensagem={`Oi, ${lead.nome.split(" ")[0]}!`} />
        <Button variant="ghost" size="icon-sm" onClick={aoEditar} title="Editar"><Pencil /></Button>
        {!lead.convertido_em && (
          <Button variant="ghost" size="icon-sm" onClick={aoConverter} title="Converter em paciente" className="text-success">
            <UserCheck />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={aoExcluir} title="Excluir" className="ml-auto text-destructive"><Trash2 /></Button>
      </div>
    </div>
  );
}

function Coluna({
  etapa, rotulo, leads, children,
}: { etapa: StatusLead; rotulo: string; leads: Lead[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const total = leads.reduce((s, l) => s + (Number(l.valor_potencial) || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[264px] shrink-0 flex-col rounded-2xl border border-border/70 bg-muted/40 transition-colors",
        isOver && "border-secondary bg-secondary-soft/60",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <span className={cn("h-2 w-2 rounded-full", CORES_ETAPA[etapa])} />
        <p className="flex-1 truncate text-xs font-semibold uppercase tracking-wide">{rotulo}</p>
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{leads.length}</span>
      </div>
      {total > 0 && <p className="px-3 pb-2 text-[11px] text-muted-foreground">{fmtMoeda(total)}</p>}
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">{children}</div>
    </div>
  );
}

export default function AbaLeads() {
  const navigate = useNavigate();
  const { data: leads = [], isLoading } = useLista<Lead>("leads", { ordenarPor: "created_at" });
  const salvar = useSalvar<Lead>("leads", "");
  const remover = useRemover("leads", "Lead excluído.");
  const converter = useConverterLead();

  const [busca, setBusca] = React.useState("");
  const [dialogAberto, setDialogAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Lead | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<Lead | null>(null);
  const [arrastando, setArrastando] = React.useState<Lead | null>(null);
  const inputArquivo = React.useRef<HTMLInputElement>(null);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Follow Up cuida dos perdidos em recuperação; aqui eles não aparecem.
  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (l.em_recuperacao) return false;
      if (!termo) return true;
      return [l.nome, l.telefone, l.email, l.cidade, l.instagram, ...(l.tags ?? [])]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(termo));
    });
  }, [leads, busca]);

  const porEtapa = React.useMemo(() => {
    const mapa = Object.fromEntries(ETAPAS.map((e) => [e.chave, [] as Lead[]])) as Record<StatusLead, Lead[]>;
    for (const l of visiveis) (mapa[l.status] ??= []).push(l);
    return mapa;
  }, [visiveis]);

  // Receita potencial exclui perdidos e já fechados: só conta o que ainda está em jogo.
  const metricas = React.useMemo(() => {
    const emJogo = visiveis.filter((l) => l.status !== "perdido" && l.status !== "fechado");
    const fechados = visiveis.filter((l) => l.status === "fechado");
    const receitaPotencial = emJogo.reduce((s, l) => s + (Number(l.valor_potencial) || 0), 0);
    const receitaFechada = fechados.reduce((s, l) => s + (Number(l.valor_potencial) || 0), 0);
    const totalDecididos = fechados.length + visiveis.filter((l) => l.status === "perdido").length;
    const conversao = totalDecididos ? Math.round((fechados.length / totalDecididos) * 100) : 0;
    return { receitaPotencial, receitaFechada, conversao, emJogo: emJogo.length };
  }, [visiveis]);

  const aoIniciarArraste = (e: DragStartEvent) =>
    setArrastando(leads.find((l) => l.id === e.active.id) ?? null);

  const aoSoltar = (evento: DragEndEvent) => {
    setArrastando(null);
    const { active, over } = evento;
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const destino = over.id as StatusLead;
    if (!lead || lead.status === destino) return;
    salvar.mutate({ id: lead.id, status: destino } as any);
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const linhas = leads.map((l) => ({
      Nome: l.nome, Telefone: l.telefone, "E-mail": l.email, Cidade: l.cidade,
      Instagram: l.instagram, Origem: l.origem,
      Etapa: ETAPAS.find((e) => e.chave === l.status)?.rotulo ?? l.status,
      Temperatura: l.temperatura, "Valor potencial": l.valor_potencial,
      "Data da consulta": l.data_consulta ? fmtDataHora(l.data_consulta) : "",
      "Próxima ação": l.proxima_acao, Tags: (l.tags ?? []).join(", "),
      Observações: l.observacoes, Criado: fmtData(l.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${linhas.length} leads exportados.`);
  };

  const importar = async (arquivo: File) => {
    try {
      const XLSX = await import("xlsx");
      const buffer = await arquivo.arrayBuffer();
      const wb = XLSX.read(buffer);
      const linhas = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]]);
      const pegar = (l: Record<string, any>, ...nomes: string[]) => {
        for (const n of nomes) {
          const chave = Object.keys(l).find((k) => k.toLowerCase().trim() === n.toLowerCase());
          if (chave && l[chave] !== "") return String(l[chave]);
        }
        return null;
      };
      let importados = 0;
      for (const l of linhas) {
        const nome = pegar(l, "nome", "name");
        if (!nome) continue;
        await salvar.mutateAsync({
          nome,
          telefone: pegar(l, "telefone", "whatsapp", "celular"),
          email: pegar(l, "e-mail", "email"),
          cidade: pegar(l, "cidade"),
          instagram: pegar(l, "instagram"),
          origem: pegar(l, "origem"),
          observacoes: pegar(l, "observações", "observacoes"),
          valor_potencial: Number(pegar(l, "valor potencial", "valor") ?? 0) || 0,
          status: "novo_lead",
          temperatura: "frio",
        } as any);
        importados++;
      }
      toast.success(`${importados} leads importados.`);
    } catch {
      toast.error("Não consegui ler essa planilha. Confira se há uma coluna 'Nome'.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-[264px] shrink-0 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Receita potencial</span>
          <p className="mt-2 font-display text-xl font-semibold text-secondary">{fmtMoeda(metricas.receitaPotencial)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{metricas.emJogo} leads ainda em jogo</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Fechado</span>
          <p className="mt-2 font-display text-xl font-semibold text-success">{fmtMoeda(metricas.receitaFechada)}</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Taxa de conversão</span>
          <p className="mt-2 flex items-center gap-2 font-display text-xl font-semibold">
            <TrendingUp className="h-4 w-4 text-success" /> {metricas.conversao}%
          </p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Total no funil</span>
          <p className="mt-2 font-display text-xl font-semibold">{visiveis.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone, cidade ou tag…" className="pl-9" />
        </div>
        <input
          ref={inputArquivo} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }}
        />
        <Button variant="outline" onClick={() => inputArquivo.current?.click()}><Upload /> Importar</Button>
        <Button variant="outline" onClick={exportar}><Download /> Exportar</Button>
        <Button onClick={() => { setEmEdicao(null); setDialogAberto(true); }}><Plus /> Novo lead</Button>
      </div>

      <DndContext sensors={sensores} onDragStart={aoIniciarArraste} onDragEnd={aoSoltar}>
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {ETAPAS.map((etapa) => (
            <Coluna key={etapa.chave} etapa={etapa.chave} rotulo={etapa.rotulo} leads={porEtapa[etapa.chave] ?? []}>
              {(porEtapa[etapa.chave] ?? []).map((lead) => (
                <CardLead
                  key={lead.id}
                  lead={lead}
                  aoEditar={() => { setEmEdicao(lead); setDialogAberto(true); }}
                  aoConverter={() =>
                    converter.mutate(lead, {
                      onSuccess: ({ pacienteId }) => navigate(`/paciente/${pacienteId}`),
                    })
                  }
                  aoExcluir={() => setParaExcluir(lead)}
                />
              ))}
              {(porEtapa[etapa.chave] ?? []).length === 0 && (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Arraste um lead para cá</p>
              )}
            </Coluna>
          ))}
        </div>

        <DragOverlay>
          {arrastando && (
            <div className="card-surface w-[248px] rotate-2 p-3 shadow-lift">
              <p className="truncate text-sm font-medium">{arrastando.nome}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <LeadDialog aberto={dialogAberto} onOpenChange={setDialogAberto} lead={emEdicao} />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir lead"
        descricao={`"${paraExcluir?.nome}" será removido em definitivo. Essa ação não pode ser desfeita.`}
        confirmar="Excluir"
        destrutivo
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}
