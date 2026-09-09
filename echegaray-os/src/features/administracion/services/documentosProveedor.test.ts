// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//   · QUE LA PUERTA RECHACE LO QUE EL DUEÑO PIDIÓ CARGAR. Un `.docx` llega sin `type` en varios
//     navegadores y un `.dwg` no tiene tipo registrado en ninguno. Si se copiara la lista blanca de
//     `comprobanteEntrada`, el contrato de un subcontratista rebotaría en la puerta — que es
//     exactamente el archivo por el que existe esta pantalla.
//   · QUE UN NOMBRE DE ARCHIVO ESCRIBA LA RUTA DEL BUCKET. `contrato.pdf/../otro` o una extensión
//     con barras metería una carpeta ajena en el `storage_path`, y la ruta es parte de la cerradura.
//   · QUE UNA RUTA SIN UID EMPIECE CON `/`. La primera carpeta sería la cadena vacía, la policy de
//     Storage rebotaría con «row-level security» y nadie sabría por qué.
//   · QUE LA ACCIÓN SE USE COMO ARIETE. Registrar una fila con el `storage_path` de OTRO proveedor
//     mostraría su contrato dentro de esta ficha. `esRutaDelProveedor` es la misma pregunta que hace
//     la policy, del lado del servidor.
//   · QUE UN ARCHIVO MALO VOLTEE EL LOTE, o que el sobrante se recorte en silencio: cinco contratos
//     subidos y tres guardados sin que nadie lo diga es perder papeles.
//   · QUE UN ARCHIVO DE 0 BYTES SE GUARDE. La ficha afirmaría que el respaldo existe y al bajarlo
//     estaría vacío.
//   · QUE UN «PERMISSION DENIED» SE MUESTRE CRUDO, o peor, que un error desconocido se tape con un
//     «hubo un problema» que borra el único dato útil.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIAS, MAX_ARCHIVOS, MAX_BYTES, archivoAceptable, esCategoria, esRutaDelProveedor,
  extensionDeNombre, pesoLegible, revisarLote, rutaDeDocumento, traducirError,
} from './documentosProveedor.ts'

const UID = '11111111-1111-4111-8111-111111111111'
const PROV = '22222222-2222-4222-8222-222222222222'
const DOC = '33333333-3333-4333-8333-333333333333'

// ── QUÉ ENTRA ───────────────────────────────────────────────────────────────────────────────────

test('un .docx sin tipo declarado entra igual: es lo que el dueño pidió cargar', () => {
  const r = archivoAceptable({ name: 'Contrato ACME.docx', type: '', size: 40_000 })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.mediaType, 'application/octet-stream')
})

test('un video entra y conserva su tipo', () => {
  const r = archivoAceptable({ name: 'entrega.mp4', type: 'video/mp4', size: 8_000_000 })
  assert.equal(r.ok && r.mediaType, 'video/mp4')
})

test('un tipo con parámetros se guarda sin ellos', () => {
  const r = archivoAceptable({ name: 'a.txt', type: 'text/plain; charset=utf-8', size: 10 })
  assert.equal(r.ok && r.mediaType, 'text/plain')
})

test('un tipo que no es un media type no se guarda como tipo', () => {
  const r = archivoAceptable({ name: 'raro.xyz', type: 'no es un tipo', size: 10 })
  assert.equal(r.ok && r.mediaType, 'application/octet-stream')
})

test('un archivo vacío no entra', () => {
  const r = archivoAceptable({ name: 'vacio.pdf', type: 'application/pdf', size: 0 })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /vacío/)
})

test('arriba del techo del bucket no entra, y se dice cuál', () => {
  const r = archivoAceptable({ name: 'obra.mov', type: 'video/quicktime', size: MAX_BYTES + 1 })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /obra\.mov/)
})

test('justo en el techo entra', () => {
  assert.equal(archivoAceptable({ name: 'x.pdf', type: 'application/pdf', size: MAX_BYTES }).ok, true)
})

// ── EL LOTE ─────────────────────────────────────────────────────────────────────────────────────

test('un archivo malo no voltea el lote', () => {
  const r = revisarLote([
    { name: 'contrato.pdf', type: 'application/pdf', size: 100 },
    { name: 'vacio.pdf', type: 'application/pdf', size: 0 },
    { name: 'poliza.docx', type: '', size: 200 },
  ])
  assert.equal(r.aceptados.length, 2)
  assert.equal(r.rechazados.length, 1)
  assert.match(r.aviso ?? '', /vacio\.pdf/)
})

