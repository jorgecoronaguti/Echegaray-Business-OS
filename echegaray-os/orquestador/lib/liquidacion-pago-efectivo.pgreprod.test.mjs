// EL PAGO EN EFECTIVO DE LIQUIDACIÓN BAJA LA CAJA (migración 20261002T1800), EJECUTADA sobre un Postgres DESCARTABLE.
//
// Misma técnica que la numeración de recibos: una base nueva en el contenedor local `pg-reprod`, con lo mínimo de
// plataforma y las tablas de hoy reducidas a las columnas que esto toca; se aplican las migraciones REALES que ya
// existen para esto (la vista de caja de 20260925T1100, `pago_efectivo_sueldo` y su RPC de 20260930T2200/20261001T1000),
// se siembran filas como las de hoy (quincenas 01–15/09, 16–30/09 y 01–15/10 con las cifras del dueño), se aplica la
// nueva DOS veces y se la usa. Al final se borra la base.
//
// NUNCA LA BASE REAL: no lee DATABASE_URL. Corre sólo con PG_REPROD_URL local; sin eso se saltea diciéndolo.
//
// LO QUE NO CUBRE (dicho): `rendir_adelanto_de_sueldo` y `quitar_adelanto_rendido` tienen varias versiones con
// dependencias profundas; acá se reproduce su ORDEN de escritura (actualizar la línea, después insertar/borrar la
// rendición), no se ejecutan sus cuerpos.
//
// MUTACIÓN: `PAGO_EFECTIVO_MIGRACION` apunta a una copia alterada de la migración (para probar que cada prueba puede fallar).
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { esUrlLocal } from './reconstruccion-candados.mjs'

const URL_ADMIN = process.env.PG_REPROD_URL ?? ''
const MIG = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')
const NUEVA = process.env.PAGO_EFECTIVO_MIGRACION ?? join(MIG, '20261002T1800_liquidacion_pago_efectivo_baja_la_caja.sql')
const sinBase = !URL_ADMIN ? 'sin PG_REPROD_URL (Postgres descartable local)'
  : !esUrlLocal(URL_ADMIN) ? 'PG_REPROD_URL no es local: esta prueba no corre contra una base remota' : false

const P = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN_USR = P(900)
const DIRECCION = JSON.stringify({ sub: ADMIN_USR, role: 'authenticated', rol: 'direccion' })
const OBRERO = JSON.stringify({ sub: P(901), role: 'authenticated', rol: 'obrero' })

// La vista de caja con sus tres ramas de hoy, TAL COMO está en la migración real (así `create or replace` de la nueva
// se prueba contra el tipo de columnas verdadero, no contra una copia a mano).
const vistaDeHoy = () => {
  const t = readFileSync(join(MIG, '20260925T1100_adelanto_de_sueldo_rendido_desde_el_chat.sql'), 'utf8')
  const i = t.indexOf('create or replace view public.efectivo_movimiento_caja')
  return t.slice(i, t.indexOf('grant select on public.efectivo_movimiento_caja to authenticated;', i) + 'grant select on public.efectivo_movimiento_caja to authenticated;'.length)
}

