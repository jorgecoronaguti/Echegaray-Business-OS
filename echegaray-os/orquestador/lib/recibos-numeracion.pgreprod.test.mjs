// NUMERACIÓN CORRELATIVA DE RECIBOS (migración 20261002T1200), EJECUTADA — sobre un Postgres DESCARTABLE.
//
// El auditor rechazó la rama porque sus pruebas eran regex sobre el fuente: no probaban que el SQL corriera,
// ni que la serie no deje huecos, ni que el libro asiente cada número. Ésta crea una base nueva en el
// contenedor local `pg-reprod` (supabase/postgres:17.6.1.165), le pone lo mínimo de plataforma (auth.uid,
// storage, roles de sesión), aplica las migraciones REALES que la nueva necesita —recibo_cliente,
// recibo_liquidacion y sus estados, el recibo firmado de efectivo— con filas como las de hoy (tres recibos
// REC-2026-000N, dos «enviado»; recibos de cliente a mano hasta el 19), aplica la nueva DOS veces y la usa.
// Al final borra la base.
//
// NUNCA LA BASE REAL: no lee DATABASE_URL. Corre sólo con PG_REPROD_URL apuntando a 127.0.0.1/localhost
// (p. ej. postgres://postgres:<clave>@127.0.0.1:55452/postgres); sin eso se saltea diciéndolo.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { esUrlLocal } from './reconstruccion-candados.mjs'

const URL_ADMIN = process.env.PG_REPROD_URL ?? ''
const MIG = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')
const PREVIAS = [
  '20260826T2200_los_recibos_del_cliente_tienen_donde_vivir.sql',
  '20260922T2600_recibo_liquidacion.sql',
  '20260922T2900_el_recibo_emitido_se_firma.sql',
  '20260930T2200_recibo_firmado_en_papel_sin_foto.sql',
  '20261001T0900_efectivo_recibo_firmado.sql',
]
const NUEVA = '20261002T1200_recibos_numeracion_correlativa.sql'
const sinBase = !URL_ADMIN ? 'sin PG_REPROD_URL (Postgres descartable local)'
  : !esUrlLocal(URL_ADMIN) ? 'PG_REPROD_URL no es local: esta prueba no corre contra una base remota' : false

// Lo que en Supabase da la plataforma o migraciones anteriores, reducido a lo que estas tablas tocan. El rol
// de la sesión sale del JWT del test (`rol`), como `current_rol()` lo saca del perfil en la app.
const PLATAFORMA = `
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as
  $f$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $f$;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $f$ select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1] $f$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create function public.current_rol() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'rol' $f$;
create function public.liquida_sueldos() returns boolean language sql stable security definer set search_path = public as
  $f$ select coalesce(public.current_rol() in ('direccion', 'administracion'), false) $f$;
create function public.es_administracion() returns boolean language sql stable security definer set search_path = public as
  $f$ select coalesce(public.current_rol() in ('direccion', 'administracion', 'jefe_obra'), false) $f$;
create function public.es_cliente() returns boolean language sql stable as $f$ select public.current_rol() = 'cliente' $f$;
create function public.cliente_de_sesion() returns uuid language sql stable as $f$ select null::uuid $f$;
create function public.mi_persona_id() returns uuid language sql stable as $f$ select null::uuid $f$;
create table public.personas (id uuid primary key default gen_random_uuid(), nombre text);
create table public.clientes (id uuid primary key default gen_random_uuid(), slug text);
create table public.obra_canonica (id text primary key);
create table public.cliente_acceso (auth_user_id uuid, revocado_at timestamptz, puede_ver_obra boolean, obras text[]);
create table public.efectivo_entrega (id uuid primary key default gen_random_uuid(), persona_id uuid references public.personas(id));
create table public.efectivo_rendicion (id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.efectivo_entrega(id), monto numeric(14,2) not null, fecha date,
  imputada_en timestamptz not null default now(), concepto text, proveedor text, origen text not null);
create function public._efectivo_actua_por(uuid) returns boolean language sql stable as $f$ select public.es_administracion() $f$;
`

