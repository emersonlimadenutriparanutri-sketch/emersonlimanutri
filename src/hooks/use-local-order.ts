import * as React from "react";

/**
 * Ordem de itens persistida em localStorage (usado nas abas reordenáveis
 * do Consultório). Itens novos entram no fim; itens removidos somem.
 */
export function useLocalOrder(chave: string, padrao: string[]) {
  const [ordem, setOrdem] = React.useState<string[]>(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(chave) || "null") as string[] | null;
      if (!Array.isArray(salvo)) return padrao;
      const validos = salvo.filter((id) => padrao.includes(id));
      return [...validos, ...padrao.filter((id) => !validos.includes(id))];
    } catch {
      return padrao;
    }
  });

  const salvar = React.useCallback(
    (nova: string[]) => {
      setOrdem(nova);
      try {
        localStorage.setItem(chave, JSON.stringify(nova));
      } catch {
        /* quota cheia: a ordem apenas não persiste */
      }
    },
    [chave],
  );

  const resetar = React.useCallback(() => {
    localStorage.removeItem(chave);
    setOrdem(padrao);
  }, [chave, padrao]);

  return { ordem, salvar, resetar };
}
