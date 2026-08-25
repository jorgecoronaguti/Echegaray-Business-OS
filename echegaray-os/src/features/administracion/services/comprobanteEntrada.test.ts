// EL DEFECTO QUE ESTOS TESTS ATRAPAN
//
//  1. Rechazar el HEIC del iPhone en la puerta. Es el formato POR DEFECTO de esa cámara y Safari lo
//     manda con `type` vacío o `application/octet-stream`. Validando sólo por `file.type`, el archivo
//     más común del dueño no se podría subir — y el error diría «no es una foto» sobre una foto. Es
//     el mismo defecto que el bot pagó el 13/08: siete de ocho archivos eran .HEIC y cinco se
//     perdieron en silencio.
//  2. Pintar «Cargado» y «Ya estaba» igual. Uno agregó una fila al libro de la empresa y el otro no
//     escribió nada: subir diez comprobantes ya cargados se vería como diez gastos nuevos.
//  3. Pintar «Falta algo» como error, que manda a volver a subir el mismo archivo — lo único que
//     seguro no ayuda cuando lo que falta es que Dirección levante el freno de Sheets.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  archivoAceptable, EN_CURSO, ESTADOS, extensionDe, hayTrabajoEnCurso, MAX_BYTES, ROTULO,
} from './comprobanteEntrada.ts'

test('acepta el HEIC del iPhone aunque el navegador no declare el tipo', () => {
  assert.deepEqual(archivoAceptable({ name: 'IMG_7572.HEIC', type: '', size: 900_000 }),
    { ok: true, mediaType: 'image/heic' })
  assert.deepEqual(archivoAceptable({ name: 'IMG_7572.heic', type: 'application/octet-stream', size: 900_000 }),
    { ok: true, mediaType: 'image/heic' })
})

test('acepta lo que el circuito sabe mirar', () => {
  for (const [nombre, tipo] of [['f.jpg', 'image/jpeg'], ['f.png', 'image/png'], ['f.pdf', 'application/pdf']]) {
    assert.equal(archivoAceptable({ name: nombre, type: tipo, size: 100 }).ok, true, nombre)
  }
})

test('rechaza lo que el circuito no podría leer, y nombra el archivo', () => {
  const r = archivoAceptable({ name: 'planilla.xlsx', type: 'application/vnd.ms-excel', size: 100 })
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.error.includes('planilla.xlsx'))
})

test('rechaza el archivo vacío y el que pasa el techo del modelo de visión', () => {
  assert.equal(archivoAceptable({ name: 'f.jpg', type: 'image/jpeg', size: 0 }).ok, false)
  assert.equal(archivoAceptable({ name: 'f.jpg', type: 'image/jpeg', size: MAX_BYTES + 1 }).ok, false)
  assert.equal(archivoAceptable({ name: 'f.jpg', type: 'image/jpeg', size: MAX_BYTES }).ok, true)
})

test('la extensión del nombre en Storage sale del TIPO, no del nombre que vino', () => {
  assert.equal(extensionDe('image/jpeg'), 'jpg')
  assert.equal(extensionDe('application/pdf'), 'pdf')
  assert.equal(extensionDe('image/heic'), 'heic')
})

test('los rótulos cubren todos los estados que la base permite', () => {
  for (const e of ESTADOS) assert.ok(ROTULO[e], `falta el rótulo de «${e}»`)
})

test('«Cargado» y «Ya estaba» no dicen lo mismo', () => {
  assert.notEqual(ROTULO.cargado.texto, ROTULO.ya_estaba.texto)
  assert.match(ROTULO.ya_estaba.ayuda, /no se duplic/i)
})

test('«Falta algo» no se pinta como error: el comprobante sigue vivo', () => {
  assert.equal(ROTULO.en_espera.tono, 'warn')
  assert.equal(ROTULO.rechazado.tono, 'neg')
  assert.ok(!EN_CURSO.includes('en_espera'))
})

test('la pantalla sólo refresca mientras haya algo en curso', () => {
  assert.equal(hayTrabajoEnCurso([{ estado: 'cargado' }, { estado: 'en_espera' }]), false)
  assert.equal(hayTrabajoEnCurso([{ estado: 'cargado' }, { estado: 'procesando' }]), true)
  assert.equal(hayTrabajoEnCurso([]), false)
})
