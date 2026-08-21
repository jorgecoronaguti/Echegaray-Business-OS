// LEER UN FAJO DE CHEQUES (pantallas del banco u órdenes de pago). NÚCLEO PURO, SIN RED NI BASE.
//
// POR QUÉ EXISTE (30/07). Hermano de `banco-importar.mjs`. El único registro de cheques del OS era un
// array escrito a mano en `cheques-recibidos.mjs` con corte 22/07, y encima era un registro de
// OPERACIONES (Aceptación/Custodia/Depósito/Endoso) sin número de cheque ni librador — así que no se
// podía cruzar contra nada ni sumar sin contar el mismo valor tres veces.
//
// ═══ POR QUÉ NO PARSEA PDF ═══
//
// Las pantallas del Santander (recibidos, emitidos) y las órdenes de pago de cada cliente tienen
// layouts distintos y cambian sin avisar. Un parser de texto crudo sobre eso falla en silencio: lee
// 6 de 8 cheques y no lo dice. Acá el contrato es un JSON: el OS lee el documento (que para eso sabe
// leer imágenes y PDF) y este núcleo VALIDA, normaliza, deduplica y verifica invariantes. Es el mismo
// reparto que ya funciona en `carga-comprobantes.mjs`: el modelo lee, el código controla.
//
// ═══ EL CONTROL QUE HACE CONFIABLE ESTO ═══
//
// Una orden de pago declara un total. La suma de los cheques que la componen tiene que darlo. Eso es
// una identidad, no una estimación: si no cierra, falta un cheque o hay un importe mal leído. Es el
// equivalente a la cadena de saldos del extracto, y es lo que convirtió la O/P 4865 de Messina en un
// dato confiable ($16.807.425,92 en 5 cheques = el depósito del 29/07 en el banco).
//
// ═══ AL DÍA EL 14/08: EL CRUCE DE LOS EMITIDOS YA NO ES POR IMPORTE ═══
//
// Este archivo se escribió el 30/07 y quedó fuera de main; se recuperó hoy porque cuatro archivos lo
// nombran como la puerta de entrada de los cheques y no existía. Entre medio apareció
// `cheques-debito-banco.mjs`, que sabe leer los cuatro conceptos con los que el Santander anuncia una
// salida de cheque y emparejar por (instrumento, número) + importe.
//
// El cruce original de los emitidos buscaba "algún movimiento por ese importe", y eso da verde falso:
// los cheques 306, 307, 308 y 309 son todos de $317.000 (NEUMAGOM), así que UN movimiento confirmaba
// los cuatro. Un control que confirma cheques que no vio es peor que no tener control.

import { claveCheque } from './cheques-debito-banco.mjs'

/** Importe a la argentina: "1.234,56" / "$ 16.807.425,92" → número. null si no es número. */
export function importe(txt) {
  if (typeof txt === 'number') return Number.isFinite(txt) ? txt : null
  let s = String(txt ?? '').trim()
  if (!s) return null
  const negativo = /^\(.*\)$/.test(s) || /^\s*-/.test(s)
  s = s.replace(/[^\d,.-]/g, '')
  if (!s || !/\d/.test(s)) return null
  // es-AR: punto = miles, coma = decimal. Sin esto "1.234,56" se lee 1.23456 — un número plausible
  // y equivocado, que no da error y deja la cartera mal.
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/-(?!^)/g, ''))
  if (!Number.isFinite(n)) return null
  return negativo ? -Math.abs(n) : n
}

