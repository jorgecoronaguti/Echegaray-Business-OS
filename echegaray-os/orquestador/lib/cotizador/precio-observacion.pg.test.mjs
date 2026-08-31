// EL CAMINO DE ESCRITURA, PROBADO CONTRA LA BASE REAL: PREVIEW → APLICAR → ROLLBACK → IDEMPOTENCIA.
//
// ═══ POR QUÉ ESTO NO SE PUEDE PROBAR CON MOCKS ═══
//
// Lo que se prueba acá no es que el código llame al insert: es que la BASE haga cumplir las reglas
// aunque el código se equivoque. Un CHECK que rechaza una firma humana fabricada es un control
// INDEPENDIENTE del módulo que lo produce; un mock del insert es el mismo código diciéndose que sí.
//
// ═══ CÓMO SE ESCRIBE SIN TOCAR PRODUCCIÓN ═══
//
// TODO va dentro de un `begin` sobre UNA conexión tomada con `pool.connect()`, y se revierte en el
// `after`. Con `pool.query` el begin, el insert y el rollback pueden caer en tres conexiones
// distintas y la transacción no envuelve nada — este repo ya perdió filas así. Además los recursos
// se crean con prefijo `ZZ` para que, si algo se escapara, se vea de lejos que no es de nadie.

import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { observacion, seleccionar, aplicar, TIPO_FUENTE, IVA } from './precio-observacion.mjs'
import { poderDeObservacion, autorizacion, PODER } from './precio-governance.mjs'
import { guardarObservaciones, aplicarObservacion, observacionesDeRecurso } from './precio-observacion.pg.mjs'

const pool = getPool()
let cliente = null
const query = (s, p) => cliente.query(s, p)
const CODIGO = 'ZZ_PRECIO_OBS_TEST'
const REGLA = { id: 'JERARQUIA_FUENTE', version: 1 }
let recursoId = null

before(async () => {
  cliente = await pool.connect()
  await query('begin')
  const { rows } = await query(
    `insert into public.recurso (codigo, nombre, unidad, tipo, familia, activo)
     values ($1, 'RECURSO DE PRUEBA ZZ', 'm2', 'material', 'MATERIAL', true) returning id`, [CODIGO])
  recursoId = rows[0].id
})

after(async () => {
  if (cliente) { try { await query('rollback') } catch { /* ya revertida */ } cliente.release() }
  await pool.end()
})

/** Un intento que SE ESPERA que la base rechace. El savepoint es obligatorio: un error deja la
 *  transacción abortada y todo lo que siga falla por arrastre, escondiendo el test real. */
async function rechazaLaBase(sql, params = []) {
  await query('savepoint intento')
  try {
    await query(sql, params)
    await query('release savepoint intento')
    return null
  } catch (e) {
    await query('rollback to savepoint intento')
    return String(e.message)
  }
}

const obs = (extra = {}) => observacion({
  recursoId, recursoCodigo: CODIGO, descripcion: 'Panel de prueba 50 mm', spec: 'panel prueba 50mm',
  valor: 92_000, unidad: 'm2', tipoFuente: TIPO_FUENTE.WEB, url: 'https://corralon-uno.com.ar/panel',
  observadoEn: '2026-08-31', iva: IVA.SIN_IVA, jurisdiccion: 'AR-SJ', ...extra,
})

test('PREVIEW · guardar la OBSERVACIÓN no toca el catálogo: es un hecho, no una decisión', async () => {
  const antes = (await query('select count(*)::int n from public.recurso_precio where recurso_id = $1', [recursoId])).rows[0].n
  const entraron = await guardarObservaciones({ query }, { observaciones: [obs()] })
  assert.equal(entraron.length, 1)
  const despues = (await query('select count(*)::int n from public.recurso_precio where recurso_id = $1', [recursoId])).rows[0].n
  assert.equal(despues, antes, 'observar no puede cambiar ningún precio')
})

test('IDEMPOTENCIA · la misma observación dos veces NO infla la serie', async () => {
  const entraron = await guardarObservaciones({ query }, { observaciones: [obs()] })
  assert.deepEqual(entraron, [], 'el hash ya estaba: la segunda corrida no agrega un eco de sí misma')
  const serie = await observacionesDeRecurso({ query }, { recursoCodigo: CODIGO })
  assert.equal(serie.length, 1)
})

test('la BASE rechaza un precio de cero, aunque el código lo dejara pasar', async () => {
  const e = await rechazaLaBase(
    `insert into public.precio_observacion (hash, recurso_codigo, valor, moneda, unidad, tipo_fuente, url, observado_en)
     values ('zz-cero','${CODIGO}', 0, 'ARS','m2','WEB','https://x.com.ar','2026-08-31')`)
  assert.match(String(e), /precio_observacion_valor_positivo/)
})

test('la BASE rechaza una observación sin manera de volver a consultarla', async () => {
  const e = await rechazaLaBase(
    `insert into public.precio_observacion (hash, recurso_codigo, valor, moneda, unidad, tipo_fuente, observado_en)
     values ('zz-sin-fuente','${CODIGO}', 100, 'ARS','m2','WEB','2026-08-31')`)
  assert.match(String(e), /precio_observacion_citable/)
})

test('LA REGLA · la BASE rechaza un valido_hasta que la fuente NO declaró', async () => {
  const e = await rechazaLaBase(
    `insert into public.precio_observacion (hash, recurso_codigo, valor, moneda, unidad, tipo_fuente, url, observado_en, valido_hasta, valido_hasta_lo_dice_la_fuente)
     values ('zz-validez','${CODIGO}', 100, 'ARS','m2','WEB','https://x.com.ar','2026-08-31','2026-12-31', false)`)
  assert.match(String(e), /precio_observacion_validez_es_un_hecho/)
})

