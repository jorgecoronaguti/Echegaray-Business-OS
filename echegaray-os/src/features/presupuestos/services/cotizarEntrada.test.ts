// LA LÓGICA PURA DE `POST/GET /api/presupuestos/cotizar` — el hueco que quedó declarado al cerrar
// el cotizador asíncrono: las dos rutas no tenían test propio. Cubre el schema de entrada (adjuntos
// válidos/inválidos, tope de 10, tope de tamaño), el hash sha256 (ya existía en la ruta, sin test),
// y el mapeo de errores del RPC a códigos HTTP.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  AdjuntoEntradaSchema, EntradaCotizarSchema, IdLecturaSchema,
  hashDeAdjunto, adjuntosConHash, clasificarErrorRpc, TOPE_ADJUNTOS, TOPE_BASE64,
} from './cotizarEntrada.ts'

const ADJUNTO_OK = { nombre: 'plano.pdf', contenido_base64: 'QUJD' } // 'ABC' en base64

// ── EL SCHEMA DE ENTRADA ────────────────────────────────────────────────────────────────────────

test('un adjunto válido pasa', () => {
  const r = AdjuntoEntradaSchema.safeParse(ADJUNTO_OK)
  assert.equal(r.success, true)
})

test('un adjunto sin nombre se rechaza', () => {
  const r = AdjuntoEntradaSchema.safeParse({ nombre: '', contenido_base64: 'QUJD' })
  assert.equal(r.success, false)
})

test('un adjunto con contenido_base64 vacío se rechaza (min 1)', () => {
  const r = AdjuntoEntradaSchema.safeParse({ nombre: 'x.pdf', contenido_base64: '' })
  assert.equal(r.success, false)
})

test('un adjunto que supera el tope de base64 se rechaza', () => {
  const r = AdjuntoEntradaSchema.safeParse({ nombre: 'x.pdf', contenido_base64: 'A'.repeat(TOPE_BASE64 + 1) })
  assert.equal(r.success, false)
})

test('un adjunto justo en el tope de base64 pasa', () => {
  const r = AdjuntoEntradaSchema.safeParse({ nombre: 'x.pdf', contenido_base64: 'A'.repeat(TOPE_BASE64) })
  assert.equal(r.success, true)
})

test('un nombre de más de 200 caracteres se rechaza', () => {
  const r = AdjuntoEntradaSchema.safeParse({ nombre: 'x'.repeat(201), contenido_base64: 'QUJD' })
  assert.equal(r.success, false)
})

test('la entrada completa: mensaje opcional, al menos un adjunto', () => {
  const sinMensaje = EntradaCotizarSchema.safeParse({ adjuntos: [ADJUNTO_OK] })
  assert.equal(sinMensaje.success, true)
  const conMensaje = EntradaCotizarSchema.safeParse({ mensaje: 'cotizame esto', adjuntos: [ADJUNTO_OK] })
  assert.equal(conMensaje.success, true)
})

test('sin adjuntos se rechaza con el mismo mensaje que el RPC', () => {
  const r = EntradaCotizarSchema.safeParse({ adjuntos: [] })
  assert.equal(r.success, false)
  assert.equal(r.error?.issues[0]?.message, 'necesito al menos un plano adjunto')
})

test(`hasta ${TOPE_ADJUNTOS} adjuntos pasan, ${TOPE_ADJUNTOS + 1} se rechazan`, () => {
  const enElTope = Array.from({ length: TOPE_ADJUNTOS }, (_, i) => ({ ...ADJUNTO_OK, nombre: `p${i}.pdf` }))
  assert.equal(EntradaCotizarSchema.safeParse({ adjuntos: enElTope }).success, true)
  const pasado = Array.from({ length: TOPE_ADJUNTOS + 1 }, (_, i) => ({ ...ADJUNTO_OK, nombre: `p${i}.pdf` }))
  assert.equal(EntradaCotizarSchema.safeParse({ adjuntos: pasado }).success, false)
})

test('un mensaje de más de 2000 caracteres se rechaza', () => {
  const r = EntradaCotizarSchema.safeParse({ mensaje: 'x'.repeat(2001), adjuntos: [ADJUNTO_OK] })
  assert.equal(r.success, false)
})

