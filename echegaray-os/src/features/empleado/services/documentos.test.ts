import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionDe, agrupar, avisoDeDocumentos, estadoEnPantalla, grupoDe, notaDeVencimiento, ordenar, pendientes } from './documentos.ts'
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

const papel = (over: Partial<DocumentoDelEmpleado>): DocumentoDelEmpleado => ({
  id: 'x', tipo_documento: 'dni', nombre: null, presente: true, drive_file_id: 'd',
  fecha_documento: '2026-01-01', fecha_vencimiento: null, presentacion_id: null,
  presentacion_estado: null, motivo_revision: null, presentado_en: null, revisado_en: null,
  presentado_nombre: null, ...over,
})

test('un tipo de documento NUEVO de salud no se cuela en Personales', () => {
  // EL DEFECTO QUE ATRAPA: con un diccionario cerrado, «curso_de_altura_avanzado» —un tipo que
  // Administración da de alta mañana— cae en Personales y su vencimiento deja de saltar a la vista.
  assert.equal(grupoDe('curso_de_altura_avanzado'), 'salud')
  assert.equal(grupoDe('apto_medico'), 'salud')
  assert.equal(grupoDe('constancia_art'), 'salud')
  assert.equal(grupoDe('dni'), 'personales')
  assert.equal(grupoDe('carnet_de_conducir'), 'personales')
  // Lo desconocido cae en Personales, que es el grupo SIN consecuencia de seguridad.
  assert.equal(grupoDe('formulario_x'), 'personales')
})

test('agrupar reparte todos los papeles y no pierde ninguno', () => {
  const docs = [papel({ id: 'a', tipo_documento: 'apto_medico' }), papel({ id: 'b', tipo_documento: 'dni' })]
  const g = agrupar(docs, '2026-08-24')
  assert.equal(g.salud.length + g.personales.length, docs.length)
  assert.deepEqual(g.salud.map((d) => d.id), ['a'])
})

test('«vence en 20 días» y «vencido el 30/06» son dos textos distintos, no el mismo', () => {
  const porVencer = notaDeVencimiento(papel({ fecha_vencimiento: '2026-09-13' }), '2026-08-24')
  assert.equal(porVencer.tono, 'warn')
  assert.match(porVencer.texto, /en 20 días/)

  const vencido = notaDeVencimiento(papel({ fecha_vencimiento: '2026-06-30' }), '2026-08-24')
  assert.equal(vencido.tono, 'neg')
  assert.equal(vencido.texto, 'vencido el 30/06')
  // El vencido NO cuenta días hacia atrás: «en -55 días» no es castellano ni es útil.
  assert.doesNotMatch(vencido.texto, /-/)
})

test('lo que se envió NO vuelve a pedirse: en revisión se dice que ya está mandado', () => {
  const enviado = notaDeVencimiento(
    papel({ fecha_vencimiento: '2026-06-30', presentacion_estado: 'en_revision' }), '2026-08-24',
  )
  assert.match(enviado.texto, /esperando revisión/)
  assert.notEqual(enviado.tono, 'neg')
})
