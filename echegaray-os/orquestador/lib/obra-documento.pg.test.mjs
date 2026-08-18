// LA MIGRACIÓN DE `obra_documento` CONTRA UN POSTGRES DE VERDAD.
//
// ═══ POR QUÉ NO ALCANZA CON LEER EL .sql ═══
//
// Las propiedades que sostienen un permiso NO son propiedades del texto: son propiedades de la base.
// Una policy `for all` se lee igual de bien que tres policies separadas y significa otra cosa —
// incluye SELECT—, y ese fue el defecto que ya se pagó en `obra_actividad`. Un `grant` que falta se
// lee como nada y hace que la pantalla salga en 404. Nada de eso rompe ningún assert de texto.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//   1. Que alguna policy de ESCRITURA vuelva a ser `for all` — o sea, que gobierne la lectura.
//   2. Que una policy de escritura deje de acotar por obra (`ve_obra`) y un jefe de obra pueda
//      vincular papeles a una obra que no es suya. Se prueba EJECUTÁNDOLO, con `set role`.
//   3. Que falte el `grant`: RLS no es GRANT, y sin grant es `permission denied` disfrazado de 404.
//   4. Que el mismo archivo se pueda vincular dos veces a la misma obra.
//   5. Que la migración no sea idempotente y explote al re-aplicarse.
//
// Se saltea si no hay PG_TEST_URL (misma convención que drive-indice.pg.test.mjs). Para correrlo:
//   docker run -d --rm --name pg-obra-doc -e POSTGRES_PASSWORD=postgres -p 55451:5432 postgres:16-alpine
//   PG_TEST_URL=postgres://postgres:postgres@127.0.0.1:55451/postgres \
//     node --test orquestador/lib/obra-documento.pg.test.mjs
//   docker rm -f pg-obra-doc
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_TEST = process.env.PG_TEST_URL ?? ''

// GUARDA ANTI-PRODUCCIÓN. Este archivo crea y borra objetos sin preguntar: apuntarlo a la base real
// sería irreversible. Falla cerrado — ante la duda, no corre.
const PELIGRO = ['supabase', 'pooler', 'amazonaws']
const apuntaAProduccion = PELIGRO.some((p) => URL_TEST.toLowerCase().includes(p))
if (apuntaAProduccion) {
  throw new Error(`PG_TEST_URL parece apuntar a producción (contiene "${PELIGRO.find((p) => URL_TEST.toLowerCase().includes(p))}"). Abortado.`)
}

const salta = !URL_TEST
const opts = { skip: salta ? 'PG_TEST_URL no seteada' : false }

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRACION = join(AQUI, '..', '..', 'supabase', 'migrations', '20260819T0100_obra_documento.sql')

// EL ESTADO PREVIO, COPIADO DE LO QUE SE LEYÓ EN LA BASE REAL EL 18/08/2026 (no de la intención de
// las migraciones: de `information_schema` y `pg_policies`). La migración se prueba sobre lo que
// realmente hay, no sobre lo que debería haber.
const ANTES = `
  create schema if not exists auth;
  -- Los stubs de las funciones de Supabase. Leen un GUC para que el test pueda ponerse en la piel
  -- de un usuario concreto: sin eso la RLS no se puede EJECUTAR, sólo leer.
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create or replace function public.current_rol() returns text language sql stable as
    $$ select nullif(current_setting('test.rol', true), '') $$;
  create or replace function public.es_administracion() returns boolean language sql stable as
    $$ select coalesce(public.current_rol() in ('direccion','administracion'), false) $$;
  create or replace function public.ve_obra(p_obra text) returns boolean language sql stable as
    $$ select public.es_administracion()
        or p_obra = any (string_to_array(coalesce(current_setting('test.obras', true), ''), ',')) $$;

  create table if not exists public.obra_canonica (id text primary key, nombre text);
  insert into public.obra_canonica (id, nombre) values ('arcor','ARCOR'), ('messina','Messina')
    on conflict do nothing;

  create table if not exists public.obra_documento (
    obra_id       text not null references public.obra_canonica(id) on delete cascade,
    drive_file_id text not null,
    rol           text,
    origen        text not null default 'manual' check (origen in ('manual','path_inferido')),
    creado_en     timestamptz not null default now(),
    primary key (obra_id, drive_file_id)
  );
  alter table public.obra_documento enable row level security;

  drop policy if exists obra_documento_select on public.obra_documento;
  create policy obra_documento_select on public.obra_documento for select to authenticated
    using (public.ve_obra(obra_id));
  drop policy if exists obra_documento_write on public.obra_documento;
  create policy obra_documento_write on public.obra_documento for all to authenticated
    using (public.ve_obra(obra_id) and public.current_rol() = any (array['direccion','administracion','jefe_obra']))
    with check (public.ve_obra(obra_id) and public.current_rol() = any (array['direccion','administracion','jefe_obra']));
  grant select, insert, update, delete on public.obra_documento to authenticated;
  grant usage on schema auth to authenticated;

  -- UNA FILA CON EL VOCABULARIO VIEJO. Hoy la tabla está vacía, pero la migración tiene que poder
  -- correr sobre una base que ya tenga datos: si el update se hiciera con el check viejo puesto,
  -- abortaría entera y nadie se enteraría hasta el deploy.
  delete from public.obra_documento;
  insert into public.obra_documento (obra_id, drive_file_id, rol, origen)
    values ('arcor', 'heredado-1', 'contrato', 'manual'),
           ('arcor', 'heredado-2', 'plano', 'path_inferido'),
           -- LA FILA DE LA OBRA AJENA TIENE QUE EXISTIR DESDE EL PRINCIPIO. Sin ella, el test de
           -- fuga de lectura pasa aunque la policy de escritura vuelva a ser "for all using (true)":
           -- no habría nada ajeno que filtrarse, y el test diría verde sobre un permiso abierto.
           ('messina', 'de-otra-obra', 'contrato', 'manual');
`

