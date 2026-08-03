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

// ═══ VERIFICACIÓN DEL EFECTO (03/08) — el log no puede felicitar sin haber escrito ═══
//
// EL DEFECTO MEDIDO. El cargador imprimía "✔ Escritas 7 fila(s). Sin #ERROR." después de que la guarda
// descartara la escritura entera: las filas 800..806 quedaron VACÍAS. El chequeo que existía —buscar
// #ERROR en lo releído— no podía detectarlo: un rango vacío no tiene errores. "Sin errores" sobre la nada
// es la forma más cara de mentir, porque el siguiente paso (sync a Supabase, conciliación) da por hecho
// que el comprobante está cargado.
//
// LA REGLA. Lo que prueba una escritura es el DATO LEÍDO EN SU DESTINO, nunca la respuesta de la API.
// Estas dos funciones son puras: comparan lo que se quiso escribir contra lo que se releyó.

/** Letra de columna → índice 0. 'A'→0, 'AA'→26. Contrato con el orden de columnas de readSheetGrid. */
export function colIndice(letra) {
  let n = 0
  for (const ch of String(letra).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * ¿La celda del Sheet dice lo mismo que se quiso escribir? No es igualdad de strings: el Sheet devuelve
 * el valor FORMATEADO en es-AR, así que 23540.5 vuelve como "$ 23.540,50" y una fecha como "22/07/2025".
 * Comparar crudo daría falsos negativos en cada fila; comparar laxo no verificaría nada. El orden es:
 * texto normalizado → fecha → número con tolerancia de centavo. Una celda VACÍA nunca coincide: es
 * justamente el caso que hay que cazar.
 */
export function mismoValor(esperado, encontrado) {
  const a = String(esperado ?? '').trim(); const b = String(encontrado ?? '').trim()
  if (!b) return false
  if (normalizar(a) === normalizar(b)) return true
  const fa = aFechaAR(a); const fb = aFechaAR(b)
  if (fa && fb) return fa === fb
  // El número esperado se compara SIN pasar por su string: `aNumero` lee es-AR (punto = miles), así que
  // el 28479.3 de JavaScript, stringificado, se leería como 284.793. El valor leído sí viene formateado.
  const na = typeof esperado === 'number' ? esperado : aNumero(a)
  const nb = aNumero(b)
  if (na != null && nb != null) return Math.abs(na - nb) < 0.01
  return false
}

/**
 * Contrasta lo que el cargador quiso escribir contra lo que quedó en la pestaña.
 *
 * @param {Array<{[letra:string]: any}>} valoresPorFila lo que se quiso escribir (valoresInput por fila)
 * @param {Array<Array<{valor?:any}>>} filasLeidas grid releído del bloque, la primera columna es A
 * @param {{desde:number}} p fila real (1-based) de la primera fila del bloque, sólo para el informe
 * @returns {{ok:boolean, vacias:object[], distintas:object[]}} vacías = no se escribió NADA ahí
 */
export function verificarEscritura(valoresPorFila = [], filasLeidas = [], { desde = 1 } = {}) {
  const vacias = []; const distintas = []
  valoresPorFila.forEach((valores, k) => {
    const fila = desde + k
    const leida = filasLeidas[k] || []
    for (const [letra, esperado] of Object.entries(valores || {})) {
      if (esperado == null || esperado === '') continue // no se pidió escribir nada acá
      // EL NÚMERO CRUDO ANTES QUE EL MOSTRADO. La celda viene con las dos caras: `numero` es lo que
      // Google guardó y `valor` es cómo lo dibuja el formato. En Compras el formato es moneda sin
      // decimales, así que 54447,71 se MUESTRA "$ 54.448" — y comparar contra eso daba una
      // diferencia de 29 centavos y un ROJO FALSO en toda carga correcta. Verificado el 03/08/2026:
      // las 7 filas estaban perfectas en el destino y el script las declaró no escritas.
      const celda = leida[colIndice(letra)]
      const encontrado = (typeof esperado === 'number' && typeof celda?.numero === 'number')
        ? celda.numero
        : (celda?.valor ?? '')
      if (String(encontrado).trim() === '') vacias.push({ fila, columna: letra, esperado })
      else if (!mismoValor(esperado, encontrado)) distintas.push({ fila, columna: letra, esperado, encontrado })
    }
  })
  return { ok: !vacias.length && !distintas.length, vacias, distintas }
}