test('el tope se cuenta sobre los aceptados y el sobrante se NOMBRA', () => {
  const buenos = Array.from({ length: MAX_ARCHIVOS }, (_, i) => ({ name: `c${i}.pdf`, type: 'application/pdf', size: 10 }))
  const r = revisarLote([{ name: 'vacio.pdf', type: 'application/pdf', size: 0 }, ...buenos, { name: 'sobra.pdf', type: 'application/pdf', size: 10 }])
  assert.equal(r.aceptados.length, MAX_ARCHIVOS)
  assert.deepEqual(r.sobrantes, ['sobra.pdf'])
  assert.match(r.aviso ?? '', /sobra\.pdf/)
})

test('un lote sano no avisa nada', () => {
  assert.equal(revisarLote([{ name: 'a.pdf', type: 'application/pdf', size: 10 }]).aviso, null)
})

// ── LA RUTA ES PARTE DE LA CERRADURA ────────────────────────────────────────────────────────────

test('la ruta es <uid>/<proveedor>/<uuid>.<ext>', () => {
  assert.equal(
    rutaDeDocumento({ uid: UID, proveedorId: PROV, id: DOC, nombre: 'Contrato ACME.PDF' }),
    `${UID}/${PROV}/${DOC}.pdf`,
  )
})

test('un nombre con barras NO puede escribir la ruta', () => {
  const ruta = rutaDeDocumento({ uid: UID, proveedorId: PROV, id: DOC, nombre: '../../otro/c.pdf' })
  assert.equal(ruta, `${UID}/${PROV}/${DOC}.pdf`)
  assert.equal(ruta.split('/').length, 3)
})

test('sin extensión legible el objeto se llama .bin, no queda sin nombre', () => {
  assert.equal(extensionDeNombre('contrato sin extension'), 'bin')
  assert.equal(extensionDeNombre('cosa.EXTENSIONLARGUISIMA'), 'bin')
  assert.equal(extensionDeNombre('plano.DWG'), 'dwg')
})

test('sin uid válido NO se arma una ruta que empiece con /', () => {
  assert.throws(
    () => rutaDeDocumento({ uid: '', proveedorId: PROV, id: DOC, nombre: 'c.pdf' }),
    /usuario/,
  )
  assert.throws(
    () => rutaDeDocumento({ uid: UID, proveedorId: 'nuevo', id: DOC, nombre: 'c.pdf' }),
    /proveedor/,
  )
})

// ── EL ARIETE ───────────────────────────────────────────────────────────────────────────────────

test('la ruta propia se acepta', () => {
  assert.equal(esRutaDelProveedor(`${UID}/${PROV}/${DOC}.pdf`, UID, PROV), true)
})

test('la ruta de OTRO proveedor no se acepta, aunque el uid sea el mío', () => {
  const otro = '44444444-4444-4444-8444-444444444444'
  assert.equal(esRutaDelProveedor(`${UID}/${otro}/${DOC}.pdf`, UID, PROV), false)
})

test('la ruta de otro usuario no se acepta', () => {
  const otroUid = '55555555-5555-4555-8555-555555555555'
  assert.equal(esRutaDelProveedor(`${otroUid}/${PROV}/${DOC}.pdf`, UID, PROV), false)
})

test('una ruta con carpetas de más no se acepta', () => {
  assert.equal(esRutaDelProveedor(`${UID}/${PROV}/sub/${DOC}.pdf`, UID, PROV), false)
  assert.equal(esRutaDelProveedor(`${UID}/${PROV}/`, UID, PROV), false)
})

// ── CATEGORÍAS ──────────────────────────────────────────────────────────────────────────────────

test('las categorías son las cinco del CHECK de la tabla', () => {
  assert.deepEqual([...CATEGORIAS], ['contrato', 'seguro', 'habilitacion', 'factura_modelo', 'otro'])
  assert.equal(esCategoria('contrato'), true)
  assert.equal(esCategoria('cualquiera'), false)
  assert.equal(esCategoria(null), false)
})

// ── LO QUE SE LE DICE A LA PERSONA ──────────────────────────────────────────────────────────────

test('un permission denied se traduce; un error desconocido llega entero', () => {
  assert.match(traducirError('new row violates row-level security policy'), /no tiene permiso/)
  assert.equal(traducirError('se cayó el pooler en us-east-1'), 'se cayó el pooler en us-east-1')
})

test('el peso se lee en KB o en MB, y sin bytes no inventa un cero', () => {
  assert.equal(pesoLegible(2048), '2 KB')
  assert.equal(pesoLegible(3 * 1024 * 1024), '3.0 MB')
  assert.equal(pesoLegible(0), '—')
})
