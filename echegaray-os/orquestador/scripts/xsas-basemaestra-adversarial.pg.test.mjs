// LA CORRIDA ADVERSARIAL CONTRA LA BASE REAL — ¿PUEDE DECIR QUE SÍ, Y PUEDE DECIR QUE NO?
//
// ═══ POR QUÉ NO ALCANZA CON CORRER LA AUDITORÍA SOBRE LAS 205 ═══
//
// Sobre la Base Maestra de hoy el clasificador contesta «no se fusiona» seis veces de seis. Un
// control que sólo contesta que no, sobre el único dato con el que se lo probó, es indistinguible
// de una CONSTANTE — y este repo ya pagó ese error: «un control puede ser una constante», $4,1 M
// invisibles. Acá se le pone adelante un duplicado REAL, insertado en la base real, y se comprueba
// que lo detecta, que lo fusiona, que la fusión SE VE en las filas, y que deshacerla las restaura.
//
// Después se MUTA el duplicado —una sola columna, la unidad— y se comprueba que el mismo
// clasificador, con los mismos datos por lo demás, se niega. Ese es el rojo que el dueño pidió.
//
// ═══ CÓMO SE ESCRIBE EN UNA BASE COMPARTIDA ═══
//
// Todo corre en UNA conexión de `pool.connect()` con `begin`/`rollback`. Con `pool.query` cada
// sentencia cae en una conexión distinta del pool y el rollback no revierte lo que escribieron las
// otras — ya pasó, sobrevivieron 4 filas de 6. Y los códigos llevan prefijo `ZZ-` para que, si un
// rollback fallara, lo que quede sea reconocible de un vistazo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../lib/db.mjs'
import { veredicto, planDeFusion } from './xsas-basemaestra-duplicados.mjs'
import { leerFichas, leerObservaciones, cuadroCuadrillas, aplicarCuadrillas, revertirCuadrillas, fusionar, deshacerFusion, FUENTE } from './xsas-basemaestra-auditar.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const suf = () => Math.random().toString(36).slice(2, 8).toUpperCase()

/** Dos tareas gemelas de verdad: mismo nombre, misma unidad y la MISMA composición. */
async function sembrarGemelas(c, { unidadB = 'M2' } = {}) {
  const s = suf()
  const q = async (sql, p) => (await c.query(sql, p)).rows
  const [r] = await q(`insert into public.recurso (codigo, nombre, unidad, tipo, origen)
    values ('ZZ-R-'||$1, 'ZZ RECURSO DE PRUEBA', 'un', 'material', 'xsas-G adversarial') returning id`, [s])
  const ids = []
  for (const [i, unidad] of [['A', 'M2'], ['B', unidadB]]) {
    const [t] = await q(`insert into public.tarea_tipo (codigo, nombre, unidad, origen)
      values ('ZZ-'||$1||'-'||$2, 'ZZ TABIQUE DE PRUEBA', $3, 'xsas-G adversarial') returning id, codigo`, [i, s, unidad])
    const [a] = await q(`insert into public.analisis (tarea_tipo_id, version, vigente, motivo)
      values ($1, 1, true, 'xsas-G adversarial') returning id`, [t.id])
    await q(`insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden)
      values ($1, $2, 3, 0)`, [a.id, r.id])
    ids.push({ codigo: t.codigo, tareaId: t.id, analisisId: a.id })
  }
  return ids
}

