// NINGÚN LECTOR DE ASIGNACIONES CUENTA UNA FILA ANULADA (auditoría, 14/09/2026).
//
// La fila anulada no se borra: lleva `MARCA_ANULADA` en `notas`. La definición de «asignación vigente» es
// UNA: la vista `obra_asignacion_vigente`. Este test prueba las tres cosas que la sostienen:
//   1. todo SELECT de la app y del orquestador va por la vista (la tabla sólo se escribe);
//   2. los lectores de la BASE que se midieron vivos el 14/09 (vistas, funciones, policies) se recrean en la
//      migración leyendo la vista;
//   3. las reglas puras —que reciben filas de cualquier lado— ignoran una anulada.
// Qué defecto atrapa: un lector nuevo, o uno viejo que vuelve a leer la tabla, y cuenta a Reta en Messina
// con la fila anulada. No prueba la base viva: la migración no está aplicada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  MARCA_ANULADA, cederAnteLaApp, planDeAsignacion, superposiciones,
} from './cronologia-asignaciones.mjs'
import { obraDeLaAsignacionDelDia } from './asignacion-del-dia.mjs'
import { asignacionVigente } from './jornales-a-registros-hh.mjs'
import { revisarAsignaciones, REGLAS } from './invariantes/asignaciones.mjs'

const RAIZ = new URL('../../', import.meta.url).pathname
const MIGRACION = join(RAIZ, 'supabase/migrations/20260915T0310_asignar_obra_en_una_transaccion.sql')

function archivos(dir, patron) {
  const salida = []
  for (const nombre of readdirSync(join(RAIZ, dir))) {
    if (['node_modules', '.next', 'datos'].includes(nombre)) continue
    const ruta = join(RAIZ, dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(relative(RAIZ, ruta), patron))
    else if (patron.test(nombre) && !/\.test\./.test(nombre)) salida.push(ruta)
  }
  return salida
}
const lineaDe = (texto, i) => texto.slice(0, i).split('\n').length

/** Lectores que leen la TABLA a propósito, con su porqué. Agregar uno acá es una decisión, no un atajo. */
const LEEN_LA_TABLA = new Map([
  ['orquestador/scripts/cronologia-asignaciones-normalizar.mjs',
    'respaldo de la tabla entera y anulación idempotente: tiene que ver las ya anuladas para no re-anularlas'],
])

test('1a. la app: todo `.from(obra_asignacion)` seguido de `.select` lee la vista, no la tabla', () => {
  const malos = []
  for (const f of archivos('src', /\.tsx?$/)) {
    const texto = readFileSync(f, 'utf8')
    for (const m of texto.matchAll(/\.from\(\s*'obra_asignacion'\s*\)/g)) {
      const verbo = texto.slice(m.index + m[0].length).match(/^\s*\.(\w+)\(/)?.[1]
      if (verbo === 'select') malos.push(`${relative(RAIZ, f)}:${lineaDe(texto, m.index)}`)
    }
  }
  assert.deepEqual(malos, [], 'leen la tabla y cuentan anuladas')
})

test('1b. el orquestador: ningún SELECT lee la tabla salvo los permitidos con su porqué', () => {
  const malos = []
  for (const f of archivos('orquestador', /\.mjs$/)) {
    const rel = relative(RAIZ, f)
    if (LEEN_LA_TABLA.has(rel)) continue
    const texto = readFileSync(f, 'utf8')
    for (const m of texto.matchAll(/\b(from|join)\s+(public\.)?obra_asignacion\b(?!_)/gi)) {
      if (/delete\s+$/i.test(texto.slice(Math.max(0, m.index - 10), m.index))) continue
      malos.push(`${rel}:${lineaDe(texto, m.index)}`)
    }
  }
  assert.deepEqual(malos, [], 'leen la tabla y cuentan anuladas')
})

/** Medidos en la base viva el 14/09/2026 (pg_depend, pg_proc, pg_policies). */
const LECTORES_DE_LA_BASE = [
  'cuadrilla_panel', 'mi_asignacion', 'mi_obra', 'mi_tarea', 'persona_directorio', 'xsas_actividad',
  've_obra', 'mis_obras', 'marca_ausencia_de', 'personas_select',
]

test('2. la migración recrea cada lector de la base leyendo la vista, y la vista filtra con la MISMA marca', () => {
  const sql = readFileSync(MIGRACION, 'utf8')
  assert.ok(sql.includes(`not like '%${MARCA_ANULADA}%'`), 'la vista y MARCA_ANULADA tienen que ser la misma marca')
  for (const nombre of LECTORES_DE_LA_BASE) {
    const bloque = sql.match(new RegExp(`-- lector: ${nombre}\\n([\\s\\S]*?)-- fin lector: ${nombre}`))?.[1]
    assert.ok(bloque, `falta el lector ${nombre} en la migración`)
    assert.ok(bloque.includes('obra_asignacion_vigente'), `${nombre} no lee la vista`)
    assert.doesNotMatch(bloque, /\bobra_asignacion\b(?!_)/, `${nombre} sigue leyendo la tabla`)
  }
})

// ─── 3. las reglas puras, con una fila anulada ──────────────────────────────────────────────────

const anulada = {
  id: 'anulada', persona_id: 'reta', obra_id: 'messina', obra: 'messina', desde: '2026-09-09', hasta: '2026-09-09',
  notas: `${MARCA_ANULADA} 14/09/2026: día suelto corregido por carga posterior`, creado_en: '2026-09-10T20:00:00Z',
}
const anuladaAbierta = { ...anulada, id: 'anulada-abierta', hasta: null, desde: '2026-09-05' }
const larga = {
  id: 'larga', persona_id: 'reta', obra_id: 'quattropani', obra: 'quattropani', desde: '2026-09-01', hasta: null,
  notas: null, creado_en: '2026-09-01T10:00:00Z',
}

test('3a. la obra del día (importador de HH y grilla) no le da el día a la anulada', () => {
  assert.equal(obraDeLaAsignacionDelDia([anulada, larga], '2026-09-09'), 'quattropani')
  assert.equal(asignacionVigente([anulada, larga], 'reta', '2026-09-09'), 'quattropani')
  assert.equal(asignacionVigente([anuladaAbierta, larga], 'reta', '2026-09-09', { desempatar: false }), 'quattropani')
})

test('3b. el invariante de dos vigentes no cuenta la anulada abierta', () => {
  const r = revisarAsignaciones({ asignaciones: [anuladaAbierta, larga], obras: [] })
  assert.equal(r.hallazgos.filter((h) => h.regla === REGLAS.DOS_VIGENTES).length, 0)
  assert.equal(r.vigentes, 1)
})

test('3c. superposiciones, cesión de la reconstrucción y regla de escritura ignoran la anulada', () => {
  assert.deepEqual(superposiciones([anuladaAbierta, larga]), [])
  const reconstruida = { persona_id: 'reta', obra_id: 'sf', desde: '2026-09-01', hasta: '2026-09-30' }
  assert.deepEqual(cederAnteLaApp([reconstruida], [{ ...anuladaAbierta, hasta: '2026-09-20' }]).map((t) => [t.desde, t.hasta]),
    [['2026-09-01', '2026-09-30']])
  assert.deepEqual(planDeAsignacion([anuladaAbierta], { obra_id: 'pisos', desde: '2026-09-09', hasta: null }),
    { cerrar: [], acortar: [], reemplazar: [], recortar: [], anular: [] })
})
