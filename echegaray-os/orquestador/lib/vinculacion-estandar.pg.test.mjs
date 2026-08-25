// LA VINCULACIÓN ACTIVIDAD ↔ ESTÁNDAR — T6100 · T6110.
//
// Cada test de acá reproduce un DEFECTO concreto: si se revierte la migración que lo arregla, el
// test se pone rojo. No acompañan al código, lo miden.
//
//   · la actividad importada del tracker no decía que estaba SIN VINCULAR — no había estado;
//   · una fila de resumen y un tiempo técnico aparecían como deuda de vinculación que nadie puede
//     saldar (un fragüe no tiene rendimiento);
//   · `analisis_id` y `tarea_tipo_id` podían apuntar a tareas distintas y la pantalla lo mostraba
//     como «vinculada», midiendo el rendimiento contra el estándar de otra tarea;
//   · el estándar pisaba el `hh_plan` ya cargado en la obra;
//   · el estándar convertía m² a m³ sin decirlo;
//   · y la sugerencia se aplicaba con un empate, que es elegir por la persona.
//
// Todo corre en UNA transacción que aplica los .sql del frente y termina en ROLLBACK: la base viva
// no se toca. Sin base, se salta — no se inventa un verde.
//
// Los datos son SEMBRADOS, no leídos del mundo: un test que afirma «hay 350 actividades sin
// vincular» se pone rojo el día que alguien vincule una, sin que cambie una línea de código.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarMigracionesDeVinculacion } from './vinculacion-migraciones.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const OBRA = 'zz-test-vinculacion'

/** Siembra la obra, tres tareas tipo, un análisis con 2,5 hs/m² y las actividades de cada caso. */
async function sembrar(q) {
  await q(`insert into obra_canonica (id, nombre, estado) values ($1, 'ZZ Vinculación', 'activa')`, [OBRA])
  const tt = {}
  for (const [clave, codigo, nombre, unidad] of [
    ['tabique', 'ZZ-TT-TAB', 'ZZ Tabique de yeso', 'm2'],
    ['contra1', 'ZZ-TT-CO1', 'ZZ Contrapiso', 'm3'],
    ['contra2', 'ZZ-TT-CO2', 'ZZ Contrapiso', 'm3'],
  ]) {
    const r = await q(
      `insert into tarea_tipo (codigo, nombre, unidad, activo) values ($1,$2,$3,true) returning id`,
      [codigo, nombre, unidad])
    tt[clave] = r[0].id
  }
  // El análisis con horas: `hs_unitarias` de analisis_costo es la suma de las cantidades de las
  // líneas de mano de obra. Sin precio: el costo no interesa acá, las horas sí.
  const an = (await q(
    `insert into analisis (tarea_tipo_id, version, vigente, variante) values ($1, 1, true, null) returning id`,
    [tt.tabique]))[0].id
  const rec = (await q(
    `insert into recurso (codigo, nombre, unidad, tipo) values ('ZZ-OF','ZZ Oficial','hs','mano_obra') returning id`))[0].id
  await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad) values ($1,$2,2.5)`, [an, rec])
  return { tt, an }
}

async function actividad(q, campos) {
  const base = {
    obra_id: OBRA, tipo: 'tarea', tiempo_tecnico: false, unidad: null, cantidad_objetivo: null,
    hh_plan: null, tarea_tipo_id: null, analisis_id: null, ...campos,
  }
  const r = await q(
    `insert into obra_actividad (obra_id, nombre, clave, tipo, tiempo_tecnico, unidad,
       cantidad_objetivo, hh_plan, tarea_tipo_id, analisis_id)
     values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [base.obra_id, base.nombre, base.tipo, base.tiempo_tecnico, base.unidad,
      base.cantidad_objetivo, base.hh_plan, base.tarea_tipo_id, base.analisis_id])
  return r[0].id
}

