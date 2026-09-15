// ENSAYO DEL COSTO DE MANO DE OBRA Y LAS HH POR OBRA — dentro de una transacción que SIEMPRE hace ROLLBACK.
//
// ═══ QUÉ RESPONDE ═══
//
// «Están mal las HH de Quattropani y el costo total de mano de obra; revisá esa y las demás obras» (dueño,
// 15/09/2026). Por obra: HH que cuentan, costo MO de las quincenas cerradas (lo pagado real), de la quincena
// abierta (modelo), qué costo de jefe salía de la obra y va a Estructura, contra producción. Y el contratado de
// las obras fusionadas, y Pedro Tello en Subcontratos.
//
// Tres estados, cada uno en su propia transacción:
//   PROD   lo que hoy lee app.ecsas.com.ar (las funciones y vistas vivas);
//   RAMA   20260915T0800→0830 como estaban en --base (por defecto 4d27d667, la rama que firmó el auditor);
//   NUEVA  20260915T0800→0842 del árbol de trabajo (decisiones del dueño del 14/09 18:10).
//
// ═══ POR QUÉ pg_temp Y NO LAS MIGRACIONES TAL CUAL ═══
//
// `create or replace view` toma un lock exclusivo sobre la vista hasta el ROLLBACK: en horario del dueño trababa la
// ficha del cliente y el módulo Obras mientras corre el ensayo (minutos). Acá cada objeto que crean las migraciones
// se crea en `pg_temp` —mismo SQL, `public.<objeto>` → `pg_temp.<objeto>`— y se consulta ahí. Lo único que se
// quita del texto: `notify pgrst` y la FK de la tabla de fotos a `personas` (una tabla temporal no puede
// referenciar una permanente). Nada se escribe en la base: todo muere con el ROLLBACK.
//
// Antes de ensayar verifica el md5 de las dos funciones que 0842 reconstruye: si alguien las redefinió, el ensayo
// no mide lo que se va a aplicar y se corta.
//
//   node orquestador/scripts/costo-mo-ensayo-tx.mjs [--base 4d27d667] [--json salida.json]  > ensayo.log

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { closePool, withTx } from '../lib/db.mjs'

const RAIZ = join(import.meta.dirname, '..', '..')
const MIG = 'supabase/migrations'
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', '4d27d667')
const SALIDA = arg('--json', null)

const RAMA = ['20260915T0800_costo_mo_por_obra.sql', '20260915T0810_subcontratos_por_obra.sql',
  '20260915T0815_estructura_fuera_del_costo_de_obra.sql', '20260915T0820_contratado_de_obra_unico.sql',
  '20260915T0830_contratado_formulario_obras_cerradas.sql']
const NUEVA = [...RAMA, '20260915T0840_jefes_de_obra_fuera_de_las_hh_de_obra.sql', '20260915T0842_jefe_de_obra_no_es_sin_respaldo.sql']
const OBJETOS = ['es_jefe_de_obra', 'costo_obra_quincena_historia', 'costo_obra_quincena', 'costo_mo_quincena_calculo', 'costo_mo_quincena',
  'sellar_costo_obra_quincena', 'costo_de_obras_a_la_fecha', 'compras_sin_obra_de_clientes', 'contratado_de_obra_fuente',
  'contratado_de_obra', 'hh_de_obra_en_vivo', 'pantalla_cliente_en_vivo', 'hh_que_cuentan_en_obra', 'obra_plan_vs_real',
  'obra_economia_cartera']
const VIVAS = { hh_de_obra_en_vivo: 'd1c4ce3ea203b3beda0ccb33d245b8cb', pantalla_cliente_en_vivo: 'd30370bccd80554a394c6edc2b12f3d0' }
const FUSIONADAS = ['bsa-planta', 'pisos-120m2', 'messina-bsa', 'messina-pisos-120-rampa', 'bsa-adicional']