const PLATAFORMA = `
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $f$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create function public.current_rol() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'rol' $f$;
create function public.liquida_sueldos() returns boolean language sql stable security definer set search_path = public as
  $f$ select coalesce(public.current_rol() in ('direccion', 'administracion'), false) $f$;
create table public.personas (id uuid primary key default gen_random_uuid(), nombre_completo text not null,
  es_prueba boolean default false, en_la_empresa boolean default true);
create table public.perfiles (id uuid primary key, rol text);
create table public.obra_canonica (id text primary key, nombre text);
create table public.efectivo_entrega (id uuid primary key default gen_random_uuid(),
  codigo text, persona_id uuid not null references public.personas(id), obra_id text,
  monto numeric(14,2) not null, fecha date not null, creada_en timestamptz not null default now(),
  anulada_en timestamptz, es_prueba boolean not null default false);
create table public.efectivo_devolucion (id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.efectivo_entrega(id), monto numeric(14,2) not null, fecha date not null,
  registrada_en timestamptz not null default now());
create table public.efectivo_rendicion (id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.efectivo_entrega(id), monto numeric(14,2) not null,
  imputada_en timestamptz not null default now(), adelanto_persona_id uuid references public.personas(id),
  adelanto_fecha date, adelanto_quincena date, adelanto_grupo text);
create table public.liquidacion_quincena (id uuid primary key default gen_random_uuid(), desde date not null, hasta date not null,
  grupo text not null, estado text not null default 'abierta', unique (desde, hasta, grupo));
create table public.liquidacion_linea (id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidacion_quincena(id) on delete cascade,
  persona_id uuid not null references public.personas(id), pagado_efectivo numeric(14,2), adelanto_manual numeric(14,2),
  pagada_en timestamptz, pagada_por uuid, escribio_id uuid, escribio_en timestamptz, formulas jsonb,
  actualizado_en timestamptz, unique (liquidacion_id, persona_id));
create table public.jornales_bloque_persona (persona_id uuid, quincena_desde date, adelanto numeric);
create table public.caja_conteo_observado (file_id text not null, concepto text not null, valor numeric not null,
  visto_desde timestamptz not null, primary key (file_id, concepto, visto_desde));
create function public.adelanto_de_sueldo_celda(p_persona uuid, p_fecha date) returns jsonb language sql stable as
  $f$ select jsonb_build_object('grupo', 'obreros',
       'desde', case when extract(day from p_fecha) <= 15 then date_trunc('month', p_fecha)::date else (date_trunc('month', p_fecha) + interval '15 days')::date end,
       'hasta', case when extract(day from p_fecha) <= 15 then (date_trunc('month', p_fecha) + interval '14 days')::date
                     else (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date end) $f$;
-- En producción esas tablas dejan leer a quien corresponde por sus propias policies; acá sólo importa que la VISTA y el portero de los pagos decidan.
grant select on public.personas, public.obra_canonica, public.efectivo_entrega, public.efectivo_devolucion, public.efectivo_rendicion to authenticated;
`

// Como está hoy (cifras del dueño): 15 líneas de la 01–15/09 con $ 5.499.956,15 (marca «pagada» del 17/09); 9 de la 16–30/09
// con $ 1.460.200 sin fecha; 2 de la 01–15/10 con $ 253.000; una de agosto histórica. Conteo sellado del 24/09 por $ 36.720.000.
const FILAS_DE_HOY = () => {
  const lineas = []
  let n = 100
  const q = (desde, hasta, importes, extra = '') => importes.map((m) =>
    `insert into public.personas (id, nombre_completo) values ('${P(++n)}', 'Persona ${n}');
     insert into public.liquidacion_linea (liquidacion_id, persona_id, pagado_efectivo${extra ? ', pagada_en' : ''})
     select id, '${P(n)}', ${m}${extra ? `, ${extra}` : ''} from public.liquidacion_quincena where desde = '${desde}' and grupo = 'obreros';`)
  lineas.push(...q('2026-09-01', '2026-09-15', [...Array(14).fill(366000), 375956.15], `'2026-09-17 15:00+00'`))
  lineas.push(...q('2026-09-16', '2026-09-30', [...Array(8).fill(160000), 180200]))
  lineas.push(...q('2026-10-01', '2026-10-15', [100000, 153000]))
  lineas.push(...q('2026-08-01', '2026-08-15', [3144200]))
  return `
insert into public.liquidacion_quincena (desde, hasta, grupo) values
  ('2026-08-01','2026-08-15','obreros'), ('2026-09-01','2026-09-15','obreros'),
  ('2026-09-16','2026-09-30','obreros'), ('2026-10-01','2026-10-15','obreros');
insert into public.personas (id, nombre_completo) values ('${P(500)}', 'Quien rinde'), ('${P(501)}', 'Sin línea');
insert into public.perfiles (id, rol) values ('${ADMIN_USR}', 'administracion');
insert into public.caja_conteo_observado (file_id, concepto, valor, visto_desde)
values ('f', 'CAJA_ARQUEO_ARS', 36720000, '2026-09-24 22:12:00+00');
${lineas.join('\n')}`
}

let admin
let c
let base

