import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Route, CalendarClock, AlertTriangle,
  Check, Copy, Paperclip, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsappButton } from "@/components/shared/whatsapp-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UploadArquivo } from "@/components/shared/upload-arquivo";
import { useLista, useRemover, useSalvar, useSalvarLote } from "@/hooks/use-crud";
import { supabase } from "@/lib/supabase";
import { tarefasDoTemplate } from "@/lib/jornada";
import { fmtData, hojeISO, diasAte, dataLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { JornadaTemplate, Paciente, TarefaJornada } from "@/types/db";

export default function AbaJornada({ paciente }: PropsAbaPaciente) {
  const { data: tarefas = [], isLoading } = useLista<TarefaJornada>("jornada", {
    filtros: { patient_id: paciente.id }, ordenarPor: "ordem", crescente: true,
  });
  const { data: templates = [] } = useLista<JornadaTemplate>("jornada_templates", { ordenarPor: "nome", crescente: true });
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });

  const salvar = useSalvar<TarefaJornada>("jornada", "");
  const salvarLote = useSalvarLote("jornada", "Jornada criada.");
  const remover = useRemover("jornada", "Tarefa removida.");

  const [aplicando, setAplicando] = React.useState(false);
  const [novaTarefa, setNovaTarefa] = React.useState<{ mes: number; semana: number } | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<TarefaJornada | null>(null);

  const diasParaVencer = diasAte(paciente.plano_vencimento);
  const criticoVencimento = diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 5;

  const meses = React.useMemo(() => {
    const mapa = new Map<number, Map<number, TarefaJornada[]>>();
    for (const t of [...tarefas].sort((a, b) => a.mes - b.mes || a.semana - b.semana || a.ordem - b.ordem)) {
      if (!mapa.has(t.mes)) mapa.set(t.mes, new Map());
      const semanas = mapa.get(t.mes)!;
      if (!semanas.has(t.semana)) semanas.set(t.semana, []);
      semanas.get(t.semana)!.push(t);
    }
    return [...mapa.entries()];
  }, [tarefas]);

  const concluidas = tarefas.filter((t) => t.concluida).length;
  const progresso = tarefas.length ? (concluidas / tarefas.length) * 100 : 0;

  return (
    <div className="space-y-5">
      {criticoVencimento && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              Plano vence em {diasParaVencer === 0 ? "hoje" : `${diasParaVencer} dia${diasParaVencer! > 1 ? "s" : ""}`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Momento de conversar sobre renovação — antes do vencimento, não depois.
            </p>
          </div>
          <WhatsappButton
            telefone={paciente.telefone} rotulo="Falar agora"
            mensagem={`Oi, ${paciente.nome.split(" ")[0]}! Vamos falar sobre a continuidade do seu acompanhamento?`}
          />
        </div>
      )}

      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="seal text-muted-foreground">Progresso da jornada</span>
            <span className="text-sm text-muted-foreground">{concluidas} de {tarefas.length}</span>
          </div>
          <Progress value={progresso} className="mt-3" indicatorClassName="bg-secondary" />
        </div>
        <Button variant="outline" onClick={() => setAplicando(true)}>
          <Copy /> {tarefas.length ? "Aplicar outra jornada" : "Criar jornada"}
        </Button>
      </div>

      {isLoading ? null : tarefas.length === 0 ? (
        <EmptyState
          icone={<Route />} titulo="Nenhuma jornada criada"
          descricao="Aplique a jornada modelo, use um template ou copie a jornada de outro paciente."
          acao={<Button onClick={() => setAplicando(true)}><Plus /> Criar jornada</Button>}
        />
      ) : (
        <div className="space-y-4">
          {meses.map(([mes, semanas]) => (
            <BlocoMes
              key={mes} mes={mes} semanas={semanas} paciente={paciente}
              salvar={salvar} aoExcluir={setParaExcluir} aoAdicionar={(semana) => setNovaTarefa({ mes, semana })}
            />
          ))}
        </div>
      )}

      <DialogAplicarJornada
        aberto={aplicando} onOpenChange={setAplicando}
        paciente={paciente} templates={templates}
        pacientes={pacientes.filter((p) => p.id !== paciente.id)}
        salvarLote={salvarLote} temTarefas={tarefas.length > 0}
      />

      <DialogNovaTarefa
        posicao={novaTarefa} onOpenChange={() => setNovaTarefa(null)}
        pacienteId={paciente.id} salvar={salvar} totalTarefas={tarefas.length}
      />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir tarefa" destrutivo confirmar="Excluir"
        descricao={paraExcluir?.titulo}
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function BlocoMes({
  mes, semanas, paciente, salvar, aoExcluir, aoAdicionar,
}: {
  mes: number;
  semanas: Map<number, TarefaJornada[]>;
  paciente: Paciente;
  salvar: ReturnType<typeof useSalvar<TarefaJornada>>;
  aoExcluir: (t: TarefaJornada) => void;
  aoAdicionar: (semana: number) => void;
}) {
  const [aberto, setAberto] = React.useState(true);
  const todas = [...semanas.values()].flat();
  const feitas = todas.filter((t) => t.concluida).length;

  return (
    <div className="card-surface overflow-hidden">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 border-b border-border bg-primary px-5 py-3 text-left text-primary-foreground"
      >
        <span className="seal text-secondary">Mês {mes}</span>
        <span className="ml-auto text-xs text-primary-foreground/70">{feitas}/{todas.length} concluídas</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !aberto && "-rotate-90")} />
      </button>

      {aberto && (
        <div className="divide-y divide-border">
          {[...semanas.entries()].map(([semana, tarefas]) => (
            <div key={semana} className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Semana {semana}</p>
                <Button variant="ghost" size="sm" onClick={() => aoAdicionar(semana)}><Plus /> Tarefa</Button>
              </div>

              <div className="space-y-2">
                {tarefas.map((t) => (
                  <LinhaTarefa key={t.id} tarefa={t} paciente={paciente} salvar={salvar} aoExcluir={() => aoExcluir(t)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaTarefa({
  tarefa, paciente, salvar, aoExcluir,
}: {
  tarefa: TarefaJornada; paciente: Paciente;
  salvar: ReturnType<typeof useSalvar<TarefaJornada>>; aoExcluir: () => void;
}) {
  const [expandida, setExpandida] = React.useState(false);
  const atrasada = !tarefa.concluida && tarefa.data_prevista && tarefa.data_prevista < hojeISO();

  return (
    <div className={cn("rounded-xl border border-border p-3", tarefa.concluida && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-0.5"
          checked={tarefa.concluida}
          onCheckedChange={(v) =>
            salvar.mutate({
              id: tarefa.id, concluida: Boolean(v),
              concluida_em: v ? new Date().toISOString() : null,
            } as any)
          }
        />
        <button onClick={() => setExpandida((e) => !e)} className="min-w-0 flex-1 text-left">
          <p className={cn("text-sm font-medium", tarefa.concluida && "text-muted-foreground line-through")}>{tarefa.titulo}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {tarefa.data_prevista && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> {fmtData(tarefa.data_prevista)}
              </span>
            )}
            {tarefa.tipo && <span className="capitalize">{tarefa.tipo.replace("_", " ")}</span>}
            {(tarefa.anexos ?? []).length > 0 && (
              <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> {tarefa.anexos.length}</span>
            )}
          </p>
        </button>

        {atrasada && <Badge variant="danger">Atrasada</Badge>}
        <WhatsappButton
          telefone={paciente.telefone}
          mensagem={`Oi, ${paciente.nome.split(" ")[0]}! ${tarefa.titulo}`}
        />
        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={aoExcluir}><Trash2 /></Button>
      </div>

      {expandida && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Textarea
            defaultValue={tarefa.descricao ?? ""}
            placeholder="Detalhes, roteiro da mensagem, o que checar…"
            onBlur={(e) => {
              if (e.target.value !== (tarefa.descricao ?? "")) salvar.mutate({ id: tarefa.id, descricao: e.target.value || null } as any);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date" className="w-[170px]" defaultValue={tarefa.data_prevista ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (tarefa.data_prevista ?? "")) salvar.mutate({ id: tarefa.id, data_prevista: e.target.value || null } as any);
              }}
            />
            <UploadArquivo
              bucket="lesson-materials" prefixo={`jornada/${tarefa.patient_id}`}
              aoEnviar={(d) => d && salvar.mutate({ id: tarefa.id, anexos: [...(tarefa.anexos ?? []), { nome: d.nome, url: d.caminho }] } as any)}
              rotulo="Anexar material"
            />
          </div>
          {(tarefa.anexos ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tarefa.anexos.map((a, i) => (
                <UploadArquivo
                  key={i} bucket="lesson-materials" arquivoUrl={a.url} arquivoNome={a.nome}
                  aoEnviar={() => salvar.mutate({ id: tarefa.id, anexos: tarefa.anexos.filter((_, idx) => idx !== i) } as any)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DialogAplicarJornada({
  aberto, onOpenChange, paciente, templates, pacientes, salvarLote, temTarefas,
}: {
  aberto: boolean; onOpenChange: (v: boolean) => void; paciente: Paciente;
  templates: JornadaTemplate[]; pacientes: Paciente[];
  salvarLote: ReturnType<typeof useSalvarLote>; temTarefas: boolean;
}) {
  const [fonte, setFonte] = React.useState<"template" | "paciente">("template");
  const [templateId, setTemplateId] = React.useState("");
  const [pacienteId, setPacienteId] = React.useState("");
  const [inicio, setInicio] = React.useState(paciente.plano_inicio ?? hojeISO());
  const [copiando, setCopiando] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setTemplateId(templates.find((t) => t.padrao)?.id ?? templates[0]?.id ?? "");
  }, [aberto, templates]);

  const aplicar = async () => {
    const base = dataLocal(inicio) ?? new Date();

    if (fonte === "template") {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return toast.error("Escolha um template.");
      await salvarLote.mutateAsync(tarefasDoTemplate(template, paciente.id, base));
    } else {
      if (!pacienteId) return toast.error("Escolha o paciente de origem.");
      setCopiando(true);
      try {
        const { data, error } = await supabase
          .from("jornada").select("*").eq("patient_id", pacienteId).order("ordem", { ascending: true });
        if (error) throw error;
        if (!data?.length) return toast.error("Esse paciente não tem jornada para copiar.");
        // Copia a estrutura, zera o progresso e reancora as datas no novo início.
        const origem = dataLocal((data[0] as TarefaJornada).data_prevista) ?? base;
        await salvarLote.mutateAsync(
          data.map((t: any) => {
            const prevista = dataLocal(t.data_prevista);
            const deslocamento = prevista ? Math.round((prevista.getTime() - origem.getTime()) / 86400000) : 0;
            const nova = new Date(base);
            nova.setDate(nova.getDate() + deslocamento);
            return {
              patient_id: paciente.id, mes: t.mes, semana: t.semana, titulo: t.titulo,
              descricao: t.descricao, tipo: t.tipo, ordem: t.ordem,
              data_prevista: t.data_prevista ? nova.toISOString().slice(0, 10) : null,
              concluida: false, anexos: [],
            };
          }),
        );
      } catch (erro: any) {
        toast.error(erro.message);
      } finally {
        setCopiando(false);
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar jornada do paciente</DialogTitle>
          <DialogDescription>
            {temTarefas
              ? "As tarefas novas são somadas às que já existem — nada é apagado."
              : "As datas são ancoradas na data de início escolhida."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {([["template", "A partir de um template"], ["paciente", "Copiar de outro paciente"]] as const).map(([chave, rotulo]) => (
              <button
                key={chave} onClick={() => setFonte(chave)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                  fonte === chave ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {fonte === "template" ? (
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId || undefined} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}{t.padrao ? " (padrão)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Paciente de origem</Label>
              <Select value={pacienteId || undefined} onValueChange={setPacienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="j-inicio">Início do acompanhamento</Label>
            <Input id="j-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={aplicar} disabled={salvarLote.isPending || copiando}>
            {(salvarLote.isPending || copiando) ? <Loader2 className="animate-spin" /> : <Check />} Aplicar jornada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogNovaTarefa({
  posicao, onOpenChange, pacienteId, salvar, totalTarefas,
}: {
  posicao: { mes: number; semana: number } | null; onOpenChange: () => void;
  pacienteId: string; salvar: ReturnType<typeof useSalvar<TarefaJornada>>; totalTarefas: number;
}) {
  const [titulo, setTitulo] = React.useState("");
  const [tipo, setTipo] = React.useState("tarefa");
  const [data, setData] = React.useState(hojeISO());

  React.useEffect(() => {
    if (posicao) { setTitulo(""); setTipo("tarefa"); setData(hojeISO()); }
  }, [posicao]);

  return (
    <Dialog open={Boolean(posicao)} onOpenChange={(v) => !v && onOpenChange()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>Mês {posicao?.mes}, semana {posicao?.semana}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nt-titulo">Título</Label>
            <Input id="nt-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: enviar material sobre proteína" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["tarefa", "consulta", "raio_x", "contato", "lembrete", "envio_material", "ajuste_plano", "retorno", "outro"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-data">Data prevista</Label>
              <Input id="nt-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onOpenChange}>Cancelar</Button>
          <Button
            disabled={!titulo.trim() || salvar.isPending}
            onClick={async () => {
              await salvar.mutateAsync({
                patient_id: pacienteId, mes: posicao!.mes, semana: posicao!.semana,
                titulo: titulo.trim(), tipo, data_prevista: data, ordem: totalTarefas,
              } as any);
              onOpenChange();
            }}
          >
            {salvar.isPending && <Loader2 className="animate-spin" />} Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
