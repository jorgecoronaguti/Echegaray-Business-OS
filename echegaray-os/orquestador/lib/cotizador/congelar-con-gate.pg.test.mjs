// EL GATE DE CONGELAR, CONTRA LA BASE — la regresión del defecto que encontró el QA visual.
//
// ═══ EL CASO, TAL COMO PASÓ (29/08/2026) ═══
//
// La pantalla 15 dibujaba «NO se congela: 1 bloqueo(s)» —el gate de `freeze.mjs`, correcto— y al
// lado el botón «Congelar» habilitado. `puedeCongelar()` sólo miraba `n_partidas === 0` y
// `congelada_en`, y la server action llamaba a `congelar_presupuesto`, que informa a posteriori qué
// quedó sin respaldo, cuando ya no se puede deshacer. El QA apretó el botón: quedó una versión
// marcada como salida, con un bloqueante vivo y `precio_venta = $0`.
//
// ═══ POR QUÉ ESTE TEST VA CONTRA LA BASE Y NO CONTRA UN OBJETO ═══
//
// El defecto NO estaba en el gate: estaba en que nadie lo consultaba antes de mutar. Un test sobre
// `gateDeCongelado()` habría estado verde todo el tiempo —de hecho lo estaba—. Lo único que prueba
// que esto no vuelve a pasar es intentar congelar de verdad y leer `congelada_en` EN SU DESTINO.
//
// Toda la escritura vive dentro de un `begin`/`rollback`: la base queda como estaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { gateDeCongelado } from './freeze.mjs'
import { crearBorradorValido, congelarBorrador } from '../../scripts/xsas-freeze-fixture.mjs'
import { MUTACIONES } from '../../scripts/xsas-freeze-camino-verde.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('congelar exige el gate ANTES de mutar, y la base lo hace cumplir', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows

  /**
   * El uuid de una persona con rol `direccion`. `cot_permiso('FREEZE')` mira el PERFIL de quien
   * pregunta, así que un pool sin identidad rebota por permiso ANTES de llegar al gate — y ahí el
   * test estaría probando el RBAC, no el gate. Se toma un perfil REAL: `perfiles.id` referencia
   * `auth.users` y crear usuarios de Supabase para un test es un efecto lateral sobre una base
   * compartida con producción.
   */
  const [quienCongela] = await q("select id from public.perfiles where rol = 'direccion' limit 1")

  await t.test('un presupuesto con un bloqueante vivo NO se congela, y la fila lo prueba', { skip: !quienCongela && 'no hay ningún perfil de dirección en esta base' }, async () => {
    // ═══ SAVEPOINT, Y POR QUÉ NO SE COMMITEA ═══
    //
    // La excepción del gate aborta la transacción que la contiene, así que sin un savepoint no se
    // puede leer nada después del rebote. Y commitear para leer en limpio está PROHIBIDO por la
    // guarda del repo —«ESCRITURA COMMITEADA DESDE UN TEST SOBRE LA BASE PRODUCTIVA»—, que tiene
    // razón: un test no deja rastro en la base del dueño.
    //
    // Consecuencia declarada: acá se prueba que la función REBOTA y que la fila NO quedó marcada
    // dentro de la transacción. Que un rebote no pueda dejar escritura a medias es la semántica de
    // plpgsql, no algo que este test verifique — y la fixture del QA, que sí está commiteada porque
    // la escribió una persona, cubre el otro lado.
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-GATE-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Prueba del gate')
        returning id`)

      // Una partida SIN análisis y SIN subcontrato: no aporta costo y el gate la marca bloqueante.
      // Es exactamente la forma del presupuesto que el QA logró congelar.
      await q(`insert into public.cotizacion_partida (cotizacion_id, orden, descripcion, cantidad, unidad)
        values ($1, 1, 'Partida sin analisis', 100, 'm2')`, [cot.id])

      const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [cot.id])
      assert.equal(gate.ready, false, 'el gate de la base dejó pasar un presupuesto sin composición')
      assert.ok(gate.blocking_issues.length > 0, 'el gate dice que no y no dice por qué')

      // Se actúa COMO LA PERSONA: `cot_permiso('FREEZE')` mira el perfil de quien pregunta, y sin
      // identidad el rebote que se mediría sería el del RBAC y no el del gate.
      await c.query('savepoint antes_de_congelar')
      await c.query('set local role authenticated')
      await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [quienCongela.id])

      let rebotó = false
      try {
        await c.query(`select public.cot_congelar_con_gate($1, 'sha-de-prueba', '{}'::jsonb, 'prueba')`, [cot.id])
      } catch (err) {
        rebotó = true
        assert.match(err.message, /no se puede congelar/, `rebotó por otro motivo: ${err.message}`)
      }
      await c.query('rollback to savepoint antes_de_congelar')
      await c.query('reset role')
      assert.equal(rebotó, true, 'congeló un presupuesto con un bloqueante vivo')

      // LA FILA, no el mensaje: se lee sin el rol de la persona para que ninguna policy la esconda.
      const [fila] = await q('select congelada_en from public.cotizaciones where id = $1', [cot.id])
      assert.equal(fila.congelada_en, null, 'la excepción salió pero la fila quedó marcada como congelada')
    } finally {
      await c.query('rollback')
    }
  })

  await t.test('sin partidas tampoco: un precio de $0 no es un precio', async () => {
    await c.query('begin')
    try {
      const [cot] = await q(`insert into public.cotizaciones (numero, version, vigente, estado, obra_nombre)
        values ('TEST-GATE-' || substr(gen_random_uuid()::text, 1, 8), 1, false, 'borrador', 'Prueba vacia')
        returning id`)
      const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [cot.id])
      assert.equal(gate.ready, false, 'un presupuesto de cero partidas se declaró listo para congelar')

      // Y el gate de JS —el que dibuja la pantalla— tiene que decir LO MISMO. Que difieran es el
      // defecto original: la pantalla decía una cosa y el botón hacía otra.
      const enJs = gateDeCongelado({ cascada: { ventaSinIva: 0 }, cola: { bloqueantes: [], noBloqueantes: [] } })
      assert.equal(enJs.ready, false, 'el gate de la pantalla dice que sí donde la base dice que no')
    } finally {
      await c.query('rollback')
    }
  })

  // ═══ LA FIXTURE VIVA: lo que el QA dejó congelado a propósito ═══
  //
  // `COT-2026-003` v1 quedó congelada CON el defecto adentro. No se toca: se le pregunta al gate de
  // hoy qué habría dicho. Mientras esa fila exista, este test es la prueba de que el sistema de hoy
  // no habría dejado pasar lo que el de ayer dejó.
  await t.test('la versión que el QA congeló con el defecto: el gate de hoy la rechaza', async () => {
    const filas = await q(`select id, congelada_en, venta_sin_iva from public.cotizacion_cascada
      where numero = 'COT-2026-003' and version = 1`)
    if (filas.length === 0) {
      // La fixture es un dato de una base concreta. Si alguien la limpió, este control no puede
      // decir nada — y decirlo es mejor que pasar en verde sin haber mirado.
      t.diagnostic('no está COT-2026-003 v1 en esta base: el control de la fixture no corrió')
      return
    }
    const [f] = filas
    assert.notEqual(f.congelada_en, null, 'la fixture dejó de estar congelada: ya no prueba el defecto')
    const [{ cot_gate_congelado: gate }] = await q('select public.cot_gate_congelado($1)', [f.id])
    assert.equal(gate.ready, false, 'el gate de hoy dejaría pasar lo mismo que el QA congeló mal')
    assert.ok(gate.blocking_issues.length > 0, 'el gate dice que no y no dice por qué')
  })

  c.release()
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CAMINO VERDE — lo único que este archivo NO probaba
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Todo lo de arriba prueba que el candado BLOQUEA. Ninguno prueba que DEJE PASAR algo correcto, y un
// candado que sólo se vio bloqueando no se distingue de un candado soldado: las dos veces dice que
// no. Lo de acá abajo arma un borrador válido —nunca congelado— y lo congela de verdad; después le
// saca una pieza por vez y exige que se corte y que al reponerla vuelva a permitir.
//
// Todo dentro de `begin`/`rollback` sobre UNA conexión. La base es la productiva y está compartida.

test('el candado deja pasar un borrador CORRECTO, y cada pieza que falta lo corta', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const gate = async (id) => (await c.query('select public.cot_gate_congelado($1) as g', [id])).rows[0].g
  const valida = async (id) => (await c.query('select public.xsas_freeze_validacion($1) as v', [id])).rows[0].v
  const hash = async (id) => (await c.query('select public.xsas_freeze_hash_estado($1) as h', [id])).rows[0].h

  try {
    await c.query('begin')
    const fx = await crearBorradorValido(c)

    await t.test('CAMINO VERDE · un DRAFT válido congela, y la fila lo prueba en su destino', async () => {
      assert.equal((await gate(fx.cotizacionId)).ready, true, 'el gate rechaza un borrador que no tiene nada mal')
      assert.equal((await valida(fx.cotizacionId)).ready_estricto, true, 'la validación estricta rechaza un borrador correcto')

      const antes = (await c.query('select congelada_en from public.cotizaciones where id=$1', [fx.cotizacionId])).rows[0]
      assert.equal(antes.congelada_en, null, 'la fixture nació congelada: no probaría el camino de un DRAFT')

      await c.query('savepoint verde')
      const res = await congelarBorrador(c, fx)
      if (!res) { t.diagnostic('NO_MEDIDO: no hay perfil `direccion` en esta base'); await c.query('rollback to savepoint verde'); return }

      // LA FILA, no el jsonb que devolvió la función: se lee sin el rol de la persona.
      const [fila] = (await c.query('select congelada_en, congelada_por from public.cotizaciones where id=$1', [fx.cotizacionId])).rows
      assert.notEqual(fila.congelada_en, null, 'la función dijo que congeló y `congelada_en` sigue en null')
      assert.equal(fila.congelada_por, res.congeladoPor, 'congeló, pero la firma no es de quien apretó')
      const [comp] = (await c.query(`select count(*)::int n from public.cotizacion_partida_composicion x
        join public.cotizacion_partida p on p.id = x.partida_id where p.cotizacion_id=$1`, [fx.cotizacionId])).rows
      assert.equal(comp.n, 2, 'congeló sin dejar la composición: una versión sin líneas no respalda su precio')
      const [hue] = (await c.query('select sha256 from public.cotizacion_huella where cotizacion_id=$1', [fx.cotizacionId])).rows
      assert.match(hue.sha256, /^[0-9a-f]{64}$/, 'la huella guardada no es un sha256')
      await c.query('rollback to savepoint verde')
    })

    for (let i = 0; i < MUTACIONES.length; i++) {
      const m = MUTACIONES[i]
      await t.test(`MUTACIÓN ${m.nombre}`, async () => {
        await c.query(`savepoint m${i}`)
        await m.aplicar(c, fx)
        const g = await gate(fx.cotizacionId)
        const v = await valida(fx.cotizacionId)
        const issues = m.fuente === 'gate' ? g.blocking_issues : v.ciegos
        assert.equal(m.fuente === 'gate' ? g.ready : v.ready_estricto, false,
          `la mutación no cortó el congelado: ${JSON.stringify(issues)}`)
        assert.ok(issues.some((b) => b.tipo === m.tipo),
          `cortó por otra cosa: esperaba ${m.tipo} y vinieron ${issues.map((b) => b.tipo).join(', ')}`)
        // Y TIENE QUE VOLVER A VERDE. Un bloqueo que no se revierte no probó esta mutación: probó
        // que el gate quedó roto para todo, y eso pasa igual con el gate soldado.
        await c.query(`rollback to savepoint m${i}`)
        assert.equal((await gate(fx.cotizacionId)).ready, true, 'revertida la mutación, el gate sigue bloqueando')
        assert.equal((await valida(fx.cotizacionId)).ready_estricto, true, 'revertida la mutación, la validación sigue bloqueando')
      })
    }

    // ═══ §L · UNA OPERACIÓN DE LECTURA JAMÁS MODIFICA UNA COMPOSICIÓN CONGELADA ═══
    await t.test('§L · validar y reconstruir la cadena NO tocan nada: el hash es idéntico', async () => {
      await c.query('savepoint solo_lectura')
      const res = await congelarBorrador(c, fx)
      if (!res) { t.diagnostic('NO_MEDIDO: no hay perfil `direccion` en esta base'); await c.query('rollback to savepoint solo_lectura'); return }
      const antes = await hash(fx.cotizacionId)
      await valida(fx.cotizacionId)
      await c.query('select public.xsas_genealogia_cadena($1)', [fx.partidaId])
      await c.query('select public.xsas_freeze_validacion($1)', [fx.cotizacionId])
      assert.equal(await hash(fx.cotizacionId), antes, 'validar o reconstruir la cadena MOVIÓ el estado')

      // EL NEGATIVO: la escritura vieja —editar la composición ya congelada— tiene que rebotar. Sin
      // esto, el hash igual sólo probaría que nadie intentó escribir, no que no se pueda.
      let rebotó = false
      await c.query('savepoint intento')
      try {
        await c.query(`update public.cotizacion_partida_composicion set costo_unitario = 1
          where partida_id = $1`, [fx.partidaId])
      } catch (err) { rebotó = true; assert.match(err.message, /congelad/i, `rebotó por otro motivo: ${err.message}`) }
      await c.query('rollback to savepoint intento')
      assert.equal(rebotó, true, 'se pudo reescribir la composición de una versión CONGELADA')
      assert.equal(await hash(fx.cotizacionId), antes, 'el intento de escritura dejó rastro')
      await c.query('rollback to savepoint solo_lectura')
    })

    // ═══ §L · UN PRECIO WEB Y EL GATE DE CONGELADO ═══
    //
    // ═══ POR QUÉ ESTE TEST ESTABA ESCRITO AL REVÉS ═══
    //
    // Afirmaba `assert.equal(g.ready, true)` — o sea, EXIGÍA que el agujero siguiera abierto. Un test
    // así está verde mientras el defecto vive y se pone rojo el día que alguien lo arregla: le cobra
    // el trabajo a quien viene a hacerlo bien. Y publica un ✔ en la suite por un hueco, que es la
    // forma más cara de `NO_EJERCITADO = PASS`.
    //
    // Lo que se mide ahora es lo que de verdad se sabe: se monta el escenario, se le pregunta al
    // gate, y se DECLARA su respuesta. El requisito —un precio scrapeado no debería congelar sin una
    // fila de gobernanza— sigue sin estar implementado (el hook es del frente B y `precio-web.mjs`
    // no expone ninguno), así que el estado honesto es NO_MEDIDO y viaja como diagnóstico, no como
    // afirmación. El día que el hook aterrice, este test no se rompe: entra por la otra rama y ahí
    // sí exige que el corte haya sido POR ESTO.
    await t.test('§L · un precio de fuente WEB: qué contesta hoy el gate de congelado', async () => {
      await c.query('savepoint web')
      const { rowCount } = await c.query(`update public.recurso_precio set fuente = 'WEB' where recurso_id = $1`, [fx.recursos[1].id])
      // SIN ESTO EL TEST NO MEDÍA NADA. Si el recurso no tuviera fila de precio, el update tocaría
      // cero filas y el gate contestaría sobre un escenario que nunca se montó: verde por no haber
      // mirado. «Un control que no pudo mirar no dice que no está».
      assert.ok(rowCount > 0, 'no se marcó ningún precio como WEB: el escenario no se llegó a montar')

      const g = await gate(fx.cotizacionId)
      assert.equal(typeof g.ready, 'boolean', 'el gate no contestó: sin respuesta no hay medición')
      assert.ok(Array.isArray(g.blocking_issues), 'el gate no publicó sus bloqueos')

      if (g.ready === false) {
        // El hook aterrizó. Que corte no alcanza: tiene que cortar POR EL PRECIO WEB. Un gate que
        // bloquea por cualquier otra cosa daría este test por bueno sin que la capacidad exista.
        const porLaFuente = g.blocking_issues.some((b) => /web|fuente|gobernanza/i.test(JSON.stringify(b)))
        assert.ok(porLaFuente,
          `el gate bloqueó, pero no por el precio WEB: ${JSON.stringify(g.blocking_issues)}`)
        t.diagnostic('el gate YA bloquea el precio WEB: sacar esta capacidad de las limitaciones declaradas de la DoD.')
      } else {
        t.diagnostic('NO_MEDIDO · agujero abierto: un precio con fuente=WEB congela sin ninguna fila de gobernanza. '
          + 'El hook del frente B no existe todavía. Esto NO es un criterio cumplido.')
      }
      await c.query('rollback to savepoint web')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
