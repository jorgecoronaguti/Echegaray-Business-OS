// EL GUARDIÁN DE LO QUE SALE DE LA VM. Cada test evita que un dato de la empresa se publique.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPublicable, manifiestoDe, umbralesPublicables, registroPublicable } from './publicar-evaluacion.mjs'

test('un CUIT nunca sale', () => {
  const r = esPublicable({ nota: 'el proveedor 20-28773782-4 factura como DUPEC' })
  assert.equal(r.publicable, false)
  assert.ok(r.hallazgos.some((h) => /CUIT/.test(h)))
})

test('un importe en pesos nunca sale', () => {
  assert.equal(esPublicable({ x: 'total $ 1.234.567' }).publicable, false)
})

test('un nombre de persona nunca sale', () => {
  assert.equal(esPublicable({ q: 'el papel de RIOS, FERNANDO ANTONIO' }).publicable, false)
})

test('un campo de contenido o un id de Drive nunca salen', () => {
  assert.equal(esPublicable({ texto: 'lo que sea' }).publicable, false)
  assert.equal(esPublicable({ drive_file_id: 'abc' }).publicable, false)
})

test('las MÉTRICAS sí salen: son números sobre modelos, no sobre la empresa', () => {
  const r = esPublicable({ modelo: 'Xenova/multilingual-e5-small', mrr: 0.184, rssMb: 885, licencia: 'MIT' })
  assert.equal(r.publicable, true)
})

test('«proveedor» como CATEGORÍA no bloquea, y esto es una corrección', () => {
  // La primera versión del guardián incluía la palabra `proveedor` entre los campos prohibidos y
  // bloqueó los umbrales calibrados, donde «proveedor» está al lado de «cliente» y «empleado» como
  // nombre de categoría. Un guardián que bloquea lo inocuo enseña a esquivarlo, y ahí sí se cuela
  // lo que importa. Los datos reales de un proveedor los atrapan las otras tres comprobaciones.
  const umbrales = { entidades: { proveedor: { auto: 0.95 }, cliente: { auto: 0.95 } } }
  assert.equal(esPublicable(umbrales).publicable, true)
})

test('un manifiesto SIN hash no se arma: no se podría saber qué versión midió', () => {
  assert.throws(() => manifiestoDe({ nombre: 'x', version: 1 }), /hash/)
})

test('el manifiesto NO lleva las preguntas', () => {
  const m = manifiestoDe({ nombre: 'x', version: 1, hash: 'abc', total: 10, preguntas: [{ texto: 'RIOS, FERNANDO' }] })
  assert.equal(m.preguntas, undefined)
  assert.equal(esPublicable(m).publicable, true)
})

test('de los umbrales salen los números y no la prosa', () => {
  const u = umbralesPublicables({
    version: 2, entidades: { proveedor: { auto: 0.95, porQue: 'medido contra DUPEC y Corralon Progreso',
      medicion: { positivos: 19, ejemplos: ['DUPEC'] } } },
    comoSeMidio: 'cruzando public.compra_sheet con los CUIT 20-28773782-4',
  })
  assert.equal(u.entidades.proveedor.auto, 0.95)
  assert.equal(u.entidades.proveedor.porQue, undefined)
  assert.equal(u.entidades.proveedor.medicion.ejemplos, undefined)
  assert.equal(u.comoSeMidio, undefined)
  assert.equal(esPublicable(u).publicable, true)
})

test('del registro sale la medición pero NO el porqué, que está escrito con ejemplos reales', () => {
  const r = registroPublicable([{ capacidad: 'embed', modelo: 'm', revision: 'r', licencia: 'MIT',
    ejecucion: 'local-cpu', estado: 'produccion', medido: { mrr: 0.18 },
    porQue: 'le ganó a granite sobre las compras de Corralon Progreso' }])
  assert.equal(r[0].porQue, undefined)
  assert.equal(r[0].tienePorQue, true)
  assert.equal(r[0].medido.mrr, 0.18)
})
