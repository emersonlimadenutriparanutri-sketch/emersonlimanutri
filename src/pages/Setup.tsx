import { brand } from "@/config/brand";

/** Mostrada quando o .env ainda não aponta para um projeto Supabase. */
export default function Setup() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card-surface w-full max-w-2xl p-8">
        <span className="seal text-secondary">
          <span className="h-px w-6 bg-secondary" /> Instalação
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold">Falta conectar o seu Supabase</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O {brand.nome} guarda os dados no <strong>seu próprio</strong> projeto Supabase. Siga os
          três passos abaixo — leva menos de 10 minutos.
        </p>

        <ol className="mt-6 space-y-4 text-sm">
          <li className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-medium">1. Crie um projeto em supabase.com</p>
            <p className="mt-1 text-muted-foreground">Guarde a senha do banco em local seguro.</p>
          </li>
          <li className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-medium">2. Rode o SQL de instalação</p>
            <p className="mt-1 text-muted-foreground">
              No painel, abra <em>SQL Editor</em> e cole o conteúdo de{" "}
              <code className="rounded bg-card px-1.5 py-0.5 text-xs">supabase/migrations/0001_schema.sql</code>{" "}
              e depois <code className="rounded bg-card px-1.5 py-0.5 text-xs">0002_seed.sql</code>.
            </p>
          </li>
          <li className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-medium">3. Preencha o arquivo .env</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-primary p-3 text-xs text-primary-foreground">
{`VITE_SUPABASE_URL="https://xxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOi..."`}
            </pre>
            <p className="mt-2 text-muted-foreground">
              Os dois valores ficam em <em>Project Settings → API</em>. Depois reinicie o servidor.
            </p>
          </li>
        </ol>

        <p className="mt-6 text-xs text-muted-foreground">
          O passo a passo completo, com prints, está em <code>docs/INSTALACAO.md</code>.
        </p>
      </div>
    </div>
  );
}
