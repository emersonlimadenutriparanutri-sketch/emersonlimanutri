import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Estado {
  erro: Error | null;
}

/**
 * Rede de proteção: sem isto, qualquer exceção de renderização deixa o
 * usuário diante de uma tela branca, sem saber o que aconteceu nem como sair.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error("Falha de renderização:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="card-surface w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold">Algo saiu do lugar nesta tela</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Nenhum dado foi perdido. Recarregue a página; se continuar acontecendo,
            envie a mensagem abaixo para o suporte.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-left text-[11px] text-muted-foreground">
            {this.state.erro.message}
          </pre>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => window.location.reload()}>
              <RotateCcw /> Recarregar
            </Button>
            <Button variant="ghost" onClick={() => { window.location.href = "/"; }}>
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
