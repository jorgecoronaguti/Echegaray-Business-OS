// LA ESCALERA — que los dos sustratos sigan siendo LA MISMA búsqueda.
//
// El defecto que estos tests atrapan no es un peldaño mal escrito: es que alguien cambie uno de los
// dos lados y deje el otro. Por eso el test central no prueba `enMemoria` ni `sql` por separado,
// sino que INTERPRETA el descriptor SQL sobre las mismas filas y exige el mismo conjunto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ESCALERA, analizarConsulta, peldanosSql, tokensDe } from './escalera.mjs'
import { tokensDeArchivo } from './normalizar.mjs'

/** Cuatro archivos reales del data room, con la forma con la que salen de `drive_index`. */
const FILAS = [
  { drive_file_id: 'a', name: 'DNI - Capelli.pdf', path: 'administracion/PERSONAL/2. INACTIVOS/CAPELLI CESAR/DNI - Capelli.pdf' },
  { drive_file_id: 'b', name: 'Flujo de Caja - Cash Flow ECSAS', path: 'administracion/Archivos GESTIÓN ECSAS/Flujo de Caja - Cash Flow ECSAS' },
  { drive_file_id: 'c', name: 'Vision / Tracción', path: 'administracion/Archivos GESTIÓN ECSAS/Estrategia/Vision / Tracción' },
  { drive_file_id: 'd', name: 'Recibo 2026-08 Q2 · ZOGBE RAMOS WALTER LEONARDO.pdf', path: 'administracion/PERSONAL/1. ACTIVOS/ZOGBE LEONARDO/RECIBOS DE SUELDO/Recibo 2026-08 Q2 · ZOGBE RAMOS WALTER LEONARDO.pdf' },
].map((f) => ({ ...f, nombre_norm: null, path_norm: null, tokens: tokensDeArchivo(f) }))

/**
 * EL INTÉRPRETE DEL DESCRIPTOR, en JS y sobre las mismas filas.
 *
 * Hace con las filas lo que PostgREST hace con la tabla: grupos AND, alternativas OR adentro,
 * `nombre_norm`/`path_norm` como los guarda el indexador, `cs` como `@>` y `ov` como `&&`. Si la
 * traducción de `busquedaLexica.ts` dejara de coincidir con esto, el desvío se ve acá primero.
 */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()
const sinExt = (s) => String(s ?? '').replace(/\.[a-z0-9]{2,5}$/i, '')
const campoDe = (f, campo) => (campo === 'nombre_norm' ? plano(sinExt(f.name)) : plano(f.path))

function porSql(filas, grupos) {
  return filas.filter((f) => grupos.every((grupo) => grupo.some((a) => {
    if (a.campo === 'tokens') {
      const suyos = tokensDe(f)
      return a.op === 'contiene' ? a.valor.every((t) => suyos.includes(t)) : a.valor.some((t) => suyos.includes(t))
    }
    const v = campoDe(f, a.campo)
    return a.op === 'eq' ? v === a.valor : v.includes(a.valor)
  })))
}

const ids = (fs) => fs.map((f) => f.drive_file_id).sort()

const enMemoria = (nombre, consulta) => {
  const p = ESCALERA.find((x) => x.nombre === nombre)
  const variantes = Array.from(new Set([consulta.fraseCruda, consulta.frase].filter(Boolean)))
  const salida = new Map()
  for (const frase of variantes) {
    for (const f of p.enMemoria(FILAS, { ...consulta, frase })) salida.set(f.drive_file_id, f)
  }
  return [...salida.values()]
}

test('cada peldaño encuentra lo MISMO en memoria que contra Postgres', () => {
  const consultas = ['dni de capelli', 'flujo de caja', 'vision traccion', 'recibo de sueldo de zogbe',
    'capelli', 'flujo', 'no existe nada de esto']
  for (const texto of consultas) {
    const c = analizarConsulta(texto)
    for (const p of ESCALERA) {
      const grupos = p.sql(c)
      if (!grupos) continue // `exacta` no tiene forma SQL, y está declarado en la cabecera
      assert.deepEqual(ids(porSql(FILAS, grupos)), ids(enMemoria(p.nombre, c)),
        `el peldaño ${p.nombre} difiere entre memoria y SQL para «${texto}»`)
    }
  }
})