const leer = (f) => readFileSync(f.includes('/') ? f : join(MIG, f), 'utf8')
const q = async (sql, params) => (await c.query(sql, params)).rows
async function enTx(sql) {
  await c.query('begin')
  try { await c.query(sql); await c.query('commit') } catch (e) { await c.query('rollback'); throw e }
}
/** Corre `fn` con el JWT dado (y el rol de base si se pide) en una transacción que se DESHACE. */
async function como(claims, fn, { rol = null } = {}) {
  await c.query('begin')
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    if (rol) await c.query(`set local role ${rol}`)
    return await fn()
  } finally { await c.query('rollback') }
}
const saldo = async () => {
  const r = await q('select * from public.efectivo_caja_saldo')
  return r[0] ? Number(r[0].saldo) : null
}
const lineaDe = async (desde, orden = 0) => (await q(
  `select l.id, l.persona_id, l.pagado_efectivo from public.liquidacion_linea l
     join public.liquidacion_quincena z on z.id = l.liquidacion_id
    where z.desde = $1 and z.grupo = 'obreros' order by l.persona_id limit 1 offset $2`, [desde, orden]))[0]
const deltas = (id) => q('select fecha::text, importe::float8 as importe, origen from public.liquidacion_pago_efectivo where linea_id = $1 order by id', [id])
const hoy = async () => (await q(`select (now() at time zone 'America/Argentina/San_Juan')::date::text d`))[0].d

before(async () => {
  if (sinBase) return
  admin = new pg.Client({ connectionString: URL_ADMIN })
  await admin.connect()
  base = `pago_efectivo_${process.pid}_${Date.now()}`
  await admin.query(`create database ${base}`)
  const u = new URL(URL_ADMIN)
  u.pathname = `/${base}`
  c = new pg.Client({ connectionString: u.toString() })
  await c.connect()
  await enTx(PLATAFORMA)
  await enTx(leer('20260930T2200_pago_en_efectivo_a_cuenta_sin_entrega.sql'))
  await enTx(leer('20261001T1000_pago_efectivo_de_sueldo_exige_nivel.sql'))
  await enTx(vistaDeHoy())
  await enTx(FILAS_DE_HOY())
  await enTx(leer(NUEVA))
  await enTx(leer(NUEVA)) // idempotente: la segunda no duplica la siembra ni rompe
})

after(async () => {
  if (sinBase) return
  await c?.end().catch(() => {})
  if (base) await admin.query(`drop database if exists ${base} with (force)`)
  await admin?.end()
})

const opc = { skip: sinBase }

test('(e) con la siembra, el saldo posterior al sello baja $ 253.000 por jornales y no $ 1.713.200', opc, async () => {
  const [v] = await como(DIRECCION, () => q('select * from public.efectivo_caja_saldo'))
  assert.equal(Number(v.conteo_sellado), 36720000)
  assert.equal(Number(v.pagos_de_jornales), -253000, 'sólo lo posterior al sello resta')
  assert.equal(Number(v.saldo), 36720000 - 253000)
  assert.notEqual(Number(v.pagos_de_jornales), -1713200, 'la 16–30/09 (pagada el 16/09) ya está dentro del conteo')
  // Todo lo registrado quedó sembrado con su fecha, una sola vez (la migración corrió dos veces).
  const t = await q(`select count(*)::int n, sum(importe)::float8 s from public.liquidacion_pago_efectivo`)
  assert.equal(t[0].n, 15 + 9 + 2 + 1)
  assert.equal(Math.round(t[0].s * 100), Math.round((5499956.15 + 1460200 + 253000 + 3144200) * 100))
  const f = await q(`select quincena_desde::text d, min(fecha)::text f, max(fecha)::text g from public.liquidacion_pago_efectivo group by 1 order by 1`)
  assert.deepEqual(f.map((x) => [x.d, x.f, x.g]), [
    ['2026-08-01', '2026-08-15', '2026-08-15'], ['2026-09-01', '2026-09-17', '2026-09-17'],
    ['2026-09-16', '2026-09-16', '2026-09-16'], ['2026-10-01', '2026-10-01', '2026-10-01'],
  ])
})

