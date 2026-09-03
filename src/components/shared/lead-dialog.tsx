import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLista, useSalvar } from "@/hooks/use-crud";
import type { Lead, Servico, StatusLead, Temperatura } from "@/types/db";

export const ETAPAS: { chave: StatusLead; rotulo: string }[] = [
  { chave: "novo_lead", rotulo: "Novo lead" },
  { chave: "contato_feito", rotulo: "Contato feito" },
  { chave: "qualificado", rotulo: "Qualificado" },
  { chave: "proposta_enviada", rotulo: "Proposta enviada" },
  { chave: "agendado", rotulo: "Agendado" },
  { chave: "fechado", rotulo: "Fechado" },
  { chave: "perdido", rotulo: "Perdido" },
];

export const ORIGENS = ["Instagram", "Indicação", "Tráfego pago", "Google", "WhatsApp", "Evento", "Site", "Outro"];

const vazio = {
  nome: "", telefone: "", email: "", cidade: "", estado: "", instagram: "",
  data_nascimento: "", sexo: "", profissao: "", origem: "", status: "novo_lead" as StatusLead,
  temperatura: "frio" as Temperatura, valor_potencial: "", servico_id: "", data_consulta: "",
  proxima_acao: "", proxima_acao_data: "", tags: "", observacoes: "",
};

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: Lead | null;
  statusInicial?: StatusLead;
}

export function LeadDialog({ aberto, onOpenChange, lead, statusInicial }: Props) {
  const salvar = useSalvar<Lead>("leads", "Lead salvo.");
  const { data: servicos = [] } = useLista<Servico>("servicos", { filtros: { ativo: true }, ordenarPor: "nome", crescente: true });
  const [form, setForm] = React.useState(vazio);

  React.useEffect(() => {
    if (!aberto) return;
    setForm(
      lead
        ? {
            ...vazio,
            ...Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v ?? ""])),
            valor_potencial: lead.valor_potencial ? String(lead.valor_potencial) : "",
            data_consulta: lead.data_consulta ? lead.data_consulta.slice(0, 16) : "",
            tags: (lead.tags ?? []).join(", "),
          } as typeof vazio
        : { ...vazio, status: statusInicial ?? "novo_lead" },
    );
  }, [aberto, lead, statusInicial]);

  const set = (campo: keyof typeof form) => (valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    // O serviço escolhido projeta o valor potencial quando ele não foi digitado.
    const servico = servicos.find((s) => s.id === form.servico_id);
    await salvar.mutateAsync({
      ...(lead?.id ? { id: lead.id } : {}),
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      email: form.email || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      instagram: form.instagram || null,
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo || null,
      profissao: form.profissao || null,
      origem: form.origem || null,
      status: form.status,
      temperatura: form.temperatura,
      valor_potencial: form.valor_potencial ? Number(form.valor_potencial) : (servico?.valor ?? 0),
      servico_id: form.servico_id || null,
      data_consulta: form.data_consulta ? new Date(form.data_consulta).toISOString() : null,
      proxima_acao: form.proxima_acao || null,
      proxima_acao_data: form.proxima_acao_data || null,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      observacoes: form.observacoes || null,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
          <DialogDescription>
            Os dados pessoais preenchidos aqui são copiados para o paciente na conversão.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-nome">Nome *</Label>
              <Input id="l-nome" required value={form.nome} onChange={(e) => set("nome")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-tel">Telefone</Label>
              <Input id="l-tel" value={form.telefone} onChange={(e) => set("telefone")(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-email">E-mail</Label>
              <Input id="l-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-cidade">Cidade</Label>
              <Input id="l-cidade" value={form.cidade} onChange={(e) => set("cidade")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-insta">Instagram</Label>
              <Input id="l-insta" value={form.instagram} onChange={(e) => set("instagram")(e.target.value)} placeholder="@perfil" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-nasc">Data de nascimento</Label>
              <Input id="l-nasc" type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={form.sexo || undefined} onValueChange={set("sexo")}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={form.origem || undefined} onValueChange={set("origem")}>
                <SelectTrigger><SelectValue placeholder="De onde veio?" /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={form.status} onValueChange={(v) => set("status")(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => <SelectItem key={e.chave} value={e.chave}>{e.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Temperatura</Label>
              <Select value={form.temperatura} onValueChange={(v) => set("temperatura")(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="frio">Frio</SelectItem>
                  <SelectItem value="morno">Morno</SelectItem>
                  <SelectItem value="quente">Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Serviço de interesse</Label>
              <Select value={form.servico_id || undefined} onValueChange={set("servico_id")}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  {servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-valor">Valor potencial (R$)</Label>
              <Input id="l-valor" type="number" step="0.01" value={form.valor_potencial} onChange={(e) => set("valor_potencial")(e.target.value)} placeholder="Herda do serviço" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-consulta">Data da consulta</Label>
              <Input id="l-consulta" type="datetime-local" value={form.data_consulta} onChange={(e) => set("data_consulta")(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="l-acao">Próxima ação</Label>
              <Input id="l-acao" value={form.proxima_acao} onChange={(e) => set("proxima_acao")(e.target.value)} placeholder="Ex.: enviar proposta" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-acao-data">Quando</Label>
              <Input id="l-acao-data" type="date" value={form.proxima_acao_data} onChange={(e) => set("proxima_acao_data")(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-tags">Tags (separadas por vírgula)</Label>
              <Input id="l-tags" value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="menopausa, tirzepatida" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-obs">Observações</Label>
              <Textarea id="l-obs" value={form.observacoes} onChange={(e) => set("observacoes")(e.target.value)} placeholder="O que ela contou na conversa, dores, contexto…" />
            </div>
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
