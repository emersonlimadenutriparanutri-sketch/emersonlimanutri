import { Navigate } from "react-router-dom";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { brand } from "@/config/brand";

export default function AguardandoAprovacao() {
  const { session, perfil, sair, recarregarPerfil, carregando } = useAuth();

  if (carregando) return null;
  if (!session) return <Navigate to="/entrar" replace />;
  if (perfil?.aprovado) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card-surface w-full max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary-soft text-secondary">
          <Clock3 className="h-5 w-5" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold">Aguardando aprovação</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Seu cadastro no {brand.nome} foi recebido. Assim que um administrador liberar o acesso,
          esta tela abre o sistema automaticamente.
        </p>
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {perfil?.email ?? session.user.email}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => recarregarPerfil()} variant="outline">
            <RefreshCw /> Verificar novamente
          </Button>
          <Button onClick={() => sair()} variant="ghost" className="text-muted-foreground">
            <LogOut /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
