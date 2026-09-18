// LA PRUEBA DEL EFECTO, NO DEL INTENTO.
//
// El bot contestaba "✔ Cargado en Compras, fila 812" y nada más. Con un importe leído mal la
// respuesta era idéntica. Estos tests fijan lo que hace que la carga sea CIERTA: releer la fila y
// mostrar lo que quedó, con los dos controles que ya pagamos caro.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aritmetica, avisosDeVerificacion, cierre, COL, hayHallazgos, magnitud, tablaDeLoEscrito,
} from './verificacion.mjs'

/** Una fila de Compras con lo mínimo para los controles. */
function fila({ proveedor = 'Alumetal', comprobante = '0038-00025942', fecha = '31/07/2026', importe, iva, total, obra = 'MESSINA' }) {
  const f = []
  f[COL.proveedor] = proveedor
  f[COL.comprobante] = comprobante
  f[COL.fecha] = fecha
  f[COL.importe] = importe
  f[COL.iva] = iva
  f[COL.total] = total
  f[COL.obra] = obra
  return f
}

test('la aritmética cierra: importe + IVA = total', () => {
  const a = aritmetica(fila({ importe: 1664413, iva: 349526.73, total: 2013939.73 }))
  assert.equal(a.cierra, true)
})

test('lee importes con formato es-AR ($ 1.664.413,00) sin confundir el punto de miles', () => {
  const a = aritmetica(fila({ importe: '$ 1.664.413,00', iva: '$ 349.526,73', total: '$ 2.013.939,73' }))
  assert.equal(a.importe, 1664413)
  assert.equal(a.iva, 349526.73)
  assert.equal(a.cierra, true)
})

test('un IVA leído de otra línea no cierra, y se dice con los tres números', () => {
  const l = [{ fila: 812, valores: fila({ importe: 1664413, iva: 34952, total: 2013939.73 }) }]
  assert.equal(hayHallazgos(l), true)
  const [aviso] = avisosDeVerificacion(l)
  assert.match(aviso, /la aritmética no cierra/)
  assert.match(aviso, /\$1\.664\.413/)
  assert.match(aviso, /\$2\.013\.940/)
})

test('EL ×100 · la aritmética perfecta no lo ve; la magnitud sí', () => {
  // El caso real de Alumetal: 167.370.022 + 34.123.985 = 201.494.007. La suma cierra al peso.
  const valores = fila({ importe: 167370022, iva: 34123985, total: 201494007 })
  assert.equal(aritmetica(valores).cierra, true, 'la aritmética no puede atrapar un error de escala parejo')

  const historia = [2013939, 1500000, 3159344, 980000, 16500000]
  const l = [{ fila: 812, valores, historia }]
  assert.equal(hayHallazgos(l), true)
  assert.match(avisosDeVerificacion(l)[0], /× su compra más grande/)
})

test('una compra grande LEGÍTIMA no se marca: el umbral es diez veces el máximo', () => {
  const historia = [2013939, 1500000, 3159344, 980000, 16500000]
  assert.equal(magnitud(20000000, historia).estado, 'ok', 'marcar lo normal entrena a ignorar el aviso')
  assert.equal(magnitud(170000000, historia).estado, 'sospechoso')
})

test('sin historia suficiente NO se calla: se declara que no se pudo verificar', () => {
  const l = [{ fila: 812, valores: fila({ importe: 100, iva: 21, total: 121 }), historia: [500, 600] }]
  assert.equal(magnitud(121, [500, 600]).estado, 'sin_historia')
  assert.match(avisosDeVerificacion(l)[0], /no tengo historia suficiente/)
  // Pero una limitación declarada no es un hallazgo: no bloquea el cierre.
  assert.equal(hayHallazgos(l), false)
})

test('la tabla muestra lo que quedó ESCRITO, con su número de fila', () => {
  const t = tablaDeLoEscrito([{ fila: 812, valores: fila({ importe: 1664413, iva: 349526.73, total: 2013939.73 }) }])
  assert.match(t, /\| 812 \| Alumetal \| 0038-00025942 \| 31\/07\/2026 \|/)
  assert.match(t, /\$2\.013\.940/)
  assert.match(t, /MESSINA/)
})

test('sin filas no se inventa una tabla vacía', () => {
  assert.equal(tablaDeLoEscrito([]), '')
  assert.equal(cierre([]), '')
})

