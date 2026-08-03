// EL LEDGER CONTRA UN POSTGRES REAL — la migración y las escrituras, probadas de verdad.
//
// Una migración que nunca se aplicó es una hipótesis. Este test levanta el schema `tesoreria` en un
// Postgres descartable, escribe una corrida entera y verifica lo que importa: que el histórico de
// mercado NO se pisa, que las recomendaciones SÍ se reemplazan por su clave estable, y que el check
// de estados no deja entrar 'ejecutada' — el estado que este agente no puede tener porque no opera.
//
// Se saltea sin PG_TEST_URL. Para correrlo:
//
//   docker run -d --name tesoreria-probe -e POSTGRES_PASSWORD=probe -p 55437:5432 postgres:16-alpine
//   PG_TEST_URL=postgres://postgres:probe@127.0.0.1:55437/postgres \
//     node --test orquestador/lib/tesoreria/ledger.pg.test.mjs

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const salta = !process.env.PG_TEST_URL
const opts = { skip: salta ? 'PG_TEST_URL no seteada' : false }
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

let query, closePool, ledger, runId

/** Los stubs mínimos de `orq` que la migración necesita para sembrar el agente. */
const STUBS = `
create schema if not exists orq;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table if not exists orq.tenants (id uuid primary key default gen_random_uuid(), slug text unique);
create table if not exists orq.principals (id uuid primary key default gen_random_uuid(), tenant_id uuid, kind text, slug text, display_name text, rol text, clearance text, unique (tenant_id, slug));
create table if not exists orq.capabilities (slug text primary key, domain text, description text, required_clearance text, blast_radius text, idempotency text, agent_role text);
create table if not exists orq.agents (id uuid primary key default gen_random_uuid(), tenant_id uuid, principal_id uuid, slug text, role text, description text, context_ref text, default_model text, max_cost_usd_per_task numeric, max_cost_usd_per_day numeric, max_concurrent int, org_title text, org_order int, unique (tenant_id, slug));
create table if not exists orq.agent_capabilities (agent_id uuid, capability_slug text, primary key (agent_id, capability_slug));
create table if not exists orq.model_routes (tenant_id uuid, scope text, match_key text, priority int, engine text not null, model text, max_cost_usd numeric, primary key (tenant_id, scope, match_key, priority));
insert into orq.tenants (slug) values ('echegaray') on conflict do nothing;
`

before(async () => {
  if (salta) return
  process.env.DATABASE_URL = process.env.PG_TEST_URL
  process.env.ORQ_DB_SSL = '0' // el Postgres descartable no habla SSL; el de producción sí
  ;({ query, closePool } = await import('../db.mjs'))
  ledger = await import('./ledger.mjs')
  await query(STUBS)
  // Se aplica DOS VECES a propósito: una migración que no es idempotente rompe el despliegue.
  const sql = readFileSync(join(APP, 'supabase', 'migrations', '20260801170000_tesoreria_inversor.sql'), 'utf8')
  await query(sql)
  await query(sql)
  // Y ENCIMA LA QUE ENSANCHA LA TASA. El schema que hay que probar es el que resulta de TODAS las
  // migraciones, no el de la primera: probar contra la inicial es probar contra una base que en
  // producción ya no existe.
  const anchoTasa = readFileSync(join(APP, 'supabase', 'migrations', '20260803150000_tesoreria_tasa_ancho_real.sql'), 'utf8')
  await query(anchoTasa)
  await query(anchoTasa)
  // Un test que sólo pasa la primera vez contra una base limpia no es un test: es una casualidad.
  // Correrlo dos veces seguidas contra el mismo contenedor tiene que dar lo mismo.
  await query(`truncate tesoreria.corridas, tesoreria.instrumentos, tesoreria.politicas restart identity cascade`)
  runId = await ledger.abrirCorrida(query, { correlationId: 'test' })
})

after(async () => { if (!salta) await closePool() })

test('la migración deja las 11 tablas con RLS y sus policies', opts, async () => {
  const { rows: t } = await query("select count(*)::int n from pg_tables where schemaname='tesoreria'")
  assert.equal(t[0].n, 11)
  const { rows: sin } = await query("select tablename from pg_tables where schemaname='tesoreria' and not rowsecurity")
  assert.deepEqual(sin, [], 'toda tabla nueva lleva RLS: es regla del repo')
  const { rows: p } = await query("select count(*)::int n from pg_policies where schemaname='tesoreria'")
  assert.equal(p[0].n, 22, 'dos policies por tabla: service_role escribe, authenticated lee')
})

