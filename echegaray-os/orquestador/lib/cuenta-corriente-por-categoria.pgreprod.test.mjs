// LA CUENTA CORRIENTE POR CATEGORÍA (migración 20261002T1500), EJECUTADA — sobre un Postgres DESCARTABLE.
//
// Dueño, 02/10/2026: el bloque cuenta corriente de la ficha del cliente tiene que ser sólo lo facturado (B).
// La migración le agrega `p_categoria` a la ÚNICA función de la cuenta corriente y, para no dejar dos
// sobrecargas ambiguas, tira la vieja `(date, date)` con las dos vistas que cuelgan de ella y las rehace.
// Lo que puede salir mal ahí no se ve leyendo el SQL: que una llamada de dos argumentos (la vista,
// `analiticas_costos(p_desde, p_hasta)`) quede ambigua, que la vista recreada pierda `security_invoker` o
// sus permisos, que la función pase a saltear la RLS de `cobranzas`, o que el recorte no recorte.
//
// Crea una base nueva en `pg-reprod` (supabase/postgres:17.6.1.165) con lo que esas vistas leen —las
// funciones auxiliares copiadas de la base viva el 02/10/2026, tablas reducidas a sus columnas— y el estado
// de ANTES (la función de dos argumentos y las dos vistas como están vivas), aplica la migración REAL dos
// veces y la usa con el rol de la app. Al final borra la base.
//
// NUNCA LA BASE REAL: no lee DATABASE_URL. Corre sólo con PG_REPROD_URL apuntando a 127.0.0.1/localhost;
// sin eso se saltea diciéndolo.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { esUrlLocal } from './reconstruccion-candados.mjs'

const URL_ADMIN = process.env.PG_REPROD_URL ?? ''
const NUEVA = join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261002T1500_cuenta_corriente_por_categoria.sql')
const sinBase = !URL_ADMIN ? 'sin PG_REPROD_URL (Postgres descartable local)'
  : !esUrlLocal(URL_ADMIN) ? 'PG_REPROD_URL no es local: esta prueba no corre contra una base remota' : false

const migracion = readFileSync(NUEVA, 'utf8')
// `cliente_economia` se rehace en la migración tal cual está viva; el estado de ANTES usa ese mismo texto.
const CLIENTE_ECONOMIA = migracion.match(/create view public\.cliente_economia[\s\S]*?WHERE public\.ve_economia\(\);/)?.[0]

const PLATAFORMA = `
create function public.current_rol() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'rol' $f$;
create function public.ve_economia() returns boolean language sql stable security definer set search_path to 'public' as
  $f$ select coalesce(public.current_rol() in ('direccion', 'administracion'), false) $f$;
create function public.hoy_san_juan() returns date language sql stable as
  $f$ select (now() at time zone 'America/Argentina/San_Juan')::date $f$;
create function public.dias_para_cobro(fecha_cobro date, hoy date) returns integer language sql immutable as
  $f$ select fecha_cobro - hoy $f$;
create function public.es_cobrada(estado text, fecha_cobro date) returns boolean language sql stable set search_path to 'public' as
  $f$ select lower(btrim(coalesce(estado, ''))) = 'cobrado' and (fecha_cobro is null or fecha_cobro <= current_date) $f$;
create function public.estado_de_cobro(estado text, fecha_cobro date, hoy date) returns text language sql immutable as $f$
  select case
    when lower(estado) = 'cobrado' then 'cobrado'
    when lower(estado) = 'pendiente' and fecha_cobro is not null and hoy is not null then
      case when fecha_cobro < hoy then 'vencido' else 'a_vencer' end
    else 'otro' end $f$;
create function public.contratado_de_cliente(cliente uuid, solo_en_curso boolean default false) returns numeric
  language sql stable as $f$ select null::numeric $f$;
create table public.clientes (id uuid primary key, slug text, nombre_comercial text);
create table public.cobranzas (id serial primary key, cliente_id uuid, categoria text, estado text,
  total_bruto numeric, monto_neto numeric, fecha_emision date, fecha_cobro date);
create table public.certificado_cliente (cliente_id uuid, reparo numeric, estado text);
create table public.obra_panel (cliente_id uuid, obra_id text, estado text, costo_real numeric);
create table public.obra_economia_cartera (obra_canonica_id text, contratado numeric);
alter table public.cobranzas enable row level security;
create policy cobranzas_select on public.cobranzas for select to authenticated using (public.ve_economia());
grant usage on schema public to anon, authenticated, service_role;
grant select on public.clientes, public.cobranzas, public.certificado_cliente, public.obra_panel,
  public.obra_economia_cartera to authenticated;
`

