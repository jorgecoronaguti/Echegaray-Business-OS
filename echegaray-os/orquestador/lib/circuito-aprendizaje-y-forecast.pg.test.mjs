// EL CIRCUITO SE CIERRA: CAPTURA, DECISIÓN Y FORECAST — T4700 · T4800 · T4900.
//
// El test estrella está en «aceptar una recomendación NO mueve la oferta congelada»: es la
// condición que hace posible que el sistema aprenda sin reescribir la historia. Si aceptar una
// recomendación cambiara lo que una cotización de febrero dice que costaba, el aprendizaje sería
// indistinguible de la falsificación de un dato histórico.
//
// Los otros defectos que mide:
//
//  · la captura escribía el rendimiento con el TOTAL de horas — una espera de camión entraba al
//    estándar de la tarea y se quedaba ahí para siempre;
//  · tomaba la cantidad del OBJETIVO teniendo la evidencia de los partes;
//  · resolvía la composición de la cuadrilla a `current_date` porque no tenía ventana temporal;
//  · no había forma de aceptar ni de descartar una recomendación, y descartar es la decisión más
//    frecuente;
//  · no existía forecast: cotizado, planificado, real y proyectado eran tres números y un hueco.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarMigracionesDelCircuito } from './circuito-productivo-migraciones.mjs'
import { aprender } from './xsas-aprendizaje.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('captura, recomendación aceptada y forecast', { skip: !hayBase }, async (t) => {
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

    const OBRA = 'zz-test-circuito-aprende'
    const OBRA2 = 'zz-test-circuito-aprende-2'
    await q(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles)
             values ($1,'ZZ Aprende', 8, '{1,2,3,4,5}'), ($2,'ZZ Aprende 2', 8, '{1,2,3,4,5}')`, [OBRA, OBRA2])
    const gente = await q(`select id from personas limit 2`)

    // Base maestra: la tarea rinde 2,0 hs/m² según el análisis vigente.
    const tarea = await uno(`insert into tarea_tipo (codigo, nombre, unidad, metodo_medicion)
                             values ('ZZ-AP','ZZ Revoque','m2','cantidad') returning id`)
    const rMo = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                           values ('ZZ-AP-MO','ZZ Oficial revoque','hs','mano_obra') returning id`)
    const an = await uno(`insert into analisis (tarea_tipo_id, version, vigente)
                          values ($1, 1, true) returning id`, [tarea.id])
    await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden)
             values ($1,$2, 2.0, 1)`, [an.id, rMo.id])

    await t.test('T4700 · la captura toma la cantidad y las fechas de la EVIDENCIA, y descuenta las improductivas', async () => {
      const act = await uno(`insert into obra_actividad (obra_id, nombre, tipo, orden, unidad,
          cantidad_objetivo, metodo_avance, hh_plan, tarea_tipo_id, analisis_id, clave, fuente)
        values ($1,'ZZ revoque frente sur','tarea', 9101,'m2', 100, 'cantidad', 200, $2, $3, 'zz:cap', 'web') returning id`,
      [OBRA, tarea.id, an.id])
      // Se ejecutaron 120 m² —MÁS que el objetivo de 100— en dos partes con fechas distintas.
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'2026-06-01', 70, 'cantidad'), ($1,$2,'2026-06-10', 50, 'cantidad')`, [OBRA, act.id])
      // 300 h imputadas, de las cuales 50 fueron espera de equipo.
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
               values ($1,$2,$3,'2026-06-01','2026-06-01', 250, 'normal', 'zz-test')`, [OBRA, act.id, gente[0].id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva, causa_desvio)
               values ($1,$2,$3,'2026-06-01','2026-06-01', 50, 'normal', 'zz-test', true, 'espera_equipo')`,
      [OBRA, act.id, gente[0].id])

      const v = await uno(`select * from rendimiento_a_capturar where actividad_id=$1`, [act.id])
      assert.ok(v, 'la actividad terminada no aparece como capturable')
      assert.equal(n(v.cantidad), 120, 'tomó la cantidad del OBJETIVO teniendo la evidencia de los partes')
      assert.equal(v.cantidad_de_la_evidencia, true)
      assert.equal(n(v.hh_real), 300, 'el total real es el total real')
      assert.equal(n(v.hh_improductivas), 50)
      assert.equal(n(v.hh_productivas), 250)
      assert.equal(n(v.hs_unitarias_observado), 2.083, '250 h productivas / 120 m² = 2,083')
      assert.equal(v.fecha_desde.toISOString().slice(0, 10), '2026-06-01')
      assert.equal(v.fecha_hasta.toISOString().slice(0, 10), '2026-06-10')

      // ═══ QUIÉN CAPTURA, DESDE EL 27/08/2026 ═══
      //
      // `capturar_rendimientos()` está retirada: aprendía sólo al 100% y escribía sin estado, sin
      // confianza y sin evidencia. Ahora captura el ciclo de XSAS, que hace lo mismo y además dice
      // cuánto vale lo que aprendió. Dos sistemas aprendiendo rendimientos con reglas distintas era
      // el problema; esto lo prueba resuelto por los dos lados.
      // El savepoint es obligatorio: una excepción de Postgres aborta la transacción entera y todo
      // lo que viene después falla con «current transaction is aborted».
      await c.query('savepoint sp_retirada')
      await assert.rejects(
        () => c.query(`select public.capturar_rendimientos($1)`, [OBRA]),
        /retirado/, 'la función vieja sigue pudiendo escribir')
      await c.query('rollback to savepoint sp_retirada')

      // `aprender` espera el contrato de `db.mjs` —un objeto con `rows`—, no el helper del test.
      const salida = await aprender({ query: (sql, params) => c.query(sql, params) }, { obras: [OBRA] })
      assert.equal(salida.aprendidas, 1)

      const r = await uno(`select * from rendimiento_historico where actividad_id=$1`, [act.id])
      // EL DEFECTO QUE ESTE NÚMERO CUIDA: con el total de horas daría 300/120 = 2,5 y el estándar se
      // llevaría la avería del equipo puesta.
      assert.equal(n(r.hs_unitarias), 2.083, 'el rendimiento aprendido incluye las horas improductivas')
      assert.equal(n(r.hh_reales), 300)
      assert.equal(n(r.hh_improductivas), 50)
      assert.deepEqual(r.causas, { espera_equipo: 1 }, 'la causa no viajó con el aprendizaje')
      assert.equal(r.fecha_desde.toISOString().slice(0, 10), '2026-06-01')
      assert.equal(r.fecha_hasta.toISOString().slice(0, 10), '2026-06-10')
      assert.equal(r.estado, 'CANDIDATO', 'un caso único no puede entrar como verdad establecida')
      assert.equal(r.confianza, 'alta', 'terminada y con los dos números: la medición vale')

      // Idempotente: correrlo de nuevo no infla la muestra ni crea un caso nuevo.
      await aprender({ query: (sql, params) => c.query(sql, params) }, { obras: [OBRA] })
      const cuantas = await uno(`select count(*)::int n from rendimiento_historico where actividad_id=$1`, [act.id])
      assert.equal(n(cuantas.n), 1, 'una segunda corrida duplicó la muestra')
    })

    await t.test('T4800 · con UNA sola obra no hay recomendación; con dos, sí', async () => {
      const unaSola = await uno(`select muestra, obras, hs_recomendado, lectura
                                   from rendimiento_recomendado where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(n(unaSola.obras), 1)
      assert.equal(unaSola.hs_recomendado, null, 'presentó un caso único como recomendación')
      assert.match(unaSola.lectura, /muestra chica/)

      // Segunda obra: 2,517 hs/m² (una muestra más alta). Mediana de {2,083; 2,517} = 2,3.
      await q(`insert into rendimiento_historico (tarea_tipo_id, analisis_id, obra_id, unidad,
                 cantidad, hh_reales, hh_improductivas, fuente)
               values ($1,$2,$3,'m2', 120, 302, 0, 'zz-test')`, [tarea.id, an.id, OBRA2])

      const dos = await uno(`select * from rendimiento_recomendado where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(n(dos.obras), 2)
      assert.equal(n(dos.hs_analisis), 2.0)
      assert.equal(n(dos.hs_recomendado), 2.3, 'la mediana de las dos muestras')

      const pend = await uno(`select * from recomendacion_pendiente where tarea_tipo_id=$1`, [tarea.id])
      assert.ok(pend, 'la recomendación no aparece como pendiente de decisión')
      assert.equal(pend.sentido, 'la obra tarda más de lo que cotizamos')
      assert.equal(n(pend.cambio_pct), 15.0, '(2,3 − 2,0) / 2,0 = +15 %')
    })

    // ═══ EL TEST ESTRELLA ═══════════════════════════════════════════════════════════════════════
    await t.test('T4800 · aceptar crea una versión nueva Y la oferta congelada NO se mueve', async () => {
      // Una oferta cotizada con el análisis vigente de HOY (2,0 hs/m²), congelada.
      const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
          pct_gastos_generales, pct_beneficio, pct_iva)
        values ('ZZ','ZZ oferta de febrero','ZZ-AP-1', current_date, 'borrador', 0.27, 0.22, 0.21) returning id`)
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad,
          unidad, tarea_tipo_id, analisis_id, metodo_medicion)
        values ($1, 1, 'ZZ revoque', 100, 'm2', $2, $3, 'cantidad') returning id`, [cot.id, tarea.id, an.id])
      await q(`select public.congelar_presupuesto($1)`, [cot.id])

      const antes = await uno(`select hh, hs_unitarias, subtotal, congelada
                                 from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      assert.equal(n(antes.hs_unitarias), 2.0)
      assert.equal(n(antes.hh), 200, '100 m² × 2,0 hs/m²')
      assert.equal(antes.congelada, true)

      // Se acepta lo que la obra enseñó.
      const nuevo = await uno(`select public.aceptar_recomendacion($1, 'ZZ probado en dos obras') as id`, [tarea.id])
      assert.ok(nuevo.id)

      const est = await uno(`select hh_por_unidad, version from estandar_productivo where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(n(est.hh_por_unidad), 2.3, 'el estándar vigente no se movió al valor aprendido')
      assert.equal(n(est.version), 2)

      const viejo = await uno(`select vigente, vigencia_hasta from analisis where id=$1`, [an.id])
      assert.equal(viejo.vigente, false)
      assert.ok(viejo.vigencia_hasta, 'la versión anterior quedó sin fecha de cierre')

      // ── LO QUE NO PUEDE PASAR ────────────────────────────────────────────────────────────────
      const despues = await uno(`select hh, hs_unitarias, subtotal
                                   from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      assert.equal(n(despues.hs_unitarias), 2.0, 'la oferta congelada cambió de rendimiento al aprender')
      assert.equal(n(despues.hh), 200, 'la oferta congelada cambió de HH al aprender')
      assert.equal(n(despues.subtotal ?? 0), n(antes.subtotal ?? 0), 'la oferta congelada cambió de costo al aprender')

      // Y queda la constancia, con los números con los que se decidió.
      const d = await uno(`select * from recomendacion_decision where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(d.decision, 'aceptada')
      assert.equal(n(d.hs_vigente), 2.0)
      assert.equal(n(d.hs_recomendado), 2.3)
      assert.equal(n(d.obras), 2)
      assert.equal(d.analisis_nuevo_id, nuevo.id)
      assert.match(d.motivo, /dos obras/)

      // La recomendación sale de pendientes: no hay muestra nueva desde que se decidió.
      const sigue = await q(`select 1 from recomendacion_pendiente where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(sigue.length, 0, 'la recomendación ya decidida sigue pidiendo decisión')
    })

    await t.test('T4800 · aprende hacia MEJOR: la obra que rinde más también recalibra', async () => {
      const t2 = await uno(`insert into tarea_tipo (codigo, nombre, unidad) values ('ZZ-AP2','ZZ Pintura','m2') returning id`)
      const r2 = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                            values ('ZZ-AP2-MO','ZZ Pintor','hs','mano_obra') returning id`)
      const a2 = await uno(`insert into analisis (tarea_tipo_id, version, vigente) values ($1,1,true) returning id`, [t2.id])
      await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2, 1.0, 1)`, [a2.id, r2.id])
      // Dos obras que rinden MEJOR que el análisis: 0,6 y 0,8 hs/m² → mediana 0,7.
      await q(`insert into rendimiento_historico (tarea_tipo_id, analisis_id, obra_id, unidad, cantidad, hh_reales, fuente)
               values ($1,$2,$3,'m2', 100, 60, 'zz-test'), ($1,$2,$4,'m2', 100, 80, 'zz-test')`,
      [t2.id, a2.id, OBRA, OBRA2])

      const p = await uno(`select sentido, hs_recomendado, cambio_pct from recomendacion_pendiente where tarea_tipo_id=$1`, [t2.id])
      assert.equal(n(p.hs_recomendado), 0.7)
      assert.equal(p.sentido, 'la obra tarda menos de lo que cotizamos',
        'sólo detecta el desvío en una dirección: cotizar largo también cuesta obras')
      assert.equal(n(p.cambio_pct), -30.0)

      const nuevo = await uno(`select public.aceptar_recomendacion($1, 'ZZ mejor de lo previsto') as id`, [t2.id])
      const est = await uno(`select hh_por_unidad from estandar_productivo where tarea_tipo_id=$1`, [t2.id])
      assert.equal(n(est.hh_por_unidad), 0.7)
      assert.ok(nuevo.id)
    })

    await t.test('T4800 · descartar exige motivo y saca la recomendación de la lista', async () => {
      const t3 = await uno(`insert into tarea_tipo (codigo, nombre, unidad) values ('ZZ-AP3','ZZ Carpeta','m2') returning id`)
      const r3 = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                            values ('ZZ-AP3-MO','ZZ Oficial carpeta','hs','mano_obra') returning id`)
      const a3 = await uno(`insert into analisis (tarea_tipo_id, version, vigente) values ($1,1,true) returning id`, [t3.id])
      await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2, 1.0, 1)`, [a3.id, r3.id])
      await q(`insert into rendimiento_historico (tarea_tipo_id, analisis_id, obra_id, unidad, cantidad, hh_reales, fuente)
               values ($1,$2,$3,'m2', 100, 300, 'zz-test'), ($1,$2,$4,'m2', 100, 320, 'zz-test')`,
      [t3.id, a3.id, OBRA, OBRA2])

      await c.query('savepoint sin_motivo')
      await assert.rejects(
        () => c.query(`select public.descartar_recomendacion($1, '')`, [t3.id]),
        /exige un motivo/i, 'dejó descartar sin decir contra qué se comparó')
      await c.query('rollback to savepoint sin_motivo')

      await q(`select public.descartar_recomendacion($1, 'ZZ las dos obras fueron en altura, no comparan')`, [t3.id])
      const d = await uno(`select decision, motivo, analisis_nuevo_id from recomendacion_decision where tarea_tipo_id=$1`, [t3.id])
      assert.equal(d.decision, 'descartada')
      assert.equal(d.analisis_nuevo_id, null, 'descartar creó una versión del análisis')
      const sigue = await q(`select 1 from recomendacion_pendiente where tarea_tipo_id=$1`, [t3.id])
      assert.equal(sigue.length, 0, 'la recomendación descartada vuelve a pedir decisión al día siguiente')
      // Y el análisis NO se movió.
      const est = await uno(`select hh_por_unidad, version from estandar_productivo where tarea_tipo_id=$1`, [t3.id])
      assert.equal(n(est.hh_por_unidad), 1.0)
      assert.equal(n(est.version), 1)
    })

    await t.test('T4900 · cotizado ≠ planificado ≠ real ≠ forecast: cuatro números distintos', async () => {
      const OBRA3 = 'zz-test-circuito-forecast'
      await q(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles)
               values ($1,'ZZ Forecast', 8, '{1,2,3,4,5}')`, [OBRA3])
      const t4 = await uno(`insert into tarea_tipo (codigo, nombre, unidad, metodo_medicion)
                            values ('ZZ-FC','ZZ Mampostería','m2','cantidad') returning id`)
      const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
          pct_gastos_generales, pct_beneficio, pct_iva, convertida_obra_id)
        values ('ZZ','ZZ forecast','ZZ-FC-1', current_date, 'adjudicada', 0.27, 0.22, 0.21, $1) returning id`, [OBRA3])
      // COTIZADO: 100 m² × $5.000 = $500.000, con 2,0 hs/m² → 200 HH cotizadas.
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad,
          unidad, tarea_tipo_id, metodo_medicion, hs_unitarias, costo_unitario)
        values ($1, 1, 'ZZ mampostería', 100, 'm2', $2, 'cantidad', 2.0, 5000) returning id`, [cot.id, t4.id])
      await q(`select public.congelar_presupuesto($1)`, [cot.id])

      // PLANIFICADO: la conversión repartió 200 HH… y el jefe de obra las ajustó a 220 al planificar.
      const act = await uno(`insert into obra_actividad (obra_id, nombre, tipo, orden, unidad,
          cantidad_objetivo, metodo_avance, hh_plan, dotacion_prevista, tarea_tipo_id, cotizacion_partida_id,
          inicio_plan, fin_plan, inicio_base, fin_base, sellada_en, clave, fuente)
        values ($1,'ZZ mampostería','tarea', 9201,'m2', 100, 'cantidad', 220, 5, $2, $3,
                '2026-07-01','2026-07-20','2026-07-01','2026-07-15', now(), 'zz:fc', 'web') returning id`,
      [OBRA3, t4.id, part.id])
      // REAL: 50 m² ejecutados con 150 h imputadas, 30 de ellas improductivas → 120 productivas.
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'2026-07-05', 50, 'cantidad')`, [OBRA3, act.id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
               values ($1,$2,$3,'2026-07-05','2026-07-05', 120, 'normal', 'zz-test')`, [OBRA3, act.id, gente[0].id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva, causa_desvio)
               values ($1,$2,$3,'2026-07-05','2026-07-05', 30, 'normal', 'zz-test', true, 'falta_material')`,
      [OBRA3, act.id, gente[0].id])

      const f = await uno(`select * from obra_actividad_forecast where actividad_id=$1`, [act.id])
      assert.equal(n(f.hh_plan), 220, 'PLANIFICADO')
      assert.equal(n(f.hh_real), 150, 'REAL: el total es lo que se pagó')
      assert.equal(n(f.hh_productivas), 120)
      // 120 h productivas / 50 m² = 2,4 hs/m² — el ritmo REAL, que no es ni el cotizado ni el plan.
      assert.equal(n(f.rendimiento_real), 2.4)
      assert.equal(n(f.rendimiento_plan), 2.2)
      assert.equal(n(f.cantidad_restante), 50)
      assert.equal(n(f.hh_restantes), 120, '50 m² × 2,4 hs/m²')
      assert.equal(n(f.hh_forecast), 270, 'FORECAST: 150 reales + 120 que faltan')
      assert.equal(n(f.desvio_hh), 50, '270 − 220')
      assert.match(f.base_del_forecast, /^ritmo real/, 'no declaró que proyectó sobre evidencia')
      assert.match(f.base_del_forecast, /CÁLCULO/)
      // 120 HH restantes ÷ (5 personas × 8 h) = 3 días.
      assert.equal(n(f.dias_restantes), 3)

      // LA BASELINE NO SE TOCA: el forecast la lee, no la mueve.
      assert.equal(f.fin_base.toISOString().slice(0, 10), '2026-07-15')
      assert.equal(f.fin_plan.toISOString().slice(0, 10), '2026-07-20')
      const sellada = await uno(`select inicio_base, fin_base from obra_actividad where id=$1`, [act.id])
      assert.equal(sellada.fin_base.toISOString().slice(0, 10), '2026-07-15')

      // Y los CUATRO números son distintos entre sí.
      const cotizado = await uno(`select hh, subtotal from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      assert.equal(n(cotizado.hh), 200, 'COTIZADO')
      const cuatro = new Set([n(cotizado.hh), n(f.hh_plan), n(f.hh_real), n(f.hh_forecast)])
      assert.equal(cuatro.size, 4, 'dos de los cuatro números colapsaron en el mismo valor')

      // La proyección económica, declarada como inferencia en el nombre de la columna.
      const e = await uno(`select * from obra_forecast_economico where obra_id=$1`, [OBRA3])
      assert.equal(n(e.costo_cotizado), 500000)
      assert.equal(n(e.factor_hh), 1.2273, '270 / 220, redondeado para mostrarlo')
      // La proyección usa el cociente EXACTO, no el factor redondeado: redondear antes de
      // multiplicar mete el error del display dentro del número que decide.
      assert.equal(n(e.costo_proyectado_inferido), 613636.36, '$500.000 × 270 / 220')
      assert.equal(n(e.desvio_proyectado_inferido), 113636.36)
      assert.match(e.base_de_la_proyeccion, /^INFERENCIA/, 'publicó una proyección sin declarar su naturaleza')
    })

    await t.test('T4900 · el cómputo se puede trazar contra la cantidad de la partida', async () => {
      const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
                             values ('ZZ','ZZ cómputo','ZZ-CO-1', current_date, 'borrador') returning id`)
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
                              values ($1, 1, 'ZZ muro', 87.5, 'm2') returning id`, [cot.id])
      // Tres paños y el descuento de las aberturas, que va en NEGATIVO.
      await q(`insert into computo (cotizacion_partida_id, documento_nombre, revision, elemento, unidad,
                 cantidad, origen, criterio)
               values ($1,'ZZ-PL-01','B','Muro eje A','m2', 60, 'plano', '10,00 × 6,00'),
                      ($1,'ZZ-PL-01','B','Muro eje B','m2', 40, 'plano', '8,00 × 5,00'),
                      ($1,'ZZ-PL-01','B','Vanos','m2', -12.5, 'plano', '5 paños de 1,00 × 2,50')`, [part.id])

      const r = await uno(`select * from computo_de_partida where partida_id=$1`, [part.id])
      assert.equal(n(r.cantidad_partida), 87.5)
      assert.equal(n(r.cantidad_computada), 87.5)
      assert.equal(n(r.n_lineas), 3)
      assert.equal(n(r.n_descuentos), 1, 'el descuento de vanos no se pudo cargar en negativo')
      assert.equal(n(r.diferencia), 0)
      assert.match(r.lectura, /la cantidad de la partida es la suma del cómputo/)

      // Y la diferencia se PUBLICA, no se corrige sola.
      await q(`insert into computo (cotizacion_partida_id, elemento, unidad, cantidad, origen)
               values ($1,'ZZ paño extra','m2', 10, 'relevamiento')`, [part.id])
      const d = await uno(`select diferencia, lectura, n_lineas from computo_de_partida where partida_id=$1`, [part.id])
      assert.equal(n(d.diferencia), 10)
      assert.equal(n(d.n_lineas), 4)
      assert.match(d.lectura, /la partida dice/)
      const sinTocar = await uno(`select cantidad from cotizacion_partida where id=$1`, [part.id])
      assert.equal(n(sinTocar.cantidad), 87.5, 'un trigger corrigió la partida y tapó la diferencia')
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
