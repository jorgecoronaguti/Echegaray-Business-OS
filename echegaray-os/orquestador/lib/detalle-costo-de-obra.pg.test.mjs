// EL DETALLE DE CADA CELDA DE COSTO CIERRA CON LA CELDA, Y «A LA FECHA» NO TRAE LAS CUOTAS POR VENCER —
// contra la base real, con la migración 20260915T2320 aplicada ADENTRO de una transacción que termina
// en ROLLBACK. Si ya está aplicada (constancia en `migracion_aplicada`), se afirma contra el esquema
// vivo y no se re-aplica. Sin base, se salta: no se inventa un verde.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//   1 · QUE UNA CUOTA POR VENCER ENTRE ENTERA a «a la fecha» (dueño, 15/09/2026: «has inventado
//       costos»). La regla se reescribe ACÁ, en JS, sobre las columnas crudas de `compra_sheet`
//       (estado, fecha_prevista, monto_pagado) y se compara con lo que publica la base: un control
//       contra OTRA cuenta, no contra la que produce la RPC.
//   2 · QUE LA CELDA Y EL DETALLE SEAN DOS NÚMEROS: materiales, subcontratos, mano de obra y HH de cada
//       obra de San Francisco y La Estrella, y la fila «sin obra» de los dos clientes.
//   3 · QUE LO POR VENCER DESAPAREZCA: a la fecha + por vencer = la suma de los comprobantes.
//   4 · QUE EL DETALLE SE LEA SIN SESIÓN, o que `anon` pueda ejecutarlo.
//
// NO SE HARDCODEA NINGÚN IMPORTE: Compras cambia a diario (las cuotas de Tello cambiaron dos veces el
// 15/09 mientras se escribía esto), y un test que clava un derivado de un dato vivo se pone rojo solo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const ARCHIVO = '20260915T2320_detalle_costo_de_obra.sql'
const MIGRACION = join(import.meta.dirname, '..', '..', 'supabase/migrations', ARCHIVO)
const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const n = (x) => (x == null ? null : Number(x))
const cierra = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005 && (a == null) === (b == null)
const igual = (a, b, msg) => assert.ok(cierra(a, b), `${msg}: ${a} ≠ ${b}`)

/** LA REGLA «A LA FECHA», escrita aparte de la migración, sobre las columnas crudas. */
function aLaFecha(f) {
  const total = n(f.total)
  if (total < 0) return total
  if ((f.estado ?? '').trim().toUpperCase() === 'PAGADO') return total
  const prevista = f.fecha_prevista ?? f.fecha_pago
  if ((prevista && prevista > f.hoy) || (f.fecha && f.fecha > f.hoy)) return Math.min(Math.max(n(f.monto_pagado) ?? 0, 0), total)
  return total
}

