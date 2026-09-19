// «VENCIDA» ES UNA SOLA EN TODAS LAS CARAS — contra la réplica real de Cobranzas.
//
// Lo que prueba, y contra qué:
//   1 · `public.estado_de_cobro` da los casos de la columna U.
//   2 · el gemelo JS (`estadoDeCobro`) da lo mismo que la función SQL en CADA fila de la réplica y
//       en muchos «hoy» distintos —hoy real, cada fecha de cobro y el día siguiente—, para que la
//       comparación cruce vencidas y a vencer aunque hoy no haya ninguna vencida.
//   3 · cada cara —cliente_cobranza, obra_cuenta, cliente_cuenta_corriente, cliente_economia y el
//       portal (`estadoDePago`)— publica, por cliente u obra, el mismo número y la misma plata
//       vencida que un conteo ESCRITO ACÁ sobre `public.cobranzas`, que no llama a la función.
//
// Un control nunca se valida contra la misma información que produce: por eso el conteo del punto 3
// no usa ni la función SQL ni el gemelo.
//
// Si la migración 20260914T1200 no está aplicada, se aplica DENTRO de la transacción y se deshace al
// final. Sin base, se saltea.
//
// MUTACIÓN PROBADA (14/09/2026): volver `obra_cuenta.vencido` o `cliente_cobranza.esta_vencida` a
// emisión + plazo_cobro_dias() pone rojo el punto 3.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { estadoDeCobro } from './cobranza-estado-de-cobro.mjs'
import { estadoDePago } from './portal/cobranzas-a-cliente.mjs'
import { refrescarConCobranzas } from '../../src/app/portal/vivo.ts'
import { aPagoDelPortal } from '../../src/app/portal/esquema.ts'
import { estadoDePago as estadoDelPortal } from '../../src/app/portal/cronograma.ts'

const MIGRACION = '20260914T1200_cobranza_vencida_regla_del_sheet.sql'

/**
 * ═══ EL CONTROL TIENE QUE PODER DAR ROJO (auditoría, 14/09/2026) ═══
 *
 * Con el hoy real no había ninguna Pendiente con Q pasada —la primera Q era el 18/09—, así que cada
 * cara comparaba 0 contra 0. El auditor redefinió las tres vistas para publicar SIEMPRE false y el
 * test siguió verde. Dentro de la transacción `hoy_san_juan()` se fija en una fecha CON vencidas, y
 * cada comparación exige que haya alguna antes de comparar.
 */
const HOY_CON_VENCIDAS = '2026-09-20'
const hayVencidas = (m, rotulo) => assert.ok([...m.values()].some((a) => a.n > 0),
  `${rotulo}: ninguna vencida al ${HOY_CON_VENCIDAS} — el control compararía cero contra cero`)
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const centavos = (v) => (v == null ? 0 : Math.round(Number(v) * 100))

/** La regla del Sheet escrita otra vez, a mano, sin la función ni el gemelo. */
const vencidaSegunSheet = (r, hoy) =>
  typeof r.estado === 'string' && r.estado.toUpperCase() === 'PENDIENTE' && r.fc !== null && r.fc < hoy

/** `Map<clave, {n, plata}>` sumando las filas que cumplen. */
function agrupar(filas, clave, cumple) {
  const m = new Map()
  for (const f of filas) {
    const k = clave(f)
    if (k == null) continue
    const a = m.get(k) ?? { n: 0, plata: 0 }
    if (cumple(f)) { a.n += 1; a.plata += centavos(f.total) }
    m.set(k, a)
  }
  return m
}

const igualPlata = (real, esperado, rotulo) => {
  const claves = new Set([...real.keys(), ...esperado.keys()])
  for (const k of claves) {
    assert.equal(real.get(k)?.plata ?? 0, esperado.get(k)?.plata ?? 0, `${rotulo} ${k}: plata vencida`)
  }
}

