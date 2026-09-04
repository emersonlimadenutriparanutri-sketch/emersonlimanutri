import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, FlaskConical, Trash2 } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { brand } from "@/config/brand";
import { ConectorClaude } from "@/components/shared/conector-claude";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useQueryClient } from "@tanstack/react-query";

export default function Configuracoes() {
  const { perfil, user, recarregarPerfil } = useAuth();
  const [form, setForm] = React.useState({ nome: "", telefone: "", crn: "", clinica: "" });
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = React.useState(false);
  const [semeando, setSemeando] = React.useState(false);
  const [demo, setDemo] = React.useState<"criar" | "limpar" | null>(null);
  const [rodandoDemo, setRodandoDemo] = React.useState(false);

  React.useEffect(() => {
    if (perfil) setForm({
      nome: perfil.nome ?? "", telefone: perfil.telefone ?? "",
      crn: perfil.crn ?? "", clinica: perfil.clinica ?? "",
    });
  }, [perfil]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const { error } = await supabase.from("profiles").update(form).eq("id", user!.id);
      if (error) throw error;
      await recarregarPerfil();
      toast.success("Perfil atualizado.");
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setSalvando(false);
    }
  };

  /** Cria plano de contas, jornada modelo e questionários padrão (idempotente). */
  const semearDados = async () => {
    setSemeando(true);
    try {
      const { error } = await supabase.rpc("seed_dados_iniciais");
      if (error) throw error;
      toast.success("Conteúdo inicial criado. Confira em Serviços, Questionários e Financeiro.");
    } catch (erro: any) {
      toast.error(erro.message ?? "Rode antes a migration 0002_seed.sql no Supabase.");
    } finally {
      setSemeando(false);
    }
  };

  /**
   * Preenche a conta com um consultório fictício para apresentar o sistema.
   * A função existe no banco e roda como o usuário logado — por isso o botão:
   * chamá-la pelo SQL Editor não funcionaria, lá não há usuário autenticado.
   */
  const rodarDemo = async (acao: "criar" | "limpar") => {
    setRodandoDemo(true);
    try {
      const { data, error } = await supabase.rpc(acao === "criar" ? "seed_demo" : "limpar_demo");
      if (error) throw error;
      queryClient.clear();
      toast.success(String(data ?? "Pronto."));
    } catch (erro: any) {
      toast.error(
        erro.message?.includes("does not exist")
          ? "Rode antes o arquivo supabase/demo/seed-demo.sql no SQL Editor."
          : erro.message,
      );
    } finally {
      setRodandoDemo(false);
      setDemo(null);
    }
  };

  return (
    <>
      <PageHero selo="Conta" titulo="Configurações" descricao="Seus dados profissionais e o conteúdo inicial da plataforma." />

      <form onSubmit={salvar} className="card-surface max-w-2xl space-y-4 p-5">
        <h2 className="font-display text-base font-semibold">Perfil profissional</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-nome">Nome</Label>
            <Input id="cfg-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-crn">CRN</Label>
            <Input id="cfg-crn" value={form.crn} onChange={(e) => setForm({ ...form, crn: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-tel">Telefone</Label>
            <Input id="cfg-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-clinica">Consultório / clínica</Label>
            <Input id="cfg-clinica" value={form.clinica} onChange={(e) => setForm({ ...form, clinica: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} readOnly className="bg-muted" />
          </div>
        </div>
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar perfil
        </Button>
      </form>

      <div className="card-surface max-w-2xl space-y-3 p-5">
        <h2 className="font-display text-base font-semibold">Conteúdo inicial</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cria (sem duplicar) o plano de contas, a conta Caixa, dois serviços de exemplo,
          a jornada modelo de 3 meses, um quadro Kanban e os quatro questionários padrão.
        </p>
        <Button variant="outline" onClick={semearDados} disabled={semeando}>
          {semeando ? <Loader2 className="animate-spin" /> : <Sparkles />} Criar conteúdo inicial
        </Button>
      </div>

      <div className="card-surface max-w-2xl space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <FlaskConical className="h-4 w-4 text-secondary" /> Consultório de demonstração
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Preenche esta conta com 11 pacientes fictícios do perfil 40+, leads no funil, três meses
          de avaliações, exames, questionários, jornada e financeiro — para apresentar o sistema
          sem expor ninguém.
        </p>
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          Use uma conta separada só para demonstrar. Não rode isto na conta em que você atende
          pacientes reais.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setDemo("criar")} disabled={rodandoDemo}>
            {rodandoDemo ? <Loader2 className="animate-spin" /> : <FlaskConical />} Criar demonstração
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={() => setDemo("limpar")} disabled={rodandoDemo}>
            <Trash2 /> Remover dados de demonstração
          </Button>
        </div>
      </div>

      <ConectorClaude />

      <ConfirmDialog
        aberto={demo === "criar"}
        onOpenChange={(v) => !v && setDemo(null)}
        titulo="Criar consultório de demonstração"
        descricao="Serão criados pacientes, leads e lançamentos fictícios nesta conta. Se ela já tiver uma demonstração, a anterior é substituída. Nada que você mesmo cadastrou é apagado."
        confirmar="Criar demonstração"
        onConfirmar={() => rodarDemo("criar")}
      />

      <ConfirmDialog
        aberto={demo === "limpar"}
        onOpenChange={(v) => !v && setDemo(null)}
        titulo="Remover dados de demonstração"
        descricao="Apaga somente os registros criados pela demonstração. Pacientes, leads e lançamentos que você cadastrou continuam intactos."
        confirmar="Remover" destrutivo
        onConfirmar={() => rodarDemo("limpar")}
      />

      <div className="card-surface max-w-2xl space-y-2 p-5">
        <h2 className="font-display text-base font-semibold">Sobre esta instalação</h2>
        <p className="text-sm text-muted-foreground">
          {brand.nome} — {brand.tagline}. Os dados ficam no seu próprio projeto Supabase, com
          isolamento por usuário em todas as tabelas.
        </p>
      </div>
    </>
  );
}
