// CARGA DE COMPROBANTES A LA PESTAÑA "Compras" — NÚCLEO PURO.
//
// POR QUÉ EXISTE (22/07). El dueño saca foto a cada comprobante y necesita que quede plasmado en la
// celda que corresponde de Compras, respetando lo que cada columna implica (desplegable estricto,
// formato, fórmula) y sin que nada quede suelto: un comprobante bien cargado se propaga solo al Cash
// Flow, a Proveedores, a Cheques y a Tarjeta porque esos cruces ya son fórmulas ABIERTAS sobre
// Compras. Este archivo decide QUÉ escribe la foto y qué NO se toca.
//
// EL CONTRATO DE COLUMNAS (RELEÍDO del Sheet vivo el 23/07 contra el encabezado real de la fila 3.
// La cola de la pestaña se corrió una columna respecto de lo que este archivo declaraba el 22/07:
// mapear SIEMPRE por nombre de encabezado, nunca por posición recordada):
//   - DEL COMPROBANTE (las saca la foto): B categoría, C fecha, E proveedor, G tipo, H N°,
//     L concepto, M neto, N IVA, y F/X/S deducidas de la CONDICIÓN DE VENTA de la propia factura.
//     Q fecha prevista de pago SÓLO si el comprobante la declara (un tique pagado en efectivo trae
//     su propia fecha de caja); si no, se deja vacía — la decide el dueño, no se copia de otra fila.
//   - AUTOMÁTICAS por fórmula POR FILA (se ESTAMPAN copiando de la última fila, no se tipean):
//     A id, D mes, O total, R mes previsto, T monto pagado, U monto parcial 1, Z estado pago,
//     AG/AH orden de pago, AI orden sin fecha.
//   - AUTOMÁTICAS por ARRAYFORMULA desde la fila 4 (NUNCA se escriben): AB y AC rubro de caja,
//     AD fecha de caja, AE familia de material, AF sub-rubro, AJ ¿proveedor comercial?
//   - LAS COMPLETA EL DUEÑO (se dejan vacías, respetando su desplegable): I unidad de negocio,
//     J cliente/asignación, K detalles/obra. Y también Y tipo de costo.
//
// NO FABRICA DATOS: si la foto no dice la forma de pago (P), se deja vacía. Si el proveedor no está
// en la lista estricta, se marca como nuevo y NO se inventa una variante. Y T (monto pagado) NUNCA
// se escribe como número: es la fórmula =IF(F="pago";O;0) — pegarle un valor la rompe en silencio.

/** Columnas de Compras por rol. Índice 0 = A. Contrato con el encabezado real (fila 3) del Sheet. */
export const COL = {
  id: 'A', categoria: 'B', fecha: 'C', mes: 'D', proveedor: 'E', modalidad: 'F', tipo: 'G',
  numero: 'H', unidad: 'I', obra: 'J', detalle: 'K', concepto: 'L', neto: 'M', iva: 'N', total: 'O',
  formaPago: 'P', prevDia: 'Q', prevMes: 'R', totalParcial: 'S', pagado: 'T', parcial1: 'U',
  prevFecha2: 'V', parcial2: 'W', estado: 'X', tipoCosto: 'Y', estadoVisual: 'Z',
  estadoCarga: 'AA', rubroCaja: 'AB', rubroCaja2: 'AC', fechaCaja: 'AD', familia: 'AE',
  subRubro: 'AF', ordenPago: 'AG', ordenPago2: 'AH', ordenSinFecha: 'AI', comercial: 'AJ',
}

/** Columnas que se llenan desde la foto/condición. El resto se estampa, se deriva o lo pone el dueño. */
export const COL_INPUT = ['categoria', 'fecha', 'proveedor', 'modalidad', 'tipo', 'numero', 'concepto', 'neto', 'iva', 'formaPago', 'prevDia', 'totalParcial', 'estado']

/** Grupos contiguos de columnas con fórmula POR FILA, para copiarlas con PASTE_FORMULA de la última
 *  fila a las nuevas. Las ARRAYFORMULA (AB/AC/AD/AE/AF/AJ) NO están: bajan solas desde la fila 4.
 *  Q tampoco: no es fórmula sino un valor que decide el dueño — copiarlo inventaría una fecha de pago. */
export const GRUPOS_FORMULA = [['A', 'A'], ['D', 'D'], ['O', 'O'], ['R', 'R'], ['T', 'U'], ['Z', 'Z'], ['AG', 'AI']]

