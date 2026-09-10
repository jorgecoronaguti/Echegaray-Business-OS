// EL COBRO POR OBRA, CONTRA LA BASE REAL — y las dos implementaciones de la misma regla, cara a cara.
//
// Lo que se prueba:
//
//   1 · Las 24 filas de Messina dejan de caer en la obra bolsa `messina` y aterrizan en las obras que
//       dicen sus órdenes de compra. Los importes son los del Sheet al 10/09/2026: si alguien
//       revierte la cadena H → cliente_orden → obra, este subtest dice qué obra perdió cuánto.
//   2 · NINGUNA fila cambia de cliente. La imputación reparte plata ENTRE OBRAS DE UN CLIENTE; el día
//       que un alias mal puesto la mande a otro cliente, el total de la cuenta corriente deja de
//       cerrar y nadie lo vería mirando la pantalla.
//   3 · La regla en SQL (`cobranza_imputacion`) y la regla en JS (`cobranza-obra.mjs`) dan lo MISMO
//       fila por fila sobre las 98 cobranzas reales. Es lo único que impide que las dos copias se
//       separen — y por eso se compara sobre TODOS los clientes, no sobre un caso elegido.
//
// La migración se aplica DENTRO de la transacción y todo termina en ROLLBACK: no queda una fila ni
// una vista modificada. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { numeroCanonico } from './ordenes-identidad.mjs'
import { resolverObraDeCobranza } from './cobranza-obra.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260910T2330_obra_cobranza_por_orden_de_compra.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Lo cobrado de cada obra de Messina, leído del Sheet el 10/09/2026. */
const MESSINA_COBRADO = {
  'messina-bsa': 4848134.95,                                        // OC 279
  'messina-bases-tanque-so2': 6700000 + 9966250 + 6866157.2 + 2844877, // OC 1864/1923 + la cancelación
  'messina-pisos-120-rampa': 4234267.49 + 4230868.85,               // OC 2097
  'limpieza-de-escombros': 5961829.95,                              // OC 2162
  'messina-playon-azufre': 38675000 + 18159641,                     // OC 2173 + el anticipo «Negro»
  'pilon': 2330000 + 3484558,                                       // sin OC: lo nombra el concepto
}

