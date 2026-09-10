// `obra_cuenta` CONTRA LA PESTAÑA OBRAS, RENGLÓN POR RENGLÓN.
//
// El dueño compara /clientes contra el Sheet. Este test es esa comparación, ejecutable: los valores
// esperados son los que la pestaña OBRAS publicaba el 10/09/2026, copiados a mano, y la vista los
// tiene que reproducir con SUS propias definiciones. Si alguien cambia la ventana del año, el reloj
// de lo vencido, o confunde el cobrado TOTAL con el NETO —el defecto que originó la vista—, acá sale
// rojo con la obra y los dos números.
//
// ═══ LA ÚNICA DIFERENCIA QUE SE ESPERA, Y POR QUÉ ═══
//
// BSA. La pestaña selecciona las filas de cada obra buscando su nombre dentro del Concepto o de la
// Orden de Compra; la vista usa `cobro_por_obra`. La fila 46 («ACTUALIZACION DE PRECIOS OC
// 02-00000279») es de BSA por su orden 00002-00001984 y no dice «BSA» en ninguna columna. El test la
// EXIGE adentro y clava los dos números —el de la vista y el del Sheet— para que la diferencia sea
// un hecho medido y no una sorpresa.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { ANO } from './obras-grilla.mjs'
import { PLAZO_COBRO_DIAS } from './cobranzas-vencido.mjs'