const TIPOS = { A: 'F A', B: 'F B', C: 'F C', NC: 'N C', 'N/A': 'N/A' }

/** Letra de comprobante → valor exacto del desplegable G. Devuelve null si no lo reconoce. */
export function tipoComprobante(letra) {
  if (letra == null) return null
  const k = String(letra).toUpperCase().replace(/^(FACTURA|FAC|F)\s*/, '').replace(/^NOTA\s*(DE\s*)?CR[ÉE]DITO.*/, 'NC').trim()
  return TIPOS[k] ?? TIPOS[String(letra).toUpperCase().trim()] ?? null
}

/** Condición de venta de la factura → modalidad (F), estado (X) y total/parcial (S).
 *  Contado = pagada; Cuenta Corriente = pendiente. Es lo único que la foto declara sobre el pago. */
export function condicionAPago(condicion) {
  const c = normalizar(condicion)
  if (/cuenta corriente|cta cte|cta corriente|c\/c/.test(c)) return { modalidad: 'Cuenta Corriente', estado: 'Pendiente', totalParcial: 'Total' }
  if (/contado|efectivo|contra ?entrega|pagad/.test(c)) return { modalidad: 'Pago', estado: 'Pagado', totalParcial: 'Total' }
  return { modalidad: null, estado: null, totalParcial: null } // no declarada: no se inventa
}

/** Minúsculas, sin acentos, espacios colapsados. Para comparar nombres sin cruzarlos por tilde. */
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Matchea el proveedor de la foto contra la lista ESTRICTA del desplegable E. Nunca inventa: si no
 *  hay match razonable, lo marca nuevo con el nombre tal cual, para que el dueño decida agregarlo. */
export function matchProveedor(ocrNombre, lista) {
  const n = normalizar(ocrNombre)
  if (!n) return { valor: '', esNuevo: false, motivo: 'sin nombre' }
  const exacto = lista.find((p) => normalizar(p) === n)
  if (exacto) return { valor: exacto, esNuevo: false }
  const contiene = lista.find((p) => { const np = normalizar(p); return np.includes(n) || n.includes(np) })
  if (contiene && Math.min(n.length, normalizar(contiene).length) >= 4) return { valor: contiene, esNuevo: false, motivo: 'parcial' }
  return { valor: String(ocrNombre).trim(), esNuevo: true }
}

/** Un importe de la foto → número. Acepta "$28.479,30" (es-AR) o número JS. null si no es número. */
export function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d.,-]/g, '')
  if (!s) return null
  // es-AR: punto = miles, coma = decimal.
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Fecha a "DD/MM/YYYY" (lo que un sheet es-AR parsea a fecha con USER_ENTERED). Acepta Date o
 *  string dd/mm/aaaa o aaaa-mm-dd. null si no la puede interpretar. */
export function aFechaAR(v) {
  if (v instanceof Date && !isNaN(v)) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}` }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`
  return null
}

/** Dígitos significativos del N° de comprobante, sin ceros de relleno en cada tramo.
 *  "0004-00003600" y "4-3600" y "00004-00003600" dan todos "4-3600". Así la misma factura escrita
 *  con distinto relleno no se cuenta dos veces. */
export function claveNumero(n) {
  const tramos = String(n ?? '').split(/[^0-9]+/).filter(Boolean).map((t) => t.replace(/^0+/, '') || '0')
  return tramos.join('-')
}

/**
 * Índice de lo YA CARGADO en la pestaña Compras, para no cargar dos veces el mismo comprobante.
 * Dos claves independientes, porque ninguna sola alcanza:
 *   - proveedor + N° de comprobante → la identidad fiscal de la factura;
 *   - proveedor + fecha + importe total → atrapa la misma factura cargada con el N° escrito distinto
 *     (o sin N°, como pasa con los remitos y las N/A).
 * @param {(string|number)[][]} filas valores crudos de `Compras!A1:AN` (índice 0 = fila 1)
 */
