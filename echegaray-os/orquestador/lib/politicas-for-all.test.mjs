// UNA POLICY `FOR ALL` INCLUYE SELECT, Y ESO YA SE PAGÓ CINCO VECES.
//
// ═══ POR QUÉ ESTE TEST EXISTE ═══
//
// En Postgres, `create policy ... for all` gobierna los cuatro comandos, SELECT incluido. Y las
// policies permisivas se SUMAN con OR: alcanza con que UNA diga `true` para que la fila salga, por
// más estricta que sea la de al lado.
//
// El patrón apareció en este repo cinco veces: `obra_actividad`, las cuatro tablas de Operación,
// `personas_write`, `proveedores_write` y `usuario_obra_write`. En cada caso el `for all` estaba
// pensado como "quién puede ESCRIBIR" y de paso abría la lectura.
//
// Auditado el 19/08/2026: quedan nueve `for all` sobre tablas del MVP y NINGUNA ensancha la lectura
// —todas exigen rol de Administración o `ve_obra()`, que es igual o más estricto que su propia
// policy de SELECT—. El dueño pidió expresamente *"no refactors generales"*, así que no se parten
// las nueve: se MIDEN. Lo que este test prohíbe es la única forma en que se vuelven peligrosas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'

/** Las tablas del MVP. Si entra una tabla nueva al módulo, va acá. */
const DEL_MVP = [
  'obra_canonica', 'obra_actividad', 'obra_asignacion', 'obra_restriccion', 'obra_documento',
  'obra_alias', 'clientes', 'cliente_contacto', 'cliente_documento', 'certificados',
  'presupuestos', 'partidas_presupuesto', 'adicionales', 'personas', 'proveedores',
  'proveedor_alias', 'registros_hh', 'costos_obra', 'pedidos_materiales', 'herramientas',
  'movimientos_herramienta', 'usuario_obra', 'perfiles', 'actividades_semanales',
]

/**
 * Un predicado que ACOTA. Cualquiera de estos alcanza; `true` o nada, no.
 *
 * `ve_obra_texto` es la variante para las cuatro tablas de Operación, que no tienen `obra_canonica_id`:
 * guardan el nombre de la obra como texto y se resuelven por `obra_alias`. Es la MISMA pregunta con
 * otra llave, y por eso entra acá — la primera versión de este test la dejó afuera y marcó las cuatro
 * como abiertas, que es el falso positivo caro: enseña a ignorar el rojo.
 */
const ACOTA = /es_administracion\(\)|ve_obra(_texto)?\(|current_rol\(\)/

const SIN_BASE = !process.env.DATABASE_URL

test('ninguna policy `for all` del MVP abre la lectura de par en par', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    `select tablename, policyname, coalesce(qual::text, '') as usando
       from pg_policies
      where schemaname = 'public' and cmd = 'ALL' and tablename = any($1)`,
    [DEL_MVP],
  )
  const abiertas = rows
    .filter((r) => !ACOTA.test(r.usando))
    .map((r) => `${r.tablename}.${r.policyname} → using (${r.usando || 'sin predicado'})`)
  assert.deepEqual(abiertas, [],
    `estas policies gobiernan los cuatro comandos con un predicado que no acota: ${abiertas.join(' · ')}`)
})

test('ninguna policy de SELECT del MVP dice `true` sobre datos de una obra', { skip: SIN_BASE }, async () => {
  // Los MAESTROS sí pueden decir `true` — el dueño los abrió a propósito el 19/08. Lo que no puede
  // decir `true` es la lectura de los HECHOS de una obra: ahí el alcance es `ve_obra()`.
  const POR_OBRA = [
    'obra_canonica', 'obra_actividad', 'obra_asignacion', 'obra_restriccion', 'obra_documento',
    'certificados', 'presupuestos', 'adicionales', 'actividades_semanales',
    'costos_obra', 'pedidos_materiales', 'herramientas', 'movimientos_herramienta',
  ]
  const { rows } = await query(
    `select tablename, policyname, coalesce(qual::text, '') as usando
       from pg_policies
      where schemaname = 'public' and cmd = 'SELECT' and tablename = any($1)`,
    [POR_OBRA],
  )
  const faltan = POR_OBRA.filter((t) => !rows.some((r) => r.tablename === t))
  assert.deepEqual(faltan, [], `sin policy de SELECT (RLS habilitada = cero filas): ${faltan.join(', ')}`)

  const abiertas = rows
    .filter((r) => !ACOTA.test(r.usando))
    .map((r) => `${r.tablename}.${r.policyname} → using (${r.usando || 'sin predicado'})`)
  assert.deepEqual(abiertas, [],
    `estas tablas publican los hechos de TODAS las obras a cualquier autenticado: ${abiertas.join(' · ')}`)
})
