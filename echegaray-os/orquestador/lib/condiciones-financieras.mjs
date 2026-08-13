// LA CAPA DE CONDICIONES FINANCIERAS — le da al motor las tasas REALES, y dice qué falta.
//
// ═══ POR QUÉ EXISTE (24/07) ═══
//
// `compararFinanciamiento` (ingenieria-financiera.mjs) es un núcleo PURO que recibe las tasas como
// parámetros y, si no las tiene, dice honestamente "FALTA la tasa". Esta capa es la que las trae:
// lee la fuente única `public.condiciones_financieras`, calcula el costo financiero TOTAL EFECTIVO
// de cada alternativa para una necesidad concreta (monto × días), y arma los parámetros que el motor
// espera. No reescribe el motor ni duplica su lógica: reusa sus primitivas de costo y lo ALIMENTA.
//
// NUNCA INVENTA UNA TASA. Una condición sin TNA/CFT entra igual, pero se reporta en `faltan` con de
// dónde sacar el dato. El motor sigue comparando las alternativas que SÍ tienen información.

import { tasaDiaria, TASAS } from './costo-descubierto.mjs'

/** Días de mora/uso a partir de la fecha de necesidad. Base 365, igual que el resto del motor. */
const BASE = TASAS.base ?? 365

/** Los tipos que COBRAN INTERÉS: los únicos a los que tiene sentido reclamarles tasa, IVA y CFT. */
const FINANCIA_CON_INTERES = ['descubierto', 'prestamo', 'descuento_cheque', 'echeq', 'tarjeta']

/**
 * NÚCLEO PURO: costo financiero total efectivo de UNA condición para una necesidad (monto × días).
 *
 * Reusa `tasaDiaria` del modelo verificado del descubierto (no redefine la aritmética de tasas).
 * Devuelve el desglose completo que pide el spec: intereses, IVA sobre intereses, comisiones, gastos,
 * costo total, y el costo efectivo diario/mensual/anual. Si falta la tasa, `costo_total` es null y
 * `falta` dice qué — nunca un número inventado.
 *
 * ═══ UN PISO NO ES UN TOTAL (13/08, auditoría) ═══
 *
 * Esta función sólo reclamaba la TNA. Todo lo demás que no supiera lo trataba como CERO y devolvía
 * `falta: []`, que es la afirmación "acá no falta nada". Con la línea FONDEFIN quedó a la vista:
 * `iva: 0` sobre un IVA DESCONOCIDO, sin CFT, sin el 2% de otorgamiento, sin sellos ni seguro — y ese
 * objeto viajaba en el mismo array que el descubierto, que sí tiene su IVA verificado. Dos cosas
 * medidas distinto, ordenadas juntas por costo: gana la que menos datos tiene. No es un problema de
 * FONDEFIN, es del método — la tarjeta (sin CFT) y el prendario (sin IVA cargado) tenían el mismo
 * silencio.
 *
 * Las dos reglas nuevas:
 *  · EL IVA DESCONOCIDO NO ES IVA CERO. `null` va a `falta` y el IVA vuelve `null`, no `0`.
 *  · EL CFT ES EL ÚNICO CAMPO QUE AFIRMA UN TOTAL. Sin CFT publicado nadie —ni la entidad— dijo cuánto
 *    cuesta de verdad: sellos, seguros, tasaciones y gastos de otorgamiento viven fuera de la TNA. Sin
 *    él, lo que sale de acá es un PISO. Cuáles son esos costos en cada línea está en `observaciones`,
 *    que viaja en `para_conseguirlo`.
 *
 * `completitud` es 'total' | 'piso' | 'sin_dato', y `es_piso` lo dice en un booleano para el que sólo
 * mira una tabla. El número no cambia: cambia lo que el número declara ser.
 *
 * @param {object} cond fila de condiciones_financieras
 * @param {{monto:number, dias:number}} need
 */