test('el agente queda bajo el organigrama con su capacidad y su skill', opts, async () => {
  const { rows } = await query("select org_title, context_ref from orq.agents where slug='tesorero'")
  assert.equal(rows[0].org_title, 'Tesorero Inversor IA')
  assert.match(rows[0].context_ref, /tesoreria-inversiones-corporativas/)
  const { rows: c } = await query("select required_clearance from orq.capabilities where slug='advise.treasury'")
  assert.equal(c[0].required_clearance, 'C', 'Nivel C: analiza y prepara, no ejecuta')
})

test("NO existe el estado 'ejecutada': este agente no opera", opts, async () => {
  await assert.rejects(
    () => query("insert into tesoreria.recomendaciones (id, run_id, bloque, monto_maximo, moneda, horizonte_dias, vence_en, payload, estado) values ('x',$1,'C',1,'ARS',30,now(),'{}','ejecutada')", [runId]),
    /check constraint/,
  )
})

test('las observaciones de mercado NO se pisan: cada lectura es una fila', opts, async () => {
  const inst = {
    id: 'bz_probe', nombre: 'FCI Probe', categoria: 'money_market', moneda: 'ARS',
    tasa: { tipo: 'tea', valor: 0.8, naturaleza: 'indicativa' },
    plazo_rescate_dias: 0, liquidacion_dias: 0, costos: {}, evidencia: 'dato',
    observado_en: new Date().toISOString(), campos_faltantes: [], precio: null, url: null, ticker: null, emisor: null,
  }
  await ledger.guardarInstrumentos(query, runId, [inst])
  await ledger.guardarInstrumentos(query, runId, [{ ...inst, tasa: { ...inst.tasa, valor: 0.9 } }])
  const { rows } = await query("select tasa_valor::float8 v from tesoreria.observaciones where instrumento_id='bz_probe' order by id")
  assert.deepEqual(rows.map((r) => r.v), [0.8, 0.9], 'la lectura vieja tiene que seguir ahí: es la evidencia de con qué dato se decidió')
  const { rows: i } = await query("select count(*)::int n from tesoreria.instrumentos where id='bz_probe'")
  assert.equal(i[0].n, 1, 'el instrumento es una identidad estable: una sola fila')
})

test('la TASA QUE PUBLICA LA PANTALLA entra al ledger, por absurda que sea', opts, async () => {
  // ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN ═══
  //
  // 03/08/2026: la corrida f8849d89 murió con `numeric field overflow` y quedó `en_curso` para
  // siempre. La fila era ésta, leída de la pantalla viva de corporativos:
  //
  //   ON PLAZA LOGISTICA CL.4 04/03/29 UVA (ZPC4O) · precio 0,37 · TIR 957.395.119,965
  //
  // Es un disparate que fabrica el bróker calculando contra un precio del 18/06/2026, pero es EL
  // DATO QUE LA PANTALLA PUBLICA y el histórico existe para poder auditar con qué dato se decidió.
  // `numeric(12,8)` corta en 9.999,99999999.
  const inst = {
    id: 'bz_zpc4o-l1d', nombre: 'ON PLAZA LOGISTICA CL.4 04/03/29 UVA', ticker: 'ZPC4O',
    categoria: 'on', emisor: null, moneda: 'ARS', precio: 0.37,
    tasa: { tipo: 'tir', valor: 957395119.965, naturaleza: 'indicativa' },
    plazo_rescate_dias: null, liquidacion_dias: 1, costos: {}, evidencia: 'dato',
    observado_en: new Date().toISOString(), campos_faltantes: [], url: '/app/cotizaciones/corporativos?all=1',
  }
  const r = await ledger.guardarInstrumentos(query, runId, [inst])
  assert.deepEqual(r.fallidos, [], 'la observación tiene que entrar')
  const { rows } = await query("select tasa_valor::text v from tesoreria.observaciones where instrumento_id='bz_zpc4o-l1d'")
  assert.equal(rows[0].v, '957395119.96500000', 'y se lee de vuelta SIN redondear: el histórico guarda el insumo')
})

