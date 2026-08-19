// EL CATÁLOGO DE DOCUMENTOS DEL LEGAJO SE DEFINE UNA SOLA VEZ.
//
// ═══ LA FALLA QUE ESTE CANARIO HABRÍA CAZADO ═══
//
// `documentacion_legajo.tipo_documento` tenía el CHECK de julio —'alta_afip', 'fondo_cese_hm',
// 'dni_escaneado', 'baja', 'epp'— y el selector de la ficha ofrecía otro vocabulario entero. NINGUNA
// de las opciones que se podían elegir pasaba el CHECK: vincular un documento devolvía 23514 todas
// las veces, y el comentario del código afirmaba lo contrario ("NO es un CHECK en la base").
//
// Nadie lo notó durante un mes porque las 12 filas cargadas venían de un script, no de la pantalla.
// Un comentario no habría impedido nada. Esto sí: si las dos listas se separan, el test nombra
// exactamente qué valor está de un lado y no del otro.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { query } from './db.mjs'
import { CATEGORIAS } from './legajos-sincro.mjs'

const SIN_BASE = !process.env.DATABASE_URL

/** Se lee del `.ts` con una expresión regular a propósito: `node --test` no resuelve el alias `@/`
 *  para importar un valor de TypeScript, y agregar un paso de build para leer una lista de catorce
 *  cadenas sería más frágil que esto. */
function catalogoDeLaPantalla() {
  const src = readFileSync(new URL('../../src/features/administracion/types/index.ts', import.meta.url), 'utf8')
  const bloque = src.match(/export const CATEGORIAS_DOCUMENTO = \[([\s\S]*?)\] as const/)
  assert.ok(bloque, 'no encontré CATEGORIAS_DOCUMENTO en types/index.ts')
  return [...bloque[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

test('la pantalla y el sincronizador ofrecen el mismo vocabulario', () => {
  assert.deepEqual([...catalogoDeLaPantalla()].sort(), [...CATEGORIAS].sort())
})

test('y la base acepta exactamente ese vocabulario', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.documentacion_legajo'::regclass
        and conname = 'documentacion_legajo_tipo_documento_check'`)
  assert.equal(rows.length, 1, 'el CHECK de tipo_documento desapareció: el dominio quedó abierto')
  const enLaBase = [...rows[0].def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1])
  assert.deepEqual(enLaBase.sort(), [...CATEGORIAS].sort())
})

test('ningún documento del legajo afirma sin poder mostrarse', { skip: SIN_BASE }, async () => {
  // Una fila sin `drive_file_id` es "el papel está" sin papel que abrir. La columna es NOT NULL;
  // esto vigila que siga siéndolo, porque el día que alguien la afloje nada más se rompe.
  const { rows } = await query(
    `select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'documentacion_legajo'
        and column_name = 'drive_file_id'`)
  assert.equal(rows[0]?.is_nullable, 'NO')
})

test('nadie con fecha de egreso sigue figurando en la empresa', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    'select count(*)::int as n from personas where fecha_egreso is not null and en_la_empresa')
  assert.equal(rows[0].n, 0)
})

test('el plantel es exactamente quien está en la empresa', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select (select count(*) from persona_plantel)::int as vista,
            (select count(*) from personas where en_la_empresa)::int as tabla`)
  assert.equal(rows[0].vista, rows[0].tabla)
})

test('la categoría no se dice dos veces: ningún puesto repite una categoría del convenio', { skip: SIN_BASE }, async () => {
  // El listado mostraba «OFICIAL» debajo del nombre y «Ayudante» en la columna CATEGORÍA: el CARGO
  // de la nómina —que ES la categoría de la escala— se había cargado en `puesto`, y `categoria`
  // venía de la libreta con la del ingreso. Dos respuestas al mismo hecho, y distintas.
  const { rows } = await query(
    `select nombre_completo, puesto from personas
      where upper(trim(coalesce(puesto, ''))) in
            ('OFICIAL ESPECIALIZADO', 'MEDIO OFICIAL', 'OFICIAL', 'AYUDANTE')`)
  assert.deepEqual(rows, [],
    'estas personas tienen una categoría de convenio guardada como puesto: ' +
    rows.map((r) => `${r.nombre_completo} (${r.puesto})`).join(', '))
})

test('la especialidad es el oficio, no la categoría con el oficio pegado', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select nombre_completo, especialidad from personas
      where especialidad ~* '^(AYUDANTE|MEDIO OFICIAL|OFICIAL ESPECIALIZADO|OFICIAL)\\s*/'`)
  assert.deepEqual(rows, [])
})
