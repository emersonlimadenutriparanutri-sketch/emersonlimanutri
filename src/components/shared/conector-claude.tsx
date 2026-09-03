import * as React from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plug, Trash2, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLista, useRemover, useSalvar } from "@/hooks/use-crud";
import { fmtDataHora } from "@/lib/format";

interface TokenConector {
  id: string;
  nome: string;
  prefixo: string;
  ultimo_uso: string | null;
  revogado: boolean;
  created_at: string;
}

/** Gera um token aleatório e o hash que vai para o banco. O token em si nunca é gravado. */
async function gerarToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const aleatorio = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const token = `nutri_${aleatorio}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash, prefixo: token.slice(0, 12) };
}

export function ConectorClaude() {
  const { data: tokens = [] } = useLista<TokenConector>("mcp_tokens", { ordenarPor: "created_at" });
  const salvar = useSalvar<TokenConector>("mcp_tokens", "");
  const remover = useRemover("mcp_tokens", "Conector removido.");

  const [nome, setNome] = React.useState("Claude");
  const [gerando, setGerando] = React.useState(false);
  const [novoToken, setNovoToken] = React.useState<string | null>(null);
  const [paraRemover, setParaRemover] = React.useState<TokenConector | null>(null);
  const [copiado, setCopiado] = React.useState<string | null>(null);

  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const urlConector = novoToken ? `${base}/functions/v1/mcp/${novoToken}` : "";

  const copiar = async (valor: string, marca: string) => {
    await navigator.clipboard.writeText(valor);
    setCopiado(marca);
    toast.success("Copiado.");
    setTimeout(() => setCopiado(null), 2000);
  };

  const criar = async () => {
    setGerando(true);
    try {
      const { token, hash, prefixo } = await gerarToken();
      await salvar.mutateAsync({ nome: nome.trim() || "Claude", token_hash: hash, prefixo } as any);
      setNovoToken(token);
      setNome("Claude");
    } catch (erro: any) {
      toast.error(erro.message ?? "Não foi possível gerar o conector.");
    } finally {
      setGerando(false);
    }
  };

  const ativos = tokens.filter((t) => !t.revogado);

  return (
    <div className="card-surface max-w-2xl space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Plug className="h-4 w-4 text-secondary" /> Conector do Claude
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Permite conversar com o Claude sobre os seus próprios pacientes: "quem tem plano vencendo
          esta semana?", "monta o resumo da Mariana antes da consulta". O conector enxerga apenas os
          seus dados e você pode revogar o acesso a qualquer momento.
        </p>
      </div>

      {ativos.length > 0 && (
        <div className="divide-y divide-border rounded-xl border border-border">
          {ativos.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.nome}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {t.prefixo}… · {t.ultimo_uso ? `último uso em ${fmtDataHora(t.ultimo_uso)}` : "nunca usado"}
                </p>
              </div>
              {!t.ultimo_uso && <Badge variant="muted">aguardando conexão</Badge>}
              <Button variant="ghost" size="icon-sm" className="text-destructive" title="Revogar" onClick={() => setParaRemover(t)}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label htmlFor="cc-nome">Nome do conector</Label>
          <Input id="cc-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Claude do consultório" />
        </div>
        <Button onClick={criar} disabled={gerando}>
          {gerando ? <Loader2 className="animate-spin" /> : <KeyRound />} Gerar conector
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        O passo a passo para adicionar no Claude está em <code>docs/CONECTOR-CLAUDE.md</code>.
      </p>

      {/* O endereço com o token aparece uma única vez. */}
      <Dialog open={Boolean(novoToken)} onOpenChange={(v) => !v && setNovoToken(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Conector criado</DialogTitle>
            <DialogDescription>
              Copie o endereço agora. Por segurança ele não é guardado em lugar nenhum e
              <strong> não aparece novamente</strong> — se perder, é só gerar outro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Endereço do conector (cole no Claude)</Label>
              <div className="flex gap-2">
                <Input readOnly value={urlConector} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" onClick={() => copiar(urlConector, "url")}>
                  {copiado === "url" ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Token, caso o seu cliente peça separado</Label>
              <div className="flex gap-2">
                <Input readOnly value={novoToken ?? ""} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" onClick={() => copiar(novoToken ?? "", "token")}>
                  {copiado === "token" ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-secondary-soft px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
              <p className="flex items-center gap-1.5 font-medium">
                <Eye className="h-3.5 w-3.5" /> Trate este endereço como uma senha
              </p>
              <p className="mt-1">
                Quem tiver esse link consegue ler e alterar os dados do seu consultório. Não
                compartilhe em grupo, print ou e-mail.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={Boolean(paraRemover)}
        onOpenChange={(v) => !v && setParaRemover(null)}
        titulo="Revogar conector"
        descricao={`"${paraRemover?.nome}" deixa de funcionar imediatamente. O Claude perde o acesso aos seus dados até você gerar um novo conector.`}
        confirmar="Revogar" destrutivo
        onConfirmar={() => { if (paraRemover) remover.mutate(paraRemover.id); setParaRemover(null); }}
      />
    </div>
  );
}
