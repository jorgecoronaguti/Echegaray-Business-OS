// LA CASCADA COMERCIAL Y EL CONGELADO — T4300 · T4400.
//
// ═══ EL TEST DE PARIDAD ES EL QUE DECIDE ═══
//
// La cascada del OS publicaba un precio y el libro con el que la empresa cotiza publicaba OTRO: el
// coeficiente real es 1,682 sin IVA y el default del formulario daba 1,4287 — 18 puntos de precio
// regalados en cada oferta. Este test compara, contra los valores CACHEADOS DEL XLSM
// (`cascada-xlsm.fixtures.json`, leídos del XML del libro), la cascada entera de la obra ORICA y
// cinco partidas.
//
// LA TOLERANCIA ESTÁ MEDIDA, NO ELEGIDA: el libro redondea seis celdas con `ROUNDUP(x;1)` —siempre
// a favor del precio— y guarda cada celda a dos decimales (`fullPrecision="0"`). El OS calcula
// limpio. La diferencia acumulada medida sobre $187.415.653,40 es de **$0,34**, o sea 1,8 partes
// por mil millones. Se admite $1 y se afirma además que la diferencia relativa es menor a 1e-8: si
// la matemática estuviera mal, el error no sería de centavos sino de millones, y una tolerancia
// grande lo taparía.
//
// Y el congelado: la RLS de `cotizacion_partida` sólo pregunta por `ve_economia()`, así que un
// PATCH de PostgREST cambiaba la cantidad de una oferta ya emitida. Se prueba que ahora no.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from './db.mjs'
import { aplicarMigracionesDelCircuito } from './circuito-productivo-migraciones.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIXTURES = JSON.parse(await readFile(join(AQUI, 'cascada-xlsm.fixtures.json'), 'utf8'))

/** Lo que se admite de diferencia contra el libro en los escalones. Medido: $0,34 sobre $187,4 M. */
const TOLERANCIA_PESOS = 1

/**
 * LA DERIVA RELATIVA ADMITIDA, MEDIDA Y NO ELEGIDA.
 *
 * El `ROUNDUP(x;1)` de seis celdas del libro empuja el precio final $0,34 hacia arriba sobre
 * $187.415.653,40 — una deriva de 1,83e-9. Como `H89` (el coeficiente que el libro multiplica
 * partida por partida) sale de ese precio ya redondeado, la MISMA deriva aparece proporcional en
 * cada partida: $0,03 en una de $14,5 M, $0,09 en una de $47,5 M. Por eso el límite es relativo y
 * no un peso fijo: un peso fijo sería laxo para las partidas chicas y apretado para las grandes.
 *
 * 5e-9 es 2,7 veces la deriva medida. Si la matemática de la cascada estuviera mal, el error sería
 * de puntos porcentuales —1,4287 contra 1,682 son 18 puntos— y ninguna tolerancia razonable lo
 * taparía.
 */