export function costoEfectivo(cond = {}, { monto = 0, dias = 0 } = {}) {
  const capital = Math.abs(Number(monto) || 0)
  const d = Math.max(0, Number(dias) || 0)
  const tna = cond.tna == null ? null : Number(cond.tna)
  const falta = []
  // Una condición que financia (descubierto, préstamo, descuento, tarjeta) necesita tasa. Un impuesto
  // (Ley 25.413) o una condición comercial pueden tener sólo un CFT/costo fijo — se respeta lo que haya.
  const necesitaTasa = FINANCIA_CON_INTERES.includes(cond.tipo_financiacion)
  if (necesitaTasa && tna == null) falta.push('tna')

  let intereses = null
  if (tna != null) intereses = capital * tasaDiaria(tna) * d
  // Un IVA en null es UN DATO QUE NO SE TIENE, no una exención. Tratarlo como 0 subestimaba el costo
  // hasta en 21 puntos sobre los intereses sin decir una palabra.
  const ivaDeclarado = cond.iva_sobre_intereses != null
  if (necesitaTasa && !ivaDeclarado) falta.push('iva_sobre_intereses')
  const iva = (intereses == null || !ivaDeclarado) ? null : intereses * Number(cond.iva_sobre_intereses)
  const comisiones = Number(cond.comisiones) || 0
  const gastos = Number(cond.gastos) || 0
  if (necesitaTasa && cond.cft == null) falta.push('cft')

  // El IVA desconocido entra como 0 EN LA SUMA —no hay con qué sumarlo— pero la suma ya no se llama
  // total: `completitud` la marca como piso y `falta` dice por qué.
  const costoTotal = intereses == null ? null : intereses + (iva ?? 0) + comisiones + gastos
  // Costo efectivo = costo / capital, anualizado por los días de uso. Sólo si hay capital y días.
  const efectivoPeriodo = (costoTotal != null && capital > 0 && d > 0) ? costoTotal / capital : null
  const efectivoDiario = efectivoPeriodo == null ? null : efectivoPeriodo / d
  const efectivoMensual = efectivoDiario == null ? null : efectivoDiario * 30
  const efectivoAnual = efectivoDiario == null ? null : efectivoDiario * BASE
  const completitud = costoTotal == null ? 'sin_dato' : (falta.length ? 'piso' : 'total')

  return {
    id: cond.id ?? null, entidad: cond.entidad, producto: cond.producto,
    tipo: cond.tipo_financiacion, nivel_confianza: cond.nivel_confianza,
    capital, dias: d,
    intereses: round(intereses), iva: round(iva), comisiones, gastos,
    costo_total: round(costoTotal),
    completitud, es_piso: completitud === 'piso',
    costo_efectivo_diario: efectivoDiario, costo_efectivo_mensual: efectivoMensual, costo_efectivo_anual: efectivoAnual,
    limite_disponible: cond.limite_disponible == null ? null : Number(cond.limite_disponible),
    falta,
    fuente: cond.fuente, vigencia_hasta: cond.vigencia_hasta ?? null,
    // Qué mirar si falta el dato: sale de las observaciones, que ya dicen dónde está.
    para_conseguirlo: falta.length ? (cond.observaciones ?? 'cargar la condición con su fuente') : null,
  }
}

/**
 * NÚCLEO PURO: la advertencia que acompaña a un array de costos para que nadie lo lea como un ranking.
 *
 * El tool le entregaba al modelo el array de `costoEfectivo` sin una sola marca de que algunos números
 * eran incompletos. Un LLM ordenando por `costo_total` corona a la línea peor documentada. Devuelve
 * `null` cuando TODAS son totales: una advertencia que aparece siempre deja de leerse.
 *
 * @param {Array<ReturnType<typeof costoEfectivo>>} detalles
 */
export function advertenciaDeComparabilidad(detalles = []) {
  const pisos = detalles.filter((x) => x?.completitud === 'piso')
  if (!pisos.length) return null
  const totales = detalles.filter((x) => x?.completitud === 'total').length
  return {
    comparables: totales,
    incompletas: pisos.map((p) => ({ entidad: p.entidad, producto: p.producto, falta: p.falta })),
    advertencia: `NO SON COMPARABLES ENTRE SÍ: ${pisos.length} de ${detalles.length} alternativas publican un PISO, no un costo total (les falta ${[...new Set(pisos.flatMap((p) => p.falta))].join(', ')}). Ordenarlas por costo_total pondría primera a la que menos datos tiene. Sólo ${totales} tiene el costo completo.`,
  }
}

const round = (n) => (n == null ? null : Math.round(n))

/**
 * NÚCLEO PURO: traduce las condiciones a los PARÁMETROS que `compararFinanciamiento` del motor espera.
 * Sólo pasa una tasa cuando se conoce; las que faltan quedan fuera (el motor dirá "FALTA la tasa") y
 * se listan en `faltan` con su fuente. Así el motor no inventa y el que pregunta sabe qué cargar.
 *
 * @param {Array<object>} conds condiciones vigentes
 * @returns {{params:object, faltan:Array<{tipo:string,producto:string,para_conseguirlo:string}>}}
 */
