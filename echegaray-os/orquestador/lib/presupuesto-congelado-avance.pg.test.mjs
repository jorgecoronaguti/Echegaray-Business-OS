// LOS TRES NÚMEROS QUE DECIDEN Y NO TENÍAN GUARDIÁN — auditoría de cierre del 21/08.
//
// 1 · CONGELAR NO CAMBIA LO COTIZADO. `congelar_presupuesto()` pisaba el override tipeado de la
//     partida con el valor del análisis: un presupuesto de 160 HH quedaba congelado en 12. La
//     migración 3300 lo corrige congelando con el MISMO coalesce que usa la vista valorizada.
// 2 · EL SUBCONTRATO APORTA SU PRECIO. El defecto «$5.000.000 → precio de venta $0» se corrigió en
//     la 3100, pero su único test vigilaba el paliativo de pantalla, no la vista. Acá se afirma la
//     vista: subtotal = precio del paquete, HH = 0 (cero es el dato, no un hueco).
// 3 · EL PRECIO DEL SUBCONTRATO ES ECONÓMICO. La 2500 dio GRANT de tabla completa con policy
//     `ve_obra()`: el jefe de obra leía `precio_contratado` por PostgREST. La 3400 lo cierra con
//     GRANT por columna y porteros en `subcontrato_costo`. Se prueba ASUMIENDO el rol.
// 4 · LA FÓRMULA DE `obra_avance` — la del caso Messina (e36b18bc) — no tenía un solo test propio:
//     ponderación por HH, el switch a promedio simple, «sin actividades medidas» sin fechas, y que
//     una subtarea de otra ejecutable no se cuente dos veces.
//
// Todo corre en una transacción que termina en ROLLBACK: no queda ni una fila en la base.
// Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('presupuesto congelado, subcontrato y obra_avance — contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    const jefe = await uno(`select id from perfiles where rol='jefe_obra' limit 1`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])

    const OBRA = 'zz-test-congelado-avance'
    await c.query(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles) values ($1,'ZZ Test', 8, '{1,2,3,4,5}')`, [OBRA])
    const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
      values ('ZZ TEST','ZZ','ZZ-T-1', current_date, 'borrador') returning id`)
    const analisis = await uno(`select id from analisis where vigente limit 1`)

    await t.test('congelar NO cambia lo cotizado: el override tipeado sobrevive', async () => {
      const p = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad, hs_unitarias, costo_unitario, analisis_id)
        values ($1, 1, 'ZZ con override', 100, 'm2', 1.6, 12000, $2) returning id`, [cot.id, analisis.id])
      const antes = await uno(`select hh, subtotal from cotizacion_partida_valorizada where partida_id=$1`, [p.id])
      await q(`select congelar_presupuesto($1)`, [cot.id])
      const despues = await uno(`select hh, subtotal from cotizacion_partida_valorizada where partida_id=$1`, [p.id])
      assert.equal(Number(despues.hh), Number(antes.hh), 'las HH previstas cambiaron al congelar')
      assert.equal(Number(despues.subtotal), Number(antes.subtotal), 'el costo cambió al congelar')
      assert.equal(Number(despues.hh), 160)
    })

    await t.test('el subcontrato de $5.000.000 aporta su precio: subtotal 5M, HH 0 (no NULL)', async () => {
      // ═══ CAMBIO DE REGLA DECLARADO (22/08/2026) ═══
      // Antes esta partida se insertaba en `cot`, que el subtest anterior YA congeló — y T1200
      // ahora rechaza agregar partidas a una oferta congelada (era una de las puertas del
      // auditor). El subcontrato vive en su propia cotización, que es además el caso real:
      // el paquete se cotiza, no se le agrega a una oferta emitida.
      const cot2 = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado)
        values ('ZZ TEST','ZZ','ZZ-T-2', current_date, 'borrador') returning id`)
      const p = await uno(`insert into cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad, subcontratada, precio_subcontrato)
        values ($1, 1, 'ZZ instalación', 1, 'gl', true, 5000000) returning id`, [cot2.id])
      const v = await uno(`select subtotal, hh, sin_precio_de_subcontrato from cotizacion_partida_valorizada where partida_id=$1`, [p.id])
      assert.equal(Number(v.subtotal), 5000000)
      assert.equal(Number(v.hh), 0)
      assert.equal(v.sin_precio_de_subcontrato, false)
      const casc = await uno(`select precio_venta from cotizacion_cascada where id=$1`, [cot2.id])
      assert.ok(Number(casc.precio_venta) >= 5000000, `precio_venta=${casc.precio_venta}: el paquete quedó fuera del precio`)
    })

    await t.test('el precio del subcontrato no sale para quien no ve economía (asumiendo el rol)', { skip: !jefe && 'sin perfil jefe_obra' }, async () => {
      const sub = await uno(`insert into subcontrato (obra_id, proveedor_texto, nombre, precio_contratado)
        values ($1, 'ZZ SRL', 'ZZ paquete', 5000000) returning id`, [OBRA])
      await c.query('savepoint como_jefe')
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: jefe.id, role: 'authenticated' })])
      await c.query(`set local role authenticated`)
      // la sonda que DEBE fallar va en su propio savepoint: el permission denied aborta la
      // transacción y sin esto se lleva puestos los chequeos que siguen
      await c.query('savepoint intento_precio')
      await assert.rejects(
        () => c.query(`select precio_contratado from subcontrato where id=$1`, [sub.id]),
        /permission denied|permiso/i,
        'el jefe leyó precio_contratado directo de la tabla',
      )
      await c.query('rollback to savepoint intento_precio')
      const operativo = await q(`select nombre, proveedor_texto from subcontrato where id=$1`, [sub.id])
      assert.equal(operativo.length, 1, 'el jefe debe seguir viendo el paquete sin la plata')
      const costo = await q(`select * from subcontrato_costo where subcontrato_id=$1`, [sub.id])
      assert.equal(costo.length, 0, 'subcontrato_costo le devolvió filas a un rol sin permiso económico')
      await c.query('rollback to savepoint como_jefe')
      const paraDireccion = await q(`select costo_real from subcontrato_costo where subcontrato_id=$1`, [sub.id])
      assert.equal(paraDireccion.length, 1, 'dirección dejó de ver el costo del paquete')
      assert.equal(Number(paraDireccion[0].costo_real), 5000000)
    })

    await t.test('obra_avance: la fórmula publicada, con y sin fechas de plan', async () => {
      const padre = await uno(`insert into obra_actividad (obra_id, nombre, tipo, rol_estructura, orden, clave, fuente)
        values ($1, 'ZZ Rubro', 'resumen', 'rubro', 9001, 'zz:rubro', 'web') returning id`, [OBRA])
      const t1 = await uno(`insert into obra_actividad (obra_id, nombre, tipo, orden, actividad_padre_id, hh_plan, metodo_avance, pct, cantidad_objetivo, unidad, clave, fuente)
        values ($1, 'ZZ liviana', 'tarea', 9002, $2, 10, 'manual', 100, 1, 'gl', 'zz:t1', 'web') returning id`, [OBRA, padre.id])
      await q(`insert into obra_actividad (obra_id, nombre, tipo, orden, actividad_padre_id, hh_plan, metodo_avance, pct, cantidad_objetivo, unidad, clave, fuente)
        values ($1, 'ZZ pesada', 'tarea', 9003, $2, 30, 'manual', 0, 1, 'gl', 'zz:t2', 'web') returning id`, [OBRA, padre.id])

      const sinFechas = await uno(`select avance_pct, base_del_avance from obra_avance where obra_id=$1`, [OBRA])
      assert.equal(sinFechas.base_del_avance, 'sin actividades medidas', 'sin inicio_plan no hay avance publicable')
      assert.equal(sinFechas.avance_pct, null)

      await q(`update obra_actividad set inicio_plan=current_date, fin_plan=current_date+5 where obra_id=$1 and tipo='tarea'`, [OBRA])
      const conFechas = await uno(`select avance_pct, base_del_avance, n_medidas from obra_avance where obra_id=$1`, [OBRA])
      assert.equal(conFechas.base_del_avance, 'ponderado por HH')
      // 100%·10HH + 0%·30HH sobre 40 HH = 25 — el promedio simple diría 50: la ponderación es la regla
      assert.equal(Number(conFechas.avance_pct), 25)
      assert.equal(Number(conFechas.n_medidas), 2)

      // una subtarea colgada de otra EJECUTABLE no se cuenta dos veces (el filtro del caso Messina)
      await q(`insert into obra_actividad (obra_id, nombre, tipo, orden, actividad_padre_id, hh_plan, metodo_avance, pct, cantidad_objetivo, unidad, inicio_plan, fin_plan, clave, fuente)
        values ($1, 'ZZ subtarea', 'tarea', 9004, $2, 999, 'manual', 100, 1, 'gl', current_date, current_date+5, 'zz:t3', 'web')`, [OBRA, t1.id])
      const conSubtarea = await uno(`select avance_pct, n_actividades from obra_avance where obra_id=$1`, [OBRA])
      assert.equal(Number(conSubtarea.n_actividades), 2, 'la subtarea de una ejecutable entró al denominador')
      assert.equal(Number(conSubtarea.avance_pct), 25, 'la subtarea de una ejecutable movió el avance publicado')
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
