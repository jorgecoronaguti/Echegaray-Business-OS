// LOS PLANES DE PAGO DEL F931 COMO OBLIGACIÓN APARTE — y el período que financian, sin inflarlo.
//
// NÚCLEO PURO. Recibe las filas de Compras (`compra_sheet`), los pagos ya imputados y las obligaciones
// ya construidas; devuelve las cuotas como filas de `impuesto_obligacion`, los débitos de cuota atados a
// su cuota, y el F931 del período financiado con su `a_pagar` recortado a lo que se pagó por VEP.
//
// ═══ POR QUÉ ═══
//
// El 17/09/2026 la pantalla mostraba F931 enero con $2.587.889,54 pendientes y junio con $7.021.367,90.
// Ninguno se debe por VEP: el dueño cerró junio con «pago 20/07 $4.859.763 + plan W303094 (3 cuotas)»
// (Compras fila 458) y enero entró en «Deuda Previcional - 931 Enero 26». Lo que se debe es la CUOTA,
// con su vencimiento. Contar el saldo de la DDJJ y además las cuotas sería pagar dos veces la misma deuda.
//
// ═══ LO QUE NO SE SABE, Y CÓMO QUEDA ═══
//
//   · El capital que financia cada plan: el cronograma de Mis Facilidades no está en el OS. Lo que se
//     descuenta del período es el SALDO NO PAGADO POR VEP, declarado como tal en `detalle`; la
//     diferencia con la suma de cuotas es interés de financiación, no un error.
//   · Cuántas cuotas tiene el plan: se cuentan las filas que el dueño cargó en Compras. Si faltara una
//     fila futura, la cuota no existe acá — y `detalle.cuotas_fuente` lo dice.
//   · El importe de una cuota futura que Compras dejó en «—»: se supone igual a otra cuota del mismo
//     plan y la obligación queda `estimado`. Nunca 0.
//   · El vencimiento es la fecha de la fila de Compras, no una tabla de ARCA: confianza `supuesto`.

import { planDeLaFila } from './libro-extractores-cargas.mjs'
import { esCuotaDePlan, fechaISO, TOLERANCIA_IMPORTE } from './impuestos-registro-pagos.mjs'
import { c2 } from './impuestos-registro.mjs'

/** Un débito se ata a la cuota que vence a lo sumo a esta distancia: el banco debita el 16 o el hábil siguiente. */
export const DIAS_DE_GRACIA_CUOTA = 5

const PAGA = new Set(['vep', 'debito_automatico', 'debito_bancario'])
const dias = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
const texto = (f) => `${f.concepto ?? ''} ${f.detalle_obra ?? ''}`

/** Las cuotas de cada plan, desde Compras. Las filas ELIMINADO cuentan: son el cronograma, no un pago. */
export function cuotasDeCompras(filas = []) {
  const porPlan = new Map()
  for (const f of filas) {
    if (!/^(arca|afip)$/i.test(String(f.proveedor ?? '').trim()) || !esCuotaDePlan(f)) continue
    const plan = planDeLaFila(texto(f))
    const vence = fechaISO(f.fecha)
    if (!plan || !vence) continue
    porPlan.set(plan.nombre, [...(porPlan.get(plan.nombre) ?? []), { plan, vence, fila: f.fila ?? null,
      importe: Math.max(Number(f.total) || 0, Number(f.monto_pagado) || 0) || null }])
  }
  const out = []
  for (const cuotas of porPlan.values()) {
    cuotas.sort((a, b) => a.vence.localeCompare(b.vence))
    // LA CUOTA CON IMPORTE EN «—» SE BUSCA POR EL DE SU PLAN: el 16/06 el banco debitó dos cuotas de
    // planes distintos el mismo día, y atar por fecha sola le daría a uno la del otro.
    const conocido = (i) => cuotas.slice(0, i).reverse().find((x) => x.importe)?.importe ?? cuotas.find((x) => x.importe)?.importe ?? null
    cuotas.forEach((c, i) => out.push({ ...c, n: i + 1, de: cuotas.length, esperado: c.importe ?? conocido(i) }))
  }
  return out
}