export function paramsParaMotor(conds = []) {
  const params = {}
  const faltan = []
  const primeraDelTipo = (tipo) => conds.find((c) => c.tipo_financiacion === tipo)

  const desc = primeraDelTipo('descubierto')
  if (desc && desc.limite_disponible != null) {
    const usado = Number(desc.saldo_utilizado) || 0
    params.limiteDescubiertoDisp = Math.max(0, Number(desc.limite_disponible) - usado)
  }
  // UN PRÉSTAMO SÓLO SE OFRECE COMO FINANCIACIÓN NUEVA SI ES UNA LÍNEA DE LA QUE SE PUEDE SACAR PLATA
  // (limite_disponible > 0). Un préstamo YA DESEMBOLSADO (ej. el prendario del Ranger: capital ya
  // acreditado, cuotas en curso) tiene su tasa real y sirve de referencia de costo, pero NO es una
  // alternativa para cubrir un bache — no se puede volver a tomar. Ofrecerlo engañaría al motor.
  const disponible = (c) => c.tna != null && Number(c.limite_disponible) > 0
  const prest = conds.find((c) => c.tipo_financiacion === 'prestamo' && disponible(c))
  if (prest) params.tasaPrestamoTNA = Number(prest.tna)
  const chq = conds.find((c) => c.tipo_financiacion === 'descuento_cheque' && c.tna != null)
  if (chq) params.tasaDescuentoChequeTNA = Number(chq.tna)

  // Lo que EXISTE como producto pero no tiene con qué operar: sin tasa (hay que conseguirla) o, en el
  // caso de un préstamo, sin línea disponible para tomar plata nueva. Es lo que le falta al motor.
  for (const tipo of ['prestamo', 'descuento_cheque', 'tarjeta']) {
    const c = primeraDelTipo(tipo)
    if (!c) continue
    if (c.tna == null) faltan.push({ tipo, producto: c.producto, entidad: c.entidad, para_conseguirlo: c.observaciones ?? null })
  }
  return { params, faltan }
}

/** Lee las condiciones vigentes a una fecha (vigencia_desde/hasta cubren hoy, o son abiertas). */
export async function condicionesVigentes(deps = {}, hoy = new Date()) {
  const query = deps.query || (await import('./db.mjs')).query
  const iso = hoy.toISOString().slice(0, 10)
  const { rows } = await query(
    `select * from public.condiciones_financieras
      where (vigencia_desde is null or vigencia_desde <= $1)
        and (vigencia_hasta is null or vigencia_hasta >= $1)
      order by tipo_financiacion, entidad`, [iso])
  return rows
}

/**
 * Carga/actualiza una condición a mano, con trazabilidad obligatoria. Upsert por la clave única, así
 * corregir una tasa no crea un duplicado. `fuente` es obligatoria (de dónde salió el dato).
 */
export async function registrarCondicion(deps = {}, c = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  if (!c.entidad || !c.producto || !c.tipo_financiacion) return { ok: false, motivo: 'faltan entidad, producto o tipo_financiacion' }
  if (!c.fuente) return { ok: false, motivo: 'toda condición necesita fuente (trazabilidad) — no se carga una tasa sin decir de dónde salió' }
  const cols = ['entidad', 'producto', 'tipo_financiacion', 'moneda', 'vigencia_desde', 'vigencia_hasta',
    'tna', 'tea', 'cft', 'iva_sobre_intereses', 'comisiones', 'gastos', 'plazo_dias', 'dias_minimos',
    'limite_disponible', 'saldo_utilizado', 'amortizacion', 'fecha_debito', 'garantias', 'fuente',
    'nivel_confianza', 'observaciones']
  const vals = cols.map((k) => (k === 'moneda' ? (c.moneda ?? 'ARS') : k === 'nivel_confianza' ? (c.nivel_confianza ?? 'informado') : c[k] ?? null))
  const ph = cols.map((_, i) => `$${i + 1}`).join(',')
  const set = cols.filter((k) => !['entidad', 'producto', 'tipo_financiacion', 'moneda', 'vigencia_desde'].includes(k))
    .map((k) => `${k}=excluded.${k}`).concat('actualizado_en=now()').join(', ')
  try {
    await query(
      `insert into public.condiciones_financieras (${cols.join(',')}) values (${ph})
       on conflict (entidad, producto, tipo_financiacion, moneda, coalesce(vigencia_desde,'1900-01-01'::date))
       do update set ${set}`, vals)
    return { ok: true }
  } catch (e) { return { ok: false, motivo: String(e?.message ?? e).slice(0, 160) } }
}
