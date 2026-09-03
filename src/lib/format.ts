import { format, parseISO, differenceInYears, differenceInCalendarDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Datas do banco chegam como "YYYY-MM-DD" (tipo `date`).
 * new Date("2025-03-01") é interpretado como UTC e volta um dia no Brasil.
 * Por isso TODA data pura passa por aqui e vira data local.
 */
export function dataLocal(valor?: string | Date | null): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  if (somenteData) {
    const [a, m, d] = valor.split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  const parsed = parseISO(valor);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Converte um Date para o formato aceito pelo Postgres sem passar por UTC. */
export function paraISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const hojeISO = () => paraISODate(new Date());

export function fmtData(valor?: string | Date | null, padrao = "dd/MM/yyyy") {
  const d = dataLocal(valor);
  return d ? format(d, padrao, { locale: ptBR }) : "—";
}

export function fmtDataHora(valor?: string | Date | null) {
  const d = dataLocal(valor);
  return d ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—";
}

export function fmtMoeda(valor?: number | string | null) {
  const n = typeof valor === "string" ? Number(valor) : valor ?? 0;
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function idade(nascimento?: string | null) {
  const d = dataLocal(nascimento);
  return d ? differenceInYears(new Date(), d) : null;
}

export function diasAte(data?: string | null) {
  const d = dataLocal(data);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

export function iniciais(nome?: string | null) {
  if (!nome) return "?";
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** Link de WhatsApp a partir de um telefone em qualquer formato. */
export function linkWhatsapp(telefone?: string | null, mensagem?: string) {
  if (!telefone) return null;
  let n = telefone.replace(/\D/g, "");
  if (n.length <= 11) n = `55${n}`;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${n}${texto}`;
}

/**
 * Fase do ciclo menstrual a partir da última menstruação.
 * Usado no indicador proativo de TPM/menstruação do dashboard.
 */
export type FaseCiclo = "menstrual" | "folicular" | "ovulatoria" | "lutea" | "tpm";

export function faseCiclo(
  ultima?: string | null,
  duracao = 28,
  duracaoMenstruacao = 5,
): { fase: FaseCiclo; dia: number } | null {
  const d = dataLocal(ultima);
  if (!d || !duracao) return null;
  const decorridos = differenceInCalendarDays(new Date(), d);
  if (decorridos < 0) return null;
  const dia = (decorridos % duracao) + 1;
  const ovulacao = duracao - 14;
  let fase: FaseCiclo;
  if (dia <= duracaoMenstruacao) fase = "menstrual";
  else if (dia < ovulacao - 1) fase = "folicular";
  else if (dia <= ovulacao + 1) fase = "ovulatoria";
  else if (dia >= duracao - 5) fase = "tpm";
  else fase = "lutea";
  return { fase, dia };
}

export const rotuloFase: Record<FaseCiclo, string> = {
  menstrual: "Menstrual",
  folicular: "Folicular",
  ovulatoria: "Ovulatória",
  lutea: "Lútea",
  tpm: "TPM",
};

export { addDays };