// LA BASE COMO ESTÁ VIVA HOY: la función de dos argumentos (texto de `pg_get_functiondef`, sin el recorte),
// la vista que la nombra y `cliente_economia`; más una función que la llama con DOS argumentos y cuerpo de
// texto, como `analiticas_costos`.
const ANTES = `
create function public.cuenta_corriente_de_clientes(p_desde date, p_hasta date)
 returns table(cliente_id uuid, nombre_comercial text, saldo numeric, vencido numeric, por_vencer numeric, comprobantes_pendientes bigint, aging_por_vencer numeric, aging_1_30 numeric, aging_31_60 numeric, aging_61_90 numeric, aging_mas_90 numeric, facturado_90d numeric, cobrado_90d numeric, cobrado_total numeric, cobrado_neto_total numeric, dso numeric, efectividad_pct numeric, dias_cobro_promedio numeric, fondo_reparo numeric)
 language sql stable set search_path to 'public' as $function$
 select c.cliente_id, null::text, sum(c.total_bruto), 0::numeric, 0::numeric, count(*), 0::numeric, 0::numeric,
        0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, null::numeric,
        null::numeric, null::numeric, 0::numeric
   from cobranzas c where c.cliente_id is not null and (p_desde is null or c.fecha_emision >= p_desde)
     and (p_hasta is null or c.fecha_emision <= p_hasta) group by c.cliente_id
$function$;
create view public.cliente_cuenta_corriente with (security_invoker = true) as
  select * from public.cuenta_corriente_de_clientes(null::date, null::date);
grant select on public.cliente_cuenta_corriente to authenticated;
${CLIENTE_ECONOMIA}
grant select on public.cliente_economia to authenticated;
create function public.analiticas_como_hoy(p_desde date, p_hasta date) returns jsonb language sql stable as $f$
  select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from public.cuenta_corriente_de_clientes(p_desde, p_hasta) k
$f$;
grant execute on function public.analiticas_como_hoy(date, date) to authenticated;
`

const M = '00000000-0000-4000-8000-0000000000a1' // como Messina: B y N
const S = '00000000-0000-4000-8000-0000000000b1' // como un cliente que sólo opera en N
// Montos chicos y redondos para leer el resultado de un vistazo. «vencido» = Pendiente con fecha de cobro
// pasada; CANCELAR no cuenta nunca; una 'b ' mal escrita en el Sheet es blanco.
const FILAS = `
insert into public.clientes values ('${M}', 'm', 'Cliente M'), ('${S}', 's', 'Cliente S');
insert into public.cobranzas (cliente_id, categoria, estado, total_bruto, monto_neto, fecha_emision, fecha_cobro) values
 ('${M}', 'B',  'Pendiente', 100, 82.64, current_date - 20, current_date + 20),
 ('${M}', 'b ', 'Pendiente',   5,  4.13, current_date - 40, current_date - 10),
 ('${M}', 'B',  'Cobrado',    50, 41.32, current_date - 30, current_date - 10),
 ('${M}', 'N',  'Pendiente',  20,    20, current_date - 20, current_date + 5),
 ('${M}', 'N',  'Cobrado',    30,    30, current_date - 30, current_date - 5),
 ('${M}', 'B',  'CANCELAR',  999,   999, current_date - 30, null),
 ('${S}', 'N',  'Pendiente',  40,    40, current_date - 10, current_date + 10);
`

const DIRECCION = JSON.stringify({ sub: '00000000-0000-4000-8000-00000000d001', role: 'authenticated', rol: 'direccion' })
const CAMPO = JSON.stringify({ sub: '00000000-0000-4000-8000-00000000e001', role: 'authenticated', rol: 'campo' })

let admin
let c
let base

const q = async (sql, params) => (await c.query(sql, params)).rows
async function enTx(sql) {
  await c.query('begin')
  try { await c.query(sql); await c.query('commit') } catch (e) { await c.query('rollback'); throw e }
}
/** Como lo pide la app: rol `authenticated` con su JWT, en una transacción que se deshace. */
async function como(claims, fn) {
  await c.query('begin')
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    await c.query('set local role authenticated')
    return await fn()
  } finally { await c.query('rollback') }
}
const num = (filas) => filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v == null ? v : Number(v)])))
const CUENTA = 'saldo, vencido, por_vencer, comprobantes_pendientes, cobrado_total'

before(async () => {
  if (sinBase) return
  assert.ok(CLIENTE_ECONOMIA, 'la migración ya no trae `create view public.cliente_economia … WHERE public.ve_economia();`')
  admin = new pg.Client({ connectionString: URL_ADMIN })
  await admin.connect()
  base = `ccte_categoria_${process.pid}_${Date.now()}`
  await admin.query(`create database ${base}`)
  const u = new URL(URL_ADMIN)
  u.pathname = `/${base}`
  c = new pg.Client({ connectionString: u.toString() })
  await c.connect()
  await enTx(PLATAFORMA)
  await enTx(ANTES)
  await enTx(FILAS)
  // Dos veces: la segunda corrida es la prueba de que es idempotente.
  await enTx(migracion)
  await enTx(migracion)
})

