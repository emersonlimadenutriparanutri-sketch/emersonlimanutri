import { cn } from "@/lib/utils";

interface Props {
  icone?: React.ReactNode;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({ icone, titulo, descricao, acao, className }: Props) => (
  <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center", className)}>
    {icone && <div className="mb-4 text-muted-foreground/60 [&_svg]:h-8 [&_svg]:w-8">{icone}</div>}
    <p className="font-display text-base font-semibold">{titulo}</p>
    {descricao && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>}
    {acao && <div className="mt-5">{acao}</div>}
  </div>
);
