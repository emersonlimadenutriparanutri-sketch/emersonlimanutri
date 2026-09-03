import * as React from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { Pergunta } from "@/types/db";

interface Formulario {
  titulo: string;
  descricao: string | null;
  perguntas: Pergunta[];
  respondido: boolean;
  destinatario: string | null;
}

/**
 * Tela pública, sem login. Os dados vêm de uma Edge Function que roda
 * com service role e só expõe o questionário daquele token.
 */
export default function QuestionarioPublico() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = React.useState<Formulario | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [respostas, setRespostas] = React.useState<Record<string, any>>({});
  const [enviando, setEnviando] = React.useState(false);
  const [enviado, setEnviado] = React.useState(false);

  React.useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("questionario-publico", {
          body: { acao: "buscar", token },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        if (!ativo) return;
        setForm(data as Formulario);
        setEnviado(Boolean((data as Formulario).respondido));
      } catch (e: any) {
        if (ativo) setErro(e.message ?? "Link inválido ou expirado.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const faltando = (form?.perguntas ?? []).find(
      (p) => p.obrigatoria && (respostas[p.id] === undefined || respostas[p.id] === "" ||
        (Array.isArray(respostas[p.id]) && respostas[p.id].length === 0)),
    );
    if (faltando) {
      setErro(`Responda: ${faltando.titulo}`);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("questionario-publico", {
        body: { acao: "responder", token, respostas },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setEnviado(true);
    } catch (e: any) {
      setErro(e.message ?? "Não foi possível enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="card-surface max-w-sm p-8 text-center">
          <h1 className="font-display text-lg font-semibold">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">{erro ?? "Este questionário não está mais ativo."}</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="card-surface max-w-sm p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success/12 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold">Recebido!</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Obrigado por responder. Suas respostas já estão com o seu nutricionista.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="bg-primary px-5 py-8 text-primary-foreground sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          <span className="seal text-secondary">
            <span className="h-px w-6 bg-secondary" /> {brand.nome}
          </span>
          <h1 className="mt-3 font-display text-2xl font-semibold leading-tight">{form.titulo}</h1>
          {form.descricao && <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{form.descricao}</p>}
        </div>
      </header>

      <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-8">
        {form.perguntas.map((p, i) => (
          <div key={p.id} className="card-surface p-5">
            <Label className="text-sm normal-case tracking-normal text-foreground">
              {i + 1}. {p.titulo}
              {p.obrigatoria && <span className="ml-1 text-destructive">*</span>}
            </Label>
            {p.descricao && <p className="mt-1 text-xs text-muted-foreground">{p.descricao}</p>}

            <div className="mt-3">
              {p.tipo === "texto" && (
                <Input value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
              )}
              {p.tipo === "textarea" && (
                <Textarea rows={3} value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
              )}
              {p.tipo === "numero" && (
                <Input type="number" step="0.01" inputMode="decimal" value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
              )}
              {p.tipo === "data" && (
                <Input type="date" value={respostas[p.id] ?? ""} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
              )}
              {p.tipo === "escolha_unica" && (
                <div className="flex flex-wrap gap-2">
                  {(p.opcoes ?? []).map((o) => (
                    <button
                      key={o} type="button"
                      onClick={() => setRespostas((r) => ({ ...r, [p.id]: o }))}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        respostas[p.id] === o ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === "multipla" && (
                <div className="space-y-2">
                  {(p.opcoes ?? []).map((o) => {
                    const marcadas: string[] = respostas[p.id] ?? [];
                    return (
                      <label key={o} className="flex items-center gap-2.5 text-sm">
                        <Checkbox
                          checked={marcadas.includes(o)}
                          onCheckedChange={(v) =>
                            setRespostas((r) => ({
                              ...r,
                              [p.id]: v ? [...marcadas, o] : marcadas.filter((x) => x !== o),
                            }))
                          }
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
              {p.tipo === "escala" && (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: (p.max ?? 10) - (p.min ?? 0) + 1 }, (_, n) => (p.min ?? 0) + n).map((n) => (
                    <button
                      key={n} type="button"
                      onClick={() => setRespostas((r) => ({ ...r, [p.id]: n }))}
                      className={cn(
                        "h-10 w-10 rounded-lg border text-sm transition-colors",
                        respostas[p.id] === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === "upload" && (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Se preferir, envie este arquivo direto pelo WhatsApp do seu nutricionista.
                </p>
              )}
            </div>
          </div>
        ))}

        {erro && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{erro}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />} Enviar respostas
        </Button>
      </form>
    </div>
  );
}
