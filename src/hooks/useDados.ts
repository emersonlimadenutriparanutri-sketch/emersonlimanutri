import { useCallback, useEffect, useState } from 'react'

type Estado<T> = {
  dados: T | null
  carregando: boolean
  erro: string | null
  recarregar: () => void
}

/**
 * Busca assíncrona simples com recarga manual. Evita repetir o mesmo
 * useEffect com flag de cancelamento em toda tela.
 */
export function useDados<T>(buscar: () => Promise<T>, deps: unknown[] = []): Estado<T> {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // A dependência real é a lista passada pela tela; o buscar é recriado a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(buscar, deps)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro(null)

    executar()
      .then((resultado) => {
        if (ativo) setDados(resultado)
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [executar, tick])

  return { dados, carregando, erro, recarregar: () => setTick((t) => t + 1) }
}