export function indiceCompras(filas) {
  const col = (r, L) => r[[...L].reduce((c, ch) => c * 26 + (ch.charCodeAt(0) - 64), 0) - 1]
  const porNumero = new Map(); const porImporte = new Map()
  filas.forEach((r, i) => {
    const prov = normalizar(col(r, COL.proveedor))
    if (!prov) return
    const num = claveNumero(col(r, COL.numero))
    const tot = aNumero(col(r, COL.total))
    const fecha = aFechaAR(col(r, COL.fecha))
    const ref = { fila: i + 1, proveedor: col(r, COL.proveedor), numero: col(r, COL.numero), fecha: col(r, COL.fecha), total: tot }
    if (num && !porNumero.has(`${prov}|${num}`)) porNumero.set(`${prov}|${num}`, ref)
    if (tot != null && fecha && !porImporte.has(`${prov}|${fecha}|${tot.toFixed(2)}`)) porImporte.set(`${prov}|${fecha}|${tot.toFixed(2)}`, ref)
  })
  return {
    /** @returns {{fila:number,motivo:string}|null} dónde ya está cargado, o null si no está */
    buscar(c) {
      const prov = normalizar(c.proveedor)
      const num = claveNumero(c.numero)
      const porNum = num ? porNumero.get(`${prov}|${num}`) : null
      if (porNum) return { ...porNum, motivo: 'mismo proveedor y N° de comprobante' }
      const neto = aNumero(c.neto); const iva = aNumero(c.iva)
      const tot = aNumero(c.total) ?? (neto != null ? neto + (iva ?? 0) : null)
      const fecha = aFechaAR(c.fecha)
      const porImp = tot != null && fecha ? porImporte.get(`${prov}|${fecha}|${tot.toFixed(2)}`) : null
      if (porImp) return { ...porImp, motivo: 'mismo proveedor, fecha e importe total' }
      return null
    },
  }
}

/**
 * Problemas que impiden cargar un comprobante. Vacío = cargable. NO es una opinión de negocio:
 * son los mínimos para que las fórmulas y los cruces funcionen (fecha, proveedor, un importe).
 */
export function validar(c) {
  const p = []
  if (!aFechaAR(c.fecha)) p.push('fecha ilegible o ausente')
  if (!normalizar(c.proveedor)) p.push('sin proveedor')
  if (aNumero(c.neto) == null && aNumero(c.total) == null) p.push('sin importe numérico')
  if (c.tipo && !tipoComprobante(c.tipo)) p.push(`tipo de comprobante no reconocido: "${c.tipo}"`)
  return p
}

/**
 * Traduce un comprobante parseado (de la foto) a los VALORES de las columnas de input, ya
 * normalizados a lo que el desplegable/formato de cada celda espera. No incluye fórmulas ni las
 * columnas que completa el dueño. `proveedor` ya debe venir resuelto contra la lista (matchProveedor).
 *
 * @returns {{[letra:string]: string|number}} letra de columna → valor a escribir
 */
export function valoresInput(c) {
  const pago = condicionAPago(c.condicion)
  const neto = aNumero(c.neto)
  const iva = aNumero(c.iva)
  const estado = c.estado ?? pago.estado
  const out = {}
  const set = (k, v) => { if (v != null && v !== '') out[COL[k]] = v }
  set('categoria', c.categoria)
  set('fecha', aFechaAR(c.fecha))
  set('proveedor', c.proveedor)
  set('modalidad', c.modalidad ?? pago.modalidad)
  set('tipo', tipoComprobante(c.tipo))
  set('numero', c.numero != null ? String(c.numero) : null)
  set('concepto', c.concepto)
  set('neto', neto)
  set('iva', iva)
  set('formaPago', c.formaPago) // sólo si la foto lo dice; si no, vacío (no se inventa)
  // Q — fecha prevista de pago. Sólo si el propio comprobante la declara (un tique pagado en el
  // acto trae su fecha de caja). Si no, vacía: la decide el dueño. AD (fecha de caja) deriva de Q.
  set('prevDia', c.fechaPago ? aFechaAR(c.fechaPago) : null)
  set('totalParcial', c.totalParcial ?? pago.totalParcial)
  set('estado', estado)
  // IMPUTACIÓN: sólo se escribe lo que venga explícito (la anotación del dueño en el comprobante).
  // Nunca se infiere una obra o una unidad de negocio: si no está, la completa él y AC/AE clasifican.
  set('unidad', c.unidad)
  set('obra', c.obra)
  set('detalle', c.detalle)
  // T (Monto Pagado) NO se escribe: en el Sheet vivo es la fórmula =IF(F="pago";O;0). El estado de
  // pago sale de F/X; pegarle un número la reemplazaría por un valor muerto.
  return out
}
