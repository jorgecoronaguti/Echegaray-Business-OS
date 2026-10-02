// ═══ LO QUE UN RECIBO DEJÓ SIN PAGAR POR BANCO (dueño, 30/09/2026) ═══
//
// *«quiero que pongas lo que resta pagarle por recibo según las transferencias de la quincena pagada, como parte de lo
// que se debería pagar por banco en esta quincena, sumándose a lo que se calcula hoy»*. La Q1-09 salió con
// transferencias de $200.000 contra recibos de $216.558,72 y $254.580,48; la diferencia se entregó en mano. Para el
// estudio el neto tiene que salir por banco, así que la quincena siguiente la reclasifica: banco += resta, efectivo −=
// resta, total igual. No es plata nueva: el total que cobra la persona no se mueve.
//
// Vive fuera de `aplicarOverrides` a propósito: no es una celda escrita ni una fuente de la cadena, es un traslado
// entre canales que se aplica sobre la línea ya resuelta (manual > JORNALES > calculado queda intacto). La quincena
// cerrada no lo vuelve a aplicar: su banco sellado ya lo trae.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'
import { arrastreYaIncluido } from './recibosDelEstudio.ts'
import { todoEnEfectivo } from './sueldoBlancoNegro.ts'

/** Una fila de `liquidacion_arrastre`. */
export interface ArrastreDeLinea {
  importe: number
  motivo: string
  periodoOrigen: string
}

/** Del lado de la quincena de origen: cuánto de su recibo se pagará por banco en otra, y en cuál. */
export interface ArrastreSaliente {
  importe: number
  desde: string
  motivo: string
}

/**
 * El arrastre ya trasladado: se sumó al banco y se restó del efectivo. SIEMPRE se aplica (dueño, 30/09/2026: *«es un
 * arreglo con la persona»*): la plata ya se le entregó en mano en la quincena de origen, así que esta quincena la
 * paga por banco y la descuenta del efectivo, aunque el efectivo pendiente no la cubra. No hay estado «no alcanza».
 */
