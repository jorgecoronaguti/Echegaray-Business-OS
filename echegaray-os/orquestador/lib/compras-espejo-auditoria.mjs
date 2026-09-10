// COMPARAR LA PESTAÑA CONTRA SU ESPEJO — núcleo puro, sin Google y sin Postgres.
//
// Vive separado del script para poder probarlo: un comparador que sólo se puede correr contra el
// archivo vivo no se puede probar, y un control que no se puede probar no puede afirmar que puede
// dar rojo. La regla del repo es que la regla va a una función pura.
//
// LO QUE MIDE, Y POR QUÉ CADA COSA:
//   · filas que faltan / sobran → el espejo viejo o una lectura a medias;
//   · celdas distintas por columna → dónde está el daño (todo en `total` es otra cosa que todo en
//     `proveedor`);
//   · DESFASAJE DE RENGLÓN → si el dueño insertó una fila, cualquier cosa atada al número de renglón
//     (los adjuntos) apunta al vecino de abajo. Se mide comparando la clave del Sheet contra la del
//     espejo con un corrimiento de −3..+3: si con `k≠0` coincide más que con `k=0`, el espejo está
//     corrido y el `desde` dice a partir de qué renglón.

/** Lo que se compara. `fila` no está: es el eje de la comparación, no un valor. */
export const COLUMNAS_COMPARADAS = Object.freeze([
  'sheet_id', 'clave', 'categoria', 'fecha', 'mes', 'proveedor', 'modalidad', 'tipo', 'comprobante',
  'unidad_negocio', 'obra_texto', 'detalle_obra', 'concepto', 'importe', 'iva', 'total', 'tipo_pago',
  'fecha_prevista', 'pago_total_o_parcial', 'monto_pagado', 'monto_parcial_1', 'fecha_prevista_2',
  'monto_parcial_2', 'estado', 'tipo_costo', 'estado_pago', 'estado_carga', 'fecha_caja',
  'familia_material', 'sub_rubro', 'repetido', 'saldo_pendiente', 'cuit', 'tramo_vencimiento',
])

const MONTOS = new Set(['importe', 'iva', 'total', 'monto_pagado', 'monto_parcial_1', 'monto_parcial_2', 'saldo_pendiente'])
const FECHAS = new Set(['fecha', 'fecha_prevista', 'fecha_prevista_2', 'fecha_caja'])

/**
 * El valor de una celda, comparable venga de donde venga.
 *
 * Postgres devuelve `numeric` como texto ('100002.97') y `date` como Date; el Sheet devuelve número
 * y string ISO. Comparar sin normalizar daría 941 filas distintas y ninguna diferencia real — el
 * peor resultado posible: un control que grita siempre deja de mirarse.
 */
export function celda(columna, valor) {
  if (valor === null || valor === undefined || valor === '') return null
  if (MONTOS.has(columna)) {
    const n = Number(valor)
    return Number.isFinite(n) ? n.toFixed(2) : String(valor).trim()
  }
  if (FECHAS.has(columna)) {
    if (valor instanceof Date) {
      return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`
    }
    return String(valor).slice(0, 10)
  }
  if (typeof valor === 'boolean') return valor ? 'true' : 'false'
  return String(valor).trim()
}

/** Las columnas en las que dos registros de la misma fila no dicen lo mismo. */
export function diferenciasDeFila(a = {}, b = {}, columnas = COLUMNAS_COMPARADAS) {
  const out = []
  for (const c of columnas) {
    const x = celda(c, a[c]); const y = celda(c, b[c])
    if (x !== y) out.push({ columna: c, sheet: x, espejo: y })
  }
  return out
}

/**
 * Compara las dos colecciones por número de fila.
 * @param {Array<object>} sheet filas leídas de la pestaña (con `fila`)
 * @param {Array<object>} espejo filas de `compra_sheet` (con `fila`)
 */
export function compararEspejo(sheet = [], espejo = []) {
  const porFila = new Map(espejo.map((e) => [Number(e.fila), e]))
  const enSheet = new Set(sheet.map((s) => Number(s.fila)))
  const faltan = sheet.filter((s) => !porFila.has(Number(s.fila))).map((s) => Number(s.fila))
  const sobran = espejo.filter((e) => !enSheet.has(Number(e.fila))).map((e) => Number(e.fila))
  const porColumna = Object.fromEntries(COLUMNAS_COMPARADAS.map((c) => [c, 0]))
  const peores = []
  let filasComparadas = 0
  let filasConDiferencia = 0
  for (const s of sheet) {
    const e = porFila.get(Number(s.fila))
    if (!e) continue
    filasComparadas++
    const d = diferenciasDeFila(s, e)
    if (!d.length) continue
    filasConDiferencia++
    for (const x of d) porColumna[x.columna]++
    peores.push({
      fila: Number(s.fila),
      diferencias: d,
      detalle: d.slice(0, 4).map((x) => `${x.columna}: «${x.sheet}» vs «${x.espejo}»`).join(' · '),
    })
  }
  peores.sort((a, b) => b.diferencias.length - a.diferencias.length || a.fila - b.fila)
  return { faltan, sobran, filasComparadas, filasConDiferencia, porColumna, peores }
}

/** Corrimientos que se prueban. Más de tres filas insertadas de golpe ya no es «se corrió». */
const VENTANA = [0, 1, -1, 2, -2, 3, -3]

/**
 * ¿El espejo está CORRIDO respecto del Sheet? Devuelve el corrimiento `k` tal que la fila N del
 * espejo se corresponde con la fila N+k del Sheet, o `null` si el mejor corrimiento es 0.
 *
 * Se compara por `clave` (identidad del comprobante) y, cuando falta, por proveedor+total: son los
 * únicos datos de la fila que no dependen de dónde está la fila.
 */
export function desfasajeDeFilas(sheet = [], espejo = []) {
  const huella = (r) => r?.clave ?? (r ? `${celda('proveedor', r.proveedor)}|${celda('total', r.total)}` : null)
  const porFilaEspejo = new Map(espejo.map((e) => [Number(e.fila), huella(e)]))
  const puntajes = VENTANA.map((k) => {
    let ok = 0; let total = 0
    for (const s of sheet) {
      const h = porFilaEspejo.get(Number(s.fila) - k)
      if (h === undefined) continue
      total++
      if (h === huella(s)) ok++
    }
    return { k, ok, total }
  })
  const mejor = puntajes.reduce((a, b) => (b.ok > a.ok ? b : a))
  if (mejor.k === 0) return { corrido: null, desde: null, puntajes }
  // La primera fila en la que el corrimiento explica mejor que la identidad.
  let desde = null
  for (const s of sheet) {
    const propia = porFilaEspejo.get(Number(s.fila))
    if (propia !== undefined && propia !== huella(s)) { desde = Number(s.fila); break }
  }
  return { corrido: mejor.k, desde, puntajes }
}
