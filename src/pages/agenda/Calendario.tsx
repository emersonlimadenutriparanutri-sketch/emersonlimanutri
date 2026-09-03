import * as React from "react";
import { Link } from "react-router-dom";
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Check, ExternalLink,
  Trash2, Loader2, AlertCircle, ListChecks, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/shared/stat-card";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { useConcluirEvento, useEventos, CORES_TIPO, ROTULOS_TIPO, type EventoUnificado } from "@/hooks/use-eventos";
import { fmtData, hojeISO, paraISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgendaTask, Lead, Paciente, TipoEvento } from "@/types/db";

export default function Calendario() {
  const { eventos } = useEventos();
  const concluir = useConcluirEvento();
  const [referencia, setReferencia] = React.useState(new Date());
  const [visao, setVisao] = React.useState<"mes" | "semana">("mes");
  const [diaAberto, setDiaAberto] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<EventoUnificado | null | undefined>(undefined);
  // Guardado à parte: o painel do dia fecha ao abrir o formulário, mas a data escolhida precisa sobreviver.
  const [dataDoNovo, setDataDoNovo] = React.useState(hojeISO());

  const hoje = hojeISO();

  const estatisticas = React.useMemo(() => {
    const pendentes = eventos.filter((e) => !e.concluida);
    return {
      hoje: eventos.filter((e) => e.data === hoje).length,
      atrasadas: pendentes.filter((e) => e.data < hoje).length,
      pendentes: pendentes.length,
      concluidas: eventos.filter((e) => e.concluida).length,
    };
  }, [eventos, hoje]);

  const dias = React.useMemo(() => {
    if (visao === "semana") {
      return eachDayOfInterval({
        start: startOfWeek(referencia, { locale: ptBR }),
        end: endOfWeek(referencia, { locale: ptBR }),
      });
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(referencia), { locale: ptBR }),
      end: endOfWeek(endOfMonth(referencia), { locale: ptBR }),
    });
  }, [referencia, visao]);

  const porDia = React.useMemo(() => {
    const mapa = new Map<string, EventoUnificado[]>();
    for (const e of eventos) {
      if (!mapa.has(e.data)) mapa.set(e.data, []);
      mapa.get(e.data)!.push(e);
    }
    return mapa;
  }, [eventos]);

  const navegar = (direcao: -1 | 1) =>
    setReferencia((r) => (visao === "mes" ? addMonths(r, direcao) : addWeeks(r, direcao)));

  const eventosDoDia = diaAberto ? (porDia.get(diaAberto) ?? []) : [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard rotulo="Hoje" valor={estatisticas.hoje} icone={<CalendarDays />} />
        <StatCard rotulo="Atrasadas" valor={estatisticas.atrasadas} icone={<AlertCircle />} tom={estatisticas.atrasadas ? "perigo" : "sucesso"} />
        <StatCard rotulo="Pendentes" valor={estatisticas.pendentes} icone={<ListChecks />} tom="alerta" />
        <StatCard rotulo="Concluídas" valor={estatisticas.concluidas} icone={<CheckCheck />} tom="sucesso" />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navegar(-1)}><ChevronLeft /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navegar(1)}><ChevronRight /></Button>
          <Button variant="outline" size="sm" onClick={() => setReferencia(new Date())}>Hoje</Button>
          <p className="ml-2 font-display text-base font-semibold capitalize">
            {format(referencia, visao === "mes" ? "MMMM 'de' yyyy" : "'Semana de' dd 'de' MMMM", { locale: ptBR })}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              {(["mes", "semana"] as const).map((v) => (
                <button
                  key={v} onClick={() => setVisao(v)}
                  className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", visao === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {v === "mes" ? "Mês" : "Semana"}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => { setDataDoNovo(hoje); setEditando(null); }}><Plus /> Novo evento</Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>

        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const iso = paraISODate(dia);
            const doDia = porDia.get(iso) ?? [];
            const foraDoMes = visao === "mes" && !isSameMonth(dia, referencia);
            return (
              <button
                key={iso}
                onClick={() => setDiaAberto(iso)}
                className={cn(
                  "min-h-[104px] border-b border-r border-border p-2 text-left transition-colors hover:bg-muted/60",
                  foraDoMes && "bg-muted/30 text-muted-foreground",
                  visao === "semana" && "min-h-[220px]",
                )}
              >
                <span className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday(dia) && "bg-primary text-primary-foreground",
                )}>
                  {format(dia, "d")}
                </span>
                <div className="mt-1 space-y-1">
                  {doDia.slice(0, visao === "semana" ? 8 : 3).map((e) => (
                    <span
                      key={e.id}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                        e.concluida && "opacity-50 line-through",
                      )}
                      style={{ backgroundColor: `${e.cor ?? CORES_TIPO[e.tipo]}1f`, color: e.cor ?? CORES_TIPO[e.tipo] }}
                    >
                      {e.hora && <strong>{e.hora.slice(0, 5)}</strong>}
                      <span className="truncate">{e.titulo}</span>
                    </span>
                  ))}
                  {doDia.length > (visao === "semana" ? 8 : 3) && (
                    <span className="block text-[10px] text-muted-foreground">+{doDia.length - (visao === "semana" ? 8 : 3)} mais</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel do dia */}
      <Dialog open={Boolean(diaAberto)} onOpenChange={(v) => !v && setDiaAberto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="capitalize">{diaAberto && fmtData(diaAberto, "EEEE, dd 'de' MMMM")}</DialogTitle>
            <DialogDescription>{eventosDoDia.length} evento(s) neste dia.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {eventosDoDia.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Dia livre.</p>}
            {eventosDoDia.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <Checkbox
                  className="mt-0.5" checked={e.concluida}
                  onCheckedChange={(v) => concluir.mutate({ evento: e, concluida: Boolean(v) })}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", e.concluida && "text-muted-foreground line-through")}>{e.titulo}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span
                      className="rounded px-1.5 py-0.5"
                      style={{ backgroundColor: `${e.cor ?? CORES_TIPO[e.tipo]}1f`, color: e.cor ?? CORES_TIPO[e.tipo] }}
                    >
                      {ROTULOS_TIPO[e.tipo]}
                    </span>
                    {e.hora && <span>{e.hora.slice(0, 5)}</span>}
                    {!e.editavel && <Badge variant="muted">origem externa</Badge>}
                  </p>
                  {e.descricao && <p className="mt-1 text-xs text-muted-foreground">{e.descricao}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {e.linkReuniao && (
                    <Button variant="ghost" size="icon-sm" asChild title="Abrir reunião">
                      <a href={e.linkReuniao} target="_blank" rel="noreferrer"><ExternalLink /></a>
                    </Button>
                  )}
                  {e.editavel ? (
                    <Button variant="ghost" size="sm" onClick={() => { setEditando(e); setDiaAberto(null); }}>Editar</Button>
                  ) : (
                    e.linkOrigem && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={e.linkOrigem}>Ver origem</Link>
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setDataDoNovo(diaAberto ?? hoje);
                setDiaAberto(null);
                setEditando(null);
              }}
            >
              <Plus /> Novo evento neste dia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogEvento
        evento={editando} dataPadrao={dataDoNovo}
        onFechar={() => setEditando(undefined)}
      />
    </div>
  );
}

function DialogEvento({
  evento, dataPadrao, onFechar,
}: { evento: EventoUnificado | null | undefined; dataPadrao: string; onFechar: () => void }) {
  const salvar = useSalvar<AgendaTask>("agenda_tasks", "Evento salvo.");
  const remover = useRemover("agenda_tasks", "Evento removido.");
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });
  const { data: leads = [] } = useLista<Lead>("leads");

  const [form, setForm] = React.useState({
    titulo: "", descricao: "", tipo: "tarefa" as TipoEvento, data: dataPadrao,
    hora: "", patient_id: "", lead_id: "", link_reuniao: "", cor: "",
  });

  React.useEffect(() => {
    if (evento === undefined) return;
    setForm({
      titulo: evento?.titulo ?? "", descricao: evento?.descricao ?? "",
      tipo: evento?.tipo ?? "tarefa", data: evento?.data ?? dataPadrao,
      hora: evento?.hora?.slice(0, 5) ?? "", patient_id: evento?.patientId ?? "",
      lead_id: evento?.leadId ?? "", link_reuniao: evento?.linkReuniao ?? "", cor: evento?.cor ?? "",
    });
  }, [evento, dataPadrao]);

  return (
    <Dialog open={evento !== undefined} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{evento ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await salvar.mutateAsync({
              ...(evento?.origemId ? { id: evento.origemId } : {}),
              titulo: form.titulo.trim(), descricao: form.descricao || null, tipo: form.tipo,
              data: form.data, hora: form.hora || null,
              patient_id: form.patient_id || null, lead_id: form.lead_id || null,
              link_reuniao: form.link_reuniao || null, cor: form.cor || null,
            } as any);
            onFechar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ev-titulo">Título *</Label>
            <Input id="ev-titulo" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição</Label>
            <Textarea id="ev-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoEvento })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROTULOS_TIPO) as TipoEvento[]).map((t) => (
                    <SelectItem key={t} value={t}>{ROTULOS_TIPO[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-data">Data</Label>
              <Input id="ev-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-hora">Hora</Label>
              <Input id="ev-hora" type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Paciente</Label>
              <Select value={form.patient_id || undefined} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Select value={form.lead_id || undefined} onValueChange={(v) => setForm({ ...form, lead_id: v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-link">Link da reunião</Label>
              <Input id="ev-link" value={form.link_reuniao} onChange={(e) => setForm({ ...form, link_reuniao: e.target.value })} placeholder="https://meet…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-cor">Cor</Label>
              <Input id="ev-cor" type="color" value={form.cor || "#071739"} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 p-1" />
            </div>
          </div>

          <DialogFooter>
            {evento?.origemId && (
              <Button
                type="button" variant="ghost" className="mr-auto text-destructive"
                onClick={() => remover.mutate(evento.origemId, { onSuccess: onFechar })}
              >
                <Trash2 /> Excluir
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Check />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