// Como está hoy: tres recibos de quincena con su REC-2026-000N (dos ya mandados a firmar), recibos de
// cliente numerados a mano hasta el 19 (y uno escrito raro, que no cuenta), un gasto manual sin firmar.
const FILAS_DE_HOY = `
insert into public.personas (id, nombre) values ('00000000-0000-4000-8000-0000000000a1', 'Persona Uno');
insert into public.clientes (id, slug) values ('00000000-0000-4000-8000-0000000000c1', 'cliente-prueba');
insert into public.recibo_liquidacion (persona_id, quincena_desde, quincena_hasta, nombre, renglones, estado, enviado_en)
select '00000000-0000-4000-8000-0000000000a1', d, d + 14, 'Persona Uno', '{"horas":[{"r":"x"}],"medios":[]}', e, en
  from (values ('2026-08-01'::date, 'enviado', now()), ('2026-08-16', 'enviado', now()), ('2026-09-01', 'emitido', null))
       v(d, e, en) order by d;
insert into public.recibo_cliente (cliente_id, numero, drive_file_id, drive_url, nombre_archivo, origen)
values ('00000000-0000-4000-8000-0000000000c1', '7', 'f7', 'u7', 'Recibo 7.pdf', 'drive'),
       ('00000000-0000-4000-8000-0000000000c1', ' 19 ', 'f19', 'u19', 'Recibo 19.pdf', 'drive'),
       ('00000000-0000-4000-8000-0000000000c1', '19bis', 'fx', 'ux', 'Recibo 19bis.pdf', 'drive');
insert into public.efectivo_entrega (id, persona_id) values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1');
insert into public.efectivo_rendicion (id, entrega_id, monto, fecha, origen)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1500, '2026-10-01', 'manual');
`

const DIRECCION = JSON.stringify({ sub: '00000000-0000-4000-8000-00000000d001', role: 'authenticated', rol: 'direccion' })
const CLIENTE = JSON.stringify({ sub: '00000000-0000-4000-8000-00000000c001', role: 'authenticated', rol: 'cliente' })
const TRAZO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220"><path d="M10 10 L50 60 L90 20" fill="none"/></svg>'

let admin
let c
let base

const leer = (f) => readFileSync(join(MIG, f), 'utf8')
const q = async (sql, params) => (await c.query(sql, params)).rows
async function enTx(sql) {
  await c.query('begin')
  try { await c.query(sql); await c.query('commit') } catch (e) { await c.query('rollback'); throw e }
}
/** Ejecuta `fn` en una transacción que se deshace, con el JWT dado; devuelve lo que `fn` devuelva. */
async function como(claims, fn, { rol = null } = {}) {
  await c.query('begin')
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    if (rol) await c.query(`set local role ${rol}`)
    return await fn()
  } finally { await c.query('rollback') }
}
/** Igual que `como`, pero lo que pasa queda. */
async function comoYQueda(claims, fn) {
  await c.query('begin')
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    const r = await fn()
    await c.query('commit')
    return r
  } catch (e) { await c.query('rollback'); throw e }
}
const serie = async (s) => (await q('select ultimo, a_mano_hasta from recibo_serie where serie = $1', [s]))[0]

before(async () => {
  if (sinBase) return
  admin = new pg.Client({ connectionString: URL_ADMIN })
  await admin.connect()
  base = `recibos_num_${process.pid}_${Date.now()}`
  await admin.query(`create database ${base}`)
  const u = new URL(URL_ADMIN)
  u.pathname = `/${base}`
  c = new pg.Client({ connectionString: u.toString() })
  await c.connect()
  await enTx(PLATAFORMA)
  for (const f of PREVIAS) await enTx(leer(f))
  await enTx(FILAS_DE_HOY)
  await enTx(leer(NUEVA))
})

after(async () => {
  if (sinBase) return
  await c?.end().catch(() => {})
  if (base) await admin.query(`drop database if exists ${base} with (force)`)
  await admin?.end()
})

const opc = { skip: sinBase }

test('backfill: los tres de quincena pasan a RP-000001..3 en el orden de emisión, con su REC- en codigo_anterior y su asiento', opc, async () => {
  const r = await q('select serie_numero, codigo, codigo_anterior, estado from recibo_liquidacion order by numero')
  assert.deepEqual(r.map((x) => [x.serie_numero, x.codigo, x.codigo_anterior, x.estado]), [
    [1, 'RP-000001', 'REC-2026-0001', 'enviado'],
    [2, 'RP-000002', 'REC-2026-0002', 'enviado'],
    [3, 'RP-000003', 'REC-2026-0003', 'emitido'],
  ])
  assert.deepEqual(await serie('RP'), { ultimo: 3, a_mano_hasta: 0 })
  const libro = await q(`select numero, codigo, referencia from recibo_numero_asignado where serie = 'RP' order by numero`)
  assert.deepEqual(libro.map((x) => x.codigo), ['RP-000001', 'RP-000002', 'RP-000003'])
  for (const x of libro) assert.match(x.referencia, /^recibo_liquidacion:[0-9a-f-]{36} · Persona Uno · quincena .* · antes REC-2026-000\d$/)
})

