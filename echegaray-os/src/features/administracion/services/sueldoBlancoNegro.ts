// EL SUELDO DE UN OBRERO: BLANCO (EL RECIBO) + NEGRO (LAS HORAS QUE EL RECIBO NO PAGA).
//
// Dueño, 14/09/2026: *«revisar en cada caso el valor hs segun categoria q aparece en recibo de sueldo,
// esa es la parte en blanco y es una parte del sueldo. la otra es otro valor hora q se viene dando por
// sheet jornales … q cubre el otro 50 en negro del salario»*. Decisiones que tomó al preguntarle:
//
//   NEGRO = horas que faltan × $/h negro. El negro paga SÓLO las horas que no están en el recibo.
//   TOTAL = neto del recibo + negro.
//   SIN RECIBO todavía: blanco = la MITAD de las horas × $/h de su categoría, marcado «estimado».
//
// ═══ EL NETO ESTIMADO SALE DE UNA MEDIANA, NO DE UN RECIBO ═══
//
// Los descuentos de un recibo dependen de la persona; una alícuota escrita acá sería un número que nadie
// firmó. La primera versión usaba el cociente neto/bruto del ÚLTIMO recibo, y a Zogbe le daba un neto de
// $28.860: su Q2-08 trae $276.751 de descuentos (embargo o adelanto). Un recibo anómalo no puede decidir
// la quincena siguiente. Regla (coordinador, 14/09/2026):
//
//   · la MEDIANA de neto/bruto de hasta sus últimos 6 recibos quincenales del año (sin FINAL, bruto > 0);
//   · con menos de 2, o con la mediana fuera de [0,60 ; 0,90], la MEDIANA DEL PLANTEL: los recibos
//     quincenales del año cuyo cociente cae dentro de ese rango;
//   · sin nada de eso, el neto queda `null` y la pantalla dice «sin neto».
//
// ═══ SIN LÍNEA DE RECIBO PERO CON `nomina_recibo_neto` ═══
//
// Ese neto es real pero no trae horas ni bruto: las horas del blanco se estiman igual (mitad) y el estado
// es 'estimado' con `origenNeto: 'nomina'`.
//
// Puro: sin base, sin React. Lo usa `aplicarOverrides`, y se prueba en `sueldoBlancoNegro.test.ts`.

import { mismoCuil } from './cuil.ts'
import { compararConElPiso, type ComparacionConElPiso } from './exposicionConvenio.ts'

/** Una línea de `recibo_sueldo_linea`, normalizada. `null` = el recibo no lo dice. */
export interface ReciboDeSueldo {
  personaId: string | null
  cuil: string | null
  /** `Q2-08/2026`, el formato de `nomina_recibo_neto` y de `periodoDeRecibo`. Finales: `FINAL-08/2026`. */
  periodo: string
  categoria: string | null
  valorHora: number | null
  horasBlanco: number | null
  bruto: number | null
  neto: number | null
  driveFileId: string | null
}

/** De dónde sale el cociente neto/bruto del neto estimado. */
export interface ProporcionDelNeto {
  cociente: number
  origen: 'persona' | 'plantel'
  /** Cuántos recibos entraron a la mediana. */
  recibos: number
}

/** Lo que el blanco necesita saber de una persona, además de sus horas y su $/h negro. */
export interface EntradaDeBlanco {
  /** El recibo de ESTE período. */
  recibo: ReciboDeSueldo | null
  /** El neto de `nomina_recibo_neto` del período, cuando no hay línea de recibo. */
  netoDeNomina: number | null
  /** El piso vigente de su categoría y convenio (`pisoVigente`, vía la exposición al convenio). */
  pisoCategoria: number | null
  /** El cociente neto/bruto para el neto estimado (`proporcionDelNeto`). */
  proporcion: ProporcionDelNeto | null
}

export interface EntradaDeSueldo extends EntradaDeBlanco {
  /** Horas CARGADAS de la quincena (`horasDelDia`): las mismas de «Horas». */
  horas: number | null
  /**
   * Horas EQUIVALENTES, con el coeficiente de extras de JORNALES. El recargo (equivalentes − horas) se
   * paga en el negro: el recibo no lo liquida. Ausente = sin recargo.
   */
  horasEquivalentes?: number | null
  /** `persona_tarifa` vigente: el $/h editable del cuadro. */
  valorHoraNegro: number | null
}

export type EstadoDelBlanco = 'recibo' | 'estimado'