test('LA REGLA · la BASE rechaza una firma humana sin firmante — no alcanza con que el código prometa', async () => {
  const e = await rechazaLaBase(
    `insert into public.precio_aplicacion (observacion_hash, recurso_codigo, valor, moneda, unidad, destino, autorizado_por_tipo, autorizado_por, seleccion, procedencia)
     select hash, '${CODIGO}', 100, 'ARS','m2','public.recurso_precio','HUMANO','el sistema','{}'::jsonb,'{}'::jsonb
       from public.precio_observacion where recurso_codigo = '${CODIGO}' limit 1`)
  assert.match(String(e), /precio_aplicacion_firma_humana_es_real/)
})

test('APLICAR SIN AUTORIZACIÓN · la governance dice PROPONER y el catálogo no se toca', async () => {
  const o = obs()
  const v = poderDeObservacion({ observacion: o, material: true, hoy: new Date('2026-08-31T00:00:00Z') })
  assert.equal(v.poder, PODER.PROPONER)
  const auth = autorizacion({ observacion: o, veredicto: v })
  const sel = seleccionar({ observaciones: [o], regla: REGLA })
  assert.throws(() => aplicar({ seleccion: sel, autorizacion: auth, destino: 'public.recurso_precio' }), /NO autoriza/)
  const n = (await query('select count(*)::int n from public.precio_aplicacion where recurso_codigo = $1', [CODIGO])).rows[0].n
  assert.equal(n, 0)
})

test('APLICAR CON FIRMA REAL · escribe la aplicación Y el catálogo, con la procedencia entera', async () => {
  const o = obs()
  const v = poderDeObservacion({ observacion: o, material: true, hoy: new Date('2026-08-31T00:00:00Z') })
  const auth = autorizacion({ observacion: o, veredicto: v, firmadaPor: 'jorge@ecsas.com.ar' })
  const sel = seleccionar({ observaciones: [o, obs({ valor: 99_000, url: 'https://corralon-dos.com.ar/p' })], regla: REGLA })
  const acto = aplicar({ seleccion: sel, autorizacion: auth, destino: 'public.recurso_precio' })
  const r = await aplicarObservacion({ query }, { recursoId, acto })

  assert.equal(r.aplicacion.autorizado_por_tipo, 'HUMANO')
  assert.equal(r.aplicacion.firmada_por, 'jorge@ecsas.com.ar')
  // EL EFECTO LEÍDO EN SU DESTINO, no la pantalla que dijo que sí.
  const fila = (await query('select costo, fuente, vigente from public.recurso_precio where recurso_id = $1 and vigente is true', [recursoId])).rows
  assert.equal(fila.length, 1, 'no puede quedar más de un precio vigente')
  assert.equal(Number(fila[0].costo), o.valor)
  assert.match(fila[0].fuente, /autorizado por HUMANO:jorge@ecsas\.com\.ar/)

  // PROCEDENCIA: los tres actos trazados en la fila de aplicación.
  const p = (await query('select procedencia, seleccion from public.precio_aplicacion where observacion_hash = $1', [o.hash])).rows[0]
  assert.equal(p.procedencia.acto1_observacion, o.hash)
  assert.equal(p.seleccion.regla.id, 'JERARQUIA_FUENTE')
  assert.equal(p.seleccion.descartadas, 1, 'la observación que no ganó queda contada, no borrada')
})

test('APLICAR DOS VECES · la serie crece y el vigente sigue siendo UNO SOLO', async () => {
  const o = obs({ valor: 95_000, url: 'https://corralon-tres.com.ar/p' })
  await guardarObservaciones({ query }, { observaciones: [o] })
  const v = poderDeObservacion({ observacion: o, material: false, hoy: new Date('2026-08-31T00:00:00Z'), coincidencias: [{ url: 'https://corralon-dos.com.ar/p', valor: 96_000, moneda: 'ARS' }] })
  assert.equal(v.poder, PODER.RESOLVER, 'no material y con dos fuentes independientes: la REGLA alcanza, sin firma')
  const auth = autorizacion({ observacion: o, veredicto: v })
  assert.equal(auth.firmadaPor, null, 'una autorización por regla NO lleva el nombre de nadie')
  const acto = aplicar({ seleccion: seleccionar({ observaciones: [o], regla: REGLA }), autorizacion: auth, destino: 'public.recurso_precio' })
  await aplicarObservacion({ query }, { recursoId, acto })

  const filas = (await query('select costo, vigente from public.recurso_precio where recurso_id = $1 order by cargado_en', [recursoId])).rows
  assert.equal(filas.length, 2, 'la fila vieja NO se pisa: sin serie no se puede medir la volatilidad')
  assert.equal(filas.filter((f) => f.vigente).length, 1)
  assert.equal(Number(filas.find((f) => f.vigente).costo), 95_000)
})

test('ROLLBACK · nada de todo esto sobrevive fuera de la transacción', async () => {
  // Se comprueba desde OTRA conexión del pool, que no ve lo no comiteado: si algo se hubiera
  // escapado del `begin`, acá aparecería.
  const otra = await pool.connect()
  try {
    const { rows } = await otra.query('select count(*)::int n from public.precio_observacion where recurso_codigo = $1', [CODIGO])
    assert.equal(rows[0].n, 0, 'una escritura de test visible desde otra conexión es una escritura que quedó en producción')
  } finally { otra.release() }
})