test('UNA FILA MALA NO SE LLEVA PUESTA LA CORRIDA: se registra y el resto entra', opts, async () => {
  // Lo que costó el overflow no fue la fila perdida: fue que la excepción salió antes de
  // `cerrarCorrida` y se llevó el análisis de caja de las otras 1.107. Con la columna ensanchada
  // esta fila puntual ya entra, así que el caso se fuerza con lo que ninguna migración arregla —un
  // instrumento con id nulo, que viola la primary key—.
  const buena = {
    id: 'bz_sobreviviente', nombre: 'Caución 30d', categoria: 'caucion', moneda: 'ARS', precio: null,
    tasa: { tipo: 'tna', valor: 0.31, naturaleza: 'indicativa' }, plazo_rescate_dias: 30,
    liquidacion_dias: 0, costos: {}, evidencia: 'dato', observado_en: new Date().toISOString(),
    campos_faltantes: [], url: '/app/cotizaciones/cauciones', ticker: 'PESOS', emisor: null,
  }
  const r = await ledger.guardarInstrumentos(query, runId, [{ ...buena, id: null }, buena])
  assert.equal(r.guardados, 1, 'la fila sana tiene que haber entrado igual')
  assert.equal(r.fallidos.length, 1)
  // Y NO se silencia: queda en la tabla que existe para eso.
  const { rows } = await query(
    "select detalle from tesoreria.errores_extraccion where run_id=$1 and url='/app/cotizaciones/cauciones'", [runId])
  assert.equal(rows.length, 1, 'el error tiene que quedar registrado, no desaparecer')
  const { rows: viva } = await query("select count(*)::int n from tesoreria.observaciones where instrumento_id='bz_sobreviviente'")
  assert.equal(viva[0].n, 1)
})

test('una recomendación repetida el mismo día se REEMPLAZA, no se duplica', opts, async () => {
  const rec = {
    id: 'rec_C_2026-08-01_bz_probe', bloque: 'C', instrumento_id: 'bz_probe', monto_maximo: 1000000,
    moneda: 'ARS', horizonte_dias: 30, rendimiento_neto_periodo: 0.04, ganancia_neta_estimada: 40000,
    confianza: 'media', vence_en: new Date(Date.now() + 86400000).toISOString(),
  }
  await ledger.guardarRecomendaciones(query, runId, [rec], [])
  await ledger.guardarRecomendaciones(query, runId, [{ ...rec, monto_maximo: 2000000 }], [])
  const { rows } = await query("select count(*)::int n, max(monto_maximo)::float8 m from tesoreria.recomendaciones where id=$1", [rec.id])
  assert.equal(rows[0].n, 1)
  assert.equal(rows[0].m, 2000000)
})

test('DEFECTO · una propuesta RECHAZADA entra a la base con su motivo, contra Postgres de verdad', opts, async () => {
  // Las dos tablas estaban en 0 filas mientras el ciclo informaba "1 propuesta · 1 rechazada": el
  // ledger recibía sólo las publicables. Sin la rechazada persistida, nadie puede contestar por qué
  // no se hizo una colocación — y ésa es la pregunta que se hace seis meses después.
  const base = {
    bloque: 'D', instrumento_id: 'bz_probe', monto_maximo: 5623127, moneda: 'ARS', horizonte_dias: 90,
    rendimiento_neto_periodo: 0.005, ganancia_neta_estimada: 28116, confianza: 'baja',
    vence_en: new Date(Date.now() + 86400000).toISOString(),
  }
  const validaciones = [
    { id: 'rec_D_rechazada', aprobada: false, fallas: ['supera_vara: rinde 0,50% y la vara es 4,09%'], chequeos: [{ regla: 'supera_vara', pasa: false }], validado_en: new Date().toISOString() },
  ]
  const out = await ledger.guardarRecomendaciones(query, runId, [{ ...base, id: 'rec_D_rechazada' }], validaciones)
  assert.equal(out.rechazadas, 1)

  const { rows } = await query("select estado, payload from tesoreria.recomendaciones where id='rec_D_rechazada'")
  assert.equal(rows[0].estado, 'rechazada')
  assert.match(rows[0].payload.validacion.fallas[0], /supera_vara/)
  const { rows: v } = await query("select aprobada, fallas from tesoreria.validaciones where recomendacion_id='rec_D_rechazada'")
  assert.equal(v.length, 1, 'la validación de la rechazada es la que explica el NO')
  assert.equal(v[0].aprobada, false)

  // Y una corrida posterior no puede bajarla a 'propuesta': el veredicto no se pisa solo.
  await ledger.guardarRecomendaciones(query, runId, [{ ...base, id: 'rec_D_rechazada' }], [])
  const { rows: otra } = await query("select estado from tesoreria.recomendaciones where id='rec_D_rechazada'")
  assert.equal(otra[0].estado, 'rechazada')
})

