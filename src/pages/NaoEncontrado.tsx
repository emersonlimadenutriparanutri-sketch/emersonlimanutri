import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="seal text-secondary">Erro 404</span>
      <h1 className="font-display text-3xl font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço que você tentou abrir não existe ou foi movido.
      </p>
      <Button asChild className="mt-2">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
