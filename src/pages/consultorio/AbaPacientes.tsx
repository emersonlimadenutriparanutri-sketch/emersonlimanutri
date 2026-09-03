import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Users2, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsappButton } from "@/components/shared/whatsapp-button";
import { PacienteDialog } from "@/components/shared/paciente-dialog";
import { usePacientes, type GrupoPaciente } from "@/hooks/use-pacientes";
import { fmtData, fmtMoeda, idade, diasAte, faseCiclo, rotuloFase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Paciente } from "@/types/db";

const GRUPOS: { chave: GrupoPaciente; rotulo: string }[] = [
  { chave: "ativos", rotulo: "Ativos" },
  { chave: "vencidos", rotulo: "Vencidos" },
  { chave: "sem_plano", rotulo: "Ativos sem plano" },
  { chave: "inativos", rotulo: "Inativos" },
];

type Ordenacao = "nome" | "cadastro" | "vencimento";

export default function AbaPacientes() {
  const navigate = useNavigate();
  const { grupos, isLoading } = usePacientes();
  const [grupo, setGrupo] = React.useState<GrupoPaciente>("ativos");
  const [busca, setBusca] = React.useState("");
  const [ordenacao, setOrdenacao] = React.useState<Ordenacao>("nome");
  const [novoAberto, setNovoAberto] = React.useState(false);

  const lista = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = grupos[grupo].filter((p) =>
      !termo || [p.nome, p.telefone, p.email, p.objetivo].filter(Boolean).some((v) => String(v).toLowerCase().includes(termo)),
    );
    const ordenada = [...base];
    ordenada.sort((a, b) => {
      if (ordenacao === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
      if (ordenacao === "cadastro") return b.created_at.localeCompare(a.created_at);
      return (a.plano_vencimento ?? "9999").localeCompare(b.plano_vencimento ?? "9999");
    });
    return ordenada;
  }, [grupos, grupo, busca, ordenacao]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {GRUPOS.map((g) => (
            <button
              key={g.chave}
              onClick={() => setGrupo(g.chave)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                grupo === g.chave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {g.rotulo}
              <span className={cn("rounded-full px-1.5 text-[11px]", grupo === g.chave ? "bg-primary-foreground/15" : "bg-muted")}>
                {grupos[g.chave].length}
              </span>
            </button>
          ))}
        </div>
        <Button onClick={() => setNovoAberto(true)}><Plus /> Novo paciente</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar paciente…" className="pl-9" />
        </div>
        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Ordenar por nome</SelectItem>
            <SelectItem value="cadastro">Data de cadastro</SelectItem>
            <SelectItem value="vencimento">Vencimento do plano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : lista.length === 0 ? (
        <EmptyState
          icone={<Users2 />}
          titulo={busca ? "Nenhum paciente encontrado" : "Nenhum paciente neste grupo"}
          descricao={busca ? "Tente outro termo de busca." : "Cadastre um paciente ou converta um lead do funil."}
          acao={!busca && <Button onClick={() => setNovoAberto(true)}><Plus /> Novo paciente</Button>}
        />
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {lista.map((p) => <LinhaPaciente key={p.id} paciente={p} />)}
        </div>
      )}

      <PacienteDialog aberto={novoAberto} onOpenChange={setNovoAberto} aoSalvar={(p) => navigate(`/paciente/${p.id}`)} />
    </div>
  );
}

function LinhaPaciente({ paciente: p }: { paciente: Paciente }) {
  const dias = diasAte(p.plano_vencimento);
  const anos = idade(p.data_nascimento);
  const ciclo = faseCiclo(p.ciclo_ultima_menstruacao, p.ciclo_duracao ?? 28, p.ciclo_duracao_menstruacao ?? 5);

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <Link to={`/paciente/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xs font-semibold text-primary">
          {p.nome.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{p.nome}</p>
            {p.plano_tipo === "premium" && <Crown className="h-3.5 w-3.5 shrink-0 text-secondary" />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[anos ? `${anos} anos` : null, p.objetivo, p.plano_valor ? fmtMoeda(p.plano_valor) : null]
              .filter(Boolean).join(" · ") || "Sem dados complementares"}
          </p>
        </div>
      </Link>

      <div className="hidden items-center gap-2 sm:flex">
        {ciclo && (ciclo.fase === "tpm" || ciclo.fase === "menstrual") && (
          <Badge variant={ciclo.fase === "tpm" ? "warning" : "danger"}>{rotuloFase[ciclo.fase]}</Badge>
        )}
        {p.plano_vencimento ? (
          <Badge variant={dias === null ? "muted" : dias < 0 ? "danger" : dias <= 7 ? "warning" : "muted"}>
            {dias !== null && dias < 0 ? "Vencido" : `Vence ${fmtData(p.plano_vencimento)}`}
          </Badge>
        ) : (
          <Badge variant="muted">Sem plano</Badge>
        )}
      </div>

      <WhatsappButton telefone={p.telefone} mensagem={`Oi, ${p.nome.split(" ")[0]}!`} />
      <Link to={`/paciente/${p.id}`} className="text-muted-foreground"><ChevronRight className="h-4 w-4" /></Link>
    </div>
  );
}
