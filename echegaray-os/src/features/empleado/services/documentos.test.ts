import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionDe, avisoDeDocumentos, estadoEnPantalla, ordenar, pendientes } from './documentos.ts'
import type { DocumentoDelEmpleado } from './documentos.ts'

const HOY = '2026-08-20'
const d = (p: Partial<DocumentoDelEmpleado>): DocumentoDelEmpleado => ({
  id: p.id ?? 'x', tipo_documento: 'examen_medico', nombre: null, presente: true,
  drive_file_id: null, fecha_documento: null, fecha_vencimiento: null, presentacion_id: null,
  presentacion_estado: null, motivo_revision: null, presentado_en: null, revisado_en: null,
  presentado_nombre: null, ...p,
})

test('LO QUE YA MANDÓ NO SE LE VUELVE A PEDIR', () => {
  // El defecto que atrapa: el papel sigue vencido hasta que Administración apruebe, así que sin esta
  // regla la pantalla le dice «vencido» al que subió la foto ayer — y a la tercera deja de mandar.
  const subido = d({ presente: false, presentacion_estado: 'en_revision' })
  assert.equal(estadoEnPantalla(subido, HOY), 'en_revision')
  assert.equal(pendientes([subido], HOY), 0)
  assert.equal(avisoDeDocumentos([subido], HOY), null)
})

test('devuelto para corregir es lo primero de la lista y pide acción primaria', () => {
  const devuelto = d({ id: 'dev', presentacion_estado: 'requiere_correccion' })
  const vencido = d({ id: 'venc', fecha_vencimiento: '2026-01-01' })
  const vigente = d({ id: 'ok' })
  assert.deepEqual(ordenar([vigente, vencido, devuelto], HOY).map((x) => x.id), ['dev', 'venc', 'ok'])
  assert.equal(accionDe('requiere_correccion').primaria, true)
})

test('«no está» se le dice SOLICITADO al empleado, no «falta»', () => {
  // Es la misma fila de la base (`presente = false`) y son dos lecturas distintas: para
  // Administración falta un papel; para el empleado se lo están pidiendo a él.
  assert.equal(estadoEnPantalla(d({ presente: false }), HOY), 'solicitado')
})

test('el aviso cuenta lo accionable y calla cuando no hay nada', () => {
  assert.equal(avisoDeDocumentos([d({ presente: false }), d({ fecha_vencimiento: '2020-01-01' })], HOY), 'Te faltan 2 documentos')
  assert.equal(avisoDeDocumentos([d({ presente: false })], HOY), 'Te falta 1 documento')
  assert.equal(avisoDeDocumentos([d({})], HOY), null)
})

test('un vigente igual se puede reemplazar, pero sin gritar', () => {
  assert.equal(accionDe('vigente').primaria, false)
  assert.equal(accionDe('vigente').texto, 'Reemplazar')
})
