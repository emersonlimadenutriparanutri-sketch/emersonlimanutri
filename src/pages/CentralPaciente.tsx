import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Crown, UserMinus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsappButton } from "@/components/shared/whatsapp-button";
import { EmptyState } from "@/components/shared/empty-state";
import { useItem } from "@/hooks/use-crud";
import { useDevolverParaLead } from "@/hooks/use-conversao";
import { fmtData, idade, diasAte, faseCiclo, rotuloFase, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Paciente } from "@/types/db";

import AbaDados from "./paciente/AbaDados";
import AbaAnamnese from "./paciente/AbaAnamnese";
import AbaRastreamento from "./paciente/AbaRastreamento";
import AbaExames from "./paciente/AbaExames";
import AbaAvaliacaoFisica from "./paciente/AbaAvaliacaoFisica";
import AbaResumoConsulta from "./paciente/AbaResumoConsulta";
import AbaJornada from "./paciente/AbaJornada";
import AbaRaioX from "./paciente/AbaRaioX";
import AbaEvolucao from "./paciente/AbaEvolucao";

/** A ordem das abas segue o fluxo real do atendimento — não mexer sem motivo clínico. */
const ABAS = [
  { chave: "dados", rotulo: "Dados", componente: AbaDados },
  { chave: "anamnese", rotulo: "Anamnese", componente: AbaAnamnese },
  { chave: "rastreamento", rotulo: "Rastreamento metabólico", componente: AbaRastreamento },
  { chave: "exames", rotulo: "Análise de exames", componente: AbaExames },
  { chave: "avaliacao", rotulo: "Avaliação física", componente: AbaAvaliacaoFisica },
  { chave: "resumo", rotulo: "Resumo da consulta", componente: AbaResumoConsulta },
  { chave: "jornada", rotulo: "Jornada do Paciente", componente: AbaJornada },
  { chave: "raiox", rotulo: "Raio-X semanal", componente: AbaRaioX },
  { chave: "evolucao", rotulo: "Evolução", componente: AbaEvolucao },
] as const;

export default function CentralPaciente() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: paciente, isLoading } = useItem<Paciente>("patients", id);
  const devolver = useDevolverParaLead();
  const [devolvendo, setDevolvendo] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  const abaAtiva = ABAS.find((a) => a.chave === params.get("t"))?.chave ?? "dados";
  const trocar = (chave: string) => { params.set("t", chave); setParams(params, { replace: true }); };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;

  if (!paciente) {
    return (
      <EmptyState
        titulo="Paciente não encontrado"
        descricao="Ele pode ter sido excluído."
        acao={<Button asChild><Link to="/consultorio?aba=pacientes">Voltar para a lista</Link></Button>}
      />
    );
  }

  const anos = idade(paciente.data_nascimento);
  const dias = diasAte(paciente.plano_vencimento);
  const ciclo = faseCiclo(paciente.ciclo_ultima_menstruacao, paciente.ciclo_duracao ?? 28, paciente.ciclo_duracao_menstruacao ?? 5);
  const Conteudo = ABAS.find((a) => a.chave === abaAtiva)!.componente;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/consultorio?aba=pacientes"><ArrowLeft /> Pacientes</Link>
        </Button>
      </div>

      <header className="hero-block">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="seal text-secondary">
              <span className="h-px w-6 bg-secondary" /> Central do Paciente
            </span>
            <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
              {paciente.nome}
              {paciente.plano_tipo === "premium" && <Crown className="h-5 w-5 text-secondary" />}
            </h1>
            <p className="mt-2 text-sm text-primary-foreground/70">
              {[
                anos ? `${anos} anos` : null,
                paciente.objetivo,
                paciente.plano_valor ? fmtMoeda(paciente.plano_valor) : null,
              ].filter(Boolean).join(" · ") || "Complete os dados na aba ao lado."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {paciente.status === "inativo" && <Badge variant="muted">Inativo</Badge>}
              {paciente.plano_vencimento && (
                <Badge variant={dias !== null && dias < 0 ? "danger" : dias !== null && dias <= 7 ? "warning" : "secondary"}>
                  {dias !== null && dias < 0 ? `Vencido em ${fmtData(paciente.plano_vencimento)}` : `Vence ${fmtData(paciente.plano_vencimento)}`}
                </Badge>
              )}
              {ciclo && <Badge variant={ciclo.fase === "tpm" ? "warning" : ciclo.fase === "menstrual" ? "danger" : "info"}>
                {rotuloFase[ciclo.fase]} · dia {ciclo.dia}
              </Badge>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <WhatsappButton
              telefone={paciente.telefone}
              mensagem={`Oi, ${paciente.nome.split(" ")[0]}!`}
              rotulo="WhatsApp"
              className="bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            />
            {paciente.status === "ativo" && (
              <Button variant="ghost" size="sm" className="text-primary-foreground/70 hover:bg-primary-foreground/10" onClick={() => setDevolvendo(true)}>
                <UserMinus /> Devolver ao funil
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
        {ABAS.map((aba) => (
          <button
            key={aba.chave}
            onClick={() => trocar(aba.chave)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              abaAtiva === aba.chave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        <Conteudo paciente={paciente} />
      </div>

      <Dialog open={devolvendo} onOpenChange={setDevolvendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver paciente para o funil</DialogTitle>
            <DialogDescription>
              O paciente <strong>não é apagado</strong>: fica como inativo, com todo o histórico clínico
              preservado, e uma cópia dele volta para o Follow Up. Se ele voltar, é só converter de novo.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da saída (opcional): mudou de cidade, questão financeira, pausou…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolvendo(false)}>Cancelar</Button>
            <Button
              disabled={devolver.isPending}
              onClick={() =>
                devolver.mutate(
                  { paciente, motivo },
                  { onSuccess: () => { setDevolvendo(false); navigate("/consultorio?aba=followup"); } },
                )
              }
            >
              {devolver.isPending && <Loader2 className="animate-spin" />} Devolver ao funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface PropsAbaPaciente {
  paciente: Paciente;
}
