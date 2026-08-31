// EL BORDE DEL MOTOR DE PRESENTACIONES.
//
// Los tests del motor de composición viven en `lib/slides/slides.test.mjs` y no se tocan acá: esto
// prueba lo que agrega el borde —idempotencia, actualización, fallos con nombre, mirar el render—
// más UNA regresión de numeración que se encontró mirando el PNG que devolvió Google.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componerDeck } from '../slides/plantillas.mjs'
import { actualizarPresentacion, crearPresentacion, exportarPresentacion, mirarPresentacion, prepararPresentacion } from './presentacion-motor.mjs'
import { dobleDrive, errorHttp } from './doble-drive.apoyo.mjs'

const DECK = {
  tipo: 'AVANCE_OBRA', titulo: 'Avance de prueba', obra: 'Obra', cliente: 'Cliente',
  laminas: [
    { tipo: 'puntos', titulo: 'Ejecutado', puntos: ['uno', 'dos'] },
    { tipo: 'tabla', titulo: 'Números', columnas: ['A', 'B'], filas: [['1', '2']] },
    { tipo: 'puntos', titulo: 'Próximo', puntos: ['tres'] },
  ],
}
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG'), Buffer.alloc(20)])

test('el pie numera sobre el total REAL del mazo, portada incluida', () => {
  // ENCONTRADO MIRANDO EL RENDER: en un mazo de 5 láminas, la tercera decía «3 / 6». El total se
  // pasaba con un +1 de más. Un número de página equivocado en una presentación que se le manda a
  // un cliente hace dudar de todo lo demás que dice la lámina.
  const compuesto = componerDeck(DECK)
  const pies = compuesto.laminas.flatMap((l) => l.cajas.filter((c) => /^\d+ \/ \d+$/.test(String(c.contenido ?? ''))))
  assert.ok(pies.length >= 3, 'las láminas de contenido llevan pie numerado')
  for (const p of pies) {
    const [n, total] = String(p.contenido).split(' / ').map(Number)
    assert.equal(total, compuesto.laminas.length, `el pie dice ${total} y el mazo tiene ${compuesto.laminas.length}`)
    assert.ok(n <= total, `la lámina ${n} no puede ser mayor que el total ${total}`)
  }
})

test('previsualizar no toca nada y un contenido inválido no llega a Drive', () => {
  const r = prepararPresentacion({ ...DECK, laminas: [] })
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'INVALID_CONTENT')
  assert.equal(prepararPresentacion(DECK).ok, true)
})

test('el reintento devuelve la MISMA presentación', async () => {
  let creada = null
  const g = dobleDrive({
    buscarPorPropiedad: () => (creada ? [creada] : []),
    crearPresentacionVacia: (name) => { creada = { id: 'pres_1', name }; return { ...creada, link: 'l', laminaInicial: 'p0' } },
    slidesBatchUpdate: {},
    leerPresentacion: { slides: [{ objectId: 'a' }, { objectId: 'b' }, { objectId: 'c' }, { objectId: 'd' }], pageSize: {} },
    marcarArchivo: {},
    exportarPdfBytes: Buffer.from('%PDF-1.4 Avance de prueba Ejecutado Números Próximo'),
  })
  const uno = await crearPresentacion(g, { contenido: DECK, clave: 'avance-agosto' })
  const dos = await crearPresentacion(g, { contenido: DECK, clave: 'avance-agosto' })
  assert.equal(uno.ok, true, JSON.stringify(uno))
  assert.equal(uno.reutilizado, false)
  assert.equal(dos.reutilizado, true)
  assert.equal(g.veces('crearPresentacionVacia'), 1)
})

test('actualizar borra y crea en UN solo batch: los objectId se repiten y un batch vacío rompería el archivo', async () => {
  const lotes = []
  const g = dobleDrive({
    leerPresentacion: { slides: [{ objectId: 'ecspag001' }, { objectId: 'ecspag002' }], pageSize: {} },
    slidesBatchUpdate: (_id, reqs) => { lotes.push(reqs); return {} },
    exportarPdfBytes: Buffer.from('%PDF Avance de prueba Ejecutado Números Próximo'),
  })
  const r = await actualizarPresentacion(g, 'pres_1', DECK)
  const primero = lotes[0]
  assert.equal(primero.filter((q) => q.deleteObject).length, 2)
  assert.ok(primero.findIndex((q) => q.createSlide) > primero.findLastIndex((q) => q.deleteObject),
    'los borrados van ANTES que las altas dentro del mismo lote')
  assert.equal(r.ok, false, 'Google devolvió 2 láminas y se pidieron 4')
  assert.equal(r.codigo, 'WRITE_NOT_PERSISTED')
})

test('mirar el render baja los BYTES: una URL no es haber visto la lámina', async () => {
  const g = dobleDrive({
    leerPresentacion: { slides: [{ objectId: 'a' }] },
    miniaturaDeLamina: { url: 'https://ejemplo.invalid/x.png', ancho: 1, alto: 1 },
  })
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ arrayBuffer: async () => PNG })
  try {
    const r = await mirarPresentacion(g, 'pres_1')
    assert.equal(r.ok, true)
    assert.equal(r.laminas[0].png, true)
    assert.equal(r.laminas[0].bytes, PNG.length)

    // Y lo que atrapa el caso feo: Google devuelve 200 con una página de error en vez del PNG.
    globalThis.fetch = async () => ({ arrayBuffer: async () => Buffer.from('<html>error</html>') })
    const malo = await mirarPresentacion(g, 'pres_1')
    assert.equal(malo.codigo, 'WRITE_NOT_PERSISTED')
  } finally { globalThis.fetch = original }
})

test('exportar: sólo PDF, y sin cuenta de Google no se afirma nada', async () => {
  const g = dobleDrive({ exportarPdfBytes: Buffer.from('%PDF') })
  assert.equal((await exportarPresentacion(g, 'p', { formato: 'pptx' })).codigo, 'UNSUPPORTED_OPERATION')
  assert.equal((await exportarPresentacion(g, 'p')).bytes, 4)
  assert.equal((await exportarPresentacion({}, 'p')).codigo, 'DRIVE_UNAVAILABLE')
  const caido = dobleDrive({ exportarPdfBytes: errorHttp(503) })
  assert.equal((await exportarPresentacion(caido, 'p')).codigo, 'DRIVE_UNAVAILABLE')
})
