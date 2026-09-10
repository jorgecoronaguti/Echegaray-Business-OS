// Cada test es un caso real de los 34 papeles sueltos medidos el 10/09/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPapel, clasificarSueltos, candidatasPorNumero, CLASE } from './papel-sin-vincular.mjs'

const espejo = [
  { fila: 813, clave: 'p:villa del pino|0001-00015751', proveedor: 'VILLA DEL PINO', total: 99998.98 },
  { fila: 932, clave: 'p:lliteras|0004-00000967', proveedor: 'Lliteras', total: 50000 },
  { fila: 942, clave: 'p:axion servicentro media agua|0014-00012010', proveedor: 'AXION SERVICENTRO MEDIA AGUA', total: 173800 },
]

test('COPIA: el reenvío de un papel ya vinculado no es un gasto faltante — cargarlo lo duplicaría', () => {
  const r = clasificarPapel(
    { file_id: 'f2', clave: 'c:30549581710|0014-00012010', proveedor: 'AXION SERVICENTRO MEDIA AGUA', total: 173800 },
    {
      vinculados: [{ compra_clave: 'p:axion servicentro media agua|0014-00012010', fila_compras: 942, proveedor: 'AXION SERVICENTRO MEDIA AGUA' }],
      espejo,
    })
  assert.equal(r.clase, CLASE.COPIA)
  assert.equal(r.original.fila, 942)
})

test('OTRA_CLAVE por número: la fila 932 (Lliteras) tiene el número y otra identidad → candidata, no vínculo', () => {
  const r = clasificarPapel({ file_id: 'f1', clave: 'c:20349213347|0003-00000967', proveedor: 'Lliteras', total: 50000 }, { espejo })
  assert.equal(r.clase, CLASE.OTRA_CLAVE)
  assert.ok(r.candidatas.length >= 1)
  assert.equal(r.candidatas[0].fila, 932)
  assert.equal(r.candidatas[0].coincideTotal, true)
})

test('EL PUNTO DE VENTA MAL LEÍDO: 0015-00015751 contra 0001-00015751, mismo importe y proveedor → candidata', () => {
  // Sin esta red el papel salía «no está en Compras» y el dueño cargaba $99.998,98 por segunda vez.
  const r = clasificarPapel({ file_id: 'f3', clave: 'c:30714340677|0015-00015751', proveedor: 'VILLA DEL PINO S.A.', total: 99998.98 }, { espejo })
  assert.equal(r.clase, CLASE.OTRA_CLAVE)
  assert.equal(r.candidatas[0].fila, 813)
  assert.equal(r.candidatas[0].porImporte, true)
})

test('el importe solo NO alcanza: sin proveedor que lo confirme, el papel no tiene candidata', () => {
  const r = clasificarPapel({ file_id: 'f4', clave: 'c:99999999999|0099-00000001', proveedor: 'OTRO PROVEEDOR', total: 99998.98 }, { espejo })
  assert.equal(r.clase, CLASE.NO_ESTA)
})

test('NO_ESTA: ninguna fila tiene ese número ni ese importe', () => {
  const r = clasificarPapel({ file_id: 'f5', clave: 'c:33708332599|0103-00003797', proveedor: 'COMBUSTIBLES BARCELO SRL', total: 100000.08 }, { espejo })
  assert.equal(r.clase, CLASE.NO_ESTA)
})

test('SIN_LECTURA: de un papel que nadie leyó no se afirma que falte', () => {
  const r = clasificarPapel({ file_id: 'f6', clave: null }, { espejo })
  assert.equal(r.clase, CLASE.SIN_LECTURA)
})

test('una NC nunca empata con una factura del mismo número: el signo es opuesto', () => {
  assert.equal(candidatasPorNumero('c:1|NC|0004-00000967', espejo).length, 0)
})

test('los reenvíos se agrupan: 4 archivos del mismo comprobante son UN gasto, y su clase es la de la mejor copia', () => {
  const leida = { file_id: 'a', clave: 'c:30714340677|0015-00015751', proveedor: 'VILLA DEL PINO S.A.', total: 99998.98 }
  const muda = { file_id: 'b', clave: 'c:30714340677|0015-00015751', proveedor: null, total: null }
  const r = clasificarSueltos({ papeles: [leida, muda, { ...muda, file_id: 'c' }], espejo })
  assert.equal(r.total, 3)
  assert.equal(r.gastosDistintos, 1)
  assert.equal(r.porGasto[0].copias, 3)
  assert.equal(r.porGasto[0].clase, CLASE.OTRA_CLAVE)  // no `no_esta`: una copia sí encontró fila
})

test('UN EMPATE NO SE ADIVINA: dos filas del mismo proveedor con el mismo importe no dan candidata', () => {
  // Dos cargas de combustible de $50.000 al mismo proveedor son dos gastos distintos: elegir una
  // sería colgarle el papel al gasto equivocado, que es peor que no mostrarlo.
  const dos = [
    { fila: 900, clave: 'p:lliteras|0004-00001111', proveedor: 'Lliteras', total: 50000 },
    { fila: 901, clave: 'p:lliteras|0004-00002222', proveedor: 'Lliteras', total: 50000 },
  ]
  const r = clasificarPapel({ file_id: 'f7', clave: 'c:20349213347|0009-00009999', proveedor: 'Lliteras', total: 50000 }, { espejo: dos })
  assert.equal(r.clase, CLASE.NO_ESTA)
})
