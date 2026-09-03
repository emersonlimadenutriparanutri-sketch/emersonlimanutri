import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Link2, Copy, RefreshCw, ClipboardList, Send,
  MessageCircle, Loader2, GripVertical, Sparkles, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { fmtData, fmtDataHora, linkWhatsapp } from "@/lib/format";
import { uid, cn } from "@/lib/utils";
import type {
  Paciente, Pergunta, QuestionarioEnvio, QuestionarioModelo, QuestionarioResposta, TipoPergunta,
} from "@/types/db";

const TIPOS: { valor: TipoPergunta; rotulo: string }[] = [
  { valor: "texto", rotulo: "Texto curto" },
  { valor: "textarea", rotulo: "Texto longo" },
  { valor: "numero", rotulo: "Número" },
  { valor: "escolha_unica", rotulo: "Escolha única" },
  { valor: "multipla", rotulo: "Múltipla escolha" },
  { valor: "escala", rotulo: "Escala" },
  { valor: "data", rotulo: "Data" },
  { valor: "upload", rotulo: "Envio de arquivo" },
];

type Secao = "modelos" | "envios" | "respostas";

export default function AbaQuestionarios() {
  const [secao, setSecao] = React.useState<Secao>("modelos");

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {([["modelos", "Modelos"], ["envios", "Envios"], ["respostas", "Respostas"]] as const).map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setSecao(chave)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              secao === chave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {secao === "modelos" && <Modelos />}
      {secao === "envios" && <Envios />}
      {secao === "respostas" && <Respostas />}
    </div>
  );
}

