import test from 'node:test'
import assert from 'node:assert/strict'
import { partesDeClave, mismoComprobante, filaConciliada, numeroNormalizado } from './clave-conciliada.mjs'

test('partesDeClave: los tres formatos reales de la base', () => {
  assert.deepEqual(partesDeClave('c:33538492219|0021-00078128'),
    { por: 'cuit', identidad: '33538492219', tipo: '', numero: '2100078128' })
  assert.deepEqual(partesDeClave('p:santa clara srl|0021-00078128'),
    { por: 'proveedor', identidad: 'santa clara srl', tipo: '', numero: '2100078128' })
  assert.deepEqual(partesDeClave('c:23369111574|NC|0004-00000097'),
    { por: 'cuit', identidad: '23369111574', tipo: 'nc', numero: '400000097' })
  assert.equal(partesDeClave(null), null)
  assert.equal(partesDeClave('sin-prefijo|1'), null)
  assert.equal(partesDeClave('c:solo-identidad'), null)
})

test('numeroNormalizado: los ceros a la izquierda del Sheet no son parte del número', () => {
  assert.equal(numeroNormalizado('0004-00003746'), '400003746')
  assert.equal(numeroNormalizado('00004-00003746'), '400003746')
  assert.equal(numeroNormalizado(''), '')
})

// EL CASO QUE PRODUJO EL DEFECTO: la fila 928 del 08/09/2026.
test('mismoComprobante: c: y p: del mismo comprobante empatan cuando el proveedor coincide', () => {
  assert.equal(mismoComprobante('c:33538492219|0021-00078128', 'p:santa clara srl|0021-00078128',
    { proveedorA: 'Santa Clara SRL', proveedorB: 'Santa Clara SRL' }), true)
  // El nombre alcanza aunque venga sólo de un lado: el otro lo trae la propia clave `p:`.
  assert.equal(mismoComprobante('c:33538492219|0021-00078128', 'p:santa clara srl|0021-00078128',
    { proveedorA: 'Santa Clara SRL' }), true)
})

test('mismoComprobante: PUEDE DAR ROJO — lo que no es el mismo comprobante no empata', () => {
  // Mismo número, proveedor distinto: son dos facturas de dos empresas.
  assert.equal(mismoComprobante('c:33538492219|0021-00078128', 'p:corralon progreso|0021-00078128',
    { proveedorA: 'Santa Clara SRL' }), false)
  // Dos CUIT distintos nunca empatan, diga lo que diga el nombre.
  assert.equal(mismoComprobante('c:33538492219|0001-00000001', 'c:23369111574|0001-00000001',
    { proveedorA: 'X', proveedorB: 'X' }), false)
  // El tipo es parte de la identidad del papel: la NC 97 no es la factura 97.
  assert.equal(mismoComprobante('c:23369111574|NC|0004-00000097', 'c:23369111574|0004-00000097'), false)
  // Números distintos.
  assert.equal(mismoComprobante('c:1|0001-00000001', 'c:1|0001-00000002'), false)
  // Sin proveedor de ningún lado que lo pruebe, un c: y un p: NO se pegan.
  assert.equal(mismoComprobante('c:33538492219|0021-00078128', 'p:|0021-00078128'), false)
})

test('filaConciliada: la exacta gana, la cercana rescata, y el empate no se adivina', () => {
  const filas = [
    { fila: 928, clave: 'p:santa clara srl|0021-00078128', proveedor: 'Santa Clara SRL' },
    { fila: 900, clave: 'c:23369111574|NC|0006-00000068', proveedor: 'Corralon Progreso' },
  ]
  assert.equal(filaConciliada('c:23369111574|NC|0006-00000068', filas)?.fila, 900)
  assert.equal(filaConciliada('c:33538492219|0021-00078128', filas, { proveedor: 'Santa Clara SRL' })?.fila, 928)
  assert.equal(filaConciliada('c:99999999999|0021-00078128', filas, { proveedor: 'Otro SA' }), null)
  // Dos filas del mismo comprobante (un duplicado en la pestaña): no se elige ninguna.
  const conEmpate = [...filas, { fila: 950, clave: 'p:santa clara srl|0021-00078128', proveedor: 'Santa Clara SRL' }]
  assert.equal(filaConciliada('c:33538492219|0021-00078128', conEmpate, { proveedor: 'Santa Clara SRL' }), null)
})
