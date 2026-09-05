// LA DEFINICIÓN DE AUTONOMÍA, PROBADA — porque una métrica mal definida dirige mal el trabajo.
//
// Lo que se cuida acá no es la aritmética: es que la métrica NO se pueda mejorar empeorando el OS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autonomyRate, desenlaceDeLlm, desenlaceDeTraza, pct, tasa } from './autonomia.mjs'

test('abstenerse NO cuenta como resolver: el piso que dice «no sé» no infla la autonomía', () => {
  assert.equal(desenlaceDeTraza({ metodo: 'ml-local', accion: 'descartar' }), 'ABSTUVO')
  assert.equal(desenlaceDeTraza({ metodo: 'sin-resolver', accion: 'aplicar' }), 'ABSTUVO')
  assert.equal(desenlaceDeTraza({ metodo: 'ml-local', accion: 'aplicar' }), 'RESUELTO')
  assert.equal(desenlaceDeTraza({ metodo: 'regla', accion: 'sugerir' }), 'RESUELTO')
})

test('Claude es escalamiento; cualquier otro proveedor es autonomía', () => {
  assert.equal(desenlaceDeLlm({ proveedor: 'anthropic', ok: true }), 'ESCALADO')
  assert.equal(desenlaceDeLlm({ proveedor: 'huggingface', ok: true }), 'RESUELTO')
  // Una llamada fallida no es ninguna de las dos: no resolvió nada y tampoco escaló.
  assert.equal(desenlaceDeLlm({ proveedor: 'anthropic', ok: false }), 'FALLO')
})

test('abstenerse más NO sube la autonomía: la abstención vive fuera del denominador', () => {
  const pocoAbstenido = tasa({ resuelto: 8, escalado: 2, abstuvo: 0 })
  const muyAbstenido = tasa({ resuelto: 8, escalado: 2, abstuvo: 990 })
  // Éste es EL test de la métrica. Si abstenerse subiera la autonomía, el camino más corto para
  // «mejorar» sería subir todos los umbrales hasta que el OS no conteste nada — y el número diría
  // 100% mientras el sistema deja de servir.
  assert.equal(pocoAbstenido.autonomia, muyAbstenido.autonomia)
  // Y sin embargo la abstención NO se esconde: se informa, y ahí se ve el 99%.
  assert.ok(muyAbstenido.abstencion > 0.98)
  assert.equal(pocoAbstenido.abstencion, 0)
})

test('escalar a Claude sí baja la autonomía, que es lo que la métrica tiene que capturar', () => {
  assert.equal(tasa({ resuelto: 10, escalado: 0 }).autonomia, 1)
  assert.equal(tasa({ resuelto: 0, escalado: 10 }).autonomia, 0)
  assert.equal(tasa({ resuelto: 5, escalado: 5 }).autonomia, 0.5)
})

test('sin operaciones la tasa es null, no 0: no se afirma sobre lo que no se midió', () => {
  const t = tasa({})
  assert.equal(t.autonomia, null)
  assert.equal(pct(t.autonomia), '—')
  // Un 0% diría «el OS no es autónomo». Un 100% diría lo contrario. Las dos serían inventadas.
})

test('el rate sale de las dos tablas y las suma por módulo', async () => {
  const query = async (sql) => (sql.includes('ml_traza')
    ? { rows: [
      { modulo: 'documentos', metodo: 'ml-local', accion: 'aplicar', n: 12 },
      { modulo: 'documentos', metodo: 'ml-local', accion: 'descartar', n: 369 },
      { modulo: 'drive-busqueda', metodo: 'ml-local', accion: 'aplicar', n: 40 },
    ] }
    : { rows: [
      { modulo: 'documentos', proveedor: 'anthropic', ok: true, n: 4 },
      { modulo: 'drive-busqueda', proveedor: 'huggingface', ok: true, n: 10 },
      { modulo: 'drive-busqueda', proveedor: 'anthropic', ok: false, n: 3 },
    ] })

  const r = await autonomyRate(query)
  const docs = r.porModulo.find((m) => m.modulo === 'documentos')
  assert.equal(docs.resuelto, 12)
  assert.equal(docs.escalado, 4)
  assert.equal(docs.abstuvo, 369)
  assert.equal(docs.autonomia, 12 / 16)

  const drive = r.porModulo.find((m) => m.modulo === 'drive-busqueda')
  assert.equal(drive.resuelto, 50, 'HF y el modelo local suman los dos a la autonomía')
  assert.equal(drive.escalado, 0, 'una llamada fallida no cuenta como escalamiento')

  assert.equal(r.global.resuelto, 62)
  assert.equal(r.global.escalado, 4)
})

test('los módulos se ordenan por operaciones contestadas, no por su tasa', () => {
  // Un módulo con 2 operaciones y 100% no puede encabezar el reporte por encima de uno con 600.
  // Ordenar por tasa haría que lo primero que se lee sea siempre lo menos representativo.
  const filas = [{ contestadas: 2 }, { contestadas: 600 }, { contestadas: 50 }]
  filas.sort((a, b) => b.contestadas - a.contestadas)
  assert.deepEqual(filas.map((f) => f.contestadas), [600, 50, 2])
})

// ── EL COSTO POR OPERACIÓN AUTÓNOMA ─────────────────────────────────────────────────────────────

import { costoPorAutonoma } from './autonomia.mjs'

test('el costo por autónoma incluye lo que se gastó ESCALANDO, no sólo lo que resolvió', () => {
  // Si para resolver 10 solo hubo que mandar 90 a Claude, esas 10 salieron carísimas. Un
  // denominador de «operaciones autónomas» con un numerador de «costo de las autónomas» daría $0
  // —las locales no facturan— y diría que la autonomía es gratis. Es al revés: es cara mientras
  // el resto siga escalando.
  const c = costoPorAutonoma({ usdTotal: 42.62, usdClaude: 42.62, usdHf: 0, resuelto: 238 })
  assert.equal(Math.round(c.porAutonoma * 1000) / 1000, 0.179)
  assert.equal(c.fraccionClaude, 1)
})

test('el costo local se informa $0 EN CAJA y no se estima cómputo', () => {
  // Un modelo en la VM consume CPU y RAM que ya están pagadas. Prorratearlas por operación sería
  // fabricar un número, y haría que la comparación contra Claude pareciera más precisa de lo que es.
  assert.equal(costoPorAutonoma({ usdTotal: 10, resuelto: 5 }).usdLocal, 0)
})

test('sin operaciones autónomas el costo por autónoma es null, no infinito ni cero', () => {
  const c = costoPorAutonoma({ usdTotal: 10, usdClaude: 10, resuelto: 0 })
  assert.equal(c.porAutonoma, null)
  // Un 0 diría «resolver solo es gratis»; un Infinity rompería el reporte. Null dice la verdad:
  // no hubo ninguna operación autónoma sobre la cual repartir el gasto.
})

test('el gasto de una llamada FALLIDA también cuenta', async () => {
  const query = async (sql) => (sql.includes('ml_traza')
    ? { rows: [] }
    : { rows: [
      { modulo: 'x', proveedor: 'anthropic', ok: true, n: 1, usd: 1 },
      { modulo: 'x', proveedor: 'anthropic', ok: false, n: 3, usd: 0.5 },
    ] })
  const r = await autonomyRate(query)
  // Equivocarse consumió cuota y tiempo. Borrarlo del total haría parecer que es gratis.
  assert.equal(r.costo.usdTotal, 1.5)
  assert.equal(r.global.escalado, 1, 'las fallidas no cuentan como escalamiento resuelto')
})
