// LO QUE EL CUADRO DE LA QUINCENA AGREGA AL ESPEJO: horas por tipo, el cierre de cada fila y del pie,
// el historial del valor hora y qué forma de tarifa se escribe en la celda. Puro: sin base, sin JSX.
//
// Dueño, 14/09/2026: *«no sé cuánto es el total que cobra cada persona»*, *«no puedo calcular nada
// de ahí que me sirva»*, *«no me permite editar el valor hora de manera fácil»*.
//
// ═══ LAS HORAS PAGAS NO SE DECIDEN ACÁ ═══
//
// `horasLiquidablesDelDia` (con el coeficiente de la planilla y sin la jornada automática) es la única
// definición. Acá se SEPARAN las cantidades para leerlas: normales, extras al 50 y al 100, y la jornada
// automática que nadie confirmó, que se ve pero no se paga.

import { pisoVigente, type FilaEscala, type PisoDeConvenio } from './exposicionConvenio.ts'
import { modalidadDe, type GrupoLiquidacion, type TarifaVigente } from './liquidacionQuincena.ts'
import { esJornadaAutomatica, type RegistroLiquidable } from './liquidacionDeAusencias.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

export interface HorasPorTipo {
  normales: number
  extra50: number
  extra100: number
  /** normales + extra50 + extra100: CANTIDADES trabajadas, sin coeficiente. Lo pagado es `linea.horas`. */
  total: number
  /** Jornada `web:presencia-defecto` que nadie confirmó. Se muestra aparte y NO se paga. */
  automaticas: number
}

export const SIN_HORAS: HorasPorTipo = { normales: 0, extra50: 0, extra100: 0, total: 0, automaticas: 0 }

/**
 * LAS CANTIDADES DE UNA PERSONA, POR TIPO.
 *
 * `ausencia` y `licencia` no son horas trabajadas: se ven como A y L en su día. Un `tipo_hora`
 * desconocido tampoco suma. La jornada automática va a su propio cajón: sumarla a «normales» era
 * exactamente el defecto de Rosales (70 h en vez de 62).
 */
export function horasPorTipo(registros: readonly RegistroLiquidable[]): HorasPorTipo {
  let normales = 0, extra50 = 0, extra100 = 0, automaticas = 0
  for (const r of registros) {
    const h = Number(r.horas)
    if (!Number.isFinite(h)) continue
    if (esJornadaAutomatica(r)) { automaticas += h; continue }
    if (r.tipo_hora === 'normal') normales += h
    else if (r.tipo_hora === 'extra_50') extra50 += h
    else if (r.tipo_hora === 'extra_100') extra100 += h
  }
  return {
    normales: r2(normales), extra50: r2(extra50), extra100: r2(extra100),
    total: r2(normales + extra50 + extra100), automaticas: r2(automaticas),
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
    t.automaticas += f.horasPorTipo.automaticas
  }
  return {
    normales: r2(t.normales), extra50: r2(t.extra50), extra100: r2(t.extra100),
    total: r2(t.total), automaticas: r2(t.automaticas),
  }
}

/** Las seis cifras de la cadena que el cierre mira. */
export interface CadenaParaCerrar {
  cobra: number | null
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number | null
  total: number | null
}

export interface Cierre {
  /** `total` sale de gana − adelanto − ya transferido Y es banco + efectivo. */
  cierra: boolean
  /** Lo que la persona todavía tiene que recibir en esta quincena: el TOTAL publicado. */
  leFaltaPagar: number
  /** Cuánto se aparta el TOTAL publicado de la cuenta. 0 cuando cierra. */
  diferencia: number
}

/**
 * ¿LA FILA CIERRA? La semántica del dueño (01/09/2026), escrita una sola vez:
 *
 *   GANA − ADELANTO − YA TRANSFERIDO  =  LE FALTA PAGAR  =  POR BANCO + EFECTIVO
 *
 * No recalcula la cadena: la COMPRUEBA. Si alguien escribió un total a mano o la planilla trajo un
 * efectivo que no cuadra, la fila se marca y dice por cuánto; esconderlo sería publicar un total que
 * no se puede explicar frente al sobre. Un peso de tolerancia: los centavos redondeados no son una
 * diferencia. Sin COBRA no hay cierre que afirmar.
 */
export function cierreDeLaFila(c: CadenaParaCerrar): Cierre | null {
  if (c.cobra == null || c.total == null) return null
  const esperado = r2(c.cobra - c.adelanto - c.yaTransferido)
  const repartido = r2(c.porBanco + (c.enEfectivo ?? 0))
  const diferencia = r2(c.total - esperado)
  const cierra = Math.abs(diferencia) <= 1 && Math.abs(r2(c.total - repartido)) <= 1
  return { cierra, leFaltaPagar: r2(c.total), diferencia: cierra ? 0 : (Math.abs(diferencia) > 1 ? diferencia : r2(c.total - repartido)) }
}

/** El mismo cierre sobre los totales del pie. */
export const cierreDeTotales = (t: CadenaParaCerrar & { cobra: number; total: number }): Cierre | null =>
  cierreDeLaFila(t)

/**
 * EL % DE AUMENTO CONTRA EL VALOR ANTERIOR. Un decimal.
 *
 * `null` cuando no hay contra qué medir: sin anterior, o con un anterior de cero o negativo. Nunca 0:
 * «no subió» y «no se puede medir» son dos afirmaciones distintas.
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
 * el básico»—, a la fecha `desde` de cada fila.
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
 * La forma la impone el CUADRO (`modalidadDe`): obreros por hora, oficina neto mensual. Las
 * liquidaciones finales salen del recibo y la celda queda de sólo lectura.
 */
export function formaEditable(grupo: GrupoLiquidacion): FormaDeTarifa | null {
  const m = modalidadDe(grupo)
  return m === 'hora' || m === 'mensual' ? m : null
}
