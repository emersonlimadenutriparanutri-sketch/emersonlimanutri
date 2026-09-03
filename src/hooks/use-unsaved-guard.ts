import * as React from "react";
import { useBlocker } from "react-router-dom";

/**
 * Guarda de navegação para alterações não salvas.
 * Devolve o estado para renderizar um modal — nunca usa window.confirm.
 */
export function useUnsavedGuard(temAlteracoes: boolean) {
  const blocker = useBlocker(
    React.useCallback(
      ({ currentLocation, nextLocation }) =>
        temAlteracoes && currentLocation.pathname !== nextLocation.pathname,
      [temAlteracoes],
    ),
  );

  React.useEffect(() => {
    if (!temAlteracoes) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [temAlteracoes]);

  return {
    bloqueado: blocker.state === "blocked",
    confirmarSaida: () => blocker.proceed?.(),
    cancelarSaida: () => blocker.reset?.(),
  };
}
