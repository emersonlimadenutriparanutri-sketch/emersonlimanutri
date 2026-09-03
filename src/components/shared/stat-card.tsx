import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  icone?: React.ReactNode;
  tom?: "neutro" | "sucesso" | "alerta" | "perigo" | "info";
  para?: string;
}

const tons: Record<NonNullable<Props["tom"]>, string> = {
  neutro: "text-primary",
  sucesso: "text-success",
  alerta: "text-warning",
  perigo: "text-destructive",
  info: "text-info",
};

export const StatCard = ({ rotulo, valor, detalhe, icone, tom = "neutro", para }: Props) => {
  const conteudo = (
    <div className="card-surface group h-full p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <span className="seal text-muted-foreground">{rotulo}</span>
        {icone && <span className={cn("shrink-0 opacity-70", tons[tom])}>{icone}</span>}
      </div>
      <p className={cn("stat-value mt-4", tons[tom])}>{valor}</p>
      {detalhe && <p className="mt-2 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
  return para ? <Link to={para} className="block h-full">{conteudo}</Link> : conteudo;
};
