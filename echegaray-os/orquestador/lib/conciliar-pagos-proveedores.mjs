// ¿QUÉ PAGO YA HECHO NO ESTÁ APLICADO A SU FILA DE COMPRAS? — el emparejamiento, puro.
//
// ═══ POR QUÉ EXISTE (13/09/2026) ═══
//
// El dueño, 11/09: «la pestaña Proveedores … me refleja un monto de deuda mayor». La pestaña lee
// bien: «Se le debe» es `Compras!AL` (= O − T − W en las filas Pendiente con AJ=1) al peso. Lo que
// falla es lo que AL no puede saber: nada en el OS lleva un pago del mundo —la transferencia del
// banco, el echeq, el comprobante que bajó del mail— a la fila de la factura que cancela. `T` es
// fórmula (`=IF(F="pago";O;0)`) y sólo dice «pagado» si la fila nació como pago; en cuenta corriente
// el pago lo tiene que tipear una persona en V/W («Fecha prevista de pago 2» / «Monto Parcial 2»).
// Si nadie lo tipea, la factura sigue debiéndose aunque la plata ya haya salido.
//
// ═══ LAS REGLAS DEL EMPAREJAMIENTO, Y POR QUÉ CADA UNA ═══
//
//  · IDENTIDAD POR CUIT, NUNCA POR NOMBRE. El banco dice «jose maria robles» y Compras dice «Robles
//    Pintureria»: son dos personas (el contador y la pinturería). Una fila sin CUIT no se concilia.
//  · FECHA DEL PAGO ≥ FECHA DE LA FACTURA. Un pago anterior no avala una compra posterior (memoria
//    del repo «cheque no avala compras posteriores»). En un cheque la fecha que cuenta es la de
//    EMISIÓN; sin emisión conocida el cheque se declara y no se aplica — el vencimiento no prueba nada.
//  · IMPORTE EXACTO (tolerancia $1, la misma de la X de Compras): un pago contra una fila, un pago
//    contra un conjunto ≤4 de filas, o un conjunto ≤4 de pagos contra una fila.
//  · YA APLICADO GANA. Antes de proponer, se mira si el pago explica filas que YA dicen Pagado. Medido
//    el 13/09: el echeq 373 a Hormiserv ($2.953.997,20) es f701 − NC f787 al centavo, y el 376 a
//    Robles ($483.151,79) es f749+f854+f838. Aplicarlos a lo pendiente habría borrado deuda real.
//  · AMBIGUO NO ES UN CRUCE. Dos candidatos ⇒ se declara y no se escribe (misma regla que
//    `cruce-cheque-factura.mjs`).
import { normalizarCuit, CUIT_ECSAS } from './transferencias-proveedores.mjs'

/** Índices 0 de la pestaña Compras (contrato en `comprobantes/contrato-columnas.mjs`). */
export const COL = Object.freeze({
  id: 0, fecha: 2, proveedor: 4, total: 14, pagado: 19, fecha2: 21, parcial2: 22, estado: 23, saldo: 37, cuit: 38,
})
export const TOLERANCIA_CENT = 100
export const MAX_CONJUNTO = 4
/** Un pago no se busca contra filas ya pagadas de hace más de esto: acota la combinatoria. */
export const VENTANA_PAGADAS_DIAS = 180

export const cent = (x) => Math.round((Number(x) || 0) * 100)
const txt = (x) => String(x ?? '').trim()
const DIA = 86400000

/** Serial de Sheets o texto ISO → 'YYYY-MM-DD' | null. */
export function isoDe(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  if (Number.isFinite(n) && n > 20000) return new Date(Math.round((n - 25569) * DIA)).toISOString().slice(0, 10)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(txt(v))
  return m ? m[1] : null
}
export const serialDe = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DIA) + 25569
const dias = (a, b) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA

/** La grilla de Compras (UNFORMATTED_VALUE, desde `fila0`) → filas con lo que el cruce necesita. */
export function filasDeCompras(valores = [], fila0 = 4) {
  return valores.map((r, i) => ({
    fila: fila0 + i,
    id: Number(r?.[COL.id]) || null,
    fecha: isoDe(r?.[COL.fecha]),
    proveedor: txt(r?.[COL.proveedor]),
    cuit: normalizarCuit(r?.[COL.cuit]),
    total: Number(r?.[COL.total]) || 0,
    pagado: Number(r?.[COL.pagado]) || 0,
    parcial2: Number(r?.[COL.parcial2]) || 0,
    fecha2: r?.[COL.fecha2] ?? '',
    estado: txt(r?.[COL.estado]),
    saldo: Number(r?.[COL.saldo]) || 0,
  })).filter((f) => f.proveedor)
}

/** El CUIT de la contraparte en un concepto del Santander («… / 20379240195»): el último de 11 dígitos. */
export function cuitDelConcepto(concepto) {
  const hits = txt(concepto).match(/\b\d{2}-?\d{8}-?\d\b/g) ?? []
  const c = normalizarCuit(hits.at(-1))
  return c && c !== CUIT_ECSAS ? c : null
}

const ESTADOS_CHEQUE_MUERTO = /rechaz|anulad|devuelt|repudi/i

