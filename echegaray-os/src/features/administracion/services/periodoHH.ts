// LOS PERÍODOS DE LA FICHA — día, semana, quincena y mes, calculados una sola vez.
//
// El dueño: *"Desde la ficha Persona → Horas necesito poder consultar: día · semana · quincena ·
// mes"*, y que la pantalla conteste sin Sheets *"¿cuántas horas trabajó esta persona? ¿en qué
// fechas? ¿en qué obras? ¿de qué tipo fueron? ¿cuántas tengo que considerar en la liquidación?"*.
//
// ═══ LA QUINCENA ES LA DE LA EMPRESA, NO «QUINCE DÍAS ATRÁS» ═══
//
// Va del 1 al 15 y del 16 al fin de mes, que es como se paga y como está armado el Sheet de
// JORNALES. Una ventana móvil de quince días daría un número que no coincide con ninguna
// liquidación y que nadie podría verificar contra nada.
//
// TODO SE CALCULA SOBRE UN DÍA QUE ENTRA POR PARÁMETRO. Sin eso, probar «qué pasa el 16» exigiría
// esperar al 16 o mentirle al reloj del proceso.

export const PERIODOS = ['dia', 'semana', 'quincena', 'mes'] as const
export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_LABEL: Record<Periodo, string> = {
  dia: 'Hoy', semana: 'Semana', quincena: 'Quincena', mes: 'Mes',
}

export interface Ventana { desde: string; hasta: string }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const dia = (hoy: string, n: number) => {
  const d = new Date(`${hoy}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export function esPeriodo(v: unknown): v is Periodo {
  return typeof v === 'string' && (PERIODOS as readonly string[]).includes(v)
}

export function ventanaDe(periodo: Periodo, hoy: string): Ventana {
  const [a, m, d] = hoy.split('-').map(Number)
  if (periodo === 'dia') return { desde: hoy, hasta: hoy }
  if (periodo === 'semana') {
    // Lunes a domingo: la semana laboral acá empieza el lunes, igual que `fecha_inicio_semana`.
    const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay()
    const alLunes = dow === 0 ? -6 : 1 - dow
    return { desde: dia(hoy, alLunes), hasta: dia(dia(hoy, alLunes), 6) }
  }
  const mm = String(m).padStart(2, '0')
  if (periodo === 'quincena') {
    return d <= 15
      ? { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-15` }
      : { desde: `${a}-${mm}-16`, hasta: iso(new Date(Date.UTC(a, m, 0))) }
  }
  return { desde: `${a}-${mm}-01`, hasta: iso(new Date(Date.UTC(a, m, 0))) }
}

/** Cómo se escribe la ventana en la pantalla: `01/08 a 15/08`. Con las fechas a la vista, porque un
 *  total sin ventana declarada no se puede verificar contra nada. */
export function rotulo(v: Ventana): string {
  const corto = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7)
  return `${corto(v.desde)} a ${corto(v.hasta)}`
}

export function dentro(fecha: string | null, v: Ventana): boolean {
  return fecha != null && fecha >= v.desde && fecha <= v.hasta
}
