// EL CONTEXTO DE TRABAJO DE /XSAS. Cada test prueba un defecto: revertir el arreglo pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cargarContexto, guardarContexto, referenciaContextual, acotarArchivos, caratulaDeLectura,
  MAX_ARCHIVOS_ACTIVOS,
} from './xsas-contexto.mjs'

/** Una base falsa clavada por (actor, correlación) — sobrevive a «reinicios» porque vive afuera
 *  de las funciones que se prueban, igual que Postgres vive afuera del proceso. */
function baseFalsa() {
  const filas = new Map()
  const query = async (sql, args) => {
    if (/^select/i.test(sql.trim())) {
      const f = filas.get(`${args[0]}|${args[1]}`)
      return { rows: f ? [{ datos: f }] : [] }
    }
    if (/^insert/i.test(sql.trim())) {
      const clave = `${args[0]}|${args[1]}`
      filas.set(clave, { ...(filas.get(clave) ?? {}), ...JSON.parse(args[2]) })
      return { rows: [] }
    }
    return { rows: [] }
  }
  return { query, filas }
}

test('guardar y recargar: el contexto SOBREVIVE fuera de la RAM del que lo escribió', async () => {
  const db = baseFalsa()
  const ok = await guardarContexto(db.query, {
    actorId: 'u1', correlacionId: 'c1',
    parche: { archivos: [{ hash: 'h1', nombre: 'x.csv', destino: 'planilla' }] },
  })
  assert.equal(ok, true)
  // «Reinicio»: nada en memoria del caller; la única fuente es la base.
  const ctx = await cargarContexto(db.query, { actorId: 'u1', correlacionId: 'c1' })
  assert.equal(ctx.archivos[0].hash, 'h1')
})

test('AISLAMIENTO: otro actor con el MISMO correlation_id no ve nada', async () => {
  const db = baseFalsa()
  await guardarContexto(db.query, { actorId: 'u1', correlacionId: 'c1', parche: { archivos: [{ hash: 'h1' }] } })
  const ajeno = await cargarContexto(db.query, { actorId: 'u2', correlacionId: 'c1' })
  assert.equal(ajeno, null, 'conocer el correlation_id de otro no alcanza')
})

test('sin base no lanza: carga null, guarda false', async () => {
  assert.equal(await cargarContexto(null, { actorId: 'u1', correlacionId: 'c1' }), null)
  assert.equal(await guardarContexto(null, { actorId: 'u1', correlacionId: 'c1', parche: { x: 1 } }), false)
})

test('los archivos activos no crecen sin techo y no se duplican por hash', () => {
  const previos = Array.from({ length: 12 }, (_, i) => ({ hash: `viejo${i}` }))
  const out = acotarArchivos(previos, [{ hash: 'nuevo' }, { hash: 'viejo0' }])
  assert.equal(out.length, MAX_ARCHIVOS_ACTIVOS)
  assert.equal(out[0].hash, 'nuevo', 'los nuevos primero')
  assert.equal(out.filter((a) => a.hash === 'viejo0').length, 1, 'sin duplicados')
})

test('la carátula no arrastra el parse: identidad y forma, nada más', () => {
  const c = caratulaDeLectura({ hash: 'h', nombre: 'n', destino: 'pdf', formato: 'pdf', tamano: 9, resumen: { texto: 'x'.repeat(9999) }, adjunto: {} })
  assert.deepEqual(Object.keys(c).sort(), ['destino', 'formato', 'hash', 'nombre', 'tamano'])
})

test('referenciaContextual reconoce el español real y NO secuestra preguntas nuevas', () => {
  for (const [f, aspecto] of [
    ['ahora mostrame lo que quedo pendiente', 'pendiente'],
    ['mostrame eso de nuevo', 'resumen'],
    ['segui', 'resumen'],
    ['hacelo', 'resumen'],
    ['armame un resumen de eso', 'resumen'],
    ['revisá los que no cerraron', 'pendiente'],
    ['q decia el archivo', 'resumen'],
  ]) {
    const r = referenciaContextual(f)
    assert.equal(r.es, true, `debía ser referencia: ${f}`)
    assert.equal(r.aspecto, aspecto, `aspecto de: ${f}`)
  }
  for (const f of [
    'que vence esta semana',
    'como venimos',
    'cuanta plata hay en caja hoy',
    'necesito q edites el sheet flujo de fondos',
    'quien nos debe',
  ]) assert.equal(referenciaContextual(f).es, false, `NO debía ser referencia: ${f}`)
})
