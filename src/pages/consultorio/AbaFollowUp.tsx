import * as React from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { History, RotateCcw, UserCheck, MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsappButton } from "@/components/shared/whatsapp-button";
import { useLista, useSalvar } from "@/hooks/use-crud";
import { useConverterLead } from "@/hooks/use-conversao";
import { fmtData, fmtMoeda, hojeISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lead, Tentativa } from "@/types/db";

type Fase = "perdidos" | "recuperacao" | "reconquistados";

const FASES: { chave: Fase; rotulo: string; descricao: string }[] = [
  { chave: "perdidos", rotulo: "Perdidos", descricao: "Esfriaram ou disseram não" },
  { chave: "recuperacao", rotulo: "Em recuperação", descricao: "Você reabriu a conversa" },
  { chave: "reconquistados", rotulo: "Reconquistados", descricao: "Voltaram e fecharam" },
];

function faseDoLead(l: Lead): Fase {
  if (l.convertido_em || l.status === "fechado") return "reconquistados";
  return l.em_recuperacao ? "recuperacao" : "perdidos";
}

export default function AbaFollowUp() {
  const navigate = useNavigate();
  const { data: leads = [] } = useLista<Lead>("leads");
  const salvar = useSalvar<Lead>("leads", "");
  const converter = useConverterLead();
  const [registrando, setRegistrando] = React.useState<Lead | null>(null);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Só entra no Follow Up quem foi perdido ou já está em recuperação.
  const doFunilDeRecuperacao = React.useMemo(
    () => leads.filter((l) => l.status === "perdido" || l.em_recuperacao),
    [leads],
  );

  const porFase = React.useMemo(() => {
    const mapa: Record<Fase, Lead[]> = { perdidos: [], recuperacao: [], reconquistados: [] };
    for (const l of doFunilDeRecuperacao) mapa[faseDoLead(l)].push(l);
    return mapa;
  }, [doFunilDeRecuperacao]);

  const aoSoltar = (e: DragEndEvent) => {
    const lead = leads.find((l) => l.id === e.active.id);
    const destino = e.over?.id as Fase | undefined;
    if (!lead || !destino || faseDoLead(lead) === destino) return;

    if (destino === "reconquistados") {
      // Integridade: converter cria (ou reaproveita) o paciente, nunca duplica.
      converter.mutate(lead, { onSuccess: ({ pacienteId }) => navigate(`/paciente/${pacienteId}`) });
      return;
    }
    salvar.mutate({ id: lead.id, em_recuperacao: destino === "recuperacao", status: "perdido" } as any);
  };

  if (doFunilDeRecuperacao.length === 0) {
    return (
      <EmptyState
        icone={<RotateCcw />}
        titulo="Nenhum lead para recuperar"
        descricao="Quando um lead for marcado como perdido no funil, ele aparece aqui para você trabalhar a recuperação."
      />
    );
  }

  return (
    <div className="space-y-4">
      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        <div className="grid gap-3 lg:grid-cols-3">
          {FASES.map((fase) => (
            <ColunaFase key={fase.chave} fase={fase} leads={porFase[fase.chave]}>
              {porFase[fase.chave].map((lead) => (
                <CardFollowUp
                  key={lead.id}
                  lead={lead}
                  aoRegistrar={() => setRegistrando(lead)}
                  aoConverter={() => converter.mutate(lead, { onSuccess: ({ pacienteId }) => navigate(`/paciente/${pacienteId}`) })}
                />
              ))}
            </ColunaFase>
          ))}
        </div>
      </DndContext>

      <DialogTentativa lead={registrando} onOpenChange={(v) => !v && setRegistrando(null)} />
    </div>
  );
}

function ColunaFase({
  fase, leads, children,
}: { fase: { chave: Fase; rotulo: string; descricao: string }; leads: Lead[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.chave });
  return (
    <div ref={setNodeRef} className={cn("rounded-2xl border border-border/70 bg-muted/40 p-3 transition-colors", isOver && "border-secondary bg-secondary-soft/60")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide">{fase.rotulo}</p>
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{leads.length}</span>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{fase.descricao}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CardFollowUp({
  lead, aoRegistrar, aoConverter,
}: { lead: Lead; aoRegistrar: () => void; aoConverter: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const tentativas = lead.tentativas ?? [];
  const ultima = tentativas[tentativas.length - 1];

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn("card-surface cursor-grab space-y-2 p-3 active:cursor-grabbing", isDragging && "opacity-40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{lead.nome}</p>
        {tentativas.length > 0 && (
          <Badge variant="muted" className="shrink-0">
            <History className="h-3 w-3" /> {tentativas.length}
          </Badge>
        )}
      </div>

      {lead.motivo_perda && <p className="text-[11px] text-muted-foreground">Motivo: {lead.motivo_perda}</p>}
      {Boolean(lead.valor_potencial) && (
        <p className="font-display text-sm font-semibold text-secondary">{fmtMoeda(lead.valor_potencial)}</p>
      )}
      {ultima && (
        <p className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          Último contato {fmtData(ultima.data)} · {ultima.canal} · {ultima.resultado}
        </p>
      )}

      <div className="flex items-center gap-1 border-t border-border pt-2" onPointerDown={(e) => e.stopPropagation()}>
        <WhatsappButton telefone={lead.telefone} mensagem={`Oi, ${lead.nome.split(" ")[0]}! Tudo bem?`} />
        <Button variant="ghost" size="icon-sm" onClick={aoRegistrar} title="Registrar tentativa"><MessageSquarePlus /></Button>
        {!lead.convertido_em && (
          <Button variant="ghost" size="icon-sm" className="ml-auto text-success" onClick={aoConverter} title="Converter em paciente">
            <UserCheck />
          </Button>
        )}
      </div>
    </div>
  );
}

function DialogTentativa({ lead, onOpenChange }: { lead: Lead | null; onOpenChange: (v: boolean) => void }) {
  const salvar = useSalvar<Lead>("leads", "Tentativa registrada.");
  const [canal, setCanal] = React.useState("WhatsApp");
  const [resultado, setResultado] = React.useState("Sem resposta");
  const [nota, setNota] = React.useState("");
  const [data, setData] = React.useState(hojeISO());

  React.useEffect(() => {
    if (lead) { setCanal("WhatsApp"); setResultado("Sem resposta"); setNota(""); setData(hojeISO()); }
  }, [lead]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    const nova: Tentativa = { data, canal, resultado, nota: nota || undefined };
    await salvar.mutateAsync({
      id: lead.id,
      tentativas: [...(lead.tentativas ?? []), nova],
      em_recuperacao: true,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(lead)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar tentativa</DialogTitle>
          <DialogDescription>
            O histórico fica salvo no lead — assim você sabe o que já tentou antes de insistir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-data">Data</Label>
              <Input id="t-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["WhatsApp", "Ligação", "Instagram", "E-mail", "Presencial"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Resultado</Label>
              <Select value={resultado} onValueChange={setResultado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Sem resposta", "Respondeu com interesse", "Pediu para retomar depois", "Objeção de preço", "Disse não"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="t-nota">Anotação</Label>
              <Textarea id="t-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que ela respondeu, qual a real objeção…" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
