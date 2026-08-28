// LA MIGRACIÓN DE LAS SEIS PARTIDAS METÁLICAS, CORRIDA CONTRA LA BASE REAL Y DESHECHA.
//
// El archivo `.sql` se ejecuta tal cual está en el repo dentro de una transacción que termina en
// ROLLBACK: es la única forma de probar lo que hace SOBRE LOS DATOS QUE HAY —199 tareas, 9
// mediciones importadas— y no sobre un fixture que dice lo que uno quiere oír.
//
// Los dos defectos que estas pruebas atrapan:
//
//  1. **una partida publica un rendimiento distinto del que midió**. Es el único número que estas
//     seis partidas afirman, y afirmarlo mal es cotizar mal.
//  2. **el control dice «el análisis acierta» cuando se comparó consigo mismo**. Antes de esta
//     migración `rendimiento_contra_lo_cotizado` decía exactamente eso de las seis, con 0,0% de
//     desvío, porque el análisis nació de las mismas observaciones. Un control que sólo puede decir
//     que sí no es un control.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from './db.mjs'

const CODIGOS = ['T1180', 'T1181', 'T1182', 'T1183', 'T1184', 'T1185']
const SQL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations',
  '20260828T1500_lo_que_ya_mediamos_de_estructura_metalica_se_puede_cotizar.sql')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Corre la migración en una transacción, deja mirar, y deshace todo. */
async function enEnsayo(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(readFileSync(SQL, 'utf8'))
    return await fn(c)
  } finally {
    await c.query('rollback')
    c.release()
  }
}

test('las seis partidas nacen con la ficha entera y sin un solo precio inventado', { skip: !hayBase }, async () => {
  await enEnsayo(async (c) => {
    const { rows } = await c.query(
      `select tt.codigo, tt.unidad, tt.division, tt.metodo_medicion, tt.origen, tt.descripcion,
              ac.hs_unitarias, ac.tiene_mano_obra, ac.tiene_cargas_sociales,
              ac.costo_materiales, ac.costo_equipos
         from public.tarea_tipo tt
         join public.analisis a on a.tarea_tipo_id = tt.id and a.vigente
         join public.analisis_costo ac on ac.analisis_id = a.id
        where tt.codigo = any($1) order by tt.codigo`, [CODIGOS])
    assert.equal(rows.length, 6)
    for (const r of rows) {
      assert.equal(r.unidad, 'UN', `${r.codigo}: la unidad es la que se midió`)
      assert.equal(r.division, 'ESTRUCTURA METALICA', `${r.codigo}: sin rubro no agrupa en ningún lado`)
      assert.equal(r.metodo_medicion, 'cantidad')
      assert.match(r.origen, /partida creada por el OS/, `${r.codigo}: no dice quién la creó`)
      assert.match(r.descripcion, /EXCLUYE Y NO ESTÁ COTIZADO/, `${r.codigo}: el hueco no está declarado`)
      assert.match(r.descripcion, /LÍMITE DECLARADO/, `${r.codigo}: sin límite conocido`)
      assert.ok(Number(r.hs_unitarias) > 0, `${r.codigo}: sin rendimiento no aporta HH`)
      assert.equal(r.tiene_mano_obra, true)
      // Una tarea con mano de obra y sin carga social está subcosteada alrededor del 100% en ese
      // componente: es el defecto que traían 33 de las 223 tareas del libro original.
      assert.equal(r.tiene_cargas_sociales, true, `${r.codigo}: mano de obra sin carga social`)
      // El precio del material NO se inventa para poder crear la partida.
      assert.equal(r.costo_materiales, null, `${r.codigo}: apareció un material que nadie midió`)
      assert.equal(r.costo_equipos, null, `${r.codigo}: apareció un equipo que nadie midió`)
    }
  })
})

