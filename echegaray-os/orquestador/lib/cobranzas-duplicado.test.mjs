import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gruposIndistinguibles, esIndistinguible, plataEnJuego, CLAVE } from './cobranzas-duplicado.mjs'

// Los dos casos REALES del archivo, al 21/07.
const ESTRELLA_39 = { fila: 39, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', monto: 10000000, forma: 'Efectivo', estado: 'Cobrado', fechaCobro: '13/6/2026', concepto: '' }
const ESTRELLA_40 = { ...ESTRELLA_39, fila: 40 }
const SANFCO_50 = { fila: 50, cliente: 'IMOTOR/San Francisco/JAVI SANCHEZ', monto: 16200000, forma: 'Efectivo', estado: 'Cobrado', fechaCobro: '17/7/2026', concepto: 'Pago efectivo — julio 2026' }
const SANFCO_54 = { ...SANFCO_50, fila: 54, concepto: 'Cobro efectivo - pago total julio' }

test('encuentra el duplicado real de San Francisco SIN depender del ID', () => {
  // Este es el punto: los IDs 46 y 50 son distintos desde que se reparó la columna A. Un detector
  // basado en ID daría cero justo acá.
  const g = gruposIndistinguibles([SANFCO_50, SANFCO_54])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].filas, [50, 54])
  assert.equal(g[0].enJuego, 16200000)
})

test('un concepto redactado distinto NO lo salva: la clave son los datos duros', () => {
  const g = gruposIndistinguibles([SANFCO_50, SANFCO_54])
  assert.equal(g[0].conceptos.length, 2, 'informa las dos redacciones para que un humano decida')
})

test('el par legítimo de LA ESTRELLA también se marca, y está bien', () => {
  // El dueño confirmó que son dos cobros distintos. El Sheet no tiene con qué distinguirlos porque
  // nadie escribió el concepto: es un dato incompleto, y marcarlo es lo correcto.
  const g = gruposIndistinguibles([ESTRELLA_39, ESTRELLA_40])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].conceptos, [], 'ninguna tiene concepto: eso es lo que hay que completar')
})

test('cobros del mismo cliente en días distintos NO son indistinguibles', () => {
  const otro = { ...SANFCO_50, fila: 60, fechaCobro: '18/7/2026' }
  assert.deepEqual(gruposIndistinguibles([SANFCO_50, otro]), [])
})

test('un cobro Proyectado no se confunde con uno Cobrado', () => {
  const proy = { ...SANFCO_50, fila: 61, estado: 'Proyectado' }
  assert.deepEqual(gruposIndistinguibles([SANFCO_50, proy]), [])
})

test('las filas sin monto se ignoran', () => {
  const vacia = { fila: 99, cliente: '', monto: 0, forma: '', estado: '', fechaCobro: '', concepto: '' }
  assert.deepEqual(gruposIndistinguibles([vacia, { ...vacia, fila: 100 }]), [])
})

test('la plata en juego es el excedente, no el total del grupo', () => {
  const trio = [SANFCO_50, SANFCO_54, { ...SANFCO_50, fila: 58 }]
  assert.equal(gruposIndistinguibles(trio)[0].enJuego, 32400000, 'de tres iguales sobran dos')
})

test('la fórmula del Sheet usa las mismas cinco columnas que el JavaScript', () => {
  const f = esIndistinguible('Cobranzas', 5, 400)
  for (const col of Object.values(CLAVE)) assert.ok(f.includes(`$${col}$5:$${col}$400`), `falta la columna ${col}`)
  assert.ok(f.endsWith('>1'))
  assert.ok(!f.includes('$A$'), 'el ID NO entra en la clave: es único por construcción')
})

test('la fórmula usa el separador es-AR', () => {
  assert.ok(!esIndistinguible().includes(','), 'una coma rompería la fórmula en un Sheet es-AR')
  assert.match(plataEnJuego(), /\/2$/, 'de cada par sobra uno')
})
