import test from 'node:test'
import assert from 'node:assert/strict'
import {
  conceptosInternosPublicados, esNotaInterna, rotuloPublicable,
} from './rotulo-publicable.mjs'

// LO QUE ATRAPA: que el portal vuelva a publicarle al cliente una nota escrita para adentro, y —al
// revés, que es el riesgo caro— que el filtro se coma un concepto que describe el trabajo.

test('EL DEFECTO DE ARCOR: «RECLAMAR OC!» no es un concepto de cobro', () => {
  assert.equal(esNotaInterna('RECLAMAR OC!'), true)
})

test('los conceptos REALES de ARCOR se publican tal cual: el filtro no puede comerse el trabajo', () => {
  // Los cuatro salen de la pestaña Cobranzas del 10/09/2026. Ninguno nombra obra, OC ni factura, y
  // los cuatro dicen exactamente qué se hizo: por eso el criterio «no nombra obra/OC/factura» quedó
  // descartado y está dicho en el encabezado del módulo.
  for (const c of ['BACHEO', 'Compactacion de Terrenos', 'Rep de pisos - "canalizacion"',
    'Reparación cielorraso de vestuario', 'Cambio de cortina', 'Camión Regador']) {
    assert.equal(esNotaInterna(c), false, `«${c}» es el trabajo, no una nota`)
    assert.equal(rotuloPublicable({ concepto: c, obraNombre: 'ARCOR', fecha: '2026-04-01' }), c)
  }
})

test('un imperativo en MAYÚSCULAS es una orden para adentro; en minúsculas es una descripción', () => {
  assert.equal(esNotaInterna('PEDIR FACTURA'), true)
  assert.equal(esNotaInterna('OJO con el vencimiento'), true)
  assert.equal(esNotaInterna('FALTA OC'), true)
  // Y lo que NO puede pasar: que «falta» dentro de una frase normal tape el concepto.
  assert.equal(esNotaInterna('Se pidió el pago del saldo'), false)
  assert.equal(esNotaInterna('FALTANTE DE MATERIALES'), false, 'palabra entera, no prefijo')
})

test('el rótulo derivado sale de datos que YA son del cliente, nunca inventados', () => {
  assert.equal(
    rotuloPublicable({ concepto: 'RECLAMAR OC!', obraNombre: 'ARCOR', fecha: '2026-02-03', facturaNumero: 'FCE 01-000048' }),
    'Factura FCE 01-000048', 'la factura es lo más preciso que el cliente puede cruzar')
  assert.equal(
    rotuloPublicable({ concepto: 'RECLAMAR OC!', obraNombre: 'ARCOR', fecha: '2026-02-03' }),
    'Pago · ARCOR · 03/02/2026')
  assert.equal(rotuloPublicable({ concepto: 'OJO!' }), 'Pago', 'sin obra ni fecha no se inventa ninguna')
})

test('el informe nombra la CELDA exacta, que es lo único que hace falta para corregirlo', () => {
  const filas = [
    { cliente: 'ARCOR', concepto: 'RECLAMAR OC!', cobranza_fila: 5, visible_portal: true, publicado_at: 'x' },
    { cliente: 'ARCOR', concepto: 'BACHEO', cobranza_fila: 15, visible_portal: true, publicado_at: 'x' },
    // Una nota interna que NO está publicada no molesta a nadie: el informe no la nombra.
    { cliente: 'ARCOR', concepto: 'REVISAR', cobranza_fila: 99, visible_portal: false, publicado_at: null },
  ]
  const hallados = conceptosInternosPublicados(filas)
  assert.equal(hallados.length, 1)
  assert.equal(hallados[0].celda, 'Cobranzas!I5')
  assert.equal(hallados[0].mover_a, 'Cobranzas!W5')
})
