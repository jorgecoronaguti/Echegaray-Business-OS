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
 *
 * ═══ ESTO ES UNA FOTO, Y LAS FOTOS ENVEJECEN (aprendido el 12/09/2026) ═══
 *
 * Estas siete obras siguen dando el mismo número porque están cerradas o quietas. El día que una se
 * mueva, el primer paso NO es tocar la vista: es preguntar si la MOVIÓ LA EMPRESA. Le pasó a
 * Quattropani —entró una factura y se reescribió el plan de cuotas, $114.052 de diferencia en lo que
 * falta cobrar— y ahí la foto se reemplazó por la regla (ver `QUATTROPANI_USD` más abajo). Una obra
 * que cobra de verdad no se puede clavar al centavo; una obra cerrada sí, y por eso estas quedan.
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
 * QUATTROPANI NO SE COMPARA CONTRA LA FOTO: SE COMPARA CONTRA SUS PROPIAS FILAS.
 *
 * ═══ POR QUÉ SE FUE EL NÚMERO CLAVADO (12/09/2026) ═══
 *
 * Decía `{ cobradoTotal: 107_877_569, porCobrar: 52_357_555, tolerancia: 20_000 }` — la foto de la
 * pestaña al 10/09 con una tolerancia para «el ruido del dólar»— y se puso rojo por las DOS razones
 * que esa forma no puede sobrevivir:
 *
 *   · EL DÓLAR. La única fila en USD son U$S 15.400. La pestaña los valúa con la fórmula viva y la
 *     réplica con el TC del último `sync-cobranzas`: 1.512,756 el 10/09 contra 1.509,3966 el 12/09,
 *     o sea $51.742 de diferencia sobre el mismo hecho. La tolerancia de $20.000 aguantaba tres
 *     pesos de variación; el dólar se mueve más que eso cualquier martes.
 *   · Y LA EMPRESA COBRA. `por_cobrar` pasó de $52.357.555 a $52.243.502,80 porque entró la factura
 *     del 10/09 y el plan de cuotas se reescribió. Eso no es un defecto de la vista: es la obra
 *     avanzando. Un test que clava lo que falta cobrar se pone rojo cada vez que el cliente paga.
 *
 * Lo que sí es una regla —y es la que este archivo existe para defender— es que la vista sume lo que
 * dicen sus propias filas, con cada fila valuada a SU tipo de cambio. Eso se verifica contra
 * `cobranzas` en la misma transacción, y no contra una foto que envejece sola.
 */
const QUATTROPANI_USD = { usd: 15_400, tc: 1_509.3966 }

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

    await t.test('Quattropani suma lo que dicen sus filas, cada una a SU tipo de cambio', async () => {
      const f = filas.get('quattropani')
      // Las mismas filas que la vista lee, agrupadas por moneda y por estado. No es una copia de la
      // vista: es la aritmética que la vista promete, hecha sobre el dato crudo.
      const suyas = await q(`
        select cb.moneda,
               public.es_cobrada(cb.estado, cb.fecha_cobro) as cobrada,
               sum(cb.total_bruto) as ars,
               sum(cb.total_bruto_origen) as origen,
               min(cb.tipo_cambio) as tc_min, max(cb.tipo_cambio) as tc_max
          from public.cobranzas cb
          join public.cobranza_imputacion i on i.cobranza_id = cb.id
         where i.obra_id = 'quattropani'
         group by 1, 2`)
      const tramo = (moneda, cobrada) => suyas.find((x) => x.moneda === moneda && x.cobrada === cobrada)

      const usd = tramo('USD', true)
      assert.ok(usd, 'Quattropani dejó de tener la fila en dólares: era lo que hacía especial a esta obra')
      assert.equal(Number(usd.origen), QUATTROPANI_USD.usd, 'cambió el importe en dólares del contrato cobrado')
      // LA FILA SE VALÚA A SU PROPIO TC, no a 1 (que sería publicar 15.400 pesos) ni a uno inventado.
      assert.equal(Number(usd.ars), Math.round(Number(usd.origen) * Number(usd.tc_min) * 100) / 100,
        'la valuación de la fila en USD no es su importe por su tipo de cambio')
      assert.ok(Number(usd.tc_min) > 100,
        `el TC guardado es ${usd.tc_min}: una fila en USD valuada a ~1 publica dólares como si fueran pesos`)

      // Y EL TOTAL DE LA VISTA ES LA SUMA DE LOS TRAMOS, pesos y dólares valuados, sin nada en el medio.
      const cobrado = suyas.filter((x) => x.cobrada).reduce((a, x) => a + Number(x.ars), 0)
      const pendiente = suyas.filter((x) => !x.cobrada).reduce((a, x) => a + Number(x.ars), 0)
      assert.equal(num(f.cobrado_total), num(cobrado), 'el cobrado de la vista no es la suma de sus filas cobradas')
      assert.equal(num(f.por_cobrar), num(pendiente), 'lo que falta cobrar no es la suma de sus filas pendientes')
      // Un cero acá sería un verde que no midió nada.
      assert.ok(cobrado > 0 && pendiente > 0, 'Quattropani quedó sin filas cobradas o sin pendientes')

      // El próximo cobro sigue siendo el de la primera cuota que no pasó, con su medio: eso no
      // depende del dólar ni de cuánto se cobró.
      assert.match(f.proximo_cobro_medio, /Transferencia/)
      assert.ok(dia(f.proximo_cobro_fecha) >= '2026-09-01', 'el próximo cobro quedó en el pasado')
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