/**
 * Las tres fuentes de pago → una lista sin repetidos. Un mismo pago aparece dos veces cuando la
 * transferencia del banco y su comprobante del mail son la misma operación: se reconoce por la
 * referencia (el N° de operación es el mismo en los dos) o por CUIT + importe + ≤3 días.
 */
export function pagosDeFuentes({ banco = [], cheques = [], transferencias = [] } = {}) {
  const crudos = [
    ...banco.filter((m) => Number(m.importe) < 0).map((m) => ({
      fuente: 'banco', ref: txt(m.referencia), cuit: cuitDelConcepto(m.concepto), fecha: isoDe(m.fecha),
      importe: Math.abs(Number(m.importe)), detalle: txt(m.concepto),
    })),
    ...transferencias.map((t) => ({
      fuente: 'transferencia', ref: txt(t.comprobante_numero), cuit: normalizarCuit(t.cuit), fecha: isoDe(t.comprobante_fecha),
      importe: Number(t.comprobante_importe) || 0, detalle: `comprobante del mail · ${txt(t.nombre)}`,
    })),
    ...cheques.filter((c) => !ESTADOS_CHEQUE_MUERTO.test(txt(c.estado))).map((c) => ({
      fuente: 'cheque', ref: txt(c.numero), cuit: normalizarCuit(c.contraparte_cuit), fecha: isoDe(c.emision),
      importe: Number(c.importe) || 0, detalle: `cheque ${txt(c.numero)} · ${txt(c.contraparte)} · vence ${isoDe(c.fecha_pago) ?? '¿?'} · ${txt(c.estado)}`,
    })),
  ].filter((p) => p.cuit && p.importe > 0)
  const out = []
  for (const p of crudos) {
    // La cercanía de fecha sólo une fuentes DISTINTAS: dos transferencias iguales del banco en la
    // misma semana son dos cuotas, no una.
    const igual = out.find((q) => q.cuit === p.cuit && cent(q.importe) === cent(p.importe)
      && ((p.ref && q.ref === p.ref)
        || (q.fuente !== p.fuente && p.fecha && q.fecha && Math.abs(dias(p.fecha, q.fecha)) <= 3)))
    if (!igual) out.push(p)
  }
  return out
}

/**
 * Hasta `tope` subconjuntos (≤`max` elementos) de `valores` (centavos, pueden ser negativos: una
 * nota de crédito) cuya suma da `objetivo` ± tolerancia. Devuelve índices. Con `tope = 2` alcanza
 * para distinguir «ninguno», «uno» y «ambiguo».
 */
export function subconjuntosExactos(valores, objetivo, max = MAX_CONJUNTO, tope = 2) {
  const hallados = []
  const buscar = (desde, elegidos, suma) => {
    if (hallados.length >= tope) return
    if (elegidos.length && Math.abs(suma - objetivo) <= TOLERANCIA_CENT) { hallados.push([...elegidos]); return }
    if (elegidos.length >= max) return
    for (let i = desde; i < valores.length && hallados.length < tope; i++) {
      elegidos.push(i); buscar(i + 1, elegidos, suma + valores[i]); elegidos.pop()
    }
  }
  buscar(0, [], 0)
  return hallados
}

const esPendiente = (f) => /^pendiente$/i.test(f.estado) && cent(f.saldo) > 0 && f.cuit
const esPagada = (f) => /^pagado$/i.test(f.estado) && cent(f.total) !== 0 && f.cuit

/** Qué pasa con UN pago: propuesta, ya aplicado, ambiguo o huérfano. Muta `tomadas`. */
function decidirPago(p, pendientes, pagadas, tomadas) {
  const pend = pendientes.filter((f) => f.cuit === p.cuit && !tomadas.has(f.fila) && f.fecha && f.fecha <= p.fecha)
  const pag = pagadas.filter((f) => f.cuit === p.cuit && f.fecha && f.fecha <= p.fecha && dias(p.fecha, f.fecha) <= VENTANA_PAGADAS_DIAS)
  const hPend = subconjuntosExactos(pend.map((f) => cent(f.saldo)), cent(p.importe))
  const hPag = subconjuntosExactos(pag.map((f) => cent(f.total)), cent(p.importe))
  if (hPag.length && !hPend.length) return { tipo: 'yaAplicado', pago: p, filas: hPag[0].map((i) => pag[i]), ambiguo: hPag.length > 1 }
  if (hPend.length === 1 && !hPag.length) {
    const filas = hPend[0].map((i) => pend[i])
    filas.forEach((f) => tomadas.add(f.fila))
    return { tipo: 'propuesta', regla: filas.length === 1 ? 'importe exacto' : `conjunto de ${filas.length} facturas`, pagos: [p], filas }
  }
  if (hPend.length || hPag.length) {
    const motivo = hPend.length > 1 ? 'más de un conjunto de facturas pendientes da el importe' : 'el importe explica tanto facturas pendientes como ya pagadas'
    return { tipo: 'ambiguo', pago: p, motivo }
  }
  return { tipo: 'huerfano', pago: p }
}

