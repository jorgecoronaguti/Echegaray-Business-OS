// LA SERIE DE PRECIOS CONTRA LA BASE REAL: QUE ACUMULE, Y QUE SE SEPA CUÁL SE USA.
//
// Lo que estos tests atrapan:
//
//   · que una segunda carga del mismo recurso PISE a la primera en vez de sumarse — si eso pasa, la
//     serie nunca crece, la deriva del recurso no se puede medir nunca y la vigencia siempre sale
//     prestada del IPC;
//   · que «el precio vigente» se resuelva eligiendo la observación MÁS NUEVA en vez de la fila
//     MARCADA `vigente`, que es la que multiplica `recurso_costo` y forma el costo de la cotización.
//     Con series de largo 1 las dos reglas dan lo mismo y el defecto es invisible; el test crea la
//     serie a propósito y las separa.
//
// Todo lo que escribe usa el prefijo ZZ, corre dentro de un `begin` y termina en `rollback`: la base
// queda exactamente como estaba. El conteo del catálogo real se mide al principio y al final para
// que «nada se pierde» sea un dato y no una promesa.

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { aplicarResolucion } from './precio-fuentes.pg.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const MIGRACION = '20260903T1730_cual_de_los_precios_se_usa_y_desde_cuando.sql'
const CODIGO = 'ZZ_PRECIO_SERIE'

/** Una resolución mínima con la forma que `aplicarResolucion` consume. No se fabrica un precio: se
 *  declara de dónde salió, que es lo que el escritor de producción exige para poder escribirlo. */
const resolucionActualizada = (valor, fecha) => ({
  resultado: 'ACTUALIZADO', valor, fecha, moneda: 'ARS',
  detalleFuente: 'ZZ lista de proveedor de prueba',
  provenance: { resueltoEn: 'INTERNO' },
  evidencia: { proveedor: null },
  vigencia: { dias: null },
  porQue: 'ZZ test',
})

