import * as React from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { brand } from "@/config/brand";

type Modo = "entrar" | "cadastrar" | "recuperar";

export default function Entrar() {
  const { session, entrar, cadastrar, entrarComGoogle, recuperarSenha, carregando } = useAuth();
  const [modo, setModo] = React.useState<Modo>("entrar");
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  if (!carregando && session) return <Navigate to="/" replace />;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      if (modo === "entrar") {
        await entrar(email.trim(), senha);
      } else if (modo === "cadastrar") {
        if (!nome.trim()) throw new Error("Informe o seu nome.");
        await cadastrar(email.trim(), senha, nome.trim());
        toast.success("Cadastro enviado! Seu acesso será liberado após aprovação.");
        setModo("entrar");
      } else {
        await recuperarSenha(email.trim());
        toast.success("Enviamos um link de redefinição para o seu e-mail.");
        setModo("entrar");
      }
    } catch (erro: any) {
      toast.error(erro.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca */}
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/10 font-display text-sm font-semibold">
            {brand.iniciais}
          </div>
          <span className="font-display text-lg font-semibold">{brand.nome}</span>
        </div>
        <div className="max-w-md">
          <span className="seal text-secondary">
            <span className="h-px w-6 bg-secondary" /> Plataforma
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">
            Todo o seu consultório em um só lugar.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/70">
            Leads, pacientes, jornada clínica, finanças e agenda — organizados para você passar
            mais tempo cuidando de gente e menos tempo procurando informação.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/40">{brand.tagline}</p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <span className="font-display text-xl font-semibold">{brand.nome}</span>
          </div>

          <h2 className="mt-6 font-display text-2xl font-semibold lg:mt-0">
            {modo === "entrar" ? "Bem-vindo de volta" : modo === "cadastrar" ? "Criar acesso" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {modo === "entrar"
              ? "Entre com o seu e-mail para continuar."
              : modo === "cadastrar"
                ? "Seu acesso passa por aprovação antes de ser liberado."
                : "Enviaremos um link para você criar uma nova senha."}
          </p>

          <form onSubmit={enviar} className="mt-7 space-y-4">
            {modo === "cadastrar" && (
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com" autoComplete="email"
              />
            </div>

            {modo !== "recuperar" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha">Senha</Label>
                  {modo === "entrar" && (
                    <button type="button" onClick={() => setModo("recuperar")} className="text-[11px] text-secondary hover:underline">
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <Input
                  id="senha" type="password" required minLength={6} value={senha}
                  onChange={(e) => setSenha(e.target.value)} placeholder="••••••••"
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" />}
              {modo === "entrar" ? "Entrar" : modo === "cadastrar" ? "Criar acesso" : "Enviar link"}
            </Button>
          </form>

          {modo !== "recuperar" && (
            <>
              <div className="my-6 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">ou</span>
                <Separator className="flex-1" />
              </div>

              <Button variant="outline" className="w-full" onClick={() => entrarComGoogle().catch((e) => toast.error(e.message))}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
                </svg>
                Continuar com Google
              </Button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {modo === "entrar" ? (
              <>
                Ainda não tem acesso?{" "}
                <button onClick={() => setModo("cadastrar")} className="font-medium text-secondary hover:underline">
                  Solicitar cadastro
                </button>
              </>
            ) : (
              <button onClick={() => setModo("entrar")} className="font-medium text-secondary hover:underline">
                Voltar para o login
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
