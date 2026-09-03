import * as React from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { RelatorioIA } from "@/components/shared/relatorio-ia";
import { UploadArquivo } from "@/components/shared/upload-arquivo";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { chamarIA } from "@/lib/ai";
import { fmtData, hojeISO, idade } from "@/lib/format";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { Anamnese } from "@/types/db";

/** Blocos da anamnese — o que realmente muda conduta no consultório. */
const BLOCOS: { chave: string; rotulo: string; placeholder: string }[] = [
  { chave: "queixa", rotulo: "Queixa principal", placeholder: "O que trouxe essa pessoa até aqui, nas palavras dela." },
  { chave: "historia", rotulo: "História do peso", placeholder: "Dietas anteriores, efeito sanfona, gatilhos de reganho." },
  { chave: "clinico", rotulo: "História clínica", placeholder: "Diagnósticos, cirurgias, internações, histórico familiar." },
  { chave: "medicacoes", rotulo: "Medicações e suplementos", placeholder: "Nome, dose e há quanto tempo." },
  { chave: "habitos", rotulo: "Hábitos alimentares", placeholder: "Rotina de refeições, beliscos, fim de semana, álcool." },
  { chave: "comportamento", rotulo: "Comportamento alimentar", placeholder: "Compulsão, fome emocional, restrição, culpa." },
  { chave: "intestino", rotulo: "Função intestinal e digestiva", placeholder: "Frequência, forma, sintomas digestivos." },
  { chave: "sono_estresse", rotulo: "Sono e estresse", placeholder: "Horas, qualidade, despertares, carga mental." },
  { chave: "atividade", rotulo: "Atividade física", placeholder: "Tipo, frequência, intensidade, histórico." },
  { chave: "hormonal", rotulo: "Saúde hormonal", placeholder: "Ciclo, TPM, perimenopausa, sintomas, terapias." },
  { chave: "objetivos", rotulo: "Expectativas e metas", placeholder: "O que ela espera, em quanto tempo, o que já a frustrou." },
];

export default function AbaAnamnese({ paciente }: PropsAbaPaciente) {
  const { data: registros = [] } = useLista<Anamnese>("anamnese", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const salvar = useSalvar<Anamnese>("anamnese", "Anamnese salva.");
  const remover = useRemover("anamnese", "Registro removido.");

  const [editando, setEditando] = React.useState<Anamnese | null | undefined>(undefined);
  const [paraExcluir, setParaExcluir] = React.useState<Anamnese | null>(null);
  const [gerando, setGerando] = React.useState<string | null>(null);

  const gerarResumo = async (registro: Anamnese) => {
    setGerando(registro.id);
    try {
      const { texto } = await chamarIA<{ texto: string }>("resumo-anamnese", {
        paciente: {
          nome: paciente.nome, idade: idade(paciente.data_nascimento), sexo: paciente.sexo,
          objetivo: paciente.objetivo, medicacoes: paciente.medicacoes,
        },
        anamnese: registro.dados,
      });
      await salvar.mutateAsync({ id: registro.id, resumo_ia: texto } as any);
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
          Histórico em ordem cronológica. A anamnese mais recente fica no topo.
        </p>
        <Button onClick={() => setEditando(null)}><Plus /> Nova anamnese</Button>
      </div>

      {registros.length === 0 ? (
        <EmptyState
          icone={<FileText />} titulo="Nenhuma anamnese registrada"
          descricao="Registre a primeira consulta ou anexe uma anamnese feita fora do sistema."
          acao={<Button onClick={() => setEditando(null)}><Plus /> Nova anamnese</Button>}
        />
      ) : (
        <div className="space-y-4">
          {registros.map((r) => (
            <div key={r.id} className="card-surface overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <div>
                  <p className="font-display text-sm font-semibold">Anamnese de {fmtData(r.data)}</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.values(r.dados ?? {}).filter(Boolean).length} blocos preenchidos
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditando(r)}>Editar</Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(r)}><Trash2 /></Button>
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                {r.arquivo_url && (
                  <UploadArquivo
                    bucket="paciente-exames" arquivoUrl={r.arquivo_url} arquivoNome={r.arquivo_nome}
                    aoEnviar={(d) => salvar.mutate({ id: r.id, arquivo_url: d?.caminho ?? null, arquivo_nome: d?.nome ?? null } as any)}
                  />
                )}
                {BLOCOS.filter((b) => r.dados?.[b.chave]).map((b) => (
                  <div key={b.chave}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{b.rotulo}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{r.dados[b.chave]}</p>
                  </div>
                ))}
              </div>

              <div className="px-5 pb-5">
                <RelatorioIA
                  titulo="Resumo clínico" conteudo={r.resumo_ia} paciente={paciente.nome} data={r.data}
                  gerando={gerando === r.id} aoGerar={() => gerarResumo(r)}
                  rotuloGerar="Gerar resumo"
                  vazio="Gere um resumo para ter a leitura clínica desta anamnese em um parágrafo."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <EditorAnamnese
        registro={editando} pacienteId={paciente.id}
        onFechar={() => setEditando(undefined)} salvar={salvar}
      />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir anamnese" destrutivo confirmar="Excluir"
        descricao="Este registro será removido do histórico do paciente."
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function EditorAnamnese({
  registro, pacienteId, onFechar, salvar,
}: {
  registro: Anamnese | null | undefined; pacienteId: string;
  onFechar: () => void; salvar: ReturnType<typeof useSalvar<Anamnese>>;
}) {
  const [data, setData] = React.useState(hojeISO());
  const [dados, setDados] = React.useState<Record<string, string>>({});
  const [arquivo, setArquivo] = React.useState<{ caminho: string; nome: string } | null>(null);

  React.useEffect(() => {
    if (registro === undefined) return;
    setData(registro?.data ?? hojeISO());
    setDados(registro?.dados ?? {});
    setArquivo(registro?.arquivo_url ? { caminho: registro.arquivo_url, nome: registro.arquivo_nome ?? "arquivo" } : null);
  }, [registro]);

  if (registro === undefined) return null;

  return (
    <div className="card-surface space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold">{registro ? "Editar anamnese" : "Nova anamnese"}</h2>
        <div className="flex items-center gap-2">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-[160px]" />
          <UploadArquivo
            bucket="paciente-exames" prefixo="anamnese"
            arquivoUrl={arquivo?.caminho} arquivoNome={arquivo?.nome}
            aoEnviar={setArquivo} rotulo="Anexar anamnese externa"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {BLOCOS.map((b) => (
          <div key={b.chave} className="space-y-1.5">
            <Label htmlFor={`a-${b.chave}`}>{b.rotulo}</Label>
            <Textarea
              id={`a-${b.chave}`} value={dados[b.chave] ?? ""}
              onChange={(e) => setDados((d) => ({ ...d, [b.chave]: e.target.value }))}
              placeholder={b.placeholder}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={salvar.isPending}
          onClick={async () => {
            await salvar.mutateAsync({
              ...(registro?.id ? { id: registro.id } : {}),
              patient_id: pacienteId, data, dados,
              arquivo_url: arquivo?.caminho ?? null, arquivo_nome: arquivo?.nome ?? null,
            } as any);
            onFechar();
          }}
        >
          {salvar.isPending && <Loader2 className="animate-spin" />} Salvar anamnese
        </Button>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
      </div>
    </div>
  );
}
