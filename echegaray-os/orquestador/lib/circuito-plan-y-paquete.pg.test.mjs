// LAS HORAS QUE NO PRODUJERON Y EL PLAN CON FECHAS — T4500 · T4600.
//
// Los defectos que mide, todos reproducidos contra el esquema real:
//
//  · la productividad dividía por el TOTAL de horas, así que una espera de equipo bajaba el
//    rendimiento de la tarea como si la cuadrilla hubiera trabajado peor;
//  · una hora improductiva podía cargarse sin causa, y una hora perdida sin causa no se corrige ni
//    se reclama;
//  · la conversión generaba el plan entero SIN UNA SOLA FECHA — y como `obra_avance` sólo cuenta
//    actividades con `inicio_plan`, la obra recién convertida publicaba «sin actividades medidas»;
//  · `duracion_dias` era una isla que no llamaba nadie;
//  · el tiempo técnico se trataba como trabajo comprimible (curar siete días son siete días);
//  · NINGUNA rama miraba `subcontratada`: un paquete de $5.000.000 se convertía en actividades con
//    HH propias repartidas por peso —horas que nadie iba a trabajar— y sin crear el paquete.
//
// Todo en una transacción que aplica los .sql y termina en ROLLBACK.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarMigracionesDelCircuito } from './circuito-productivo-migraciones.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const iso = (d) => new Date(d).toISOString().slice(0, 10)

