import * as React from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Trash2, KanbanSquare, Loader2, CalendarClock, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar, useSalvarLote } from "@/hooks/use-crud";
import { fmtData, hojeISO } from "@/lib/format";
import { cn, uid } from "@/lib/utils";
import type { KanbanBoard, KanbanCard, KanbanColumn } from "@/types/db";

export default function ProjetosTarefas() {
  const { data: quadros = [] } = useLista<KanbanBoard>("kanban_boards", { ordenarPor: "ordem", crescente: true });
  const { data: colunas = [] } = useLista<KanbanColumn>("kanban_columns", { ordenarPor: "ordem", crescente: true });
  const { data: cards = [] } = useLista<KanbanCard>("kanban_cards", { ordenarPor: "ordem", crescente: true });

  const salvarQuadro = useSalvar<KanbanBoard>("kanban_boards", "Quadro salvo.");
  const salvarColuna = useSalvar<KanbanColumn>("kanban_columns", "");
  const salvarCard = useSalvar<KanbanCard>("kanban_cards", "");
  const removerCard = useRemover("kanban_cards", "Card removido.");
  const removerQuadro = useRemover("kanban_boards", "Quadro removido.");
  const salvarColunasLote = useSalvarLote("kanban_columns", "");

  const [quadroId, setQuadroId] = React.useState("");
  const [novoQuadro, setNovoQuadro] = React.useState(false);
  const [nomeQuadro, setNomeQuadro] = React.useState("");
  const [cardAberto, setCardAberto] = React.useState<KanbanCard | null>(null);
  const [novoEm, setNovoEm] = React.useState<string | null>(null);
  const [excluirQuadro, setExcluirQuadro] = React.useState(false);

  React.useEffect(() => {
    if (!quadroId && quadros.length) setQuadroId(quadros[0].id);
  }, [quadros, quadroId]);

  const colunasDoQuadro = colunas.filter((c) => c.board_id === quadroId);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const aoSoltar = (e: DragEndEvent) => {
    const card = cards.find((c) => c.id === e.active.id);
    const destino = e.over?.id as string | undefined;
    if (!card || !destino || card.column_id === destino) return;
    salvarCard.mutate({ id: card.id, column_id: destino } as any);
  };

  const criarQuadro = async () => {
    const quadro = await salvarQuadro.mutateAsync({ nome: nomeQuadro.trim(), ordem: quadros.length } as any);
    await salvarColunasLote.mutateAsync(
      ["A fazer", "Fazendo", "Concluído"].map((nome, i) => ({ board_id: quadro.id, nome, ordem: i })),
    );
    setQuadroId(quadro.id);
    setNomeQuadro("");
    setNovoQuadro(false);
  };

  if (quadros.length === 0) {
    return (
      <>
        <EmptyState
          icone={<KanbanSquare />} titulo="Nenhum quadro criado"
          descricao="Organize lançamentos, conteúdo, estudos e processos do consultório em quadros."
          acao={<Button onClick={() => setNovoQuadro(true)}><Plus /> Criar quadro</Button>}
        />
        <DialogNovoQuadro
          aberto={novoQuadro} onOpenChange={setNovoQuadro}
          nome={nomeQuadro} setNome={setNomeQuadro} criar={criarQuadro} carregando={salvarQuadro.isPending}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={quadroId || undefined} onValueChange={setQuadroId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione o quadro" /></SelectTrigger>
          <SelectContent>{quadros.map((q) => <SelectItem key={q.id} value={q.id}>{q.nome}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setNovoQuadro(true)}><Plus /> Novo quadro</Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => salvarColuna.mutate({ board_id: quadroId, nome: "Nova coluna", ordem: colunasDoQuadro.length } as any)}
        >
          <Plus /> Nova coluna
        </Button>
        <Button variant="ghost" size="icon-sm" className="ml-auto text-destructive" onClick={() => setExcluirQuadro(true)}>
          <Trash2 />
        </Button>
      </div>

      <DndContext sensors={sensores} onDragEnd={aoSoltar}>
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {colunasDoQuadro.map((coluna) => (
            <ColunaKanban
              key={coluna.id} coluna={coluna}
              cards={cards.filter((c) => c.column_id === coluna.id)}
              aoRenomear={(nome) => salvarColuna.mutate({ id: coluna.id, nome } as any)}
              aoAdicionar={() => setNovoEm(coluna.id)}
              aoAbrirCard={setCardAberto}
            />
          ))}
        </div>
      </DndContext>

      <DialogNovoQuadro
        aberto={novoQuadro} onOpenChange={setNovoQuadro}
        nome={nomeQuadro} setNome={setNomeQuadro} criar={criarQuadro} carregando={salvarQuadro.isPending}
      />

      <DialogCard
        card={cardAberto} colunaNova={novoEm}
        onFechar={() => { setCardAberto(null); setNovoEm(null); }}
        salvar={salvarCard} remover={removerCard} totalCards={cards.length}
      />

      <ConfirmDialog
        aberto={excluirQuadro} onOpenChange={setExcluirQuadro}
        titulo="Excluir quadro" destrutivo confirmar="Excluir"
        descricao="As colunas e cards deste quadro serão removidos."
        onConfirmar={() => { removerQuadro.mutate(quadroId); setQuadroId(""); setExcluirQuadro(false); }}
      />
    </div>
  );
}

function ColunaKanban({
  coluna, cards, aoRenomear, aoAdicionar, aoAbrirCard,
}: {
  coluna: KanbanColumn; cards: KanbanCard[];
  aoRenomear: (nome: string) => void; aoAdicionar: () => void; aoAbrirCard: (c: KanbanCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });

  return (
    <div
      ref={setNodeRef}
      className={cn("flex w-[280px] shrink-0 flex-col rounded-2xl border border-border/70 bg-muted/40 transition-colors", isOver && "border-secondary bg-secondary-soft/60")}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.cor ?? "hsl(var(--muted-foreground))" }} />
        <input
          defaultValue={coluna.nome}
          onBlur={(e) => e.target.value !== coluna.nome && aoRenomear(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide outline-none focus:underline"
        />
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{cards.length}</span>
      </div>

      <div className="flex-1 space-y-2 px-2">
        {cards.map((card) => <CardKanban key={card.id} card={card} aoAbrir={() => aoAbrirCard(card)} />)}
      </div>

      <Button variant="ghost" size="sm" className="m-2 justify-start text-muted-foreground" onClick={aoAdicionar}>
        <Plus /> Adicionar card
      </Button>
    </div>
  );
}

function CardKanban({ card, aoAbrir }: { card: KanbanCard; aoAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const feitos = (card.checklist ?? []).filter((i) => i.feito).length;

  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      onClick={aoAbrir}
      className={cn("card-surface cursor-grab space-y-2 p-3 active:cursor-grabbing", isDragging && "opacity-40")}
      style={card.cor ? { borderLeft: `3px solid ${card.cor}` } : undefined}
    >
      <p className="text-sm font-medium">{card.titulo}</p>
      {card.descricao && <p className="line-clamp-2 text-[11px] text-muted-foreground">{card.descricao}</p>}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {card.data_limite && (
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {fmtData(card.data_limite)}</span>
        )}
        {(card.checklist ?? []).length > 0 && (
          <span className="inline-flex items-center gap-1"><CheckSquare className="h-3 w-3" /> {feitos}/{card.checklist.length}</span>
        )}
      </div>
    </div>
  );
}

function DialogNovoQuadro({
  aberto, onOpenChange, nome, setNome, criar, carregando,
}: {
  aberto: boolean; onOpenChange: (v: boolean) => void;
  nome: string; setNome: (v: string) => void; criar: () => void; carregando: boolean;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo quadro</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="q-nome">Nome do quadro</Label>
          <Input id="q-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lançamento do curso" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={!nome.trim() || carregando}>
            {carregando && <Loader2 className="animate-spin" />} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogCard({
  card, colunaNova, onFechar, salvar, remover, totalCards,
}: {
  card: KanbanCard | null; colunaNova: string | null; onFechar: () => void;
  salvar: ReturnType<typeof useSalvar<KanbanCard>>;
  remover: ReturnType<typeof useRemover>; totalCards: number;
}) {
  const aberto = Boolean(card || colunaNova);
  const [form, setForm] = React.useState({ titulo: "", descricao: "", data_limite: "", cor: "" });
  const [checklist, setChecklist] = React.useState<{ id: string; texto: string; feito: boolean }[]>([]);
  const [novoItem, setNovoItem] = React.useState("");

  React.useEffect(() => {
    if (!aberto) return;
    setForm({
      titulo: card?.titulo ?? "", descricao: card?.descricao ?? "",
      data_limite: card?.data_limite ?? "", cor: card?.cor ?? "",
    });
    setChecklist(card?.checklist ?? []);
    setNovoItem("");
  }, [aberto, card]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{card ? "Editar card" : "Novo card"}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-titulo">Título *</Label>
            <Input id="c-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Descrição</Label>
            <Textarea id="c-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-data">Data limite</Label>
              <Input id="c-data" type="date" value={form.data_limite} onChange={(e) => setForm({ ...form, data_limite: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-cor">Cor</Label>
              <Input id="c-cor" type="color" className="h-10 p-1" value={form.cor || "#a68768"} onChange={(e) => setForm({ ...form, cor: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Checklist</Label>
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  checked={item.feito}
                  onCheckedChange={(v) => setChecklist((l) => l.map((i) => (i.id === item.id ? { ...i, feito: Boolean(v) } : i)))}
                />
                <span className={cn("flex-1 text-sm", item.feito && "text-muted-foreground line-through")}>{item.texto}</span>
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setChecklist((l) => l.filter((i) => i.id !== item.id))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={novoItem} onChange={(e) => setNovoItem(e.target.value)} placeholder="Novo item"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novoItem.trim()) {
                    e.preventDefault();
                    setChecklist((l) => [...l, { id: uid("chk"), texto: novoItem.trim(), feito: false }]);
                    setNovoItem("");
                  }
                }}
              />
              <Button
                type="button" variant="outline"
                onClick={() => {
                  if (!novoItem.trim()) return;
                  setChecklist((l) => [...l, { id: uid("chk"), texto: novoItem.trim(), feito: false }]);
                  setNovoItem("");
                }}
              >
                <Plus />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          {card && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={() => remover.mutate(card.id, { onSuccess: onFechar })}>
              <Trash2 /> Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            disabled={!form.titulo.trim() || salvar.isPending}
            onClick={async () => {
              await salvar.mutateAsync({
                ...(card?.id ? { id: card.id } : { column_id: colunaNova, ordem: totalCards }),
                titulo: form.titulo.trim(), descricao: form.descricao || null,
                data_limite: form.data_limite || null, cor: form.cor || null, checklist,
              } as any);
              onFechar();
            }}
          >
            {salvar.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
