// EL PANEL DERECHO — los defectos que atrapa este archivo.
//
// 1. Que «Últimos cambios» complete con `creado_en` los papeles que no tienen `modified_time`. Son
//    dos ventanas de tiempo distintas (Regla de Oro 3): un contrato de mayo vinculado ayer se leería
//    como «el contrato cambió ayer».
// 2. Que un aviso con conteo CERO se dibuje igual. «0 sin clasificar» no es trabajo pendiente.
// 3. Que el aviso de sugerencias cuente papeles que no tienen sugerencia — el número que promete
//    «un clic las confirma» tiene que ser el número de clics que existen de verdad.

import test from 'node:test'
import assert from 'node:assert/strict'
import { requiereAtencion, ultimosCambios } from './documentosPaneles.ts'
import { CATEGORIAS } from './documentosCategoria.ts'

const doc = (o: Record<string, unknown>) => ({
  drive_file_id: 'x', rol: null, tipo: 'archivo', name: null, path: null, mime_type: null,
  origen: 'confirmado', creado_en: '2026-05-01T10:00:00Z', modified_time: null, actividad_id: null,
  ...o,
}) as never

test('un aviso en cero no se dibuja', () => {
  const avisos = requiereAtencion([doc({ drive_file_id: 'a', name: 'x.pdf', rol: CATEGORIAS.PLANOS })])
  assert.deepEqual(avisos.map((a) => a.clave), [],
    'dibujó «0 sin clasificar»: un cero no es trabajo pendiente')
})

test('cuenta los sin clasificar y, aparte, los que tienen sugerencia lista', () => {
  const avisos = requiereAtencion([
    doc({ drive_file_id: 'a', name: 'Contrato de obra.pdf' }),   // sugiere Contrato y cliente
    doc({ drive_file_id: 'b', name: 'Acta de medición.pdf' }),   // no sugiere nada
    doc({ drive_file_id: 'c', name: 'plano de replanteo.jpg' }), // dos reglas: no sugiere nada
  ])
  const porClave = new Map(avisos.map((a) => [a.clave, a.n]))
  assert.equal(porClave.get('sin-clasificar'), 3)
  assert.equal(porClave.get('sugerencias'), 1,
    'el número que promete «un clic las confirma» no coincide con los clics que existen')
})

test('el vínculo que dedujo el OS se cuenta aparte del que afirmó una persona', () => {
  const avisos = requiereAtencion([
    doc({ drive_file_id: 'a', name: 'a.pdf', rol: CATEGORIAS.PLANOS, origen: 'inferido' }),
    doc({ drive_file_id: 'b', name: 'b.pdf', rol: CATEGORIAS.PLANOS, origen: 'carpeta_drive' }),
    doc({ drive_file_id: 'c', name: 'c.pdf', rol: CATEGORIAS.PLANOS, origen: 'confirmado' }),
  ])
  assert.equal(avisos.find((a) => a.clave === 'sin-confirmar')?.n, 2)
})

// ═══ ÚLTIMOS CAMBIOS ═══

test('un papel sin fecha de modificación NO aparece con la fecha del vínculo', () => {
  const cambios = ultimosCambios([
    doc({ drive_file_id: 'a', name: 'sin fecha.pdf', creado_en: '2026-08-24T10:00:00Z' }),
  ])
  assert.deepEqual(cambios, [], 'completó con `creado_en`: mezcló dos ventanas de tiempo distintas')
})

test('ordena por la fecha de modificación de Drive, del más nuevo al más viejo', () => {
  const cambios = ultimosCambios([
    doc({ drive_file_id: 'viejo', name: 'viejo.pdf', modified_time: '2026-06-01T10:00:00Z' }),
    doc({ drive_file_id: 'nuevo', name: 'nuevo.pdf', modified_time: '2026-08-21T10:00:00Z' }),
    doc({ drive_file_id: 'medio', name: 'medio.pdf', modified_time: '2026-07-15T10:00:00Z' }),
  ])
  assert.deepEqual(cambios.map((c) => c.driveFileId), ['nuevo', 'medio', 'viejo'])
})

test('corta en los que se piden', () => {
  const docs = Array.from({ length: 9 }, (_, i) => doc({
    drive_file_id: `d${i}`, name: `d${i}.pdf`, modified_time: `2026-08-0${i + 1}T10:00:00Z`,
  }))
  assert.equal(ultimosCambios(docs, 5).length, 5)
})

test('sin nombre se muestra el id de Drive, no un rótulo inventado', () => {
  const cambios = ultimosCambios([doc({ drive_file_id: '1AbC', modified_time: '2026-08-21T10:00:00Z' })])
  assert.equal(cambios[0].nombre, '1AbC')
})