/** Segunda pasada: varios pagos huérfanos del mismo CUIT que juntos cancelan UNA fila. */
function sumaDePagos(huerfanos, pendientes, tomadas) {
  const propuestas = []
  const usados = new Set()
  for (const f of pendientes) {
    if (tomadas.has(f.fila)) continue
    const cand = huerfanos.filter((p) => !usados.has(p) && p.cuit === f.cuit && p.fecha >= f.fecha)
    if (cand.length < 2) continue
    const h = subconjuntosExactos(cand.map((p) => cent(p.importe)), cent(f.saldo))
    if (h.length !== 1 || h[0].length < 2) continue
    const pagos = h[0].map((i) => cand[i])
    pagos.forEach((p) => usados.add(p)); tomadas.add(f.fila)
    propuestas.push({ tipo: 'propuesta', regla: `suma de ${pagos.length} pagos`, pagos, filas: [f] })
  }
  return { propuestas, restantes: huerfanos.filter((p) => !usados.has(p)) }
}

/**
 * EL CRUCE. `filas` salen de `filasDeCompras`, `pagos` de `pagosDeFuentes`.
 * @returns {{propuestas:object[], yaAplicados:object[], ambiguos:object[], sinFecha:object[], huerfanos:object[]}}
 */
export function conciliar(filas = [], pagos = []) {
  const pendientes = filas.filter(esPendiente)
  const pagadas = filas.filter(esPagada)
  const cuits = new Set(pendientes.map((f) => f.cuit))
  const tomadas = new Set()
  const r = { propuestas: [], yaAplicados: [], ambiguos: [], sinFecha: [], huerfanos: [] }
  const relevantes = pagos.filter((p) => cuits.has(p.cuit)).sort((a, b) => txt(a.fecha).localeCompare(txt(b.fecha)))
  for (const p of relevantes) {
    if (!p.fecha) { r.sinFecha.push(p); continue }
    const d = decidirPago(p, pendientes, pagadas, tomadas)
    if (d.tipo === 'propuesta') r.propuestas.push(d)
    else if (d.tipo === 'yaAplicado') r.yaAplicados.push(d)
    else if (d.tipo === 'ambiguo') r.ambiguos.push(d)
    else r.huerfanos.push(p)
  }
  const s = sumaDePagos(r.huerfanos, pendientes, tomadas)
  r.propuestas.push(...s.propuestas)
  r.huerfanos = s.restantes
  return r
}

/** Tabla por proveedor: deuda publicada (AL) · pagos con evidencia no aplicados · deuda real · diferencia. */
export function resumenPorProveedor(filas = [], propuestas = []) {
  const por = new Map()
  const fila = (nombre) => por.get(nombre) ?? por.set(nombre, { proveedor: nombre, publicada: 0, sinAplicar: 0, filas: 0, sinCuit: false }).get(nombre)
  for (const f of filas.filter((x) => /^pendiente$/i.test(x.estado) && cent(x.saldo) > 0)) {
    const t = fila(f.proveedor); t.publicada += f.saldo; t.filas++; if (!f.cuit) t.sinCuit = true
  }
  for (const p of propuestas) for (const f of p.filas) fila(f.proveedor).sinAplicar += f.saldo
  return [...por.values()]
    .map((t) => ({ ...t, real: t.publicada - t.sinAplicar, diferencia: t.sinAplicar }))
    .sort((a, b) => b.publicada - a.publicada)
}

/**
 * EL BISTURÍ: qué celdas escribir en UNA fila, contra la fila tal como está AHORA en el Sheet.
 * Escribe W = saldo y V = fecha del último pago; X sólo si es un valor pisado (si es fórmula, la X
 * se recalcula sola a «Pagado»). Nunca T (fórmula) ni AL (ARRAYFORMULA). Si la fila cambió desde
 * el cruce, o W/V ya tienen dato de una persona, NO se escribe: se declara.
 *
 * @param {{fila:number,id:number|null,proveedor:string,total:number,saldo:number}} esperada fila del cruce
 * @param {object} actual  la misma fila releída (`filasDeCompras`)
 * @param {unknown} formulaX  la X de esa fila con render FORMULA
 * @param {string} fechaPago  ISO
 */
export function celdasDeFila(esperada, actual, formulaX, fechaPago) {
  if (!actual || actual.id !== esperada.id || actual.proveedor !== esperada.proveedor
    || cent(actual.total) !== cent(esperada.total) || cent(actual.saldo) !== cent(esperada.saldo)) {
    return { problema: 'la fila cambió desde el cruce (id, proveedor, total o saldo): no se toca' }
  }
  if (cent(actual.parcial2) !== 0 || txt(actual.fecha2) !== '') {
    return { problema: 'V/W ya tienen dato de una persona: el pago se aplica a mano' }
  }
  const celdas = { V: serialDe(fechaPago), W: (cent(actual.total) - cent(actual.pagado)) / 100 }
  if (Math.abs(cent(celdas.W) - cent(esperada.saldo)) > TOLERANCIA_CENT) return { problema: 'O − T no coincide con el saldo AL: la fila no es O − T − W' }
  if (!txt(formulaX).startsWith('=')) celdas.X = 'Pagado'
  return { celdas }
}
