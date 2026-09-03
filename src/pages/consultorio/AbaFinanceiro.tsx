import * as React from "react";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from "recharts";
import {
  Plus, TrendingUp, TrendingDown, Wallet, Target, CheckCircle2,
  RotateCcw, Trash2, Loader2, Landmark, CreditCard, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useLista, useSalvar } from "@/hooks/use-crud";
import { useBaixarLancamento, useLancarMovimento, useRemoverMovimento } from "@/hooks/use-financeiro";
import { fmtData, fmtMoeda, hojeISO, dataLocal, paraISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ContaFinanceira, Despesa, Lancamento, MetaFinanceira, Paciente, PlanoConta, Receita, Servico, Lead,
} from "@/types/db";

type SubAba = "visao" | "vendas" | "despesas" | "receber" | "contas" | "metas" | "inteligencia";

const SUBABAS: { chave: SubAba; rotulo: string }[] = [
  { chave: "visao", rotulo: "Visão geral" },
  { chave: "vendas", rotulo: "Vendas" },
  { chave: "despesas", rotulo: "Despesas" },
  { chave: "receber", rotulo: "A receber / a pagar" },
  { chave: "contas", rotulo: "Contas e plano de contas" },
  { chave: "metas", rotulo: "Metas" },
  { chave: "inteligencia", rotulo: "Inteligência de vendas" },
];

const ICONES_CONTA = {
  caixa: Banknote, banco: Landmark, cartao_debito: CreditCard, cartao_credito: CreditCard,
} as const;

const ROTULOS_CONTA = {
  caixa: "Caixa", banco: "Banco", cartao_debito: "Cartão de débito", cartao_credito: "Cartão de crédito",
} as const;