test('el cobro por obra, contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    // El mismo advisory lock que economia-de-obra.pg.test.mjs: los pg-tests que tocan obra_alias y
    // obra_canonica no se entrelazan. Se libera solo con el rollback.
    await c.query('select pg_advisory_xact_lock(20260822)')
    const yaVive = (await q("select to_regclass('public.cobranza_imputacion') as v"))[0].v
    if (!yaVive) await c.query(MIGRACION)

    const direccion = (await q(`select id from perfiles where rol='direccion' limit 1`))[0]
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la economía')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    assert.equal((await q('select ve_economia() x'))[0].x, true, 'la sesión de prueba no ve economía')

    await t.test('las obras de Messina cobran lo que dicen sus órdenes de compra', async () => {
      const filas = await q(`
        select oc.obra_id, oc.cobrado, oc.n_cobranzas, oc.imputacion
          from obra_cobranza oc
          join obra_canonica o on o.id = oc.obra_id
          join clientes cl on cl.id = o.cliente_id
         where cl.nombre_comercial = 'Messina' and oc.n_cobranzas > 0`)
      const porObra = Object.fromEntries(filas.map((f) => [f.obra_id, f]))
      for (const [obra, esperado] of Object.entries(MESSINA_COBRADO)) {
        assert.ok(porObra[obra], `la obra ${obra} no recibió ninguna cobranza`)
        assert.equal(Number(porObra[obra].cobrado), esperado,
          `${obra} tendría que haber cobrado ${esperado}`)
      }
      // EL DEFECTO, AL REVÉS: la bolsa se queda sin nada. Mientras la etiqueta del cliente era la
      // única fuente, esta obra se llevaba las 24 filas y las otras seis publicaban NULL.
      assert.ok(!porObra['messina'], 'la obra bolsa `messina` sigue recibiendo cobranzas')
    })

    await t.test('ninguna cobranza termina en una obra de otro cliente', async () => {
      const cruzadas = await q(`
        select i.cobranza_id, i.obra_id
          from cobranza_imputacion i
          join obra_canonica o on o.id = i.obra_id
         where i.cliente_id is not null and o.cliente_id is not null
           and o.cliente_id <> i.cliente_id`)
      assert.deepEqual(cruzadas, [], 'la imputación movió plata de un cliente a otro')
    })

    await t.test('la regla en SQL y la regla en JS dicen lo mismo, fila por fila', async () => {
      const cobranzas = await q(`select id, cliente_id, obra_cliente, orden_compra, concepto from cobranzas`)
      assert.ok(cobranzas.length > 50, `sólo ${cobranzas.length} cobranzas: el control no miró nada`)

      const fusion = new Map((await q(`select id, fusionada_en from obra_canonica`))
        .map((o) => [o.id, o.fusionada_en ?? o.id]))
      const ordenes = await q(`select cliente_id, numero, numero_canonico, obra_id from cliente_orden
                                where tipo = 'orden_compra' and eliminado_en is null and obra_id is not null`)
      const alias = await q(`select a.alias, a.obra_id, a.en_texto_libre, a.clasificacion, o.cliente_id
                               from obra_alias a join obra_canonica o on o.id = a.obra_id`)
      const bolsas = await q(`select alias, obra_id from obra_alias
                               where obra_id is not null and clasificacion in ('obra','mantenimiento')`)
      const { normObra } = await import('./obra-operacion.mjs')

      /** El diccionario recortado al cliente, igual que hace la SQL. */
      const diccDe = (clienteId) => {
        const obraPorOc = new Map()
        for (const o of ordenes) {
          if (o.cliente_id !== clienteId) continue
          const canon = numeroCanonico(o.numero_canonico ?? o.numero)
          const viva = fusion.get(o.obra_id)
          if (!canon || !viva) continue
          // Dos obras para la misma orden ⇒ la orden no distingue nada y se cae.
          obraPorOc.set(canon, obraPorOc.has(canon) && obraPorOc.get(canon) !== viva ? null : viva)
        }
        for (const [k, v] of obraPorOc) if (!v) obraPorOc.delete(k)
        return {
          obraPorOc,
          aliasesLibres: alias
            .filter((a) => a.en_texto_libre && a.cliente_id === clienteId
                        && ['obra', 'mantenimiento'].includes(a.clasificacion))
            .map((a) => ({ alias: a.alias, obraId: fusion.get(a.obra_id) })),
        }
      }
      const bolsaDe = (etiqueta) => {
        const b = bolsas.find((x) => x.alias === normObra(etiqueta))
        return b ? fusion.get(b.obra_id) : null
      }

      const sql = new Map((await q(`select cobranza_id, obra_id, imputacion from cobranza_imputacion`))
        .map((r) => [r.cobranza_id, r]))
      const discrepan = []
      for (const cb of cobranzas) {
        const dicc = { ...diccDe(cb.cliente_id), bolsa: bolsaDe(cb.obra_cliente) }
        const js = resolverObraDeCobranza(cb, dicc)
        const pg = sql.get(cb.id)
        if (pg.obra_id !== js.obraId || pg.imputacion !== js.imputacion) {
          discrepan.push(`${cb.obra_cliente} «${cb.concepto}» H=«${cb.orden_compra}»: `
            + `SQL ${pg.obra_id}/${pg.imputacion} ≠ JS ${js.obraId}/${js.imputacion} (${js.porque})`)
        }
      }
      assert.deepEqual(discrepan, [],
        'la regla de Postgres y la de JavaScript se separaron: una de las dos está imputando mal '
        + 'un cobro a una obra, y la pantalla muestra la que esté en Postgres')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
