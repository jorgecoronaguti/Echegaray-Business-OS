// EL CONTRATADO DE CADA OBRA, CONTRA LAS FILAS REALES DE `public.cobranzas`.
//
// Lo que se prueba, y el defecto que atrapa cada uno:
//
//   1 · BSA reúne sus CUATRO filas y no tres. La fila «ACTUALIZACION DE PRECIOS OC 02-00000279»
//       ($3.583.956 netos) pertenece a la obra por su orden 00002-00001984 y no dice «BSA» en
//       ninguna columna: el `needle` la dejaba afuera del contratado ($14.120.243,40) mientras el
//       cobrado —que ya salía de la imputación— la incluía. El mismo subtest corre las DOS reglas
//       sobre las MISMAS filas: si alguien devuelve el `needle`, el número vuelve a $14.120.243,40 y
//       la comparación se pone roja con los dos números escritos.
//   2 · Las tres obras cuya OC cierra contra Cobranzas dejan de marcarse «suma-viva» y citan su
//       papel. Si se revierte el paso por `cliente_orden`, vuelven a `suma-viva` y esto es rojo.
//   3 · Las OC de 2024 de la obra fusionada no entran al total de la obra en curso.
//
// Corre sobre la base real dentro de una transacción con ROLLBACK: no queda una fila. Sin base, se
// salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { cargarDiccionarios, imputarFilas } from './cobranza-obra-diccionario.mjs'
import { contratoDeObra, filasDeObra } from './cobranzas-contrato.mjs'
import { contratadoEnPesos, totalesDeOrdenes, ventaViva, ORIGEN } from './obras-economia.mjs'

const MIGRACION = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260910T2355_el_contratado_sale_de_la_orden_y_el_dolar_se_valua_vivo.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** El año del rótulo de la pestaña OBRAS. Se clava acá para que el test no dependa de subir `ANO`. */
const ANIO = 2026
/** El layout de la lectura del Sheet, reproducido sobre la réplica. */
const COLS = { cliente: 0, concepto: 1, oc: 2, neto: 3, estado: 4, moneda: 5, fechaVenta: 6 }