test('vencida es la columna U en Postgres, en el gemelo y en cada cara', { skip: !hayBase && 'sin base' }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    // EL TURNO (19/09/2026): este test aplica una migración sobre la base COMPARTIDA; sin el lock dos
    // corridas se traban entre sí y el rojo que sale es de la máquina, no del código.
    await c.query('select pg_advisory_xact_lock(20260822)')
    // Si una vista está tomada, fallar rápido antes que trabar la app del dueño.
    await c.query(`set local lock_timeout = '5s'`)
    if (!(await q(`select to_regprocedure('public.estado_de_cobro(text,date,date)') f`))[0].f) {
      await c.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', MIGRACION), 'utf8'))
    }
    const direccion = (await q(`select id from perfiles where rol='direccion' limit 1`))[0]
    assert.ok(direccion, 'no hay perfil de dirección: sin él ve_economia() oculta las vistas')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])

    // Las vistas leen `hoy_san_juan()` en cada consulta: redefinirla acá mueve el reloj de TODAS las
    // caras a la vez, y el rollback del final la devuelve.
    await c.query(`create or replace function public.hoy_san_juan() returns date language sql stable
                   as $$ select '${HOY_CON_VENCIDAS}'::date $$`)
    const hoy = (await q(`select public.hoy_san_juan()::text h`))[0].h
    assert.equal(hoy, HOY_CON_VENCIDAS)

    await t.test('los casos de la columna U, en SQL', async () => {
      const casos = await q(`
        select x.caso, public.estado_de_cobro(x.estado, x.fc::date, x.hoy::date) e
          from (values ('pend-ayer',  'Pendiente', '2026-09-13', '2026-09-14'),
                       ('pend-hoy',   'Pendiente', '2026-09-14', '2026-09-14'),
                       ('fact-ayer',  'Facturado', '2026-09-13', '2026-09-14'),
                       ('cobr-fut',   'Cobrado',   '2026-12-31', '2026-09-14'),
                       ('pend-sin-q', 'Pendiente', null,         '2026-09-14'),
                       ('mayus',      'PENDIENTE', '2026-09-13', '2026-09-14')) x(caso, estado, fc, hoy)`)
      const e = Object.fromEntries(casos.map((r) => [r.caso, r.e]))
      assert.deepEqual(e, {
        'pend-ayer': 'vencido', 'pend-hoy': 'a_vencer', 'fact-ayer': 'otro',
        'cobr-fut': 'cobrado', 'pend-sin-q': 'otro', mayus: 'vencido',
      })
      assert.equal((await q(`select public.dias_para_cobro('2026-09-10', '2026-09-14') d`))[0].d, -4)
    })

    await t.test('el gemelo JS da lo mismo que la función SQL, fila por fila', async () => {
      const filas = await q(`
        with dias as (
          select public.hoy_san_juan() d
          union select fecha_cobro from public.cobranzas where fecha_cobro is not null
          union select fecha_cobro + 1 from public.cobranzas where fecha_cobro is not null)
        select cb.id, cb.estado, cb.fecha_cobro::text fc, d.d::text hoy,
               public.estado_de_cobro(cb.estado, cb.fecha_cobro, d.d) e
          from public.cobranzas cb cross join dias d`)
      assert.ok(filas.length > 100, 'la réplica vino vacía: el control no miró nada')
      const vistos = new Set()
      for (const f of filas) {
        const js = estadoDeCobro(f.estado, f.fc, f.hoy)
        vistos.add(f.e)
        if (js !== f.e) assert.fail(`fila ${f.id} (${f.estado}, ${f.fc}) con hoy ${f.hoy}: SQL ${f.e}, JS ${js}`)
      }
      assert.ok(vistos.has('vencido') && vistos.has('a_vencer'), 'la comparación no cruzó vencidas y a vencer')
    })

    const crudas = await q(`
      select cb.id, cb.cliente_id, cb.estado, cb.fecha_cobro::text fc, cb.total_bruto total, i.obra_id
        from public.cobranzas cb
        left join public.cobranza_imputacion i on i.cobranza_id = cb.id`)
    const porCobranza = [...new Map(crudas.map((r) => [r.id, r])).values()]
    const vencida = (r) => vencidaSegunSheet(r, hoy)
    const esperadoCliente = agrupar(porCobranza.filter((r) => r.cliente_id), (r) => r.cliente_id, vencida)

    await t.test('cliente_cobranza (ficha): mismo número y misma plata vencida por cliente', async () => {
      const filas = await q(`select distinct on (cobranza_id) cliente_id, esta_vencida, estado_cobro,
                                    total_bruto total, estado, fecha_cobro::text fc
                               from public.cliente_cobranza`)
      assert.ok(filas.length > 0, 'cliente_cobranza vino vacía')
      hayVencidas(esperadoCliente, 'réplica')
      const real = agrupar(filas, (r) => r.cliente_id, (r) => r.esta_vencida)
      for (const k of new Set([...real.keys(), ...esperadoCliente.keys()])) {
        assert.equal(real.get(k)?.n ?? 0, esperadoCliente.get(k)?.n ?? 0, `cliente ${k}: cantidad vencida`)
      }
      igualPlata(real, esperadoCliente, 'cliente_cobranza')
      for (const f of filas) assert.equal(f.esta_vencida, f.estado_cobro === 'vencido', 'dos columnas, dos respuestas')
    })

    await t.test('cliente_cuenta_corriente y cliente_economia: misma plata vencida por cliente', async () => {
      const esperado = agrupar(porCobranza.filter((r) => r.cliente_id && r.total != null && r.estado !== 'CANCELAR'),
        (r) => r.cliente_id, vencida)
      for (const vista of ['cliente_cuenta_corriente', 'cliente_economia']) {
        const filas = await q(`select cliente_id, vencido from public.${vista}`)
        const real = new Map(filas.map((r) => [r.cliente_id, { n: 0, plata: centavos(r.vencido) }]))
        igualPlata(real, esperado, vista)
      }
    })

    await t.test('obra_cuenta (cartera): misma plata vencida por obra', async () => {
      const ano = Number((await q(`select public.ano_obras() a`))[0].a)
      const imputadas = crudas.filter((r) => r.obra_id && r.fc && Number(r.fc.slice(0, 4)) === ano)
      const esperado = agrupar(imputadas, (r) => r.obra_id, vencida)
      const filas = await q(`select obra_id, vencido from public.obra_cuenta`)
      assert.ok(filas.length > 0, 'obra_cuenta vino vacía')
      const real = new Map(filas.map((r) => [r.obra_id, { n: 0, plata: centavos(r.vencido) }]))
      for (const k of esperado.keys()) if (!real.has(k)) esperado.delete(k)   // obra fuera del registro canónico
      hayVencidas(esperado, 'obra_cuenta')
      igualPlata(real, esperado, 'obra_cuenta')
    })

    await t.test('portal (estadoDePago): mismo número y misma plata vencida por cliente', () => {
      const real = agrupar(porCobranza.filter((r) => r.cliente_id), (r) => r.cliente_id,
        (r) => estadoDePago({ estado: r.estado, fecha_cobro: r.fc }, hoy) === 'vencido')
      for (const k of new Set([...real.keys(), ...esperadoCliente.keys()])) {
        assert.equal(real.get(k)?.n ?? 0, esperadoCliente.get(k)?.n ?? 0, `portal ${k}: cantidad vencida`)
      }
      igualPlata(real, esperadoCliente, 'portal')
    })

    await t.test('portal SOBRE esquema_pago (lo que ve el cliente): mismo número y plata vencida', async () => {
      // El camino de producción: `esquema_pago` → refresco contra la réplica (`vivo.ts`) → pago del
      // portal (`esquema.ts`) → estado (`cronograma.ts`). Contra un conteo escrito acá: una fila del
      // esquema está vencida sólo si su fila de Cobranzas existe y es Pendiente con Q pasada.
      const esquema = await q(`select id, cliente_id, obra_id, cobranza_fila, concepto, fecha::text fecha,
                                      monto::text monto, reparo, estado, medio, visible_portal, publicado_at,
                                      cambio_pendiente, orden, moneda, factura_numero, recibo_numero,
                                      neto::text neto, iva::text iva, historico
                                 from public.esquema_pago`)
      const vivas = await q(`select sheet_id, categoria, concepto, estado, fecha_cobro::text fecha_cobro,
                                    monto_neto, monto_neto_origen, iva, total_bruto, total_bruto_origen,
                                    moneda, tipo_cambio
                               from public.cobranzas where origen = 'cobranzas_sheet'`)
      assert.ok(esquema.length > 0, 'esquema_pago vino vacía')

      // La fila física del Sheet es la columna A + 4 (los datos arrancan en la fila 5).
      const porSheet = new Map(vivas.map((v) => [Number(String(v.sheet_id).trim()) + 4, v]))
      const esperadas = []
      for (const e of esquema) {
        const v = e.cobranza_fila == null ? undefined : porSheet.get(Number(e.cobranza_fila))
        if (v && String(v.estado ?? '').trim().toUpperCase() === 'CANCELAR') continue
        esperadas.push({
          cliente_id: e.cliente_id,
          total: v ? (v.total_bruto_origen ?? v.total_bruto) : e.monto,
          vencida: Boolean(v) && vencidaSegunSheet({ estado: v.estado, fc: v.fecha_cobro }, hoy),
        })
      }
      const esperado = agrupar(esperadas, (r) => r.cliente_id, (r) => r.vencida)
      hayVencidas(esperado, 'esquema_pago')

      const clienteDe = new Map(esquema.map((e) => [e.id, e.cliente_id]))
      const pagos = refrescarConCobranzas(esquema, vivas, hoy).map((f) => aPagoDelPortal(f, ''))
      const real = agrupar(pagos.map((p) => ({ ...p, cliente_id: clienteDe.get(p.id), total: p.monto })),
        (r) => r.cliente_id, (r) => estadoDelPortal(r, hoy) === 'vencido')
      for (const k of new Set([...real.keys(), ...esperado.keys()])) {
        assert.equal(real.get(k)?.n ?? 0, esperado.get(k)?.n ?? 0, `portal/esquema ${k}: cantidad vencida`)
      }
      igualPlata(real, esperado, 'portal/esquema')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
