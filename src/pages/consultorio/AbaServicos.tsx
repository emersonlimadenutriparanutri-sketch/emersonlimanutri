import * as React from "react";
import { Plus, Pencil, Trash2, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { fmtMoeda } from "@/lib/format";
import type { Servico } from "@/types/db";

export default function AbaServicos() {
  const { data: servicos = [] } = useLista<Servico>("servicos", { ordenarPor: "nome", crescente: true });
  const salvar = useSalvar<Servico>("servicos", "Serviço salvo.");
  const remover = useRemover("servicos", "Serviço removido.");
  const [aberto, setAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<Servico | null>(null);
  const [paraExcluir, setParaExcluir] = React.useState<Servico | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          O catálogo alimenta a projeção de receita do funil e define o tipo de plano do paciente.
        </p>
        <Button onClick={() => { setEmEdicao(null); setAberto(true); }}><Plus /> Novo serviço</Button>
      </div>

      {servicos.length === 0 ? (
        <EmptyState
          icone={<Package />}
          titulo="Nenhum serviço cadastrado"
          descricao="Cadastre seus planos para vinculá-los aos leads e projetar receita."
          acao={<Button onClick={() => setAberto(true)}><Plus /> Novo serviço</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servicos.map((s) => (
            <div key={s.id} className="card-surface flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-semibold">{s.nome}</h3>
                <Badge variant={s.tipo === "premium" ? "secondary" : "muted"}>{s.tipo === "premium" ? "Premium" : "Mensal"}</Badge>
              </div>
              {s.descricao && <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{s.descricao}</p>}
              <p className="mt-4 font-display text-xl font-semibold text-secondary">{fmtMoeda(s.valor)}</p>
              <p className="text-[11px] text-muted-foreground">
                {s.duracao_meses && s.duracao_meses > 1 ? `${s.duracao_meses} meses de acompanhamento` : "Renovação mensal"}
              </p>
              <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
                {!s.ativo && <Badge variant="muted">Inativo</Badge>}
                <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => { setEmEdicao(s); setAberto(true); }}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setParaExcluir(s)}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DialogServico aberto={aberto} onOpenChange={setAberto} servico={emEdicao} salvar={salvar} />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        onOpenChange={(v) => !v && setParaExcluir(null)}
        titulo="Remover serviço"
        descricao={`"${paraExcluir?.nome}" deixa de aparecer no catálogo. Leads e pacientes já vinculados continuam intactos.`}
        confirmar="Remover" destrutivo
        onConfirmar={() => { if (paraExcluir) remover.mutate(paraExcluir.id); setParaExcluir(null); }}
      />
    </div>
  );
}

function DialogServico({
  aberto, onOpenChange, servico, salvar,
}: { aberto: boolean; onOpenChange: (v: boolean) => void; servico: Servico | null; salvar: ReturnType<typeof useSalvar<Servico>> }) {
  const [form, setForm] = React.useState({ nome: "", descricao: "", valor: "", tipo: "mensal", duracao_meses: "1", ativo: true });

  React.useEffect(() => {
    if (!aberto) return;
    setForm(servico
      ? { nome: servico.nome, descricao: servico.descricao ?? "", valor: String(servico.valor ?? ""), tipo: servico.tipo, duracao_meses: String(servico.duracao_meses ?? 1), ativo: servico.ativo }
      : { nome: "", descricao: "", valor: "", tipo: "mensal", duracao_meses: "1", ativo: true });
  }, [aberto, servico]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvar.mutateAsync({
      ...(servico?.id ? { id: servico.id } : {}),
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      valor: Number(form.valor) || 0,
      tipo: form.tipo,
      duracao_meses: Number(form.duracao_meses) || 1,
      ativo: form.ativo,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{servico ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-nome">Nome *</Label>
            <Input id="s-nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Descrição</Label>
            <Textarea id="s-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="O que está incluso nesse acompanhamento?" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-valor">Valor (R$)</Label>
              <Input id="s-valor" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-dur">Duração (meses)</Label>
              <Input id="s-dur" type="number" min={1} value={form.duracao_meses} onChange={(e) => setForm({ ...form, duracao_meses: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Serviço ativo</p>
              <p className="text-xs text-muted-foreground">Serviços inativos não aparecem na hora de vincular um lead.</p>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
