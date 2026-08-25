// EL DEFECTO QUE ESTOS TESTS ATRAPAN
//
//  1. Que un archivo malo voltee el lote entero. Con cinco fotos y un `.xlsx` colado, la versión
//     anterior bloqueaba el botón para las seis: con el papel en la mano eso se lee como «no anda».
//  2. Que el archivo 13 desaparezca en silencio. El `.slice(0, MAX_ARCHIVOS)` anterior recortaba sin
//     decir nada: tres facturas perdidas y nadie se entera hasta que faltan en el libro.
//  3. Que la ruta no empiece EXACTAMENTE con el uid. La policy `comprobantes_sube_administracion`
//     exige `(storage.foldername(name))[1] = auth.uid()::text`. Un uid vacío arma `/lote/x.jpg`,
//     Storage contesta «row-level security» y la pantalla muestra «no tenés permiso» a alguien que sí
//     lo tiene. El error tiene que salir donde se puede explicar.
//  4. Que la extensión del objeto salga del nombre que trajo el teléfono en vez del media type. Un
//     `.HEIC` que Safari manda con `type` vacío tiene que quedar guardado como `.heic`.
//  5. Que un lote a medias diga UNA sola cosa. Sólo el verde = dos facturas que alguien cree
//     cargadas y no están. Sólo el rojo = vuelve a subir las cinco y el OS relee tres.
//  6. Que un error desconocido de Storage se tape con «hubo un problema»: se pierde el único dato
//     que sirve para arreglarlo.
//  7. Que doce archivos de 5 MB salgan juntos por la red de un celular y se pisen.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ARCHIVOS } from './comprobanteEntrada.ts'
import {
  enParalelo, esRutaDelUsuario, repartirResultados, revisarLote, rutaDeComprobante, traducirError,
} from './subidaComprobantes.ts'

const UID = '11111111-2222-4333-8444-555555555555'
const LOTE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ID = '99999999-8888-4777-8666-555555555555'

const foto = (name: string, extra: { type?: string; size?: number } = {}) =>
  ({ name, type: extra.type ?? 'image/jpeg', size: extra.size ?? 200_000 })

// ── revisarLote ─────────────────────────────────────────────────────────────────────────────────

test('un archivo que no sirve no voltea a los demás: se nombra y los otros siguen', () => {
  const r = revisarLote([foto('a.jpg'), foto('planilla.xlsx', { type: 'application/vnd.ms-excel' }), foto('b.jpg')])
  assert.deepEqual(r.aceptados.map((a) => a.archivo.name), ['a.jpg', 'b.jpg'])
  assert.equal(r.rechazados.length, 1)
  assert.ok(r.aviso?.includes('planilla.xlsx'), `el aviso tiene que nombrar el archivo: ${r.aviso}`)
})

test('el HEIC del iPhone entra por la puerta aunque el navegador no declare el tipo', () => {
  const r = revisarLote([foto('IMG_7572.HEIC', { type: '' })])
  assert.equal(r.aceptados.length, 1)
  assert.equal(r.aceptados[0].mediaType, 'image/heic')
  assert.equal(r.aviso, null)
})

test('la foto de 4,4 MB que rompía la pantalla ahora entra; la de 6 MB se rechaza con motivo', () => {
  const r = revisarLote([foto('celular.jpg', { size: 4_480_587 }), foto('enorme.jpg', { size: 6_000_000 })])
  assert.deepEqual(r.aceptados.map((a) => a.archivo.name), ['celular.jpg'])
  assert.ok(r.aviso?.includes('enorme.jpg'))
})

test('lo que pasa el tope por tanda se NOMBRA, no se recorta en silencio', () => {
  const muchas = Array.from({ length: MAX_ARCHIVOS + 2 }, (_, i) => foto(`f${i}.jpg`))
  const r = revisarLote(muchas)
  assert.equal(r.aceptados.length, MAX_ARCHIVOS)
  assert.deepEqual(r.sobrantes, [`f${MAX_ARCHIVOS}.jpg`, `f${MAX_ARCHIVOS + 1}.jpg`])
  assert.ok(r.aviso?.includes(`f${MAX_ARCHIVOS}.jpg`) && r.aviso.includes(`f${MAX_ARCHIVOS + 1}.jpg`))
})

test('el tope cuenta los ACEPTADOS: un archivo malo no empuja afuera a uno bueno', () => {
  const malos = Array.from({ length: 3 }, (_, i) => foto(`m${i}.xlsx`, { type: 'application/vnd.ms-excel' }))
  const buenos = Array.from({ length: MAX_ARCHIVOS }, (_, i) => foto(`b${i}.jpg`))
  const r = revisarLote([...malos, ...buenos])
  assert.equal(r.aceptados.length, MAX_ARCHIVOS)
  assert.deepEqual(r.sobrantes, [])
})

test('sin nada que avisar, no hay aviso', () => {
  assert.equal(revisarLote([foto('a.jpg')]).aviso, null)
  assert.equal(revisarLote([]).aviso, null)
})

// ── rutaDeComprobante ───────────────────────────────────────────────────────────────────────────

test('la ruta es <uid>/<lote>/<uuid>.<ext> y la primera carpeta es el uid, que es lo que mira la policy', () => {
  const ruta = rutaDeComprobante({ uid: UID, lote: LOTE, id: ID, mediaType: 'image/jpeg' })
  assert.equal(ruta, `${UID}/${LOTE}/${ID}.jpg`)
  assert.equal(ruta.split('/')[0], UID)
  assert.equal(ruta.split('/').length, 3)
})