test('«dni de capelli» se encuentra, y la frase cruda no alcanzaba', () => {
  // EL DEFECTO, EXACTO: la pantalla buscaba el texto TAL COMO SE ESCRIBIÓ. Ese «de» del medio no
  // está en el archivo, así que la subcadena no existe en ningún campo.
  assert.equal(FILAS.filter((f) => `${f.name} ${f.path}`.toLowerCase().includes('dni de capelli')).length, 0)
  const c = analizarConsulta('dni de capelli')
  // La escalera prueba TAMBIÉN la frase ya tokenizada —«dni capelli»—, y ahí el peldaño `parcial`
  // hace pie. Si alguien saca `consulta.frase` de las variantes, este test se pone rojo.
  assert.deepEqual(ids(enMemoria('parcial', c)), ['a'])
  assert.deepEqual(ids(enMemoria('todos_los_tokens', c)), ['a'])
})

test('«recibo de zogbe» necesita el peldaño de los tokens: ninguna frase es subcadena', () => {
  const c = analizarConsulta('recibo de zogbe')
  // Las dos palabras están —una en el nombre, la otra en el nombre y en la carpeta— pero nunca
  // pegadas y nunca en ese orden. Es el caso que SÓLO resuelve buscar cada palabra por separado.
  assert.deepEqual(ids(enMemoria('parcial', c)), [])
  assert.deepEqual(ids(enMemoria('todos_los_tokens', c)), ['d'])
})

test('el sinónimo vale en los dos lados: «recibo de sueldo» encuentra lo guardado como jornales', () => {
  const c = analizarConsulta('recibo de sueldo de zogbe')
  assert.ok(c.tokens.includes('jornal'), 'sueldo se canoniza a jornal')
  // El archivo no dice «jornal» en ninguna parte: lo dice su conjunto de tokens, que escribió el
  // indexador con el mismo diccionario. Si se comparara contra el texto crudo, esto daría vacío.
  assert.equal(/jornal/i.test(`${FILAS[3].name} ${FILAS[3].path}`), false)
  assert.deepEqual(ids(enMemoria('todos_los_tokens', c)), ['d'])
})

test('el orden de los peldaños es del más estricto al más laxo, y no cambia', () => {
  assert.deepEqual(ESCALERA.map((p) => p.nombre),
    ['exacta', 'normalizada', 'parcial', 'todos_los_tokens', 'alguna_palabra'])
  const c = analizarConsulta('dni de capelli')
  assert.deepEqual(peldanosSql(c).map((p) => p.nombre),
    ['normalizada', 'parcial', 'todos_los_tokens', 'alguna_palabra'])
})

test('ningún valor que va a la consulta puede romper un or=(…) de PostgREST', () => {
  // El tokenizador ES el saneador: si alguien relaja `plano()`, este test se pone rojo antes de que
  // la consulta se vuelva inyectable.
  const sucia = 'pasame el (flujo), de "caja" * 100% ; select'
  const c = analizarConsulta(sucia)
  const valores = peldanosSql(c).flatMap((p) => p.grupos.flat())
    .flatMap((a) => (Array.isArray(a.valor) ? a.valor : [a.valor]))
  assert.ok(valores.length > 0)
  for (const v of valores) assert.match(v, /^[a-z0-9ñ ]+$/, `valor peligroso: ${v}`)
})

test('tokensDe usa la columna del índice cuando está, y la calcula cuando no', () => {
  const fila = { name: 'DNI - Capelli.pdf', path: 'x/CAPELLI CESAR/DNI - Capelli.pdf' }
  assert.deepEqual(tokensDe(fila), tokensDeArchivo(fila))
  assert.deepEqual(tokensDe({ ...fila, tokens: ['inventado'] }), ['inventado'])
})
