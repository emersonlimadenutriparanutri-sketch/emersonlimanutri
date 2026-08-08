// =====================================================================
// Normalização de telefone BR -> E.164 sem '+' (formato da Meta)
//
// Espelha public.wa_normalizar_telefone() do 001_schema.sql.
// Os dois existem porque o cron normaliza em SQL e as Edge Functions
// normalizam em TS — se mudar a regra, mude nos DOIS lugares.
// =====================================================================

/**
 * '(61) 99679-8718'  -> '5561996798718'
 * '55 61 9943-2661'  -> '556199432661'
 * '19992390247'      -> '5519992390247'
 * 'não tenho'        -> null
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  if (!bruto) return null;

  let d = bruto.replace(/\D/g, "");
  if (!d) return null;

  // zeros de discagem interurbana ('061...')
  d = d.replace(/^0+/, "");

  // já tem código do país: 55 + DDD(2) + 8 ou 9 dígitos
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return d;
  }

  // só DDD + número
  if (d.length === 10 || d.length === 11) {
    return "55" + d;
  }

  // formato desconhecido — melhor não disparar do que disparar errado
  return null;
}

/** Formata para exibição na UI: '5561996798718' -> '+55 (61) 99679-8718' */
export function formatarExibicao(waId: string): string {
  const m = waId.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!m) return "+" + waId;
  return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
}
