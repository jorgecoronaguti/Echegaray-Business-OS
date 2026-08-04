// LA PRUEBA DE QUE EL COMPROBANTE QUEDÓ BIEN CARGADO — RELEÍDA DE COMPRAS.
//
// ═══ QUÉ ESTABA MAL ═══
//
// El bot contestaba "✔ Cargado en Compras, fila 812" y nada más. Eso es la pantalla que respondió
// que sí, no el dato en su destino. Si la lectura de la foto puso $167.370.022 donde iban
// $1.673.700, la respuesta era idéntica: un tilde verde y un número de fila.
//
// Cargando a mano por Claude Code el paso que da certeza es otro: se relee la fila escrita y se
// muestran los números que quedaron. El dueño lo dijo así — "tiene que ser exactamente igual que
// directamente por esta vía, la experiencia es confusa y no es certera".
//
// ═══ LOS DOS CONTROLES QUE VIAJAN CON LA PRUEBA ═══
//
// 1. LA ARITMÉTICA. Importe + IVA = Total. No atrapa un error de escala parejo (si el modelo
//    multiplicó todo por cien, la suma sigue cerrando), pero sí atrapa el dígito suelto, la coma
//    corrida en un solo campo y el IVA leído de otra línea.
// 2. LA MAGNITUD contra lo que ese proveedor factura habitualmente. ÉSE sí atrapa el ×100: Alumetal
//    entró una vez por $167.370.022 con la aritmética perfecta, y lo delató ser 12 veces su compra
//    más grande. Con menos de cinco comprobantes previos no hay historia y se dice que no se pudo
//    verificar, en vez de callar.

/** Las columnas de Compras que se releen, por su offset desde A. */
export const COL = Object.freeze({
  categoria: 1, fecha: 2, proveedor: 4, comprobante: 7, obra: 9, concepto: 11,
  importe: 12, iva: 13, total: 14, tipoPago: 15, estado: 23,
})

const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * ¿La aritmética de la fila cierra? Importe + IVA = Total, al peso.
 *
 * @param {Array} fila  la fila de Compras tal como la devuelve la API
 * @returns {{cierra:boolean, importe:number, iva:number, total:number, dif:number}}
 */
export function aritmetica(fila = []) {
  const importe = num(fila[COL.importe])
  const iva = num(fila[COL.iva])
  const total = num(fila[COL.total])
  const dif = Math.round((importe + iva - total) * 100) / 100
  return { cierra: Math.abs(dif) < 1, importe, iva, total, dif }
}

/**
 * ¿EL IMPORTE ESTÁ EN LA ESCALA DE ESTE PROVEEDOR?
 *
 * Compara contra el máximo histórico del proveedor. No contra el promedio: una compra grande legítima
 * no tiene por qué parecerse al promedio, pero superar por diez veces lo más grande que se le compró
 * nunca es normal.
 *
 * @param {number} total          el total que se acaba de escribir
 * @param {number[]} historia     los totales anteriores de ese proveedor
 * @param {{minimo?:number, veces?:number}} [o]
 * @returns {{estado:'ok'|'sospechoso'|'sin_historia', veces:number|null, maximo:number|null}}
 */
export function magnitud(total, historia = [], { minimo = 5, veces = 10 } = {}) {
  const previos = (historia ?? []).map(num).filter((n) => n > 0)
  if (previos.length < minimo) return { estado: 'sin_historia', veces: null, maximo: null }
  const maximo = Math.max(...previos)
  const cuantas = maximo > 0 ? total / maximo : 0
  return { estado: cuantas >= veces ? 'sospechoso' : 'ok', veces: Math.round(cuantas * 10) / 10, maximo }
}

/**
 * LA TABLA DE LO QUE QUEDÓ ESCRITO, leída del archivo.
 *
 * @param {Array<{fila:number, valores:Array, historia?:number[]}>} leidas
 * @returns {string} markdown listo para Mattermost
 */
export function tablaDeLoEscrito(leidas = []) {
  if (!leidas.length) return ''
  const l = ['', '**Esto es lo que quedó escrito en Compras:**', '',
    '| Fila | Proveedor | Comprobante | Fecha | Importe | IVA | Total | Obra |',
    '|---|---|---|---|---|---|---|---|']
  for (const { fila, valores } of leidas) {
    const a = aritmetica(valores ?? [])
    l.push(`| ${fila} | ${valores?.[COL.proveedor] ?? '—'} | ${valores?.[COL.comprobante] ?? '—'} `
      + `| ${valores?.[COL.fecha] ?? '—'} | ${plata(a.importe)} | ${plata(a.iva)} | **${plata(a.total)}** `
      + `| ${valores?.[COL.obra] ?? '—'} |`)
  }
  return l.join('\n')
}

/**
 * LOS AVISOS DE LOS CONTROLES. Vacío = todo cerró, y eso también se dice.
 *
 * @param {Array<{fila:number, valores:Array, historia?:number[]}>} leidas
 * @returns {string[]}
 */
export function avisosDeVerificacion(leidas = []) {
  const l = []
  for (const { fila, valores, historia } of leidas) {
    const a = aritmetica(valores ?? [])
    const quien = valores?.[COL.proveedor] ?? `fila ${fila}`
    if (!a.cierra) {
      l.push(`⚠ **Fila ${fila} (${quien}): la aritmética no cierra.** `
        + `${plata(a.importe)} + ${plata(a.iva)} = ${plata(a.importe + a.iva)}, y el total dice ${plata(a.total)} `
        + `(${plata(Math.abs(a.dif))} de diferencia). Revisá la foto.`)
    }
    const m = magnitud(a.total, historia)
    if (m.estado === 'sospechoso') {
      l.push(`⚠ **Fila ${fila} (${quien}): ${plata(a.total)} es ${m.veces}× su compra más grande** `
        + `(${plata(m.maximo)}). Suele ser una coma corrida en la lectura. Verificá antes de darlo por bueno.`)
    }
    if (m.estado === 'sin_historia') {
      l.push(`ℹ Fila ${fila} (${quien}): no tengo historia suficiente de este proveedor para controlar la magnitud del importe.`)
    }
  }
  return l
}

/**
 * ¿Alguno de los controles encontró algo que impida darlo por bueno?
 * La magnitud sin historia NO cuenta: es una limitación declarada, no un hallazgo.
 */
export function hayHallazgos(leidas = []) {
  return leidas.some(({ valores, historia }) => {
    const a = aritmetica(valores ?? [])
    return !a.cierra || magnitud(a.total, historia).estado === 'sospechoso'
  })
}

/** El cierre honesto: qué se verificó, y qué no se pudo. */
export function cierre(leidas = []) {
  if (!leidas.length) return ''
  return hayHallazgos(leidas)
    ? '**No lo des por bueno todavía**: los controles de arriba encontraron algo.'
    : `✓ Releído del archivo: ${leidas.length} fila(s), la aritmética cierra en todas.`
}
