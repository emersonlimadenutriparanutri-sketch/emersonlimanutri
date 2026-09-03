import * as React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLista, useSalvar } from "@/hooks/use-crud";
import { calcularVencimento } from "@/lib/jornada";
import { hojeISO } from "@/lib/format";
import type { Paciente, Servico } from "@/types/db";

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  aoSalvar?: (paciente: Paciente) => void;
}

export function PacienteDialog({ aberto, onOpenChange, aoSalvar }: Props) {
  const salvar = useSalvar<Paciente>("patients", "Paciente cadastrado.");
  const { data: servicos = [] } = useLista<Servico>("servicos", { filtros: { ativo: true }, ordenarPor: "nome", crescente: true });

  const [form, setForm] = React.useState({
    nome: "", telefone: "", email: "", data_nascimento: "", sexo: "feminino",
    objetivo: "", servico_id: "", plano_inicio: hojeISO(), plano_valor: "",
  });

  React.useEffect(() => {
    if (aberto) setForm({
      nome: "", telefone: "", email: "", data_nascimento: "", sexo: "feminino",
      objetivo: "", servico_id: "", plano_inicio: hojeISO(), plano_valor: "",
    });
  }, [aberto]);

  const servico = servicos.find((s) => s.id === form.servico_id);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const paciente = await salvar.mutateAsync({
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      email: form.email || null,
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo || null,
      objetivo: form.objetivo || null,
      servico_id: form.servico_id || null,
      plano_tipo: servico?.tipo ?? "mensal",
      plano_valor: form.plano_valor ? Number(form.plano_valor) : (servico?.valor ?? 0),
      plano_inicio: form.plano_inicio || null,
      plano_vencimento: form.plano_inicio ? calcularVencimento(form.plano_inicio, servico?.duracao_meses ?? 1) : null,
      status: "ativo",
    } as any);
    onOpenChange(false);
    aoSalvar?.(paciente as Paciente);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo paciente</DialogTitle>
          <DialogDescription>
            O restante da ficha clínica você completa na Central do Paciente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome *</Label>
            <Input id="p-nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-tel">Telefone</Label>
              <Input id="p-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">E-mail</Label>
              <Input id="p-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-nasc">Nascimento</Label>
              <Input id="p-nasc" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-obj">Objetivo</Label>
              <Input id="p-obj" value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} placeholder="Ex.: emagrecimento sustentável na perimenopausa" />
            </div>
            <div className="space-y-1.5">
              <Label>Plano contratado</Label>
              <Select value={form.servico_id || undefined} onValueChange={(v) => setForm({ ...form, servico_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                <SelectContent>
                  {servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-inicio">Início do plano</Label>
              <Input id="p-inicio" type="date" value={form.plano_inicio} onChange={(e) => setForm({ ...form, plano_inicio: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" />} Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
