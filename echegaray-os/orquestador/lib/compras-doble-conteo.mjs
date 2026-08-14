// UNA COMPRA QUE EL BANCO YA PAGÓ Y EL SHEET SIGUE PROMETIENDO PARA MAÑANA. NÚCLEO PURO, SIN RED NI BASE.
//
// ═══ POR QUÉ EXISTE (14/08) ═══
//
// Medido en vivo sobre el extracto del 14/08. La fila 844 de Compras —Trielec, $2.205.400,34, tipo de
// pago "Débito", estado "Pagado"— tiene la Fecha de caja en 15/08. El banco la debitó el 12/08, o sea
// ANTES del corte del extracto (13/08). Resultado: el saldo de _BANCO_RAW ya viene con esos
// $2.205.400 descontados, y encima `formulaComprasPagadasPosteriores` los vuelve a restar porque su
// condición es `Fecha de caja > corte`. La misma plata sale dos veces del cuadro de disponibilidades.
//
// No da ningún error. La caja queda $2,2M más baja de lo que es, y esa cifra es la que decide qué se
// paga esta semana.
//
// ═══ EL IMPORTE ENCUENTRA, EL NOMBRE CORROBORA — Y HACEN FALTA LOS DOS ═══
//
// El importe es el mismo número en los dos lados por construcción: sale de la misma factura. Por eso
// es lo que BUSCA. La tolerancia es de CINCO CENTAVOS y no de cero, porque el Sheet guarda
// $2.205.400,34 y el banco debitó $2.205.400,33: un centavo de redondeo del IVA no puede hacer que el
// control no vea el problema. Más ancha que eso empezaría a emparejar facturas distintas.
//
// PERO EL IMPORTE SOLO NO ALCANZA, Y ESTÁ MEDIDO. La primera versión de este control cruzaba sólo por
// importe y devolvió 19 "hallazgos" por $9,4M: cargas de combustible de $100.000 redondos emparejadas
// con otras cargas de $100.000 redondos, y una con "Impuesto ley 25.413 credito 0,6%" de −$60.000.
// Basura. Y un control que grita de más no se lee — que es la peor forma de perderlo.
//
// Por eso el nombre del proveedor tiene que aparecer en el concepto del banco. Es la misma disciplina
// que usa `cheques-debito-banco.mjs` al revés: allá el número encuentra y el importe corrobora; acá el
// importe encuentra y el nombre corrobora. Si no corrobora, el movimiento NO es esta compra —ni
// siquiera cuando es el único de ese importe—.
//
// LO QUE ESTO DEJA PASAR, DECLARADO: cuando el banco nombra al procesador y no al comercio
// ("Merpago*dupe" por Dupec, "Appypf" por Combustibles Barcelo), la corroboración falla y la fila no
// se reporta. Es deliberado: preferir un falso negativo silencioso a un falso positivo ruidoso, porque
// el falso positivo se lleva puesto al control entero.
//
// ═══ ESTO ALERTA, NO CORRIGE ═══
//
// Dos compras del mismo importe redondo el mismo mes existen ($100.000 de combustible se repite), así
// que un emparejamiento por importe es un CANDIDATO, no un hecho. Por eso cada hallazgo viaja con el
// movimiento del banco que lo motiva —fecha, concepto y referencia— para que quien mire decida. Un
// control que corrige solo sobre una coincidencia probable ya duplicó $2,1M en este repo.
//
// NO ESCRIBE NADA. Devuelve el diagnóstico; la fila de Compras es del dueño.

/** Los medios de pago que `formulaComprasPagadasPosteriores` resta del banco. Fuera de esta lista,
 *  una compra posterior al corte NO toca la disponibilidad bancaria y no hay doble conteo posible. */
export const MEDIOS_BANCARIOS = ['Transferencia', 'Débito']

/** El medio que descarga la caja FÍSICA (el espejo de la lista de arriba, del otro lado de la
 *  partición). Una compra marcada así pero debitada por el banco baja los dos canales a la vez. */
export const MEDIO_EFECTIVO = 'Efectivo'

const centavos = (n) => Math.round(Math.abs(Number(n) || 0) * 100)

/** Cinco centavos, en centavos enteros: la aritmética con floats no decide una igualdad de plata. */
const TOLERANCIA = 5

/**
 * "15/8/2026" · "2026-08-15" · 46252 (serie de Sheets) → "YYYY-MM-DD". Null si no se puede afirmar.
 *
 * LA SERIE TAMBIÉN, PORQUE LA COLUMNA VIENE MIXTA. La "Fecha de caja" de Compras tiene unos valores
 * tipeados como texto y otros como número de serie —es el mismo formato mixto que obligó a
 * `fechaCajaCoerc` a usar SUMPRODUCT en vez de SUMIFS—. Leer sólo uno de los dos formatos deja la
 * mitad de las filas fuera del control sin decir una palabra.
 */