after(async () => {
  if (sinBase) return
  await c?.end().catch(() => {})
  if (base) await admin.query(`drop database if exists ${base} with (force)`)
  await admin?.end()
})

const opc = { skip: sinBase }

test('queda UNA sola función, la de tres argumentos — sin sobrecarga ambigua', opc, async () => {
  const r = await q(`select pg_get_function_identity_arguments(oid) a from pg_proc where proname = 'cuenta_corriente_de_clientes'`)
  assert.deepEqual(r.map((x) => x.a), ['p_desde date, p_hasta date, p_categoria text'])
})

test("con 'B' sólo suma lo facturado; la 'b ' mal escrita cuenta, la N y la anulada no", opc, async () => {
  const r = await como(DIRECCION, () => q(
    `select ${CUENTA} from public.cuenta_corriente_de_clientes(null, null, 'B') where cliente_id = $1`, [M]))
  assert.deepEqual(num(r), [{ saldo: 105, vencido: 5, por_vencer: 100, comprobantes_pendientes: 2, cobrado_total: 50 }],
    'MUTACIÓN: sin el recorte por categoría el saldo es 125 y lo cobrado 80')
  const soloN = await como(DIRECCION, () => q(`select 1 from public.cuenta_corriente_de_clientes(null, null, 'B') where cliente_id = $1`, [S]))
  assert.equal(soloN.length, 0, 'un cliente sin filas B no tiene cuenta corriente blanca: sin fila, no ceros')
})

test('sin categoría todo sigue igual: la vista, cliente_economia y una llamada de dos argumentos dan B+N', opc, async () => {
  const esperado = [{ saldo: 125, vencido: 5, por_vencer: 120, comprobantes_pendientes: 3, cobrado_total: 80 }]
  await como(DIRECCION, async () => {
    assert.deepEqual(num(await q(`select ${CUENTA} from public.cliente_cuenta_corriente where cliente_id = $1`, [M])), esperado)
    assert.deepEqual(num(await q(`select ${CUENTA} from public.cliente_economia where cliente_id = $1`, [M])), esperado)
    assert.deepEqual(num(await q(`select ${CUENTA} from public.cuenta_corriente_de_clientes(null::date, null::date) where cliente_id = $1`, [M])), esperado)
    // Como `analiticas_costos`: cuerpo de texto, dos argumentos tipados. Con dos sobrecargas esto es
    // «function … is not unique».
    const j = (await q(`select public.analiticas_como_hoy(null, null) j`))[0].j
    assert.equal(Number(j.find((k) => k.cliente_id === M).saldo), 125)
  })
})

test('la función sigue corriendo con la RLS de quien pregunta: sin ver la plata, cero filas', opc, async () => {
  const r = await como(CAMPO, () => q(`select count(*)::int n from public.cuenta_corriente_de_clientes(null, null, 'B')`))
  assert.equal(r[0].n, 0, 'MUTACIÓN: `security definer` publicaría la cartera a cualquier autenticado')
})

test('las vistas recreadas conservan security_invoker, el comentario y los permisos exactos', opc, async () => {
  for (const v of ['cliente_cuenta_corriente', 'cliente_economia']) {
    const [x] = await q(`select c.reloptions, obj_description(c.oid, 'pg_class') d,
        has_table_privilege('authenticated', c.oid, 'select') a_sel,
        has_table_privilege('authenticated', c.oid, 'insert') a_ins,
        has_table_privilege('anon', c.oid, 'select') anon_sel,
        has_table_privilege('service_role', c.oid, 'select') sr_sel
      from pg_class c where c.oid = $1::regclass`, [`public.${v}`])
    assert.deepEqual(x.reloptions, ['security_invoker=true'], `${v}: un create view sin la opción saltea la RLS`)
    assert.ok(x.d && x.d.length > 100, `${v}: el drop le borró el comentario`)
    assert.deepEqual([x.a_sel, x.a_ins, x.anon_sel, x.sr_sel], [true, false, false, true], `${v}: permisos`)
  }
  const [f] = await q(`select has_function_privilege('authenticated', p.oid, 'execute') a,
      has_function_privilege('anon', p.oid, 'execute') an, has_function_privilege('service_role', p.oid, 'execute') sr
    from pg_proc p where p.proname = 'cuenta_corriente_de_clientes'`)
  assert.deepEqual([f.a, f.an, f.sr], [true, false, true])
})