test('vencerPropuestas marca las viejas y deja las vigentes', opts, async () => {
  await query(`insert into tesoreria.recomendaciones (id, run_id, bloque, monto_maximo, moneda, horizonte_dias, vence_en, payload)
               values ('vieja',$1,'B',1,'ARS',7, now() - interval '1 hour','{}')`, [runId])
  const n = await ledger.vencerPropuestas(query)
  assert.ok(n >= 1)
  const { rows } = await query("select estado from tesoreria.recomendaciones where id='vieja'")
  assert.equal(rows[0].estado, 'vencida')
  const { rows: viva } = await query("select estado from tesoreria.recomendaciones where id='rec_C_2026-08-01_bz_probe'")
  assert.equal(viva[0].estado, 'propuesta')
})

test('el bloqueo de seguridad se guarda sin reconstruir la pantalla del bróker', opts, async () => {
  await ledger.guardarBloqueos(query, runId, [{
    en: new Date().toISOString(), motivo: 'verbo transaccional "comprar" en texto',
    coincidencia: 'comprar', campo: 'texto', elemento: { tag: 'BUTTON', rol: 'button', texto: 'Comprar' },
  }])
  const { rows } = await query('select elemento from tesoreria.bloqueos_seguridad where run_id=$1', [runId])
  assert.equal(rows[0].elemento.href, undefined)
  assert.equal(rows[0].elemento.texto, 'Comprar')
})

test('GUARDAR NO ES APROBAR: la fila entera viaja, y sin aprobador es una propuesta', opts, async () => {
  const { estadoReserva, ESTADO_POLITICA } = await import('./politicas.mjs')

  // Sin fila: el agente declara el gap.
  assert.equal(await ledger.politicaVigente(query, 'reserva_minima'), null)
  assert.equal(estadoReserva(null).estado, ESTADO_POLITICA.AUSENTE)

  // Guardada SIN aprobador. Devolver sólo `valor` —como hacía la primera versión— hacía imposible
  // distinguir esto de una política aprobada: el aprobador vive en la FILA, no en el valor.
  await query(`insert into tesoreria.politicas (clave, valor) values ('reserva_minima', '{"monto":5000000,"metodo":"piso_mas_egresos"}')`)
  const propuesta = await ledger.politicaVigente(query, 'reserva_minima')
  assert.equal(propuesta.aprobada_por, null)
  assert.equal(estadoReserva(propuesta).estado, ESTADO_POLITICA.PROPUESTA)

  // Aprobar cierra la anterior y crea una nueva: queda el historial de qué regla regía cuándo.
  await query('update tesoreria.politicas set vigente_hasta = now() where id = $1', [propuesta.id])
  await query(`insert into tesoreria.politicas (clave, valor, aprobada_por, aprobada_en)
               values ('reserva_minima', $1, 'jorge', now())`, [JSON.stringify(propuesta.valor)])
  const aprobada = estadoReserva(await ledger.politicaVigente(query, 'reserva_minima'))
  assert.equal(aprobada.estado, ESTADO_POLITICA.APROBADA)
  assert.equal(aprobada.monto, 5000000)
  assert.equal(aprobada.aprobada_por, 'jorge')

  // Y la propuesta vieja sigue ahí: el historial no se pisa.
  const { rows } = await query("select count(*)::int n from tesoreria.politicas where clave='reserva_minima'")
  assert.equal(rows[0].n, 2)
})

test('la caja restringida se declara por la MISMA tabla y su fila se modela con estado', opts, async () => {
  const { modelarCajaRestringida, ESTADO_RESTRINGIDA } = await import('./politicas.mjs')
  assert.equal(await ledger.filaCajaRestringida(query), null, 'sin declarar es null, no cero')

  await query(`insert into tesoreria.politicas (clave, valor, aprobada_por, aprobada_en)
               values ('caja_restringida', $1, 'jorge', now())`,
  [JSON.stringify({ monto: 0, fuente: 'revisión de garantías', declarada_en: new Date().toISOString() })])
  const fila = await ledger.filaCajaRestringida(query)
  const m = modelarCajaRestringida(fila)
  assert.equal(m.restricted_cash_status, ESTADO_RESTRINGIDA.KNOWN_ZERO, 'un cero DECLARADO sí es un cero')
  assert.equal(m.bloquea_accionable, false)
  assert.equal(m.restricted_cash_source, 'revisión de garantías')
})

