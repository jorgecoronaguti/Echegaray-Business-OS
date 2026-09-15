// EL SUELDO DE UN OBRERO: BLANCO (EL RECIBO) + NEGRO (LAS HORAS QUE EL RECIBO NO PAGA).
//
// Dueño, 14/09/2026: *«revisar en cada caso el valor hs segun categoria q aparece en recibo de sueldo,
// esa es la parte en blanco y es una parte del sueldo. la otra es otro valor hora q se viene dando por
// sheet jornales … q cubre el otro 50 en negro del salario»*. Decisiones que tomó al preguntarle:
//
//   NEGRO = horas que faltan × $/h negro. El negro paga SÓLO las horas que no están en el recibo.
//   TOTAL = neto del recibo + negro.
//   SIN RECIBO todavía: blanco estimado, marcado «estimado».
//
// ═══ SIN RECIBO: EL RECIBO ESTIMADO CONCEPTO POR CONCEPTO (dueño, 14/09/2026) ═══
//
// *«si me das a dar un valor preliminar a pagar por banco antes de tener el recibo … liquidacion estimada
// concepto por concepto»*. Con la base del estimado (reglas derivadas de los recibos reales), el blanco sin
// recibo es `estimarRecibo`: horas del recibo por regla (50 en media jornada, no la mitad de lo cargado),
// haberes y descuentos por regla, y SU NETO ES EL BANCO PRELIMINAR de la fila.
// Precedencia del neto: manual > recibo real > nómina > estimado por conceptos > mediana.
//
// ═══ LA MEDIANA QUEDA DE RESPALDO ═══
//
// Sin base, o si un descuento que aplica tiene regla dudosa (el estimado no tiene neto), el neto es bruto ×
// mediana neto/bruto como antes (coordinador, 14/09/2026):
//
//   · la MEDIANA de neto/bruto de hasta sus últimos 6 recibos quincenales del año (sin FINAL, bruto > 0);
//   · con menos de 2, o con la mediana fuera de [0,60 ; 0,90], la MEDIANA DEL PLANTEL;
//   · sin nada de eso, el neto queda `null` y la pantalla dice «sin neto».
//
// Un recibo anómalo no decide la quincena siguiente: a Zogbe el último cociente le daba un neto de $28.860 por
// un embargo. El estimado por conceptos tampoco lo arrastra: el embargo no es una regla del recibo.
//
// Puro: sin base, sin React. Lo usa `aplicarOverrides`, y se prueba en `sueldoBlancoNegro.test.ts`.

import { cuilNormalizado, mismoCuil } from './cuil.ts'
import { compararConElPiso, type ComparacionConElPiso } from './exposicionConvenio.ts'
import { estimarRecibo, type ReciboEstimado } from './reciboEstimado.ts'
import { periodoOrdenable, type ConceptoDeRecibo, type ReciboParaReglas, type ReglasDelRecibo } from './reglasDelRecibo.ts'

export { periodoOrdenable }