const leer = (f, ref) => (ref
  ? execFileSync('git', ['show', `${ref}:./${MIG}/${f}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1 << 24 })
  : readFileSync(join(RAIZ, MIG, f), 'utf8'))

/** Los objetos de OBJETOS que CREAN estos textos: sólo ésos pasan a pg_temp; el resto se sigue leyendo de public. */
export function creados(textos) {
  return OBJETOS.filter((o) => textos.some((t) =>
    new RegExp(`create\\s+(or\\s+replace\\s+)?(table|view|function)\\s+(if\\s+not\\s+exists\\s+)?public\\.${o}\\b`, 'i').test(t)))
}

/** El SQL de la migración con los objetos del estado en pg_temp. */
export function aTemporal(sql, objetos = OBJETOS) {
  // El vaciado de la caché viva se quita: dentro de la transacción bloquearía sus filas mientras dura el ensayo.
  let s = sql.replace(/^\s*notify pgrst[^;]*;\s*$/gim, '')
    .replace(/^\s*delete from public\.ficha_cliente_cache;\s*$/gim, '')
    .replace(/ references public\.personas\(id\)/g, '')
  for (const o of objetos) s = s.replace(new RegExp(`\\bpublic\\.${o}\\b`, 'gi'), `pg_temp.${o}`)
  return s
}

// ── LAS CONSULTAS (cada número de la tabla sale de una de éstas) ─────────────────────────────────────────────

const TRABAJADAS = "tipo_hora in ('normal', 'extra_50', 'extra_100')"
const Q_JEFES = `select id from public.personas
  where regexp_replace(lower(trim(puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra')`
const Q_HH = (esq) => `select obra_canonica_id as obra, sum(horas)::float8 as hh
  from ${esq}.hh_que_cuentan_en_obra where ${TRABAJADAS} and obra_canonica_id is not null group by 1`
const Q_PLAN = (esq) => `select obra_id as obra, hh_real::float8 as hh from ${esq}.obra_plan_vs_real`
/** Las quincenas desde la primera hora cargada hasta hoy, con su estado de cierre. */
const Q_QUINCENAS = `select g::date::text as desde,
    coalesce((select bool_and(lq.estado = 'cerrada') from public.liquidacion_quincena lq where lq.desde = g::date), false) as cerrada
  from generate_series(date_trunc('month', (select min(fecha) from public.registros_hh where fecha <= current_date)),
                       current_date::timestamp, interval '1 day') g
 where extract(day from g) in (1, 16) order by 1`
/** El costo de una quincena por obra/destino/persona: la definición que lee todo el OS (sin foto: la tabla nace vacía). */
const Q_CALCULO = (esq) => `select obra_canonica_id as obra, destino, persona_id::text as persona, horas::float8 as horas,
    costo_total::float8 as total, estado from ${esq}.costo_mo_quincena_calculo($1::date, null)`
const Q_A_LA_FECHA = (esq) => `select x->>'obra_id' as obra, (x->>'mano_obra')::float8 as mo,
    (x->>'materiales')::float8 as materiales, (x->>'subcontratos')::float8 as subcontratos,
    (select sum((d->>'total')::float8) from jsonb_array_elements(coalesce(x->'subcontratos_detalle', '[]')) d
      where d->>'proveedor' ilike '%tello%') as tello
  from jsonb_array_elements(${esq}.costo_de_obras_a_la_fecha(array(select id from public.obra_canonica where fusionada_en is null))) x`
const Q_CONTRATADO = (esq) => `select oc.id as obra, oc.nombre, oc.estado, oc.fusionada_en, oc.monto_contratado::float8 as formulario,
    (select e.contratado::float8 from ${esq}.obra_economia_cartera e where e.obra_canonica_id = oc.id limit 1) as cartera,
    (select e.origen from ${esq}.obra_economia_cartera e where e.obra_canonica_id = oc.id limit 1) as origen
  from public.obra_canonica oc where oc.id = any($1::text[]) order by oc.id`
const Q_CUENTA = `select obra_id as obra, contratado::float8, por_cobrar::float8, vencido::float8, cobrado_total::float8
  from public.obra_cuenta where obra_id = any($1::text[])`
/** LA SUMA VIVA DE BSA POR CONCEPTO: prueba que el formulario de la fusionada ya está adentro. */
const Q_BSA = `select sheet_id, left(concepto, 50) as concepto, orden_compra, monto_neto::float8
  from public.cobranzas where cliente_id = (select cliente_id from public.obra_canonica where id = 'messina-bsa')
   and (orden_compra ~ '0000(0279|1984|1985)' or concepto ilike '%BSA%') order by sheet_id::int`

/** La cartera del cliente de ME - BSA (Messina), obra por obra: el total no puede contar la hija cubierta dos veces. */
const Q_CARTERA_CLIENTE = (esq) => `select e.obra_canonica_id as obra, e.contratado::float8 as contratado, e.origen
  from ${esq}.obra_economia_cartera e join public.obra_canonica oc on oc.id = e.obra_canonica_id
 where oc.cliente_id = (select cliente_id from public.obra_canonica where id = 'messina-bsa') order by 1`

/** LAS HH COMO LAS VE CADA ROL: authenticated con los claims de un jefe_obra y de un director. Tienen que ser iguales. */
const OBRAS_RLS = ['quattropani', 'la-estrella']
async function hhPorRol(c) {
  const perfiles = (await c.query(`select distinct on (rol) id::text as id, rol from public.perfiles
     where es_prueba is not true and rol in ('jefe_obra', 'direccion') order by rol, id`)).rows
  const out = {}
  for (const p of perfiles) {
    await c.query('savepoint como_usuario')
    try {
      await c.query('set local role authenticated')
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: p.id, role: 'authenticated' })])
      const hh = (await c.query(`select obra_canonica_id as obra, sum(horas)::float8 as hh from pg_temp.hh_que_cuentan_en_obra
         where ${TRABAJADAS} and obra_canonica_id = any($1::text[]) group by 1 order by 1`, [OBRAS_RLS])).rows
      const plan = (await c.query('select obra_id as obra, hh_real::float8 as hh from pg_temp.obra_plan_vs_real where obra_id = any($1::text[]) order by 1', [OBRAS_RLS])).rows
      out[p.rol] = { perfil: p.id, hh, plan }
    } finally { await c.query('rollback to savepoint como_usuario') }
  }
  return out
}

// ── LA MEDICIÓN ──────────────────────────────────────────────────────────────────────────────────────────────

async function medir(c, esq, quincenas, jefes) {
  const filas = async (q, p) => (await c.query(q, p)).rows
  const hh = new Map((await filas(Q_HH(esq('hh_que_cuentan_en_obra')))).map((r) => [r.obra, r.hh]))
  const plan = new Map((await filas(Q_PLAN(esq('obra_plan_vs_real')))).map((r) => [r.obra, r.hh]))
  const costo = new Map()
  const acc = (clave) => { if (!costo.has(clave)) costo.set(clave, { cerradas: 0, abierta: 0, jefe: 0, falta_h: 0, horas: 0 }); return costo.get(clave) }
  for (const q of quincenas) {
    if (esq('costo_mo_quincena_calculo') === 'public') break
    for (const r of await filas(Q_CALCULO('pg_temp'), [q.desde])) {
      const a = acc(r.destino === 'obra' ? r.obra : r.destino)
      a.horas += r.horas
      if (r.estado === 'falta_dato') { a.falta_h += r.horas; continue }
      a[q.cerrada ? 'cerradas' : 'abierta'] += r.total
      if (jefes.has(r.persona)) a.jefe += r.total
    }
  }
  const aLaFecha = new Map((await filas(Q_A_LA_FECHA(esq('costo_de_obras_a_la_fecha')))).map((r) => [r.obra, r]))
  const contratado = await filas(Q_CONTRATADO(esq('obra_economia_cartera')), [FUSIONADAS])
  const cartera = await filas(Q_CARTERA_CLIENTE(esq('obra_economia_cartera')))
  const rls = esq('es_jefe_de_obra') === 'pg_temp' ? await hhPorRol(c) : null
  return { hh, plan, costo, aLaFecha, contratado, cartera, rls }
}

class Rollback extends Error {}

/** Un estado entero en su transacción: aplica (en pg_temp), mide y deshace. */
async function estado(nombre, archivos, ref, quincenas, jefes) {
  let res
  const t0 = Date.now()
  await withTx(async (c) => {
    await c.query("set local statement_timeout = '600s'")
    await c.query("set local lock_timeout = '3s'")
    // 0820 crea contratado_de_obra, que lee obra_economia_cartera, y esa vista la recrea recién 0830: en public ya
    // existía; en pg_temp todavía no. El cuerpo se resuelve al ejecutar, cuando toda la cadena ya está creada.
    await c.query('set local check_function_bodies = off')
    const textos = archivos.map((f) => leer(f, ref))
    const objetos = creados(textos)
    for (const [i, f] of archivos.entries()) {
      try { await c.query(aTemporal(textos[i], objetos)) } catch (e) { throw new Error(`${nombre}: ${f} no aplica en pg_temp — ${e.message}`) }
    }
    res = await medir(c, (o) => (objetos.includes(o) ? 'pg_temp' : 'public'), quincenas, jefes)
    throw new Rollback()
  }).catch((e) => { if (!(e instanceof Rollback)) throw e })
  console.error(`${nombre}: ${((Date.now() - t0) / 1000).toFixed(1)} s, ROLLBACK`)
  return res
}

const M = (v) => (v == null ? '—' : (v / 1e6).toFixed(2))
const H = (v) => (v == null ? '—' : Math.round(v).toLocaleString('es-AR'))

async function main() {
  const uno = async (q, p) => (await withTx(async (c) => (await c.query(q, p)).rows))
  const md5 = await uno(`select p.proname, md5(pg_get_functiondef(p.oid)) as md5 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any($1::text[])`, [Object.keys(VIVAS)])
  for (const { proname, md5: m } of md5) {
    if (VIVAS[proname] !== m) throw new Error(`${proname} cambió en la base (md5 ${m}): 0842 se construyó sobre otra definición`)
  }
  const quincenas = await uno(Q_QUINCENAS)
  const jefes = new Set((await uno(Q_JEFES)).map((r) => r.id))
  const obras = await uno(`select id, nombre, estado from public.obra_canonica where fusionada_en is null order by id`)

  const prod = await estado('PROD', [], null, quincenas, jefes)
  const rama = await estado(`RAMA ${BASE}`, RAMA, BASE, quincenas, jefes)
  const nueva = await estado('NUEVA', NUEVA, null, quincenas, jefes)

  const filas = []
  for (const o of obras) {
    const n = nueva.costo.get(o.id) ?? {}
    const r = rama.costo.get(o.id) ?? {}
    const f = {
      obra: o.id, nombre: o.nombre, estado: o.estado,
      hh_prod: prod.hh.get(o.id) ?? null, hh_nueva: nueva.hh.get(o.id) ?? null,
      plan_prod: prod.plan.get(o.id) ?? null, plan_nueva: nueva.plan.get(o.id) ?? null,
      mo_prod: prod.aLaFecha.get(o.id)?.mo ?? null, mo_rama: rama.aLaFecha.get(o.id)?.mo ?? null, mo_nueva: nueva.aLaFecha.get(o.id)?.mo ?? null,
      cerradas: n.cerradas ?? null, abierta: n.abierta ?? null, falta_h: n.falta_h ?? null,
      jefe_rama: r.jefe ?? null, jefe_nueva: n.jefe ?? null,
      subcontratos: nueva.aLaFecha.get(o.id)?.subcontratos ?? null, tello: nueva.aLaFecha.get(o.id)?.tello ?? null,
    }
    const algo = [f.hh_prod, f.hh_nueva, f.mo_prod, f.mo_rama, f.mo_nueva].some((v) => v != null && v !== 0)
    if (o.estado === 'activa' || algo) filas.push(f)
  }
  const est = (m, d) => m.costo.get(d) ?? {}

  console.log(`\n## Por obra (activas + cerradas con horas o costo) — corte ${new Date().toISOString().slice(0, 10)}, base ${BASE}\n`)
  console.log('| Obra | Est. | HH prod | HH nueva | hh_real Obras prod→nueva | MO prod | MO rama | MO nueva | Cerradas (pagado) | Q abierta | h falta_dato | Jefe en obra rama→nueva |')
  console.log('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|')
  for (const f of filas) {
    console.log(`| ${f.nombre} | ${f.estado} | ${H(f.hh_prod)} | ${H(f.hh_nueva)} | ${H(f.plan_prod)}→${H(f.plan_nueva)} | ${M(f.mo_prod)} | ${M(f.mo_rama)} | ${M(f.mo_nueva)} | ${M(f.cerradas)} | ${M(f.abierta)} | ${H(f.falta_h)} | ${M(f.jefe_rama)}→${M(f.jefe_nueva)} |`)
  }
  console.log('\n## Estructura (M$)\n\n| Destino | Rama total | Rama jefes | Nueva total | Nueva jefes | Nueva cerradas | Nueva abierta |\n|---|--:|--:|--:|--:|--:|--:|')
  for (const d of ['ES-ADM', 'ES-TAL']) {
    const r = est(rama, d); const n = est(nueva, d)
    console.log(`| ${d} | ${M((r.cerradas ?? 0) + (r.abierta ?? 0))} | ${M(r.jefe)} | ${M((n.cerradas ?? 0) + (n.abierta ?? 0))} | ${M(n.jefe)} | ${M(n.cerradas)} | ${M(n.abierta)} |`)
  }
  const total = (m) => [...m.costo.values()].reduce((s, a) => s + a.cerradas + a.abierta, 0)
  const totalObras = (m) => [...m.costo.entries()].filter(([k]) => !k.startsWith('ES-')).reduce((s, [, a]) => s + a.cerradas + a.abierta, 0)
  const sumaALaFecha = (m) => [...m.aLaFecha.values()].reduce((s, x) => s + (x.mo ?? 0), 0)
  console.log(`\nINVARIANTE reparto: total rama ${M(total(rama))} = total nueva ${M(total(nueva))} (el jefe cambia de destino, no de importe)`)
  console.log(`CONTROL: Σ obras por quincena nueva ${M(totalObras(nueva))} vs Σ costo_de_obras_a_la_fecha nueva ${M(sumaALaFecha(nueva))}`)

  console.log('\n## Contratado de las fusionadas\n\n| Obra | Estado | Fusionada en | Formulario | Cartera rama→nueva | origen |\n|---|---|---|--:|--:|---|')
  for (const c of nueva.contratado) {
    const r = rama.contratado.find((x) => x.obra === c.obra) ?? {}
    console.log(`| ${c.nombre} | ${c.estado} | ${c.fusionada_en ?? ''} | ${M(c.formulario)} | ${M(r.cartera)}→${M(c.cartera)} | ${c.origen ?? ''} |`)
  }
  console.log('\n## Cartera del cliente de ME - BSA (obra_economia_cartera.contratado)\n\n| Obra | Prod | Rama | Nueva | origen nueva |\n|---|--:|--:|--:|---|')
  const idsCartera = [...new Set([prod, rama, nueva].flatMap((m) => m.cartera.map((x) => x.obra)))].sort()
  const de = (m, id) => m.cartera.find((x) => x.obra === id)
  for (const id of idsCartera) console.log(`| ${id} | ${M(de(prod, id)?.contratado)} | ${M(de(rama, id)?.contratado)} | ${M(de(nueva, id)?.contratado)} | ${de(nueva, id)?.origen ?? '—'} |`)
  const tot = (m) => m.cartera.reduce((s, x) => s + (x.contratado ?? 0), 0)
  console.log(`| **TOTAL CLIENTE** | ${M(tot(prod))} | ${M(tot(rama))} | ${M(tot(nueva))} | |`)
  const r = nueva.rls ?? {}
  const igual = JSON.stringify(r.jefe_obra?.hh) === JSON.stringify(r.direccion?.hh) && JSON.stringify(r.jefe_obra?.plan) === JSON.stringify(r.direccion?.plan)
  console.log(`\nRLS (NUEVA, set local role authenticated + request.jwt.claims): ${igual ? 'IGUAL' : 'DISTINTO'} para jefe_obra y direccion — ${JSON.stringify(r)}`)
  console.log('\nobra_cuenta (no la redefine ninguna migración):', JSON.stringify(await uno(Q_CUENTA, [FUSIONADAS])))
  console.log('Cobranzas de BSA (lo que compone la suma viva de ME - BSA):', JSON.stringify(await uno(Q_BSA)))
  if (SALIDA) writeFileSync(SALIDA, JSON.stringify({ base: BASE, quincenas, filas, estructura: { rama: Object.fromEntries(rama.costo), nueva: Object.fromEntries(nueva.costo) } }, null, 1))
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