test('el detalle de cada celda cierra con la celda y lo por vencer no entra a la fecha', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const sesion = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`, [
    id ? JSON.stringify({ sub: id, role: 'authenticated' }) : '',
  ])
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    const aplicada = await uno(`select 1 as v from public.migracion_aplicada where archivo = $1`, [ARCHIVO]).catch(() => null)
    if (!aplicada) await c.query(readFileSync(MIGRACION, 'utf8'))

    const dir = await uno(`select id from public.perfiles where rol in ('direccion', 'administracion') order by rol limit 1`)
    if (!dir) { t.skip('sin un perfil de Dirección o Administración no hay quien pueda mirar'); return }
    await sesion(dir.id)

    const OBRAS = await q(`select obra_id from public.obra_panel where cliente_slug in ('san-francisco', 'la-estrella') order by 1`)
    const CLIENTES = await q(`select slug, cliente_id from public.cliente_panel where slug in ('san-francisco', 'la-estrella') order by 1`)
    if (OBRAS.length === 0) { t.skip('la base no tiene las obras de San Francisco ni La Estrella'); return }
    const ids = OBRAS.map((o) => o.obra_id)

    await t.test('1 · a la fecha = la regla reescrita sobre compra_sheet, comprobante por comprobante', async () => {
      const filas = await q(`
        select f.obra_id, f.referencia, f.es_subcontrato, f.a_la_fecha, f.por_vencer, f.total as f_total,
               s.estado, s.total, s.monto_pagado, s.fecha_prevista::text as fecha_prevista,
               c.fecha_pago::text as fecha_pago, c.fecha::text as fecha, current_date::text as hoy
          from public.costo_de_obra_filas($1) f
          join public.costos_obra c on c.referencia_externa = f.referencia
          left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)`, [ids])
      assert.ok(filas.length > 0, 'ninguna compra asignada a estas obras')
      for (const f of filas) {
        igual(n(f.a_la_fecha), aLaFecha({ ...f, total: f.total ?? f.f_total }), `a la fecha de ${f.referencia} (${f.obra_id})`)
        igual(n(f.a_la_fecha) + n(f.por_vencer), n(f.f_total), `a la fecha + por vencer ≠ total en ${f.referencia}`)
      }
      // EL DEFECTO CON NOMBRE: una cuota PENDIENTE con vencimiento posterior a hoy entra por lo pagado, nunca entera.
      const porVencer = filas.filter((f) => (f.estado ?? '').toUpperCase() === 'PENDIENTE' && f.fecha_prevista > f.hoy && n(f.total) > 0)
      for (const f of porVencer) {
        assert.ok(n(f.a_la_fecha) <= Math.max(n(f.monto_pagado) ?? 0, 0) + 0.005, `la cuota ${f.referencia} (vence ${f.fecha_prevista}) entró entera: ${f.a_la_fecha}`)
        assert.ok(n(f.por_vencer) > 0, `la cuota ${f.referencia} no publica nada por vencer`)
      }
      // Pedro Tello en OB-0011 es el caso del dueño: si sigue cargado así, se mira con nombre.
      const tello = filas.filter((f) => f.obra_id === 'pisos-industriales' && f.es_subcontrato)
      if (tello.length) {
        const d = await uno(`select d ->> 'total' as total, d ->> 'por_vencer' as por_vencer, jsonb_array_length(d -> 'filas') as n
                               from public.detalle_costo_de_obra('pisos-industriales', 'subcontratos') d`)
        igual(n(d.total), tello.reduce((a, f) => a + aLaFecha({ ...f, total: f.total ?? f.f_total }), 0), 'OB-0011 subcontratos a la fecha')
        igual(n(d.total) + n(d.por_vencer), tello.reduce((a, f) => a + n(f.f_total), 0), 'OB-0011 a la fecha + por vencer')
        assert.equal(Number(d.n), tello.length)
      }
    })

    // LAS HORAS SE COMPARAN CONTRA LA CUENTA EN VIVO, NO CONTRA LA CACHÉ.
    // `hh_de_obra` —que es lo que el panel muestra, igual que la pantalla `?hh=`— sirve hasta 10 minutos
    // de antigüedad desde `ficha_cliente_cache`, mientras la columna HH sale de `obra_plan_vs_real`, que
    // se calcula siempre. El 15/09/2026 este test dio rojo con «195 ≠ 186» y a los diez minutos verde:
    // no había defecto, había caché. Lo que se afirma entonces es lo que SÍ es invariante —que las dos
    // cuentas son la misma— y el detalle se exige igual a la celda sólo cuando no vino de la caché.
    const HH = `select d ->> 'total' as total, d -> 'cache_calculado_en' is not null as de_cache,
                       (select sum((x ->> 'hh')::numeric)
                          from jsonb_array_elements(coalesce(public.hh_de_obra_en_vivo($1, null) -> 'por_persona', '[]'::jsonb)) x) as en_vivo,
                       (select hh_real from public.obra_plan_vs_real where obra_id = $1) as celda
                  from public.detalle_costo_de_obra($1, 'hh') d`

    await t.test('2 · la celda y el detalle son el mismo número: materiales, subcontratos, mano de obra y HH', async () => {
      const celdas = await q(`
        select x ->> 'obra_id' as obra_id, x ->> 'materiales' as materiales, x ->> 'subcontratos' as subcontratos,
               x ->> 'materiales_por_vencer' as mpv, x ->> 'subcontratos_por_vencer' as spv, x ->> 'comprometido_futuro' as cf,
               x ->> 'mano_obra' as mano_obra, x ->> 'n_comprobantes' as n_comprobantes, x ->> 'n_subcontratos' as n_subcontratos
          from jsonb_array_elements(public.costo_de_obras_a_la_fecha($1)) x`, [ids])
      assert.ok(celdas.length > 0)
      for (const k of celdas) {
        const [m, s, mo, h] = await Promise.all([
          uno(`select d ->> 'total' as total, d ->> 'por_vencer' as pv, d ->> 'n' as n from public.detalle_costo_de_obra($1, 'materiales') d`, [k.obra_id]),
          uno(`select d ->> 'total' as total, d ->> 'por_vencer' as pv, d ->> 'n' as n from public.detalle_costo_de_obra($1, 'subcontratos') d`, [k.obra_id]),
          uno(`select d ->> 'total' as total from public.detalle_costo_de_obra($1, 'mano_obra') d`, [k.obra_id]),
          uno(HH, [k.obra_id]),
        ])
        igual(n(m.total), n(k.materiales) ?? 0, `materiales de ${k.obra_id}`)
        igual(n(s.total), n(k.subcontratos) ?? 0, `subcontratos de ${k.obra_id}`)
        igual(n(m.pv), n(k.mpv) ?? 0, `materiales por vencer de ${k.obra_id}`)
        igual(n(s.pv), n(k.spv) ?? 0, `subcontratos por vencer de ${k.obra_id}`)
        igual((n(k.mpv) ?? 0) + (n(k.spv) ?? 0), n(k.cf) ?? 0, `comprometido_futuro de ${k.obra_id} no es la suma de lo por vencer`)
        assert.equal(Number(m.n), Number(k.n_comprobantes ?? 0), `n comprobantes de ${k.obra_id}`)
        assert.equal(Number(s.n), Number(k.n_subcontratos ?? 0), `n subcontratos de ${k.obra_id}`)
        igual(n(mo.total), n(k.mano_obra), `mano de obra de ${k.obra_id}`)
        if (h) {
          // LA MISMA CUENTA: el resumen por persona del panel y la columna HH de la tabla.
          igual(n(h.en_vivo), n(h.celda), `HH en vivo de ${k.obra_id}`)
          if (!h.de_cache) igual(n(h.total), n(h.celda), `HH de ${k.obra_id}`)
          else if (!cierra(n(h.total), n(h.celda))) {
            t.diagnostic(`HH de ${k.obra_id}: el detalle viene de la caché (${h.total}) y la celda ya es ${h.celda}; el panel lo declara.`)
          }
        }
      }
    })

    await t.test('3 · la fila «sin obra asignada» del cliente: la RPC de la ficha y la de detalle coinciden', async () => {
      for (const cl of CLIENTES) {
        const fila = await uno(`select x ->> 'materiales' as materiales, x ->> 'subcontratos' as subcontratos, x ->> 'comprometido_futuro' as cf
                                  from jsonb_array_elements(public.compras_sin_obra_de_clientes($1)) x`, [[cl.cliente_id]])
        const m = await uno(`select d ->> 'total' as total, d ->> 'por_vencer' as pv from public.detalle_costo_sin_obra($1, 'materiales') d`, [cl.slug])
        const s = await uno(`select d ->> 'total' as total, d ->> 'por_vencer' as pv from public.detalle_costo_sin_obra($1, 'subcontratos') d`, [cl.slug])
        igual(n(m.total), n(fila?.materiales) ?? 0, `materiales sin obra de ${cl.slug}`)
        igual(n(s.total), n(fila?.subcontratos) ?? 0, `subcontratos sin obra de ${cl.slug}`)
        igual(n(m.pv) + n(s.pv), n(fila?.cf) ?? 0, `por vencer sin obra de ${cl.slug}`)
      }
    })

    await t.test('4 · sin sesión el detalle es null, un rubro desconocido es null, y anon no puede ejecutar', async () => {
      const raro = await uno(`select public.detalle_costo_de_obra($1, 'otro') is null as v`, [ids[0]])
      assert.equal(raro.v, true)
      const sinObraHH = await uno(`select public.detalle_costo_sin_obra($1, 'hh') is null as v`, [CLIENTES[0]?.slug ?? 'x'])
      assert.equal(sinObraHH.v, true)
      await sesion(null)
      const sin = await uno(`select public.detalle_costo_de_obra($1, 'materiales') is null as a,
                                    public.detalle_costo_sin_obra($2, 'materiales') is null as b`, [ids[0], CLIENTES[0]?.slug ?? 'x'])
      assert.deepEqual(sin, { a: true, b: true })
      const priv = await uno(`
        select has_function_privilege('authenticated', 'public.detalle_costo_de_obra(text,text)', 'execute') as auth,
               has_function_privilege('anon', 'public.detalle_costo_de_obra(text,text)', 'execute') as anon,
               has_function_privilege('anon', 'public.costo_de_obra_filas(text[],uuid[])', 'execute') as anon_filas`)
      assert.deepEqual(priv, { auth: true, anon: false, anon_filas: false })
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
