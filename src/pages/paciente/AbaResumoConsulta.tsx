import * as React from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, NotebookPen } from "lucide-react";
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
import type { AnaliseExame, AvaliacaoFisica, ResumoConsulta } from "@/types/db";

export default function AbaResumoConsulta({ paciente }: PropsAbaPaciente) {
  const { data: resumos = [] } = useLista<ResumoConsulta>("resumos_consulta", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const { data: avaliacoes = [] } = useLista<AvaliacaoFisica>("avaliacoes_fisicas", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const { data: exames = [] } = useLista<AnaliseExame>("analise_exames", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const salvar = useSalvar<ResumoConsulta>("resumos_consulta", "Resumo salvo.");
  const remover = useRemover("resumos_consulta", "Resumo removido.");

  const [criando, setCriando] = React.useState(false);
  const [form, setForm] = React.useState({ titulo: "", anotacoes: "", data: hojeISO() });
  const [arquivo, setArquivo] = React.useState<{ caminho: string; nome: string } | null>(null);
  const [gerando, setGerando] = React.useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<ResumoConsulta | null>(null);

  const gerar = async (registro: ResumoConsulta) => {
    setGerando(registro.id);
    try {
      const ultimaAvaliacao = avaliacoes[0];
      const ultimoExame = exames[0];
      const { texto } = await chamarIA<{ texto: string }>("resumo-consulta", {
        tipo: "consulta",
        paciente: {
          nome: paciente.nome, idade: idade(paciente.data_nascimento), sexo: paciente.sexo,
          objetivo: paciente.objetivo, medicacoes: paciente.medicacoes,
        },
        anotacoes: registro.anotacoes,
        avaliacao: ultimaAvaliacao
          ? { data: ultimaAvaliacao.data, peso: ultimaAvaliacao.peso, gordura_pct: ultimaAvaliacao.gordura_pct, massa_magra: ultimaAvaliacao.massa_magra, medidas: ultimaAvaliacao.medidas }
          : null,
        exames: ultimoExame ? { data: ultimoExame.data, marcadores: ultimoExame.marcadores } : null,
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
          Escreva as anotações da consulta; o relatório consolidado cruza avaliação e exames recentes.
        </p>
        <Button onClick={() => setCriando(true)}><Plus /> Novo resumo</Button>
      </div>

      {criando && (
        <div className="card-surface space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rc-titulo">Título</Label>
              <Input id="rc-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Retorno do 2º mês" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-data">Data</Label>
              <Input id="rc-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-anot">Anotações da consulta</Label>
            <Textarea id="rc-anot" rows={5} value={form.anotacoes} onChange={(e) => setForm({ ...form, anotacoes: e.target.value })} placeholder="O que foi discutido, condutas, ajustes combinados, o que observar até o próximo retorno." />
          </div>
          <UploadArquivo
            bucket="paciente-exames" prefixo="consultas"
            arquivoUrl={arquivo?.caminho} arquivoNome={arquivo?.nome}
            aoEnviar={setArquivo} rotulo="Anexar PDF externo"
          />
          <div className="flex items-center gap-2">
            <Button
              disabled={salvar.isPending}
              onClick={async () => {
                await salvar.mutateAsync({
                  patient_id: paciente.id, data: form.data,
                  titulo: form.titulo || null, anotacoes: form.anotacoes || null,
                  arquivo_url: arquivo?.caminho ?? null, arquivo_nome: arquivo?.nome ?? null,
                } as any);
                setCriando(false);
                setForm({ titulo: "", anotacoes: "", data: hojeISO() });
                setArquivo(null);
              }}
            >
              {salvar.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
            <Button variant="outline" onClick={() => setCriando(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {resumos.length === 0 && !criando ? (
        <EmptyState icone={<NotebookPen />} titulo="Nenhum resumo de consulta" descricao="Registre a consulta para consolidar o histórico do acompanhamento." />
      ) : (
        resumos.map((r) => (
          <div key={r.id} className="card-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <p className="font-display text-sm font-semibold">{r.titulo || `Consulta de ${fmtData(r.data)}`}</p>
                <p className="text-xs text-muted-foreground">{fmtData(r.data)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(r)}><Trash2 /></Button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {/* PDF externo aparece no topo, como pediu o fluxo de consultório */}
              <UploadArquivo
                bucket="paciente-exames" prefixo="consultas"
                arquivoUrl={r.arquivo_url} arquivoNome={r.arquivo_nome}
                aoEnviar={(d) => salvar.mutate({ id: r.id, arquivo_url: d?.caminho ?? null, arquivo_nome: d?.nome ?? null } as any)}
                rotulo="Anexar PDF externo"
              />
              {r.anotacoes && <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.anotacoes}</p>}
            </div>

            <div className="px-5 pb-5">
              <RelatorioIA
                titulo="Relatório da consulta" conteudo={r.relatorio_ia} paciente={paciente.nome} data={r.data}
                gerando={gerando === r.id} aoGerar={() => gerar(r)}
                vazio="Gere o relatório consolidado desta consulta."
              />
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir resumo" destrutivo confirmar="Excluir"
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}
