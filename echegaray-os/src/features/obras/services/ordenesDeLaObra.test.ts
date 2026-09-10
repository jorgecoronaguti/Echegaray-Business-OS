import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueDeOrdenes, bloqueDeOrdenesDeLaObra, SIN_OC, SIN_OC_EN_N } from './ordenesDeLaObra.ts'
import type { PapelCrudo } from '../../clientes/services/papelesCliente.ts'
import { PAPELES_MESSINA } from '../../clientes/services/papelesMessina.fixture.ts'

// SE PRUEBA CONTRA LOS PAPELES REALES DE MESSINA, no contra objetos inventados: los números vienen
// con ceros a la izquierda («00002-00002266»), la misma OC llegó en dos mails, y los certificados de
// retención llevan el número de SU orden de pago. Un fixture fabricado a mano no tiene ninguna de
// las tres formas, que son justo las que rompen un bloque de presentación.

test('la obra con UNA OC muestra su número grande, su fecha y su importe c/IVA', () => {
  const b = bloqueDeOrdenes(PAPELES_MESSINA, { obraId: 'messina-playon-dilucion-acido' })
  assert.equal(b.fallo, false)
  assert.equal(b.oc.length, 1)
  assert.equal(b.oc[0].rotulo, 'OC 2266')
  assert.equal(b.oc[0].fecha, '2026-09-03')
  assert.equal(b.oc[0].importe, 24309950.07)
  assert.equal(b.oc[0].moneda, 'ARS')
  // El número CRUDO es lo que hay que buscar en el mail: va en el title, no en la línea.
  assert.match(b.oc[0].title, /2-2266/)
})

test('con varias OC salen TODAS, una línea por OC, y las OP van aparte', () => {
  const b = bloqueDeOrdenes(PAPELES_MESSINA, { obraId: 'messina-bsa' })
  // Las más nuevas primero: 495 y 496 son del 16/12/2024 y la 279 del 20/09/2024.
  assert.deepEqual(b.oc.map((o) => o.rotulo), ['OC 495', 'OC 496', 'OC 279'])
  assert.deepEqual(b.op.map((o) => o.rotulo), ['OP 1558', 'OP 1292', 'OP 1237', 'OP 730'])
})

test('CINCO OC en la misma obra se dibujan las cinco, sin resumir en un conteo', () => {
  // El pedido del dueño es «con varias OC, la lista completa». Se arma con OC REALES del fixture
  // reatribuidas a una obra —la fusión de obras del 10/09 hizo exactamente eso con BSA— para tener
  // el caso de cinco sin fabricar números que ningún PDF dijo.
  const cinco = PAPELES_MESSINA
    .filter((p) => p.tipo === 'orden_compra')
    .slice(0, 5)
    .map((p) => ({ ...p, obra_id: 'obra-con-cinco' }))
  const b = bloqueDeOrdenes(cinco, { obraId: 'obra-con-cinco' })
  assert.equal(b.oc.length, 5)
  assert.equal(new Set(b.oc.map((o) => o.rotulo)).size, 5)
  // Las más nuevas primero: la que hay que mirar hoy es la última que mandó el cliente.
  const fechas = b.oc.map((o) => o.fecha ?? '')
  assert.deepEqual(fechas, [...fechas].sort().reverse())
})

test('sin ninguna OC, el texto EXACTO es «Sin OC registrada» y no un cero', () => {
  const b = bloqueDeOrdenes([], { obraId: 'obra-sin-papeles' })
  assert.equal(b.oc.length, 0)
  assert.equal(b.op.length, 0)
  assert.equal(b.fallo, false)
  assert.equal(b.vacioOC, SIN_OC)
  assert.equal(SIN_OC, 'Sin OC registrada')
})

test('la obra que se factura en N no tiene OC faltante: lo dice y no lo reclama', () => {
  const b = bloqueDeOrdenes([], { obraId: 'obra-en-negro', enNegro: true })
  assert.equal(b.vacioOC, SIN_OC_EN_N)
  assert.equal(SIN_OC_EN_N, 'Sin OC · obra en N')
})

test('NO SABER si la obra es N no la convierte en N', () => {
  // `null` = la web todavía no puede leer la categoría B/N (ver la cabecera del servicio). Un
  // «obra en N» dibujado sin fuente sería una inferencia presentada como hecho.
  assert.equal(bloqueDeOrdenes([], { obraId: 'x', enNegro: null }).vacioOC, SIN_OC)
  assert.equal(bloqueDeOrdenes([], { obraId: 'x', enNegro: false }).vacioOC, SIN_OC)
})

test('una lectura que FALLÓ no se dibuja como una obra sin órdenes', () => {
  const b = bloqueDeOrdenes(null, { obraId: 'messina-bsa' })
  assert.equal(b.fallo, true)
  assert.deepEqual(b.oc, [])
})

