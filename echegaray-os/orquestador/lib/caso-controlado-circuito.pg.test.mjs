// EL CASO CONTROLADO DEL CIRCUITO PRODUCTIVO, PUNTA A PUNTA — T4000 … T4900 + 20260822T1000.
//
// Los cuatro `circuito-*.pg.test.mjs` miden UN eslabón cada uno contra su defecto. Ninguno mide el
// ENCADENAMIENTO: que el número que sale del cómputo sea el que valoriza la cascada, que el que
// congela la oferta sea el que la conversión reparte en frentes, que el que la obra ejecuta sea el
// que el forecast proyecta, y que el que la obra ENSEÑA vuelva al análisis sin tocar la oferta. Un
// eslabón puede estar bien y la cadena mal: alcanza con que dos vistas lean el mismo concepto de
// dos lados distintos.
//
// Por eso cada paso LEE EL EFECTO EN EL DESTINO —nunca el valor sembrado— y lo imprime; y por eso
// el assert final no es del último paso sino del TERCERO releído después del décimo: la oferta
// congelada en el paso 3 tiene que valer exactamente lo mismo después de que el sistema aprendió de
// la obra y versionó el análisis. Si eso se moviera, aprender y falsificar un histórico serían la
// misma operación. Con su grupo de control al lado —una cotización hecha DESPUÉS sí se mueve—,
// porque «no cambió» sin control puede no estar midiendo nada.
//
// Datos controlados prefijados `ZZ`/`zz-caso-`, en UNA transacción con ROLLBACK final y censo de
// filas antes y después. NO aplica los .sql: las once migraciones ya están aplicadas y el paso 0
// contesta la misma pregunta —«¿está esto en la base o sólo en el repo?»— interrogando al catálogo
// por los objetos y las FORMAS que dejan. Prueba el circuito tal como está en producción.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aprender } from './xsas-aprendizaje.mjs'
import { censoDeTablas, sembrarCasoControlado, TABLAS_TOCADAS, verificarCircuitoAplicado }
  from './caso-controlado-circuito.apoyo.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** El coeficiente de la cascada del libro con los parámetros vigentes v1, CON IVA. */
const COEF_CON_IVA = 2.03518114

const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const ev = (paso, datos) => console.log(`   ▸ ${paso}`, JSON.stringify(datos))
// ═══ EL ESCENARIO VIVE SIEMPRE EN EL FUTURO (02/09/2026) ═══
// Las fechas estaban tipeadas («2026-09-02») y el caso ASUME que su evidencia es futura — la
// captura debe decir fecha_desde=null porque «un parte fechado la semana que viene no es un hecho
// todavía». El día que el calendario alcanzó esas fechas, el test empezó a fallar sin que nadie
// tocara nada: afirmaba el estado del mundo. Ahora siembra septiembre del AÑO QUE VIENE, y la
// semana de cada parte se calcula al lunes real de ese año.
const AÑO_FUTURO = new Date().getFullYear() + 1
const F = (m, d) => `${AÑO_FUTURO}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const lunesDe = (fecha) => {
  const x = new Date(`${fecha}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}

