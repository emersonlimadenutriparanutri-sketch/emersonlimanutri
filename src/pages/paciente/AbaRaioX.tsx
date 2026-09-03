import * as React from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RelatorioIA } from "@/components/shared/relatorio-ia";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { fmtData, hojeISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { RaioX } from "@/types/db";

/** Perguntas do check-in semanal: adesão, fome, energia, sono, treino e contexto. */
const PERGUNTAS = [
  { id: "adesao", tipo: "escala", titulo: "Quanto conseguiu seguir o plano?", min: 0, max: 10 },
  { id: "fome", tipo: "opcoes", titulo: "Como esteve a fome?", opcoes: ["Controlada", "Oscilou", "Muita fome", "Sem fome"] },
  { id: "intestino", tipo: "opcoes", titulo: "Intestino", opcoes: ["Normal", "Preso", "Solto", "Alternando"] },
  { id: "energia", tipo: "escala", titulo: "Energia durante o dia", min: 0, max: 10 },
  { id: "sono", tipo: "escala", titulo: "Qualidade do sono", min: 0, max: 10 },
  { id: "treinos", tipo: "numero", titulo: "Treinos na semana" },
  { id: "dificuldade", tipo: "texto", titulo: "Maior dificuldade da semana" },
  { id: "vitoria", tipo: "texto", titulo: "O que funcionou e vale manter" },
] as const;

export default function AbaRaioX({ paciente }: PropsAbaPaciente) {
  const { data: registros = [] } = useLista<RaioX>("raio_x_semanal", { filtros: { patient_id: paciente.id }, ordenarPor: "semana_ref" });
  const salvar = useSalvar<RaioX>("raio_x_semanal", "Raio-X salvo.");
  const remover = useRemover("raio_x_semanal", "Registro removido.");

  const [preenchendo, setPreenchendo] = React.useState(false);
  const [semana, setSemana] = React.useState(hojeISO());
  const [peso, setPeso] = React.useState("");
  const [respostas, setRespostas] = React.useState<Record<string, any>>({});
  const [gerando, setGerando] = React.useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<RaioX | null>(null);

  const gerarLeitura = async (registro: RaioX) => {
    setGerando(registro.id);
    try {
      const { texto } = await chamarIA<{ texto: string }>("resumo-questionario", {
        titulo: "Raio-X semanal",
        paciente: paciente.nome,
        perguntas: PERGUNTAS.map((p) => ({ id: p.id, titulo: p.titulo })),
        respostas: { ...registro.respostas, peso: registro.peso },
        instrucao: "Leitura semanal de acompanhamento: aponte o que ajustar na próxima semana.",
      });
      await salvar.mutateAsync({ id: registro.id, leitura_ia: texto } as any);
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
          Check-in semanal: o termômetro que evita esperar o retorno para corrigir a rota.
        </p>
        <Button onClick={() => { setRespostas({}); setPeso(""); setSemana(hojeISO()); setPreenchendo(true); }}>
          <Plus /> Novo Raio-X
        </Button>
      </div>

      {preenchendo && (
        <div className="card-surface space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rx-semana">Semana de referência</Label>
              <Input id="rx-semana" type="date" value={semana} onChange={(e) => setSemana(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rx-peso">Peso (kg)</Label>
              <Input id="rx-peso" type="number" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            {PERGUNTAS.map((p) => (
              <div key={p.id} className="space-y-1.5">
                <Label>{p.titulo}</Label>
                {p.tipo === "escala" && (
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: (p.max ?? 10) - (p.min ?? 0) + 1 }, (_, i) => (p.min ?? 0) + i).map((n) => (
                      <button
                        key={n} type="button"
                        onClick={() => setRespostas((r) => ({ ...r, [p.id]: n }))}
                        className={cn(
                          "h-8 w-8 rounded-lg border text-sm transition-colors",
                          respostas[p.id] === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {p.tipo === "opcoes" && (
                  <div className="flex flex-wrap gap-2">
                    {p.opcoes!.map((o) => (
                      <button
                        key={o} type="button"
                        onClick={() => setRespostas((r) => ({ ...r, [p.id]: o }))}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          respostas[p.id] === o ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {p.tipo === "numero" && (
                  <Input type="number" value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
                )}
                {p.tipo === "texto" && (
                  <Textarea value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={salvar.isPending}
              onClick={async () => {
                await salvar.mutateAsync({
                  patient_id: paciente.id, semana_ref: semana,
                  respostas, peso: peso ? Number(peso) : null,
                  adesao_pct: respostas.adesao != null ? Number(respostas.adesao) * 10 : null,
                } as any);
                setPreenchendo(false);
              }}
            >
              {salvar.isPending && <Loader2 className="animate-spin" />} Salvar Raio-X
            </Button>
            <Button variant="outline" onClick={() => setPreenchendo(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {registros.length === 0 && !preenchendo ? (
        <EmptyState icone={<Radar />} titulo="Nenhum Raio-X registrado" descricao="Aplique o check-in semanal para acompanhar adesão e sintomas entre consultas." />
      ) : (
        registros.map((r) => (
          <div key={r.id} className="card-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <p className="font-display text-sm font-semibold">Semana de {fmtData(r.semana_ref)}</p>
                <p className="text-xs text-muted-foreground">{r.peso ? `${r.peso} kg` : "Sem peso registrado"}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.adesao_pct != null && (
                  <Badge variant={r.adesao_pct >= 80 ? "success" : r.adesao_pct >= 50 ? "warning" : "danger"}>
                    Adesão {r.adesao_pct}%
                  </Badge>
                )}
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(r)}><Trash2 /></Button>
              </div>
            </div>

            <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
              {PERGUNTAS.filter((p) => r.respostas?.[p.id] !== undefined && r.respostas[p.id] !== "").map((p) => (
                <div key={p.id}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.titulo}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{String(r.respostas[p.id])}</p>
                </div>
              ))}
            </div>

            <div className="px-5 pb-5">
              <RelatorioIA
                titulo="Leitura da semana" conteudo={r.leitura_ia} paciente={paciente.nome} data={r.semana_ref}
                gerando={gerando === r.id} aoGerar={() => gerarLeitura(r)}
                vazio="Gere a leitura da semana com o ajuste sugerido."
              />
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir Raio-X" destrutivo confirmar="Excluir"
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}