export interface SueldoBlancoNegro {
  estado: EstadoDelBlanco
  horas: number | null
  horasBlanco: number | null
  valorHoraCategoria: number | null
  /** El piso vigente de la categoría. Contra él se compara el $/h del recibo real (`marcaDeCategoria`). */
  pisoCategoria: number | null
  bruto: number | null
  neto: number | null
  /** De dónde salió el neto: el recibo, `nomina_recibo_neto`, o la mediana (`proporcion`). */
  origenNeto: 'recibo' | 'nomina' | 'estimado' | null
  /** Sólo con `origenNeto: 'estimado'`: el cociente usado y de quién. */
  proporcion: ProporcionDelNeto | null
  horasNegro: number | null
  /** Horas de recargo de extras (equivalentes − cargadas) que el negro paga además de `horasNegro`. */
  recargoExtras: number
  valorHoraNegro: number | null
  negro: number | null
  /** neto + negro. `null` si falta cualquiera de los dos. */
  total: number | null
  /** El recibo paga más horas que las cargadas: el negro queda en 0 y la pantalla lo marca en ámbar. */
  reciboExcedeHoras: boolean
  driveFileId: string | null
}

export const COCIENTE_MINIMO = 0.6
export const COCIENTE_MAXIMO = 0.9
export const RECIBOS_DE_LA_MEDIANA = 6

const r2 = (n: number): number => Math.round(n * 100) / 100
const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v)

type Blanco = Pick<SueldoBlancoNegro,
  'estado' | 'horasBlanco' | 'valorHoraCategoria' | 'bruto' | 'neto' | 'origenNeto' | 'proporcion' | 'driveFileId'>

/** El blanco: con recibo, lo que dice el recibo; sin él, la mitad de las horas por el piso. */
function blancoDe(e: EntradaDeSueldo): Blanco {
  const r = e.recibo
  if (r && num(r.horasBlanco) != null) {
    return {
      estado: 'recibo', horasBlanco: r.horasBlanco, valorHoraCategoria: num(r.valorHora),
      bruto: num(r.bruto), neto: num(r.neto), origenNeto: num(r.neto) == null ? null : 'recibo',
      proporcion: null, driveFileId: r.driveFileId,
    }
  }
  const horasBlanco = e.horas == null ? null : r2(e.horas / 2)
  const piso = num(e.pisoCategoria)
  const bruto = horasBlanco == null || piso == null ? null : r2(horasBlanco * piso)
  const base = { estado: 'estimado' as const, horasBlanco, valorHoraCategoria: piso, bruto }
  // Un recibo sin horas todavía trae un neto real: vale lo mismo que el de nómina.
  const netoReal = num(r?.neto) ?? num(e.netoDeNomina)
  if (netoReal != null) {
    return { ...base, neto: netoReal, origenNeto: 'nomina', proporcion: null, driveFileId: r?.driveFileId ?? null }
  }
  const p = e.proporcion
  const neto = bruto == null || p == null ? null : r2(bruto * p.cociente)
  return { ...base, neto, origenNeto: neto == null ? null : 'estimado', proporcion: neto == null ? null : p, driveFileId: null }
}

export function sueldoBlancoNegro(e: EntradaDeSueldo): SueldoBlancoNegro {
  const b = blancoDe(e)
  const horas = num(e.horas)
  const faltan = horas == null || b.horasBlanco == null ? null : r2(horas - b.horasBlanco)
  const horasNegro = faltan == null ? null : Math.max(0, faltan)
  const equivalentes = num(e.horasEquivalentes)
  const recargoExtras = horas == null || equivalentes == null ? 0 : Math.max(0, r2(equivalentes - horas))
  const valorHoraNegro = num(e.valorHoraNegro)
  const negro = horasNegro == null || valorHoraNegro == null ? null : r2((horasNegro + recargoExtras) * valorHoraNegro)
  return {
    ...b,
    horas,
    pisoCategoria: num(e.pisoCategoria),
    horasNegro,
    recargoExtras,
    valorHoraNegro,
    negro,
    total: b.neto == null || negro == null ? null : r2(b.neto + negro),
    reciboExcedeHoras: faltan != null && faltan < 0,
  }
}

/**
 * ¿EL RECIBO REAL PAGA LA CATEGORÍA POR DEBAJO DEL BÁSICO? Sólo con recibo: el estimado usa el piso y
 * nunca marca. El $/h negro NO se compara: el blanco es lo que se paga a categoría (coordinador, 14/09).
 */
export function marcaDeCategoria(s: SueldoBlancoNegro | null): ComparacionConElPiso | null {
  if (!s || s.estado !== 'recibo') return null
  const c = compararConElPiso(s.valorHoraCategoria, s.pisoCategoria)
  return c?.bajoElPiso ? c : null
}

/**
 * EL NEGRO DE UNA FILA, EL QUE SUMA LA COLUMNA Y EL PIE. Así Neto + Negro + Mensuales = Total cierra
 * exacto (QA, 14/09/2026):
 *
 *   mensual              null: no va en las bandas, suma en «Sueldos mensuales».
 *   con blanco + negro   el negro del modelo (horas × $/h negro), salvo cobra o banco escritos a mano.
 *   sin modelo           total − neto: la quincena CERRADA (foto sellada) y las finales. «Negro $0» con
 *                        un total muy por encima del neto no explicaba adónde iba la diferencia.
 */
