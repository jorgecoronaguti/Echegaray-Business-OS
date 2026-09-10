// LO QUE LA PUERTA DE SUBIDA TIENE QUE RECHAZAR, Y LO QUE NO PUEDE CONFUNDIR.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUCKET_POR_TIPO, CATEGORIAS_POR_TIPO, MAX_BYTES, ROTULO_CATEGORIA, archivoEntra, esCategoriaDe,
  esRutaDe, idValido, rutaDeObjeto,
} from './subidaDeDocumento.ts'

const UID = '11111111-1111-4111-8111-111111111111'
const AID = '22222222-2222-4222-8222-222222222222'

const archivo = (name: string, size = 1000, type = 'application/pdf') => ({ name, size, type })

// ── RECHAZA EL TIPO NO PERMITIDO ─────────────────────────────────────────────────────────────
// Un `.html` servido desde el origen de Storage se ejecuta en ese origen. Un `.exe` no tiene por
// qué estar en el legajo de nadie.
test('un tipo que no está en la lista blanca no entra, y el mensaje dice cuál era', () => {
  const r = archivoEntra(archivo('script.html'))
  assert.equal(r.ok, false)
  assert.match(r.error, /\.html/)
})

test('lo que el dueño nombró entra: PDF, imagen y planilla', () => {
  for (const n of ['contrato.pdf', 'foto.JPG', 'computo.xlsx', 'acta.docx']) {
    assert.equal(archivoEntra(archivo(n)).ok, true, `${n} tendría que entrar`)
  }
})

// ── RECHAZA EL TAMAÑO ────────────────────────────────────────────────────────────────────────
// El techo se comprueba acá y no se delega: la revisión del proveedor usa 50 MB, el doble. Si esta
// línea se cae, un archivo de 40 MB entra en la ficha de la obra y rebota en la de la persona.
test('arriba de 25 MB no entra, aunque el bucket de obras acepte 50', () => {
  const r = archivoEntra(archivo('plano.pdf', MAX_BYTES + 1))
  assert.equal(r.ok, false)
  assert.match(r.error, /25 MB/)
})

test('justo en el techo entra, y un archivo de 0 bytes no', () => {
  assert.equal(archivoEntra(archivo('plano.pdf', MAX_BYTES)).ok, true)
  const vacio = archivoEntra(archivo('plano.pdf', 0))
  assert.equal(vacio.ok, false)
  assert.match(vacio.error, /vac/i)
})

// ── LA RUTA ES PARTE DE LA CERRADURA ─────────────────────────────────────────────────────────
test('la ruta empieza por el uid, que es lo que exige la policy de Storage', () => {
  const r = rutaDeObjeto({ uid: UID, tipo: 'obra', entidadId: 'messina-bsa', id: AID, nombre: 'p.pdf' })
  assert.equal(r, `${UID}/obra/messina-bsa/${AID}.pdf`)
  assert.equal(esRutaDe(r, UID, 'obra', 'messina-bsa'), true)
})

// Sin este control la acción sería un ariete: mandar el `storage_path` del papel de otra obra y
// verlo aparecer en la ficha propia.
test('la ruta de otra entidad no pasa por la puerta de esta', () => {
  const r = rutaDeObjeto({ uid: UID, tipo: 'obra', entidadId: 'quattropani', id: AID, nombre: 'p.pdf' })
  assert.equal(esRutaDe(r, UID, 'obra', 'messina-bsa'), false)
  assert.equal(esRutaDe(r, AID, 'obra', 'quattropani'), false, 'otro usuario tampoco')
  assert.equal(esRutaDe(`${UID}/persona/quattropani/x.pdf`, UID, 'obra', 'quattropani'), false, 'otro tipo tampoco')
})

// `obra_canonica.id` es TEXT y sus ids son slugs. Exigir uuid para las cuatro dejaría a las obras
// —la ficha que más papeles recibe— sin poder subir nada.
test('la obra se identifica por slug y las otras tres por uuid', () => {
  assert.equal(idValido('obra', 'messina-bsa'), true)
  assert.equal(idValido('persona', 'messina-bsa'), false)
  assert.equal(idValido('persona', AID), true)
  assert.throws(() => rutaDeObjeto({ uid: 'no-es-uuid', tipo: 'obra', entidadId: 'x', id: AID, nombre: 'a.pdf' }), /usuario/)
})

// ── LAS CATEGORÍAS NO SE MEZCLAN ─────────────────────────────────────────────────────────────
test('una categoría de otra entidad no vale: un plano no existe en un proveedor', () => {
  assert.equal(esCategoriaDe('obra', 'plano'), true)
  assert.equal(esCategoriaDe('proveedor', 'plano'), false)
  assert.equal(esCategoriaDe('persona', 'libreta_ieric'), true)
  assert.equal(esCategoriaDe('obra', 'libreta_ieric'), false)
})

// Un rótulo que falta se dibuja como `undefined` en el `select` y nadie sabe qué está eligiendo.
test('cada categoría de las cuatro entidades tiene su rótulo', () => {
  for (const cats of Object.values(CATEGORIAS_POR_TIPO)) {
    for (const c of cats) assert.ok(ROTULO_CATEGORIA[c], `falta el rótulo de «${c}»`)
  }
})

test('cada entidad guarda en un bucket, y los cuatro son distintos', () => {
  const buckets = Object.values(BUCKET_POR_TIPO)
  assert.equal(new Set(buckets).size, 4)
})
