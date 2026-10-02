// EL RECIBO POR LA DIFERENCIA DE EFECTIVO — lo puro (dueño, 02/10/2026).
//
// A once personas se les pagó de menos el efectivo de la 2ª quincena de septiembre; el dueño les paga ahora la
// diferencia y quiere *«hacerles firmar que se les cubre lo que no se pagó en efectivo en los casos puntuales»*.
// El papel es el «Recibo de pago en efectivo» de Efectivo (serie RP, `recibo_pago_efectivo`), asignado a la
// persona: *«sí, va a servir eso pero se lo quiero asignar a empleados»*.
//
// ═══ EL IMPORTE NO SE CALCULA ACÁ ═══
// Es la «resta» del renglón Efectivo del recibo de la quincena (`armarRecibo` con lo ya pagado): el mismo número
// que sale en el papel de la quincena, ya redondeado como lo entrega el dueño. Otra cuenta podría decir 55.000 en
// un papel y 54.870 en el otro, y la persona firmaría dos cifras por la misma deuda.
//
// No anota el pago: el dueño suma el importe al «Pagado» a mano. Esto sólo arma lo que el formulario precarga.

import { armarRecibo, type EleccionDelRecibo } from './reciboDeLaQuincena.ts'
import { cabeceraQuincena, type Quincena } from './quincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides'
import type { BorradorReciboPago } from '../../efectivo/logica/reciboPago.ts'

/** Sólo el efectivo, con lo ya pagado: así el papel trae el renglón «resta» del efectivo y ningún otro. */
const SOLO_EFECTIVO: EleccionDelRecibo = {
  horas: false, horasRecibo: false, horasFuera: false, valorHora: false, banco: false, efectivo: true, pagado: true,
}

/**
 * LO QUE RESTA PAGAR EN EFECTIVO, como lo dice el recibo de la quincena. `null` = no queda nada por pagar o el
 * papel no lo puede afirmar (sin lo ya pagado, quincena cerrada sin modelo, 1ª quincena del mensual): ahí no se
 * ofrece el recibo por la diferencia, porque no hay una cifra de la que se pueda decir «esto es lo que faltaba».
 */
export function restaDeEfectivo(l: LineaConOverrides, mensual: boolean): number | null {
  const medios = armarRecibo(l, SOLO_EFECTIVO, String, mensual).medios
  const i = medios.findIndex((m) => !m.sub && m.rotulo === 'Efectivo')
  if (i < 0) return null
  // La resta es la del efectivo: el primer «resta» colgado de ese renglón, antes del próximo medio.
  for (let j = i + 1; j < medios.length && medios[j].sub; j++) {
    if (medios[j].rotulo !== 'resta') continue
    const v = medios[j].importe
    return v != null && v > 0 ? v : null
  }
  return null
}

/** Lo que el lote necesita de cada fila del cuadro. `mensual` lo decide `tipoDeLiquidacion`, como en el panel. */
export interface FilaParaLaDiferencia { personaId: string; nombre: string; linea: LineaConOverrides; mensual: boolean }

export interface LoteDeDiferencias {
  /** Los tildados con efectivo por pagar, en el orden del cuadro: a cada uno se le emite un recibo. */
  con: { personaId: string; nombre: string; resta: number }[]
  /** Los tildados sin diferencia: se listan y no se les emite nada. */
  sin: { personaId: string; nombre: string }[]
}

/**
 * «RECIBOS POR LA DIFERENCIA» EN LOTE (dueño, 02/10/2026: «no voy a ir haciendo 11 recibos»). De los tildados, a
 * quién le queda efectivo por pagar según su recibo de la quincena. El resto se dice, no se descarta en silencio:
 * quien tildó a Castillo tiene que ver que a Castillo no se le emite nada, y por qué.
 */
export function loteDeDiferencias(filas: readonly FilaParaLaDiferencia[], marcados: ReadonlySet<string>): LoteDeDiferencias {
  const lote: LoteDeDiferencias = { con: [], sin: [] }
  for (const f of filas) {
    if (!marcados.has(f.personaId)) continue
    const resta = restaDeEfectivo(f.linea, f.mensual)
    if (resta == null) lote.sin.push({ personaId: f.personaId, nombre: f.nombre })
    else lote.con.push({ personaId: f.personaId, nombre: f.nombre, resta })
  }
  return lote
}

/** El importe como se tipea en el formulario (55.000): lo lee `validarReciboPago` igual que si lo escribiera alguien. */
export const importeParaEscribir = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** «Diferencia de pago en efectivo de la 2ª quincena de septiembre de 2026. Con este importe …» — texto del dueño. */
export function conceptoDeLaDiferencia(q: Quincena): string {
  return `Diferencia de pago en efectivo de la ${cabeceraQuincena(q)} de ${q.desde.slice(0, 4)}. `
    + 'Con este importe queda cubierto lo que no se había pagado en efectivo de esa quincena.'
}

/**
 * LO QUE EL FORMULARIO TRAE ESCRITO. El importe va como se tipea acá (55.000) para que `validarReciboPago` lo lea
 * igual que si lo hubiera escrito una persona; a nombre de y documento son los del legajo.
 */
export function borradorDeLaDiferencia(
  d: { importe: number; quincena: Quincena; hoy: string; aNombreDe: string; documento: string | null },
): BorradorReciboPago {
  return {
    aNombreDe: d.aNombreDe,
    documento: d.documento ?? '',
    importe: importeParaEscribir(d.importe),
    fecha: d.hoy,
    concepto: conceptoDeLaDiferencia(d.quincena),
    obra: '',
  }
}