test('RC arranca después del mayor número entero a mano (19), y ése es el límite de lo que no tiene asiento', opc, async () => {
  assert.deepEqual(await serie('RC'), { ultimo: 19, a_mano_hasta: 19 })
})

test('la migración corre dos veces sin renumerar, sin duplicar asientos y sin bajar la serie', opc, async () => {
  await enTx(leer(NUEVA))
  assert.deepEqual(await serie('RP'), { ultimo: 3, a_mano_hasta: 0 })
  assert.deepEqual(await serie('RC'), { ultimo: 19, a_mano_hasta: 19 })
  assert.equal((await q('select count(*)::int n from recibo_numero_asignado'))[0].n, 3)
  const r = await q('select codigo, codigo_anterior from recibo_liquidacion order by numero')
  assert.deepEqual(r.map((x) => x.codigo_anterior), ['REC-2026-0001', 'REC-2026-0002', 'REC-2026-0003'])
})

test('registrar un recibo de quincena toma RP-000004 y el asiento dice qué recibo es; uno rechazado no consume número', opc, async () => {
  const registrar = (renglones) => q(`select public.registrar_recibo_liquidacion($1, '2026-09-16', '2026-09-30', 'Persona Uno', $2) id`,
    ['00000000-0000-4000-8000-0000000000a1', renglones])
  await assert.rejects(comoYQueda(DIRECCION, () => registrar('{"horas":[],"medios":[]}')), /no dice nada/)
  assert.equal((await serie('RP')).ultimo, 3, 'el rechazado no movió la serie')
  const [{ id }] = await comoYQueda(DIRECCION, () => registrar('{"horas":[{"r":"x"}],"medios":[]}'))
  const [fila] = await q('select serie_numero, codigo, codigo_anterior from recibo_liquidacion where id = $1', [id])
  assert.deepEqual(fila, { serie_numero: 4, codigo: 'RP-000004', codigo_anterior: null })
  const [asiento] = await q(`select referencia, tomado_por from recibo_numero_asignado where serie = 'RP' and numero = 4`)
  assert.equal(asiento.referencia, `recibo_liquidacion:${id} · Persona Uno · quincena 2026-09-16/2026-09-30`)
  assert.equal(asiento.tomado_por, JSON.parse(DIRECCION).sub)
})

test('el gasto manual de efectivo sigue el mismo correlativo (RP-000005) y deja su asiento', opc, async () => {
  await comoYQueda(DIRECCION, () => q(`select public.firmar_recibo_gasto_manual($1, $2, 'Juan Pérez', null)`,
    ['00000000-0000-4000-8000-0000000000f1', TRAZO]))
  const [f] = await q('select serie_numero, codigo from efectivo_recibo_firma')
  assert.deepEqual(f, { serie_numero: 5, codigo: 'RP-000005' })
  const [a] = await q(`select referencia from recibo_numero_asignado where serie = 'RP' and numero = 5`)
  assert.equal(a.referencia, 'efectivo_recibo_firma:00000000-0000-4000-8000-0000000000f1 · Juan Pérez · $1500.00')
})

test('RC: el número vuelve con el rollback; sin referencia no se toma; tomado queda asentado con su dueño', opc, async () => {
  await c.query('begin')
  try {
    assert.equal((await q(`select public.tomar_numero_de_recibo('RC', 'se cae') n`))[0].n, 20)
  } finally { await c.query('rollback') }
  assert.equal((await serie('RC')).ultimo, 19)
  assert.equal((await q(`select count(*)::int n from recibo_numero_asignado where serie = 'RC'`))[0].n, 0)
  await assert.rejects(q(`select public.tomar_numero_de_recibo('RC', '   ')`), /diciendo para qué recibo/)
  await assert.rejects(q(`select public.tomar_numero_de_recibo('RC')`), /does not exist/, 'la firma vieja sin referencia no queda viva')
  assert.equal((await serie('RC')).ultimo, 19)
  assert.equal((await q(`select public.tomar_numero_de_recibo('RC', 'Cliente de Prueba SA · 01/10/2026 · $500') n`))[0].n, 20)
  const [a] = await q(`select codigo, referencia, anulado_en from recibo_numero_asignado where serie = 'RC'`)
  assert.deepEqual(a, { codigo: 'RC-000020', referencia: 'Cliente de Prueba SA · 01/10/2026 · $500', anulado_en: null })
})

