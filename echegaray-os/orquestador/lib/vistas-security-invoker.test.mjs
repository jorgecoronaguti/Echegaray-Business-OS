// LAS VISTAS DEL MÓDULO TIENEN QUE CORRER CON LOS PERMISOS DE QUIEN CONSULTA.
//
// ═══ POR QUÉ ESTE TEST EXISTE (19/08/2026) ═══
//
// Una vista sin `security_invoker` corre con los permisos de SU DUEÑO (`postgres`), que saltea el
// RLS de sus tablas. Toda la web lee por vistas, así que una sola vista sin la opción publica la
// tabla entera a cualquiera con sesión.
//
// Se cerró el 18/08 en cuatro vistas… y volvió el 19/08 en `cliente_panel`, medido con el token de
// un jefe de obra: `clientes → 0 filas` pero `cliente_panel → 5`. La causa es un default peligroso
// de Postgres: **`create or replace view` que no repite `with (security_invoker = true)` BORRA la
// opción**. No se hereda de la definición anterior.
//
// Por eso la protección no puede ser acordarse: es este test, y mira el CATÁLOGO, no una consulta.
// Una vista puede devolver cero filas hoy por casualidad y filtrar mañana cuando entren datos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

/** Las vistas que se apoyan en el RLS de sus tablas. Si se agrega una, va acá. */
const CON_RLS = [
  'obra_panel', 'obra_plan_vs_real', 'obra_avance', 'cliente_panel',
  'imputacion_pendiente', 'proveedor_nombre_pendiente',
]

/**
 * LA EXCEPCIÓN, DECLARADA. `persona_plantel` es `security_invoker = false` A PROPÓSITO: publica
 * cuatro columnas no sensibles del legajo (nombre, categoría, especialidad, egreso) para que la obra
 * pueda asignar personal sin poder leer `personas`, que es de Administración. Es una desescalada
 * deliberada y acotada — no un olvido — y por eso está nombrada acá en vez de simplemente ausente.
 */
const DESESCALADA_DECLARADA = ['persona_plantel']

const SIN_BASE = !process.env.DATABASE_URL

test('ninguna vista que dependa del RLS corre con los permisos de su dueño', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select c.relname, coalesce(array_to_string(c.reloptions, ','), '') as opts
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and c.relname = any($1)`,
    [CON_RLS],
  )
  const faltan = CON_RLS.filter((v) => !rows.some((r) => r.relname === v))
  assert.deepEqual(faltan, [], `estas vistas no existen en la base: ${faltan.join(', ')}`)

  const sinInvoker = rows.filter((r) => !r.opts.includes('security_invoker=true')).map((r) => r.relname)
  assert.deepEqual(sinInvoker, [],
    `perdieron security_invoker y saltean el RLS de sus tablas: ${sinInvoker.join(', ')}`)
})

test('la desescalada de `persona_plantel` sigue siendo la única, y sigue siendo acotada', { skip: SIN_BASE }, async () => {
  // Si mañana alguien le agrega una columna sensible a esta vista, la desescalada deja de ser
  // acotada y hay que volver a discutirla. El test fija el contrato: estas cuatro y nada más.
  const { rows } = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [DESESCALADA_DECLARADA[0]],
  )
  assert.deepEqual(rows.map((r) => r.column_name),
    ['id', 'nombre_completo', 'categoria', 'especialidad', 'fecha_egreso'],
    'cambió lo que publica `persona_plantel`: era la única vista que salta el RLS a propósito')
})
