// EL HEIC DEL IPHONE, CONTRA UN ARCHIVO HEIC DE VERDAD.
//
// La muestra de `fixtures/muestra.heic` es un HEIC real (ISO Media, HEIF Image, 718 KB). No es un
// buffer inventado: si el convertidor no está o el build no soporta HEVC, este test se pone rojo, que
// es exactamente lo que tiene que pasar antes de que el bot le diga al dueño que cargó su foto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  prepararParaVision, hayQueConvertir, MEDIA_CONVERTIBLES, MEDIA_DESTINO, MOTIVO, LADO_MAXIMO,
} from './imagen.mjs'
import { MEDIA_ACEPTADOS, MEDIA_SOPORTADOS, tipoPorExtension } from './lectura.mjs'
import { bloqueAdjunto } from './vision.mjs'

const HEIC = readFileSync(new URL('./fixtures/muestra.heic', import.meta.url)).toString('base64')

test('un .HEIC REAL entra y sale como JPEG que la API puede mirar', async () => {
  const r = await prepararParaVision({ data: HEIC, mediaType: 'image/heic', nombre: 'IMG_7572.HEIC' })
  assert.equal(r.ok, true, `no se pudo convertir: ${r.error ?? ''}`)
  assert.equal(r.mediaType, MEDIA_DESTINO)
  assert.equal(r.convertidoDe, 'image/heic', 'se declara de qué venía: el dueño tiene que poder entenderlo')
  // Los dos primeros bytes de un JPEG son FF D8. Que el tipo diga "jpeg" no prueba que lo sea.
  const bytes = Buffer.from(r.data, 'base64')
  assert.equal(bytes[0], 0xFF)
  assert.equal(bytes[1], 0xD8)
  assert.ok(bytes.length > 1000, 'un JPEG de 1 KB no es una factura legible')
  // Y el bloque que va a la API lo acepta: es la puerta que rechazaba el HEIC.
  const bloque = bloqueAdjunto(r)
  assert.equal(bloque?.type, 'image')
  assert.equal(bloque.source.media_type, 'image/jpeg')
})

test('el JPEG sale ACOTADO: no se mandan 12 megapíxeles del iPhone para leer ocho dígitos', async () => {
  const r = await prepararParaVision({ data: HEIC, mediaType: 'image/heic', nombre: 'IMG_7572.HEIC' })
  assert.equal(r.ok, true)
  const sharp = await import('sharp').then((m) => m.default).catch(() => null)
  if (!sharp) return  // sin sharp se manda igual, sólo más pesado: no es un fallo del producto
  const meta = await sharp(Buffer.from(r.data, 'base64')).metadata()
  assert.ok(Math.max(meta.width, meta.height) <= LADO_MAXIMO, `quedó en ${meta.width}x${meta.height}`)
})

test('lo que YA se puede mirar pasa tal cual: esto no toca lo que andaba', async () => {
  const r = await prepararParaVision({ data: 'AAAA', mediaType: 'image/jpeg', nombre: 'x.jpg' })
  assert.equal(r.ok, true)
  assert.equal(r.data, 'AAAA')
  assert.equal(r.convertidoDe, undefined)
  const p = await prepararParaVision({ data: 'BBBB', mediaType: 'application/pdf', nombre: 'f.pdf' })
  assert.equal(p.ok, true)
  assert.equal(p.mediaType, 'application/pdf')
})

test('sin convertidor NO se simula que anda: se devuelve un motivo que se le puede leer al dueño', async () => {
  const r = await prepararParaVision({ data: HEIC, mediaType: 'image/heic' }, { convertir: null })
  assert.equal(r.ok, false)
  assert.equal(r.error, MOTIVO.SIN_CONVERSOR)
  assert.match(r.error, /HEIC/, 'el motivo tiene que nombrar el formato')
  assert.match(r.error, /JPG|compatible/i, 'y decirle qué hacer, no sólo que falló')
})

test('un convertidor que revienta devuelve motivo, no una excepción', async () => {
  const r = await prepararParaVision(
    { data: HEIC, mediaType: 'image/heic' },
    { convertir: async () => { throw new Error('libde265 se cayó') } },
  )
  assert.equal(r.ok, false)
  assert.match(r.error, /no pude convertir/i)
  assert.match(r.error, /libde265/)
})

test('un HEIC vacío no se da por convertido', async () => {
  const r = await prepararParaVision({ data: HEIC, mediaType: 'image/heic' }, { convertir: async () => Buffer.alloc(0) })
  assert.equal(r.ok, false)
})

// ── LA PUERTA DE ENTRADA ────────────────────────────────────────────────────

test('HEIC y HEIF se ACEPTAN en el canal, aunque la API no los mire directo', () => {
  for (const t of MEDIA_CONVERTIBLES) {
    assert.equal(MEDIA_ACEPTADOS.includes(t), true, `${t} se seguiría descartando en la puerta`)
    assert.equal(MEDIA_SOPORTADOS.includes(t), false, `${t} NO lo puede mirar la API: hay que convertirlo`)
    assert.equal(hayQueConvertir(t), true)
  }
  assert.equal(hayQueConvertir('image/jpeg'), false)
  assert.equal(hayQueConvertir('IMAGE/HEIC; charset=binary'), true, 'el mime viene con mayúsculas y parámetros')
})

test('el tipo se reconoce por la EXTENSIÓN cuando Mattermost no lo declara', () => {
  assert.equal(tipoPorExtension('IMG_7572.HEIC'), 'image/heic')
  assert.equal(tipoPorExtension('img_7573.heic'), 'image/heic')
  assert.equal(tipoPorExtension('IMG_7574.jpg'), 'image/jpeg')
  assert.equal(tipoPorExtension('23284752589_011_00002.pdf'), 'application/pdf')
  assert.equal(tipoPorExtension('planilla.xlsx'), null, 'lo que no se puede mirar sigue sin poder mirarse')
  assert.equal(tipoPorExtension(''), null)
})

test('bloqueAdjunto sigue rechazando HEIC crudo: la API no lo acepta y no se le manda igual', () => {
  assert.equal(bloqueAdjunto({ data: HEIC, mediaType: 'image/heic' }), null)
})