/** Una línea de `recibo_sueldo_linea`, normalizada. `null` = el recibo no lo dice. */
export interface ReciboDeSueldo {
  /** Enganche de sus conceptos (`recibo_sueldo_concepto.recibo_id`). */
  id?: string | null
  horasNormales?: number | null
  horasFeriado?: number | null
  descuentos?: number | null
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

/** Lo que el recibo estimado necesita, UNA VEZ por quincena. */
export interface BaseDelEstimado {
  /** La quincena que se estima (`Q1-09/2026`). Las reglas congeladas pueden haberse generado para otra. */
  periodo: string
  reglas: ReglasDelRecibo
  /** Feriados hábiles de la quincena según el calendario. `null` = el calendario no tiene el año cargado. */
  feriados: number | null
  /** Los recibos (con sus conceptos si están cargados); `persona` es el CUIL normalizado. */
  recibos: readonly ReciboParaReglas[]
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
  /** El recibo estimado por conceptos. Ausente o `null`: sin base, el blanco es el de la mediana. */
  estimacion?: { base: BaseDelEstimado; persona: string | null } | null
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
  /**
   * LO ESCRITO A MANO EN EL BLANCO (dueño, 14/09/2026: «dejame editable las h/recibo»). `null` o ausente =
   * sin corrección. Precedencia: manual > recibo real > estimado. `neto` es `por_banco_manual`.
   */
  manual?: { horasRecibo?: number | null; valorHoraRecibo?: number | null; neto?: number | null; negro?: number | null; horasNegro?: number | null }
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
  /** De dónde salió el neto: a mano, el recibo, `nomina_recibo_neto`, el recibo estimado por conceptos, o la mediana. */
  origenNeto: 'manual' | 'recibo' | 'nomina' | 'conceptos' | 'estimado' | null
  /**
   * SE EDITARON LAS HORAS O EL $/H DEL RECIBO Y NO EL NETO, Y EL NETO ES REAL (recibo o nómina): no cambia y la
   * pantalla pone un ⚠ junto al Banco. Un neto estimado se recalcula y esto queda en `false`.
   */
  netoNoRecalculado: boolean
  /** Qué celdas del blanco escribió alguien. */
  editado: { horasRecibo: boolean; valorHoraRecibo: boolean; neto: boolean }
  /** Sólo con `origenNeto: 'estimado'`: el cociente usado y de quién. */
  proporcion: ProporcionDelNeto | null
  /** El recibo estimado por conceptos. Con recibo real también está: el panel compara los dos. */
  reciboEstimado?: ReciboEstimado | null
  /** Los conceptos del recibo real de la quincena, si están cargados. */
  conceptosReales?: readonly ConceptoDeRecibo[] | null
  /** Los totales del recibo real (bruto, descuentos, neto), para compararlos aunque no haya conceptos cargados. */
  totalesReales?: { haberes: number | null; descuentos: number | null; neto: number | null } | null
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
  'estado' | 'horasBlanco' | 'valorHoraCategoria' | 'bruto' | 'neto' | 'origenNeto' | 'proporcion' | 'driveFileId'
  | 'reciboEstimado' | 'conceptosReales' | 'totalesReales'>

/** El recibo estimado de la entrada, con las horas o el $/h escritos a mano si los hay. */
/**
 * EL $/H DEL BLANCO ESTIMADO ES EL DEL ÚLTIMO RECIBO REAL DE LA PERSONA (dueño, 15/09/2026: «por recibo indican otra
 * categoría que la que sale en plataforma… por plataforma considerar la categoría que está ahí y ese debe ser el
 * valor en negro, pero rehacer lo blanco como corresponde»). El estudio liquida por la categoría registrada, que en
 * 6 de 15 obreros no es la de la plataforma (Quiroga Sebastián: of. especializado en la app, AYUDANTE en el recibo).
 * El piso de la categoría de plataforma queda de respaldo sólo para quien no tiene ningún recibo real anterior.
 */
export function valorHoraDelUltimoRecibo(e: EntradaDeSueldo): number | null {
  const est = e.estimacion
  if (!est?.persona) return null
  const tope = periodoOrdenable(est.base.periodo)
  const propios = est.base.recibos
    .filter((r) => r.persona === est.persona && r.valorHora != null && r.valorHora > 0)
    .filter((r) => { const o = periodoOrdenable(r.periodo); return o !== '' && o < tope })
    .sort((a, b) => (periodoOrdenable(a.periodo) < periodoOrdenable(b.periodo) ? 1 : -1))
  return num(propios[0]?.valorHora)
}

function estimadoDe(e: EntradaDeSueldo, horasRecibo: number | null = null, valorHoraRecibo: number | null = null): ReciboEstimado | null {
  const est = e.estimacion
  if (!est) return null
  return estimarRecibo(est.base.reglas, {
    persona: est.persona, periodo: est.base.periodo, valorHora: valorHoraRecibo ?? valorHoraDelUltimoRecibo(e) ?? num(e.pisoCategoria), horasRecibo,
    feriados: est.base.feriados, recibosPropios: est.persona ? est.base.recibos.filter((r) => r.persona === est.persona) : [],
  })
}

function conceptosRealesDe(e: EntradaDeSueldo): readonly ConceptoDeRecibo[] | null {
  const est = e.estimacion
  if (!est?.persona) return null
  const actual = periodoOrdenable(est.base.periodo)
  const r = est.base.recibos.find((x) => x.persona === est.persona && periodoOrdenable(x.periodo) === actual)
  return r && r.conceptos.length ? r.conceptos : null
}

/** El blanco: con recibo, lo que dice el recibo; sin él, el recibo estimado, o la mitad de las horas por el piso. */
function blancoDe(e: EntradaDeSueldo): Blanco {
  const r = e.recibo
  if (r && num(r.horasBlanco) != null) {
    return {
      estado: 'recibo', horasBlanco: r.horasBlanco, valorHoraCategoria: num(r.valorHora),
      bruto: num(r.bruto), neto: num(r.neto), origenNeto: num(r.neto) == null ? null : 'recibo',
      proporcion: null, driveFileId: r.driveFileId, reciboEstimado: estimadoDe(e), conceptosReales: conceptosRealesDe(e),
      totalesReales: { haberes: num(r.bruto), descuentos: num(r.descuentos), neto: num(r.neto) },
    }
  }
  // El $/h del blanco estimado: el de su último recibo real; el piso de plataforma sólo si nunca tuvo recibo.
  const piso = valorHoraDelUltimoRecibo(e) ?? num(e.pisoCategoria)
  const estimado = estimadoDe(e)
  const horasBlanco = estimado ? r2(estimado.horasNormales + estimado.horasFeriado) : e.horas == null ? null : r2(e.horas / 2)
  const bruto = estimado?.remunerativo ?? (horasBlanco == null || piso == null ? null : r2(horasBlanco * piso))
  const base = { estado: 'estimado' as const, horasBlanco, valorHoraCategoria: piso, bruto, reciboEstimado: estimado, conceptosReales: null, totalesReales: null }
  // Un recibo sin horas todavía trae un neto real: vale lo mismo que el de nómina.
  const netoReal = num(r?.neto) ?? num(e.netoDeNomina)
  if (netoReal != null) {
    return { ...base, neto: netoReal, origenNeto: 'nomina', proporcion: null, driveFileId: r?.driveFileId ?? null }
  }
  if (estimado?.neto != null) return { ...base, neto: estimado.neto, origenNeto: 'conceptos', proporcion: null, driveFileId: null }
  const p = e.proporcion
  const neto = bruto == null || p == null ? null : r2(bruto * p.cociente)
  return { ...base, neto, origenNeto: neto == null ? null : 'estimado', proporcion: neto == null ? null : p, driveFileId: null }
}

/** Lo escrito a mano encima del blanco calculado. Un neto REAL no se recalcula con las horas o el $/h editados. */
function conManual(b: Blanco, e: EntradaDeSueldo): Blanco & Pick<SueldoBlancoNegro, 'netoNoRecalculado' | 'editado'> {
  const m = e.manual
  const h = num(m?.horasRecibo), v = num(m?.valorHoraRecibo), n = num(m?.neto)
  const editado = { horasRecibo: h != null, valorHoraRecibo: v != null, neto: n != null }
  if (!editado.horasRecibo && !editado.valorHoraRecibo && !editado.neto) return { ...b, netoNoRecalculado: false, editado }
  const horasBlanco = h ?? b.horasBlanco
  const valorHoraCategoria = v ?? b.valorHoraCategoria
  // EL ESTIMADO POR CONCEPTOS SE REHACE CON LO ESCRITO: las horas mueven el 0401, el 92 ter y todo lo que cuelga
  // del remunerativo. Con recibo real no: el estimado que se compara es el que se habría mostrado.
  const reEstimado = b.estado === 'estimado' && (h != null || v != null) ? estimadoDe(e, h, v) : null
  const reciboEstimado = reEstimado ?? b.reciboEstimado
  const bruto = reEstimado?.remunerativo
    ?? ((h != null || v != null) && horasBlanco != null && valorHoraCategoria != null ? r2(horasBlanco * valorHoraCategoria) : b.bruto)
  const comun = { ...b, horasBlanco, valorHoraCategoria, bruto, reciboEstimado, editado }
  if (n != null) return { ...comun, neto: n, origenNeto: 'manual', proporcion: null, netoNoRecalculado: false }
  if (b.origenNeto === 'conceptos' && reEstimado?.neto != null) return { ...comun, neto: reEstimado.neto, netoNoRecalculado: false }
  // UN NETO ESTIMADO SE VUELVE A ESTIMAR (dueño, 15/09/2026, fila de Agüero 01/09: «tengo ese sin recalc pegado»). Sin
  // recibo real ya es bruto × la mediana: con las horas o el $/h escritos se rehace igual, y no hay nada que avisar.
  // Un neto REAL (recibo del estudio o nómina) no se toca, y la pantalla lo avisa con el ícono.
  if (b.origenNeto === 'estimado' && b.proporcion && bruto != null) {
    return { ...comun, neto: r2(bruto * b.proporcion.cociente), netoNoRecalculado: false }
  }
  return { ...comun, netoNoRecalculado: b.neto != null }
}

export function sueldoBlancoNegro(e: EntradaDeSueldo): SueldoBlancoNegro {
  const b = conManual(blancoDe(e), e)
  const horas = num(e.horas)
  const faltan = horas == null || b.horasBlanco == null ? null : r2(horas - b.horasBlanco)
  // HS NEGRO ESCRITAS A MANO (dueño, 15/09/2026: «todas las celdas editables»). Son las que se pagan en negro, y el
  // recargo de extras NO se suma: no hay forma de saber qué parte de un número escrito ya lo incluye.
  const horasNegroManual = num(e.manual?.horasNegro)
  const horasNegro = horasNegroManual ?? (faltan == null ? null : Math.max(0, faltan))
  const equivalentes = num(e.horasEquivalentes)
  const recargoExtras = horasNegroManual != null || horas == null || equivalentes == null ? 0 : Math.max(0, r2(equivalentes - horas))
  const valorHoraNegro = num(e.valorHoraNegro)
  const negroCalculado = horasNegro == null || valorHoraNegro == null ? null : r2((horasNegro + recargoExtras) * valorHoraNegro)
  // IMPORTE NEGRO ESCRITO A MANO (dueño, 15/09/2026: «dejame editable todas las columnas de dinero»). Gana sobre
  // el cálculo y mueve el total; las horas del negro quedan como están.
  const negro = num(e.manual?.negro) ?? negroCalculado
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
  modalidad?: 'hora' | 'mensual' | 'ninguna'
  manual?: { cobra?: boolean; porBanco?: boolean }
}): number | null {
  if (l.netoMensual != null || l.modalidad === 'mensual') return null
  // EL NEGRO QUE MUESTRA LA FILA, SIEMPRE: el del modelo (calculado o escrito). Un Cobra total escrito a mano NO lo
  // recalcula en silencio; si deja de cerrar, lo marca `cierreDeLaFila` (dueño, 15/09/2026).
  if (l.sueldo) return l.sueldo.negro
  return l.cobra == null ? null : r2(l.cobra - l.porBanco)
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
 * por CUIL (la llave del estudio). `base` es la del recibo estimado: sin ella, el blanco de la mediana.
 */
export function entradaDeBlanco(d: {
  personaId: string; cuil: string | null; periodo: string; recibos: readonly ReciboDeSueldo[]
  pisoCategoria: number | null; netoDeNomina: number | null; base?: BaseDelEstimado | null
}): EntradaDeBlanco {
  const actual = periodoOrdenable(d.periodo)
  const recibo = d.recibos.find((r) => esDe(r, d.personaId, d.cuil) && periodoOrdenable(r.periodo) === actual) ?? null
  return {
    recibo, netoDeNomina: d.netoDeNomina, pisoCategoria: d.pisoCategoria,
    proporcion: proporcionDelNeto(d),
    estimacion: d.base ? { base: d.base, persona: cuilNormalizado(d.cuil) } : null,
  }
}
