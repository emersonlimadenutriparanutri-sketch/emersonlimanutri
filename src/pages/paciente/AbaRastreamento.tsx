import * as React from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RelatorioIA } from "@/components/shared/relatorio-ia";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { fmtData, hojeISO, idade } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { Rastreamento } from "@/types/db";

/** Sintomas agrupados por sistema. Pontuação 0 (nunca) a 4 (sempre). */
const SINTOMAS: { sistema: string; itens: { id: string; texto: string }[] }[] = [
  { sistema: "Cabeça", itens: [
    { id: "cabeca_1", texto: "Dores de cabeça" },
    { id: "cabeca_2", texto: "Tontura ou sensação de desmaio" }] },
  { sistema: "Digestivo", itens: [
    { id: "digest_1", texto: "Distensão abdominal ou gases" },
    { id: "digest_2", texto: "Azia ou refluxo" },
    { id: "digest_3", texto: "Constipação ou diarreia" }] },
  { sistema: "Energia", itens: [
    { id: "energia_1", texto: "Fadiga ou cansaço ao acordar" },
    { id: "energia_2", texto: "Queda de energia à tarde" }] },
  { sistema: "Emocional", itens: [
    { id: "emocional_1", texto: "Ansiedade ou irritabilidade" },
    { id: "emocional_2", texto: "Oscilação de humor" },
    { id: "emocional_3", texto: "Dificuldade de concentração" }] },
  { sistema: "Pele e anexos", itens: [
    { id: "pele_1", texto: "Acne, coceira ou manchas" },
    { id: "pele_2", texto: "Queda de cabelo ou unhas fracas" }] },
  { sistema: "Peso e apetite", itens: [
    { id: "peso_1", texto: "Compulsão ou desejo por doces" },
    { id: "peso_2", texto: "Retenção de líquido ou inchaço" }] },
  { sistema: "Musculoesquelético", itens: [{ id: "articular_1", texto: "Dores articulares ou musculares" }] },
  { sistema: "Imunológico", itens: [{ id: "imuno_1", texto: "Infecções frequentes ou gripes" }] },
  { sistema: "Sono", itens: [{ id: "sono_1", texto: "Insônia ou sono não reparador" }] },
  { sistema: "Hormonal", itens: [{ id: "hormonal_1", texto: "TPM intensa, fogachos ou sintomas hormonais" }] },
];

const TOTAL_ITENS = SINTOMAS.reduce((s, g) => s + g.itens.length, 0);
const PONTUACAO_MAXIMA = TOTAL_ITENS * 4;

function classificar(total: number) {
  const pct = (total / PONTUACAO_MAXIMA) * 100;
  if (pct < 15) return { rotulo: "Carga baixa", variante: "success" as const };
  if (pct < 30) return { rotulo: "Carga leve", variante: "info" as const };
  if (pct < 50) return { rotulo: "Carga moderada", variante: "warning" as const };
  return { rotulo: "Carga alta", variante: "danger" as const };
}