test('resumenAnterior devuelve la foto de la última corrida cerrada', opts, async () => {
  await ledger.cerrarCorrida(query, runId, {
    estado: 'ok', publicado: false, payload: { resumen: { en_descubierto: false, excedente: 123 } },
  })
  const r = await ledger.resumenAnterior(query)
  assert.equal(r.excedente, 123)
})

test('no se puede marcar aprobador sin fecha ni fecha sin aprobador', opts, async () => {
  // Las dos juntas o ninguna: media aprobación no es una aprobación, y dejar `aprobada_por` suelto
  // haría que `estadoReserva` diera APROBADA sin que nadie sepa cuándo ni contra qué datos.
  await assert.rejects(
    () => query("insert into tesoreria.politicas (clave, valor, aprobada_por) values ('x','{}','jorge')"),
    /politicas_aprobacion_completa/,
  )
  await assert.rejects(
    () => query("insert into tesoreria.politicas (clave, valor, aprobada_en) values ('x','{}',now())"),
    /politicas_aprobacion_completa/,
  )
})

test('el org_order del Tesorero no pisa a nadie', opts, async () => {
  // El 12 ya es del Presupuestador IA en producción. Dos agentes con el mismo número no fallan
  // (no hay unique) y dejan el orden del organigrama librado a cómo ordene Postgres.
  await query(`insert into orq.agents (tenant_id, slug, role, org_title, org_order)
               select tenant_id, 'presupuestador', 'x', 'Presupuestador IA', 12 from orq.agents where slug='tesorero'
               on conflict do nothing`)
  const { rows } = await query(`select org_order, count(*)::int n from orq.agents
                                where org_title is not null group by org_order having count(*) > 1`)
  assert.deepEqual(rows, [], `hay org_order repetidos: ${JSON.stringify(rows)}`)
  const { rows: t } = await query("select org_order from orq.agents where slug='tesorero'")
  assert.equal(t[0].org_order, 20)
})

test('el CHECK de aprobación existe aunque la tabla ya existiera sin él', opts, async () => {
  // Dentro del `create table if not exists` el constraint NO se crea si la tabla ya estaba: el
  // control sólo existía en el contenedor de prueba, que siempre es fresco. Se simula el caso real.
  await query('alter table tesoreria.politicas drop constraint if exists politicas_aprobacion_completa')
  const sql = readFileSync(join(APP, 'supabase', 'migrations', '20260801170000_tesoreria_inversor.sql'), 'utf8')
  await query(sql)
  await assert.rejects(
    () => query("insert into tesoreria.politicas (clave, valor, aprobada_por) values ('z','{}','jorge')"),
    /politicas_aprobacion_completa/,
  )
})

test('las rutas de modelo declaran engine, y NO es claude-cli', opts, async () => {
  // ═══ EL DEFECTO QUE ESTE TEST DEJÓ PASAR, Y QUE SÓLO APARECIÓ AL DESPLEGAR ═══
  //
  // La migración 20260714140000 anuló `claude-cli` en todo el OS, y esta ponía `engine = null` para
  // no reintroducirlo. Pero `orq.model_routes.engine` es **NOT NULL en producción**, y el stub de
  // arriba declaraba la columna sin la restricción: el test corría contra un schema más permisivo
  // que el real y pasaba. El despliegue se cortó a mitad —schema creado, capacidad insertada, agente
  // no— con el error que este test tendría que haber dado.
  //
  // El stub ya lleva el `not null`; esta aserción exige además el valor correcto, que es el que usan
  // 41 de las 45 rutas vivas del OS.
  const { rows } = await query("select engine from orq.model_routes where match_key = 'advise.treasury'")
  assert.ok(rows.length >= 2)
  assert.ok(rows.every((r) => r.engine === 'anthropic-api'), `engine inesperado: ${JSON.stringify(rows)}`)
  assert.ok(rows.every((r) => r.engine !== 'claude-cli'))
})