test('caso controlado: el circuito productivo entero, de un extremo al otro', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const n = (x) => (x === null || x === undefined ? x : Number(x))

  const antes = await censoDeTablas(c)
  let cerrada = false
  const OBRA = 'zz-caso-circuito'
  const OBRA2 = 'zz-caso-circuito-otra'
  /** Lo que la oferta congelada valía en el paso 3. Se relee idéntico en el paso 10. */
  let sello = null

  try {
    await c.query('begin')

    await t.test('0 · las once migraciones del circuito están aplicadas en la base viva', async () => {
      const { faltantes, resumen } = await verificarCircuitoAplicado(c)
      assert.deepEqual(faltantes, [],
        `el circuito no está aplicado en esta base — el caso mediría otra cosa:\n  · ${faltantes.join('\n  · ')}`)
      ev('esquema del circuito', resumen)
    })

    const dir = await uno(`select id, rol from perfiles where rol='direccion' limit 1`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
    const permisos = await uno(`select public.ve_economia() as economia, public.es_administracion() as admin`)
    assert.equal(permisos.economia, true, 'el rol asumido no puede congelar ni aceptar')
    assert.equal(permisos.admin, true, 'el rol asumido no puede convertir')
    ev('rol asumido', { rol: dir.rol, ve_economia: permisos.economia, es_administracion: permisos.admin })

    // La base maestra del caso: contrapiso a 2,0 hs/m², costo unitario $30.000 exactos, 100 m² de
    // cómputo con un descuento en negativo, y una plantilla con un paso técnico de 5 días.
    const semilla = await sembrarCasoControlado(c, { obra: OBRA, obra2: OBRA2 })
    const tarea = { id: semilla.tarea }
    const an1 = { id: semilla.analisis }
    const cot = { id: semilla.cotizacion }
    const part = { id: semilla.partida }
    const plantilla = { id: semilla.plantilla }

    await t.test('1 · CÓMPUTO — la cantidad de la partida es la suma del cómputo, y se puede trazar', async () => {
      const est = await uno(`select hh_por_unidad, capacidad_ponderada, cuadrilla_personas,
                                    produccion_diaria_referencia, cuadrilla
                               from estandar_productivo where analisis_id=$1`, [an1.id])
      assert.equal(n(est.hh_por_unidad), 2.0)
      assert.equal(n(est.capacidad_ponderada), 2.2, '1 oficial + 2 ayudantes NO son 3 oficiales')
      assert.equal(n(est.cuadrilla_personas), 3)
      assert.equal(n(est.produccion_diaria_referencia), 8.8, '2,2 × 8 h ÷ 2,0 hs/m²')

      const r = await uno(`select * from computo_de_partida where partida_id=$1`, [part.id])
      assert.equal(n(r.cantidad_partida), 100)
      assert.equal(n(r.cantidad_computada), 100)
      assert.equal(n(r.n_lineas), 3)
      assert.equal(n(r.n_descuentos), 1)
      assert.equal(n(r.diferencia), 0, 'la partida no coincide con su cómputo')
      ev('cómputo', { cantidad_partida: n(r.cantidad_partida), computada: n(r.cantidad_computada),
        lineas: n(r.n_lineas), descuentos: n(r.n_descuentos), diferencia: n(r.diferencia),
        estandar_hs_m2: n(est.hh_por_unidad), cuadrilla: est.cuadrilla,
        produccion_diaria_m2: n(est.produccion_diaria_referencia) })
    })

    await t.test('2 · COTIZAR — la cascada valoriza el cómputo con la matemática del libro', async () => {
      // A MANO: 2,0 hs × $10.000 + 2,0 hr × $4.000 + 4 m³ × $500 = $30.000/m².
      const COSTO_UNITARIO = 2.0 * 10000 + 2.0 * 4000 + 4.0 * 500
      assert.equal(COSTO_UNITARIO, 30000)
      const v = await uno(`select * from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      assert.equal(n(v.costo_unitario), COSTO_UNITARIO, 'el costo unitario no salió del análisis')
      assert.equal(n(v.hs_unitarias), 2.0)
      assert.equal(n(v.subtotal), 100 * COSTO_UNITARIO)
      assert.equal(n(v.hh), 200, '100 m² × 2,0 hs/m²')
      assert.equal(v.sin_analisis, false)

      const cas = await uno(`select * from cotizacion_cascada where id=$1`, [cot.id])
      assert.equal(n(cas.costo_directo), 3000000)
      // El precio, escalón por escalón, calculado A MANO acá y comparado contra el destino: cada
      // porcentaje sobre SU base, que es la corrección que la 4300 vino a hacer.
      const industrial = 3000000 * 1.27
      const financiero = industrial * 0.07 * 0.5
      const sinIva = (industrial * 1.22 * 1.044 + financiero) * 1.012
      const esperado = { gastos_generales: 3000000 * 0.27, costo_industrial: industrial,
        beneficio: industrial * 0.22, financiero, venta_sin_iva: sinIva, venta_final: sinIva * 1.21 }
      for (const [escalon, valor] of Object.entries(esperado)) {
        assert.ok(Math.abs(n(cas[escalon]) - valor) < 0.01, `${escalon}: ${cas[escalon]} ≠ ${valor}`)
      }
      // Y el coeficiente de la empresa, no el 1,4287 que ofrecía el formulario.
      assert.ok(Math.abs(n(cas.venta_final) / n(cas.costo_directo) - COEF_CON_IVA) < 1e-7,
        `el coeficiente con IVA es ${n(cas.venta_final) / n(cas.costo_directo)} y no ${COEF_CON_IVA}`)
      ev('cotización', { costo_directo: n(cas.costo_directo), venta_sin_iva: n(cas.venta_sin_iva),
        venta_final: n(cas.venta_final), coeficiente_sin_iva: n(cas.coeficiente_sin_iva),
        coeficiente_con_iva: n(cas.coeficiente_con_iva), hh_previstas: n(cas.hh_previstas) })
    })

    await t.test('3 · CONGELAR — la composición se copia, la versión queda escrita y no se edita más', async () => {
      const r = (await uno(`select public.congelar_presupuesto($1) as j`, [cot.id])).j
      assert.equal(r.n_partidas, 1)
      assert.equal(r.n_partidas_congeladas, 1)
      assert.equal(r.lineas_composicion, 3, 'la oferta quedó congelada sin las tres líneas de respaldo')
      assert.equal(r.n_sin_analisis, 0)

      const comp = await q(`select tipo, recurso_codigo, cantidad, costo_unitario, moneda
                              from cotizacion_partida_composicion where partida_id=$1 order by orden`, [part.id])
      assert.deepEqual(comp.map((x) => x.tipo), ['mano_obra', 'carga_social', 'material'])
      assert.equal(n(comp[0].costo_unitario), 10000, 'el precio del oficial no se congeló con la oferta')

      const guardada = await uno(`select analisis_version, costo_unitario, hs_unitarias
                                    from cotizacion_partida where id=$1`, [part.id])
      assert.equal(n(guardada.analisis_version), 1, 'no quedó con qué versión del análisis se cotizó')
      assert.equal(n(guardada.costo_unitario), 30000)
      assert.equal(n(guardada.hs_unitarias), 2.0)

      // EL SELLO: esto es lo que el paso 10 relee. Sale del destino, no de lo sembrado.
      const v = await uno(`select costo_unitario, hs_unitarias, subtotal, hh, congelada
                             from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      const cas = await uno(`select venta_sin_iva, venta_final from cotizacion_cascada where id=$1`, [cot.id])
      assert.equal(v.congelada, true)
      sello = { costo_unitario: n(v.costo_unitario), hs_unitarias: n(v.hs_unitarias),
        subtotal: n(v.subtotal), hh: n(v.hh), venta_sin_iva: n(cas.venta_sin_iva),
        venta_final: n(cas.venta_final) }

      // Y el freno: lo congelado no se edita ni por PostgREST ni por SQL directo.
      await c.query('savepoint intento_cantidad')
      await assert.rejects(
        () => c.query(`update cotizacion_partida set cantidad = 999 where id=$1`, [part.id]),
        /congelado/i, 'se pudo cambiar el cómputo de una oferta ya emitida')
      await c.query('rollback to savepoint intento_cantidad')
      const intacta = await uno(`select cantidad from cotizacion_partida where id=$1`, [part.id])
      assert.equal(n(intacta.cantidad), 100)
      ev('congelado', { ...sello, lineas_composicion: r.lineas_composicion,
        analisis_version: n(guardada.analisis_version), update_de_cantidad: 'RECHAZADO' })
    })

    let ejecA = null

    await t.test('4 · CONVERTIR — dos frentes con fecha y dotación, y el tiempo técnico no se comprime', async () => {
      const frentes = [
        { nombre: 'ZZ Frente A', cantidad: 60, inicio: F(9, 1), dotacion: 4, tope: 8 },
        { nombre: 'ZZ Frente B', cantidad: 40, inicio: F(10, 1), dotacion: 4, tope: 8 },
      ]
      const r = (await uno(`select public.convertir_partida_a_plan($1,$2,$3::jsonb,$4,null) as j`,
        [part.id, OBRA, JSON.stringify(frentes), plantilla.id])).j
      assert.equal(r.frentes, 2)
      assert.equal(r.actividades, 4, 'dos frentes × dos pasos')
      assert.equal(r.fechas, 'completas')
      assert.equal(r.sin_dotacion, false)
      assert.equal(n(r.hh_total), 200, 'la conversión no repartió las 200 HH cotizadas')
      assert.equal(r.subcontratada, false)

      const pasos = await q(`select nombre, inicio_plan, fin_plan, dias_plan, hh_plan, cantidad_objetivo,
                                    tiempo_tecnico, metodo_avance, actividad_padre_id, id
                               from obra_actividad
                              where cotizacion_partida_id=$1 and tipo='tarea' order by orden`, [part.id])
      assert.equal(pasos.length, 4)
      for (const p of pasos) assert.ok(p.inicio_plan, `«${p.nombre}» quedó sin fecha de inicio`)

      // LA CANTIDAD SE CONSERVA: los dos frentes suman los 100 m² de la partida.
      const frentesDb = await q(`select nombre, cantidad_objetivo, inicio_plan, fin_plan, dotacion_prevista
                                   from obra_actividad
                                  where cotizacion_partida_id=$1 and rol_estructura='frente' order by orden`, [part.id])
      assert.equal(frentesDb.length, 2)
      assert.equal(frentesDb.reduce((s, f) => s + n(f.cantidad_objetivo), 0), 100,
        'la suma de los frentes no es la cantidad de la partida')
      // Y las HH también: 90 % + 10 % de 120 y de 80.
      assert.equal(pasos.reduce((s, p) => s + n(p.hh_plan), 0), 200, 'se perdieron HH en el reparto')

      ejecA = pasos[0]
      assert.equal(ejecA.nombre, 'ZZ Ejecución')
      assert.equal(n(ejecA.hh_plan), 108, '60 m² × 2,0 hs/m² × 90 %')
      assert.equal(n(ejecA.dias_plan), 4, '108 HH ÷ (4 personas × 8 h) = 3,375 → 4 días')
      assert.equal(ejecA.tiempo_tecnico, false)
      assert.equal(ejecA.metodo_avance, 'cantidad')

      // EL PASO TÉCNICO: 5 días de calendario. Con 12 HH y 4 personas, tratado como trabajo daría 1.
      const fragueA = pasos[1]
      assert.equal(fragueA.nombre, 'ZZ Fragüe')
      assert.equal(n(fragueA.dias_plan), 5, 'el fragüe se comprimió: fraguar cinco días son cinco días')
      assert.equal(dias(fragueA.inicio_plan, fragueA.fin_plan), 4, 'el técnico salteó días de calendario')
      assert.equal(fragueA.tiempo_tecnico, true)
      assert.equal(fragueA.metodo_avance, 'manual')

      const dep = await q(`select 1 from obra_dependencia where destino_id=$1 and origen_id=$2`,
        [fragueA.id, ejecA.id])
      assert.equal(dep.length, 1, 'el fragüe no quedó encadenado a su ejecución')
      ev('conversión', { frentes: r.frentes, actividades: r.actividades, hh_total: n(r.hh_total),
        fechas: r.fechas, suma_cantidades: frentesDb.reduce((s, f) => s + n(f.cantidad_objetivo), 0),
        ejecucion_A: { hh: n(ejecA.hh_plan), dias: n(ejecA.dias_plan), inicio: iso(ejecA.inicio_plan), fin: iso(ejecA.fin_plan) },
        fragüe_A: { hh: n(fragueA.hh_plan), dias_plan: n(fragueA.dias_plan), tiempo_tecnico: fragueA.tiempo_tecnico,
          corridos: dias(fragueA.inicio_plan, fragueA.fin_plan) } })
    })

    let baseline = null
    await t.test('5 · PLANIFICAR — la baseline se sella y queda escrita', async () => {
      await q(`update obra_actividad set inicio_base = inicio_plan, fin_base = fin_plan, sellada_en = now()
                where id=$1`, [ejecA.id])
      const b = await uno(`select inicio_base, fin_base, sellada_en from obra_actividad where id=$1`, [ejecA.id])
      assert.ok(b.sellada_en, 'la actividad quedó sin sellar')
      baseline = { inicio_base: iso(b.inicio_base), fin_base: iso(b.fin_base) }
      assert.equal(baseline.inicio_base, iso(ejecA.inicio_plan))
      ev('baseline sellada', baseline)
    })

    await t.test('6 · EJECUTAR — avance, horas y la improductiva CON causa, separadas', async () => {
      const gente = await q(`select id from personas limit 1`)
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'${F(9, 2)}', 30, 'cantidad')`, [OBRA, ejecA.id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
               values ($1,$2,$3,'${F(9, 2)}','${lunesDe(F(9, 2))}', 90, 'normal', 'zz-caso')`, [OBRA, ejecA.id, gente[0].id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva, causa_desvio)
               values ($1,$2,$3,'${F(9, 2)}','${lunesDe(F(9, 2))}', 15, 'normal', 'zz-caso', true, 'falta_material')`,
      [OBRA, ejecA.id, gente[0].id])

      const ctl = await uno(`select avance_pct, hh_real, hh_improductivas, hh_productivas, productividad,
                                    n_incidencias, cantidad_ejecutada
                               from obra_actividad_control where actividad_id=$1`, [ejecA.id])
      assert.equal(n(ctl.cantidad_ejecutada), 30)
      assert.equal(n(ctl.avance_pct), 50.0, '30 de 60 m²')
      assert.equal(n(ctl.hh_real), 105, 'el total real es lo que se pagó y no se toca')
      assert.equal(n(ctl.hh_improductivas), 15)
      assert.equal(n(ctl.hh_productivas), 90)
      // 30 m² / 90 h PRODUCTIVAS = 0,333 m²/h. Con las 105 totales daría 0,286: la falta de material
      // apareciendo como si la cuadrilla rindiera peor.
      assert.equal(n(ctl.productividad), 0.333, 'la productividad divide por el total de horas')
      // LAS DOS PUERTAS POR LAS QUE ENTRA UNA CAUSA SON DOS Y SE CUENTAN APARTE: `n_incidencias`
      // cuenta PARTES con causa, no horas improductivas con causa. Todavía no hay ningún parte con
      // causa, así que vale 0 — y `obra_causa_desvio` ya ve la hora perdida por la otra puerta. Si
      // alguien fusiona los dos contadores en uno, este par de asserts se pone rojo.
      assert.equal(n(ctl.n_incidencias), 0, 'n_incidencias dejó de contar partes y cuenta horas')
      const causa = await uno(`select hh_improductivas, n_incidencias, familia from obra_causa_desvio
                                where obra_id=$1 and causa_desvio='falta_material'`, [OBRA])
      assert.equal(n(causa.hh_improductivas), 15, 'la hora perdida no llegó al tablero de causas')
      assert.equal(n(causa.n_incidencias), 0)

      // Y una hora perdida sin decir por qué no entra.
      await c.query('savepoint sin_causa')
      await assert.rejects(
        () => c.query(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                         fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva)
                       values ($1,$2,$3,'${F(9, 3)}','${lunesDe(F(9, 3))}', 4, 'normal', 'zz-caso', true)`,
        [OBRA, ejecA.id, gente[0].id]),
        /improductiva_con_causa|check/i, 'dejó cargar una hora perdida sin causa')
      await c.query('rollback to savepoint sin_causa')
      ev('ejecución parcial', { avance_pct: n(ctl.avance_pct), hh_real: n(ctl.hh_real),
        hh_improductivas: n(ctl.hh_improductivas), hh_productivas: n(ctl.hh_productivas),
        productividad_m2_h: n(ctl.productividad), improductiva_sin_causa: 'RECHAZADA',
        causa: { clave: 'falta_material', familia: causa.familia,
          hh_improductivas: n(causa.hh_improductivas), partes_con_causa: n(ctl.n_incidencias) } })
    })

    await t.test('7 · FORECAST — proyecta sobre el ritmo REAL, empeora, y no mueve la baseline', async () => {
      const f = await uno(`select * from obra_actividad_forecast where actividad_id=$1`, [ejecA.id])
      assert.equal(n(f.hh_plan), 108)
      assert.equal(n(f.hh_real), 105)
      assert.equal(n(f.hh_productivas), 90)
      // El ritmo real: 90 h productivas / 30 m² = 3,0 hs/m². El del plan: 108 / 60 = 1,8.
      assert.equal(n(f.rendimiento_real), 3.0)
      assert.equal(n(f.rendimiento_plan), 1.8)
      assert.equal(n(f.cantidad_restante), 30)
      assert.equal(n(f.hh_restantes), 90, '30 m² × 3,0 hs/m²')
      assert.equal(n(f.hh_forecast), 195, '105 reales + 90 que faltan')
      assert.equal(n(f.desvio_hh), 87, '195 − 108')
      assert.ok(n(f.hh_forecast) > n(f.hh_plan),
        'la obra va a un ritmo peor que el plan y el forecast no lo dice')
      assert.match(f.base_del_forecast, /^ritmo real/, 'no declaró que proyectó sobre evidencia')
      assert.match(f.base_del_forecast, /CÁLCULO/)
      assert.equal(n(f.dias_restantes), 3, '90 HH ÷ (4 × 8 h) → 3 días')

      // LA BASELINE NO SE MOVIÓ: el forecast la lee al lado, no la reescribe.
      assert.equal(iso(f.inicio_base), baseline.inicio_base, 'el forecast movió el inicio base')
      assert.equal(iso(f.fin_base), baseline.fin_base, 'el forecast movió el fin base')
      const viva = await uno(`select inicio_base, fin_base from obra_actividad where id=$1`, [ejecA.id])
      assert.equal(iso(viva.fin_base), baseline.fin_base)
      ev('forecast', { hh_plan: n(f.hh_plan), hh_real: n(f.hh_real), hh_forecast: n(f.hh_forecast),
        desvio_hh: n(f.desvio_hh), ritmo_real: n(f.rendimiento_real), ritmo_plan: n(f.rendimiento_plan),
        dias_restantes: n(f.dias_restantes), base: f.base_del_forecast,
        baseline_intacta: { inicio_base: iso(f.inicio_base), fin_base: iso(f.fin_base) } })
    })

    await t.test('8 · CAPTURA — el estándar se aprende de las horas PRODUCTIVAS y de la evidencia', async () => {
      const gente = await q(`select id from personas limit 1`)
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2,'${F(9, 8)}', 30, 'cantidad')`, [OBRA, ejecA.id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
               values ($1,$2,$3,'${F(9, 8)}','${lunesDe(F(9, 8))}', 80, 'normal', 'zz-caso')`, [OBRA, ejecA.id, gente[0].id])

      const v = await uno(`select * from rendimiento_a_capturar where actividad_id=$1`, [ejecA.id])
      assert.ok(v, 'la actividad terminada no aparece como capturable')
      assert.equal(n(v.cantidad), 60, 'tomó el objetivo teniendo los partes')
      assert.equal(v.cantidad_de_la_evidencia, true)
      assert.equal(n(v.hh_real), 185)
      assert.equal(n(v.hh_improductivas), 15)
      assert.equal(n(v.hs_unitarias_observado), 2.833, '170 h productivas / 60 m²')

      // Desde el 27/08/2026 la captura la hace el ciclo de XSAS; `capturar_rendimientos` está
      // retirada para que no queden dos sistemas aprendiendo con reglas distintas. El savepoint es
      // obligatorio: una excepción de Postgres aborta la transacción entera.
      await c.query('savepoint sp_retirada')
      await assert.rejects(
        () => c.query(`select public.capturar_rendimientos($1)`, [OBRA]),
        /retirado/, 'la función vieja sigue pudiendo escribir')
      await c.query('rollback to savepoint sp_retirada')

      const salida = await aprender({ query: (sql, params) => c.query(sql, params) }, { obras: [OBRA] })
      assert.equal(salida.aprendidas, 1, 'capturó el paso técnico o los frentes sin ejecutar')

      const r = await uno(`select * from rendimiento_historico where actividad_id=$1`, [ejecA.id])
      // EL DEFECTO QUE ESTO MIDE: con las 185 horas totales daría 3,083 y la falta de material se
      // metería en el estándar de la tarea para siempre.
      assert.equal(n(r.hs_unitarias), 2.833, 'el rendimiento aprendido incluye horas improductivas')
      assert.equal(n(r.hh_reales), 185)
      assert.equal(n(r.hh_improductivas), 15)
      assert.deepEqual(r.causas, { falta_material: 1 }, 'la causa no viajó con el aprendizaje')
      // LA VENTANA SALE DE LA EVIDENCIA YA OCURRIDA. `actividad_fechas` sólo mira partes e
      // imputaciones con `fecha <= current_date`: un parte fechado la semana que viene no es un
      // hecho todavía. Este caso siembra septiembre del año que viene, así que hoy no hay inicio real —y eso
      // es lo correcto, no un dato perdido: cuando esas fechas lleguen, la ventana aparece sola.
      assert.equal(r.fecha_desde, null, 'tomó como ocurrida una evidencia con fecha futura')
      assert.equal(iso(r.fecha_hasta), F(9, 8), 'el último parte sí queda como corte del hecho')
      await aprender({ query: (sql, params) => c.query(sql, params) }, { obras: [OBRA] })
      const otra = await uno(`select count(*)::int n from rendimiento_historico where actividad_id=$1`, [ejecA.id])
      assert.equal(n(otra.n), 1, 'una segunda corrida duplicó la muestra')
      ev('captura', { cantidad: n(r.cantidad), hh_reales: n(r.hh_reales), hh_improductivas: n(r.hh_improductivas),
        hs_unitarias_aprendidas: n(r.hs_unitarias), causas: r.causas,
        desde: r.fecha_desde, hasta: iso(r.fecha_hasta), filas_tras_la_segunda_corrida: n(otra.n) })
    })

    await t.test('9 · RECOMENDACIÓN — con dos obras hay recomendación, y dice con qué evidencia', async () => {
      const sola = await uno(`select obras, hs_recomendado, lectura from rendimiento_recomendado
                               where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(n(sola.obras), 1)
      assert.equal(sola.hs_recomendado, null, 'presentó un caso único como recomendación')
      assert.match(sola.lectura, /muestra chica/)

      // Segunda obra, misma tarea: 190 h productivas / 60 m² = 3,167. Mediana de {2,833; 3,167} = 3,0.
      await q(`insert into rendimiento_historico (tarea_tipo_id, analisis_id, obra_id, unidad,
                 cantidad, hh_reales, hh_improductivas, fuente)
               values ($1,$2,$3,'m2', 60, 190, 0, 'zz-caso')`, [tarea.id, an1.id, OBRA2])

      const rec = await uno(`select * from rendimiento_recomendado where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(n(rec.muestra), 2)
      assert.equal(n(rec.obras), 2)
      assert.equal(n(rec.hs_analisis), 2.0)
      assert.equal(n(rec.hs_recomendado), 3.0, 'la mediana de las dos muestras')
      assert.notEqual(n(rec.hs_recomendado), n(rec.hs_analisis))
      assert.equal(n(rec.dispersion), 0.236, 'no publicó cuán dispersa es la muestra')
      assert.match(rec.lectura, /2 obras/, 'no explica sobre cuánta evidencia recomienda')

      const pend = await uno(`select sentido, cambio_pct from recomendacion_pendiente where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(pend.sentido, 'la obra tarda más de lo que cotizamos')
      assert.equal(n(pend.cambio_pct), 50.0, '(3,0 − 2,0) / 2,0')
      ev('recomendación', { muestra: n(rec.muestra), obras: n(rec.obras), hs_analisis: n(rec.hs_analisis),
        hs_recomendado: n(rec.hs_recomendado), dispersion: n(rec.dispersion), lectura: rec.lectura,
        sentido: pend.sentido, cambio_pct: n(pend.cambio_pct) })
    })

    // ═══ 10 · ACEPTAR Y VERSIONAR — EL ASSERT QUE DA SENTIDO A TODO ═══════════════════════════
    await t.test('10 · ACEPTAR — versiona el análisis Y la oferta congelada NO se mueve', async () => {
      const nuevo = await uno(`select public.aceptar_recomendacion($1,'ZZ dos obras del caso controlado') as id`,
        [tarea.id])
      assert.ok(nuevo.id)

      const vNueva = await uno(`select version, vigente from analisis where id=$1`, [nuevo.id])
      assert.equal(n(vNueva.version), 2)
      assert.equal(vNueva.vigente, true)
      const vVieja = await uno(`select vigente, vigencia_hasta from analisis where id=$1`, [an1.id])
      assert.equal(vVieja.vigente, false)
      assert.ok(vVieja.vigencia_hasta, 'la versión anterior quedó sin fecha de cierre')

      // La receta escaló ×1,5 en mano de obra y cargas; el material NO: tardar más no gasta más arena.
      const lineas = await q(`select r.tipo, l.cantidad from analisis_linea l
                                join recurso r on r.id=l.recurso_id
                               where l.analisis_id=$1 order by l.orden`, [nuevo.id])
      const porTipo = Object.fromEntries(lineas.map((l) => [l.tipo, n(l.cantidad)]))
      assert.deepEqual(porTipo, { mano_obra: 3.0, carga_social: 3.0, material: 4.0 })
      const costoNuevo = await uno(`select hs_unitarias, costo_directo from analisis_costo where analisis_id=$1`, [nuevo.id])
      assert.equal(n(costoNuevo.hs_unitarias), 3.0)
      assert.equal(n(costoNuevo.costo_directo), 44000, '3×10.000 + 3×4.000 + 4×500')
      const cuadNueva = await q(`select categoria from analisis_cuadrilla where analisis_id=$1`, [nuevo.id])
      assert.equal(cuadNueva.length, 2, 'la cuadrilla tipo no viajó a la versión nueva')

      const d = await uno(`select * from recomendacion_decision where tarea_tipo_id=$1`, [tarea.id])
      assert.equal(d.decision, 'aceptada')
      assert.equal(n(d.hs_vigente), 2.0)
      assert.equal(n(d.hs_recomendado), 3.0)
      assert.equal(n(d.obras), 2)
      assert.equal(d.analisis_nuevo_id, nuevo.id)
      assert.equal(d.decidido_por, dir.id, 'la decisión quedó sin autor')
      assert.match(d.motivo, /caso controlado/)

      // ───── EL ASSERT FINAL ────────────────────────────────────────────────────────────────
      // La oferta del paso 3, releída después de que el sistema aprendió. Si esto se moviera, la
      // empresa no tendría cómo demostrar con qué números cotizó.
      const v = await uno(`select costo_unitario, hs_unitarias, subtotal, hh
                             from cotizacion_partida_valorizada where partida_id=$1`, [part.id])
      const cas = await uno(`select venta_sin_iva, venta_final from cotizacion_cascada where id=$1`, [cot.id])
      const ahora = { costo_unitario: n(v.costo_unitario), hs_unitarias: n(v.hs_unitarias),
        subtotal: n(v.subtotal), hh: n(v.hh), venta_sin_iva: n(cas.venta_sin_iva),
        venta_final: n(cas.venta_final) }
      assert.deepEqual(ahora, sello, 'LA OFERTA CONGELADA CAMBIÓ AL APRENDER: aprender y falsificar un histórico serían la misma operación')

      // EL GRUPO DE CONTROL. Sin esto, «no cambió» podría no estar midiendo nada: si el aprendizaje
      // no llegara a ningún lado, la oferta congelada también quedaría igual y el assert de arriba
      // pasaría en verde por la razón equivocada. Una cotización nueva hecha DESPUÉS de aceptar, con
      // el análisis vigente de hoy, tiene que costar los $44.000 aprendidos. El mundo se movió; la
      // oferta de ayer, no.
      const hoy = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
          pct_gastos_generales, pct_beneficio, pct_iva)
        values ('ZZ Cliente Caso','ZZ Obra posterior','ZZ-CASO-2', current_date,'borrador', 0.27, 0.22, 0.21)
        returning id`)
      const partHoy = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad,
          unidad, tarea_tipo_id, analisis_id, metodo_medicion)
        values ($1, 1, 'ZZ mismo contrapiso, cotizado hoy', 100, 'm2', $2, $3, 'cantidad') returning id`,
      [hoy.id, tarea.id, nuevo.id])
      const vHoy = await uno(`select costo_unitario, hs_unitarias, subtotal, hh
                                from cotizacion_partida_valorizada where partida_id=$1`, [partHoy.id])
      assert.equal(n(vHoy.costo_unitario), 44000, 'el aprendizaje no llegó a las cotizaciones nuevas')
      assert.equal(n(vHoy.hs_unitarias), 3.0)
      assert.equal(n(vHoy.hh), 300, '100 m² × 3,0 hs/m²')
      assert.notEqual(n(vHoy.costo_unitario), sello.costo_unitario)
      ev('control · cotizada HOY con el estándar aprendido',
        { costo_unitario: n(vHoy.costo_unitario), hs_unitarias: n(vHoy.hs_unitarias), hh: n(vHoy.hh) })
      ev('versión nueva', { version: n(vNueva.version), hs_unitarias: n(costoNuevo.hs_unitarias),
        costo_directo: n(costoNuevo.costo_directo), decision: d.decision, autor: d.decidido_por })
      ev('OFERTA CONGELADA, releída', ahora)
      ev('sello del paso 3', sello)
    })

    await c.query('rollback')
    cerrada = true

    await t.test('11 · LIMPIEZA — la base quedó exactamente como estaba', async () => {
      const despues = await censoDeTablas(c)
      const deltas = TABLAS_TOCADAS.filter((tb) => despues[tb] !== antes[tb])
        .map((tb) => `${tb}: ${antes[tb]} → ${despues[tb]}`)
      assert.deepEqual(deltas, [], `el caso dejó filas en la base viva: ${deltas.join(' · ')}`)
      const restos = await uno(`select
          (select count(*) from tarea_tipo where codigo like 'ZZ-%')          as tareas,
          (select count(*) from cotizaciones where numero like 'ZZ-%')        as cotizaciones,
          (select count(*) from obra_canonica where id like 'zz-caso-%')      as obras,
          (select count(*) from registros_hh where fuente_legacy='zz-caso')   as horas,
          (select count(*) from rendimiento_historico where fuente='zz-caso') as rendimientos`)
      assert.deepEqual(Object.values(restos).map(Number), [0, 0, 0, 0, 0],
        `quedaron datos del caso en la base: ${JSON.stringify(restos)}`)
      ev('limpieza', { tablas_verificadas: TABLAS_TOCADAS.length, deltas: deltas.length, restos_zz: restos })
    })
  } finally {
    if (!cerrada) await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