const DERIVA_RELATIVA = 5e-9

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('cascada comercial del XLSM y congelado de solo lectura', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const n = (x) => Number(x)
  try {
    await c.query('begin')
    await aplicarMigracionesDelCircuito(c)
    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: dir.id, role: 'authenticated' })])

    const p = await uno(`select * from parametro_comercial where vigente`)

    await t.test('T4300 · el parámetro vigente es el del libro, versionado y con fuente', async () => {
      assert.equal(n(p.pct_gastos_generales), 0.27)
      assert.equal(n(p.pct_beneficio), 0.22)
      assert.equal(n(p.pct_financiero), 0.07)
      assert.equal(n(p.factor_financiero), 0.5)
      assert.equal(n(p.pct_iibb), 0.024)
      assert.equal(n(p.pct_ganancias), 0.02)
      assert.equal(n(p.pct_cheque), 0.012)
      assert.equal(n(p.pct_iva), 0.21)
      assert.match(p.fuente, /Planilla para Cotizar/, 'el parámetro no declara de dónde salió')
      assert.match(p.notas, /DGR/, 'la advertencia sobre IIBB sin verificar no viaja con el dato')
    })

    /** Crea un presupuesto con los parámetros vigentes y una sola partida por su costo directo. */
    async function presupuestoCon(costoDirecto, numero) {
      const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
          pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
          pct_iibb, pct_ganancias, pct_cheque, pct_iva, parametro_comercial_id)
        values ('ZZ ORICA','ZZ paridad',$1, current_date,'borrador',$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [numero, p.pct_gastos_generales, p.pct_beneficio, p.pct_financiero, p.factor_financiero,
        p.pct_iibb, p.pct_ganancias, p.pct_cheque, p.pct_iva, p.id])
      await q(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad, costo_unitario, hs_unitarias)
               values ($1, 1, 'ZZ costo directo', 1, 'gl', $2, 0)`, [cot.id, costoDirecto])
      return uno(`select * from cotizacion_cascada where id=$1`, [cot.id])
    }

    await t.test('T4300 · PARIDAD con el XLSM: la cascada global de ORICA', async () => {
      const caso = FIXTURES.casos.find((x) => x.tipo === 'cascada_global')
      const r = await presupuestoCon(caso.costo_directo, 'ZZ-PAR-0')

      assert.equal(n(r.costo_directo), caso.costo_directo)
      // Los escalones intermedios, contra los valores del libro renglón por renglón.
      assert.ok(Math.abs(n(r.gastos_generales) - 24863745.72) < TOLERANCIA_PESOS, `GG ${r.gastos_generales}`)
      assert.ok(Math.abs(n(r.costo_industrial) - 116951692.83) < TOLERANCIA_PESOS, `industrial ${r.costo_industrial}`)
      assert.ok(Math.abs(n(r.beneficio) - 25729372.50) < TOLERANCIA_PESOS, `beneficio ${r.beneficio}`)
      assert.ok(Math.abs(n(r.financiero) - 4093309.25) < TOLERANCIA_PESOS, `financiero ${r.financiero}`)
      assert.ok(Math.abs(n(r.iibb) - 3424345.57) < TOLERANCIA_PESOS, `iibb ${r.iibb}`)
      assert.ok(Math.abs(n(r.ganancias) - 2853621.40) < TOLERANCIA_PESOS, `ganancias ${r.ganancias}`)
      assert.ok(Math.abs(n(r.subtotal) - 153052341.60) < TOLERANCIA_PESOS, `subtotal ${r.subtotal}`)
      assert.ok(Math.abs(n(r.impuesto_cheque) - 1836628.10) < TOLERANCIA_PESOS, `cheque ${r.impuesto_cheque}`)

      const difSinIva = n(r.venta_sin_iva) - caso.precio_sin_iva_xlsm
      const difFinal = n(r.venta_final) - caso.precio_final_xlsm
      assert.ok(Math.abs(difSinIva) < TOLERANCIA_PESOS, `venta sin IVA difiere $${difSinIva.toFixed(4)}`)
      assert.ok(Math.abs(difFinal) < TOLERANCIA_PESOS, `venta final difiere $${difFinal.toFixed(4)}`)
      // La prueba dura: si la matemática estuviera mal el error sería de millones, no de centavos.
      assert.ok(Math.abs(difFinal / caso.precio_final_xlsm) < DERIVA_RELATIVA,
        `la diferencia relativa es ${(difFinal / caso.precio_final_xlsm).toExponential(2)}: la cascada no es la del libro`)

      // El coeficiente, que es lo que el libro multiplica partida por partida.
      assert.ok(Math.abs(n(r.coeficiente_con_iva) - caso.coeficiente_h89) < 1e-6,
        `coeficiente ${r.coeficiente_con_iva} contra ${caso.coeficiente_h89}`)
      assert.ok(Math.abs(n(r.coeficiente_sin_iva) - 1.681968) < 1e-5, `coef sin IVA ${r.coeficiente_sin_iva}`)
      // Y lo que esto vino a corregir: NO es el 1,4287 del defaultValue de React.
      assert.ok(n(r.coeficiente_sin_iva) > 1.6,
        'el coeficiente volvió a ser el de la cascada vieja: 18 puntos de precio regalados por oferta')
    })

    await t.test('T4300 · PARIDAD con el XLSM: las cinco partidas, por el coeficiente', async () => {
      const partidas = FIXTURES.casos.filter((x) => x.tipo === 'partida')
      assert.equal(partidas.length, 5, 'el fixture perdió casos')
      for (const [i, caso] of partidas.entries()) {
        const r = await presupuestoCon(caso.costo_directo, `ZZ-PAR-${i + 1}`)
        const conIva = n(r.venta_final)
        const sinIva = n(r.venta_sin_iva)
        const relIva = Math.abs(conIva - caso.precio_final_xlsm) / caso.precio_final_xlsm
        const relSin = Math.abs(sinIva - caso.precio_sin_iva_xlsm) / caso.precio_sin_iva_xlsm
        assert.ok(relIva < DERIVA_RELATIVA,
          `${caso.descripcion}: con IVA ${conIva.toFixed(2)} contra ${caso.precio_final_xlsm} (${relIva.toExponential(2)})`)
        assert.ok(relSin < DERIVA_RELATIVA,
          `${caso.descripcion}: sin IVA ${sinIva.toFixed(2)} contra ${caso.precio_sin_iva_xlsm} (${relSin.toExponential(2)})`)
      }
    })

    await t.test('T4300 · los ocho porcentajes son POR OBRA: otra obra, otro coeficiente', async () => {
      // Confirmado contra «Horas Hombre.xlsm», un fork más nuevo de la misma planilla: los mismos
      // ocho parámetros se negocian por obra. Una cotizó con GG 15 · financiero 3×0,5 · IIBB 1,2 ·
      // Ganancias 1 y le dio coeficiente 1,7769 CON IVA. Por eso la cotización COPIA los ocho a
      // columnas propias en vez de referenciar la versión del parámetro: si los referenciara, esta
      // obra necesitaría una versión nueva del estándar de la empresa para negociar su precio.
      const otra = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
          pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
          pct_iibb, pct_ganancias, pct_cheque, pct_iva, parametro_comercial_id)
        values ('ZZ otra','ZZ obra negociada','ZZ-OBRA-2', current_date,'borrador',
                0.15, 0.22, 0.03, 0.5, 0.012, 0.01, 0.012, 0.21, $1) returning id`, [p.id])
      await q(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad, costo_unitario, hs_unitarias)
               values ($1, 1, 'ZZ cd', 1, 'gl', 1000000, 0)`, [otra.id])
      const r = await uno(`select coeficiente_con_iva, coeficiente_sin_iva from cotizacion_cascada where id=$1`, [otra.id])
      assert.ok(Math.abs(n(r.coeficiente_con_iva) - 1.7769) < 0.0005,
        `coeficiente ${r.coeficiente_con_iva} contra el 1,7769 de la obra del libro`)

      // Y el vigente NO se movió: la obra negocia su precio, no el estándar de la empresa.
      const vigente = await uno(`select pct_gastos_generales from parametro_comercial where vigente`)
      assert.equal(n(vigente.pct_gastos_generales), 0.27)
    })

    // ── el congelado ────────────────────────────────────────────────────────────────────────────
    const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
        pct_gastos_generales, pct_beneficio, pct_iva)
      values ('ZZ','ZZ congelar','ZZ-CONG-1', current_date, 'borrador', 0.27, 0.22, 0.21) returning id`)
    const analisis = await uno(`select id, version from analisis where vigente limit 1`)

    await t.test('T4400 · congelar NO cambia lo cotizado: el override tipeado sobrevive (T3300)', async () => {
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad,
          hs_unitarias, costo_unitario, analisis_id)
        values ($1, 1, 'ZZ con override', 100, 'm2', 1.6, 12000, $2) returning id`, [cot.id, analisis.id])
      const antes = await uno(`select hh, subtotal from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      const r = await uno(`select public.congelar_presupuesto($1) as j`, [cot.id])
      const despues = await uno(`select hh, subtotal from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      assert.equal(n(despues.hh), n(antes.hh), 'las HH previstas cambiaron al congelar')
      assert.equal(n(despues.subtotal), n(antes.subtotal), 'el costo cambió al congelar')
      assert.equal(n(despues.hh), 160)

      // Y la novedad: queda anotado con qué VERSIÓN del análisis se cotizó.
      const guardada = await uno(`select analisis_version from cotizacion_partida where id=$1`, [part.id])
      assert.equal(n(guardada.analisis_version), n(analisis.version),
        'no quedó registrada la versión del análisis con la que se cotizó')
      assert.equal(n(r.j.n_partidas_congeladas), 1)
    })

    await t.test('T4400 · una cotización 100 % subcontratada ya no queda congelada sin respaldo', async () => {
      const soloSub = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
                                 values ('ZZ','ZZ paquete','ZZ-CONG-2', current_date, 'borrador') returning id`)
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad,
          subcontratada, precio_subcontrato)
        values ($1, 1, 'ZZ instalación eléctrica', 1, 'gl', true, 5000000) returning id`, [soloSub.id])

      const r = (await uno(`select public.congelar_presupuesto($1) as j`, [soloSub.id])).j
      assert.equal(r.n_partidas, 1)
      assert.equal(r.n_subcontratadas, 1)
      assert.equal(r.n_partidas_congeladas, 1, 'el paquete quedó fuera del congelado')
      assert.equal(r.lineas_composicion, 1, 'la cotización quedó congelada sin una sola línea de respaldo')
      assert.equal(r.n_sin_analisis, 0, 'contó el paquete como «sin análisis»: no le falta análisis, es un paquete')

      const comp = await uno(`select tipo, recurso_codigo, costo_unitario, costo_origen
                                from cotizacion_partida_composicion where partida_id=$1`, [part.id])
      assert.equal(comp.tipo, 'subcontrato')
      assert.equal(n(comp.costo_origen), 5000000)
      // La partida congela su precio unitario y CERO HH propias: cero es el dato, no un hueco.
      const pc = await uno(`select costo_unitario, hs_unitarias from cotizacion_partida where id=$1`, [part.id])
      assert.equal(n(pc.costo_unitario), 5000000)
      assert.equal(n(pc.hs_unitarias), 0)
    })

    await t.test('T4400 · lo congelado no se edita por PostgREST (el freno vivía en los botones)', async () => {
      const part = await uno(`select id from cotizacion_partida where cotizacion_id=$1 limit 1`, [cot.id])

      await c.query('savepoint intento_pct')
      await assert.rejects(
        () => c.query(`update cotizaciones set pct_beneficio = 0.40 where id=$1`, [cot.id]),
        /ya salió/i, 'se pudo cambiar el beneficio de una oferta ya emitida')
      await c.query('rollback to savepoint intento_pct')

      await c.query('savepoint intento_cantidad')
      await assert.rejects(
        () => c.query(`update cotizacion_partida set cantidad = 999 where id=$1`, [part.id]),
        /congelado/i, 'se pudo cambiar el cómputo de una oferta ya emitida')
      await c.query('rollback to savepoint intento_cantidad')

      await c.query('savepoint intento_borrar')
      await assert.rejects(
        () => c.query(`delete from cotizacion_partida where id=$1`, [part.id]),
        /no se borra/i, 'se pudo borrar una partida de una oferta ya emitida')
      await c.query('rollback to savepoint intento_borrar')

      // Lo que NO es el precio sí se puede seguir tocando: editar una nota no reescribe la oferta.
      await q(`update cotizacion_partida set nota = 'ZZ aclaración posterior' where id=$1`, [part.id])
      const nota = await uno(`select nota from cotizacion_partida where id=$1`, [part.id])
      assert.equal(nota.nota, 'ZZ aclaración posterior')

      // Y el estado sí cambia: adjudicar es un hecho posterior, no una edición de la oferta.
      await q(`update cotizaciones set estado = 'adjudicada' where id=$1`, [cot.id])
      const est = await uno(`select estado from cotizaciones where id=$1`, [cot.id])
      assert.equal(est.estado, 'adjudicada')
    })

    await t.test('T4400 · la versión nueva se lleva los ocho porcentajes', async () => {
      const nueva = await uno(`select public.nueva_version_de_presupuesto($1, 'ZZ motivo') as id`, [cot.id])
      const v = await uno(`select pct_gastos_generales, pct_beneficio, pct_iva, congelada_en, estado, vigente
                             from cotizaciones where id=$1`, [nueva.id])
      assert.equal(n(v.pct_gastos_generales), 0.27)
      assert.equal(n(v.pct_beneficio), 0.22)
      assert.equal(n(v.pct_iva), 0.21)
      assert.equal(v.congelada_en, null, 'la versión nueva nació marcada como congelada')
      assert.equal(v.estado, 'borrador')
      assert.equal(v.vigente, true)
      const vieja = await uno(`select vigente from cotizaciones where id=$1`, [cot.id])
      assert.equal(vieja.vigente, false)
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
