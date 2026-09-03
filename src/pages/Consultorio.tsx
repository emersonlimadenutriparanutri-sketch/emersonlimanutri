import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy,
  sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocalOrder } from "@/hooks/use-local-order";
import { useLista } from "@/hooks/use-crud";
import { usePacientes } from "@/hooks/use-pacientes";
import type { Lead } from "@/types/db";

import AbaLeads from "./consultorio/AbaLeads";
import AbaPacientes from "./consultorio/AbaPacientes";
import AbaFollowUp from "./consultorio/AbaFollowUp";
import AbaFinanceiro from "./consultorio/AbaFinanceiro";
import AbaServicos from "./consultorio/AbaServicos";
import AbaQuestionarios from "./consultorio/AbaQuestionarios";

const ABAS = {
  leads: { rotulo: "Leads", componente: AbaLeads },
  pacientes: { rotulo: "Pacientes", componente: AbaPacientes },
  followup: { rotulo: "Follow Up", componente: AbaFollowUp },
  financeiro: { rotulo: "Financeiro", componente: AbaFinanceiro },
  servicos: { rotulo: "Serviços", componente: AbaServicos },
  questionarios: { rotulo: "Questionários", componente: AbaQuestionarios },
} as const;

type ChaveAba = keyof typeof ABAS;
const PADRAO: ChaveAba[] = ["leads", "pacientes", "followup", "financeiro", "servicos", "questionarios"];

function AbaArrastavel({
  id, rotulo, ativa, aoSelecionar,
}: { id: string; rotulo: string; ativa: boolean; aoSelecionar: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex shrink-0 items-center rounded-full border transition-colors",
        ativa ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border bg-card hover:bg-muted",
        isDragging && "z-10 opacity-80 shadow-lift",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reordenar aba ${rotulo}`}
        className={cn(
          "cursor-grab touch-none rounded-l-full py-2 pl-2.5 pr-0.5 opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-60",
          ativa && "group-hover:opacity-80",
        )}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button onClick={aoSelecionar} className="whitespace-nowrap rounded-r-full py-2 pl-1 pr-4 text-sm font-medium">
        {rotulo}
      </button>
    </div>
  );
}

export default function Consultorio() {
  const [params, setParams] = useSearchParams();
  const { ordem, salvar, resetar } = useLocalOrder("consultorio:abas", PADRAO);

  const abaAtiva = (params.get("aba") as ChaveAba) in ABAS ? (params.get("aba") as ChaveAba) : (ordem[0] as ChaveAba);

  const trocarAba = (chave: ChaveAba) => {
    params.set("aba", chave);
    setParams(params, { replace: true });
  };

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const aoSoltar = (evento: DragEndEvent) => {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    const de = ordem.indexOf(String(active.id));
    const para = ordem.indexOf(String(over.id));
    salvar(arrayMove(ordem, de, para));
  };

  // ---- resumo do mês (no cabeçalho, sem poluir o título) ----
  const { data: leads = [] } = useLista<Lead>("leads");
  const { grupos } = usePacientes();
  const resumo = React.useMemo(() => {
    const agora = new Date();
    const doMes = leads.filter((l) => {
      const d = new Date(l.created_at);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    return [
      { rotulo: "Novos leads", valor: doMes.length },
      { rotulo: "Leads quentes", valor: leads.filter((l) => l.temperatura === "quente" && l.status !== "perdido" && l.status !== "fechado").length },
      { rotulo: "Fechados no mês", valor: doMes.filter((l) => l.status === "fechado").length },
      { rotulo: "Pacientes ativos", valor: grupos.ativos.length },
    ];
  }, [leads, grupos]);

  const Conteudo = ABAS[abaAtiva].componente;

  return (
    <>
      <PageHero
        selo="Consultório"
        titulo="Consultório"
        descricao="Da primeira conversa com o lead até a renovação do plano — tudo em um fluxo só."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {resumo.map((r) => (
          <div key={r.rotulo} className="card-surface flex items-baseline justify-between gap-3 px-5 py-4">
            <span className="text-xs text-muted-foreground">{r.rotulo}</span>
            <span className="font-display text-xl font-semibold">{r.valor}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="no-scrollbar -mx-1 flex-1 overflow-x-auto px-1 py-1">
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
            <SortableContext items={ordem} strategy={horizontalListSortingStrategy}>
              <div className="flex w-max items-center gap-2">
                {ordem.map((chave) => (
                  <AbaArrastavel
                    key={chave}
                    id={chave}
                    rotulo={ABAS[chave as ChaveAba].rotulo}
                    ativa={chave === abaAtiva}
                    aoSelecionar={() => trocarAba(chave as ChaveAba)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={resetar} title="Restaurar ordem das abas">
          <RotateCcw />
        </Button>
      </div>

      <div className="animate-fade-in">
        <Conteudo />
      </div>
    </>
  );
}
