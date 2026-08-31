// LA ACTIVACIÓN Y EL ROLLBACK, CONTRA LA BASE DE VERDAD.
//
// Los invariantes de este archivo no se pueden probar con objetos en memoria: son propiedades de la
// base — el CHECK que impide que rija una regla de una sola obra, la única que evita activar dos
// veces la misma versión, y que volver atrás deje rigiendo EXACTAMENTE lo de antes. Todo corre
// dentro de una transacción que se deshace y las claves llevan prefijo ZZ, para que un rollback
// fallido se vea a simple vista.
//
// El test que más costó: «la versión 2 archiva la 1 entera». La primera versión de este módulo lo
// fallaba porque guardar la medición nueva pisaba la regla vigente antes de archivarla — y el
// rollback volvía a donde ya estaba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { candidato } from './promocion.mjs'
import { evaluarGobernanza, ventana, ESTADO } from './gobernanza.mjs'
import { regresionHoldOut } from './regresion-aprendizaje.mjs'
import { guardar, activar, revertir, activos, historial, vigenteDe } from './activacion.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const HOY = new Date('2026-08-30T00:00:00Z')
const CINCO = ['zz-a', 'zz-b', 'zz-c', 'zz-d', 'zz-e']

function armar({ clave, valores, obras, fecha = '2026-08-01' }) {
  const muestras = obras.map((o, i) => ({ id: `${o}#${i}`, obra: o, valor: valores[i], base: valores[i] * 3 }))
  const c = candidato({
    clave, afirmacion: `${clave} rinde {media}`, unidad: 'h/m2', valores, obras, fecha,
    evidencia: muestras.map((m) => ({ obra: m.obra, desde: fecha, hasta: fecha, caso: m.id })),
  })
  c.ventana = ventana(c.evidencia)
  const reg = regresionHoldOut({ muestras })
  return { candidato: c, regresion: reg, gobernanza: evaluarGobernanza({ candidato: c, regresion: reg, hoy: HOY }) }
}

