import { cn } from "@/lib/utils";

interface Props {
  selo: string;
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  className?: string;
}

/** Cabeçalho em bloco azul-marinho com selo em caixa alta — assinatura do app. */
export const PageHero = ({ selo, titulo, descricao, acoes, className }: Props) => (
  <header className={cn("hero-block", className)}>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <span className="seal text-secondary">
          <span className="h-px w-6 bg-secondary" />
          {selo}
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-2 text-sm leading-relaxed text-primary-foreground/70">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  </header>
);
