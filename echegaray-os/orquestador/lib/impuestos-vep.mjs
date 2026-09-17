// LA IMPUTACIÓN DE UN PAGO POR SU PAPEL — el comprobante del VEP — y la que declaró el dueño.
//
// NÚCLEO PURO. El extracto dice «Pago de servicios - Imp.afip: 3071630464311793242» para TODO VEP: el
// banco no sabe qué impuesto ni qué período pagó. El contador sí: archiva el comprobante de cada VEP en
// `<archivo fiscal>/<año>/931/` («2026-06 VEP (parcial).pdf»), y ese PDF dice Tipo de Pago, Período,
// Fecha de Pago e IMPORTE PAGADO. Con eso un VEP del banco deja de estar «sin imputar» por evidencia,
// no por coincidencia de importe.
//
// ═══ POR QUÉ EXISTE (17/09/2026) ═══
//
// El VEP del 20/07 por $4.859.763,28 figuraba sin imputar: no coincide con ningún F931 porque junio se
// pagó PARTIDO — obra social, ART y seguro de vida por VEP; la seguridad social al plan W303094. El
// comprobante `2026-06 VEP (parcial).pdf` (Drive 1QoQYLyYrpRv5mBoTuXG9ej1hHhShjUT6) lo dice: Período
// 2026-06, pagado 2026-07-20 08:51, transacción 937061561233, $4.859.763,28. Lo mismo el «Enero» de
// Compras ($1.994.802,59, 10/02): `2026-01 VEP.pdf`, pagado 09/02, período 2026-01.
//
// ═══ EL NOMBRE DEL ARCHIVO MIENTE; EL CONTENIDO NO ═══
//
// `2026-02 VEP (parcial).pdf` contiene el VEP de ENERO (mismo Nro. VEP 1584827584). Por eso el período
// sale del texto del comprobante, nunca del nombre, y dos archivos con el mismo VEP cuentan una vez.

import { c2 } from './impuestos-registro.mjs'

/** Días entre dos 'YYYY-MM-DD'. */
const diasEntre = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000

/** '$4.859.763,28' → 4859763.28. null si no es un importe. */
function montoAR(s) {
  const m = /([\d.]+,\d{2})/.exec(String(s ?? ''))
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null
}

/**
 * El impuesto que paga un VEP, por su «Tipo de Pago» y su «Descripción Reducida». null si no se
 * reconoce: un VEP de un tipo nuevo no se imputa a ciegas.
 */
export function impuestoDelVep({ tipo_pago = '', descripcion = '' } = {}) {
  const t = `${tipo_pago} ${descripcion}`
  if (/Empleadores SICOSS|^\s*SIJPDJ/i.test(t)) return 'cargas_sociales'
  if (/Ganancias/i.test(t)) return 'ganancias'
  if (/\bIVA\b/i.test(t)) return 'iva'
  return null
}

/**
 * Lee el texto de un «Comprobante de Pago» de VEP. Devuelve null si el PDF no es eso —la captura del
 * extracto que el contador guarda como «2026-08 pago vep» no es un comprobante y no se toma como tal.
 */
export function parsearVepPdf(texto = '') {
  const t = String(texto)
  if (!/Comprobante de Pago/i.test(t) || !/IMPORTE PAGADO/i.test(t)) return null
  const buscar = (re) => { const m = re.exec(t); return m ? m[1].trim() : null }
  const out = {
    nro_vep: buscar(/Nro\. VEP:\s*(\d+)/i),
    tipo_pago: buscar(/Tipo de Pago:\s*([^\n]+)/i),
    descripcion: buscar(/Descripci[oó]n Reducida:\s*([^\n]+)/i),
    periodo: buscar(/Per[ií]odo:\s*(\d{4}-(?:0[1-9]|1[0-2]))/i),
    fecha_pago: buscar(/Fecha de Pago:\s*(\d{4}-\d{2}-\d{2})/i),
    importe: montoAR(buscar(/IMPORTE PAGADO\s*([^\n]+)/i)),
    nro_transaccion: buscar(/Nro\. de Transacci[oó]n:\s*(\d+)/i),
    medio_pago: buscar(/Medio de Pago:\s*([^\n]+)/i),
  }
  if (!out.periodo || !out.fecha_pago || !(out.importe > 0)) return null
  return { ...out, impuesto: impuestoDelVep(out) }
}

/** Dos archivos con el mismo VEP y la misma transacción son un solo pago. */
export function vepsUnicos(veps = []) {
  const vistos = new Map()
  for (const v of veps) {
    const k = `${v.nro_vep}|${v.nro_transaccion}|${v.importe}`
    if (!vistos.has(k)) vistos.set(k, { ...v, archivos: [v.archivo].filter(Boolean) })
    else vistos.get(k).archivos.push(v.archivo)
  }
  return [...vistos.values()]
}