const migracion = (nombre) => readFileSync(
  join(import.meta.dirname, '..', '..', 'supabase', 'migrations', nombre), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/**
 * LO QUE PUBLICA LA PESTAÑA OBRAS AL 10/09/2026 — copiado del archivo, no derivado de la base.
 * [cobrado_total, cobrado_neto, por_cobrar, vencido, próximo cobro, medio]. `null` es el guion.
 */
const OBRAS = {
  'messina-pisos-120-rampa': [8_465_136.34, 7_108_886.54, 2_848_649.02, null, '2026-09-29', 'Transferencia'],
  'pisos-industriales': [13_794_360.10, 13_794_360.10, 10_000_775.90, 10_000_775.90, '2026-09-18', 'Efectivo'],
  'instalacion-electrica': [12_100_000, 10_000_000, 10_000_000, 10_000_000, '2026-09-18', 'Efectivo'],
  'entrepiso-y-escalera': [1_932_063.50, 1_932_063.50, 1_932_063.50, 1_932_063.50, '2026-09-18', 'Efectivo'],
  'messina-adicional-tercer-muro': [null, null, 12_100_000, null, '2026-10-28', 'Transferencia'],
  'messina-playon-dilucion-acido': [null, null, 24_309_950.08, null, '2026-10-03', 'Transferencia'],
  'messina-playon-azufre': [56_834_641, 50_659_641, 58_075_000, null, '2026-09-22', 'Transferencia'],
}

/**
 * QUATTROPANI VA APARTE PORQUE SUS FILAS ESTÁN EN DÓLARES.
 *
 * La pestaña las valúa con la fórmula viva (`TIPO_CAMBIO_USD` de la hoja) y la réplica de Postgres
 * con el tipo de cambio del último `sync-cobranzas`. Los dos números son correctos y no pueden ser
 * iguales al peso: al 10/09/2026 la diferencia es de $600 sobre $107,9 M. Clavarlos al centavo haría
 * un test que se pone rojo solo cada vez que se mueve el dólar — que es ruido, no control.
 */
const QUATTROPANI = { cobradoTotal: 107_877_569, porCobrar: 52_357_555, tolerancia: 20_000 }

test('obra_cuenta publica lo mismo que la pestaña OBRAS', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    if (!(await q("select to_regclass('public.obra_cuenta') v"))[0].v) {
      if (!(await q(`select 1 v from information_schema.columns where table_schema='public'
                      and table_name='cliente_orden' and column_name='importe_es_neto'`))[0]) {
        await c.query(migracion('20260910T2355_el_contratado_sale_de_la_orden_y_el_dolar_se_valua_vivo.sql'))
      }
      await c.query(migracion('20260910T2356_obra_cuenta_las_mismas_columnas_que_publica_obras.sql'))
    }
    const direccion = (await q(`select id from perfiles where rol='direccion' limit 1`))[0]
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la economía')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])

    const filas = new Map((await q(`select * from public.obra_cuenta`)).map((f) => [f.obra_id, f]))
    assert.ok([...filas.values()].some((f) => f.n_cobranzas > 0),
      'obra_cuenta no devolvió ninguna obra con cobranzas: el control no miró nada')

    const num = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
    const dia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null)

    await t.test('la ventana y el plazo son los MISMOS números que usa el generador del Sheet', async () => {
      assert.equal((await q('select public.ano_obras() a'))[0].a, ANO)
      assert.equal((await q('select public.plazo_cobro_dias() p'))[0].p, PLAZO_COBRO_DIAS)
    })

    await t.test('las siete obras que no discrepan dan el mismo número que la pestaña', () => {
      for (const [obra, [total, neto, porCobrar, vencido, prox, medio]] of Object.entries(OBRAS)) {
        const f = filas.get(obra)
        assert.ok(f, `la obra ${obra} no está en obra_cuenta`)
        assert.equal(num(f.cobrado_total), total, `${obra}: cobrado TOTAL (con IVA)`)
        assert.equal(num(f.cobrado_neto), neto, `${obra}: cobrado NETO`)
        assert.equal(num(f.por_cobrar), porCobrar, `${obra}: por cobrar`)
        assert.equal(num(f.vencido), vencido, `${obra}: vencido`)
        assert.equal(dia(f.proximo_cobro_fecha), prox, `${obra}: próximo cobro`)
        assert.equal(f.proximo_cobro_medio, medio, `${obra}: medio del próximo cobro`)
      }
    })

    await t.test('el cobrado TOTAL no es el NETO: ésa era la diferencia que veía el dueño', () => {
      // BSA $4.848.135 contra $4.073.022 y Playón de Azufre $56.834.641 contra $50.659.641. Si
      // alguien vuelve a publicar una sola columna, una de estas dos afirmaciones cae.
      for (const obra of ['messina-bsa', 'messina-playon-azufre']) {
        const f = filas.get(obra)
        assert.ok(Number(f.cobrado_total) > Number(f.cobrado_neto),
          `${obra}: el total con IVA tiene que ser mayor que el neto`)
      }
      assert.equal(num(filas.get('messina-bsa').cobrado_total), 4_848_134.95)
      assert.equal(num(filas.get('messina-bsa').cobrado_neto), 4_073_021.70)
      assert.equal(num(filas.get('messina-playon-azufre').cobrado_total), 56_834_641)
      assert.equal(num(filas.get('messina-playon-azufre').cobrado_neto), 50_659_641)
    })

    await t.test('Quattropani coincide con la pestaña dentro del ruido del tipo de cambio', () => {
      const f = filas.get('quattropani')
      for (const [rotulo, vivo, deObras] of [
        ['cobrado', Number(f.cobrado_total), QUATTROPANI.cobradoTotal],
        ['por cobrar', Number(f.por_cobrar), QUATTROPANI.porCobrar],
      ]) {
        assert.ok(Math.abs(vivo - deObras) < QUATTROPANI.tolerancia,
          `Quattropani ${rotulo}: ${vivo} contra ${deObras} de OBRAS — más que el ruido del dólar`)
      }
      assert.equal(dia(f.proximo_cobro_fecha), '2026-09-25')
      assert.equal(f.proximo_cobro_medio, 'Transferencia')
    })

    await t.test('BSA discrepa con la pestaña, y la diferencia es EXACTAMENTE la fila 46', () => {
      const f = filas.get('messina-bsa')
      const DE_OBRAS_POR_COBRAR = 12_157_138.26
      const FILA_46_BRUTO = 4_336_586.76
      assert.equal(f.n_cobranzas, 4, 'BSA tiene cuatro filas imputadas, no las tres que dicen «BSA»')
      assert.equal(num(f.por_cobrar), 16_493_725.02)
      assert.equal(num(f.vencido), 16_493_725.02)
      assert.equal(num(f.por_cobrar - DE_OBRAS_POR_COBRAR), FILA_46_BRUTO,
        'la diferencia con la pestaña tiene que ser la fila 46 entera, ni un peso más')
      // Y el cobrado SÍ coincide: la fila 46 está facturada, no cobrada.
      assert.equal(num(f.cobrado_total), 4_848_134.95)
    })

    await t.test('el contratado sale de obra_economia_cartera y no de una segunda cuenta', async () => {
      const pares = await q(`select k.obra_id, k.contratado a, e.contratado b
                               from public.obra_cuenta k
                               join public.obra_economia_cartera e on e.obra_canonica_id = k.obra_id`)
      assert.ok(pares.length > 0, 'ninguna obra tiene economía persistida: el control no miró nada')
      for (const p of pares) assert.equal(num(p.a), num(p.b), `${p.obra_id}: dos contratados distintos`)
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