test('el contratado por obra, contra las filas reales de Cobranzas', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    const yaVive = (await q(`select 1 v from information_schema.columns
      where table_schema='public' and table_name='cliente_orden' and column_name='importe_es_neto'`))[0]
    if (!yaVive) await c.query(MIGRACION)

    const cobranzas = await q(`select cb.obra_cliente, cb.concepto, cb.orden_compra,
                                      coalesce(cb.monto_neto_origen, cb.monto_neto) neto,
                                      cb.estado, cb.moneda, to_char(cb.fecha_venta,'YYYY-MM-DD') fecha,
                                      cb.cliente_id
                                 from public.cobranzas cb order by cb.sheet_id::int`)
    assert.ok(cobranzas.length > 50, `sólo ${cobranzas.length} cobranzas: el control no miró nada`)
    const filas = cobranzas.map((r) => [r.obra_cliente, r.concepto, r.orden_compra,
      Number(r.neto), r.estado, r.moneda, r.fecha])

    const dicc = await cargarDiccionarios(q)
    const porEtiqueta = new Map(cobranzas.map((r) => [String(r.obra_cliente ?? '').trim(), r.cliente_id]))
    const imputacion = imputarFilas(filas, COLS, { ...dicc, clienteDe: (e) => porEtiqueta.get(e) ?? null })
    assert.ok(imputacion.imputadas > 0, 'ninguna fila se imputó: el diccionario no cargó')

    /** Las OC vivas de cada obra, con la fusión ya resuelta — igual que `ordenesPorObra` del sync. */
    const ordenes = new Map()
    for (const o of await q(`select coalesce(oc.fusionada_en, co.obra_id) obra, co.numero,
                                    to_char(co.fecha,'YYYY-MM-DD') fecha, co.importe, co.importe_es_neto
                               from public.cliente_orden co
                               join public.obra_canonica oc on oc.id = co.obra_id
                              where co.tipo='orden_compra' and co.eliminado_en is null`)) {
      if (!ordenes.has(o.obra)) ordenes.set(o.obra, [])
      ordenes.get(o.obra).push({
        numero: o.numero, fecha: o.fecha, importe: Number(o.importe), importeEsNeto: o.importe_es_neto === true,
      })
    }

    /** Lo que el sync persistiría para una obra, sin tocar el Sheet ni la tabla. */
    const economiaDe = (obraId) => {
      const imputadas = imputacion.porObra.get(obraId) ?? []
      const contrato = contratoDeObra(filas, COLS, { imputadas }, 5)
      const viva = ventaViva(filas, COLS, { imputadas, anio: ANIO }, null)
      const oc = totalesDeOrdenes(ordenes.get(obraId) ?? [], ANIO)
      return { ...contratadoEnPesos({ ...contrato, ventaViva: viva.pesos, oc }, null), oc, n: imputadas.length }
    }

    await t.test('BSA reúne las CUATRO filas que dicen sus órdenes, no las tres que dicen «BSA»', () => {
      const bsa = economiaDe('messina-bsa')
      assert.equal(bsa.n, 4, 'BSA tiene cuatro filas imputadas por orden de compra')
      assert.equal(Math.round(bsa.contratado * 100) / 100, 17_704_199.40)

      // LA MISMA CUENTA CON LA REGLA VIEJA. No es adorno: es lo único que prueba que este test puede
      // dar rojo por el motivo correcto. Si el `needle` vuelve, los dos números se igualan y la
      // desigualdad de abajo cae.
      const porNeedle = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'BSA', anio: ANIO })
      const vivaVieja = ventaViva(filas, COLS, { imputadas: porNeedle, anio: ANIO }, null)
      assert.equal(porNeedle.length, 3)
      assert.equal(Math.round(vivaVieja.pesos * 100) / 100, 14_120_243.40)
      assert.notEqual(vivaVieja.pesos, bsa.contratado,
        'el needle y la imputación tienen que dar distinto: la fila 46 es la diferencia')
    })

    await t.test('las obras cuya OC cierra contra Cobranzas citan su papel y dejan «suma-viva»', () => {
      for (const [obra, referencia] of [
        ['messina-adicional-tercer-muro', 'según OC 2256'],
        ['messina-playon-dilucion-acido', 'según OC 2266'],
        ['messina-pisos-120-rampa', 'según OC 2097, 2226'],
      ]) {
        const e = economiaDe(obra)
        assert.equal(e.origen, ORIGEN.ocCliente, `${obra} tendría que salir respaldada por su OC`)
        assert.equal(e.referencia, referencia)
        assert.equal(e.nota, null)
      }
    })

    await t.test('BSA no mejora su marca: sus OC no cierran, y la diferencia queda escrita', () => {
      const bsa = economiaDe('messina-bsa')
      assert.equal(bsa.origen, ORIGEN.sumaViva)
      assert.equal(bsa.referencia, null)
      assert.match(bsa.nota, /^OC \$[\d.]+ c\/IVA \(\$[\d.]+ neto\) vs Cobranzas \$17\.704\.199$/)
    })

    await t.test('las OC de 2024 de la obra fusionada no entran al total de la obra en curso', () => {
      const { oc } = economiaDe('messina-bsa')
      assert.equal(oc.nVentana, 2)
      assert.equal(oc.nHistorico, 3, 'las tres OC de 2024 de `bsa-planta` son histórico, no cartera viva')
      assert.equal(Math.round(oc.cIvaVentana * 100) / 100, 11_565_368.76)
      assert.equal(Math.round(oc.cIvaHistorico * 100) / 100, 38_321_214.36)
      assert.notEqual(Math.round((oc.cIvaVentana + oc.cIvaHistorico) * 100) / 100, oc.cIvaVentana)
    })

    await t.test('las OC de ARCOR quedaron marcadas como netas y las de Messina no', async () => {
      const marcadas = await q(`select c.slug, count(*) filter (where co.importe_es_neto)::int netas,
                                       count(*)::int total
                                  from public.cliente_orden co join public.clientes c on c.id=co.cliente_id
                                 where co.tipo='orden_compra' and co.eliminado_en is null
                                 group by c.slug order by c.slug`)
      const arcor = marcadas.find((m) => m.slug === 'arcor')
      const messina = marcadas.find((m) => m.slug === 'messina')
      assert.ok(arcor && arcor.netas === arcor.total, 'las OC de ARCOR están en neto: se marcan todas')
      assert.equal(messina.netas, 0, 'las OC de Messina vienen con IVA')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
