// LO QUE EL CUADRO DE LA QUINCENA AGREGA AL ESPEJO: horas por tipo, el historial del valor hora y
// qué forma de tarifa se puede escribir en la celda. Puro: sin base, sin JSX.
//
// Dueño, 14/09/2026, sobre la v1: *«demasiado resumido, no puedo modificar el valor hora, no tengo
// referencias de valores hs históricos de cada uno, deja afuera detalles relevantes»*. Eligió:
// «Horas normales y extras aparte», «$/h en la celda + historial al lado».
//
// ═══ LAS EXTRAS SE MUESTRAN APARTE, PERO NO SE PAGAN APARTE — Y ESO NO SE DECIDE ACÁ ═══
//
// `liquidarLinea` hoy multiplica TODAS las horas liquidables por el mismo $/h: una extra al 50% no
// lleva recargo en COBRA. Esta vista separa las columnas porque el dueño las quiere leer, no porque
// cambie la cuenta. Si las extras tienen que pagar recargo es una decisión laboral con plata atrás
// y va en `liquidacionQuincena.ts`, no en una pantalla: una vista que las valorizara distinto sería
// una segunda definición de COBRA.
//
// ═══ «TOTAL HS» ES LO TRABAJADO; LO QUE COBRA PUEDE SER OTRO NÚMERO ═══
//
// Las tres columnas suman lo que se TRABAJÓ (normal + extras) en la ventana, domingos incluidos,
// porque la fila dibuja esos días. Las horas que liquidan (`linea.horas`) sacan el domingo y suman
// las licencias pagas. Cuando las dos no coinciden, la celda lo marca y dice las dos cifras: igualar
// una a la otra escondería una licencia o un domingo, que es justo el detalle que se pidió no perder.

import { pisoVigente, type FilaEscala, type PisoDeConvenio } from './exposicionConvenio.ts'
import { modalidadDe, type GrupoLiquidacion, type TarifaVigente } from './liquidacionQuincena.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

export interface HorasPorTipo {
  normales: number
  extra50: number
  extra100: number
  /** normales + extra50 + extra100. Lo trabajado, no lo liquidado. */
  total: number
}

export const SIN_HORAS: HorasPorTipo = { normales: 0, extra50: 0, extra100: 0, total: 0 }

/**
 * LAS HORAS TRABAJADAS DE UNA PERSONA, POR TIPO.
 *
 * `ausencia` y `licencia` no son horas trabajadas y no entran en ninguna de las tres: se ven como A
 * y L en su día. Un `tipo_hora` desconocido tampoco suma — meterlo en «normales» inventaría una
 * clasificación que nadie cargó.
 */
export function horasPorTipo(
  registros: readonly { tipo_hora: string | null; horas: number | string | null }[],
): HorasPorTipo {
  let normales = 0, extra50 = 0, extra100 = 0
  for (const r of registros) {
    const h = Number(r.horas)
    if (!Number.isFinite(h)) continue
    if (r.tipo_hora === 'normal') normales += h
    else if (r.tipo_hora === 'extra_50') extra50 += h
    else if (r.tipo_hora === 'extra_100') extra100 += h
  }
  return {
    normales: r2(normales), extra50: r2(extra50), extra100: r2(extra100),
    total: r2(normales + extra50 + extra100),
  }
}

/** Suma de las filas VISIBLES: el pie recorta igual que el filtro y el buscador. */
export function sumarHorasPorTipo(filas: readonly { horasPorTipo: HorasPorTipo }[]): HorasPorTipo {
  const t = { ...SIN_HORAS }
  for (const f of filas) {
    t.normales += f.horasPorTipo.normales
    t.extra50 += f.horasPorTipo.extra50
    t.extra100 += f.horasPorTipo.extra100
    t.total += f.horasPorTipo.total
  }
  return { normales: r2(t.normales), extra50: r2(t.extra50), extra100: r2(t.extra100), total: r2(t.total) }
}

/**
 * EL % DE AUMENTO CONTRA EL VALOR ANTERIOR. Un decimal.
 *
 * `null` cuando no hay contra qué medir: sin anterior, o con un anterior de cero o negativo (una
 * división así no es un aumento, es un dato roto). Nunca 0: «no subió» y «no se puede medir» son
 * dos afirmaciones distintas.
 */
export function pctDeAumento(anterior: number | null, actual: number | null): number | null {
  if (anterior == null || actual == null) return null
  if (!(anterior > 0) || !Number.isFinite(actual)) return null
  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

export type FormaDeTarifa = 'hora' | 'mensual'

export interface EntradaDeHistorial {
  desde: string
  forma: FormaDeTarifa
  valor: number
  origen: string
  /** Contra la fila anterior DE LA MISMA FORMA. Un paso de $/h a neto mensual no es un aumento. */
  pctAumento: number | null
  /** El básico de su categoría a esa fecha. Sólo para $/h; `null` = sin escala cargada. */
  basico: PisoDeConvenio | null
  /** La fila que rige la quincena mirada. */
  vigente: boolean
}

/**
 * EL HISTORIAL DEL VALOR HORA DE UNA PERSONA, DEL MÁS NUEVO AL MÁS VIEJO.
 *
 * El básico se busca con `pisoVigente` —la misma función de la solapa Convenios y de la marca «bajo
 * el básico»—, a la fecha `desde` de cada fila: un aumento de marzo se compara contra la escala de
 * marzo, no contra la de hoy.
 */
export function historialDeTarifa(
  tarifas: readonly TarifaVigente[],
  persona: { convenio: string | null; categoria: string | null },
  escalas: readonly FilaEscala[],
  fechaDeLaQuincena: string,
): EntradaDeHistorial[] {
  const validas = tarifas
    .filter((t) => (t.valorHora ?? t.netoMensual) != null)
    .slice()
    .sort((a, b) => a.desde.localeCompare(b.desde))
  const vigente = validas.filter((t) => t.desde <= fechaDeLaQuincena).at(-1)
  const salida: EntradaDeHistorial[] = []
  const ultimaDe: Partial<Record<FormaDeTarifa, number>> = {}
  for (const t of validas) {
    const forma: FormaDeTarifa = t.valorHora != null ? 'hora' : 'mensual'
    const valor = (t.valorHora ?? t.netoMensual) as number
    salida.push({
      desde: t.desde,
      forma,
      valor,
      origen: t.origen,
      pctAumento: pctDeAumento(ultimaDe[forma] ?? null, valor),
      basico: forma === 'hora' ? pisoVigente(escalas, persona.convenio, persona.categoria, t.desde) : null,
      vigente: t === vigente,
    })
    ultimaDe[forma] = valor
  }
  return salida.reverse()
}

/**
 * QUÉ TARIFA SE ESCRIBE EN LA CELDA DE ESTA FILA, o `null` si no se escribe ninguna.
 *
 * La forma la impone el CUADRO (`modalidadDe`), igual que en la liquidación: obreros por hora,
 * oficina neto mensual. Las liquidaciones finales no salen de una tarifa —salen del recibo— y la
 * celda queda de sólo lectura. La acción del servidor vuelve a comprobar todo esto.
 */
export function formaEditable(grupo: GrupoLiquidacion): FormaDeTarifa | null {
  const m = modalidadDe(grupo)
  return m === 'hora' || m === 'mensual' ? m : null
}