test('un adjunto inválido dentro del array tumba la entrada entera', () => {
  const r = EntradaCotizarSchema.safeParse({ adjuntos: [ADJUNTO_OK, { nombre: '', contenido_base64: 'x' }] })
  assert.equal(r.success, false)
})

// ── EL ID DE LA LECTURA (GET) ───────────────────────────────────────────────────────────────────

test('un uuid válido pasa', () => {
  assert.equal(IdLecturaSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success, true)
})

test('cualquier cosa que no sea uuid se rechaza (incluida una inyección de ruta)', () => {
  for (const invalido of ['', 'no-es-un-uuid', '123', '../../../etc/passwd', "1' OR '1'='1"]) {
    assert.equal(IdLecturaSchema.safeParse(invalido).success, false, `"${invalido}" pasó como uuid`)
  }
})

// ── EL HASH SHA256 ──────────────────────────────────────────────────────────────────────────────

test('el hash es sha256 del binario decodificado, igual que hashDe() de xsas-archivos.mjs', () => {
  const base64 = Buffer.from('contenido de prueba').toString('base64')
  const esperado = createHash('sha256').update(Buffer.from('contenido de prueba')).digest('hex')
  assert.equal(hashDeAdjunto(base64), esperado)
  assert.equal(hashDeAdjunto(base64).length, 64)
  assert.match(hashDeAdjunto(base64), /^[0-9a-f]{64}$/)
})

test('el mismo contenido produce siempre el mismo hash (identidad estable)', () => {
  const base64 = Buffer.from('mismo plano, dos subidas').toString('base64')
  assert.equal(hashDeAdjunto(base64), hashDeAdjunto(base64))
})

test('contenidos distintos producen hashes distintos', () => {
  const a = hashDeAdjunto(Buffer.from('plano A').toString('base64'))
  const b = hashDeAdjunto(Buffer.from('plano B').toString('base64'))
  assert.notEqual(a, b)
})

test('adjuntosConHash arma exactamente el shape que espera p_adjuntos del RPC', () => {
  const entrada = [{ nombre: 'plano.pdf', contenido_base64: 'QUJD' }]
  const [salida] = adjuntosConHash(entrada)
  assert.deepEqual(Object.keys(salida).sort(), ['contenido_base64', 'hash', 'nombre'])
  assert.equal(salida.nombre, 'plano.pdf')
  assert.equal(salida.contenido_base64, 'QUJD')
  assert.match(salida.hash, /^[0-9a-f]{64}$/)
})

// ── EL MAPEO DE ERRORES RPC/POSTGRES → HTTP ─────────────────────────────────────────────────────

test('P0001 (el raise exception del RPC) es siempre 400 con el texto tal cual', () => {
  const r = clasificarErrorRpc({ code: 'P0001', message: 'necesito al menos un plano adjunto' })
  assert.equal(r.status, 400)
  assert.equal(r.motivo, 'necesito al menos un plano adjunto')
})

test('sin código (la conexión ni respondió) es 502, no expone el detalle crudo', () => {
  const r = clasificarErrorRpc({ message: 'fetch failed' })
  assert.equal(r.status, 502)
  assert.equal(r.motivo, 'no se pudo alcanzar la base — reintentá')
})

test('un código de la clase 08 (connection_exception) es 502', () => {
  const r = clasificarErrorRpc({ code: '08006', message: 'connection failure' })
  assert.equal(r.status, 502)
})

test('cualquier otro código de Postgres (columna que no existe, permiso denegado) es 500', () => {
  for (const code of ['42703', '42501', '23505', 'XX000']) {
    const r = clasificarErrorRpc({ code, message: 'detalle interno que no se le muestra al usuario' })
    assert.equal(r.status, 500, `code=${code}`)
    assert.equal(r.motivo, 'error inesperado del servidor', 'el 500 no debe filtrar el mensaje crudo de Postgres')
  }
})

test('sin mensaje, el motivo tiene un default legible en vez de quedar vacío', () => {
  const r = clasificarErrorRpc({ code: 'P0001', message: '' })
  assert.equal(r.motivo, 'error desconocido del servidor')
  const r2 = clasificarErrorRpc({ code: 'P0001', message: '   ' })
  assert.equal(r2.motivo, 'error desconocido del servidor')
})