test('vinculación actividad ↔ estándar — T6100 y T6110 aplicadas en transacción', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    await aplicarMigracionesDeVinculacion(c)
    const { tt, an } = await sembrar(q)

    await t.test('T6100 · el default es SIN VINCULAR, y se ve', async () => {
      // ÉSTE es el defecto: 350 actividades reales sin `tarea_tipo_id` y ninguna manera de saberlo
      // desde el producto. Sin la vista, esta consulta no existe.
      const id = await actividad(q, { nombre: 'ZZ Muro G 2/3 de 5m' })
      const v = await uno(`select estado, motivo_sin_sugerencia from obra_actividad_vinculacion where actividad_id=$1`, [id])
      assert.equal(v.estado, 'sin_vincular')
      assert.match(v.motivo_sin_sugerencia, /no está vinculada a ninguna tarea tipo/)
    })

    await t.test('T6100 · un resumen y un tiempo técnico NO son deuda de vinculación', async () => {
      // Un fragüe de hormigón no tiene rendimiento: consume días, no horas hombre. Pintarlo de
      // «sin vincular» llena la pantalla de deuda que nadie puede saldar, y así muere un control.
      const resumen = await actividad(q, { nombre: 'ZZ GALPON 2', tipo: 'resumen' })
      const tecnico = await actividad(q, { nombre: 'ZZ Curado', tiempo_tecnico: true })
      for (const id of [resumen, tecnico]) {
        const v = await uno('select estado from obra_actividad_vinculacion where actividad_id=$1', [id])
        assert.equal(v.estado, 'no_aplica', `la actividad ${id} debería quedar fuera del control`)
      }
    })

    await t.test('T6100 · con tarea tipo pero sin análisis es SIN ANÁLISIS, no vinculada', async () => {
      const id = await actividad(q, { nombre: 'ZZ Tabique A', tarea_tipo_id: tt.tabique })
      const v = await uno('select estado, motivo_sin_sugerencia from obra_actividad_vinculacion where actividad_id=$1', [id])
      assert.equal(v.estado, 'sin_analisis')
      assert.match(v.motivo_sin_sugerencia, /con qué análisis se mide/)
    })

    await t.test('T6100 · vinculada trae hs/unidad y sugiere hh_plan con la cantidad', async () => {
      const id = await actividad(q, {
        nombre: 'ZZ Tabique B', tarea_tipo_id: tt.tabique, analisis_id: an,
        unidad: 'm2', cantidad_objetivo: 100,
      })
      const v = await uno(`select estado, hh_por_unidad, hh_plan_sugerida, motivo_sin_sugerencia
                           from obra_actividad_vinculacion where actividad_id=$1`, [id])
      assert.equal(v.estado, 'vinculada')
      assert.equal(Number(v.hh_por_unidad), 2.5)
      assert.equal(Number(v.hh_plan_sugerida), 250)
      assert.equal(v.motivo_sin_sugerencia, null)
    })

    await t.test('T6100 · el estándar NO pisa el hh_plan que ya cargó la obra', async () => {
      // El defecto que esto atrapa es de una línea: quitar el `when a.hh_plan is not null then null`
      // de la vista hace que la pantalla ofrezca reemplazar un plan real por el teórico.
      const id = await actividad(q, {
        nombre: 'ZZ Tabique C', tarea_tipo_id: tt.tabique, analisis_id: an,
        unidad: 'm2', cantidad_objetivo: 100, hh_plan: 999,
      })
      const v = await uno('select hh_plan, hh_plan_sugerida from obra_actividad_vinculacion where actividad_id=$1', [id])
      assert.equal(Number(v.hh_plan), 999)
      assert.equal(v.hh_plan_sugerida, null, 'sugirió pisar un hh_plan ya cargado')
    })

    await t.test('T6100 · m² y m³ no se convierten: se declara y no se sugiere', async () => {
      const id = await actividad(q, {
        nombre: 'ZZ Tabique D', tarea_tipo_id: tt.tabique, analisis_id: an,
        unidad: 'm3', cantidad_objetivo: 100,
      })
      const v = await uno('select hh_plan_sugerida, motivo_sin_sugerencia from obra_actividad_vinculacion where actividad_id=$1', [id])
      assert.equal(v.hh_plan_sugerida, null, 'convirtió m³ a m² sin factor')
      assert.match(v.motivo_sin_sugerencia, /no se convierte/)
    })

    await t.test('T6100 · el vínculo no puede apuntar a dos tareas distintas', async () => {
      const id = await actividad(q, { nombre: 'ZZ Tabique E' })
      // SAVEPOINT: un error dentro de una transacción la aborta entera y todo lo que siga responde
      // «current transaction is aborted». Sin esto, el test que EXIGE el rechazo hace fallar a los
      // cuatro que vienen después y el rojo apunta al lugar equivocado.
      await c.query('savepoint sp_vinculo')
      await assert.rejects(
        () => c.query('update obra_actividad set tarea_tipo_id=$1, analisis_id=$2 where id=$3',
          [tt.contra1, an, id]),
        /dos tareas distintas/,
        'dejó vincular una actividad al análisis de otra tarea tipo')
      await c.query('rollback to savepoint sp_vinculo')
    })

    await t.test('T6100 · con análisis y sin tarea tipo, el análisis la completa', async () => {
      const id = await actividad(q, { nombre: 'ZZ Tabique F' })
      await c.query('update obra_actividad set analisis_id=$1 where id=$2', [an, id])
      const v = await uno('select estado, tarea_tipo_id from obra_actividad_vinculacion where actividad_id=$1', [id])
      assert.equal(v.tarea_tipo_id, tt.tabique)
      assert.equal(v.estado, 'vinculada')
    })

    await t.test('T6110 · el nombre exacto sugiere, con su evidencia y su análisis', async () => {
      const id = await actividad(q, { nombre: 'ZZ TABIQUE DE YESO' })  // mayúsculas: normaliza igual
      const s = await uno('select * from obra_actividad_sugerencia_estandar where actividad_id=$1', [id])
      assert.ok(s, 'no sugirió nada teniendo el mismo nombre')
      assert.equal(s.tarea_tipo_id, tt.tabique)
      assert.equal(s.evidencia, 'nombre_exacto')
      assert.equal(s.analisis_sugerido_id, an)
      assert.equal(Number(s.hh_por_unidad_sugerida), 2.5)
    })

    await t.test('T6110 · un empate NO se sugiere: elegir sería decidir por la persona', async () => {
      const id = await actividad(q, { nombre: 'ZZ Contrapiso' })
      const s = await q('select * from obra_actividad_sugerencia_estandar where actividad_id=$1', [id])
      assert.equal(s.length, 0, `sugirió ${s.length} candidatas con el mismo nombre: eso es adivinar`)
    })

    await t.test('T6110 · a una actividad ya vinculada no se le sugiere pisarla', async () => {
      const id = await actividad(q, {
        nombre: 'ZZ Tabique de yeso', tarea_tipo_id: tt.contra1,
      })
      const s = await q('select * from obra_actividad_sugerencia_estandar where actividad_id=$1', [id])
      assert.equal(s.length, 0, 'ofreció reemplazar una tarea tipo ya elegida')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