test('un aprendizaje se activa con gobernanza y vuelve al estado exacto anterior', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const db = { query: (sql, p) => c.query(sql, p) }
  try {
    await c.query('begin')

    await t.test('NEGATIVO: la base no deja regir una regla de una sola obra', async () => {
      await c.query('savepoint piso')
      await c.query(`insert into public.aprendizaje_candidato (clave, afirmacion) values ('ZZ-piso','x')`)
      // Cada intento va en su propio savepoint: una violación aborta la transacción entera, y sin
      // esto el segundo intento fallaría por «transaction is aborted» y no por el CHECK — que es
      // justamente lo que se quiere probar.
      const rechaza = async (regla) => {
        await c.query('savepoint intento')
        await assert.rejects(
          () => c.query(`insert into public.aprendizaje_version (clave, version, accion, regla_nueva, por_que)
            values ('ZZ-piso', 1, 'ACTIVACION', $1::jsonb, 'a mano')`, [regla]),
          /aprendizaje_version_piso_ck/)
        await c.query('rollback to savepoint intento')
      }
      await rechaza('{"valor":1,"sample_count":1,"obras_distintas":1,"dispersion":0.1,"clase":"D"}')
      // Tampoco una clase C, por más obras que traiga.
      await rechaza('{"valor":1,"sample_count":9,"obras_distintas":5,"dispersion":0.1,"clase":"C"}')
      // Ni una sin dispersión calculable: desconocida no es cero.
      await rechaza('{"valor":1,"sample_count":9,"obras_distintas":5,"dispersion":null,"clase":"D"}')
      await c.query('rollback to savepoint piso')
    })

    await t.test('NEGATIVO: CANDIDATO ≠ NORMA — lo que no pasa la gobernanza no se puede activar', async () => {
      const flojo = armar({ clave: 'ZZ-flojo', valores: [10, 10.2], obras: ['zz-a', 'zz-a'] })
      const g = await guardar(db, flojo)
      assert.equal(g.estado, ESTADO.CANDIDATO, g.gobernanza.porQue)
      const r = await activar(db, { clave: 'ZZ-flojo' })
      assert.equal(r.activada, false)
      assert.match(r.porQue, /gobernanza no lo habilita/)
      assert.equal((await activos(db)).some((x) => x.clave === 'ZZ-flojo'), false)
      assert.equal(await vigenteDe(db, 'ZZ-flojo'), null)
    })

    const v1 = armar({ clave: 'ZZ-rend', valores: [10, 10.4, 9.6, 10.2, 9.8], obras: CINCO })
    let reglaV1 = null

    await t.test('POSITIVO: lo que pasa la gobernanza queda APTO y recién ahí se activa', async () => {
      const g = await guardar(db, v1)
      assert.equal(g.gobernanza.apto, true, g.gobernanza.porQue)
      assert.equal(g.estado, ESTADO.APTO, 'APTO no es rigiendo: pasar la puerta no es estar cotizando')
      assert.equal((await activos(db)).some((x) => x.clave === 'ZZ-rend'), false)

      const a = await activar(db, { clave: 'ZZ-rend', quien: 'test' })
      assert.equal(a.activada, true, a.porQue)
      assert.equal(a.version, 1)
      reglaV1 = a.regla
      const enUso = (await activos(db)).find((x) => x.clave === 'ZZ-rend')
      assert.ok(enUso, 'después de activar tiene que verse en aprendizaje_activo')
      assert.equal(Number(enUso.valor), 10)
      assert.equal(enUso.obras_distintas, 5)
      assert.equal(enUso.clase, 'D')
      const h = await historial(db, 'ZZ-rend')
      assert.equal(h.length, 1)
      assert.equal(h[0].regla_anterior, null, 'la primera activación no tiene versión anterior')
    })

    await t.test('activar de nuevo lo mismo no inventa una versión', async () => {
      const r = await activar(db, { clave: 'ZZ-rend' })
      assert.equal(r.activada, false)
      assert.equal(r.yaRegia, true)
      assert.equal((await historial(db, 'ZZ-rend')).length, 1)
    })

    await t.test('la versión 2 archiva la versión 1 ENTERA, no un puntero', async () => {
      const v2 = armar({ clave: 'ZZ-rend', valores: [40, 41, 39, 40.5, 39.5], obras: CINCO })
      const g = await guardar(db, v2)
      assert.equal(g.vigente.valor, 10, 'guardar una medición nueva NO puede pisar la norma vigente')
      const a = await activar(db, { clave: 'ZZ-rend', porQue: 'medición nueva' })
      assert.equal(a.activada, true, a.porQue)
      assert.equal(a.version, 2)
      assert.deepEqual(a.anterior, reglaV1, 'lo archivado tiene que ser la versión 1 tal cual regía')
      assert.equal(Number((await activos(db)).find((x) => x.clave === 'ZZ-rend').valor), 40)
    })

    await t.test('el rollback deja rigiendo EXACTAMENTE la versión anterior', async () => {
      const r = await revertir(db, { clave: 'ZZ-rend', porQue: 'la versión 2 estimaba peor' })
      assert.equal(r.revertida, true, r.porQue)
      assert.deepEqual(r.volvioA, reglaV1, 'campo por campo, la misma regla que regía antes')
      assert.deepEqual(await vigenteDe(db, 'ZZ-rend'), reglaV1)
      const enUso = (await activos(db)).find((x) => x.clave === 'ZZ-rend')
      assert.equal(Number(enUso.valor), 10, 'lo que cotiza vuelve a ser la versión 1')
      assert.equal(enUso.ultima_accion, 'ROLLBACK')
      const h = await historial(db, 'ZZ-rend')
      assert.equal(h[0].accion, 'ROLLBACK')
      assert.equal(h[0].regla_anterior.valor, 40, 'queda anotado qué dejó de regir')
      // La historia no se borra: las tres filas siguen ahí.
      assert.deepEqual(h.map((x) => `${x.version}:${x.accion}`), ['3:ROLLBACK', '2:ACTIVACION', '1:ACTIVACION'])
    })

    await t.test('revertir la primera activación deja de regir, no deja el número viejo puesto', async () => {
      const uno = armar({ clave: 'ZZ-unico', valores: [5, 5.1, 4.9, 5.05, 4.95], obras: CINCO })
      await guardar(db, uno)
      assert.equal((await activar(db, { clave: 'ZZ-unico' })).activada, true)
      const r = await revertir(db, { clave: 'ZZ-unico' })
      assert.equal(r.revertida, true, r.porQue)
      assert.equal(r.volvioA, null)
      assert.equal(await vigenteDe(db, 'ZZ-unico'), null)
      assert.equal((await activos(db)).some((x) => x.clave === 'ZZ-unico'), false)
      const otra = await revertir(db, { clave: 'ZZ-unico' })
      assert.equal(otra.revertida, false, 'no se puede revertir dos veces lo mismo')
    })

    await t.test('NEGATIVO: no se puede revertir algo que nunca se activó', async () => {
      const r = await revertir(db, { clave: 'ZZ-flojo' })
      assert.equal(r.revertida, false)
      assert.match(r.porQue, /nunca se activó/)
    })

    await t.test('una obra nueva que contradice a la norma vigente la marca para revisión', async () => {
      // La v1 volvió a regir en el test anterior. Ahora llega una muestra desparramada.
      const sucio = armar({ clave: 'ZZ-rend', valores: [2, 20, 5, 40, 1], obras: CINCO })
      const g = await guardar(db, sucio)
      assert.equal(g.gobernanza.apto, false, 'con esa dispersión ya no debería pasar')
      assert.equal(g.estado, ESTADO.CANDIDATO)
      assert.equal(g.requiereRevision, true, 'y eso tiene que salir dicho, no descubrirse leyendo un JSON')
      assert.equal(g.vigente.valor, 10, 'la norma sigue rigiendo hasta que alguien la revierta con su registro')
      assert.equal((await activar(db, { clave: 'ZZ-rend' })).activada, false, 'y no se puede reactivar con esa muestra')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
