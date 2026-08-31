// LAS DOS TABLAS NUEVAS, COMO `authenticated` Y CON UN JWT REAL.
//
// ═══ POR QUÉ ESTO NO SE PUEDE DAR POR ESCRITO ═══
//
// Las policies de `base_maestra_relacion` y `base_maestra_fusion` se escribieron en la migración y
// hasta acá corrieron SIEMPRE con el pool de servicio, que no pasa por row-level security: o sea
// que nunca se evaluaron. En este repo eso ya costó caro dos veces —una policy sin su GRANT
// contesta «permission denied» y Next lo muestra como 404, y una columna nueva nace sin permiso y
// se lee VACÍA—. Preguntarle al catálogo prueba el GRANT y no prueba la POLICY: son dos cerraduras
// distintas y hay que abrir las dos.
//
// Acá se abre transacción, se hace `set local role authenticated` con un JWT real, se intenta
// escribir, y se mira SI LA FILA QUEDÓ. Todo en `begin`/`rollback` sobre una conexión.
//
// ═══ LO QUE TIENE QUE PASAR ═══
//
//   · fusionar tiene efecto económico: un jefe de obra NO puede, dirección SÍ;
//   · nadie firma con el uuid de otro, en ninguna de las dos tablas;
//   · las dos son INMUTABLES: sin UPDATE ni DELETE, y eso se prueba intentándolo;
//   · leer está abierto: un jefe de obra tiene que poder ver por qué dos tareas quedaron separadas.
//
// Y hay un caso que existe para que el archivo no pueda ser una constante: se reemplaza la policy
// por una permisiva DENTRO de la transacción y se verifica que el mismo insert ahora entra. Sin
// eso, «rechazó» podría estar viniendo de un GRANT faltante, de un CHECK o de un typo en el SQL.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../lib/db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('base_maestra_relacion y base_maestra_fusion · RLS como authenticated', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, p) => (await c.query(sql, p)).rows

  /** Se hace pasar por alguien. `reset role` primero: adentro de `authenticated` ya no hay setup. */
  const como = async (uid) => {
    await c.query('reset role')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await c.query('set local role authenticated')
  }
  const comoServicio = () => c.query('reset role')

  /** Un intento que tiene que fallar, sin llevarse la transacción puesta: una violación de RLS la
   *  aborta entera y todo lo que venga después falla por un motivo prestado. */
  const rechaza = async (sql, params, re, mensaje) => {
    await c.query('savepoint intento')
    let error = null
    try { await c.query(sql, params) } catch (e) { error = e }
    if (error) await c.query('rollback to savepoint intento')
    else await c.query('release savepoint intento')
    assert.ok(error, mensaje)
    assert.match(String(error.message), re, `rechazó por el motivo equivocado: ${error.message}`)
  }

  const INSERT_FUSION = `insert into public.base_maestra_fusion
      (accion, codigo_sobrevive, codigo_absorbido, estado_previo, por_que, ejecutado_por)
    values ('FUSIONAR', 'ZZ-A', 'ZZ-B', '{}'::jsonb, 'prueba de RLS', $1)`
  const INSERT_RELACION = `insert into public.base_maestra_relacion
      (codigo_a, codigo_b, veredicto, regla, por_que, evidencia, decidido_por)
    values ('ZZ-A', 'ZZ-B', 'NO_DUPLICADO', 'UNIDAD', 'prueba de RLS', '{}'::jsonb, $1)`

  await c.query('begin')
  let CON = null
  let SIN = null
  try {
    // ── FIXTURE: perfiles REALES. No se crean usuarios de prueba en una base compartida. ────────
    const conEco = await q(`select id, rol from public.perfiles where rol in ('direccion','administracion') order by id limit 1`)
    const sinEco = await q(`select id, rol from public.perfiles where rol in ('jefe_obra','campo') order by id limit 1`)
    assert.equal(conEco.length, 1, 'no hay ningún perfil con ve_economia() para probar el lado que SÍ puede')
    assert.equal(sinEco.length, 1, 'no hay ningún perfil sin ve_economia() para probar el lado que NO puede')
    CON = conEco[0].id
    SIN = sinEco[0].id

    await t.test('el portero es el que se cree que es', async () => {
      await como(CON)
      assert.equal((await q('select public.ve_economia() as v'))[0].v, true)
      await como(SIN)
      assert.equal((await q('select public.ve_economia() as v'))[0].v, false,
        `el perfil elegido como «sin economía» (${sinEco[0].rol}) sí la ve: el resto del archivo no probaría nada`)
    })

    await t.test('FUSIÓN · un autenticado SIN ve_economia() no puede escribir', async () => {
      await como(SIN)
      await rechaza(INSERT_FUSION, [SIN], /row-level security|permission denied/i,
        'un jefe de obra pudo registrar una fusión de la Base Maestra')
    })

    await t.test('FUSIÓN · dirección SÍ puede, y la fila queda — leído en su destino', async () => {
      await como(CON)
      await c.query(INSERT_FUSION, [CON])
      // El filtro incluye `ejecutado_por`: si el caso anterior dejó una fila —porque la policy
      // estaba abierta y no rechazó—, esta consulta no puede tomarla por la suya y decir verde.
      const [f] = await q(
        `select ejecutado_por, accion from public.base_maestra_fusion
          where codigo_absorbido = 'ZZ-B' and ejecutado_por = $1`, [CON])
      assert.ok(f, 'la escritura respondió que sí y la fila no está')
      assert.equal(f.ejecutado_por, CON)
    })

    await t.test('FUSIÓN · nadie firma con el uuid de otro', async () => {
      await como(CON)
      await rechaza(INSERT_FUSION, [SIN], /row-level security/i,
        'dirección pudo registrar una fusión a nombre de otra persona')
    })

    await t.test('FUSIÓN · el default de ejecutado_por es quien está escribiendo, no NULL', async () => {
      await como(CON)
      await c.query(`insert into public.base_maestra_fusion
        (accion, codigo_sobrevive, codigo_absorbido, estado_previo, por_que)
        values ('FUSIONAR', 'ZZ-C', 'ZZ-D', '{}'::jsonb, 'sin firmar a mano')`)
      const [f] = await q(`select ejecutado_por from public.base_maestra_fusion where codigo_absorbido = 'ZZ-D'`)
      assert.equal(f.ejecutado_por, CON, 'una fusión quedó sin dueño')
    })

    await t.test('RELACIÓN · escribir un veredicto no exige economía, pero sí firmarlo', async () => {
      await como(SIN)
      await c.query(INSERT_RELACION, [SIN])
      const [r] = await q(`select decidido_por from public.base_maestra_relacion where codigo_a = 'ZZ-A'`)
      assert.equal(r.decidido_por, SIN, 'un jefe de obra no pudo dejar escrito un veredicto de comparación')
      await rechaza(INSERT_RELACION, [CON], /row-level security/i,
        'se pudo dejar un veredicto firmado por otra persona')
    })

    await t.test('LAS DOS SON INMUTABLES: ni UPDATE ni DELETE, para nadie', async () => {
      for (const uid of [CON, SIN]) {
        await como(uid)
        for (const tabla of ['base_maestra_fusion', 'base_maestra_relacion']) {
          await rechaza(`update public.${tabla} set por_que = 'reescrito'`, [], /permission denied|row-level security/i,
            `se pudo REESCRIBIR ${tabla}: la historia se borra`)
          await rechaza(`delete from public.${tabla}`, [], /permission denied|row-level security/i,
            `se pudo BORRAR de ${tabla}: la historia se borra`)
        }
      }
    })

    await t.test('LEER está abierto: un jefe de obra ve por qué dos tareas quedaron separadas', async () => {
      await como(SIN)
      const filas = await q(`select codigo_a, codigo_b, veredicto from public.base_maestra_relacion order by codigo_a`)
      assert.ok(filas.length >= 1, 'la lectura devolvió cero filas: una policy sin GRANT se lee igual que «no hay datos»')
      assert.ok(filas.some((f) => f.codigo_a === 'ZZ-A'))
      assert.ok((await q(`select 1 from public.base_maestra_fusion limit 1`)).length >= 1,
        'no se puede leer el registro de fusiones')
    })

    // ═══ QUE EL RECHAZO VENGA DE LA POLICY Y NO DE OTRA COSA ═══
    await t.test('ANTI-CONSTANTE: con la policy abierta, el MISMO insert entra', async () => {
      await comoServicio()
      await c.query('savepoint permisiva')
      await c.query(`drop policy base_maestra_fusion_escribe on public.base_maestra_fusion`)
      await c.query(`create policy base_maestra_fusion_escribe on public.base_maestra_fusion
                     for insert to authenticated with check (true)`)
      await como(SIN)
      await c.query(INSERT_FUSION, [SIN])
      const [f] = await q(`select ejecutado_por from public.base_maestra_fusion where codigo_absorbido = 'ZZ-B' and ejecutado_por = $1`, [SIN])
      assert.ok(f, 'ni con la policy en `true` entra: entonces lo que rechazaba antes no era la policy')
      await comoServicio()
      await c.query('rollback to savepoint permisiva')
    })
    // ═══ LA POLICY VIGENTE ES LA DE LA MIGRACIÓN ═══
    //
    // Va DENTRO del try, y la conexión se libera en el finally. La primera versión ponía esta
    // aserción después del `finally` y sin proteger: cuando se puso roja —con la policy mutada a
    // propósito para comprobar que el archivo podía dar rojo— saltó antes del `c.release()`, el
    // `pool.end()` se quedó esperando una conexión que nadie devolvía y el proceso colgó dos
    // minutos SIN IMPRIMIR el resumen. Un test que al fallar no te deja leer por qué falló es peor
    // que no tenerlo: la salida es la mitad del test.
    await comoServicio()
    const [pol] = await q(`select with_check from pg_policies
                            where tablename = 'base_maestra_fusion' and policyname = 'base_maestra_fusion_escribe'`)
    assert.ok(pol, 'la policy desapareció')
    assert.match(pol.with_check, /ve_economia/,
      'la policy de escritura de fusiones NO exige ve_economia(): cualquier autenticado puede registrar una fusión')
  } finally {
    await c.query('rollback').catch(() => {})
    await comoServicio().catch(() => {})
    c.release()
    await getPool().end()
  }
})
