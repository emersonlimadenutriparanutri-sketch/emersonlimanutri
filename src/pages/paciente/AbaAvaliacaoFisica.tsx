import * as React from "react";
import { Plus, Loader2, Trash2, Ruler, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { useAuth } from "@/contexts/AuthContext";
import { abrirArquivo, enviarArquivo } from "@/lib/storage";
import { fmtData, hojeISO } from "@/lib/format";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { AvaliacaoFisica } from "@/types/db";

const MEDIDAS = [
  { chave: "pescoco", rotulo: "Pescoço" }, { chave: "ombro", rotulo: "Ombro" },
  { chave: "torax", rotulo: "Tórax" }, { chave: "cintura", rotulo: "Cintura" },
  { chave: "abdomen", rotulo: "Abdômen" }, { chave: "quadril", rotulo: "Quadril" },
  { chave: "braco_d", rotulo: "Braço D" }, { chave: "braco_e", rotulo: "Braço E" },
  { chave: "coxa_d", rotulo: "Coxa D" }, { chave: "coxa_e", rotulo: "Coxa E" },
  { chave: "panturrilha_d", rotulo: "Panturrilha D" }, { chave: "panturrilha_e", rotulo: "Panturrilha E" },
];

const DOBRAS = [
  { chave: "triciptal", rotulo: "Tricipital" }, { chave: "subescapular", rotulo: "Subescapular" },
  { chave: "suprailiaca", rotulo: "Supra-ilíaca" }, { chave: "abdominal", rotulo: "Abdominal" },
  { chave: "coxa", rotulo: "Coxa" }, { chave: "peitoral", rotulo: "Peitoral" },
  { chave: "axilar_media", rotulo: "Axilar média" },
];

export default function AbaAvaliacaoFisica({ paciente }: PropsAbaPaciente) {
  const { user } = useAuth();
  const { data: avaliacoes = [] } = useLista<AvaliacaoFisica>("avaliacoes_fisicas", { filtros: { patient_id: paciente.id }, ordenarPor: "data" });
  const salvar = useSalvar<AvaliacaoFisica>("avaliacoes_fisicas", "Avaliação salva.");
  const remover = useRemover("avaliacoes_fisicas", "Avaliação removida.");

  const [editando, setEditando] = React.useState<AvaliacaoFisica | null | undefined>(undefined);
  const [paraExcluir, setParaExcluir] = React.useState<AvaliacaoFisica | null>(null);
  const [enviandoFoto, setEnviandoFoto] = React.useState(false);
  const inputFoto = React.useRef<HTMLInputElement>(null);
  const [alvoFoto, setAlvoFoto] = React.useState<AvaliacaoFisica | null>(null);

  const enviarFoto = async (file: File) => {
    if (!user || !alvoFoto) return;
    setEnviandoFoto(true);
    try {
      const { caminho } = await enviarArquivo("avaliacoes-fotos", user.id, file, paciente.id);
      await salvar.mutateAsync({
        id: alvoFoto.id,
        fotos: [...(alvoFoto.fotos ?? []), { url: caminho, angulo: "frente" }],
      } as any);
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setEnviandoFoto(false);
      setAlvoFoto(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Bioimpedância, dobras, medidas e fotos — a base objetiva da evolução.
        </p>
        <Button onClick={() => setEditando(null)}><Plus /> Nova avaliação</Button>
      </div>

      <input
        ref={inputFoto} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = ""; }}
      />

      {editando !== undefined && (
        <EditorAvaliacao
          avaliacao={editando} pacienteId={paciente.id}
          salvar={salvar} onFechar={() => setEditando(undefined)}
        />
      )}

      {avaliacoes.length === 0 && editando === undefined ? (
        <EmptyState icone={<Ruler />} titulo="Nenhuma avaliação registrada" descricao="Registre a primeira medição para acompanhar a recomposição corporal." />
      ) : (
        avaliacoes.map((a) => (
          <div key={a.id} className="card-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <p className="font-display text-sm font-semibold">Avaliação de {fmtData(a.data)}</p>
                <p className="text-xs capitalize text-muted-foreground">{a.metodo?.replace("_", " ")}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="sm" disabled={enviandoFoto}
                  onClick={() => { setAlvoFoto(a); inputFoto.current?.click(); }}
                >
                  {enviandoFoto && alvoFoto?.id === a.id ? <Loader2 className="animate-spin" /> : <ImagePlus />} Foto
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditando(a)}>Editar</Button>
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(a)}><Trash2 /></Button>
              </div>
            </div>

            <div className="grid gap-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
              <Metrica rotulo="Peso" valor={a.peso} unidade="kg" />
              <Metrica rotulo="IMC" valor={a.imc} />
              <Metrica rotulo="Gordura" valor={a.gordura_pct} unidade="%" />
              <Metrica rotulo="Massa magra" valor={a.massa_magra} unidade="kg" />
              <Metrica rotulo="Água" valor={a.agua_pct} unidade="%" />
              <Metrica rotulo="TMB" valor={a.tmb} unidade="kcal" />
            </div>

            {Object.keys(a.medidas ?? {}).length > 0 && (
              <div className="border-t border-border px-5 py-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Medidas (cm)</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {MEDIDAS.filter((m) => a.medidas?.[m.chave]).map((m) => (
                    <span key={m.chave}>{m.rotulo}: <strong>{a.medidas[m.chave]}</strong></span>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(a.dobras ?? {}).length > 0 && (
              <div className="border-t border-border px-5 py-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Dobras cutâneas (mm)</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {DOBRAS.filter((d) => a.dobras?.[d.chave]).map((d) => (
                    <span key={d.chave}>{d.rotulo}: <strong>{a.dobras[d.chave]}</strong></span>
                  ))}
                </div>
              </div>
            )}

            {(a.fotos ?? []).length > 0 && (
              <div className="border-t border-border px-5 py-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Fotos</p>
                <div className="flex flex-wrap gap-2">
                  {a.fotos.map((f, i) => (
                    <Button key={i} variant="outline" size="sm" onClick={() => abrirArquivo("avaliacoes-fotos", f.url)}>
                      Foto {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {a.observacoes && (
              <div className="border-t border-border px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.observacoes}</p>
              </div>
            )}
          </div>
        ))
      )}

      <ConfirmDialog
        aberto={Boolean(paraExcluir)} onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Excluir avaliação" destrutivo confirmar="Excluir"
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function Metrica({ rotulo, valor, unidade }: { rotulo: string; valor?: number | null; unidade?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 font-display text-lg font-semibold">
        {valor ?? "—"}{valor != null && unidade ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unidade}</span> : null}
      </p>
    </div>
  );
}

function EditorAvaliacao({
  avaliacao, pacienteId, salvar, onFechar,
}: {
  avaliacao: AvaliacaoFisica | null; pacienteId: string;
  salvar: ReturnType<typeof useSalvar<AvaliacaoFisica>>; onFechar: () => void;
}) {
  const [form, setForm] = React.useState({
    data: hojeISO(), metodo: "bioimpedancia",
    peso: "", altura: "", gordura_pct: "", massa_magra: "", agua_pct: "", tmb: "", observacoes: "",
  });
  const [medidas, setMedidas] = React.useState<Record<string, string>>({});
  const [dobras, setDobras] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!avaliacao) return;
    setForm({
      data: avaliacao.data, metodo: avaliacao.metodo ?? "bioimpedancia",
      peso: avaliacao.peso != null ? String(avaliacao.peso) : "",
      altura: avaliacao.altura != null ? String(avaliacao.altura) : "",
      gordura_pct: avaliacao.gordura_pct != null ? String(avaliacao.gordura_pct) : "",
      massa_magra: avaliacao.massa_magra != null ? String(avaliacao.massa_magra) : "",
      agua_pct: avaliacao.agua_pct != null ? String(avaliacao.agua_pct) : "",
      tmb: avaliacao.tmb != null ? String(avaliacao.tmb) : "",
      observacoes: avaliacao.observacoes ?? "",
    });
    setMedidas(Object.fromEntries(Object.entries(avaliacao.medidas ?? {}).map(([k, v]) => [k, String(v)])));
    setDobras(Object.fromEntries(Object.entries(avaliacao.dobras ?? {}).map(([k, v]) => [k, String(v)])));
  }, [avaliacao]);

  // IMC recalculado sempre que peso ou altura mudam.
  const imc = React.useMemo(() => {
    const p = Number(form.peso), a = Number(form.altura) / 100;
    return p > 0 && a > 0 ? Number((p / (a * a)).toFixed(1)) : null;
  }, [form.peso, form.altura]);

  const numerico = (obj: Record<string, string>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));

  return (
    <div className="card-surface space-y-5 p-5">
      <h2 className="font-display text-base font-semibold">{avaliacao ? "Editar avaliação" : "Nova avaliação"}</h2>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="af-data">Data</Label>
          <Input id="af-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Método</Label>
          <Select value={form.metodo} onValueChange={(v) => setForm({ ...form, metodo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bioimpedancia">Bioimpedância</SelectItem>
              <SelectItem value="dobras">Dobras cutâneas</SelectItem>
              <SelectItem value="medidas">Somente medidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {[
          ["peso", "Peso (kg)"], ["altura", "Altura (cm)"], ["gordura_pct", "Gordura (%)"],
          ["massa_magra", "Massa magra (kg)"], ["agua_pct", "Água (%)"], ["tmb", "TMB (kcal)"],
        ].map(([chave, rotulo]) => (
          <div key={chave} className="space-y-1.5">
            <Label htmlFor={`af-${chave}`}>{rotulo}</Label>
            <Input
              id={`af-${chave}`} type="number" step="0.01"
              value={(form as any)[chave]} onChange={(e) => setForm({ ...form, [chave]: e.target.value })}
            />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label>IMC (calculado)</Label>
          <Input value={imc ?? ""} readOnly className="bg-muted" />
        </div>
      </div>

      <div>
        <Label>Medidas (cm)</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MEDIDAS.map((m) => (
            <Input
              key={m.chave} type="number" step="0.1" placeholder={m.rotulo}
              value={medidas[m.chave] ?? ""} onChange={(e) => setMedidas((v) => ({ ...v, [m.chave]: e.target.value }))}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Dobras cutâneas (mm)</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {DOBRAS.map((d) => (
            <Input
              key={d.chave} type="number" step="0.1" placeholder={d.rotulo}
              value={dobras[d.chave] ?? ""} onChange={(e) => setDobras((v) => ({ ...v, [d.chave]: e.target.value }))}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="af-obs">Observações</Label>
        <Textarea id="af-obs" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={salvar.isPending}
          onClick={async () => {
            await salvar.mutateAsync({
              ...(avaliacao?.id ? { id: avaliacao.id } : {}),
              patient_id: pacienteId, data: form.data, metodo: form.metodo,
              peso: form.peso ? Number(form.peso) : null,
              altura: form.altura ? Number(form.altura) : null,
              imc,
              gordura_pct: form.gordura_pct ? Number(form.gordura_pct) : null,
              massa_magra: form.massa_magra ? Number(form.massa_magra) : null,
              massa_gorda: form.peso && form.gordura_pct ? Number(((Number(form.peso) * Number(form.gordura_pct)) / 100).toFixed(2)) : null,
              agua_pct: form.agua_pct ? Number(form.agua_pct) : null,
              tmb: form.tmb ? Number(form.tmb) : null,
              medidas: numerico(medidas), dobras: numerico(dobras),
              observacoes: form.observacoes || null,
            } as any);
            onFechar();
          }}
        >
          {salvar.isPending && <Loader2 className="animate-spin" />} Salvar avaliação
        </Button>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
      </div>
    </div>
  );
}