export function negroDeLaFila(l: {
  netoMensual: number | null; cobra: number | null; porBanco: number; sueldo: SueldoBlancoNegro | null
  manual?: { cobra?: boolean; porBanco?: boolean }
}): number | null {
  if (l.netoMensual != null) return null
  if (l.sueldo && !l.manual?.cobra && !l.manual?.porBanco) return l.sueldo.negro
  return l.cobra == null ? null : r2(l.cobra - l.porBanco)
}

/** `Q2-08/2026` → `2026-08-2`: ordena períodos quincenales como texto. `''` para FINAL u otro formato. */
export function periodoOrdenable(periodo: string): string {
  const m = /^Q([12])-(\d{2})\/(\d{4})$/.exec(periodo.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const esDe = (r: ReciboDeSueldo, personaId: string, cuil: string | null): boolean =>
  // `persona_id` MANDA; el CUIL es respaldo y se compara por dígitos (`cuil.ts`).
  r.personaId === personaId || (r.personaId == null && mismoCuil(r.cuil, cuil))

/** La mediana. `null` sin valores. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2
}

const enRango = (c: number): boolean => c >= COCIENTE_MINIMO && c <= COCIENTE_MAXIMO

/** Recibos quincenales del mismo año, ANTERIORES al período mirado, con bruto > 0 y neto. */
function recibosUtiles(recibos: readonly ReciboDeSueldo[], periodo: string): { r: ReciboDeSueldo; p: string; c: number }[] {
  const actual = periodoOrdenable(periodo)
  const anio = actual.slice(0, 4)
  return recibos.flatMap((r) => {
    const p = periodoOrdenable(r.periodo)
    const bruto = num(r.bruto), neto = num(r.neto)
    if (p === '' || p.slice(0, 4) !== anio || p >= actual || bruto == null || bruto <= 0 || neto == null) return []
    return [{ r, p, c: neto / bruto }]
  })
}

/** EL COCIENTE NETO/BRUTO DEL NETO ESTIMADO: la mediana de la persona, o la del plantel. */
export function proporcionDelNeto(d: {
  personaId: string; cuil: string | null; periodo: string; recibos: readonly ReciboDeSueldo[]
}): ProporcionDelNeto | null {
  const utiles = recibosUtiles(d.recibos, d.periodo)
  const propios = utiles.filter((u) => esDe(u.r, d.personaId, d.cuil))
    .sort((a, b) => (a.p < b.p ? 1 : -1)).slice(0, RECIBOS_DE_LA_MEDIANA)
  const suya = propios.length >= 2 ? mediana(propios.map((u) => u.c)) : null
  if (suya != null && enRango(suya)) return { cociente: suya, origen: 'persona', recibos: propios.length }
  const delPlantel = utiles.map((u) => u.c).filter(enRango)
  const plantel = mediana(delPlantel)
  return plantel == null ? null : { cociente: plantel, origen: 'plantel', recibos: delPlantel.length }
}

/** El `title` del neto estimado: de dónde salió el cociente. */
export function tituloDelNetoEstimado(p: ProporcionDelNeto): string {
  const pct = (p.cociente * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return p.origen === 'persona'
    ? `est. con la mediana de sus ${p.recibos} recibos (${pct} %)`
    : `est. con la mediana del plantel (${pct} %)`
}

/** El recibo quincenal más nuevo de una persona hasta el período mirado (incluido). Convenios lo compara. */
export function ultimoReciboHasta(
  recibos: readonly ReciboDeSueldo[], personaId: string, cuil: string | null, periodo: string,
): ReciboDeSueldo | null {
  const tope = periodoOrdenable(periodo)
  let mejor: ReciboDeSueldo | null = null
  for (const r of recibos) {
    const p = periodoOrdenable(r.periodo)
    if (p === '' || p > tope || !esDe(r, personaId, cuil) || num(r.valorHora) == null) continue
    if (!mejor || p > periodoOrdenable(mejor.periodo)) mejor = r
  }
  return mejor
}

/**
 * LA ENTRADA DEL BLANCO DE UNA PERSONA. El recibo se empareja por persona o, si la línea no la trae,
 * por CUIL (la llave del estudio).
 */
export function entradaDeBlanco(d: {
  personaId: string; cuil: string | null; periodo: string; recibos: readonly ReciboDeSueldo[]
  pisoCategoria: number | null; netoDeNomina: number | null
}): EntradaDeBlanco {
  const actual = periodoOrdenable(d.periodo)
  const recibo = d.recibos.find((r) => esDe(r, d.personaId, d.cuil) && periodoOrdenable(r.periodo) === actual) ?? null
  return {
    recibo, netoDeNomina: d.netoDeNomina, pisoCategoria: d.pisoCategoria,
    proporcion: proporcionDelNeto(d),
  }
}