let pool = null
const q = (sql, params) => pool.query(sql, params)

before(async () => {
  if (salta) return
  const { default: pg } = await import('pg')
  pool = new pg.Pool({ connectionString: URL_TEST, max: 4 })
  for (const rol of ['authenticated', 'service_role']) {
    await q(`do $$ begin if not exists (select 1 from pg_roles where rolname='${rol}') then create role ${rol} nologin; end if; end $$`)
  }
  await q('drop table if exists public.obra_documento cascade')
  await q(ANTES)
  await q(readFileSync(MIGRACION, 'utf8'))
})

after(async () => { if (pool) await pool.end() })

test('el vínculo queda con las columnas que la pantalla necesita', opts, async () => {
  const { rows } = await q(`select column_name, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='obra_documento'`)
  const porNombre = Object.fromEntries(rows.map((r) => [r.column_name, r]))
  for (const c of ['obra_id', 'drive_file_id', 'nombre', 'tipo', 'mime_type', 'rol', 'origen', 'creado_por', 'creado_en']) {
    assert.ok(porNombre[c], `falta la columna ${c}`)
  }
  // QUIÉN VINCULÓ LO PONE LA BASE, NO EL FORMULARIO. Si el default se cayera, el dato pasaría a
  // depender de lo que mande el navegador y sería falsificable.
  assert.match(porNombre.creado_por.column_default ?? '', /auth\.uid\(\)/)
  assert.equal(porNombre.tipo.is_nullable, 'NO')
})

test('el vocabulario viejo de `origen` se convierte, no se pierde', opts, async () => {
  const { rows } = await q(`select drive_file_id, origen from public.obra_documento order by drive_file_id`)
  assert.deepEqual(rows, [
    { drive_file_id: 'de-otra-obra', origen: 'confirmado' },
    { drive_file_id: 'heredado-1', origen: 'confirmado' },
    { drive_file_id: 'heredado-2', origen: 'inferido' },
  ])
  // Y el check nuevo rechaza el vocabulario viejo: si lo siguiera aceptando, convivirían cuatro
  // palabras para dos conceptos.
  await assert.rejects(
    q(`insert into public.obra_documento (obra_id, drive_file_id, origen) values ('arcor','x','manual')`),
    /obra_documento_origen_check/,
  )
})

test('NINGUNA policy de escritura es `for all` — `for all` incluye SELECT', opts, async () => {
  const { rows } = await q(`select policyname, cmd from pg_policies where tablename='obra_documento'`)
  const porCmd = Object.fromEntries(rows.map((r) => [r.cmd, r.policyname]))
  assert.deepEqual(
    rows.map((r) => r.cmd).sort(),
    ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    `las policies quedaron ${JSON.stringify(rows)}`,
  )
  assert.equal(porCmd.SELECT, 'obra_documento_select')
  assert.ok(!rows.some((r) => r.cmd === 'ALL'), 'volvió a haber una policy `for all`')
})