test('el certificado de retención NUNCA aparece como orden de pago', () => {
  // Es el papel más peligroso del conjunto: lleva el número de SU orden de pago, así que contado
  // como OP duplica lo cobrado. Con la fila tipada como `orden_pago` a propósito.
  const papeles: PapelCrudo[] = [
    { id: 'a', tipo: 'orden_pago', numero: '0000000005156', fecha: '2026-09-01', importe: 1000, moneda: 'ARS', obra_id: 'o', cita: null, nombre_archivo: 'O_P_0000000005156.pdf' },
    { id: 'b', tipo: 'orden_pago', numero: '0000000005156', fecha: '2026-09-01', importe: 1000, moneda: 'ARS', obra_id: 'o', cita: null, nombre_archivo: 'O_P_0000000005156_G00002353.pdf' },
  ]
  const b = bloqueDeOrdenes(papeles, { obraId: 'o' })
  assert.deepEqual(b.op.map((o) => o.rotulo), ['OP 5156'])
})

test('la factura NUESTRA no es una orden del cliente', () => {
  const soloFacturas = PAPELES_MESSINA.filter((p) => p.tipo === 'factura' && p.obra_id === 'messina-bsa')
  const b = bloqueDeOrdenes(soloFacturas, { obraId: 'messina-bsa' })
  assert.deepEqual(b.oc, [])
  assert.deepEqual(b.op, [])
})

test('el enlace del PDF va a Drive cuando está subido y al proxy del OS cuando no', () => {
  const conDrive: PapelCrudo = {
    id: 'p1', tipo: 'orden_compra', numero: '00002-00002173', fecha: '2026-08-01', importe: 500,
    moneda: 'ARS', obra_id: 'o', cita: null, nombre_archivo: 'oc.pdf', drive_file_id: '1AbCdEfGhIj',
  }
  const sinDrive: PapelCrudo = { ...conDrive, id: 'p2', numero: '00002-00002174', drive_file_id: null }
  const b = bloqueDeOrdenes([conDrive, sinDrive], { obraId: 'o' })
  const porRotulo = new Map(b.oc.map((o) => [o.rotulo, o]))
  assert.equal(porRotulo.get('OC 2173')?.href, 'https://drive.google.com/file/d/1AbCdEfGhIj/view')
  assert.equal(porRotulo.get('OC 2173')?.enDrive, true)
  assert.equal(porRotulo.get('OC 2174')?.href, '/api/clientes/orden/p2')
  assert.equal(porRotulo.get('OC 2174')?.enDrive, false)
})

test('la misma OC llegada en dos mails es UNA línea y UN importe', () => {
  const copia = (id: string): PapelCrudo => ({
    id, tipo: 'orden_compra', numero: '00002-00002162', fecha: '2026-08-14', importe: 6060479.39,
    moneda: 'ARS', obra_id: 'o', cita: null, nombre_archivo: `oc-${id}.pdf`,
  })
  const b = bloqueDeOrdenes([copia('x'), copia('y')], { obraId: 'o' })
  assert.equal(b.oc.length, 1)
  assert.equal(b.oc[0].importe, 6060479.39)
  assert.match(b.oc[0].title, /2 copias/)
})

test('una orden sin número existe igual: se rotula «s/n», no se esconde', () => {
  const b = bloqueDeOrdenes(
    [{ id: 'z', tipo: 'orden_compra', numero: null, fecha: null, importe: null, moneda: null, obra_id: 'o', cita: null, nombre_archivo: 'escaneo.pdf' }],
    { obraId: 'o' },
  )
  assert.deepEqual(b.oc.map((o) => o.rotulo), ['OC s/n'])
  assert.equal(b.oc[0].importe, null)
})

test('las órdenes de OTRA obra no entran en esta ficha', () => {
  const b = bloqueDeOrdenes(PAPELES_MESSINA, { obraId: 'messina-playon-azufre' })
  assert.ok(b.oc.every((o) => o.rotulo !== 'OC 2266'))
})

test('las filas que la base ya recortó por obra no se pierden por no traer `obra_id`', () => {
  // `getOrdenesDeObra` filtra por `obra_id` y no lo selecciona. Sin reponerlo, `porObra` quedaba
  // vacío y la ficha decía «Sin OC registrada» sobre una obra que SÍ tiene su OC — el defecto
  // exacto que el dueño reportó, con otra causa.
  const sinObraId = PAPELES_MESSINA
    .filter((p) => p.obra_id === 'messina-playon-dilucion-acido')
    // Las mismas columnas que trae el `select` de `getOrdenesDeObra` — sin `obra_id`.
    .map(({ id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo }) =>
      ({ id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo }))
  const b = bloqueDeOrdenesDeLaObra(sinObraId, { obraId: 'messina-playon-dilucion-acido' })
  assert.deepEqual(b.oc.map((o) => o.rotulo), ['OC 2266'])
})

test('una lectura fallida sigue siendo fallida al reponer la obra', () => {
  assert.equal(bloqueDeOrdenesDeLaObra(null, { obraId: 'x' }).fallo, true)
})