test('anular: el número queda ocupado con su motivo, no se reusa, no se borra ni se reescribe', opc, async () => {
  await assert.rejects(q(`select public.anular_numero_de_recibo('RC', 20, 'x')`), /exige decir por qué/)
  await q(`select public.anular_numero_de_recibo('RC', 20, 'JSON descartado: el monto estaba mal')`)
  await assert.rejects(q(`select public.anular_numero_de_recibo('RC', 20, 'otra vez lo mismo')`), /ya está anulado/)
  await assert.rejects(q(`select public.anular_numero_de_recibo('RC', 99, 'no existe este')`), /no está en el libro/)
  await assert.rejects(q(`update recibo_numero_asignado set referencia = 'otro' where serie = 'RC' and numero = 20`), /no se cambia/)
  await assert.rejects(q(`delete from recibo_numero_asignado where serie = 'RC' and numero = 20`), /no se borra del libro/)
  await assert.rejects(q('truncate recibo_numero_asignado'), /no se vacía/)
  assert.equal((await q(`select public.tomar_numero_de_recibo('RC', 'el siguiente cobro') n`))[0].n, 21, 'el 20 no vuelve a la serie')
  const [a] = await q(`select anulado_motivo from recibo_numero_asignado where serie = 'RC' and numero = 20`)
  assert.equal(a.anulado_motivo, 'JSON descartado: el monto estaba mal')
})

test('un recibo numerado no cambia de número ni se borra; el resto de su ciclo sigue andando', opc, async () => {
  const uno = `(select id from recibo_liquidacion where serie_numero = 1)`
  await assert.rejects(q(`update recibo_liquidacion set codigo = 'RP-000099' where id = ${uno}`), /no se cambia/)
  await assert.rejects(q(`update recibo_liquidacion set codigo_anterior = 'REC-2026-0099' where id = ${uno}`), /no se cambia/)
  await assert.rejects(q(`delete from recibo_liquidacion where id = ${uno}`), /un recibo numerado no se borra/)
  await assert.rejects(q('truncate recibo_liquidacion'), /no se vacía/)
  await como(DIRECCION, async () => {
    await q(`update recibo_liquidacion set estado = 'observado', observacion = 'no coincide' where id = ${uno}`)
  })
  assert.equal((await q('select count(*)::int n from recibo_liquidacion'))[0].n, 4)
})

test('permisos: authenticated lee el libro sólo si es dirección/administración, y no escribe ni toma ni anula', opc, async () => {
  const filas = await como(DIRECCION, () => q('select count(*)::int n from recibo_numero_asignado'), { rol: 'authenticated' })
  assert.ok(filas[0].n >= 7, 'dirección ve el libro')
  const delCliente = await como(CLIENTE, () => q('select count(*)::int n from recibo_numero_asignado'), { rol: 'authenticated' })
  assert.equal(delCliente[0].n, 0, 'un usuario del portal no ve a quién se dio cada número')
  for (const sql of [
    `insert into recibo_numero_asignado (serie, numero, codigo, referencia) values ('RC', 500, 'RC-000500', 'x')`,
    `select public.tomar_numero_de_recibo('RC', 'suelto por la API')`,
    `select public.anular_numero_de_recibo('RC', 21, 'desde la API')`,
    `update recibo_serie set ultimo = 0`,
  ]) {
    await assert.rejects(como(DIRECCION, () => q(sql), { rol: 'authenticated' }), /permission denied/, sql)
  }
})

test('dos cobros a la vez: el segundo espera al primero y, si el primero se cae, toma su número (sin hueco)', opc, async () => {
  const u = new URL(URL_ADMIN)
  u.pathname = `/${base}`
  const c2 = new pg.Client({ connectionString: u.toString() })
  await c2.connect()
  try {
    const inicio = (await serie('RC')).ultimo
    await c.query('begin')
    let segundo
    try {
      assert.equal((await q(`select public.tomar_numero_de_recibo('RC', 'primero, se cae') n`))[0].n, inicio + 1)
      await c2.query('begin')
      // Queda esperando el lock de la fila de la serie: no lee un `ultimo` viejo.
      segundo = c2.query(`select public.tomar_numero_de_recibo('RC', 'segundo, queda') n`)
      await new Promise((r) => setTimeout(r, 300))
    } finally { await c.query('rollback') }
    assert.equal((await segundo).rows[0].n, inicio + 1, 'el número del que se cayó no queda como hueco')
    await c2.query('commit')
    const libro = await q(`select numero, referencia from recibo_numero_asignado where serie = 'RC' and numero > $1`, [inicio])
    assert.deepEqual(libro, [{ numero: inicio + 1, referencia: 'segundo, queda' }])
  } finally {
    await c2.query('rollback').catch(() => {})
    await c2.end()
  }
})
