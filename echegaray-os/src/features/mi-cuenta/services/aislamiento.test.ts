// NADIE VE EL LEGAJO, LAS HORAS NI LOS DOCUMENTOS DE OTRO.
//
// ═══ POR QUÉ ESTE TEST EXISTE ═══
//
// `/mi-cuenta` se apoya en cuatro vistas `mi_*` que son `security_invoker = false`: leen la tabla
// con los privilegios del DUEÑO de la vista, salteando la RLS de `personas`, `registros_hh` y
// `documentacion_legajo`. Eso es deliberado —es el único camino para que un oficial albañil vea sus
// propias horas sin abrirle las de los otros— y lo ÚNICO que lo contiene es el `where … =
// public.mi_persona_id()` que cada vista lleva horneado adentro.
//
// Si alguien borra ese `where` —refactorizando, o «para probar»— la vista no falla: EMPIEZA A
// DEVOLVER EL LEGAJO Y EL SUELDO DE TODO EL PLANTEL a cualquier autenticado, con 200 y sin un solo
// error en el log. Es el modo de falla más caro que tiene esta pantalla y no lo detecta ningún
// typecheck, ningún lint y ninguna prueba de interfaz.
//
// ═══ Y LA OTRA MITAD: RLS NO ES GRANT ═══
//
// Una vista sin `grant select` devuelve «permission denied for view …», que Next muestra como un
// 404. Ya costó medio día. Cada vista tiene que tener las dos cosas, y las dos se verifican acá.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Esto lee el SQL, no la base. Que la migración esté APLICADA es otra cosa y se verifica contra
// Postgres —un archivo commiteado no es una migración corrida—. Lo que este test garantiza es que
// el SQL que se va a aplicar no tenga el agujero.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SQL = readFileSync(
  fileURLToPath(new URL('../../../../supabase/migrations/20260820T3000_cada_uno_ve_lo_suyo_y_solo_lo_suyo.sql', import.meta.url)),
  'utf8',
)

/** Las vistas que publican datos personales de UNA persona. Cada una tiene que estar cerrada. */
const VISTAS = ['mi_legajo', 'mi_asignacion', 'mi_hh_dia', 'mi_documento_legajo']

/** El cuerpo de una vista: de su `create … view <nombre>` hasta el `;` que la cierra. */
function cuerpoDe(vista: string): string {
  const desde = SQL.indexOf(`create or replace view public.${vista}`)
  assert.notEqual(desde, -1, `la vista ${vista} no está en la migración`)
  const hasta = SQL.indexOf(';', desde)
  assert.notEqual(hasta, -1, `la vista ${vista} no termina`)
  return SQL.slice(desde, hasta)
}

for (const vista of VISTAS) {
  test(`${vista} filtra por mi_persona_id(): sin eso publica el legajo de todo el plantel`, () => {
    const cuerpo = cuerpoDe(vista)
    assert.match(
      cuerpo,
      /where[\s\S]*public\.mi_persona_id\(\)/,
      `${vista} no tiene el portero: una vista security_invoker=false sin el where devuelve TODAS las filas`,
    )
  })

  test(`${vista} tiene su grant: una policy sin grant es un 404 en la cara del usuario`, () => {
    assert.match(
      SQL,
      new RegExp(`grant select on public\\.${vista} to authenticated`),
      `falta el grant de ${vista}`,
    )
  })
}

test('el portero compara contra la persona del usuario, no contra un parámetro de la pantalla', () => {
  // Si el filtro fuera `where persona_id = $1` con el id viniendo de la URL, cualquiera cambiaría el
  // número y leería el legajo del de al lado. El id NO puede entrar por la pantalla: sale de
  // `auth.uid()` adentro de la base.
  assert.match(
    SQL,
    /create or replace function public\.mi_persona_id\(\)[\s\S]*?where id = auth\.uid\(\)/,
    'mi_persona_id() tiene que resolverse con auth.uid(), nunca con un argumento',
  )
  assert.match(SQL, /security definer/, 'sin security definer no puede leer perfiles')
  assert.match(SQL, /stable/, 'sin stable se evalúa una vez por fila en tablas de miles de registros')
})

test('nadie se cambia el rol ni se autovincula un legajo desde Mi cuenta', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La policy `perfiles_update_propio` deja que cada uno actualice SU fila. Sola, eso incluye la
  // columna `rol`: un usuario de campo se escribiría `rol='direccion'` por PostgREST y se abriría la
  // economía entera. Lo que lo impide es el GRANT POR COLUMNA — Postgres rechaza el UPDATE de una
  // columna no concedida ANTES de mirar una sola policy.
  const grant = SQL.match(/grant update \(([^)]*)\) on public\.perfiles to authenticated/)
  assert.ok(grant, 'el update de perfiles tiene que concederse POR COLUMNA, nunca sobre la tabla')
  const columnas = grant[1].split(',').map((c) => c.trim())
  assert.deepEqual(columnas, ['nombre', 'telefono', 'avatar_url'])
  for (const prohibida of ['rol', 'persona_id', 'id']) {
    assert.ok(!columnas.includes(prohibida), `«${prohibida}» no puede estar en el grant de update`)
  }
  // Y jamás el grant de tabla entera, que anularía todo lo anterior.
  assert.ok(
    !/grant\s+[^;]*update[^;(]*\s+on public\.perfiles to authenticated/.test(SQL.replace(/grant update \([^)]*\)/g, '')),
    'un grant de update sobre la tabla entera vuelve a abrir la columna rol',
  )
})

test('la foto se sube a la carpeta del propio usuario y no encima de la de otro', () => {
  // Sin `foldername(name)[1] = auth.uid()`, «cambiar mi foto» es «cambiarle la foto a quien yo
  // quiera»: el bucket es público para LEER, no para escribir sobre lo ajeno.
  const escrituras = SQL.match(/create policy "avatares_(insert|update|delete)_propio"[\s\S]*?;/g) ?? []
  assert.equal(escrituras.length, 3, 'insert, update y delete tienen que estar acotados')
  for (const p of escrituras) {
    assert.match(p, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
  }
})

test('una persona no puede quedar colgada de dos usuarios', () => {
  // Un `unique` a secas sobre una columna con NULL no restringe nada entre los NULL —ya vivió un
  // índice único sobre 206 NULLs sin quejarse—, así que el índice tiene que ser PARCIAL.
  assert.match(
    SQL,
    /create unique index if not exists perfiles_una_persona_por_usuario[\s\S]*?where persona_id is not null/,
  )
})

test('mi_legajo no publica el sueldo, el dni ni el cuil', () => {
  // Son las tres columnas que el repo ya declaró cerradas para la web (20260819T2300). Que el legajo
  // sea MÍO no cambia que ninguna pantalla las muestre: una columna que viaja sin dibujarse es una
  // fuga sin beneficio.
  const cuerpo = cuerpoDe('mi_legajo')
  for (const col of ['retribucion_pactada', 'p.dni', 'p.cuil']) {
    assert.ok(!cuerpo.includes(col), `mi_legajo no puede publicar ${col}`)
  }
})