test('la extensión sale del media type, no del nombre que trajo el teléfono', () => {
  assert.match(rutaDeComprobante({ uid: UID, lote: LOTE, id: ID, mediaType: 'image/heic' }), /\.heic$/)
  assert.match(rutaDeComprobante({ uid: UID, lote: LOTE, id: ID, mediaType: 'application/pdf' }), /\.pdf$/)
})

test('un uid vacío no arma una ruta que Storage rechazaría con «row-level security»', () => {
  assert.throws(() => rutaDeComprobante({ uid: '', lote: LOTE, id: ID, mediaType: 'image/jpeg' }), /usuario/)
  assert.throws(() => rutaDeComprobante({ uid: UID, lote: 'x', id: ID, mediaType: 'image/jpeg' }), /lote/)
  assert.throws(() => rutaDeComprobante({ uid: UID, lote: LOTE, id: '../otro', mediaType: 'image/jpeg' }), /archivo/)
})

test('esRutaDelUsuario contesta lo mismo que storage.foldername(name)[1] = auth.uid()', () => {
  assert.equal(esRutaDelUsuario(`${UID}/${LOTE}/${ID}.jpg`, UID), true)
  assert.equal(esRutaDelUsuario(`${LOTE}/${LOTE}/${ID}.jpg`, UID), false)
  assert.equal(esRutaDelUsuario(`/${LOTE}/${ID}.jpg`, ''), false)
})

// ── repartirResultados ──────────────────────────────────────────────────────────────────────────

const ok = (id: string, nombre: string) => ({ id, nombre, ok: true as const })
const mal = (id: string, nombre: string, error: string) => ({ id, nombre, ok: false as const, error })

test('un lote a medias dice LAS DOS COSAS: cuántos entraron y cuál no, con su motivo', () => {
  const r = repartirResultados([ok('1', 'a.jpg'), mal('2', 'b.jpg', 'Se cortó la conexión.'), ok('3', 'c.jpg')])
  assert.equal(r.subidos, 2)
  assert.equal(r.fallidos, 1)
  assert.ok(r.mensaje?.includes('2 de 3'), `el verde tiene que decir cuántos de cuántos: ${r.mensaje}`)
  assert.ok(r.error?.includes('b.jpg'), `el rojo tiene que nombrar el archivo: ${r.error}`)
  assert.ok(r.error?.includes('Se cortó la conexión.'), 'y decir por qué')
})

test('cuando entran todos no hay rojo, y cuando no entra ninguno no hay verde', () => {
  const todos = repartirResultados([ok('1', 'a.jpg'), ok('2', 'b.jpg')])
  assert.equal(todos.error, null)
  assert.match(todos.mensaje ?? '', /2 comprobantes subidos/)

  const ninguno = repartirResultados([mal('1', 'a.jpg', 'No tenés permiso.')])
  assert.equal(ninguno.mensaje, null)
  assert.ok(ninguno.error?.includes('a.jpg'))
})

test('un solo comprobante se dice en singular', () => {
  assert.match(repartirResultados([ok('1', 'a.jpg')]).mensaje ?? '', /^Subido\./)
})

test('sin resultados no se afirma nada', () => {
  assert.deepEqual(repartirResultados([]), { subidos: 0, fallidos: 0, mensaje: null, error: null })
})

// ── traducirError ───────────────────────────────────────────────────────────────────────────────

test('el error de RLS se traduce a lo que la persona puede hacer', () => {
  assert.match(traducirError('new row violates row-level security policy'), /no tiene permiso/i)
  assert.match(traducirError('permission denied for table comprobante_entrada'), /no tiene permiso/i)
})

test('un error que no se reconoce se muestra TAL CUAL: taparlo esconde el único dato útil', () => {
  assert.equal(traducirError('Storage devolvió 507 sin cuerpo'), 'Storage devolvió 507 sin cuerpo')
})

test('los errores conocidos de Storage se dicen en castellano', () => {
  assert.match(traducirError('Bucket not found'), /depósito de comprobantes/i)
  assert.match(traducirError('The object exceeded the maximum allowed size'), /5 MB/)
  assert.match(traducirError('mime type application/zip is not supported'), /JPG/)
  assert.match(traducirError('Failed to fetch'), /conexión/i)
  assert.match(traducirError('duplicate key value violates unique constraint'), /ya estaba/i)
})

// ── enParalelo ──────────────────────────────────────────────────────────────────────────────────

test('nunca hay más archivos en vuelo que el tope, y el orden de salida es el de entrada', async () => {
  let enVuelo = 0
  let pico = 0
  const items = Array.from({ length: 9 }, (_, i) => i)
  const salida = await enParalelo(items, 3, async (n) => {
    enVuelo += 1
    pico = Math.max(pico, enVuelo)
    await new Promise((r) => setTimeout(r, n === 0 ? 25 : 1))
    enVuelo -= 1
    return n * 10
  })
  assert.equal(pico, 3, `nunca más de 3 a la vez, hubo ${pico}`)
  assert.deepEqual(salida, items.map((n) => n * 10))
})

test('un archivo lento no bloquea a los que vienen atrás', async () => {
  const orden: number[] = []
  await enParalelo([0, 1, 2], 3, async (n) => {
    await new Promise((r) => setTimeout(r, n === 0 ? 20 : 1))
    orden.push(n)
  })
  assert.deepEqual(orden, [1, 2, 0], 'el lento termina último aunque haya salido primero')
})

test('con menos archivos que el tope no se abren obreros de más, y con cero no se abre ninguno', async () => {
  assert.deepEqual(await enParalelo([], 3, async () => 1), [])
  assert.deepEqual(await enParalelo([7], 3, async (n) => n + 1), [8])
})
