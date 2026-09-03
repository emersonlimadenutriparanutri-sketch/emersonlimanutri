import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/shared/page-hero";
import { cn } from "@/lib/utils";
import Calendario from "./agenda/Calendario";
import ProjetosTarefas from "./agenda/ProjetosTarefas";
import MapasMentais from "./agenda/MapasMentais";

const ABAS = [
  { chave: "calendario", rotulo: "Calendário", componente: Calendario },
  { chave: "projetos", rotulo: "Projetos & Tarefas", componente: ProjetosTarefas },
  { chave: "mapas", rotulo: "Mapas Mentais", componente: MapasMentais },
] as const;

export default function TorreDeControle() {
  const [params, setParams] = useSearchParams();
  const ativa = ABAS.find((a) => a.chave === params.get("t"))?.chave ?? "calendario";
  const Conteudo = ABAS.find((a) => a.chave === ativa)!.componente;

  return (
    <>
      <PageHero
        selo="Organização"
        titulo="Torre de Controle"
        descricao="Tudo o que precisa da sua atenção — consultas, tarefas da jornada, próximas ações de leads e os seus projetos — em um lugar só."
      />

      <div className="flex gap-2">
        {ABAS.map((aba) => (
          <button
            key={aba.chave}
            onClick={() => { params.set("t", aba.chave); setParams(params, { replace: true }); }}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              ativa === aba.chave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      <div className="animate-fade-in"><Conteudo /></div>
    </>
  );
}
