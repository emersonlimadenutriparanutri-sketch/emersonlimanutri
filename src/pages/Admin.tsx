import * as React from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck, X, Loader2 } from "lucide-react";
import { PageHero } from "@/components/shared/page-hero";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { fmtData } from "@/lib/format";
import type { Perfil } from "@/types/db";

const MODULOS = [
  { chave: "ia", rotulo: "Área de IA" },
  { chave: "financeiro", rotulo: "Financeiro" },
  { chave: "mapas", rotulo: "Mapas mentais" },
];

export default function Admin() {
  const { isAdmin, carregando, user } = useAuth();
  const queryClient = useQueryClient();
  const [processando, setProcessando] = React.useState<string | null>(null);

  const { data: perfis = [], isLoading } = useQuery<Perfil[]>({
    queryKey: ["admin", "profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  const { data: features = [] } = useQuery<{ user_id: string; feature: string; habilitado: boolean }[]>({
    queryKey: ["admin", "features"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_features").select("user_id, feature, habilitado");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (carregando) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const alternarAprovacao = async (perfil: Perfil, aprovado: boolean) => {
    setProcessando(perfil.id);
    try {
      const { error } = await supabase.from("profiles").update({ aprovado }).eq("id", perfil.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      toast.success(aprovado ? "Acesso liberado." : "Acesso revogado.");
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setProcessando(null);
    }
  };

  const alternarModulo = async (userId: string, feature: string, habilitado: boolean) => {
    try {
      const { error } = await supabase.from("user_features")
        .upsert({ user_id: userId, feature, habilitado }, { onConflict: "user_id,feature" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
    } catch (erro: any) {
      toast.error(erro.message);
    }
  };

  const pendentes = perfis.filter((p) => !p.aprovado);
  const ativos = perfis.filter((p) => p.aprovado);

  return (
    <>
      <PageHero
        selo="Administração" titulo="Acessos e módulos"
        descricao="Libere novos cadastros e escolha quais módulos cada pessoa enxerga no menu."
      />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Aguardando aprovação ({pendentes.length})</h2>
        {isLoading ? null : pendentes.length === 0 ? (
          <EmptyState icone={<ShieldCheck />} titulo="Nenhum cadastro pendente" />
        ) : (
          <div className="card-surface divide-y divide-border overflow-hidden">
            {pendentes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium">{p.nome ?? "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{p.email} · cadastro em {fmtData(p.created_at)}</p>
                </div>
                <Button size="sm" disabled={processando === p.id} onClick={() => alternarAprovacao(p, true)}>
                  {processando === p.id ? <Loader2 className="animate-spin" /> : <Check />} Aprovar
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Usuários ativos ({ativos.length})</h2>
        <div className="card-surface divide-y divide-border overflow-hidden">
          {ativos.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-[180px] flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {p.nome ?? "Sem nome"}
                  {p.id === user?.id && <Badge variant="secondary">você</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {MODULOS.map((m) => {
                  const registro = features.find((f) => f.user_id === p.id && f.feature === m.chave);
                  return (
                    <label key={m.chave} className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={registro ? registro.habilitado : true}
                        onCheckedChange={(v) => alternarModulo(p.id, m.chave, v)}
                      />
                      {m.rotulo}
                    </label>
                  );
                })}
              </div>

              {p.id !== user?.id && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => alternarAprovacao(p, false)}>
                  <X /> Revogar
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