export default function AbaRastreamento({ paciente }: PropsAbaPaciente) {
  const { data: registros = [] } = useLista<Rastreamento>("rastreamento_metabolico", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const salvar = useSalvar<Rastreamento>("rastreamento_metabolico", "Rastreamento salvo.");
  const remover = useRemover("rastreamento_metabolico", "Registro removido.");

  const [preenchendo, setPreenchendo] = React.useState(false);
  const [respostas, setRespostas] = React.useState<Record<string, number>>({});
  const [gerando, setGerando] = React.useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<Rastreamento | null>(null);

  const pontuacaoSistemas = React.useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const grupo of SINTOMAS) {
      mapa[grupo.sistema] = grupo.itens.reduce((s, i) => s + (respostas[i.id] ?? 0), 0);
    }
    return mapa;
  }, [respostas]);

  const total = Object.values(pontuacaoSistemas).reduce((s, v) => s + v, 0);

  const gerarRelatorio = async (registro: Rastreamento) => {
    setGerando(registro.id);
    try {
      const { texto } = await chamarIA<{ texto: string }>("analise-rastreamento-ia", {
        paciente: { nome: paciente.nome, idade: idade(paciente.data_nascimento), sexo: paciente.sexo },
        pontuacao_total: registro.pontuacao_total,
        pontuacao_maxima: PONTUACAO_MAXIMA,
        pontuacao_sistemas: registro.pontuacao_sistemas,
        sintomas_marcados: SINTOMAS.flatMap((g) =>
          g.itens
            .filter((i) => (registro.respostas?.[i.id] ?? 0) >= 2)
            .map((i) => ({ sistema: g.sistema, sintoma: i.texto, pontos: registro.respostas[i.id] })),
        ),
      });
      await salvar.mutateAsync({ id: registro.id, relatorio_ia: texto } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pontue de 0 (nunca) a 4 (sempre) a frequência de cada sintoma nos últimos 30 dias.
        </p>
        <Button onClick={() => { setRespostas({}); setPreenchendo(true); }}><Plus /> Novo rastreamento</Button>
      </div>

      {preenchendo && (
        <div className="card-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Preenchendo rastreamento</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-2xl font-semibold">{total}<span className="text-sm text-muted-foreground">/{PONTUACAO_MAXIMA}</span></span>
              <Badge variant={classificar(total).variante}>{classificar(total).rotulo}</Badge>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {SINTOMAS.map((grupo) => (
              <div key={grupo.sistema}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {grupo.sistema} · {pontuacaoSistemas[grupo.sistema]} pts
                </p>
                <div className="space-y-2">
                  {grupo.itens.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                      <span className="min-w-[180px] flex-1 text-sm">{item.texto}</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((n) => (
                          <button
                            key={n} type="button"
                            onClick={() => setRespostas((r) => ({ ...r, [item.id]: n }))}
                            className={cn(
                              "h-8 w-8 rounded-lg border text-sm transition-colors",
                              (respostas[item.id] ?? 0) === n
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border hover:bg-muted",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button
              disabled={salvar.isPending}
              onClick={async () => {
                await salvar.mutateAsync({
                  patient_id: paciente.id, data: hojeISO(),
                  respostas, pontuacao_sistemas: pontuacaoSistemas, pontuacao_total: total,
                } as any);
                setPreenchendo(false);
              }}
            >
              {salvar.isPending && <Loader2 className="animate-spin" />} Salvar rastreamento
            </Button>
            <Button variant="outline" onClick={() => setPreenchendo(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {registros.length === 0 && !preenchendo ? (
        <EmptyState icone={<Activity />} titulo="Nenhum rastreamento aplicado" descricao="Aplique o questionário para enxergar a carga de sintomas por sistema." />
      ) : (
        registros.map((r) => {
          const classe = classificar(r.pontuacao_total);
          return (
            <div key={r.id} className="card-surface overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <div>
                  <p className="font-display text-sm font-semibold">Rastreamento de {fmtData(r.data)}</p>
                  <p className="text-xs text-muted-foreground">{r.pontuacao_total} de {PONTUACAO_MAXIMA} pontos</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={classe.variante}>{classe.rotulo}</Badge>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(r)}><Trash2 /></Button>
                </div>
              </div>

              <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                {Object.entries(r.pontuacao_sistemas ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([sistema, pontos]) => {
                    const maximo = (SINTOMAS.find((s) => s.sistema === sistema)?.itens.length ?? 1) * 4;
                    return (
                      <div key={sistema} className="space-y-1">
                        <div className="flex items-baseline justify-between text-sm">
                          <span>{sistema}</span>
                          <span className="text-muted-foreground">{pontos}/{maximo}</span>
                        </div>
                        <Progress
                          value={(pontos / maximo) * 100}
                          indicatorClassName={pontos / maximo >= 0.5 ? "bg-destructive" : pontos / maximo >= 0.25 ? "bg-warning" : "bg-success"}
                        />
                      </div>
                    );
                  })}
              </div>

              <div className="px-5 pb-5">
                <RelatorioIA
                  titulo="Interpretação do rastreamento" conteudo={r.relatorio_ia}
                  paciente={paciente.nome} data={r.data}
                  gerando={gerando === r.id} aoGerar={() => gerarRelatorio(r)}
                  vazio="Gere a leitura interpretativa dos sistemas mais pontuados."
                />
              </div>
            </div>
          );
        })
      )}

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir rastreamento" destrutivo confirmar="Excluir"
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}