test('el auditor de la Base Maestra puede decir que SÍ, y puede decir que NO', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, p) => c.query(sql, p)

  await t.test('POSITIVO: un duplicado real se detecta, se fusiona, y la fusión SE VE en las filas', async () => {
    await c.query('begin')
    try {
      const [A, B] = await sembrarGemelas(c)
      const fichas = await leerFichas(q)
      const a = fichas.find((f) => f.codigo === A.codigo)
      const b = fichas.find((f) => f.codigo === B.codigo)
      const v = veredicto(a, b)
      assert.equal(v.veredicto, 'DUPLICADO_CONFIRMADO', v.porQue)
      assert.equal(planDeFusion(v, a, b).ok, true)

      const r = await fusionar(c, fichas, A.codigo, B.codigo, 'test adversarial')
      assert.equal(r.ok, true, r.porQue)
      assert.equal(r.sobrevive, A.codigo, 'a igual uso sobrevive el código menor')

      // ═══ LA EVIDENCIA ES DEL EFECTO: se leen las filas, no el resultado de la función ═══
      const { rows: [tt] } = await q('select activo from public.tarea_tipo where codigo = $1', [B.codigo])
      const { rows: [an] } = await q('select vigente from public.analisis where id = $1', [B.analisisId])
      assert.equal(tt.activo, false, 'la tarea absorbida sigue activa: la fusión no tuvo efecto')
      assert.equal(an.vigente, false, 'su análisis sigue publicando precio')
      // Y NADA se borró: la fila existe, sólo dejó de estar activa.
      const { rows: sigue } = await q('select 1 from public.tarea_tipo where codigo = $1', [B.codigo])
      assert.equal(sigue.length, 1, 'la fusión BORRÓ la tarea en vez de desactivarla')

      // La reversa restaura exactamente lo que había.
      const d = await deshacerFusion(c, r.fusionId)
      assert.equal(d.ok, true, d.porQue)
      const { rows: [tt2] } = await q('select activo from public.tarea_tipo where codigo = $1', [B.codigo])
      const { rows: [an2] } = await q('select vigente from public.analisis where id = $1', [B.analisisId])
      assert.equal(tt2.activo, true, 'deshacer no restauró la tarea')
      assert.equal(an2.vigente, true, 'deshacer no volvió a publicar el análisis')
      // Y el deshacer queda registrado: la historia no se borra.
      const { rows: hist } = await q(`select accion from public.base_maestra_fusion where codigo_absorbido = $1 order by ejecutado_en`, [B.codigo])
      assert.deepEqual(hist.map((h) => h.accion), ['FUSIONAR', 'DESHACER'])
    } finally { await c.query('rollback') }
  })

  await t.test('NEGATIVO: la MISMA pareja con la unidad cambiada NO se fusiona', async () => {
    await c.query('begin')
    try {
      // Único cambio contra el caso de arriba: `unidadB`. Todo lo demás —nombre, receta, costo— igual.
      const [A, B] = await sembrarGemelas(c, { unidadB: 'ML' })
      const fichas = await leerFichas(q)
      const v = veredicto(fichas.find((f) => f.codigo === A.codigo), fichas.find((f) => f.codigo === B.codigo))
      assert.equal(v.veredicto, 'NO_DUPLICADO')
      assert.equal(v.regla, 'UNIDAD')

      const r = await fusionar(c, fichas, A.codigo, B.codigo, 'test adversarial')
      assert.equal(r.ok, false, 'FUSIONÓ dos tareas con unidades distintas')
      assert.match(r.porQue, /sólo se fusiona DUPLICADO_CONFIRMADO/)

      // Y no dejó rastro de intento: nada se desactivó.
      const { rows: [tt] } = await q('select activo from public.tarea_tipo where codigo = $1', [B.codigo])
      assert.equal(tt.activo, true, 'se negó a fusionar pero igual desactivó la tarea')
    } finally { await c.query('rollback') }
  })

  await t.test('NEGATIVO: fusionar un par que ni siquiera es candidato tampoco pasa', async () => {
    await c.query('begin')
    try {
      const fichas = await leerFichas(q)
      const r = await fusionar(c, fichas, 'T1133', 'T1134', 'test adversarial')
      assert.equal(r.ok, false)
      const { rows: [tt] } = await q(`select activo from public.tarea_tipo where codigo = 'T1134'`)
      assert.equal(tt.activo, true, 'tocó una tarea REAL de la Base Maestra')
    } finally { await c.query('rollback') }
  })

  await t.test('la carga de cuadrillas escribe SÓLO lo que tiene evidencia, y se revierte entera', async () => {
    await c.query('begin')
    try {
      const fichas = await leerFichas(q)
      const cuadro = cuadroCuadrillas(fichas, await leerObservaciones(q))
      const conEvidencia = cuadro.filter((x) => x.estado === 'UNICA' || x.estado === 'CONVERGE')
      const enConflicto = cuadro.filter((x) => x.estado === 'CONFLICTO')
      assert.ok(conEvidencia.length > 0, 'sin ninguna cargable el resto de la prueba no prueba nada')
      assert.ok(enConflicto.length > 0, 'sin ningún conflicto no se puede probar que el conflicto NO se carga')

      // ═══ POR QUÉ NO SE CUENTAN TODAS LAS FILAS DE LA TABLA ═══
      //
      // La primera versión de esta prueba comparaba el total de `analisis_cuadrilla` antes y
      // después, y se puso roja apenas la carga real de la corrida dejó sus 8 filas: estaba
      // afirmando el estado del mundo, no el efecto de la función. Lo que hay que probar es la
      // invariante —«borra exactamente lo suyo y no toca lo ajeno»—, así que se siembra una fila
      // AJENA a propósito y se verifica que sobreviva. Sin esa fila la afirmación sería vacía.
      const ajena = enConflicto[0]
      await q(`insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad, fuente, estado)
               values ($1, 'oficial', 1, 'la cargó una persona a mano', 'VALIDADO')
               on conflict (analisis_id, categoria) do nothing`, [ajena.analisisId])
      const ajenasAntes = (await q(
        `select count(*)::int n from public.analisis_cuadrilla where fuente is null or fuente not like $1`, [`${FUENTE}%`])).rows[0].n
      assert.ok(ajenasAntes > 0, 'sin una fila ajena, «no toca lo ajeno» no prueba nada')

      const r = await aplicarCuadrillas(q, cuadro)
      assert.equal(r.tareas, conEvidencia.length)

      const { rows: escritas } = await q(
        `select analisis_id, categoria, cantidad, estado, fuente from public.analisis_cuadrilla where fuente like $1`, [`${FUENTE}%`])
      assert.equal(escritas.length, r.filas, 'la función dijo que escribió más filas de las que hay')
      assert.ok(escritas.every((e) => e.estado === 'CANDIDATO'), 'una cuadrilla observada entró como norma')

      // Lo que está en CONFLICTO no tiene fila. Es el punto entero del ejercicio.
      const conflictivos = new Set(enConflicto.map((x) => x.analisisId))
      assert.ok(!escritas.some((e) => conflictivos.has(e.analisis_id)),
        'se cargó una cuadrilla de una tarea con observaciones contradictorias')

      // Y la reversa borra exactamente lo suyo, ni una fila más.
      const borradas = await revertirCuadrillas(q)
      assert.equal(borradas, escritas.length)
      const quedan = (await q(`select count(*)::int n from public.analisis_cuadrilla where fuente like $1`, [`${FUENTE}%`])).rows[0].n
      assert.equal(quedan, 0, 'la reversa dejó filas propias sin borrar')
      const ajenasDespues = (await q(
        `select count(*)::int n from public.analisis_cuadrilla where fuente is null or fuente not like $1`, [`${FUENTE}%`])).rows[0].n
      assert.equal(ajenasDespues, ajenasAntes, 'la reversa se llevó por delante una cuadrilla que cargó una persona')
    } finally { await c.query('rollback') }
  })

  c.release()
  await getPool().end()
})
