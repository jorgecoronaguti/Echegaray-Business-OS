// CARGA DE COMPROBANTES A LA PESTAÑA "Compras" — NÚCLEO PURO.
//
// POR QUÉ EXISTE (22/07). El dueño saca foto a cada comprobante y necesita que quede plasmado en la
// celda que corresponde de Compras, respetando lo que cada columna implica (desplegable estricto,
// formato, fórmula) y sin que nada quede suelto: un comprobante bien cargado se propaga solo al Cash
// Flow, a Proveedores, a Cheques y a Tarjeta porque esos cruces ya son fórmulas ABIERTAS sobre
// Compras. Este archivo decide QUÉ escribe la foto y qué NO se toca.
//
// EL CONTRATO DE COLUMNAS (leído del Sheet vivo el 22/07, no supuesto):
//   - DEL COMPROBANTE (las saca la foto): B categoría, C fecha, E proveedor, G tipo, H N°,
//     L concepto, M neto, N IVA, y F/X/S deducidas de la CONDICIÓN DE VENTA de la propia factura.
//   - AUTOMÁTICAS por fórmula por-fila (se ESTAMPAN copiando de la última fila, no se tipean):
//     A id, D mes, O total, Q/R fecha prevista, Y devengado, AA estado visual, AH/AI orden de pago.
//   - AUTOMÁTICAS por ARRAYFORMULA desde la fila 4 (NUNCA se escriben): AC rubro de caja,
//     AD fecha de caja, AE familia de material, AF sub-rubro, AJ ¿proveedor comercial?
//   - LAS COMPLETA EL DUEÑO (se dejan vacías, respetando su desplegable): I unidad de negocio,
//     J obra, K detalle/obra. Y Z tipo de costo.
//
// NO FABRICA DATOS: si la foto no dice la forma de pago (P), se deja vacía. Si el proveedor no está
// en la lista estricta, se marca como nuevo y NO se inventa una variante.

/** Columnas de Compras por rol. Índice 0 = A. Es contrato con el Sheet vivo. */
export const COL = {
  id: 'A', categoria: 'B', fecha: 'C', mes: 'D', proveedor: 'E', modalidad: 'F', tipo: 'G',
  numero: 'H', unidad: 'I', obra: 'J', detalle: 'K', concepto: 'L', neto: 'M', iva: 'N', total: 'O',
  formaPago: 'P', prevDia: 'Q', prevMes: 'R', totalParcial: 'S', pagado: 'T', parcial1: 'U',
  prevFecha2: 'V', parcial2: 'W', estado: 'X', devengado: 'Y', tipoCosto: 'Z', estadoVisual: 'AA',
  estadoCarga: 'AB', rubroCaja: 'AC', fechaCaja: 'AD', familia: 'AE', subRubro: 'AF',
  ordenPago: 'AH', ordenSinFecha: 'AI', comercial: 'AJ',
}

/** Columnas que se llenan desde la foto/condición. El resto se estampa, se deriva o lo pone el dueño. */
export const COL_INPUT = ['categoria', 'fecha', 'proveedor', 'modalidad', 'tipo', 'numero', 'concepto', 'neto', 'iva', 'formaPago', 'totalParcial', 'pagado', 'estado']

/** Grupos contiguos de columnas con fórmula POR FILA, para copiarlas con PASTE_FORMULA de la última
 *  fila a las nuevas. Las ARRAYFORMULA (AC/AD/AE/AF/AJ) NO están: bajan solas desde la fila 4. */
export const GRUPOS_FORMULA = [['A', 'A'], ['D', 'D'], ['O', 'O'], ['Q', 'R'], ['Y', 'Y'], ['AA', 'AA'], ['AH', 'AI']]

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

/** Redondea a 2 decimales sin arrastrar el error binario de la resta Total−IVA (28479.30 - 5981). */
export function redondear2(n) {
  return n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Diferencia (en $) entre lo que dice el comprobante (Total) y lo que sumaría el neto declarado por la
 * foto (Neto Gravado + IVA). Distinta de 0 ⇒ hay una PERCEPCIÓN (IIBB, SUSS) o un IMPUESTO INTERNO
 * (combustible) que la foto no absorbió en el "neto gravado": son costo real, parte del Total, pero no
 * son IVA. Es exactamente la causa de la carga MAL hecha: si M se cargara con ese neto crudo, O = M+N
 * quedaría corto y el total del Sheet no cerraría con la plata que salió. Devuelve null si no se puede
 * comparar (falta el neto o el total declarados). El loader la usa para AVISAR; valoresInput ya corrige
 * derivando M = Total − IVA cuando la foto trae el total. */
export function discrepanciaNeto(c) {
  const neto = aNumero(c?.neto)
  const total = aNumero(c?.total)
  if (neto == null || total == null) return null
  const iva = aNumero(c?.iva) ?? 0
  const dif = redondear2(total - iva - neto)
  return Math.abs(dif) >= 0.5 ? dif : null // < $0,50 = redondeo del comprobante, no una percepción
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
  const iva = aNumero(c.iva)
  const totalDeclarado = aNumero(c.total)
  // M (columna Importe) POR CONTRATO = Total − IVA. Absorbe percepción IIBB/SUSS e impuestos internos
  // de combustible para que O = M+N sea el Total REAL del comprobante. Si la foto trae el total —el
  // número más grande y prominente del ticket, el que tiene que cerrar con la plata que salió— M se
  // DERIVA de él; sólo si no hay total se usa el neto crudo de la foto. Así un "neto gravado" que no
  // incluye la percepción no rompe el total (era la causa de las cargas MAL hechas).
  const neto = totalDeclarado != null ? redondear2(totalDeclarado - (iva ?? 0)) : aNumero(c.neto)
  const total = totalDeclarado ?? (neto != null ? redondear2(neto + (iva ?? 0)) : null)
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
  set('totalParcial', c.totalParcial ?? pago.totalParcial)
  set('estado', estado)
  // IMPUTACIÓN: sólo se escribe lo que venga explícito (la anotación del dueño en el comprobante).
  // Nunca se infiere una obra o una unidad de negocio: si no está, la completa él y AC/AE clasifican.
  set('unidad', c.unidad)
  set('obra', c.obra)
  set('detalle', c.detalle)
  // Si quedó pagada al contado, lo pagado es el total; en cuenta corriente pendiente, no hay pago aún.
  if (estado === 'Pagado' && total != null) set('pagado', total)
  return out
}