/** "31/07/26" · "31/07/2026" · "2026-07-31" → "YYYY-MM-DD". null si no es fecha. */
export function fecha(txt) {
  const s = String(txt ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/AAAA — nunca MM/DD: todo el Drive es es-AR y leerlo al revés da el día equivocado sin avisar.
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
  if (!m) return null
  const [, d, mes, a] = m
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const TIPOS = ['recibido', 'emitido']

/** Estados que declara el banco, normalizados. No se inventan: si llega otro, se conserva tal cual. */
const ESTADOS = new Map([
  ['en custodia', 'En custodia'], ['custodiado', 'En custodia'],
  ['endoso aceptado', 'Endosado'], ['endosado', 'Endosado'],
  ['aceptado', 'Aceptado'], ['por aceptar', 'Por aceptar'],
  ['pagado', 'Pagado'], ['depositado', 'Depositado'], ['rechazado', 'Rechazado'],
])

/** Minúsculas, sin acentos, espacios colapsados. */
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Sólo dígitos: para comparar un CUIT venga como sea ("30-62031170-3" o "30620311703"). */
export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

/**
 * Problemas que impiden cargar un cheque. Vacío = cargable. Son los mínimos para que la fila sirva:
 * sin número no se puede deduplicar ni cruzar; sin importe no suma; sin tipo no se sabe si entra o sale.
 */
export function validar(c) {
  const p = []
  if (!TIPOS.includes(String(c?.tipo ?? '').trim())) p.push(`tipo inválido: "${c?.tipo}" (recibido|emitido)`)
  if (!String(c?.numero ?? '').trim()) p.push('sin número de cheque')
  const imp = importe(c?.importe)
  if (imp == null) p.push('sin importe numérico')
  else if (imp <= 0) p.push(`importe no positivo: ${imp}`)
  if (!String(c?.estado ?? '').trim()) p.push('sin estado')
  if (!String(c?.origen ?? '').trim()) p.push('sin origen declarado (de qué documento salió)')
  if (!fecha(c?.corte)) p.push('sin corte (a qué fecha es esta foto del estado)')
  if (c?.fecha_pago != null && c.fecha_pago !== '' && !fecha(c.fecha_pago)) p.push(`fecha de pago ilegible: "${c.fecha_pago}"`)
  return p
}

/** Un cheque crudo → la fila que va a la base, con todo normalizado. Asume `validar` en verde. */
export function aFila(c) {
  const est = String(c.estado).trim()
  return {
    tipo: String(c.tipo).trim(),
    // ═══ EL NÚMERO VA NORMALIZADO — 20260821T1100 (21/08) ═══
    // La base guarda «366», el banco imprime «00000366». Sin normalizar acá, el mismo fajo de la
    // pantalla del banco entraba entero como «nuevo» y duplicaba lo que ya estaba: `novedades()` y
    // el índice único comparan el número canónico, no el impreso. Mismo norm() que el sync.
    numero: String(c.numero ?? '').replace(/\D/g, '').replace(/^0+/, '') || String(c.numero).trim(),
    banco: c.banco ? String(c.banco).trim() : null,
    librador: c.librador ? String(c.librador).trim() : null,
    librador_cuit: c.librador_cuit ? soloDigitos(c.librador_cuit) : null,
    contraparte: c.contraparte ? String(c.contraparte).trim() : null,
    contraparte_cuit: c.contraparte_cuit ? soloDigitos(c.contraparte_cuit) : null,
    caracter: c.caracter ? String(c.caracter).trim() : null,
    fecha_pago: c.fecha_pago ? fecha(c.fecha_pago) : null,
    importe: importe(c.importe),
    estado: ESTADOS.get(normalizar(est)) ?? est,
    cuenta: c.cuenta ? String(c.cuenta).trim() : null,
    orden_pago: c.orden_pago ? String(c.orden_pago).trim() : null,
    obra: c.obra ? String(c.obra).trim() : null,
    origen: String(c.origen).trim(),
    corte: fecha(c.corte),
  }
}

/** La clave natural: un banco no emite dos cheques con el mismo número. Misma que el índice único. */
export const clave = (f) => `${f.tipo}|${f.banco ?? ''}|${f.numero}`

/**
 * Qué es nuevo, qué cambió y qué está igual, contra lo que ya hay en la base.
 *
 * Un cheque NO es un hecho inmutable: pasa de "en custodia" a "depositado" a "pagado". Por eso una
 * relectura no es un duplicado a descartar — es una ACTUALIZACIÓN. Distinguirlas importa para poder
 * decir "3 cheques nuevos y 2 que cambiaron de estado" en vez de "5 duplicados".
 */
export function novedades(existentes, filas) {
  const previo = new Map((existentes ?? []).map((e) => [clave(e), e]))
  const nuevos = []; const actualizados = []; const iguales = []
  const vistas = new Set()
  for (const f of filas) {
    const k = clave(f)
    if (vistas.has(k)) { actualizados.push({ fila: f, motivo: 'repetido en el mismo fajo (gana el último)' }); continue }
    vistas.add(k)
    const ant = previo.get(k)
    if (!ant) { nuevos.push(f); continue }
    const cambios = []
    for (const campo of ['estado', 'fecha_pago', 'importe', 'orden_pago', 'obra']) {
      const a = ant[campo] ?? null; const b = f[campo] ?? null
      const igual = campo === 'importe' ? Number(a) === Number(b)
        : campo === 'fecha_pago' ? String(a ?? '').slice(0, 10) === String(b ?? '').slice(0, 10)
          : String(a ?? '') === String(b ?? '')
      if (!igual) cambios.push(`${campo}: ${a ?? '—'} → ${b ?? '—'}`)
    }
    if (cambios.length) actualizados.push({ fila: f, motivo: cambios.join(' · ') })
    else iguales.push(f)
  }
  return { nuevos, actualizados, iguales }
}

/**
 * EL CONTROL. Una orden de pago declara un total; la suma de sus cheques tiene que darlo. Si no
 * cierra, falta un cheque o hay un importe mal leído — y un cheque que falta no da error, da una
 * cartera equivocada. Tolerancia de 1 centavo por redondeo del documento.
 *
 * `otros` son los componentes de la O/P que NO son cheques (retenciones, transferencias): la O/P los
 * lista aparte y su total incluye todo.
 */
export function verificarOrdenPago({ total, cheques = [], otros = [] }) {
  const sumaCheques = cheques.reduce((s, c) => s + (importe(c.importe ?? c) ?? 0), 0)
  const sumaOtros = otros.reduce((s, o) => s + (importe(o.importe ?? o) ?? 0), 0)
  const declarado = importe(total)
  const calculado = Math.round((sumaCheques + sumaOtros) * 100) / 100
  const dif = declarado == null ? null : Math.round((declarado - calculado) * 100) / 100
  return {
    cierra: dif != null && Math.abs(dif) <= 0.01,
    declarado, calculado, diferencia: dif,
    suma_cheques: Math.round(sumaCheques * 100) / 100,
    suma_otros: Math.round(sumaOtros * 100) / 100,
  }
}

/**
 * EL CRUCE DE LOS EMITIDOS: cada cheque que el fajo declara PAGADO, ¿está en el extracto?
 *
 * Pregunta invertida respecto de `conciliarDebitosDeCheques`, que recorre movimientos: acá se recorren
 * los cheques, porque lo que hay que verificar es lo que el fajo AFIRMA. Un cheque declarado Pagado
 * sin salida en el extracto es un dato que todavía no se puede creer.
 *
 * Un movimiento explica UN cheque, no cuatro: el índice es por (instrumento, número), no por importe.
 *
 * @param {Array<{instrumento?:string, numero:unknown, importe:number, estado?:string}>} cheques
 * @param {Array<object>} conciliacion resultados de `conciliarDebitosDeCheques`
 * @returns {Array<{cheque:object, movimiento:object|null}>}
 */
export function cruceEmitidos(cheques = [], conciliacion = []) {
  const porClave = new Map()
  for (const r of conciliacion) {
    if (r?.estado === 'emparejado' && r.clave && !porClave.has(r.clave)) porClave.set(r.clave, r.mov)
  }
  return cheques.map((c) => ({ cheque: c, movimiento: porClave.get(claveCheque(c)) ?? null }))
}

/** Cartera por estado: lo que se puede sumar sin contar el mismo cheque dos veces. */
export function cartera(filas) {
  const out = new Map()
  for (const f of filas) {
    const k = `${f.tipo}·${f.estado}`
    const a = out.get(k) ?? { tipo: f.tipo, estado: f.estado, cantidad: 0, importe: 0 }
    a.cantidad++; a.importe = Math.round((a.importe + Number(f.importe)) * 100) / 100
    out.set(k, a)
  }
  return [...out.values()].sort((a, b) => b.importe - a.importe)
}
