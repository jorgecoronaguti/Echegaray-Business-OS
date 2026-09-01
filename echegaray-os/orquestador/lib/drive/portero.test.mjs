// EL PORTERO de la capacidad: RBAC + política antes del efecto. Hermético, 0 red, 0 DB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearCapacidadDrive, CAPACIDAD, CODIGO, crearAuditorEnMemoria } from './index.mjs'
import { MIME_CARPETA } from './referencia.mjs'

const ARCHIVO = { id: 'F', name: 'p.pdf', mimeType: 'application/pdf', parents: ['C'], trashed: false, properties: {} }
const CARPETA = { id: 'C', name: 'OBRAS', mimeType: MIME_CARPETA, parents: [], trashed: false, properties: {} }

function google(estado = { F: ARCHIVO, C: CARPETA }) {
  const llamadas = []
  return {
    llamadas,
    async getMeta(id) { const a = estado[id]; if (!a) { const e = new Error('not found'); e.status = 404; throw e } return { ...a } },
    async renameFile(id, name) { llamadas.push(['renameFile', id]); estado[id] = { ...estado[id], name }; return { id, name } },
    async trashFile(id) { llamadas.push(['trashFile', id]); estado[id] = { ...estado[id], trashed: true }; return { id } },
    async listarCarpeta() { return [] },
    async apiGetDrive() { return { files: [] } },
  }
}

test('cada operación declara qué capacidad de orq.capabilities la gobierna', async () => {
  const g = google()
  const vistas = []
  const drive = crearCapacidadDrive({
    google: g, auditor: crearAuditorEnMemoria(), principalId: 'p1',
    politica: async (cap) => { vistas.push(cap); return 'auto' },
  })
  await drive.renombrar({ file_id: 'F', nombre: 'q.pdf' })
  await drive.archivar({ file_id: 'F' })
  assert.deepEqual(vistas, [CAPACIDAD.GESTIONAR, CAPACIDAD.ARCHIVAR])
})

test('forbidden CORTA ANTES del efecto: Drive no se toca', async () => {
  const g = google()
  const drive = crearCapacidadDrive({ google: g, principalId: 'p1', politica: async () => 'forbidden' })
  await assert.rejects(() => drive.renombrar({ file_id: 'F', nombre: 'z.pdf' }), (e) => e.codigo === CODIGO.FORBIDDEN)
  assert.equal(g.llamadas.length, 0)
})

test('requires_approval NO ejecuta y NO encola: encolar es del tool-executor', async () => {
  const g = google()
  const drive = crearCapacidadDrive({ google: g, principalId: 'p1', politica: async () => 'requires_approval' })
  await assert.rejects(
    () => drive.archivar({ file_id: 'F' }),
    (e) => e.codigo === CODIGO.PERMISSION_REQUIRED && e.requiere_aprobacion === true && e.capability === CAPACIDAD.ARCHIVAR,
  )
  assert.equal(g.llamadas.length, 0)
})

test('sin política la capacidad corre, pero LO DECLARA: no finge haber evaluado', async () => {
  // Es como corren hoy los 184 scripts que arman su propio cliente. Lo nuevo no es el portero:
  // es que la respuesta diga si hubo portero o no.
  const drive = crearCapacidadDrive({ google: google(), auditor: crearAuditorEnMemoria() })
  const r = await drive.renombrar({ file_id: 'F', nombre: 'y.pdf' })
  assert.equal(r.ok, true)
  assert.equal(r.policy, 'no-evaluada')
  assert.equal(r.capability, CAPACIDAD.GESTIONAR)
})

test('con política, la respuesta dice que se evaluó', async () => {
  const drive = crearCapacidadDrive({ google: google(), auditor: crearAuditorEnMemoria(), principalId: 'p1', politica: async () => 'auto' })
  const r = await drive.renombrar({ file_id: 'F', nombre: 'y.pdf' })
  assert.equal(r.policy, 'evaluada')
})

test('la LECTURA no pasa por el portero de mutación (y no lo simula)', async () => {
  const drive = crearCapacidadDrive({ google: google(), principalId: 'p1', politica: async () => 'forbidden' })
  // Leer no muta: si la lectura tuviera que estar prohibida, eso lo decide quien arma la
  // capacidad con un cliente sin acceso, no un portero que sólo mira mutaciones.
  const ref = await drive.referencia('F')
  assert.equal(ref.file_id, 'F')
})

test('el borrado definitivo no pasa por el portero porque no hay disposición que lo habilite', async () => {
  const drive = crearCapacidadDrive({ google: google(), principalId: 'p1', politica: async () => 'auto' })
  await assert.rejects(() => drive.borrarDefinitivo({ file_id: 'F' }), (e) => e.codigo === CODIGO.FORBIDDEN)
})

test('sin auditor, pedir la historia de un archivo lo dice en vez de devolver vacío', async () => {
  const drive = crearCapacidadDrive({ google: google() })
  await assert.rejects(() => drive.historia('F'), (e) => e.codigo === CODIGO.AUDIT_UNAVAILABLE)
})

test('sin cuenta de Google el error es un PERMISO que falta, no un bug', () => {
  // CAMBIO DE CONTRATO (31/08). Era INVALID_ARGUMENT, que se lee como "el programador se olvidó
  // de pasar algo". El caso real es el que documenta `os.mjs`: nadie autorizó Google todavía.
  // Quien recibe esto tiene algo que hacer —autorizar—, no un defecto que reportar.
  assert.throws(() => crearCapacidadDrive({}), (e) => e.codigo === CODIGO.PERMISSION_REQUIRED)
  assert.throws(() => crearCapacidadDrive({ google: null }), (e) => /cuenta de Google/.test(e.message))
})