export interface ArrastreAplicado extends ArrastreDeLinea {
  estado: 'aplicado'
  /** El efectivo que le quedaba por cobrar antes del traslado, para explicarlo. `null` sin negro. */
  efectivoDisponible: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** El efectivo que todavía se le debe en mano: el negro de la fila menos lo ya entregado. `null` sin negro. */
function efectivoDisponible(l: LineaConOverrides): number | null {
  return l.pago.negro == null ? null : r2(l.pago.negro - l.pago.pagadoEfectivo)
}

/** La línea con el arrastre trasladado del efectivo al banco. Sin arrastre, la misma línea. */
export function conArrastre(l: LineaConOverrides, a: ArrastreDeLinea | null | undefined): LineaConOverrides {
  if (!a || !(a.importe > 0)) return l
  // CON BANCO 0 A MANO NO HAY BANCO AL QUE PASARLA: la resta se queda en el efectivo, que ya la incluye (02/10/2026).
  if (todoEnEfectivo(l)) return l
  const importe = r2(a.importe)
  const disponible = efectivoDisponible(l)
  const porBanco = r2(l.porBanco + importe)
  const enEfectivo = l.enEfectivo == null ? null : r2(l.enEfectivo - importe)
  return {
    ...l,
    porBanco,
    enEfectivo,
    // EL TOTAL NO SE TOCA: es la misma plata por otro canal. Se rehace sólo el reparto del saldo.
    pago: pagoDeLaLinea({
      banco: l.pago.banco == null ? null : r2(l.pago.banco + importe),
      negro: l.pago.negro == null ? null : r2(l.pago.negro - importe),
      pagadoBanco: l.pago.pagadoBanco,
      pagadoEfectivo: l.pago.pagadoEfectivo,
    }),
    arrastre: { ...a, importe, estado: 'aplicado', efectivoDisponible: disponible },
  }
}

/** Lo que la quincena recibe (`entrantes`, por `desde`) y lo que manda a otra (`salientes`, por período de origen). */
export interface ArrastresDeLaQuincena {
  entrantes: ReadonlyMap<string, ArrastreDeLinea>
  salientes: ReadonlyMap<string, ArrastreSaliente>
  error: { code?: string; message: string } | null
}

// LA FILA SE VALIDA AL ENTRAR: `numeric` llega como texto por PostgREST y un importe que no parsea no puede volverse 0.
const Fila = z.object({
  persona_id: z.string(), desde: z.string(), importe: z.coerce.number().finite().positive(),
  motivo: z.string().min(1), periodo_origen: z.string(),
})

/** Una sola lectura para las dos caras. Sin la migración aplicada, el error viaja y el llamador lo calla (`sinTabla`). */
export async function leerArrastres(supabase: SupabaseClient, desde: string, periodo: string): Promise<ArrastresDeLaQuincena> {
  const entrantes = new Map<string, ArrastreDeLinea>()
  const salientes = new Map<string, ArrastreSaliente>()
  const { data, error } = await supabase.from('liquidacion_arrastre')
    .select('persona_id, desde, importe, motivo, periodo_origen')
    .or(`desde.eq.${desde},periodo_origen.eq.${periodo}`)
  if (error) return { entrantes, salientes, error }
  let invalidas = 0
  for (const crudo of data ?? []) {
    const f = Fila.safeParse(crudo)
    // UNA FILA QUE NO SE ENTIENDE SE DICE: callarla dejaría el banco sin la resta y nadie sabría por qué.
    if (!f.success) { invalidas++; continue }
    const r = f.data
    // UNA POR PERSONA Y LADO: la unicidad (persona, desde, período) la garantiza la base; dos orígenes distintos que
    // caigan en la misma quincena se suman, porque los dos salen por el mismo banco.
    if (r.desde === desde) {
      const prev = entrantes.get(r.persona_id)
      entrantes.set(r.persona_id, prev
        ? { importe: r2(prev.importe + r.importe), motivo: `${prev.motivo} + ${r.motivo}`, periodoOrigen: `${prev.periodoOrigen}, ${r.periodo_origen}` }
        : { importe: r2(r.importe), motivo: r.motivo, periodoOrigen: r.periodo_origen })
    }
    if (r.periodo_origen === periodo) salientes.set(r.persona_id, { importe: r2(r.importe), desde: r.desde, motivo: r.motivo })
  }
  return { entrantes, salientes, error: invalidas ? { message: `${invalidas} fila(s) de arrastre ilegibles` } : null }
}

/**
 * Las dos caras sobre la línea de la pantalla. `abierta`: sólo la quincena abierta traslada lo entrante — la cerrada ya
 * selló su banco con el arrastre adentro y aplicarlo otra vez lo contaría dos veces. Lo saliente es un dato y viaja
 * siempre.
 */
export function conArrastres(l: LineaConOverrides, a: ArrastresDeLaQuincena, abierta: boolean): LineaConOverrides {
  const entrante = a.entrantes.get(l.personaId)
  // EL MENSUAL NO ARRASTRA SU PROPIO RECIBO (02/10/2026): su banco ya es la suma de los dos recibos del mes; la «resta
  // del recibo Q1» sería ese mismo neto una segunda vez.
  const incluidos = l.modalidad === 'mensual' ? [...(l.recibosDelEstudio ?? []).map((r) => r.periodo), ...(l.recibosFaltantes ?? [])] : []
  const entranteReal = entrante && arrastreYaIncluido(entrante.periodoOrigen, incluidos) ? undefined : entrante
  // La cerrada no suma: su banco sellado ya lo trae. Pero el recibo tiene que poder decir cuánto de ese banco es resta.
  const conEntrante = abierta ? conArrastre(l, entranteReal) : entranteReal && entranteReal.importe > 0 ? { ...l, arrastreIncluido: entranteReal } : l
  const saliente = a.salientes.get(l.personaId) ?? null
  return saliente ? { ...conEntrante, arrastradoA: saliente } : conEntrante
}

/** La parte del banco de la línea que es resta de otro recibo. 0 sin arrastre. */
export const arrastreAplicado = (l: Pick<LineaConOverrides, 'arrastre'>): number =>
  l.arrastre?.estado === 'aplicado' ? l.arrastre.importe : 0

/**
 * LA LÍNEA CON EL BANCO DEL RECIBO, SIN LA RESTA: lo que la celda «Neto» muestra y escribe. Si el Escribible tomara el
 * banco con la resta, guardarlo lo volvería `por_banco_manual` y la resta se sumaría dos veces.
 */
export function conNetoDelRecibo<T extends { linea: LineaConOverrides }>(fila: T): T {
  const arr = arrastreAplicado(fila.linea)
  return arr ? { ...fila, linea: { ...fila.linea, porBanco: r2(fila.linea.porBanco - arr) } } : fila
}

type Pesos = (n: number | null) => string

/**
 * LA CELDA BANCO SUMA ADENTRO Y DA EL RESULTADO (dueño, 30/09/2026: *«te lo pedí que sume dentro de la celda, pero
 * sumando y que dé el resultado, no como número directamente»*). Como una celda de planilla: los operandos —el neto
 * del recibo y la resta arrastrada— se ven, y el número principal es la suma. `null` sin resta aplicada: la celda es
 * el neto solo.
 */
export function sumaDelBanco(l: Pick<LineaConOverrides, 'arrastre' | 'porBanco'>, pesos: Pesos): {
  neto: number; resta: number; resultado: number
  /** «234.963,32 + 54.580,48»: sin signo, para que entre en la celda. */
  operandos: string
  /** «= $289.543,80». */
  resultado_texto: string
} | null {
  const resta = arrastreAplicado(l)
  if (!resta) return null
  const resultado = r2(l.porBanco)
  const neto = r2(resultado - resta)
  const sinSigno = (n: number) => pesos(n).replace(/^\$\s?/, '')
  return { neto, resta, resultado, operandos: `${sinSigno(neto)} + ${sinSigno(resta)}`, resultado_texto: `= ${pesos(resultado)}` }
}

/** La explicación en una línea, para el `title` de la marca. `null` sin nada que decir. */
export function textoDelArrastre(l: Pick<LineaConOverrides, 'arrastre' | 'arrastradoA' | 'porBanco'>, pesos: Pesos): string | null {
  const a = l.arrastre
  if (a?.estado === 'aplicado') {
    return `${a.motivo}: ${pesos(a.importe)} del recibo ${a.periodoOrigen} que no salió por banco. Se paga por banco en esta quincena (banco ${pesos(l.porBanco)}) y sale del efectivo: el total no cambia.`
  }
  if (l.arrastradoA) return `Resta del recibo (${pesos(l.arrastradoA.importe)}) que se paga por banco en la quincena del ${l.arrastradoA.desde}.`
  return null
}