/** Tolerancia: el comprobante y el extracto son el mismo débito, al centavo. */
const TOL_IMPORTE = 0.05
/** El banco asienta el VEP del día hábil siguiente (09/02 20:08 → Compras 10/02). */
const TOL_DIAS = 3

/**
 * IMPUTA POR DOCUMENTO los VEP del banco y de Compras que tienen comprobante. Un VEP que ya estaba
 * imputado por importe pasa a documento (el papel es evidencia más fuerte que una coincidencia); si el
 * comprobante dice OTRO período que la coincidencia, manda el comprobante y la discrepancia queda en
 * `detalle.periodo_por_importe`. Dos comprobantes candidatos para un mismo pago: no se imputa.
 */
export function imputarPorVep(pagos = [], veps = []) {
  const utiles = vepsUnicos(veps).filter((v) => v.impuesto)
  return pagos.map((p) => {
    if (p.tipo !== 'vep' || !['sin_imputar', 'importe'].includes(p.imputacion)) return p
    const hits = utiles.filter((v) => Math.abs(v.importe - p.importe) <= TOL_IMPORTE && diasEntre(v.fecha_pago, p.fecha) <= TOL_DIAS)
    if (hits.length !== 1) return p
    const v = hits[0]
    return {
      ...p, impuesto: v.impuesto, periodo: v.periodo, concepto: 'ddjj', imputacion: 'documento',
      detalle: {
        ...(p.detalle ?? {}),
        ...(p.imputacion === 'importe' && p.periodo !== v.periodo ? { periodo_por_importe: p.periodo } : {}),
        vep: { nro_vep: v.nro_vep, nro_transaccion: v.nro_transaccion, fecha_pago: v.fecha_pago, tipo_pago: v.tipo_pago, archivos: v.archivos, drive_id: v.drive_id ?? null },
      },
    }
  })
}

/**
 * LO QUE EL DUEÑO DECLARÓ, CUANDO NO HAY PAPEL. No es un documento ni una coincidencia: es su palabra,
 * y así queda escrito (`imputacion = 'declarada'`, migración 20260917T1000). El período que el dueño
 * no dijo es INFERENCIA y lleva su confianza y su porqué.
 *
 * Se identifica el movimiento del banco por fecha + importe exacto + texto del extracto, no por su id:
 * un reimporte del extracto cambia el id, no el débito.
 */
export const IMPUTACIONES_DECLARADAS = Object.freeze([
  {
    fecha: '2026-08-28', importe: 69722.68, texto: /Imp\.?afip/i,
    impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'ddjj',
    declarado: { por: 'dueño', el: '2026-09-17', dicho: 'eso es f931 pagado' },
    periodo_inferido: {
      confianza: 'media',
      por_que: 'no hay comprobante de VEP en 2026/931 ni fila en Compras. Junio es el único F931 pagado fuera de '
        + 'término (VEP parcial el 20/07, plan W303094 por el resto): un pago chico posterior encaja con intereses '
        + 'resarcitorios de ese período. Julio y agosto se pagaron completos y en fecha.',
    },
  },
  {
    fecha: '2026-07-20', importe: 4859763.28, texto: /Imp\.?afip/i,
    impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'ddjj',
    declarado: { por: 'dueño', el: '2026-09-17', dicho: 'eso es f931 pagado' },
    // Si el comprobante 2026-06 VEP (parcial).pdf se lee, `imputarPorVep` ya lo imputó por documento y
    // esta declaración no se aplica: sólo cubre el día en que Drive no conteste.
    periodo_inferido: null,
  },
])

/** Aplica las declaraciones a los pagos TODAVÍA sin imputar. Un documento le gana a una declaración. */
export function imputarDeclaradas(pagos = [], declaradas = IMPUTACIONES_DECLARADAS) {
  return pagos.map((p) => {
    if (p.imputacion !== 'sin_imputar') return p
    const d = declaradas.find((x) => x.fecha === p.fecha && Math.abs(x.importe - p.importe) < 0.005 && x.texto.test(p.descripcion ?? ''))
    if (!d) return p
    return {
      ...p, impuesto: d.impuesto, periodo: d.periodo, concepto: d.concepto, imputacion: 'declarada', importe: c2(p.importe),
      detalle: { ...(p.detalle ?? {}), declarado: d.declarado, ...(d.periodo_inferido ? { periodo_inferido: d.periodo_inferido } : {}) },
    }
  })
}
