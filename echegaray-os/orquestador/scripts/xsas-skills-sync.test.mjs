// EL SYNC DEL CATÁLOGO TIENE QUE SER IDEMPOTENTE Y NO BORRAR NADA.
//
// Las dos formas conocidas de romper esto en este repo:
//  1. Un sync que reescribe todo en cada corrida: nunca se sabe si algo cambió de verdad, y el
//     `updated_at` deja de significar nada. La segunda corrida tiene que reportar CERO cambios.
//  2. Un generador que borra lo que no encuentra. Ya pasó con una pestaña entera del Sheet. Una
//     skill retirada del disco se ARCHIVA (conserva su historia de uso), no se elimina.
//
// Se prueba contra un puerto de base falso: lo que importa acá es la decisión, no el driver.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sincronizarCatalogo } from './xsas-skills-sync.mjs'
import { invalidarCache } from '../lib/skill-catalogo.mjs'

/** Base de mentira: guarda las filas por clave y responde el select que hace el sync. */
function baseFalsa() {
  const filas = new Map()
  const sentencias = []
  const ejecutar = async (sql, params = []) => {
    sentencias.push(sql.trim().slice(0, 6).toLowerCase())
    if (/^\s*select/i.test(sql)) return { rows: [...filas.values()] }
    if (/^\s*insert/i.test(sql)) {
      const [clave, nombre, , area, ruta, descripcion, tipo, tools, capacidades, modulos_os, nivel_ia, estado_operativo, motivo_estado, hash, bytes] = params
      filas.set(clave, { clave, nombre, area, ruta, descripcion, tipo, tools, capacidades, modulos_os, nivel_ia, estado_operativo, motivo_estado, hash, bytes, estado: 'vigente' })
      return { rows: [] }
    }
    if (/^\s*update/i.test(sql)) {
      const f = filas.get(params[0])
      if (f) { f.estado = 'archivado'; f.estado_operativo = 'retirada' }
      return { rows: [] }
    }
    return { rows: [] }
  }
  return { filas, sentencias, ejecutar }
}

async function skillDeMentira(dir, clave, tipo = 'expert-domain') {
  await mkdir(path.join(dir, clave), { recursive: true })
  await writeFile(path.join(dir, clave, 'SKILL.md'),
    `---\nname: ${clave}\ndescription: "Skill de prueba."\nallowed-tools: Read\nmetadata:\n  type: ${tipo}\n---\n\n# ${clave}\n`)
}

test('la segunda corrida no cambia nada (idempotente)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-'))
  const db = baseFalsa()
  try {
    await skillDeMentira(dir, 'una-skill', 'technical')
    await skillDeMentira(dir, 'otra-skill', 'technical')
    invalidarCache()

    const a = await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })
    assert.equal(a.total, 2)
    assert.deepEqual(a.nuevas.sort(), ['otra-skill', 'una-skill'])
    assert.equal(a.sinCambio, 0)

    const b = await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })
    assert.equal(b.sinCambio, 2, 'la segunda corrida tiene que ver que ya está todo igual')
    assert.deepEqual(b.nuevas, [])
    assert.deepEqual(b.actualizadas, [])
  } finally { await rm(dir, { recursive: true, force: true }); invalidarCache() }
})

test('editar una skill actualiza SÓLO esa fila', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-'))
  const db = baseFalsa()
  try {
    await skillDeMentira(dir, 'una-skill', 'technical')
    await skillDeMentira(dir, 'otra-skill', 'technical')
    invalidarCache()
    await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })

    await writeFile(path.join(dir, 'una-skill', 'SKILL.md'),
      '---\nname: una-skill\ndescription: "Cambió la descripción."\nallowed-tools: Read, Bash\nmetadata:\n  type: technical\n---\n\n# una-skill\n')
    invalidarCache()
    const r = await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })
    assert.deepEqual(r.actualizadas, ['una-skill'])
    assert.equal(r.sinCambio, 1)
    assert.equal(db.filas.get('una-skill').descripcion, 'Cambió la descripción.')
    assert.deepEqual(db.filas.get('una-skill').tools, ['Read', 'Bash'])
  } finally { await rm(dir, { recursive: true, force: true }); invalidarCache() }
})

test('una skill que desaparece del disco se ARCHIVA, no se borra', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-'))
  const db = baseFalsa()
  try {
    await skillDeMentira(dir, 'una-skill', 'technical')
    await skillDeMentira(dir, 'la-que-se-va', 'technical')
    invalidarCache()
    await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })

    await rm(path.join(dir, 'la-que-se-va'), { recursive: true, force: true })
    invalidarCache()
    const r = await sincronizarCatalogo({ dir, ejecutar: db.ejecutar })
    assert.deepEqual(r.archivadas, ['la-que-se-va'])
    assert.ok(db.filas.has('la-que-se-va'), 'la fila NO se borra: tiene historia de uso')
    assert.equal(db.filas.get('la-que-se-va').estado, 'archivado')
  } finally { await rm(dir, { recursive: true, force: true }); invalidarCache() }
})

test('--dry no escribe una sola vez', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sync-'))
  const db = baseFalsa()
  try {
    await skillDeMentira(dir, 'una-skill', 'technical')
    invalidarCache()
    const r = await sincronizarCatalogo({ dir, dry: true, ejecutar: db.ejecutar })
    assert.deepEqual(r.nuevas, ['una-skill'])
    assert.equal(db.filas.size, 0)
    assert.deepEqual([...new Set(db.sentencias)], ['select'], 'en seco sólo se lee')
  } finally { await rm(dir, { recursive: true, force: true }); invalidarCache() }
})
