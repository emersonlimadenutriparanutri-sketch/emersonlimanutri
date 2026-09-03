import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { calcularVencimento } from "@/lib/jornada";
import { faseCiclo, rotuloFase } from "@/lib/format";
import type { PropsAbaPaciente } from "../CentralPaciente";
import type { Paciente, Servico } from "@/types/db";

const CAMPOS_TEXTO = [
  "nome", "telefone", "email", "cidade", "estado", "instagram", "profissao",
  "objetivo", "observacoes", "medicacoes",
] as const;

export default function AbaDados({ paciente }: PropsAbaPaciente) {
  const navigate = useNavigate();
  const salvar = useSalvar<Paciente>("patients", "Dados salvos.");
  const remover = useRemover("patients", "Paciente excluído.");
  const { data: servicos = [] } = useLista<Servico>("servicos", { ordenarPor: "nome", crescente: true });

  const inicial = React.useMemo<Record<string, any>>(
    () => ({
      ...Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, (paciente as any)[c] ?? ""])),
      data_nascimento: paciente.data_nascimento ?? "",
      sexo: paciente.sexo ?? "",
      status: paciente.status,
      servico_id: paciente.servico_id ?? "",
      plano_tipo: paciente.plano_tipo ?? "mensal",
      plano_valor: paciente.plano_valor != null ? String(paciente.plano_valor) : "",
      plano_inicio: paciente.plano_inicio ?? "",
      plano_vencimento: paciente.plano_vencimento ?? "",
      origem: paciente.origem ?? "",
      ciclo_ultima_menstruacao: paciente.ciclo_ultima_menstruacao ?? "",
      ciclo_duracao: String(paciente.ciclo_duracao ?? 28),
      ciclo_duracao_menstruacao: String(paciente.ciclo_duracao_menstruacao ?? 5),
      usa_medicacao: Boolean(paciente.usa_medicacao),
    }),
    [paciente],
  );

  const [form, setForm] = React.useState(inicial);
  const [excluindo, setExcluindo] = React.useState(false);
  React.useEffect(() => setForm(inicial), [inicial]);

  const sujo = JSON.stringify(form) !== JSON.stringify(inicial);
  const { bloqueado, confirmarSaida, cancelarSaida } = useUnsavedGuard(sujo);

  const set = (campo: string, valor: any) => setForm((f) => ({ ...f, [campo]: valor }));
  const ciclo = faseCiclo(form.ciclo_ultima_menstruacao || null, Number(form.ciclo_duracao) || 28, Number(form.ciclo_duracao_menstruacao) || 5);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvar.mutateAsync({
      id: paciente.id,
      ...Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, (form as any)[c] || null])),
      nome: form.nome.trim(),
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo || null,
      status: form.status,
      servico_id: form.servico_id || null,
      plano_tipo: form.plano_tipo,
      plano_valor: form.plano_valor ? Number(form.plano_valor) : 0,
      plano_inicio: form.plano_inicio || null,
      plano_vencimento: form.plano_vencimento || null,
      origem: form.origem || null,
      ciclo_ultima_menstruacao: form.ciclo_ultima_menstruacao || null,
      ciclo_duracao: Number(form.ciclo_duracao) || 28,
      ciclo_duracao_menstruacao: Number(form.ciclo_duracao_menstruacao) || 5,
      usa_medicacao: form.usa_medicacao,
    } as any);
  };

  return (
    <form onSubmit={enviar} className="space-y-5">
      <section className="card-surface p-5">
        <h2 className="font-display text-base font-semibold">Identificação</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="d-nome" rotulo="Nome *" className="sm:col-span-2">
            <Input id="d-nome" required value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </Campo>
          <Campo id="d-nasc" rotulo="Data de nascimento">
            <Input id="d-nasc" type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
          </Campo>
          <Campo id="d-tel" rotulo="Telefone">
            <Input id="d-tel" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
          </Campo>
          <Campo id="d-email" rotulo="E-mail">
            <Input id="d-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Campo>
          <Campo id="d-insta" rotulo="Instagram">
            <Input id="d-insta" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          </Campo>
          <Campo id="d-cidade" rotulo="Cidade">
            <Input id="d-cidade" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </Campo>
          <Campo id="d-prof" rotulo="Profissão">
            <Input id="d-prof" value={form.profissao} onChange={(e) => set("profissao", e.target.value)} />
          </Campo>
          <Campo rotulo="Sexo">
            <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feminino">Feminino</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="d-obj" rotulo="Objetivo" className="sm:col-span-2 lg:col-span-3">
            <Input id="d-obj" value={form.objetivo} onChange={(e) => set("objetivo", e.target.value)} placeholder="Ex.: emagrecimento sustentável na perimenopausa" />
          </Campo>
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="font-display text-base font-semibold">Plano contratado</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A data de vencimento alimenta os indicadores do dashboard e o alerta da jornada.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Serviço">
            <Select
              value={form.servico_id || undefined}
              onValueChange={(v) => {
                const s = servicos.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  servico_id: v,
                  plano_tipo: s?.tipo ?? f.plano_tipo,
                  plano_valor: s ? String(s.valor) : f.plano_valor,
                  plano_vencimento: f.plano_inicio ? calcularVencimento(f.plano_inicio, s?.duracao_meses ?? 1) : f.plano_vencimento,
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
              <SelectContent>{servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Tipo de plano">
            <Select value={form.plano_tipo} onValueChange={(v) => set("plano_tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="d-valor" rotulo="Valor (R$)">
            <Input id="d-valor" type="number" step="0.01" value={form.plano_valor} onChange={(e) => set("plano_valor", e.target.value)} />
          </Campo>
          <Campo id="d-inicio" rotulo="Início do plano">
            <Input id="d-inicio" type="date" value={form.plano_inicio} onChange={(e) => set("plano_inicio", e.target.value)} />
          </Campo>
          <Campo id="d-venc" rotulo="Vencimento">
            <Input id="d-venc" type="date" value={form.plano_vencimento} onChange={(e) => set("plano_vencimento", e.target.value)} />
          </Campo>
          <Campo rotulo="Situação">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="font-display text-base font-semibold">Ciclo menstrual e medicação</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Alimenta o alerta proativo de TPM/menstruação — útil para não confundir retenção com estagnação.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="d-ciclo" rotulo="Última menstruação">
            <Input id="d-ciclo" type="date" value={form.ciclo_ultima_menstruacao} onChange={(e) => set("ciclo_ultima_menstruacao", e.target.value)} />
          </Campo>
          <Campo id="d-dur" rotulo="Duração do ciclo (dias)">
            <Input id="d-dur" type="number" value={form.ciclo_duracao} onChange={(e) => set("ciclo_duracao", e.target.value)} />
          </Campo>
          <Campo id="d-durm" rotulo="Dias de menstruação">
            <Input id="d-durm" type="number" value={form.ciclo_duracao_menstruacao} onChange={(e) => set("ciclo_duracao_menstruacao", e.target.value)} />
          </Campo>
          {ciclo && (
            <p className="rounded-lg bg-secondary-soft px-3 py-2 text-xs text-secondary-foreground sm:col-span-2 lg:col-span-3">
              Fase estimada hoje: <strong>{rotuloFase[ciclo.fase]}</strong> (dia {ciclo.dia} do ciclo).
            </p>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 sm:col-span-2 lg:col-span-3">
            <span className="text-sm font-medium">Usa medicação para emagrecimento</span>
            <Switch checked={form.usa_medicacao} onCheckedChange={(v) => set("usa_medicacao", v)} />
          </div>
          {form.usa_medicacao && (
            <Campo id="d-med" rotulo="Quais medicações e doses" className="sm:col-span-2 lg:col-span-3">
              <Textarea id="d-med" value={form.medicacoes} onChange={(e) => set("medicacoes", e.target.value)} placeholder="Ex.: tirzepatida 5 mg semanal desde março" />
            </Campo>
          )}
        </div>
      </section>

      <section className="card-surface p-5">
        <h2 className="font-display text-base font-semibold">Observações</h2>
        <Textarea className="mt-3" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Contexto de vida, rotina, o que já tentou antes…" />
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lift backdrop-blur">
        <Button type="submit" disabled={salvar.isPending || !sujo}>
          {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
        </Button>
        {sujo && <span className="text-xs text-warning">Há alterações não salvas.</span>}
        <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => setExcluindo(true)}>
          <Trash2 /> Excluir paciente
        </Button>
      </div>

      <ConfirmDialog
        aberto={excluindo} onOpenChange={setExcluindo}
        titulo="Excluir paciente permanentemente" destrutivo confirmar="Excluir tudo"
        descricao={`Todo o histórico de ${paciente.nome} — anamnese, exames, avaliações, jornada e questionários — será apagado. Se a intenção é encerrar o acompanhamento, use "Devolver ao funil".`}
        onConfirmar={() => remover.mutate(paciente.id, { onSuccess: () => navigate("/consultorio?aba=pacientes") })}
      />

      <ConfirmDialog
        aberto={bloqueado} onOpenChange={(v) => !v && cancelarSaida()}
        titulo="Sair sem salvar?" confirmar="Sair mesmo assim" cancelar="Continuar editando" destrutivo
        descricao="Você alterou os dados deste paciente e ainda não salvou."
        onConfirmar={confirmarSaida}
      />
    </form>
  );
}

function Campo({
  id, rotulo, children, className,
}: { id?: string; rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}
