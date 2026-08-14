import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : parseISO(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

export function dataCurta(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  return d ? format(d, "dd/MM/yy", { locale: ptBR }) : '—'
}

export function dataLonga(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  return d ? format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—'
}

export function dataHora(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  return d ? format(d, "dd/MM 'às' HH:mm", { locale: ptBR }) : '—'
}

export function hora(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  return d ? format(d, 'HH:mm', { locale: ptBR }) : '—'
}

/** "Hoje 14:30", "Ontem 09:12" ou "12/03 09:12" — usado no chat e no diário. */
export function quando(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  if (!d) return '—'
  if (isToday(d)) return `Hoje ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`
  return format(d, "dd/MM HH:mm", { locale: ptBR })
}

export function haQuantoTempo(valor: string | Date | null | undefined): string {
  const d = paraData(valor)
  return d ? formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true }) : '—'
}

/** Segunda-feira da semana corrente, em ISO (chave do check-in semanal). */
export function semanaAtual(base: Date = new Date()): string {
  return format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function rotuloSemana(iso: string): string {
  const d = paraData(iso)
  return d ? `Semana de ${format(d, "d 'de' MMMM", { locale: ptBR })}` : iso
}

export function numero(valor: number | null | undefined, casas = 1, sufixo = ''): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return `${valor.toFixed(casas).replace('.', ',')}${sufixo}`
}

export function diferenca(atual: number | null | undefined, anterior: number | null | undefined): string | null {
  if (atual == null || anterior == null) return null
  const delta = atual - anterior
  if (Math.abs(delta) < 0.05) return 'sem mudança'
  const sinal = delta > 0 ? '+' : '−'
  return `${sinal}${Math.abs(delta).toFixed(1).replace('.', ',')}`
}

export function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome.trim().split(/\s+/)[0]
}

export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export const NOMES_REFEICAO: Record<string, string> = {
  cafe: 'Café da manhã',
  lanche_manha: 'Lanche da manhã',
  almoco: 'Almoço',
  lanche_tarde: 'Lanche da tarde',
  jantar: 'Jantar',
  ceia: 'Ceia',
  extra: 'Fora de hora',
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
