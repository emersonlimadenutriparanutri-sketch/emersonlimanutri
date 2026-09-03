import * as React from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, FlaskConical, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RelatorioIA } from "@/components/shared/relatorio-ia";
import { UploadArquivo } from "@/components/shared/upload-arquivo";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { arquivoParaBase64, chamarIA } from "@/lib/ai";
import { buscarReferencia, classificarMarcador, CORES_SITUACAO, ROTULOS_SITUACAO } from "@/lib/marcadores";
import { fmtData, hojeISO, idade } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { AnaliseExame, Marcador } from "@/types/db";

export default function AbaExames({ paciente }: PropsAbaPaciente) {
  const { data: exames = [] } = useLista<AnaliseExame>("analise_exames", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const salvar = useSalvar<AnaliseExame>("analise_exames", "Exame salvo.");
  const remover = useRemover("analise_exames", "Exame removido.");

  const [origem, setOrigem] = React.useState<"nutricionista" | "paciente">("nutricionista");
  const [extraindo, setExtraindo] = React.useState(false);
  const [gerando, setGerando] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<AnaliseExame | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<AnaliseExame | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const lista = exames.filter((e) => e.origem === origem);

  /** Lê PDF ou imagem do laudo e devolve os marcadores já estruturados. */
  const extrairDoArquivo = async (file: File) => {
    setExtraindo(true);
    try {
      const base64 = await arquivoParaBase64(file);
      const resposta = await chamarIA<{ marcadores: Marcador[]; laboratorio?: string; data?: string }>("exames-pdf-ia", {
        arquivo_base64: base64,
        tipo_mime: file.type || "application/pdf",
        nome_arquivo: file.name,
      });
      const marcadores = (resposta.marcadores ?? []).map((m) => {
        const ref = buscarReferencia(m.nome);
        return {
          ...m,
          unidade: m.unidade || ref?.unidade,
          ref_min: m.ref_min ?? ref?.ref?.[0] ?? null,
          ref_max: m.ref_max ?? ref?.ref?.[1] ?? null,
          otimo_min: ref?.otimo?.[0] ?? null,
          otimo_max: ref?.otimo?.[1] ?? null,
        } as Marcador;
      });
      if (marcadores.length === 0) {
        toast.warning("Não encontrei marcadores nesse arquivo. Você pode lançá-los manualmente.");
      }
      await salvar.mutateAsync({
        patient_id: paciente.id,
        data: resposta.data || hojeISO(),
        laboratorio: resposta.laboratorio ?? null,
        origem,
        marcadores,
      } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setExtraindo(false);
    }
  };

  const gerarRelatorio = async (exame: AnaliseExame) => {
    setGerando(exame.id);
    try {
      const { texto } = await chamarIA<{ texto: string }>("resumo-consulta", {
        tipo: "exames",
        paciente: { nome: paciente.nome, idade: idade(paciente.data_nascimento), sexo: paciente.sexo, objetivo: paciente.objetivo },
        marcadores: exame.marcadores.map((m) => ({
          ...m,
          situacao: classificarMarcador(m.valor, buscarReferencia(m.nome), [m.ref_min, m.ref_max]),
        })),
      });
      await salvar.mutateAsync({ id: exame.id, relatorio_ia: texto } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setGerando(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["nutricionista", "paciente"] as const).map((o) => (
          <button
            key={o} onClick={() => setOrigem(o)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              origem === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {o === "nutricionista" ? "Meus envios" : "Enviados pelo paciente"}
            <span className={cn("ml-2 rounded-full px-1.5 text-[11px]", origem === o ? "bg-primary-foreground/15" : "bg-muted")}>
              {exames.filter((e) => e.origem === o).length}
            </span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={input} type="file" accept=".pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) extrairDoArquivo(f); e.target.value = ""; }}
          />
          <Button variant="outline" disabled={extraindo} onClick={() => input.current?.click()}>
            {extraindo ? <Loader2 className="animate-spin" /> : <Sparkles />} Ler laudo (PDF ou foto)
          </Button>
          <Button onClick={() => setEditando({ id: "", patient_id: paciente.id, data: hojeISO(), origem, marcadores: [] } as any)}>
            <Plus /> Lançar manual
          </Button>
        </div>
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icone={<FlaskConical />} titulo="Nenhum exame neste grupo"
          descricao="Envie o laudo em PDF ou foto e os marcadores são extraídos automaticamente."
        />
      ) : (
        lista.map((exame) => (
          <div key={exame.id} className="card-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <p className="font-display text-sm font-semibold">Exames de {fmtData(exame.data)}</p>
                <p className="text-xs text-muted-foreground">
                  {exame.laboratorio ? `${exame.laboratorio} · ` : ""}{exame.marcadores.length} marcadores
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditando(exame)}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(exame)}><Trash2 /></Button>
              </div>
            </div>

            <TabelaMarcadores marcadores={exame.marcadores} />

            <div className="px-5 pb-5">
              <RelatorioIA
                titulo="Leitura dos exames" conteudo={exame.relatorio_ia} paciente={paciente.nome} data={exame.data}
                gerando={gerando === exame.id} aoGerar={() => gerarRelatorio(exame)}
                vazio="Gere a interpretação cruzando os marcadores com as faixas ótimas."
              />
            </div>
          </div>
        ))
      )}

      <EditorExame
        exame={editando} paciente={paciente} salvar={salvar} onFechar={() => setEditando(null)}
      />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir exame" destrutivo confirmar="Excluir"
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function TabelaMarcadores({ marcadores }: { marcadores: Marcador[] }) {
  const porPerfil = React.useMemo(() => {
    const mapa = new Map<string, Marcador[]>();
    for (const m of marcadores) {
      const perfil = buscarReferencia(m.nome)?.perfil ?? "Outros";
      if (!mapa.has(perfil)) mapa.set(perfil, []);
      mapa.get(perfil)!.push(m);
    }
    return [...mapa.entries()];
  }, [marcadores]);

  if (marcadores.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nenhum marcador lançado.</p>;
  }

  return (
    <div className="space-y-4 px-5 py-4">
      {porPerfil.map(([perfil, itens]) => (
        <div key={perfil}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{perfil}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Marcador</th>
                  <th className="pb-2 font-medium">Resultado</th>
                  <th className="pb-2 font-medium">Referência</th>
                  <th className="pb-2 font-medium">Faixa ótima</th>
                  <th className="pb-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((m, i) => {
                  const ref = buscarReferencia(m.nome);
                  const situacao = classificarMarcador(m.valor, ref, [m.ref_min, m.ref_max]);
                  const refMin = m.ref_min ?? ref?.ref?.[0];
                  const refMax = m.ref_max ?? ref?.ref?.[1];
                  const otimo = ref?.otimo;
                  return (
                    <tr key={`${m.nome}-${i}`}>
                      <td className="py-2 pr-3">{m.nome}</td>
                      <td className="py-2 pr-3 font-medium">{m.valor} {m.unidade ?? ref?.unidade ?? ""}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{refMin != null || refMax != null ? `${refMin ?? "—"} a ${refMax ?? "—"}` : "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{otimo ? `${otimo[0]} a ${otimo[1]}` : "—"}</td>
                      <td className="py-2"><Badge variant={CORES_SITUACAO[situacao]}>{ROTULOS_SITUACAO[situacao]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function EditorExame({
  exame, paciente, salvar, onFechar,
}: {
  exame: AnaliseExame | null;
  paciente: PropsAbaPaciente["paciente"];
  salvar: ReturnType<typeof useSalvar<AnaliseExame>>;
  onFechar: () => void;
}) {
  const [data, setData] = React.useState(hojeISO());
  const [laboratorio, setLaboratorio] = React.useState("");
  const [marcadores, setMarcadores] = React.useState<Marcador[]>([]);
  const [arquivo, setArquivo] = React.useState<{ caminho: string; nome: string } | null>(null);

  React.useEffect(() => {
    if (!exame) return;
    setData(exame.data ?? hojeISO());
    setLaboratorio(exame.laboratorio ?? "");
    setMarcadores(exame.marcadores ?? []);
    setArquivo(exame.arquivo_url ? { caminho: exame.arquivo_url, nome: exame.arquivo_nome ?? "laudo" } : null);
  }, [exame]);

  if (!exame) return null;

  const atualizar = (i: number, campos: Partial<Marcador>) =>
    setMarcadores((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...campos } : m)));

  return (
    <div className="card-surface space-y-5 p-5">
      <h2 className="font-display text-base font-semibold">{exame.id ? "Editar exame" : "Novo exame"}</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-data">Data da coleta</Label>
          <Input id="e-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-lab">Laboratório</Label>
          <Input id="e-lab" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Laudo original</Label>
          <UploadArquivo
            bucket="paciente-exames" prefixo="exames"
            arquivoUrl={arquivo?.caminho} arquivoNome={arquivo?.nome}
            aoEnviar={setArquivo} rotulo="Anexar laudo"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Marcadores ({marcadores.length})</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setMarcadores((ms) => [...ms, { nome: "", valor: "" }])}>
            <Plus /> Adicionar marcador
          </Button>
        </div>

        {marcadores.map((m, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Input
              value={m.nome} placeholder="Nome do marcador"
              onChange={(e) => {
                const ref = buscarReferencia(e.target.value);
                atualizar(i, {
                  nome: e.target.value,
                  unidade: m.unidade || ref?.unidade,
                  ref_min: m.ref_min ?? ref?.ref?.[0] ?? null,
                  ref_max: m.ref_max ?? ref?.ref?.[1] ?? null,
                });
              }}
            />
            <Input value={String(m.valor ?? "")} placeholder="Valor" onChange={(e) => atualizar(i, { valor: e.target.value })} />
            <Input value={m.unidade ?? ""} placeholder="Unidade" onChange={(e) => atualizar(i, { unidade: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive"
              onClick={() => setMarcadores((ms) => ms.filter((_, idx) => idx !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={salvar.isPending}
          onClick={async () => {
            await salvar.mutateAsync({
              ...(exame.id ? { id: exame.id } : {}),
              patient_id: paciente.id, data, laboratorio: laboratorio || null,
              origem: exame.origem, marcadores,
              arquivo_url: arquivo?.caminho ?? null, arquivo_nome: arquivo?.nome ?? null,
            } as any);
            onFechar();
          }}
        >
          {salvar.isPending && <Loader2 className="animate-spin" />} Salvar exame
        </Button>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
      </div>
    </div>
  );
}