/* ------------------------------ Modelos ------------------------------ */
function Modelos() {
  const { data: modelos = [] } = useLista<QuestionarioModelo>("questionario_modelos", { ordenarPor: "titulo", crescente: true });
  const remover = useRemover("questionario_modelos", "Modelo removido.");
  const [editando, setEditando] = React.useState<QuestionarioModelo | null | undefined>(undefined);
  const [paraExcluir, setParaExcluir] = React.useState<QuestionarioModelo | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Monte uma vez, envie quantas vezes quiser.</p>
        <Button onClick={() => setEditando(null)}><Plus /> Novo modelo</Button>
      </div>

      {modelos.length === 0 ? (
        <EmptyState icone={<ClipboardList />} titulo="Nenhum modelo" descricao="Crie o seu primeiro questionário." acao={<Button onClick={() => setEditando(null)}><Plus /> Novo modelo</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modelos.map((m) => (
            <div key={m.id} className="card-surface flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-semibold">{m.titulo}</h3>
                {!m.ativo && <Badge variant="muted">Inativo</Badge>}
              </div>
              {m.descricao && <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{m.descricao}</p>}
              <p className="mt-4 text-xs text-muted-foreground">{m.perguntas?.length ?? 0} perguntas</p>
              <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setEditando(m)}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(m)}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EditorModelo modelo={editando} onFechar={() => setEditando(undefined)} />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir modelo" destrutivo confirmar="Excluir"
        descricao={`"${paraExcluir?.titulo}" e todos os envios ligados a ele serão removidos.`}
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function EditorModelo({ modelo, onFechar }: { modelo: QuestionarioModelo | null | undefined; onFechar: () => void }) {
  const salvar = useSalvar<QuestionarioModelo>("questionario_modelos", "Modelo salvo.");
  const [titulo, setTitulo] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [ativo, setAtivo] = React.useState(true);
  const [perguntas, setPerguntas] = React.useState<Pergunta[]>([]);

  React.useEffect(() => {
    if (modelo === undefined) return;
    setTitulo(modelo?.titulo ?? "");
    setDescricao(modelo?.descricao ?? "");
    setAtivo(modelo?.ativo ?? true);
    setPerguntas(modelo?.perguntas ?? []);
  }, [modelo]);

  const atualizar = (id: string, campos: Partial<Pergunta>) =>
    setPerguntas((ps) => ps.map((p) => (p.id === id ? { ...p, ...campos } : p)));

  const mover = (indice: number, direcao: -1 | 1) =>
    setPerguntas((ps) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= ps.length) return ps;
      const copia = [...ps];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (perguntas.length === 0) return toast.error("Adicione ao menos uma pergunta.");
    await salvar.mutateAsync({
      ...(modelo?.id ? { id: modelo.id } : {}),
      titulo: titulo.trim(), descricao: descricao || null, ativo, perguntas,
    } as any);
    onFechar();
  };

  return (
    <Dialog open={modelo !== undefined} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{modelo ? "Editar modelo" : "Novo modelo"}</DialogTitle>
          <DialogDescription>As respostas ficam na ficha do paciente e podem ser resumidas por IA.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="q-titulo">Título *</Label>
            <Input id="q-titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-desc">Descrição / instrução</Label>
            <Textarea id="q-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Aparece no topo do formulário público." />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Perguntas ({perguntas.length})</Label>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setPerguntas((ps) => [...ps, { id: uid("q"), tipo: "texto", titulo: "", obrigatoria: false }])}>
                <Plus /> Adicionar
              </Button>
            </div>

            {perguntas.map((p, i) => (
              <div key={p.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col pt-1.5 text-muted-foreground">
                    <button type="button" onClick={() => mover(i, -1)} className="text-[10px] hover:text-foreground">▲</button>
                    <GripVertical className="h-3 w-3" />
                    <button type="button" onClick={() => mover(i, 1)} className="text-[10px] hover:text-foreground">▼</button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input value={p.titulo} onChange={(e) => atualizar(p.id, { titulo: e.target.value })} placeholder={`Pergunta ${i + 1}`} />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Select value={p.tipo} onValueChange={(v) => atualizar(p.id, { tipo: v as TipoPergunta })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}</SelectContent>
                      </Select>
                      {p.tipo === "escala" && (
                        <>
                          <Input type="number" value={p.min ?? 0} onChange={(e) => atualizar(p.id, { min: Number(e.target.value) })} placeholder="Mínimo" />
                          <Input type="number" value={p.max ?? 10} onChange={(e) => atualizar(p.id, { max: Number(e.target.value) })} placeholder="Máximo" />
                        </>
                      )}
                      {(p.tipo === "escolha_unica" || p.tipo === "multipla") && (
                        <Input
                          className="sm:col-span-2"
                          value={(p.opcoes ?? []).join(", ")}
                          onChange={(e) => atualizar(p.id, { opcoes: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                          placeholder="Opções separadas por vírgula"
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={Boolean(p.obrigatoria)} onCheckedChange={(v) => atualizar(p.id, { obrigatoria: v })} />
                      Obrigatória
                    </label>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-destructive"
                    onClick={() => setPerguntas((ps) => ps.filter((x) => x.id !== p.id))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm font-medium">Modelo ativo</span>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" />} Salvar modelo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Envios ------------------------------ */
function Envios() {
  const { data: envios = [] } = useLista<QuestionarioEnvio>("questionario_envios");
  const { data: modelos = [] } = useLista<QuestionarioModelo>("questionario_modelos", { filtros: { ativo: true }, ordenarPor: "titulo", crescente: true });
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });
  const salvar = useSalvar<QuestionarioEnvio>("questionario_envios", "Envio criado.");
  const remover = useRemover("questionario_envios", "Link removido.");

  const [modeloId, setModeloId] = React.useState("");
  const [pacienteId, setPacienteId] = React.useState("");

  const urlPublica = (token: string) => `${window.location.origin}/q/${token}`;

  const copiar = async (token: string) => {
    await navigator.clipboard.writeText(urlPublica(token));
    toast.success("Link copiado.");
  };

  const compartilharWhatsapp = (envio: QuestionarioEnvio) => {
    const modelo = modelos.find((m) => m.id === envio.modelo_id);
    const paciente = pacientes.find((p) => p.id === envio.patient_id);
    // Título em negrito e link no fim para o WhatsApp não gerar miniatura de preview.
    const texto = [
      paciente ? `Oi, ${paciente.nome.split(" ")[0]}!` : "Oi!",
      "",
      `*${modelo?.titulo ?? "Questionário"}*`,
      modelo?.descricao ?? "Preencha quando puder, leva poucos minutos.",
      "",
      urlPublica(envio.token),
    ].join("\n");
    const href = linkWhatsapp(paciente?.telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(href, "_top");
  };

  const gerarNovoLink = async (envio: QuestionarioEnvio) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    await salvar.mutateAsync({ id: envio.id, token, respondido: false } as any);
  };

  return (
    <div className="space-y-4">
      <form
        className="card-surface flex flex-wrap items-end gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!modeloId) return toast.error("Escolha um modelo.");
          const paciente = pacientes.find((p) => p.id === pacienteId);
          await salvar.mutateAsync({
            modelo_id: modeloId,
            patient_id: pacienteId || null,
            destinatario: paciente?.nome ?? null,
          } as any);
          setPacienteId("");
        }}
      >
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label>Modelo</Label>
          <Select value={modeloId || undefined} onValueChange={setModeloId}>
            <SelectTrigger><SelectValue placeholder="Selecione o questionário" /></SelectTrigger>
            <SelectContent>{modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.titulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label>Paciente (opcional)</Label>
          <Select value={pacienteId || undefined} onValueChange={setPacienteId}>
            <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
            <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button type="submit"><Send /> Gerar link</Button>
      </form>

      {envios.length === 0 ? (
        <EmptyState icone={<Link2 />} titulo="Nenhum link gerado" descricao="Gere um link único e envie pelo WhatsApp — o paciente responde sem precisar de login." />
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {envios.map((e) => {
            const modelo = modelos.find((m) => m.id === e.modelo_id);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="truncate text-sm font-medium">{modelo?.titulo ?? "Modelo removido"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.destinatario ?? "Sem destinatário"} · criado em {fmtData(e.created_at)}
                    {e.respondido && e.respondido_em && ` · respondido em ${fmtDataHora(e.respondido_em)}`}
                  </p>
                </div>
                <Badge variant={e.respondido ? "success" : "muted"}>{e.respondido ? "Respondido" : "Aguardando"}</Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" title="Copiar link" onClick={() => copiar(e.token)}><Copy /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-success" title="Enviar no WhatsApp" onClick={() => compartilharWhatsapp(e)}><MessageCircle /></Button>
                  <Button variant="ghost" size="icon-sm" title="Gerar novo link" onClick={() => gerarNovoLink(e)}><RefreshCw /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" title="Remover" onClick={() => remover.mutate(e.id)}><Trash2 /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Respostas ------------------------------ */
function Respostas() {
  const { data: respostas = [] } = useLista<QuestionarioResposta>("questionario_respostas");
  const { data: modelos = [] } = useLista<QuestionarioModelo>("questionario_modelos");
  const { data: pacientes = [] } = useLista<Paciente>("patients");
  const salvar = useSalvar<QuestionarioResposta>("questionario_respostas", "Resumo gerado.");
  const [gerando, setGerando] = React.useState<string | null>(null);
  const [aberta, setAberta] = React.useState<QuestionarioResposta | null>(null);

  const resumir = async (r: QuestionarioResposta) => {
    setGerando(r.id);
    try {
      const modelo = modelos.find((m) => m.id === r.modelo_id);
      const paciente = pacientes.find((p) => p.id === r.patient_id);
      const { texto } = await chamarIA<{ texto: string }>("resumo-questionario", {
        titulo: modelo?.titulo,
        paciente: paciente?.nome,
        perguntas: modelo?.perguntas,
        respostas: r.respostas,
      });
      await salvar.mutateAsync({ id: r.id, resumo_ia: texto } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setGerando(null);
    }
  };

  if (respostas.length === 0) {
    return <EmptyState icone={<FileText />} titulo="Nenhuma resposta ainda" descricao="Assim que o paciente responder, a ficha aparece aqui." />;
  }

  return (
    <>
      <div className="card-surface divide-y divide-border overflow-hidden">
        {respostas.map((r) => {
          const modelo = modelos.find((m) => m.id === r.modelo_id);
          const paciente = pacientes.find((p) => p.id === r.patient_id);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-sm font-medium">{modelo?.titulo ?? "Questionário"}</p>
                <p className="text-xs text-muted-foreground">
                  {paciente?.nome ?? "Sem paciente vinculado"} · {fmtDataHora(r.created_at)}
                </p>
              </div>
              {r.resumo_ia && <Badge variant="secondary">Resumo pronto</Badge>}
              <Button variant="outline" size="sm" onClick={() => setAberta(r)}>Ver respostas</Button>
              <Button variant="ghost" size="sm" disabled={gerando === r.id} onClick={() => resumir(r)}>
                {gerando === r.id ? <Loader2 className="animate-spin" /> : <Sparkles />} Resumir
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(aberta)} onOpenChange={(v) => !v && setAberta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modelos.find((m) => m.id === aberta?.modelo_id)?.titulo ?? "Respostas"}</DialogTitle>
            <DialogDescription>{fmtDataHora(aberta?.created_at)}</DialogDescription>
          </DialogHeader>

          {aberta?.resumo_ia && (
            <div className="rounded-xl bg-secondary-soft p-4">
              <p className="seal mb-2 text-secondary-foreground">Resumo clínico</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{aberta.resumo_ia}</p>
            </div>
          )}

          <div className="space-y-3">
            {(modelos.find((m) => m.id === aberta?.modelo_id)?.perguntas ?? []).map((p) => {
              const valor = aberta?.respostas?.[p.id];
              return (
                <div key={p.id} className="border-b border-border pb-2 last:border-0">
                  <p className="text-xs text-muted-foreground">{p.titulo}</p>
                  <p className="mt-0.5 text-sm">
                    {valor === undefined || valor === "" ? "—" : Array.isArray(valor) ? valor.join(", ") : String(valor)}
                  </p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