test('las cuatro policies acotan por obra, y las de escritura además por rol', opts, async () => {
  const { rows } = await q(`select policyname, cmd, qual, with_check from pg_policies where tablename='obra_documento'`)
  for (const p of rows) {
    const texto = `${p.qual ?? ''} ${p.with_check ?? ''}`
    assert.match(texto, /ve_obra\(obra_id\)/, `${p.policyname} dejó de acotar por obra`)
    if (p.cmd !== 'SELECT') assert.match(texto, /current_rol\(\)/, `${p.policyname} dejó de exigir rol`)
  }
  // `with check` además de `using` en UPDATE: sin él, un update podría MOVER el vínculo a otra obra
  // —escribir en la obra ajena por la puerta de la propia—.
  const update = rows.find((p) => p.cmd === 'UPDATE')
  assert.ok(update.qual && update.with_check, 'el UPDATE necesita using Y with check')
})

test('RLS NO ES GRANT: authenticated y service_role tienen los suyos', opts, async () => {
  const { rows } = await q(`select grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='obra_documento' and grantee in ('authenticated','service_role')`)
  for (const grantee of ['authenticated', 'service_role']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.ok(
        rows.some((r) => r.grantee === grantee && r.privilege_type === priv),
        `falta grant ${priv} a ${grantee} — sería permission denied, y Next lo muestra como 404`,
      )
    }
  }
})

test('un jefe de obra NO puede vincular un papel a una obra que no es suya', opts, async () => {
  const cli = await pool.connect()
  try {
    await cli.query('begin')
    await cli.query(`set local role authenticated`)
    await cli.query(`set local test.rol = 'jefe_obra'`)
    await cli.query(`set local test.obras = 'arcor'`)
    await cli.query(`set local test.uid = '11111111-1111-1111-1111-111111111111'`)

    // La suya, sí.
    await cli.query(`insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo)
      values ('arcor', 'propio', 'Contrato.pdf', 'archivo')`)
    // La de al lado, no. Y falla en el INSERT, no en un filtro de lectura.
    // El savepoint no es adorno: un error deja la transacción abortada y todo lo que venga después
    // —incluida la verificación de la lectura— fallaría por eso y no por lo que se está probando.
    await cli.query('savepoint intento_ajeno')
    await assert.rejects(
      cli.query(`insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo)
        values ('messina', 'ajeno', 'Contrato.pdf', 'archivo')`),
      /row-level security/,
    )
    await cli.query('rollback to savepoint intento_ajeno')
    // Y NO VE EL PAPEL DE LA OTRA OBRA. Esta es la fuga que `for all` abre por la puerta de la
    // escritura: si alguna policy de escritura vuelve a gobernar el SELECT, 'de-otra-obra' aparece
    // en esta lista aunque la policy de lectura siga diciendo lo correcto.
    const { rows } = await cli.query(`select drive_file_id from public.obra_documento`)
    assert.deepEqual(rows.map((r) => r.drive_file_id).sort(), ['heredado-1', 'heredado-2', 'propio'])
    await cli.query('rollback')
  } finally {
    cli.release()
  }
})

test('el mismo archivo no se vincula dos veces a la misma obra', opts, async () => {
  await q(`insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo)
    values ('arcor', 'dup', 'Planos', 'carpeta')`)
  await assert.rejects(
    q(`insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo)
      values ('arcor', 'dup', 'Planos otra vez', 'carpeta')`),
    /duplicate key value/,
  )
  // Pero el MISMO archivo en OTRA obra sí: un plano de detalle puede servir a dos obras.
  await q(`insert into public.obra_documento (obra_id, drive_file_id, nombre, tipo)
    values ('messina', 'dup', 'Planos', 'carpeta')`)
})

test('la migración se puede volver a aplicar sin romper nada', opts, async () => {
  await q(readFileSync(MIGRACION, 'utf8'))
  // 3 heredadas + arcor/dup + messina/dup. El vínculo del test de RLS se fue con su rollback.
  const { rows } = await q(`select count(*)::int as n from public.obra_documento`)
  assert.equal(rows[0].n, 5, 'la re-aplicación tocó los datos')
  const { rows: pol } = await q(`select cmd from pg_policies where tablename='obra_documento'`)
  assert.equal(pol.length, 4)
})