export default function AbaFinanceiro() {
  const [sub, setSub] = React.useState<SubAba>("visao");

  return (
    <div className="space-y-5">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {SUBABAS.map((s) => (
          <button
            key={s.chave}
            onClick={() => setSub(s.chave)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              sub === s.chave ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {s.rotulo}
          </button>
        ))}
      </div>

      {sub === "visao" && <VisaoGeral />}
      {sub === "vendas" && <Movimentos tipo="receita" />}
      {sub === "despesas" && <Movimentos tipo="despesa" />}
      {sub === "receber" && <ContasAReceber />}
      {sub === "contas" && <ContasEPlano />}
      {sub === "metas" && <Metas />}
      {sub === "inteligencia" && <Inteligencia />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visão geral — fluxo de caixa e DRE                                  */
/* ------------------------------------------------------------------ */
function VisaoGeral() {
  const { data: receitas = [] } = useLista<Receita>("receitas", { ordenarPor: "data_competencia" });
  const { data: despesas = [] } = useLista<Despesa>("despesas", { ordenarPor: "data_competencia" });
  const { data: lancamentos = [] } = useLista<Lancamento>("lancamentos", { ordenarPor: "vencimento" });
  const { data: planoContas = [] } = useLista<PlanoConta>("plano_contas", { ordenarPor: "codigo", crescente: true });

  const meses = React.useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 6 }, (_, i) => subMonths(hoje, 5 - i)).map((d) => {
      const intervalo = { start: startOfMonth(d), end: endOfMonth(d) };
      const dentro = (data: string) => {
        const dt = dataLocal(data);
        return dt ? isWithinInterval(dt, intervalo) : false;
      };
      const entrou = receitas.filter((r) => dentro(r.data_competencia)).reduce((s, r) => s + Number(r.valor), 0);
      const saiu = despesas.filter((x) => dentro(x.data_competencia)).reduce((s, x) => s + Number(x.valor), 0);
      const recebido = lancamentos
        .filter((l) => l.pago && l.tipo === "receber" && l.data_pagamento && dentro(l.data_pagamento))
        .reduce((s, l) => s + Number(l.valor), 0);
      return { mes: format(d, "MMM/yy", { locale: ptBR }), Receitas: entrou, Despesas: saiu, Recebido: recebido, resultado: entrou - saiu };
    });
  }, [receitas, despesas, lancamentos]);

  const mesAtual = meses[meses.length - 1];
  const aReceber = lancamentos.filter((l) => !l.pago && l.tipo === "receber").reduce((s, l) => s + Number(l.valor), 0);
  const aPagar = lancamentos.filter((l) => !l.pago && l.tipo === "pagar").reduce((s, l) => s + Number(l.valor), 0);

  // DRE simplificado por conta do plano de contas, no mês corrente.
  const dre = React.useMemo(() => {
    const intervalo = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
    const dentro = (data: string) => {
      const dt = dataLocal(data);
      return dt ? isWithinInterval(dt, intervalo) : false;
    };
    const agrupar = (itens: { plano_conta_id: string | null; valor: number; data_competencia: string }[]) => {
      const mapa = new Map<string, number>();
      for (const i of itens) {
        if (!dentro(i.data_competencia)) continue;
        const nome = planoContas.find((p) => p.id === i.plano_conta_id)?.nome ?? "Sem classificação";
        mapa.set(nome, (mapa.get(nome) ?? 0) + Number(i.valor));
      }
      return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { receitas: agrupar(receitas as any), despesas: agrupar(despesas as any) };
  }, [receitas, despesas, planoContas]);

  const totalReceitasDre = dre.receitas.reduce((s, [, v]) => s + v, 0);
  const totalDespesasDre = dre.despesas.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Receita do mês</span>
          <p className="mt-2 font-display text-xl font-semibold text-success">{fmtMoeda(mesAtual?.Receitas)}</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Despesa do mês</span>
          <p className="mt-2 font-display text-xl font-semibold text-destructive">{fmtMoeda(mesAtual?.Despesas)}</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Resultado</span>
          <p className={cn("mt-2 font-display text-xl font-semibold", (mesAtual?.resultado ?? 0) >= 0 ? "text-success" : "text-destructive")}>
            {fmtMoeda(mesAtual?.resultado)}
          </p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Em aberto</span>
          <p className="mt-2 font-display text-lg font-semibold">{fmtMoeda(aReceber)}</p>
          <p className="text-[11px] text-muted-foreground">a pagar: {fmtMoeda(aPagar)}</p>
        </div>
      </div>

      <div className="card-surface p-5">
        <h3 className="font-display text-base font-semibold">Fluxo dos últimos 6 meses</h3>
        <p className="mb-4 text-xs text-muted-foreground">Competência (quando aconteceu) e caixa (quando entrou de fato).</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={meses}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v / 1000}k`} />
              <ReTooltip
                formatter={(v: any) => fmtMoeda(Number(v))}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Receitas" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Despesas" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Recebido" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="font-display text-base font-semibold">DRE do mês — entradas</h3>
          <ListaDre itens={dre.receitas} total={totalReceitasDre} tom="text-success" />
        </div>
        <div className="card-surface p-5">
          <h3 className="font-display text-base font-semibold">DRE do mês — saídas</h3>
          <ListaDre itens={dre.despesas} total={totalDespesasDre} tom="text-destructive" />
        </div>
      </div>
    </div>
  );
}

function ListaDre({ itens, total, tom }: { itens: [string, number][]; total: number; tom: string }) {
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nada lançado neste mês.</p>;
  return (
    <div className="mt-4 space-y-2">
      {itens.map(([nome, valor]) => (
        <div key={nome} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{nome}</span>
            <span className={cn("shrink-0 font-medium", tom)}>{fmtMoeda(valor)}</span>
          </div>
          <Progress value={total ? (valor / total) * 100 : 0} className="h-1" />
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t border-border pt-3 text-sm font-semibold">
        <span>Total</span><span className={tom}>{fmtMoeda(total)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vendas e despesas                                                   */
/* ------------------------------------------------------------------ */
function Movimentos({ tipo }: { tipo: "receita" | "despesa" }) {
  const tabela = tipo === "receita" ? "receitas" : "despesas";
  const { data: itens = [] } = useLista<any>(tabela, { ordenarPor: "data_competencia" });
  const { data: contas = [] } = useLista<ContaFinanceira>("contas_financeiras", { ordenarPor: "nome", crescente: true });
  const { data: planoContas = [] } = useLista<PlanoConta>("plano_contas", { ordenarPor: "codigo", crescente: true });
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });
  const { data: servicos = [] } = useLista<Servico>("servicos", { ordenarPor: "nome", crescente: true });
  const lancar = useLancarMovimento(tipo);
  const remover = useRemoverMovimento(tipo);
  const [aberto, setAberto] = React.useState(false);

  const contasDoTipo = planoContas.filter((p) => p.tipo === tipo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tipo === "receita"
            ? "Toda venda é lançada pela data em que aconteceu; as parcelas viram contas a receber."
            : "Despesas seguem o mesmo regime de competência, com parcelamento automático."}
        </p>
        <Button onClick={() => setAberto(true)}><Plus /> {tipo === "receita" ? "Nova venda" : "Nova despesa"}</Button>
      </div>

      {itens.length === 0 ? (
        <EmptyState
          icone={tipo === "receita" ? <TrendingUp /> : <TrendingDown />}
          titulo={tipo === "receita" ? "Nenhuma venda lançada" : "Nenhuma despesa lançada"}
          acao={<Button onClick={() => setAberto(true)}><Plus /> Lançar</Button>}
        />
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtData(i.data_competencia)}
                  {i.parcelas > 1 && ` · ${i.parcelas}x`}
                  {planoContas.find((p) => p.id === i.plano_conta_id) && ` · ${planoContas.find((p) => p.id === i.plano_conta_id)!.nome}`}
                </p>
              </div>
              <span className={cn("shrink-0 font-display text-sm font-semibold", tipo === "receita" ? "text-success" : "text-destructive")}>
                {fmtMoeda(i.valor)}
              </span>
              <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => remover.mutate(i.id)}><Trash2 /></Button>
            </div>
          ))}
        </div>
      )}

      <DialogMovimento
        tipo={tipo} aberto={aberto} onOpenChange={setAberto} lancar={lancar}
        contas={contas} planoContas={contasDoTipo} pacientes={pacientes} servicos={servicos}
      />
    </div>
  );
}

function DialogMovimento({
  tipo, aberto, onOpenChange, lancar, contas, planoContas, pacientes, servicos,
}: {
  tipo: "receita" | "despesa"; aberto: boolean; onOpenChange: (v: boolean) => void;
  lancar: ReturnType<typeof useLancarMovimento>;
  contas: ContaFinanceira[]; planoContas: PlanoConta[]; pacientes: Paciente[]; servicos: Servico[];
}) {
  const inicial = {
    descricao: "", valor: "", data_competencia: hojeISO(), parcelas: "1",
    conta_id: "", plano_conta_id: "", patient_id: "", servico_id: "", fornecedor: "", observacoes: "",
  };
  const [form, setForm] = React.useState(inicial);
  React.useEffect(() => { if (aberto) setForm(inicial); }, [aberto]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const paciente = pacientes.find((p) => p.id === form.patient_id);
    await lancar.mutateAsync({
      descricao: form.descricao.trim(),
      valor: Number(form.valor) || 0,
      data_competencia: form.data_competencia,
      parcelas: Number(form.parcelas) || 1,
      conta_id: form.conta_id || null,
      plano_conta_id: form.plano_conta_id || null,
      ...(tipo === "receita"
        ? { patient_id: form.patient_id || null, servico_id: form.servico_id || null, origem_lead: paciente?.origem ?? null }
        : { fornecedor: form.fornecedor || null }),
      observacoes: form.observacoes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tipo === "receita" ? "Nova venda" : "Nova despesa"}</DialogTitle>
          <DialogDescription>Parcelas são geradas automaticamente a cada 30 dias.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Descrição *</Label>
            <Input id="m-desc" required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-valor">Valor total (R$) *</Label>
              <Input id="m-valor" required type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-data">Data (competência)</Label>
              <Input id="m-data" type="date" value={form.data_competencia} onChange={(e) => setForm({ ...form, data_competencia: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-parc">Parcelas</Label>
              <Input id="m-parc" type="number" min={1} max={48} value={form.parcelas} onChange={(e) => setForm({ ...form, parcelas: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={form.conta_id || undefined} onValueChange={(v) => setForm({ ...form, conta_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Classificação</Label>
              <Select value={form.plano_conta_id || undefined} onValueChange={(v) => setForm({ ...form, plano_conta_id: v })}>
                <SelectTrigger><SelectValue placeholder="Plano de contas" /></SelectTrigger>
                <SelectContent>{planoContas.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ` : ""}{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {tipo === "receita" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Paciente</Label>
                  <Select value={form.patient_id || undefined} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Serviço</Label>
                  <Select value={form.servico_id || undefined} onValueChange={(v) => setForm({ ...form, servico_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>{servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="m-forn">Fornecedor</Label>
                <Input id="m-forn" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="m-obs">Observações</Label>
              <Textarea id="m-obs" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={lancar.isPending}>
              {lancar.isPending && <Loader2 className="animate-spin" />} Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Contas a receber / a pagar                                          */
/* ------------------------------------------------------------------ */
function ContasAReceber() {
  const { data: lancamentos = [] } = useLista<Lancamento>("lancamentos", { ordenarPor: "vencimento", crescente: true });
  const baixar = useBaixarLancamento();
  const [filtro, setFiltro] = React.useState<"receber" | "pagar">("receber");
  const [mostrarPagos, setMostrarPagos] = React.useState(false);

  const lista = lancamentos.filter((l) => l.tipo === filtro && (mostrarPagos || !l.pago));
  const total = lista.filter((l) => !l.pago).reduce((s, l) => s + Number(l.valor), 0);
  const hoje = hojeISO();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtro} onValueChange={(v) => setFiltro(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="receber">Contas a receber</SelectItem>
            <SelectItem value="pagar">Contas a pagar</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={mostrarPagos ? "default" : "outline"} size="sm" onClick={() => setMostrarPagos((v) => !v)}>
          {mostrarPagos ? "Ocultar baixados" : "Mostrar baixados"}
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          Em aberto: <strong className="text-foreground">{fmtMoeda(total)}</strong>
        </span>
      </div>

      {lista.length === 0 ? (
        <EmptyState icone={<Wallet />} titulo="Nada por aqui" descricao="Lançamentos aparecem assim que você registrar uma venda ou despesa." />
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {lista.map((l) => {
            const atrasado = !l.pago && l.vencimento < hoje;
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", l.pago && "text-muted-foreground line-through")}>{l.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {fmtData(l.vencimento)}
                    {l.pago && l.data_pagamento && ` · baixado em ${fmtData(l.data_pagamento)}`}
                  </p>
                </div>
                {atrasado && <Badge variant="danger">Atrasado</Badge>}
                <span className="shrink-0 font-display text-sm font-semibold">{fmtMoeda(l.valor)}</span>
                <Button
                  variant={l.pago ? "ghost" : "outline"} size="icon-sm"
                  className={l.pago ? "text-muted-foreground" : "text-success"}
                  title={l.pago ? "Estornar baixa" : "Dar baixa"}
                  onClick={() => baixar.mutate({ id: l.id, pago: !l.pago })}
                >
                  {l.pago ? <RotateCcw /> : <CheckCircle2 />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contas financeiras e plano de contas                                */
/* ------------------------------------------------------------------ */
function ContasEPlano() {
  const { data: contas = [] } = useLista<ContaFinanceira>("contas_financeiras", { ordenarPor: "nome", crescente: true });
  const { data: planoContas = [] } = useLista<PlanoConta>("plano_contas", { ordenarPor: "codigo", crescente: true });
  const salvarConta = useSalvar<ContaFinanceira>("contas_financeiras", "Conta salva.");
  const salvarPlano = useSalvar<PlanoConta>("plano_contas", "Conta do plano salva.");

  const [novaConta, setNovaConta] = React.useState({ nome: "", tipo: "caixa", saldo_inicial: "" });
  const [novaClasse, setNovaClasse] = React.useState({ codigo: "", nome: "", tipo: "despesa", parent_id: "" });

  const raizes = planoContas.filter((p) => !p.parent_id);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card-surface p-5">
        <h3 className="font-display text-base font-semibold">Contas financeiras</h3>
        <p className="mt-1 text-xs text-muted-foreground">Onde o dinheiro entra e sai: caixa, banco e cartões.</p>

        <div className="mt-4 space-y-2">
          {contas.map((c) => {
            const Icone = ICONES_CONTA[c.tipo] ?? Banknote;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                <Icone className="h-4 w-4 shrink-0 text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{ROTULOS_CONTA[c.tipo]}</p>
                </div>
                <span className="text-xs text-muted-foreground">{fmtMoeda(c.saldo_inicial)}</span>
              </div>
            );
          })}
        </div>

        <form
          className="mt-4 space-y-3 border-t border-border pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await salvarConta.mutateAsync({
              nome: novaConta.nome.trim(), tipo: novaConta.tipo,
              saldo_inicial: Number(novaConta.saldo_inicial) || 0,
            } as any);
            setNovaConta({ nome: "", tipo: "caixa", saldo_inicial: "" });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Input required placeholder="Nome da conta" value={novaConta.nome} onChange={(e) => setNovaConta({ ...novaConta, nome: e.target.value })} />
            <Select value={novaConta.tipo} onValueChange={(v) => setNovaConta({ ...novaConta, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROTULOS_CONTA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" step="0.01" placeholder="Saldo inicial" value={novaConta.saldo_inicial} onChange={(e) => setNovaConta({ ...novaConta, saldo_inicial: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full"><Plus /> Adicionar conta</Button>
        </form>
      </div>

      <div className="card-surface p-5">
        <h3 className="font-display text-base font-semibold">Plano de contas</h3>
        <p className="mt-1 text-xs text-muted-foreground">A hierarquia que organiza o DRE.</p>

        <div className="mt-4 space-y-1">
          {raizes.map((raiz) => (
            <div key={raiz.id}>
              <p className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                {raiz.codigo} {raiz.nome}
                <Badge variant={raiz.tipo === "receita" ? "success" : "muted"}>{raiz.tipo}</Badge>
              </p>
              {planoContas.filter((p) => p.parent_id === raiz.id).map((filho) => (
                <p key={filho.id} className="px-3 py-1.5 pl-6 text-sm text-muted-foreground">
                  {filho.codigo} · {filho.nome}
                </p>
              ))}
            </div>
          ))}
        </div>

        <form
          className="mt-4 space-y-3 border-t border-border pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await salvarPlano.mutateAsync({
              codigo: novaClasse.codigo || null, nome: novaClasse.nome.trim(),
              tipo: novaClasse.tipo, parent_id: novaClasse.parent_id || null,
            } as any);
            setNovaClasse({ codigo: "", nome: "", tipo: "despesa", parent_id: "" });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Código (ex.: 2.8)" value={novaClasse.codigo} onChange={(e) => setNovaClasse({ ...novaClasse, codigo: e.target.value })} />
            <Input required placeholder="Nome da conta" value={novaClasse.nome} onChange={(e) => setNovaClasse({ ...novaClasse, nome: e.target.value })} />
            <Select value={novaClasse.tipo} onValueChange={(v) => setNovaClasse({ ...novaClasse, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={novaClasse.parent_id || undefined} onValueChange={(v) => setNovaClasse({ ...novaClasse, parent_id: v })}>
              <SelectTrigger><SelectValue placeholder="Conta pai" /></SelectTrigger>
              <SelectContent>{raizes.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full"><Plus /> Adicionar classificação</Button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metas por dias úteis                                                */
/* ------------------------------------------------------------------ */
function diasUteisNoMes(referencia = new Date()) {
  const inicio = startOfMonth(referencia);
  const fim = endOfMonth(referencia);
  let dias = 0;
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias++;
  }
  return dias;
}

function diasUteisDecorridos(referencia = new Date()) {
  const inicio = startOfMonth(referencia);
  let dias = 0;
  for (let d = new Date(inicio); d <= referencia; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dias++;
  }
  return dias;
}

function Metas() {
  const mesRef = paraISODate(startOfMonth(new Date()));
  const { data: metas = [] } = useLista<MetaFinanceira>("metas_financeiras", { ordenarPor: "mes_ref" });
  const { data: receitas = [] } = useLista<Receita>("receitas", { ordenarPor: "data_competencia" });
  const salvar = useSalvar<MetaFinanceira>("metas_financeiras", "Meta salva.");

  const meta = metas.find((m) => m.mes_ref === mesRef);
  const [form, setForm] = React.useState({ meta_receita: "", meta_pacientes: "", dias_uteis: String(diasUteisNoMes()) });

  React.useEffect(() => {
    if (meta) setForm({
      meta_receita: String(meta.meta_receita), meta_pacientes: String(meta.meta_pacientes),
      dias_uteis: String(meta.dias_uteis),
    });
  }, [meta]);

  const intervalo = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) };
  const realizado = receitas
    .filter((r) => { const d = dataLocal(r.data_competencia); return d && isWithinInterval(d, intervalo); })
    .reduce((s, r) => s + Number(r.valor), 0);

  const metaReceita = Number(meta?.meta_receita ?? 0);
  const diasTotais = Number(meta?.dias_uteis ?? diasUteisNoMes());
  const decorridos = Math.min(diasUteisDecorridos(), diasTotais);
  const metaDiaria = diasTotais ? metaReceita / diasTotais : 0;
  const esperadoAteHoje = metaDiaria * decorridos;
  const progresso = metaReceita ? (realizado / metaReceita) * 100 : 0;
  const noRitmo = realizado >= esperadoAteHoje;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card-surface p-5">
        <span className="seal text-muted-foreground">Meta do mês</span>
        <p className="mt-3 font-display text-3xl font-semibold">{fmtMoeda(realizado)}</p>
        <p className="text-xs text-muted-foreground">de {fmtMoeda(metaReceita)}</p>
        <Progress value={progresso} className="mt-4" indicatorClassName={noRitmo ? "bg-success" : "bg-warning"} />

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Meta diária</p>
            <p className="mt-1 font-display text-base font-semibold">{fmtMoeda(metaDiaria)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Esperado até hoje</p>
            <p className="mt-1 font-display text-base font-semibold">{fmtMoeda(esperadoAteHoje)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dias úteis</p>
            <p className="mt-1 font-display text-base font-semibold">{decorridos}/{diasTotais}</p>
          </div>
        </div>

        <p className={cn("mt-4 rounded-lg px-3 py-2 text-xs", noRitmo ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
          {metaReceita === 0
            ? "Defina uma meta ao lado para acompanhar o ritmo."
            : noRitmo
              ? "Você está no ritmo da meta deste mês."
              : `Faltam ${fmtMoeda(esperadoAteHoje - realizado)} para voltar ao ritmo.`}
        </p>
      </div>

      <form
        className="card-surface space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          await salvar.mutateAsync({
            ...(meta?.id ? { id: meta.id } : {}),
            mes_ref: mesRef,
            meta_receita: Number(form.meta_receita) || 0,
            meta_pacientes: Number(form.meta_pacientes) || 0,
            dias_uteis: Number(form.dias_uteis) || diasUteisNoMes(),
          } as any);
        }}
      >
        <h3 className="flex items-center gap-2 font-display text-base font-semibold"><Target className="h-4 w-4 text-secondary" /> Definir meta</h3>
        <div className="space-y-1.5">
          <Label htmlFor="meta-rec">Receita do mês (R$)</Label>
          <Input id="meta-rec" type="number" step="0.01" value={form.meta_receita} onChange={(e) => setForm({ ...form, meta_receita: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meta-pac">Novos pacientes</Label>
          <Input id="meta-pac" type="number" value={form.meta_pacientes} onChange={(e) => setForm({ ...form, meta_pacientes: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meta-dias">Dias úteis no mês</Label>
          <Input id="meta-dias" type="number" value={form.dias_uteis} onChange={(e) => setForm({ ...form, dias_uteis: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">Sugestão automática: {diasUteisNoMes()} dias.</p>
        </div>
        <Button type="submit" className="w-full" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="animate-spin" />} Salvar meta
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inteligência de vendas — LTV                                        */
/* ------------------------------------------------------------------ */
function Inteligencia() {
  const { data: receitas = [] } = useLista<Receita>("receitas", { ordenarPor: "data_competencia" });
  const { data: pacientes = [] } = useLista<Paciente>("patients", { ordenarPor: "nome", crescente: true });
  const { data: leads = [] } = useLista<Lead>("leads");

  const porPaciente = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of receitas) {
      if (!r.patient_id) continue;
      mapa.set(r.patient_id, (mapa.get(r.patient_id) ?? 0) + Number(r.valor));
    }
    return [...mapa.entries()]
      .map(([id, total]) => ({ nome: pacientes.find((p) => p.id === id)?.nome ?? "Paciente removido", total }))
      .sort((a, b) => b.total - a.total);
  }, [receitas, pacientes]);

  const porOrigem = React.useMemo(() => {
    const mapa = new Map<string, { receita: number; leads: number; fechados: number }>();
    const garantir = (chave: string) => {
      if (!mapa.has(chave)) mapa.set(chave, { receita: 0, leads: 0, fechados: 0 });
      return mapa.get(chave)!;
    };
    for (const l of leads) {
      const item = garantir(l.origem ?? "Sem origem");
      item.leads++;
      if (l.status === "fechado") item.fechados++;
    }
    for (const r of receitas) {
      const paciente = pacientes.find((p) => p.id === r.patient_id);
      const origem = r.origem_lead ?? paciente?.origem ?? "Sem origem";
      garantir(origem).receita += Number(r.valor);
    }
    return [...mapa.entries()].sort((a, b) => b[1].receita - a[1].receita);
  }, [leads, receitas, pacientes]);

  const ltvMedio = porPaciente.length ? porPaciente.reduce((s, p) => s + p.total, 0) / porPaciente.length : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">LTV médio</span>
          <p className="mt-2 font-display text-xl font-semibold text-secondary">{fmtMoeda(ltvMedio)}</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Pacientes com receita</span>
          <p className="mt-2 font-display text-xl font-semibold">{porPaciente.length}</p>
        </div>
        <div className="card-surface p-4">
          <span className="seal text-muted-foreground">Receita acumulada</span>
          <p className="mt-2 font-display text-xl font-semibold">{fmtMoeda(porPaciente.reduce((s, p) => s + p.total, 0))}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="font-display text-base font-semibold">LTV por paciente</h3>
          {porPaciente.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Vincule as vendas a pacientes para ver o LTV.</p>
          ) : (
            <div className="mt-4 divide-y divide-border">
              {porPaciente.slice(0, 12).map((p) => (
                <div key={p.nome} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{p.nome}</span>
                  <span className="shrink-0 font-medium text-secondary">{fmtMoeda(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-surface p-5">
          <h3 className="font-display text-base font-semibold">Receita por origem do lead</h3>
          <p className="mt-1 text-xs text-muted-foreground">Onde vale a pena investir mais tempo e dinheiro.</p>
          <div className="mt-4 divide-y divide-border">
            {porOrigem.map(([origem, dados]) => (
              <div key={origem} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{origem}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dados.leads} leads · {dados.fechados} fechados
                    {dados.leads > 0 && ` · ${Math.round((dados.fechados / dados.leads) * 100)}% de conversão`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium">{fmtMoeda(dados.receita)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