test('el rendimiento que publica cada partida es el que midieron sus observaciones', { skip: !hayBase }, async () => {
  await enEnsayo(async (c) => {
    const { rows } = await c.query(
      `select tt.codigo, ac.hs_unitarias,
              (select count(*) from public.rendimiento_historico rh where rh.tarea_tipo_id = tt.id) muestras,
              (select avg(rh.hs_unitarias) from public.rendimiento_historico rh where rh.tarea_tipo_id = tt.id) medido
         from public.tarea_tipo tt
         join public.analisis a on a.tarea_tipo_id = tt.id and a.vigente
         join public.analisis_costo ac on ac.analisis_id = a.id
        where tt.codigo = any($1) order by tt.codigo`, [CODIGOS])
    assert.equal(rows.length, 6)
    for (const r of rows) {
      assert.ok(Number(r.muestras) > 0, `${r.codigo}: publica un rendimiento sin ninguna medición detrás`)
      // 0,01 h de tolerancia: el reparto entre oficial y ayudante se escribe con tres decimales y
      // su suma puede caer una milésima al lado del promedio observado. Más que eso ya es otro número.
      assert.ok(Math.abs(Number(r.hs_unitarias) - Number(r.medido)) < 0.01,
        `${r.codigo}: publica ${r.hs_unitarias} h/un y sus observaciones midieron ${Number(r.medido).toFixed(3)}`)
    }
  })
})

test('las nueve mediciones de «Horas Hombre.xlsm» dejan de estar sueltas', { skip: !hayBase }, async () => {
  await enEnsayo(async (c) => {
    const { rows: [r] } = await c.query(
      `select count(*) filter (where tarea_tipo_id is null)     as sueltas,
              count(*) filter (where tarea_tipo_id is not null) as asignadas,
              count(*) filter (where analisis_id is null)       as sin_analisis,
              count(*) filter (where condiciones like '%ASIGNADA A T118%') as con_motivo
         from public.rendimiento_historico where origen like 'Horas Hombre.xlsm%'`)
    assert.equal(Number(r.asignadas), 9)
    assert.equal(Number(r.sueltas), 0, 'quedó una medición sin la etiqueta que la vuelve utilizable')
    assert.equal(Number(r.sin_analisis), 0, 'una medición sin análisis no se puede contrastar contra lo cotizado')
    assert.equal(Number(r.con_motivo), 9, 'una asignación sin motivo escrito no se puede discutir')
  })
})

test('el control NO puede decir que el análisis acierta cuando se comparó consigo mismo', { skip: !hayBase }, async () => {
  await enEnsayo(async (c) => {
    const { rows } = await c.query(
      `select codigo, obras, desvio_pct, lectura from public.rendimiento_contra_lo_cotizado
        where codigo = any($1) order by codigo`, [CODIGOS])
    assert.equal(rows.length, 6)
    for (const r of rows) {
      // El desvío se sigue publicando —es un número y es cierto—; lo que no se publica es la
      // conclusión. Sin esta rama la lectura era «el análisis acierta», seis veces, con 0,0%.
      assert.ok(Number(r.obras) <= 1, `${r.codigo}: la muestra creció y este test ya no mide lo que decía`)
      assert.equal(r.lectura, 'muestra chica: es un dato, no una lectura',
        `${r.codigo}: sacó una conclusión de la única medición que produjo su análisis`)
      assert.notEqual(r.desvio_pct, null, `${r.codigo}: el desvío tiene que seguir a la vista`)
    }
  })
})

test('el gate de promoción sigue sin promover: una obra no hace una regla', { skip: !hayBase }, async () => {
  await enEnsayo(async (c) => {
    const { rows } = await c.query(
      `select tt.codigo, count(distinct coalesce(rh.obra_id, 'sin-obra')) obras
         from public.tarea_tipo tt join public.rendimiento_historico rh on rh.tarea_tipo_id = tt.id
        where tt.codigo = any($1) group by 1`, [CODIGOS])
    assert.equal(rows.length, 6)
    // El gate exige madurez D (varias obras distintas). Con una sola obra por proceso no promueve
    // nada, y eso NO es una falla: es lo que dice la evidencia. Lo que cambió es que ahora las
    // mediciones están donde tienen que estar, y la segunda obra las activa sola.
    for (const r of rows) assert.equal(Number(r.obras), 1, `${r.codigo}: más de una obra ya cambia el gate`)
  })
})
