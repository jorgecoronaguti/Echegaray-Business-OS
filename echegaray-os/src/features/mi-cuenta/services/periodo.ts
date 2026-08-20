// LOS PERÍODOS DE «MIS HORAS» — este mes, el pasado, los últimos tres, o el que se elija.
//
// ═══ POR QUÉ NO SE REUSA `administracion/services/periodoHH` ═══
//
// Esa función existe y está bien, pero contesta OTRA pregunta: día · semana · quincena · mes, que
// son las ventanas de la LIQUIDACIÓN —la quincena del 1 al 15 y del 16 a fin de mes, como se paga—.
// Acá la pregunta es la del trabajador mirando lo suyo: «¿cuánto llevo este mes?», «¿cuánto fue el
// mes pasado?», «¿cómo vengo en el trimestre?». Una quincena de liquidación no contesta ninguna de
// las tres, y estirar aquella lista con cuatro opciones más le metería a la ficha de Administración
// filtros que ahí no significan nada.
//
// No son dos definiciones del mismo dato: son dos preguntas. El DATO —la hora imputada— sale de la
// misma fuente para las dos (`registros_hh`, vía `mi_hh_dia`), que es lo que la regla exige.
//
// TODO SE CALCULA SOBRE UN DÍA QUE ENTRA POR PARÁMETRO. Sin eso, probar «qué pasa el 1° de enero»
// exigiría esperar al 1° de enero o mentirle al reloj del proceso.

export const PERIODOS = ['mes', 'mes-pasado', 'trimestre', 'elegir'] as const
export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_LABEL: Record<Periodo, string> = {
  mes: 'Este mes',
  'mes-pasado': 'Mes pasado',
  trimestre: 'Últimos 3 meses',
  elegir: 'Elegir período',
}

export interface Ventana {
  desde: string
  hasta: string
}

export function esPeriodo(v: unknown): v is Periodo {
  return typeof v === 'string' && (PERIODOS as readonly string[]).includes(v)
}

/** El último día del mes `m` (1-12) del año `a`, en ISO. `Date.UTC(a, m, 0)` es el día 0 del mes
 *  siguiente, o sea el último del pedido — y resuelve febrero bisiesto sin una tabla de días. */
function finDeMes(a: number, m: number): string {
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/** `2026-08` → `{ a: 2026, m: 8 }`, corriendo `n` meses hacia atrás si se pide. */
function mesDe(hoy: string, atras = 0): { a: number; m: number } {
  const a = Number(hoy.slice(0, 4))
  const m = Number(hoy.slice(5, 7))
  const total = a * 12 + (m - 1) - atras
  return { a: Math.floor(total / 12), m: (total % 12) + 1 }
}

const mm = (m: number) => String(m).padStart(2, '0')

/**
 * La ventana del período, ambas puntas inclusive.
 *
 * ═══ «ESTE MES» TERMINA HOY, NO A FIN DE MES ═══
 *
 * Un total del mes en curso con la ventana abierta hasta el 31 se lee como el total del mes
 * completo, y no lo es: es lo que va hasta hoy. La pantalla escribe la ventana al lado del número
 * justamente para que nadie tenga que adivinar cuál de las dos cosas está mirando.
 */
export function ventanaDe(periodo: Periodo, hoy: string, elegida?: Partial<Ventana>): Ventana {
  if (periodo === 'mes-pasado') {
    const { a, m } = mesDe(hoy, 1)
    return { desde: `${a}-${mm(m)}-01`, hasta: finDeMes(a, m) }
  }
  if (periodo === 'trimestre') {
    // Los últimos TRES meses calendario incluido el corriente: 01/06 → hoy, parado en agosto. No es
    // una ventana móvil de 90 días — nadie compara su trabajo contra «hace noventa días».
    const { a, m } = mesDe(hoy, 2)
    return { desde: `${a}-${mm(m)}-01`, hasta: hoy }
  }
  if (periodo === 'elegir') {
    // Lo elegido MANDA, y lo que falte cae al mes en curso: media ventana es peor que ninguna,
    // porque produce un total que parece de un período y es de otro.
    const base = ventanaDe('mes', hoy)
    const desde = elegida?.desde || base.desde
    const hasta = elegida?.hasta || base.hasta
    // Al revés no se corrige en silencio: se da vuelta, que es lo que la persona quiso decir.
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde }
  }
  const { a, m } = mesDe(hoy)
  return { desde: `${a}-${mm(m)}-01`, hasta: hoy }
}

/** `01/08/2025 – 20/08/2025`. La ventana SIEMPRE se escribe al lado del total: un número sin su
 *  período declarado no se puede verificar contra nada. */
export function rotulo(v: Ventana): string {
  const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
  return `${dmy(v.desde)} – ${dmy(v.hasta)}`
}