test('(a) un pago nuevo posterior al sello baja el saldo exactamente por el delta, y deja su renglón con fecha', opc, async () => {
  await como(DIRECCION, async () => {
    const antes = await saldo()
    const l = await lineaDe('2026-10-01')
    await c.query('update public.liquidacion_linea set pagado_efectivo = $2, fecha_pago_efectivo = $3 where id = $1',
      [l.id, Number(l.pagado_efectivo) + 47500.5, '2026-10-02'])
    assert.equal(Math.round((antes - await saldo()) * 100), 4750050)
    const d = await deltas(l.id)
    assert.deepEqual(d.at(-1), { fecha: '2026-10-02', importe: 47500.5, origen: 'caja' })
    const [m] = await q(`select importe::float8 i, movimiento, fecha::text f from public.efectivo_movimiento_caja where movimiento = 'Pago de jornales' and fecha = '2026-10-02'`)
    assert.deepEqual(m, { i: -47500.5, movimiento: 'Pago de jornales', f: '2026-10-02' })
  })
})

test('(a2) sin fecha el pago es de hoy, y la fecha de un pago no la hereda el siguiente (la columna puente se vacía)', opc, async () => {
  await como(DIRECCION, async () => {
    const l = await lineaDe('2026-10-01')
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 1000, fecha_pago_efectivo = $2 where id = $1', [l.id, '2026-09-30'])
    assert.equal((await q('select fecha_pago_efectivo f from public.liquidacion_linea where id = $1', [l.id]))[0].f, null)
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 2000 where id = $1', [l.id])
    const d = await deltas(l.id)
    assert.deepEqual(d.slice(-2).map((x) => [x.fecha, x.importe]), [['2026-09-30', 1000], [await hoy(), 2000]])
    // Fecha futura: la base la rechaza.
    await c.query('savepoint s')
    await assert.rejects(c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 1, fecha_pago_efectivo = $2 where id = $1', [l.id, '2099-01-01']), /fecha futura/)
    await c.query('rollback to savepoint s')
  })
})

test('(b) editar el acumulado dos veces no duplica: cada cambio deja SU delta, repetir el mismo valor no deja nada', opc, async () => {
  await como(DIRECCION, async () => {
    const l = await lineaDe('2026-10-01', 1)
    const base0 = Number(l.pagado_efectivo)
    const antes = await saldo()
    const poner = (v) => c.query('update public.liquidacion_linea set pagado_efectivo = $2 where id = $1', [l.id, v])
    await poner(base0 + 300000)
    await poner(base0 + 300000) // mismo valor: no es un pago
    await poner(base0 + 320000)
    const d = await deltas(l.id)
    assert.deepEqual(d.slice(1).map((x) => x.importe), [300000, 20000], 'dos deltas, no 300.000 + 320.000')
    assert.equal(Math.round((antes - await saldo()) * 100), 32000000)
    // Corregir hacia abajo es un delta negativo: la plata vuelve a la caja.
    await poner(base0 + 100000)
    assert.equal((await deltas(l.id)).at(-1).importe, -220000)
    assert.equal(Math.round((antes - await saldo()) * 100), 10000000)
  })
})

test('(c) un pago anterior al sello queda registrado con su fecha y NO cambia el saldo posterior', opc, async () => {
  await como(DIRECCION, async () => {
    const antes = await saldo()
    const l = await lineaDe('2026-09-16')
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 77000, fecha_pago_efectivo = $2 where id = $1', [l.id, '2026-09-20'])
    assert.equal(await saldo(), antes)
    assert.deepEqual((await deltas(l.id)).at(-1), { fecha: '2026-09-20', importe: 77000, origen: 'caja' })
    // El mismo día del conteo no se puede ordenar contra el sello: tampoco resta.
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 1000, fecha_pago_efectivo = $2 where id = $1', [l.id, '2026-09-24'])
    assert.equal(await saldo(), antes)
  })
})

test('(d) un pago desde una entrega a rendir no baja la caja dos veces (la entrega ya la bajó)', opc, async () => {
  await como(DIRECCION, async () => {
    const e = (await q(`insert into public.efectivo_entrega (codigo, persona_id, monto, fecha, creada_en)
      values ('ER-9001', $1, 100000, '2026-10-01', '2026-10-01 15:00+00') returning id`, [P(500)]))[0].id
    const conEntrega = await saldo()
    const l = await lineaDe('2026-10-01')
    const emp = l.persona_id
    // El orden de `rendir_adelanto_de_sueldo`: primero la línea, después la rendición.
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 40000 where id = $1', [l.id])
    await c.query(`insert into public.efectivo_rendicion (entrega_id, monto, adelanto_persona_id, adelanto_fecha, adelanto_quincena, adelanto_grupo)
      values ($1, 40000, $2, '2026-10-02', '2026-10-01', 'obreros')`, [e, emp])
    assert.equal((await deltas(l.id)).at(-1).origen, 'entrega')
    assert.equal(await saldo(), conEntrega, 'la entrega ya bajó la caja: el pago desde ella no la baja de nuevo')
    // `quitar_adelanto_rendido`: primero la línea, después se borra la rendición. La plata no sube dos veces.
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo - 40000 where id = $1', [l.id])
    await c.query('delete from public.efectivo_rendicion where entrega_id = $1', [e])
    assert.deepEqual((await deltas(l.id)).slice(-2).map((x) => [x.importe, x.origen]), [[40000, 'entrega'], [-40000, 'entrega']])
    assert.equal(await saldo(), conEntrega)
    // CONTROL: el mismo pago de 40.000 SIN rendición (salió de la caja) sí baja.
    await c.query('update public.liquidacion_linea set pagado_efectivo = pagado_efectivo + 40000 where id = $1', [l.id])
    assert.equal(Math.round((conEntrega - await saldo()) * 100), 4000000)
  })
})

test('el RPC del chat, EJECUTADO: el pago lleva la fecha de p_fecha y resta su importe (no el acumulado)', opc, async () => {
  await como(DIRECCION, async () => {
    const antes = await saldo()
    const r = await q(`select public.pago_efectivo_de_sueldo($1, '2026-09-30', 30000, '30000', 0, '=30000', 30000, 'pago-efectivo:t1', 'post1', $2) j`, [P(501), ADMIN_USR])
    assert.equal(r[0].j.ya_estaba, false)
    const d = await q(`select fecha::text f, importe::float8 i, origen from public.liquidacion_pago_efectivo where persona_id = $1`, [P(501)])
    assert.deepEqual(d, [{ f: '2026-09-30', i: 30000, origen: 'caja' }])
    assert.equal(Math.round((antes - await saldo()) * 100), 3000000)
  })
})

test('permisos: sólo quien liquida sueldos lee los pagos y el saldo; nadie escribe la tabla a mano; las vistas siguen security_invoker', opc, async () => {
  assert.equal((await como(OBRERO, () => q('select 1 from public.liquidacion_pago_efectivo'), { rol: 'authenticated' })).length, 0)
  assert.equal((await como(OBRERO, () => q('select 1 from public.efectivo_caja_saldo'), { rol: 'authenticated' })).length, 0, 'sin los pagos a la vista no se publica un saldo falso')
  assert.equal((await como(DIRECCION, () => q('select 1 from public.efectivo_caja_saldo'), { rol: 'authenticated' })).length, 1)
  assert.ok((await como(DIRECCION, () => q('select 1 from public.liquidacion_pago_efectivo'), { rol: 'authenticated' })).length > 0)
  await assert.rejects(como(DIRECCION, () => c.query(
    `insert into public.liquidacion_pago_efectivo (liquidacion_id, persona_id, quincena_desde, grupo, fecha, importe, clave)
     select liquidacion_id, persona_id, '2026-10-01', 'obreros', '2026-10-01', 1, 'x' from public.liquidacion_pago_efectivo limit 1`), { rol: 'authenticated' }), /permission denied/)
  const o = await q(`select relname, reloptions from pg_class where relname in ('efectivo_movimiento_caja', 'efectivo_caja_saldo') order by 1`)
  for (const v of o) assert.ok(v.reloptions?.includes('security_invoker=true'), `${v.relname} perdió security_invoker`)
})
