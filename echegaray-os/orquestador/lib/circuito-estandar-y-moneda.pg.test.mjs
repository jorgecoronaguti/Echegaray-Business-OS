// EL ESTÁNDAR PRODUCTIVO Y LA MONEDA — T4000 · T4100 · T4200.
//
// Cada test de acá reproduce un DEFECTO concreto: si se revierte la migración que lo arregla, el
// test se pone rojo. No acompañan al código, lo miden.
//
//  · la FK duplicada en CASCADE que prometía lo contrario de lo que pasa;
//  · el CHECK, el UNIQUE y el índice repetidos;
//  · el DEFAULT 'emitida' que violaba su propio CHECK — todo INSERT sin estado explícito fallaba;
//  · el filtro asimétrico del ponderado de obra_avance (defecto LATENTE, ver su test);
//  · una sola variante vigente por tarea, que impedía que PNC80 y PNC140 convivieran;
//  · `nueva_version_de_analisis`, que tres migraciones prometían y no existía;
//  · un precio en dólares convertido a ciegas — o peor, tomado como si fueran pesos.
//
// Todo corre en UNA transacción que aplica los .sql del circuito y termina en ROLLBACK: la base
// viva no se toca. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarMigracionesDelCircuito } from './circuito-productivo-migraciones.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('estándar productivo, versiones y moneda — con las migraciones aplicadas en transacción', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    await aplicarMigracionesDelCircuito(c)
    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: dir.id, role: 'authenticated' })])

    await t.test('T4000 · una sola FK al padre, un solo CHECK, un solo UNIQUE, un solo índice', async () => {
      const fks = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
                            where conrelid='public.obra_actividad'::regclass and contype='f'
                              and pg_get_constraintdef(oid) like '%actividad_padre_id%'`)
      assert.equal(fks.length, 1, `quedaron ${fks.length} FK sobre actividad_padre_id: ${fks.map((f) => f.conname).join(', ')}`)
      assert.match(fks[0].def, /ON DELETE RESTRICT/, 'la FK que quedó no es la restrictiva')

      const checks = await q(`select conname from pg_constraint
                               where conrelid='public.obra_dependencia'::regclass and contype='c'
                                 and pg_get_constraintdef(oid) like '%origen_id <> destino_id%'`)
      assert.equal(checks.length, 1, 'obra_dependencia sigue con el mismo CHECK dos veces')

      const unicos = await q(`select indexname from pg_indexes
                               where tablename='obra_dependencia' and indexdef like '%UNIQUE%'
                                 and indexdef like '%origen_id, destino_id%'`)
      assert.equal(unicos.length, 1, 'obra_dependencia sigue con la misma unicidad dos veces')

      const porPadre = await q(`select indexname from pg_indexes
                                 where tablename='obra_actividad' and indexdef like '%(actividad_padre_id)%'`)
      assert.equal(porPadre.length, 1, 'siguen los dos índices idénticos por padre')
    })

    await t.test('T4000 · un presupuesto nace en borrador: el DEFAULT ya no viola su propio CHECK', async () => {
      // ESTE es el defecto: con DEFAULT 'emitida' y el CHECK de cinco estados, este INSERT —que no
      // nombra el estado— fallaba con «violates check constraint».
      const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion)
                             values ('ZZ','ZZ objeto','ZZ-DEF-1', current_date) returning id, estado`)
      assert.equal(cot.estado, 'borrador')
    })

    await t.test('T4000 · el ponderado de obra_avance filtra igual arriba y abajo (defecto latente)', async () => {
      // NO es un defecto observable: `sum()` saltea el NULL, así que numerador y denominador daban
      // lo mismo por casualidad. Se mide sobre la DEFINICIÓN porque es ahí donde está el riesgo —
      // el día que alguien escriba `coalesce(avance_pct, 0)` en el numerador, la obra baja de
      // avance sin que nadie la toque. Revertir la 4000 pone esto en rojo.
      const def = (await uno(`select pg_get_viewdef('public.obra_avance'::regclass) as d`)).d.replace(/\s+/g, ' ')
      const i = def.indexOf('sum((m.avance_pct * m.hh_plan))')
      assert.ok(i > 0, 'no encontré el numerador del ponderado en la vista')
      const tramo = def.slice(i, i + 220)
      assert.match(tramo, /m\.avance_pct IS NOT NULL/,
        'el numerador del ponderado no exige avance_pct not null y el denominador sí')
    })

    // ── la base maestra de prueba ───────────────────────────────────────────────────────────────
    const tarea = await uno(`insert into tarea_tipo (codigo, nombre, unidad, metodo_medicion)
                             values ('ZZ-T1','ZZ Tabique','m2','cantidad') returning id`)
    const rMo = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                           values ('ZZ-MO','ZZ Oficial','hs','mano_obra') returning id`)
    const rCs = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                           values ('ZZ-CS','ZZ Cargas','hr','carga_social') returning id`)
    const rMat = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                            values ('ZZ-MAT','ZZ Ladrillo','u','material') returning id`)
    const an = await uno(`insert into analisis (tarea_tipo_id, version, vigente, motivo)
                          values ($1, 1, true, 'ZZ base') returning id`, [tarea.id])
    await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden) values
             ($1,$2,2.0,1), ($1,$3,1.0,2), ($1,$4,5.0,3)`, [an.id, rMo.id, rCs.id, rMat.id])

    await t.test('T4100 · dos VARIANTES de la misma tarea pueden estar vigentes; dos iguales no', async () => {
      const otra = await uno(`insert into analisis (tarea_tipo_id, version, vigente, variante)
                              values ($1, 2, true, 'PNC140') returning id, variante`, [tarea.id])
      assert.equal(otra.variante, 'PNC140')
      const vigentes = await q(`select id from analisis where tarea_tipo_id=$1 and vigente`, [tarea.id])
      assert.equal(vigentes.length, 2, 'el índice viejo admitía una sola vigente por tarea tipo')

      await c.query('savepoint variante_repetida')
      await assert.rejects(
        () => c.query(`insert into analisis (tarea_tipo_id, version, vigente, variante)
                       values ($1, 3, true, 'PNC140')`, [tarea.id]),
        /duplicate key|unique/i,
        'dejó entrar dos veces la MISMA variante vigente',
      )
      await c.query('rollback to savepoint variante_repetida')
      await q(`delete from analisis where id=$1`, [otra.id])
    })

    await t.test('T4100 · nueva_version_de_analisis escala mano de obra y cargas, no el material', async () => {
      const antes = await uno(`select hs_unitarias from analisis_costo where analisis_id=$1`, [an.id])
      assert.equal(Number(antes.hs_unitarias), 2.0)

      // Objetivo 3,0 hs/m² sobre 2,0 vigentes → factor 1,5.
      const nuevo = await uno(`select public.nueva_version_de_analisis($1, 'ZZ aprendido', 3.0) as id`, [an.id])
      const vieja = await uno(`select vigente, vigencia_hasta from analisis where id=$1`, [an.id])
      assert.equal(vieja.vigente, false, 'la versión vieja quedó vigente')
      assert.ok(vieja.vigencia_hasta, 'la versión vieja se cerró sin fecha de vigencia')

      const lineas = await q(`select r.tipo, l.cantidad from analisis_linea l
                                join recurso r on r.id=l.recurso_id where l.analisis_id=$1 order by l.orden`, [nuevo.id])
      const porTipo = Object.fromEntries(lineas.map((l) => [l.tipo, Number(l.cantidad)]))
      assert.equal(porTipo.mano_obra, 3.0, 'la mano de obra no llegó al objetivo')
      assert.equal(porTipo.carga_social, 1.5, 'la carga social no acompañó a la mano de obra')
      assert.equal(porTipo.material, 5.0, 'el material escaló: tardar menos no gasta menos ladrillos')

      const costoNuevo = await uno(`select hs_unitarias, version from analisis_costo where analisis_id=$1`, [nuevo.id])
      assert.equal(Number(costoNuevo.hs_unitarias), 3.0)
      assert.equal(Number(costoNuevo.version), 2)
    })

    await t.test('T4100 · el estándar publica cada magnitud por separado', async () => {
      const vig = await uno(`select id from analisis where tarea_tipo_id=$1 and vigente`, [tarea.id])
      await q(`insert into analisis_cuadrilla (analisis_id, categoria, cantidad)
               values ($1,'oficial',1), ($1,'ayudante',2)`, [vig.id])
      const e = await uno(`select * from estandar_productivo where analisis_id=$1`, [vig.id])
      assert.equal(Number(e.hh_por_unidad), 3.0)
      // 1 oficial (1,0) + 2 ayudantes (0,6) = 2,2 de capacidad ponderada. Cuatro ayudantes no son
      // cuatro oficiales: son 2,4.
      assert.equal(Number(e.capacidad_ponderada), 2.2)
      assert.equal(Number(e.cuadrilla_personas), 3)
      assert.deepEqual(e.cuadrilla, { oficial: 1, ayudante: 2 })
      // 2,2 × 8 h ÷ 3,0 hs/m² = 5,867 m²/día
      assert.equal(Number(e.produccion_diaria_referencia), 5.867)

      // LA JORNADA ES UN PARÁMETRO, no un 8 tipeado adentro de la vista. Con la jornada de 7,5 h
      // que usa «Horas Hombre.xlsm» la misma cuadrilla rinde otra cosa, y se puede preguntar sin
      // tocar una migración. El default sigue siendo 8 —el de obra_canonica— a propósito: hay dos
      // fuentes y ninguna dice cuál manda para el OS.
      const conJornadaReal = await uno(`select public.produccion_diaria(3.0, 2.2, 7.5) as v`)
      assert.equal(Number(conJornadaReal.v), 5.5, '2,2 × 7,5 ÷ 3,0')
      const porDefecto = await uno(`select public.produccion_diaria(3.0, 2.2) as v`)
      assert.equal(Number(porDefecto.v), 5.867, 'el default de la jornada dejó de ser 8')
      // Sin cuadrilla no rinde «cero por día»: no se sabe. NULL, nunca 0.
      const sinCuadrilla = await uno(`select public.produccion_diaria(3.0, null) as v`)
      assert.equal(sinCuadrilla.v, null)
      // La inversa, que es OTRA magnitud y por eso está en otra columna.
      assert.equal(Number(e.rendimiento_unidades_por_hh), 0.3333)
      assert.equal(e.sin_cuadrilla_declarada, false)
    })

    await t.test('T4200 · un precio en USD sin tipo de cambio NO se convierte a ciegas', async () => {
      const rUsd = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                              values ('ZZ-USD','ZZ Perfil importado','kg','material') returning id`)
      await q(`insert into recurso_precio (recurso_id, costo, moneda, fecha_precio, fuente, vigente)
               values ($1, 4.5, 'USD', current_date, 'ZZ proveedor', true)`, [rUsd.id])

      const sinTc = await uno(`select * from recurso_costo where recurso_id=$1`, [rUsd.id])
      assert.equal(sinTc.moneda, 'USD')
      assert.equal(Number(sinTc.costo_origen), 4.5, 'el costo en su moneda tiene que verse igual')
      assert.equal(sinTc.costo_base, null, 'convirtió un precio en USD sin tener tipo de cambio')
      assert.equal(sinTc.costo_con_desperdicio, null)
      assert.equal(sinTc.sin_tc, true, 'no avisó que le falta el tipo de cambio')
      assert.equal(sinTc.tc_aplicado, null)

      await q(`insert into tipo_cambio (fecha, tc, fuente) values (current_date, 1500, 'ZZ BNA venta')`)
      const conTc = await uno(`select * from recurso_costo where recurso_id=$1`, [rUsd.id])
      assert.equal(Number(conTc.costo_base), 6750, '4,5 USD × 1.500 = 6.750')
      assert.equal(Number(conTc.tc_aplicado), 1500)
      assert.equal(conTc.sin_tc, false)
    })

    await t.test('T4200 · el hack legacy queda funcionando y MARCADO', async () => {
      // Los 10 recursos con «DOLAR» en el nombre y precio declarado en ARS son de los que depende la
      // paridad del costo directo con el libro (186/199 al centavo). No se tocan: se ven.
      const rHack = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                               values ('ZZ-HACK','ZZ OFICIAL - EN DOLARES','hs','mano_obra') returning id`)
      await q(`insert into recurso_precio (recurso_id, costo, moneda, vigente)
               values ($1, 4.5, 'ARS', true)`, [rHack.id])
      const r = await uno(`select * from recurso_costo where recurso_id=$1`, [rHack.id])
      assert.equal(Number(r.costo_base), 4.5, 'el dato legacy cambió de valor: la paridad con el libro se rompe')
      assert.equal(r.sospecha_usd, true, 'el hack legacy quedó invisible')
      assert.equal(r.sin_tc, false)
    })

    await t.test('T4200 · la deuda de TC se cuenta aparte de la deuda de precio', async () => {
      const rUsd2 = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                               values ('ZZ-USD2','ZZ Anclaje','u','material') returning id`)
      await q(`insert into recurso_precio (recurso_id, costo, moneda, vigente)
               values ($1, 10, 'USD', true)`, [rUsd2.id])
      await q(`delete from tipo_cambio`)
      const t2 = await uno(`insert into tarea_tipo (codigo, nombre, unidad) values ('ZZ-T2','ZZ Anclajes','u') returning id`)
      const a2 = await uno(`insert into analisis (tarea_tipo_id, version, vigente) values ($1,1,true) returning id`, [t2.id])
      await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2,1,1)`, [a2.id, rUsd2.id])
      const ac = await uno(`select n_lineas, n_lineas_sin_precio, n_lineas_sin_tc from analisis_costo where analisis_id=$1`, [a2.id])
      assert.equal(Number(ac.n_lineas), 1)
      assert.equal(Number(ac.n_lineas_sin_precio), 1, 'sin TC el costo es NULL y eso cuenta como línea sin costo')
      assert.equal(Number(ac.n_lineas_sin_tc), 1, 'no distinguió «falta el TC» de «falta el precio»')
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