test('horas improductivas y conversión con fechas', { skip: !hayBase }, async (t) => {
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

    const OBRA = 'zz-test-circuito-plan'
    await q(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles)
             values ($1,'ZZ Circuito', 8, '{1,2,3,4,5}')`, [OBRA])
    const persona = await uno(`select id from personas limit 1`)

    await t.test('T4500 · la productividad se mide sobre las horas PRODUCTIVAS', async () => {
      const act = await uno(`insert into obra_actividad (obra_id, nombre, tipo, orden, unidad,
          cantidad_objetivo, metodo_avance, hh_plan, clave, fuente)
        values ($1,'ZZ tabique','tarea', 8001,'m2', 100, 'cantidad', 80, 'zz:prod', 'web') returning id`, [OBRA])
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo)
               values ($1,$2, current_date - 3, 50, 'cantidad')`, [OBRA, act.id])
      // 10 horas imputadas, de las cuales 2 fueron espera de equipo.
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy)
               values ($1,$2,$3, current_date - 3, current_date - 3, 8, 'normal', 'zz-test')`,
      [OBRA, act.id, persona.id])
      await q(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                 fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva, causa_desvio)
               values ($1,$2,$3, current_date - 3, current_date - 3, 2, 'normal', 'zz-test', true, 'espera_equipo')`,
      [OBRA, act.id, persona.id])

      const r = await uno(`select hh_real, hh_improductivas, hh_productivas, productividad, n_incidencias
                             from obra_actividad_control where actividad_id=$1`, [act.id])
      assert.equal(n(r.hh_real), 10, 'el total real cambió: es lo que se pagó y no se toca')
      assert.equal(n(r.hh_improductivas), 2)
      assert.equal(n(r.hh_productivas), 8)
      // 50 m² / 8 h productivas = 6,25 m²/h. Con el total daría 5,00 — la avería del equipo
      // apareciendo como si la cuadrilla rindiera peor.
      assert.equal(n(r.productividad), 6.25, 'la productividad sigue dividiendo por el total de horas')
    })

    await t.test('T4500 · una hora improductiva sin causa no entra', async () => {
      const act = await uno(`select id from obra_actividad where clave='zz:prod' and obra_id=$1`, [OBRA])
      await c.query('savepoint sin_causa')
      await assert.rejects(
        () => c.query(`insert into registros_hh (obra_canonica_id, actividad_id, persona_id, fecha,
                         fecha_inicio_semana, horas, tipo_hora, fuente_legacy, improductiva)
                       values ($1,$2,$3, current_date, current_date, 3, 'normal', 'zz-test', true)`,
        [OBRA, act.id, persona.id]),
        /improductiva_con_causa|check/i,
        'dejó cargar una hora perdida sin decir por qué')
      await c.query('rollback to savepoint sin_causa')
    })

    await t.test('T4500 · obra_causa_desvio suma las dos puertas por las que entra una causa', async () => {
      const act = await uno(`select id from obra_actividad where clave='zz:prod' and obra_id=$1`, [OBRA])
      await q(`insert into obra_ejecucion (obra_id, actividad_id, fecha, cantidad, metodo, causa_desvio)
               values ($1,$2, current_date - 1, 5, 'cantidad', 'espera_equipo')`, [OBRA, act.id])
      const r = await uno(`select * from obra_causa_desvio where obra_id=$1 and causa_desvio='espera_equipo'`, [OBRA])
      assert.equal(n(r.hh_improductivas), 2)
      assert.equal(n(r.n_incidencias), 1)
      assert.equal(r.familia, 'equipos', 'la familia es lo que separa lo nuestro de lo reclamable')
    })

    // ── la conversión ───────────────────────────────────────────────────────────────────────────
    const tarea = await uno(`insert into tarea_tipo (codigo, nombre, unidad, metodo_medicion)
                             values ('ZZ-CONV','ZZ Tabique HA','m2','pasos') returning id`)
    const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
                           values ('ZZ','ZZ conv','ZZ-CV-1', current_date, 'adjudicada') returning id`)
    const plantilla = await uno(`select id from plantilla_secuencia where nombre='Hormigón vertical'`)

    /** Una partida propia de 100 m² a 1 hs/m² → 100 HH. */
    async function partidaPropia(orden, codigo) {
      return uno(`insert into cotizacion_partida (cotizacion_id, orden, rubro, codigo, descripcion,
          cantidad, unidad, tarea_tipo_id, hs_unitarias, costo_unitario, metodo_medicion)
        values ($1,$2,'ZZ Estructura',$3,'ZZ tabique de hormigón', 100, 'm2', $4, 1.0, 5000, 'pasos') returning id`,
      [cot.id, orden, codigo, tarea.id])
    }

    await t.test('T4600 · un frente SIN fecha de inicio no genera NADA', async () => {
      const part = await partidaPropia(1, 'ZZ-P1')
      await c.query('savepoint sin_fecha')
      await assert.rejects(
        () => c.query(`select public.convertir_partida_a_plan($1, $2, $3::jsonb, null, null)`,
          [part.id, OBRA, JSON.stringify([{ nombre: 'Frente único', cantidad: 100 }])]),
        /no tiene fecha de inicio/i,
        'generó actividades que parecen planificadas y no lo están')
      await c.query('rollback to savepoint sin_fecha')
      const creadas = await q(`select id from obra_actividad where cotizacion_partida_id=$1`, [part.id])
      assert.equal(creadas.length, 0, 'quedaron actividades a medio crear')
    })

    await t.test('T4600 · con dotación, las fechas se encadenan y el tiempo técnico no se comprime', async () => {
      const part = await uno(`select id from cotizacion_partida where codigo='ZZ-P1'`)
      const r = (await uno(`select public.convertir_partida_a_plan($1,$2,$3::jsonb,$4,null) as j`,
        [part.id, OBRA, JSON.stringify([{ nombre: 'Eje 1-4', cantidad: 100, inicio: '2026-09-01', dotacion: 5, tope: 8 }]),
          plantilla.id])).j
      assert.equal(r.actividades, 5, 'la plantilla Hormigón vertical tiene cinco pasos')
      assert.equal(r.fechas, 'completas')
      assert.equal(r.sin_dotacion, false)
      assert.equal(n(r.hh_total), 100)

      const pasos = await q(`select nombre, inicio_plan, fin_plan, dias_plan, hh_plan, metodo_avance
                               from obra_actividad
                              where cotizacion_partida_id=$1 and tipo='tarea' order by orden`, [part.id])
      assert.equal(pasos.length, 5)
      for (const p of pasos) assert.ok(p.inicio_plan, `«${p.nombre}» quedó sin fecha de inicio`)

      // Los cuatro pasos de trabajo: 100 HH repartidas 10/30/25/25 sobre 5 personas × 8 h = 40 HH/día
      // → un día cada uno. Y encadenados: cada uno empieza DESPUÉS del anterior.
      const trabajo = pasos.slice(0, 4)
      for (const p of trabajo) {
        assert.ok(p.fin_plan, `«${p.nombre}» quedó sin fin teniendo dotación`)
        assert.equal(n(p.dias_plan), 1, `«${p.nombre}» duró ${p.dias_plan} días`)
      }
      for (let i = 1; i < trabajo.length; i += 1) {
        assert.ok(new Date(trabajo[i].inicio_plan) > new Date(trabajo[i - 1].fin_plan),
          `«${trabajo[i].nombre}» empieza antes de que termine «${trabajo[i - 1].nombre}»`)
      }

      // El curado: 7 días TÉCNICOS, de calendario. Fin − inicio = 6 días corridos, sábado incluido.
      const curado = pasos[4]
      assert.equal(n(curado.dias_plan), 7)
      assert.equal(dias(curado.inicio_plan, curado.fin_plan), 6,
        'el tiempo técnico se comprimió como si fuera trabajo: curar siete días son siete días')
      assert.equal(curado.metodo_avance, 'manual')

      // El contenedor del frente lleva el inicio, el fin de la cadena, la dotación y el tope.
      const frente = await uno(`select inicio_plan, fin_plan, dotacion_prevista, tope_frente, rol_estructura
                                  from obra_actividad
                                 where cotizacion_partida_id=$1 and tipo='resumen' and rol_estructura='frente'`, [part.id])
      assert.equal(iso(frente.inicio_plan), '2026-09-01')
      assert.equal(n(frente.dotacion_prevista), 5)
      assert.equal(n(frente.tope_frente), 8)
      assert.equal(iso(frente.fin_plan), iso(curado.fin_plan))

      // Y la obra deja de publicar «sin actividades medidas» con el plan entero cargado.
      const avance = await uno(`select n_medidas from obra_avance where obra_id=$1`, [OBRA])
      assert.ok(n(avance.n_medidas) >= 5, `obra_avance sólo cuenta ${avance.n_medidas} actividades con fecha`)
    })

    await t.test('T4600 · sin dotación el plan sale con inicio y sin fin, y lo DICE', async () => {
      const part = await partidaPropia(2, 'ZZ-P2')
      const r = (await uno(`select public.convertir_partida_a_plan($1,$2,$3::jsonb,$4,null) as j`,
        [part.id, OBRA, JSON.stringify([{ nombre: 'Eje 5-8', cantidad: 100, inicio: '2026-10-01' }]),
          plantilla.id])).j
      assert.equal(r.sin_dotacion, true)
      assert.match(r.fechas, /parciales/, 'no declaró que el plan salió a medias')

      const pasos = await q(`select nombre, inicio_plan, fin_plan, dias_plan from obra_actividad
                              where cotizacion_partida_id=$1 and tipo='tarea' order by orden`, [part.id])
      assert.equal(iso(pasos[0].inicio_plan), '2026-10-01', 'el primer paso perdió el inicio')
      assert.equal(pasos[0].fin_plan, null, 'inventó un fin sin saber con cuánta gente')
      assert.equal(pasos[0].dias_plan, null)
      assert.equal(pasos[1].inicio_plan, null, 'encadenó una fecha sobre un fin que no existe')
      // El paso técnico conserva su duración: no depende de la dotación.
      assert.equal(n(pasos[4].dias_plan), 7)
    })

    await t.test('T4600 · una partida SUBCONTRATADA crea el paquete y no infla HH propias', async () => {
      const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, rubro, codigo, descripcion,
          cantidad, unidad, subcontratada, precio_subcontrato)
        values ($1, 3, 'ZZ Instalaciones','ZZ-SUB','ZZ instalación eléctrica', 1, 'gl', true, 5000000) returning id`,
      [cot.id])

      const r = (await uno(`select public.convertir_partida_a_plan($1,$2,$3::jsonb,null,null) as j`,
        [part.id, OBRA, JSON.stringify([{ nombre: 'Frente único', cantidad: 1, inicio: '2026-11-02' }])])).j

      assert.equal(r.subcontratada, true)
      assert.equal(r.actividades, 1)
      assert.equal(r.hh_total, null, 'le repartió HH propias a un paquete que ejecuta un tercero')
      assert.equal(r.sin_analisis, false, 'lo contó como deuda de análisis: no le falta análisis, es un paquete')
      assert.ok(r.subcontrato_id, 'no creó el paquete')
      assert.equal(r.paquete_sin_precio, false, 'el precio de la partida no llegó al paquete')

      const act = await uno(`select id, hh_plan, metodo_avance, cantidad_objetivo, inicio_plan
                               from obra_actividad where cotizacion_partida_id=$1 and tipo='tarea'`, [part.id])
      assert.equal(act.hh_plan, null, 'hh_plan en 0 diría que la tarea no lleva trabajo; NULL dice que no es nuestro')
      assert.equal(act.metodo_avance, 'cantidad')
      assert.equal(n(act.cantidad_objetivo), 1, 'la cantidad no se conservó')
      assert.equal(iso(act.inicio_plan), '2026-11-02')

      const sub = await uno(`select nombre, estado, cantidad, unidad, obra_id, proveedor_texto
                               from subcontrato where id=$1`, [r.subcontrato_id])
      assert.equal(sub.estado, 'previsto')
      assert.equal(sub.obra_id, OBRA)
      assert.equal(n(sub.cantidad), 1)
      assert.equal(sub.proveedor_texto, null, 'inventó un proveedor para que cerrara el CHECK')

      const alcance = await q(`select actividad_id, cantidad from subcontrato_alcance where subcontrato_id=$1`,
        [r.subcontrato_id])
      assert.equal(alcance.length, 1, 'el paquete quedó sin alcance: no se sabe qué cubre')
      assert.equal(alcance[0].actividad_id, act.id)

      // El precio entra por la única puerta que hay (subcontrato_fijar_precio, SECURITY DEFINER).
      const costo = await uno(`select precio_contratado from subcontrato_costo where subcontrato_id=$1`,
        [r.subcontrato_id])
      assert.equal(n(costo.precio_contratado), 5000000)
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
