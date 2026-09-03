import * as React from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, Brain, Loader2, Sparkles, ImageDown, FileDown,
  ArrowLeft, ZoomIn, ZoomOut, Maximize, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { exportarElemento } from "@/lib/pdf";
import { fmtData } from "@/lib/format";
import { uid, cn } from "@/lib/utils";
import type { MindMap, NoMapa } from "@/types/db";

/** Cores absolutas: o mapa exportado precisa ficar igual fora do app. */
const CORES_RAMO = ["#071739", "#a68768", "#1d6fa5", "#2f8f5b", "#a4443b", "#6b4b8a", "#b8862b"];

export default function MapasMentais() {
  const { data: mapas = [] } = useLista<MindMap>("mind_maps", { ordenarPor: "updated_at" });
  const salvar = useSalvar<MindMap>("mind_maps", "Mapa salvo.");
  const remover = useRemover("mind_maps", "Mapa removido.");

  const [abertoId, setAbertoId] = React.useState<string | null>(null);
  const [criando, setCriando] = React.useState(false);
  const [tema, setTema] = React.useState("");
  const [gerandoIA, setGerandoIA] = React.useState(false);
  const [paraExcluir, setParaExcluir] = React.useState<MindMap | null>(null);

  const mapaAberto = mapas.find((m) => m.id === abertoId);

  const criarMapa = async (comIA: boolean) => {
    if (!tema.trim()) return toast.error("Escreva o tema do mapa.");
    setGerandoIA(comIA);
    try {
      let nos: NoMapa[];
      if (comIA) {
        const resposta = await chamarIA<{ nos: { id: string; parentId: string | null; texto: string }[] }>("gerar-mapa-mental", { tema: tema.trim() });
        nos = distribuir(resposta.nos ?? []);
      } else {
        nos = [{ id: uid("no"), parentId: null, texto: tema.trim(), x: 0, y: 0, cor: CORES_RAMO[0] }];
      }
      const mapa = await salvar.mutateAsync({ titulo: tema.trim(), nos } as any);
      setAbertoId(mapa.id);
      setCriando(false);
      setTema("");
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setGerandoIA(false);
    }
  };

  if (mapaAberto) {
    return <EditorMapa mapa={mapaAberto} salvar={salvar} aoVoltar={() => setAbertoId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Para estruturar aula, conteúdo, protocolo ou o raciocínio de um caso clínico.
        </p>
        <Button onClick={() => setCriando(true)}><Plus /> Novo mapa</Button>
      </div>

      {mapas.length === 0 ? (
        <EmptyState
          icone={<Brain />} titulo="Nenhum mapa mental"
          descricao="Crie um mapa em branco ou peça para a IA montar a estrutura a partir de um tema."
          acao={<Button onClick={() => setCriando(true)}><Plus /> Novo mapa</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mapas.map((m) => (
            <div key={m.id} className="card-surface flex flex-col p-5">
              <h3 className="font-display text-base font-semibold">{m.titulo}</h3>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">
                {m.nos?.length ?? 0} nós · atualizado em {fmtData(m.updated_at)}
              </p>
              <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => setAbertoId(m.id)}>Abrir</Button>
                <Button variant="ghost" size="icon-sm" className="ml-auto text-destructive" onClick={() => setParaExcluir(m)}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo mapa mental</DialogTitle>
            <DialogDescription>Escreva o tema central. A IA pode montar a estrutura inicial para você.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mm-tema">Tema</Label>
            <Textarea id="mm-tema" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: emagrecimento na perimenopausa" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => criarMapa(false)} disabled={salvar.isPending}>Criar em branco</Button>
            <Button onClick={() => criarMapa(true)} disabled={gerandoIA}>
              {gerandoIA ? <Loader2 className="animate-spin" /> : <Sparkles />} Gerar com IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir mapa" destrutivo confirmar="Excluir"
        descricao={paraExcluir?.titulo}
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

/** Distribui os nós em camadas radiais a partir da raiz. */
function distribuir(brutos: { id: string; parentId: string | null; texto: string }[]): NoMapa[] {
  const filhos = new Map<string | null, typeof brutos>();
  for (const n of brutos) {
    const chave = n.parentId ?? null;
    if (!filhos.has(chave)) filhos.set(chave, []);
    filhos.get(chave)!.push(n);
  }

  const posicionados: NoMapa[] = [];
  const raizes = filhos.get(null) ?? [];

  const percorrer = (no: (typeof brutos)[number], nivel: number, angulo: number, abertura: number, cor: string) => {
    const raio = nivel * 210;
    posicionados.push({
      id: no.id, parentId: no.parentId, texto: no.texto, cor,
      x: Math.round(Math.cos(angulo) * raio),
      y: Math.round(Math.sin(angulo) * raio),
    });
    const meus = filhos.get(no.id) ?? [];
    meus.forEach((filho, i) => {
      const passo = abertura / Math.max(meus.length, 1);
      const novoAngulo = angulo - abertura / 2 + passo * (i + 0.5);
      percorrer(filho, nivel + 1, novoAngulo, Math.max(passo * 0.9, 0.35), cor);
    });
  };

  raizes.forEach((raiz) => {
    posicionados.push({ id: raiz.id, parentId: null, texto: raiz.texto, x: 0, y: 0, cor: CORES_RAMO[0] });
    const ramos = filhos.get(raiz.id) ?? [];
    ramos.forEach((ramo, i) => {
      const angulo = (i / Math.max(ramos.length, 1)) * Math.PI * 2;
      percorrer(ramo, 1, angulo, (Math.PI * 2) / Math.max(ramos.length, 1), CORES_RAMO[(i % (CORES_RAMO.length - 1)) + 1]);
    });
  });

  return posicionados;
}

function EditorMapa({
  mapa, salvar, aoVoltar,
}: { mapa: MindMap; salvar: ReturnType<typeof useSalvar<MindMap>>; aoVoltar: () => void }) {
  const [nos, setNos] = React.useState<NoMapa[]>(mapa.nos ?? []);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [editando, setEditando] = React.useState<string | null>(null);
  const [expandindo, setExpandindo] = React.useState<string | null>(null);
  const canvas = React.useRef<HTMLDivElement>(null);
  const arrasteRef = React.useRef<{ tipo: "pan" | "no"; id?: string; x: number; y: number } | null>(null);

  React.useEffect(() => setNos(mapa.nos ?? []), [mapa.id]);

  const sujo = JSON.stringify(nos) !== JSON.stringify(mapa.nos ?? []);

  // O centro precisa acompanhar o tamanho real do canvas: calcular uma vez na
  // montagem deixaria os nós deslocados no primeiro render e ao redimensionar.
  const [centro, setCentro] = React.useState({ x: 400, y: 320 });

  React.useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const medir = () => setCentro({ x: el.clientWidth / 2, y: el.clientHeight / 2 });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const aoPressionar = (e: React.PointerEvent, tipo: "pan" | "no", id?: string) => {
    if (tipo === "no") e.stopPropagation();
    arrasteRef.current = { tipo, id, x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent) => {
    const arraste = arrasteRef.current;
    if (!arraste) return;
    const dx = e.clientX - arraste.x;
    const dy = e.clientY - arraste.y;
    arrasteRef.current = { ...arraste, x: e.clientX, y: e.clientY };

    if (arraste.tipo === "pan") {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      setNos((ns) => ns.map((n) => (n.id === arraste.id ? { ...n, x: n.x + dx / zoom, y: n.y + dy / zoom } : n)));
    }
  };

  const adicionarFilho = (pai: NoMapa) => {
    const irmaos = nos.filter((n) => n.parentId === pai.id).length;
    setNos((ns) => [
      ...ns,
      {
        id: uid("no"), parentId: pai.id, texto: "Novo tópico",
        x: pai.x + 200, y: pai.y + (irmaos - 1) * 70, cor: pai.cor,
      },
    ]);
  };

  const removerRamo = (id: string) => {
    const paraRemover = new Set([id]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const n of nos) {
        if (n.parentId && paraRemover.has(n.parentId) && !paraRemover.has(n.id)) {
          paraRemover.add(n.id);
          mudou = true;
        }
      }
    }
    setNos((ns) => ns.filter((n) => !paraRemover.has(n.id)));
  };

  const expandirComIA = async (no: NoMapa) => {
    setExpandindo(no.id);
    try {
      const { subtopicos } = await chamarIA<{ subtopicos: string[] }>("gerar-mapa-mental", {
        tema: mapa.titulo, expandir: no.texto,
        contexto: nos.filter((n) => n.parentId === no.parentId).map((n) => n.texto),
      });
      const novos = (subtopicos ?? []).slice(0, 5).map((texto, i) => ({
        id: uid("no"), parentId: no.id, texto,
        x: no.x + 220, y: no.y + (i - ((subtopicos.length - 1) / 2)) * 72, cor: no.cor,
      }));
      setNos((ns) => [...ns, ...novos]);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setExpandindo(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={aoVoltar}><ArrowLeft /> Mapas</Button>
        <p className="font-display text-base font-semibold">{mapa.titulo}</p>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}><ZoomOut /></Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}><ZoomIn /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize /></Button>
          <Button variant="outline" size="sm" onClick={() => canvas.current && exportarElemento(canvas.current, mapa.titulo, "png")}>
            <ImageDown /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={() => canvas.current && exportarElemento(canvas.current, mapa.titulo, "pdf")}>
            <FileDown /> PDF
          </Button>
          <Button size="sm" disabled={!sujo || salvar.isPending} onClick={() => salvar.mutate({ id: mapa.id, nos } as any)}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </div>
      </div>

      <div
        ref={canvas}
        onPointerDown={(e) => aoPressionar(e, "pan")}
        onPointerMove={aoMover}
        onPointerUp={() => { arrasteRef.current = null; }}
        onPointerLeave={() => { arrasteRef.current = null; }}
        onWheel={(e) => setZoom((z) => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)))}
        className="relative h-[640px] cursor-grab overflow-hidden rounded-2xl border border-border bg-[#FAFAFA] active:cursor-grabbing"
      >
        <div
          className="absolute left-0 top-0 h-full w-full origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible">
            {nos.map((no) => {
              const pai = nos.find((n) => n.id === no.parentId);
              if (!pai) return null;
              const x1 = centro.x + pai.x, y1 = centro.y + pai.y;
              const x2 = centro.x + no.x, y2 = centro.y + no.y;
              const meio = (x1 + x2) / 2;
              return (
                <path
                  key={`l-${no.id}`}
                  d={`M ${x1} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke={no.cor} strokeWidth={2} strokeOpacity={0.45}
                />
              );
            })}
          </svg>

          {nos.map((no) => (
            <div
              key={no.id}
              onPointerDown={(e) => aoPressionar(e, "no", no.id)}
              onDoubleClick={() => setEditando(no.id)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-grab select-none active:cursor-grabbing"
              style={{ left: centro.x + no.x, top: centro.y + no.y }}
            >
              <div
                className={cn(
                  "min-w-[120px] max-w-[240px] rounded-xl px-3 py-2 text-center text-sm font-medium shadow-md",
                  !no.parentId && "text-base font-semibold",
                )}
                style={{ backgroundColor: no.cor, color: "#ffffff" }}
              >
                {editando === no.id ? (
                  <input
                    autoFocus defaultValue={no.texto}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      setNos((ns) => ns.map((n) => (n.id === no.id ? { ...n, texto: e.target.value } : n)));
                      setEditando(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full bg-transparent text-center outline-none"
                    style={{ color: "#ffffff" }}
                  />
                ) : (
                  no.texto
                )}
              </div>

              <div className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => adicionarFilho(no)}
                  className="rounded-md bg-card px-1.5 py-1 shadow-soft" title="Adicionar filho"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => expandirComIA(no)}
                  className="rounded-md bg-card px-1.5 py-1 shadow-soft" title="Expandir com IA"
                >
                  {expandindo === no.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                </button>
                {no.parentId && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removerRamo(no.id)}
                    className="rounded-md bg-card px-1.5 py-1 text-destructive shadow-soft" title="Remover ramo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-muted-foreground">
          Arraste o fundo para mover · scroll para zoom · duplo clique para editar
        </p>
      </div>
    </div>
  );
}