test('recurso_precio acumula serie y la lectura dice CUÁL se usa y de cuándo es',
  { skip: !hayBase }, async (t) => {
    const c = await getPool().connect()
    const q = async (sql, params) => (await c.query(sql, params)).rows
    const uno = async (sql, params) => (await q(sql, params))[0]
    const estado = () => uno('select * from public.recurso_precio_estado($1)', [recursoId])

    let recursoId = null
    try {
      await c.query('begin')

      const objetos = await uno(`
        select to_regclass('public.recurso_precio_serie')  as vista,
               to_regproc('public.recurso_precio_estado')  as funcion`)
      for (const [nombre, valor] of Object.entries(objetos)) {
        assert.ok(valor, `FALTA APLICAR LA MIGRACIÓN ${MIGRACION}: no existe «${nombre}» en la base. `
          + 'La aplica el coordinador; este test no la aplica ni la simula.')
      }

      const antes = Number((await uno('select count(*) n from public.recurso_precio')).n)
      assert.ok(antes > 0, 'el catálogo de precios está vacío: no hay nada que preservar y el test no probaría nada')

      recursoId = (await uno(
        `insert into public.recurso (codigo, nombre, unidad, tipo, familia, activo)
         values ($1, 'ZZ CEMENTO DE PRUEBA', 'bolsa', 'material', 'MATERIAL', true) returning id`, [CODIGO])).id

      await t.test('un recurso sin ninguna observación NO es un precio cero: es FALTA_DATO', async () => {
        const e = await estado()
        assert.equal(e.estado, 'FALTA_DATO')
        assert.equal(e.observaciones, 0)
        assert.equal(e.costo, null)
        assert.match(e.por_que, /nunca se cotizo/)
      })

      // La primera observación: 750 días, que es la antigüedad que hoy tiene trabada la cotización
      // de Quattropani. Se escribe con fecha relativa para que el test no envejezca con el calendario.
      await q(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, moneda, vigente)
               values ($1, 1000, current_date - 750, 'ZZ carga inicial', 'ARS', true)`, [recursoId])

      await t.test('un precio de 750 días se puede distinguir de uno de ayer', async () => {
        const e = await estado()
        assert.equal(e.antiguedad_dias, 750)
        assert.equal(e.estado, 'HISTORICO', 'un precio de 750 días con vigencia 180 no es EXTRAIDO')
        assert.equal(e.observaciones, 1, 'una sola observación: la deriva de ESTE recurso no se puede medir')
        assert.equal(Number(e.costo), 1000)
        assert.match(e.por_que, /750 dias/)
      })

      await t.test('cargar el mismo recurso otra vez DEJA DOS FILAS: no pisa', async () => {
        const hoy = (await uno('select current_date::text d')).d
        const r = await aplicarResolucion({ query: (s, p) => c.query(s, p) },
          { recurso: { id: recursoId }, resolucion: resolucionActualizada(1800, hoy) })
        assert.equal(r.escrito, true, 'el escritor de producción no escribió el precio nuevo')

        const filas = await q(
          'select costo, fecha_precio, vigente from public.recurso_precio where recurso_id = $1 order by fecha_precio',
          [recursoId])
        assert.equal(filas.length, 2, 'la segunda carga pisó a la primera: la serie no crece')
        assert.equal(Number(filas[0].costo), 1000, 'la observación vieja perdió su valor original')
        assert.equal(filas[0].vigente, false)
        assert.equal(filas[1].vigente, true)

        const e = await estado()
        assert.equal(e.observaciones, 2)
        assert.equal(e.antiguedad_dias, 0)
        assert.equal(e.estado, 'EXTRAIDO')
        assert.equal(Number(e.costo), 1800, 'se está usando un precio que no es el que quedó vigente')
        assert.equal(e.span_dias, 750, 'la serie ya cubre 750 días: eso es lo que permite medir deriva')
      })

      await t.test('dos precios vigentes a la vez son imposibles: lo impide la base', async () => {
        await c.query('savepoint intento')
        const err = await c.query(
          `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente)
           values ($1, 9999, current_date, 'ZZ segundo vigente', true)`, [recursoId])
          .then(() => null, (e) => String(e.message))
        await c.query('rollback to savepoint intento')
        assert.ok(err && /recurso_precio_uno_vigente/.test(err),
          'la base aceptó dos precios vigentes del mismo recurso: cuál se multiplica pasa a ser una lotería')
      })

      // ═══ EL TEST QUE SEPARA LAS DOS DEFINICIONES DE «VIGENTE» ═══
      //
      // Se jubila el precio nuevo y se vuelve a marcar el viejo — lo que pasa cuando alguien revierte
      // una carga equivocada. La observación MÁS NUEVA (hoy, $1.800) y la fila MARCADA ($1.000, de
      // hace 750 días) dejan de ser la misma. La que se multiplica es la marcada.
      //
      // MUTACIÓN: si la vista eligiera «la observación más nueva» en vez de «la fila vigente», este
      // test daría EXTRAIDO, antigüedad 0 y costo 1.800, y el sistema declararía fresco un total
      // calculado con un precio de 750 días. Probado: cambiando el join a `order by fecha desc limit 1`
      // los tres asserts de abajo caen.
      await t.test('si la fila vigente NO es la observación más nueva, eso es CONFLICTO — no se elige en silencio', async () => {
        await q('update public.recurso_precio set vigente = false where recurso_id = $1 and vigente', [recursoId])
        await q(`update public.recurso_precio set vigente = true
                  where recurso_id = $1 and fecha_precio = current_date - 750`, [recursoId])

        const e = await estado()
        assert.equal(e.estado, 'CONFLICTO', 'el desacuerdo entre la fila marcada y la más nueva se resolvió solo')
        assert.equal(e.antiguedad_dias, 750, 'informó la antigüedad de una observación que NO es la que se usa')
        assert.equal(Number(e.costo), 1000, 'informó un precio distinto del que se multiplica')
        assert.match(e.por_que, /NO es el mas reciente/)
      })

      await t.test('observaciones sin ninguna marcada vigente también es CONFLICTO, no «sin precio»', async () => {
        await q('update public.recurso_precio set vigente = false where recurso_id = $1', [recursoId])
        const e = await estado()
        assert.equal(e.estado, 'CONFLICTO')
        assert.equal(e.observaciones, 2, 'las observaciones siguen ahí: lo que falta es la decisión de cuál se usa')
        assert.match(e.por_que, /NINGUNA marcada vigente/)
      })

      // Contestar mal es peor que no contestar. La vista es `security_invoker`: sin el filtro
      // `ve_economia()` la RLS de `recurso_precio` vacía el join y un jefe de obra vería los 406
      // recursos como «sin precio» — un falso FALTA_DATO por cada uno. MUTACIÓN: sacando el `where`
      // de la vista, este test devuelve 406 en vez de 0.
      await t.test('a quien no ve economía la vista le contesta CERO, no «ningún recurso tiene precio»', async () => {
        const campo = await uno(`select id from perfiles where rol = 'campo' limit 1`)
        const admin = await uno(`select id from perfiles where rol in ('direccion','administracion') limit 1`)
        assert.ok(campo?.id && admin?.id, 'la base no tiene una cuenta de campo y una de economía: el permiso no se puede probar')

        const filasComo = async (id) => {
          await c.query('savepoint rol')
          await c.query(`select set_config('request.jwt.claims', $1, true)`,
            [JSON.stringify({ sub: id, role: 'authenticated' })])
          await c.query('set local role authenticated')
          const n = Number((await uno('select count(*) n from public.recurso_precio_serie')).n)
          await c.query('rollback to savepoint rol')
          await c.query('reset role')
          return n
        }
        assert.equal(await filasComo(campo.id), 0, 'un jefe de obra vio la serie de precios')
        assert.ok(await filasComo(admin.id) > 0, 'quien SÍ ve economía se quedó sin la vista')
      })

      await t.test('nada del catálogo real se perdió en el camino', async () => {
        const despues = Number((await uno(
          'select count(*) n from public.recurso_precio where recurso_id <> $1', [recursoId])).n)
        assert.equal(despues, antes, 'la corrida se llevó puestas observaciones que ya existían')
      })
    } finally {
      await c.query('rollback').catch(() => {})
      c.release()
    }
  })

after(async () => { await getPool().end() })