export const conceptoCuota = (c) => `${c.plan.nombre} · cuota ${c.n}/${c.de}`

/**
 * @param {object} p
 * @param {object[]} p.compras filas de `compra_sheet` de ARCA/AFIP
 * @param {object[]} p.pagos pagos ya imputados (salida de `imputarDeclaradas`)
 * @param {object[]} p.obligaciones obligaciones ya construidas (se devuelven con el período financiado recortado)
 * @param {boolean} [p.pagosCompletos] false si banco o Compras no leyeron: sin todos los pagos, el saldo
 *   «no pagado por VEP» sale inflado y recortar con él escondería deuda. Entonces no se recorta.
 */
export function conPlanesF931({ compras = [], pagos = [], obligaciones = [], pagosCompletos = true }) {
  const cuotas = cuotasDeCompras(compras)
  const libres = pagos.map((p, i) => ({ p, i })).filter(({ p }) => p.impuesto === 'cargas_sociales' && p.concepto === 'plan de pago')
  const reimputados = new Map()
  const oblCuotas = []
  for (const c of cuotas) {
    const idx = libres.findIndex(({ p }) => dias(p.fecha, c.vence) <= DIAS_DE_GRACIA_CUOTA
      && (c.esperado === null || Math.abs(p.importe - c.esperado) <= TOLERANCIA_IMPORTE))
    const hit = idx >= 0 ? libres.splice(idx, 1)[0] : null
    const concepto = conceptoCuota(c)
    if (hit) reimputados.set(hit.i, { ...hit.p, periodo: c.plan.periodo, concepto })
    const importe = c.importe ?? hit?.p.importe ?? c.esperado
    const fuenteImporte = c.importe ? 'compras' : hit ? 'banco' : importe !== null ? 'igual a otra cuota del plan (supuesto)' : 'desconocido'
    oblCuotas.push({
      impuesto: 'cargas_sociales', periodo: c.plan.periodo, concepto, fuente: 'manual', lector: 'planes_f931',
      estado: fuenteImporte.startsWith('igual') || importe === null ? 'estimado' : 'presentado',
      vencimiento: c.vence, vencimiento_confianza: 'supuesto',
      determinado: c2(importe), base_imponible: null, creditos: null, saldo_favor_anterior: null,
      a_pagar: c2(importe), saldo_a_favor: null, presentada_el: null, comprobante: null,
      documento: c.fila ? `Compras fila ${c.fila}` : 'Compras', datos_al: null,
      detalle: { plan: c.plan.nombre, cuota: c.n, cuotas: c.de, cuotas_fuente: 'filas de Compras',
        importe_fuente: fuenteImporte, vencimiento_fuente: 'fecha de la fila de Compras' },
    })
  }
  const pagosOut = pagos.map((p, i) => reimputados.get(i) ?? p)
  const financiados = new Map(cuotas.map((c) => [c.plan.periodo, c.plan.nombre]))
  const oblOut = obligaciones.map((o) => (pagosCompletos ? recortarFinanciado(o, financiados, pagosOut) : o))
  return { obligaciones: [...oblOut, ...oblCuotas], pagos: pagosOut }
}

/** El F931 de un período con plan: su `a_pagar` es lo pagado por VEP; el resto lo cancela el plan. */
function recortarFinanciado(o, financiados, pagos) {
  const plan = financiados.get(o.periodo)
  if (o.impuesto !== 'cargas_sociales' || o.concepto !== 'ddjj' || !plan || !(o.a_pagar > 0)) return o
  const pagado = c2(pagos.filter((p) => p.impuesto === 'cargas_sociales' && p.periodo === o.periodo && p.concepto === 'ddjj'
    && PAGA.has(p.tipo)).reduce((s, p) => s + p.importe, 0))
  const saldo = c2(o.a_pagar - pagado)
  if (!(saldo > TOLERANCIA_IMPORTE)) return o
  return { ...o, a_pagar: pagado, detalle: { ...o.detalle, financiado_en_plan: { plan, importe: saldo,
    criterio: 'saldo de la DDJJ no pagado por VEP; capital exacto del plan desconocido (sin cronograma de Mis Facilidades)' } } }
}

