import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, revisionDe, disciplinaDe, haceCuanto, type ArchivoDrive } from './documentos.ts'

const f = (name: string, extra: Partial<ArchivoDrive> = {}): ArchivoDrive =>
  ({ id: name, name, mimeType: 'application/pdf', ...extra })

test('la revisión se lee como la escribe el estudio, o no se lee', () => {
  assert.equal(revisionDe('ARQ rev 4.pdf'), 'rev 4')
  assert.equal(revisionDe('ARQ_REV.04.pdf'), 'rev 4')
  assert.equal(revisionDe('estructura_r3_final.dwg'), 'rev 3')
  assert.equal(revisionDe('Arquitectura rev final.pdf'), 'rev final')
  // NO se inventa «rev 1»: la revisión de un plano es un dato técnico que el cliente no puede recibir mal.
  assert.equal(revisionDe('Plano general.pdf'), null)
})

test('la disciplina sale del nombre y las tildes no la rompen', () => {
  assert.equal(disciplinaDe('Instalación Eléctrica rev 1.pdf'), 'sanitaria_electrica')
  assert.equal(disciplinaDe('ARQ - planta baja.pdf'), 'arquitectura')
  assert.equal(disciplinaDe('Estructura de hormigón.pdf'), 'estructura')
  assert.equal(disciplinaDe('Terminaciones.pdf'), 'terminaciones')
  assert.equal(disciplinaDe('Acta de inicio.pdf'), 'otra')
})

test('cotización, contrato, planos y certificados salen de una carpeta plana', () => {
  const c = clasificar([
    f('Cotización v3.pdf'), f('Contrato firmado.pdf'),
    f('ARQ rev 4.pdf', { hojas: 6 }), f('Estructura rev 2.pdf', { hojas: 4 }),
    f('Certificado 3.pdf'), f('Certificado 4.pdf'),
    f('Planos', { mimeType: 'application/vnd.google-apps.folder' }),
  ])
  assert.equal(c.cotizacion?.nombre, 'Cotización v3.pdf')
  assert.equal(c.contrato?.nombre, 'Contrato firmado.pdf')
  assert.equal(c.certificados.length, 2)
  assert.deepEqual(c.planos.map((p) => p.disciplina), ['arquitectura', 'estructura'])
  assert.equal(c.hojasTotales, 10)
})

test('una carpeta NO es un documento', () => {
  const c = clasificar([f('Contrato', { mimeType: 'application/vnd.google-apps.folder' })])
  assert.equal(c.contrato, null, 'la subcarpeta «Contrato» no es el contrato')
})

test('las disciplinas salen en el orden en que se construye, no alfabético', () => {
  const c = clasificar([f('Terminaciones.pdf'), f('Estructura.pdf'), f('Arquitectura.pdf')])
  assert.deepEqual(c.planos.map((p) => p.disciplina), ['arquitectura', 'estructura', 'terminaciones'])
})

test('el total de hojas se calla si falta UNA', () => {
  // Sumar sólo las conocidas diría «6 hojas» cuando podrían ser treinta. Peor que no decir nada.
  const c = clasificar([f('ARQ rev 4.pdf', { hojas: 6 }), f('Estructura rev 2.pdf')])
  assert.equal(c.hojasTotales, null)
})

test('entre dos cotizaciones gana la revisión más alta: es la vigente', () => {
  const c = clasificar([f('Cotización rev 2.pdf'), f('Cotización rev 5.pdf')])
  assert.equal(c.cotizacion?.revision, 'rev 5')
})

test('lo que no encaja NO se esconde', () => {
  const c = clasificar([f('Acta de vecinos.pdf')])
  assert.equal(c.otros.length, 1, 'esconderlo haría desaparecer un papel real de la carpeta')
})

test('la frescura se dice siempre, incluso cuando no hubo sincronización', () => {
  assert.equal(haceCuanto(null), 'sin sincronizar')
  const ahora = new Date('2026-08-26T12:00:00Z')
  assert.equal(haceCuanto(new Date('2026-08-26T11:59:40Z'), ahora), 'recién')
  assert.equal(haceCuanto(new Date('2026-08-26T11:30:00Z'), ahora), 'hace 30 min')
  assert.equal(haceCuanto(new Date('2026-08-26T10:00:00Z'), ahora), 'hace 2 h')
  assert.equal(haceCuanto(new Date('2026-08-24T12:00:00Z'), ahora), 'hace 2 d')
})