test('el cierre dice que se releyó, y con hallazgos dice que NO se dé por bueno', () => {
  const ok = [{ fila: 812, valores: fila({ importe: 100, iva: 21, total: 121 }), historia: [100, 110, 120, 130, 140] }]
  assert.match(cierre(ok), /Releído del archivo/)
  const mal = [{ fila: 812, valores: fila({ importe: 100, iva: 21, total: 999 }) }]
  assert.match(cierre(mal), /No lo des por bueno/)
})

// ════════════════════════════════════════════════════════════════════════════
// LO QUE QUEDÓ VACÍO SE NOMBRA LEYENDO LA FILA, CON SU LETRA VIVA (18/09/2026)
// ════════════════════════════════════════════════════════════════════════════
import { colVerificacion, sinCompletar, COMPLETABLES } from './verificacion.mjs'
import { COMPRAS_1809 } from './encabezado-vivo-compras.mjs'

/** Una fila de Compras contra el encabezado VIVO, por rótulo. */
function filaViva(valores = {}) {
  const f = Array(COMPRAS_1809.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) {
    const i = COMPRAS_1809.indexOf(rotulo)
    if (i < 0) throw new Error(`rótulo desconocido «${rotulo}»`)
    f[i] = v
  }
  return f
}
const COLV = colVerificacion(COMPRAS_1809)
const BASE = { Proveedor: 'Neumagom', 'N° Comprobante': '0002-00004213', 'Fecha factura': 46000, Importe: 479338.84, IVA: 100661.16, Total: 580000, Categoría: 'B' }

test('sinCompletar nombra las celdas vacías con la LETRA viva: Obra es L y Tipo pago es Q', () => {
  const leidas = [{ fila: 981, col: COLV, valores: filaViva({ ...BASE, 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', 'Detalles / Obra': 'Neumático', 'CUIT (OS)': '30-69185382-5' }) }]
  const [p] = sinCompletar(leidas)
  assert.deepEqual(p.campos, ['obraFila', 'tipoPago'])
  assert.deepEqual(p.letras, { obraFila: 'L', tipoPago: 'Q' })
  assert.deepEqual(p.derivadas, [])
  assert.equal(p.proveedor, 'Neumagom')
})

test('una fila completa no sale; una sin Unidad ni J ni K sale con las tres, en orden de columna', () => {
  const completa = filaViva({ ...BASE, 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', 'Detalles / Obra': 'x', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq', 'CUIT (OS)': '30-69185382-5' })
  assert.deepEqual(sinCompletar([{ fila: 1, col: COLV, valores: completa }]), [])
  const vacia = filaViva({ ...BASE, Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq', 'CUIT (OS)': 'x' })
  assert.deepEqual(sinCompletar([{ fila: 2, col: COLV, valores: vacia }])[0].campos, ['unidad', 'obra', 'detalle'])
})

test('«CUIT (OS)» vacía es una DERIVADA, no una celda para completar en Compras: va aparte', () => {
  const sinCuit = filaViva({ ...BASE, 'Unidad de Negocio': 'Estructura', 'Cliente / Asignación': 'Taller', 'Detalles / Obra': 'x', Obra: 'ES-TAL · Estructura – Taller', 'Tipo pago': 'Echeq' })
  const [p] = sinCompletar([{ fila: 981, col: COLV, valores: sinCuit }])
  assert.deepEqual(p.campos, [])
  assert.deepEqual(p.derivadas, ['cuit'])
  assert.equal(p.letras.cuit, 'AN')
})

test('contra un encabezado sin «Obra» ni «CUIT (OS)» (opcionales) no se reclama lo que la pestaña no tiene', () => {
  const enc = COMPRAS_1809.filter((r) => r !== 'Obra' && r !== 'CUIT (OS)')
  const col = colVerificacion(enc)
  assert.equal(col.obraFila, null)
  assert.equal(col.cuit, null)
  const f = Array(enc.length).fill('')
  f[enc.indexOf('Proveedor')] = 'X'; f[enc.indexOf('Unidad de Negocio')] = 'Civil'; f[enc.indexOf('Cliente / Asignación')] = 'MESSINA'
  f[enc.indexOf('Detalles / Obra')] = 'k'; f[enc.indexOf('Tipo pago')] = 'Efectivo'; f[enc.indexOf('Categoría')] = 'B'
  assert.deepEqual(sinCompletar([{ fila: 5, col, valores: f }]), [])
})

test('las completables son exactamente las que una persona tipea en Compras — Tipo de Costo y Estado Carga NO están', () => {
  assert.deepEqual(COMPLETABLES.map(([k]) => k), ['proveedor', 'categoria', 'unidad', 'obra', 'detalle', 'obraFila', 'tipoPago'])
})