/**
 * VENCIMIENTO DEL F931 · SUPUESTO: día 10 del mes siguiente al período. No es la tabla de ARCA (que va
 * por terminación de CUIT y corre por feriados): es la regla que reproduce los pagos medidos de 2026
 * (10/02, 10/03, 09/04, 11/05, 08/06, 11/08, 07/09) y la que ya usa la pestaña «Cargas Sociales».
 */
export function vencimientoF931Supuesto(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodo ?? ''))
  if (!m) return null
  const a = Number(m[1]) + (m[2] === '12' ? 1 : 0)
  const mes = m[2] === '12' ? 1 : Number(m[2]) + 1
  return `${a}-${String(mes).padStart(2, '0')}-10`
}

export function conVencimientoF931(obligaciones = []) {
  return obligaciones.map((o) => (o.impuesto === 'cargas_sociales' && o.concepto === 'ddjj' && !o.vencimiento
    ? { ...o, vencimiento: vencimientoF931Supuesto(o.periodo), vencimiento_confianza: 'supuesto',
      detalle: { ...o.detalle, vencimiento_regla: 'día 10 del mes siguiente (supuesto, sin tabla de ARCA verificada)' } }
    : o))
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** 'sep-26' o un serial de Sheets → '2026-09'. */
function periodoDeRotulo(v) {
  if (typeof v === 'number') return fechaISO(v)?.slice(0, 7) ?? null
  const m = /^([a-z]{3})-(\d{2})$/i.exec(String(v ?? '').trim())
  const i = m ? MESES.indexOf(m[1].toLowerCase()) : -1
  return i < 0 ? null : `20${m[2]}-${String(i + 1).padStart(2, '0')}`
}

/**
 * EL F931 DEL MES EN CURSO QUE TODAVÍA NO SE DECLARÓ · ESTIMADO. Sale de la fila «⇒ Subtotal F931» de la
 * sección de proyección de la pestaña «Cargas Sociales» (remuneración proyectada × alícuotas del último
 * F931). Sólo los períodos posteriores al último declarado y no posteriores a `hasta`: un mes que todavía
 * no se devengó no se debe. Sin fila o sin valor, no hay obligación — la pantalla lo ve como desconocido,
 * nunca como 0.
 */
export function estimacionesF931(filas = [], { declarados = [], hasta }) {
  const ultimo = [...declarados].sort().at(-1) ?? ''
  const iFila = filas.findIndex((f) => /^⇒\s*Subtotal F931$/i.test(String(f?.[0] ?? '').trim()))
  if (iFila < 0) return []
  const enc = filas.slice(0, iFila).reverse().find((f) => String(f?.[0] ?? '').trim() === 'Concepto') ?? []
  const out = []
  enc.forEach((rot, j) => {
    const periodo = j > 0 ? periodoDeRotulo(rot) : null
    const monto = Number(filas[iFila][j])
    if (!periodo || periodo <= ultimo || periodo > hasta || !(monto > 0)) return
    out.push({
      impuesto: 'cargas_sociales', periodo, concepto: 'ddjj', fuente: 'calculo', lector: 'cargas_pestana', estado: 'estimado',
      vencimiento: vencimientoF931Supuesto(periodo), vencimiento_confianza: 'supuesto',
      determinado: c2(monto), base_imponible: null, creditos: null, saldo_favor_anterior: null, a_pagar: c2(monto),
      saldo_a_favor: null, presentada_el: null, comprobante: null, documento: 'Cargas Sociales · proyección · Subtotal F931',
      datos_al: null, detalle: { estimacion: 'remuneración proyectada × alícuotas del último F931 (pestaña Cargas Sociales)' },
    })
  })
  return out
}