export function aISO(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Época de Sheets: el día 0 es el 30/12/1899. Se arma en UTC para que no lo corra el huso.
    const ms = Date.UTC(1899, 11, 30) + Math.trunc(v) * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return s.slice(0, 10)
  // dd/mm/aaaa — nunca mm/dd: el archivo entero es es-AR y leerlo al revés da el día equivocado
  // sin avisar, que es justo el modo de falla que este control tiene que atrapar, no cometer.
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
  if (!m) return null
  const [, d, mes, a] = m
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Un importe del Sheet: puede venir como número o como "$ 2.205.400,34". Null si no es plata. */
export function aNumero(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (!s || !/\d/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Corre una fecha ISO N días. Sirve para la ventana de plausibilidad del pago. */
function correr(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * El nombre listo para comparar: sin tildes, en mayúsculas, sin la forma societaria (SA/SRL/SAS).
 * Misma normalización que `banco-santander.normProveedor` — el banco escribe "Trielec sa" y Compras
 * "Trielec", y la forma societaria no distingue a nadie.
 */
export function normNombre(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\bS\.?\s?A\.?\s?S\.?\b|\bS\.?\s?A\.?\b|\bS\.?R\.?L\.?\b/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/**
 * Palabras que no identifican a NADIE, y por eso no pueden corroborar un emparejamiento.
 *
 * Dos clases, y las dos hicieron daño medido:
 *   · el andamiaje del concepto bancario ("Compra con tarjeta de debito - … - tarj nro. 8866");
 *   · la palabra que nombra la MERCADERÍA y no al vendedor. "Combustibles Barcelo" contra
 *     "Appypf 2660 combustibles" corroboraba por la palabra `COMBUSTIBLES` y emparejaba siete cargas
 *     de $100.000 redondos con estaciones distintas. Sacándola queda `BARCELO`, que sí distingue.
 */
const VACIAS = new Set(['COMPRA', 'CON', 'TARJETA', 'DEBITO', 'CREDITO', 'TARJ', 'NRO', 'PAGO', 'DE',
  'A', 'TRANSFERENCIA', 'INMEDIATA', 'ONLINE', 'BANKING', 'EMP', 'SERVICIOS', 'AUTOMATICO', 'DEL',
  'COMBUSTIBLE', 'COMBUSTIBLES'])

/**
 * NÚCLEO PURO: ¿el concepto del banco nombra a este proveedor?
 *
 * Alcanza con UN token significativo (≥4 letras) del proveedor que aparezca como PREFIJO de alguna
 * palabra del concepto. El prefijo —y no la igualdad— porque el Sheet dice "Pintureria Cordoba" y el
 * banco "Pinturerias cordoba": una `s` de plural no puede decidir si hay doble conteo de $426.219.
 */
export function nombreCorrobora(proveedor, concepto) {
  const tokens = normNombre(proveedor).split(' ').filter((t) => t.length >= 4 && !VACIAS.has(t))
  if (!tokens.length) return false
  const palabras = normNombre(concepto).split(' ').filter(Boolean)
  return tokens.some((t) => palabras.some((p) => p.startsWith(t) || t.startsWith(p)))
}

/**
 * NÚCLEO PURO: los débitos del banco que son ESTA compra.
 *
 * Cuatro condiciones, todas necesarias:
 *   · el importe coincide dentro de la tolerancia (sale de la misma factura);
 *   · el concepto del banco NOMBRA al proveedor (ver el bloque de arriba: sin esto el control es ruido);
 *   · el débito es del corte para atrás — de lo contrario el saldo todavía no lo trae y no hay
 *     doble conteo, sino la resta legítima que la fórmula existe para hacer;
 *   · el débito cae en una ventana plausible alrededor del comprobante. Sin ella, una compra de
 *     $200.000 emparejaría con un pago de $200.000 al mismo proveedor de dos meses antes.
 *
 * @param {{importe:number, proveedor?:string, fechaComprobante:string|null}} compra
 * @param {{fecha:string, concepto?:string, importe:number, referencia?:unknown}[]} debitos
 * @param {{corte:string, diasAntes?:number, diasDespues?:number}} v
 */
export function debitosCompatibles(compra, debitos = [], { corte, diasAntes = 3, diasDespues = 45 } = {}) {
  const objetivo = centavos(compra?.importe)
  if (!objetivo) return []
  const base = compra?.fechaComprobante ?? null
  const desde = base ? correr(base, -diasAntes) : null
  const hasta = base ? correr(base, diasDespues) : null
  return debitos.filter((m) => {
    if (Number(m?.importe) >= 0) return false
    if (Math.abs(centavos(m.importe) - objetivo) > TOLERANCIA) return false
    const f = String(m?.fecha ?? '').slice(0, 10)
    if (!f || f > corte) return false
    if (desde && (f < desde || f > hasta)) return false
    return nombreCorrobora(compra?.proveedor, m?.concepto)
  })
}

/**
 * NÚCLEO PURO: el veredicto de una compra contra el extracto ya cargado.
 *
 * Devuelve `null` cuando no hay nada que decir. Cuando hay, `motivo` distingue los dos daños, que no
 * son el mismo y no se arreglan igual:
 *   · 'doble_conteo_banco'   — medio bancario y Fecha de caja posterior al corte: CAJA resta de nuevo
 *                              plata que el saldo del banco ya descontó.
 *   · 'medio_efectivo_pero_salio_del_banco' — la fila dice Efectivo y el banco la debitó: baja la caja
 *                              física por un billete que nunca salió del cajón, y además ya bajó el banco.
 *
 * @param {{fila:number, proveedor?:string, importe:number, medioPago?:string, estado?:string,
 *          fechaCaja:string|null, fechaComprobante:string|null}} compra
 * @param {object[]} debitos movimientos negativos del extracto ya cargado
 * @param {{corte:string}} v
 */
export function evaluarCompra(compra, debitos = [], { corte } = {}) {
  if (String(compra?.estado ?? '').trim() !== 'Pagado') return null
  const medio = String(compra?.medioPago ?? '').trim()
  const esBancario = MEDIOS_BANCARIOS.includes(medio)
  const esEfectivo = medio === MEDIO_EFECTIVO
  if (!esBancario && !esEfectivo) return null

  const candidatos = debitosCompatibles(compra, debitos, { corte })
  if (!candidatos.length) return null

  // El medio bancario sólo hace daño si la fórmula lo va a contar: su condición es `Fecha de caja >
  // corte`. Con la fecha bien puesta (≤ corte) la fila queda fuera del SUMPRODUCT y no duplica nada.
  if (esBancario) {
    const fc = compra?.fechaCaja
    if (!fc || fc <= corte) return null
    return { ...compra, motivo: 'doble_conteo_banco', candidatos, monto: Number(compra.importe) || 0 }
  }
  // El efectivo duplica SIEMPRE que el banco lo haya debitado, sin importar la fecha: son dos canales
  // distintos (caja física y banco) y la partición asume que un peso cae en uno solo.
  return { ...compra, motivo: 'medio_efectivo_pero_salio_del_banco', candidatos, monto: Number(compra.importe) || 0 }
}

/**
 * NÚCLEO PURO: auditar todas las compras contra el extracto.
 * @returns {{hallazgos:object[], montoDobleConteo:number, montoEfectivo:number}}
 */
export function auditarDobleConteo(compras = [], debitos = [], { corte } = {}) {
  const hallazgos = []
  for (const c of compras) {
    const h = evaluarCompra(c, debitos, { corte })
    if (h) hallazgos.push(h)
  }
  const suma = (m) => hallazgos.filter((h) => h.motivo === m).reduce((s, h) => s + h.monto, 0)
  return {
    hallazgos: hallazgos.sort((a, b) => b.monto - a.monto),
    montoDobleConteo: suma('doble_conteo_banco'),
    montoEfectivo: suma('medio_efectivo_pero_salio_del_banco'),
  }
}

/** Índices (0-based) de las columnas de Compras que este control lee. Se verifican con el encabezado. */
export const COL = { fechaComprobante: 2, proveedor: 4, total: 14, medioPago: 15, estado: 23, fechaCaja: 29 }

/**
 * NÚCLEO PURO: las filas de Compras que se pueden auditar, desde la grilla cruda.
 * @param {unknown[][]} grid filas desde `primeraFila`
 * @param {number} primeraFila número de fila física de grid[0]
 */
export function comprasDeLaGrilla(grid = [], primeraFila = 4) {
  const out = []
  grid.forEach((r, i) => {
    const importe = aNumero(r?.[COL.total])
    if (!importe) return
    out.push({
      fila: primeraFila + i,
      proveedor: String(r?.[COL.proveedor] ?? '').trim(),
      importe,
      medioPago: String(r?.[COL.medioPago] ?? '').trim(),
      estado: String(r?.[COL.estado] ?? '').trim(),
      fechaCaja: aISO(r?.[COL.fechaCaja]),
      fechaComprobante: aISO(r?.[COL.fechaComprobante]),
    })
  })
  return out
}
