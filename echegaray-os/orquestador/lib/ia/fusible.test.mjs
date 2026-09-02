// EL FUSIBLE DEL GASTO — cada control demuestra que PUEDE cortar, y su negativo que deja pasar.
// TODAS las pruebas con proveedor falso: cero llamadas Anthropic reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  iaBloqueada, conPresupuesto, conCorridaExclusiva, admitir, verificar, acreditarUsd,
  esVision, usdEstimado, presupuestoActual, FusibleCorto, CorridaDuplicada,
} from './fusible.mjs'
import { pedirTexto, CAPACIDAD } from './cliente.mjs'

// El entorno de estas pruebas ES una sesión de Claude Code (CLAUDECODE=1): el caso «bloqueada por
// defecto» se prueba contra el entorno real, no contra un simulacro.
const PERMISO = 'claude-code-explicito'
function conEnv(cambios, fn) {
  const previo = {}
  for (const [k, v] of Object.entries(cambios)) {
    previo[k] = process.env[k]
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  const restaurar = () => { for (const [k, v] of Object.entries(previo)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
  const r = fn()
  if (r && typeof r.finally === 'function') return r.finally(restaurar)
  restaurar()
  return r
}

const fetchFalso = () => {
  const llamadas = []
  const impl = async (url) => {
    llamadas.push(url)
    return {
      ok: true, status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], model: 'claude-haiku-fake', usage: { input_tokens: 10, output_tokens: 5 } }),
      text: async () => '',
    }
  }
  return { impl, llamadas }
}
const fetchRoto = () => {
  const llamadas = []
  const impl = async (url) => { llamadas.push(url); return { ok: false, status: 500, text: async () => 'server exploded', json: async () => ({}) } }
  return { impl, llamadas }
}

// ═══ 1 · BLOQUEO POR DEFECTO ═══

test('sin ORQ_IA_PERMITIR la API está bloqueada; en Claude Code ni el env de producción alcanza', () => {
  assert.match(iaBloqueada({}), /apagada por defecto/)
  assert.match(iaBloqueada({ ORQ_IA_PERMITIR: 'servicio', CLAUDECODE: '1' }), /Claude Code/)
  assert.match(iaBloqueada({ ORQ_IA_PERMITIR: 'si', ORQ_IA_BLOQUEADA: '1' }), /apagada a mano/)
  // Negativos: producción habilitada pasa; Claude Code con el permiso EXPLÍCITO pasa.
  assert.equal(iaBloqueada({ ORQ_IA_PERMITIR: 'servicio-produccion' }), null)
  assert.equal(iaBloqueada({ ORQ_IA_PERMITIR: PERMISO, CLAUDECODE: '1' }), null)
})

test('pedirTexto por el camino REAL sin permiso: el fusible corta ANTES de tocar la red', async () => {
  // Sin fetch inyectado (el transporte real) y sin ORQ_IA_PERMITIR: FusibleCorto ANTES del
  // proveedor. Si esta guarda regresionara, la llamada saldría con una clave falsa y el test
  // fallaría con otro error — nunca con gasto.
  await conEnv({ ORQ_IA_PERMITIR: undefined, ANTHROPIC_API_KEY: 'clave-falsa', ORQ_IA_SIN_REGISTRO: '1' }, async () => {
    await assert.rejects(
      () => pedirTexto({ capacidad: CAPACIDAD.SIMPLE, mensajes: [{ role: 'user', content: 'hola' }] }),
      (e) => e instanceof FusibleCorto && e.limite === 'bloqueada',
    )
  })
  // Negativo: un transporte INYECTADO (doble, no puede gastar) pasa y el presupuesto lo cuenta.
  const { impl, llamadas } = fetchFalso()
  await conEnv({ ANTHROPIC_API_KEY: 'clave-falsa', ORQ_IA_SIN_REGISTRO: '1' }, () =>
    conPresupuesto({}, async () => {
      const r = await pedirTexto({ capacidad: CAPACIDAD.SIMPLE, mensajes: [{ role: 'user', content: 'hola' }], fetchImpl: impl })
      assert.equal(r.texto, 'ok')
      assert.equal(presupuestoActual().llamadas, 1)
      assert.ok(presupuestoActual().usd > 0, 'el costo estimado del doble también se acredita')
    }))
  assert.equal(llamadas.length, 1)
})

// ═══ 2 · LÍMITES POR EJECUCIÓN ═══

test('límite de llamadas: la siguiente NO sale y lo obtenido se conserva', async () => {
  const { impl, llamadas } = fetchFalso()
  await conEnv({ ORQ_IA_PERMITIR: PERMISO, ANTHROPIC_API_KEY: 'clave-falsa', ORQ_IA_SIN_REGISTRO: '1' }, () =>
    conPresupuesto({ limites: { maxLlamadas: 2 } }, async () => {
      await pedirTexto({ mensajes: [{ role: 'user', content: 'a' }], fetchImpl: impl })
      await pedirTexto({ mensajes: [{ role: 'user', content: 'b' }], fetchImpl: impl })
      await assert.rejects(
        () => pedirTexto({ mensajes: [{ role: 'user', content: 'c' }], fetchImpl: impl }),
        (e) => e instanceof FusibleCorto && e.limite === 'llamadas',
      )
      assert.deepEqual(presupuestoActual().cortes, ['llamadas'])
    }))
  assert.equal(llamadas.length, 2)
})

test('el contador NO se reinicia por retry: cada intento consume presupuesto', async () => {
  const { impl, llamadas } = fetchRoto()
  await conEnv({ ORQ_IA_PERMITIR: PERMISO, ANTHROPIC_API_KEY: 'clave-falsa', ORQ_IA_SIN_REGISTRO: '1' }, () =>
    conPresupuesto({ limites: { maxLlamadas: 10 } }, async () => {
      await assert.rejects(() => pedirTexto({ mensajes: [{ role: 'user', content: 'x' }], fetchImpl: impl, reintentos: 2 }))
      assert.equal(presupuestoActual().llamadas, 3, 'tres intentos son tres llamadas, no una')
    }))
  assert.equal(llamadas.length, 3)
})

test('límite de visión y de USD cortan la SIGUIENTE llamada; el runtime corta la ejecución', () => {
  conPresupuesto({ limites: { maxVision: 1 } }, () => {
    admitir({ vision: true, env: { ORQ_IA_PERMITIR: 'si' } })
    assert.throws(() => admitir({ vision: true, env: { ORQ_IA_PERMITIR: 'si' } }), (e) => e.limite === 'vision')
    // Negativo: una llamada SIN visión sigue pasando — el corte es del fan-out visual.
    admitir({ env: { ORQ_IA_PERMITIR: 'si' } })
  })
  conPresupuesto({ limites: { maxUsd: 5 } }, () => {
    admitir({ env: { ORQ_IA_PERMITIR: 'si' } })
    acreditarUsd(5.01)
    assert.throws(() => admitir({ env: { ORQ_IA_PERMITIR: 'si' } }), (e) => e.limite === 'usd')
  })
  conPresupuesto({ limites: { maxMs: 0 } }, () => {
    assert.throws(() => admitir({ env: { ORQ_IA_PERMITIR: 'si' } }), (e) => e.limite === 'runtime')
  })
})

// ═══ 3 · CANCELACIÓN (el zombi de La Estrella) ═══

test('pedido cancelado: el fan-out se detiene en la próxima llamada, sin perder lo obtenido', () => {
  const ac = new AbortController()
  conPresupuesto({ señal: ac.signal }, () => {
    admitir({ env: { ORQ_IA_PERMITIR: 'si' } })            // antes de cancelar, pasa
    ac.abort()
    assert.throws(() => admitir({ env: { ORQ_IA_PERMITIR: 'si' } }), (e) => e.limite === 'cancelado')
    assert.throws(() => verificar({ env: { ORQ_IA_PERMITIR: 'si' } }), (e) => e.limite === 'cancelado')
    assert.equal(presupuestoActual().llamadas, 1, 'lo ya admitido no se pierde')
  })
})

// ═══ 4 · DOBLE CORRIDA ═══

test('dos corridas equivalentes no conviven; al terminar, la clave se libera', async () => {
  let resolver
  const larga = conCorridaExclusiva('plano:quattropani', () => new Promise((r) => { resolver = r }))
  await assert.rejects(() => conCorridaExclusiva('PLANO:QUATTROPANI', async () => {}), (e) => e instanceof CorridaDuplicada)
  await conCorridaExclusiva('plano:otra-obra', async () => 'ok')   // otra clave no se bloquea
  resolver('listo')
  assert.equal(await larga, 'listo')
  assert.equal(await conCorridaExclusiva('plano:quattropani', async () => 'de nuevo'), 'de nuevo')
})

// ═══ 5 · VISIÓN Y ESTIMACIÓN ═══

test('esVision detecta imagen/documento; usdEstimado estima por familia y jamás inventa', () => {
  assert.equal(esVision([{ role: 'user', content: [{ type: 'image', source: {} }] }]), true)
  assert.equal(esVision([{ role: 'user', content: [{ type: 'document', source: {} }] }]), true)
  assert.equal(esVision([{ role: 'user', content: 'texto plano' }]), false)
  assert.equal(usdEstimado('claude-opus-5', { in: 1_000_000, out: 0 }), 15)
  assert.equal(usdEstimado('claude-haiku-4-5', { in: 0, out: 1_000_000 }), 5)
  assert.equal(usdEstimado('modelo-desconocido', { in: 1000, out: 1000 }), null)
  assert.equal(usdEstimado('claude-opus-5', {}), null)
})

// ═══ 6 · NINGÚN CALLER SE SALTEA EL FUSIBLE (invariante de código) ═══

test('todo archivo del repo que llama a Anthropic atraviesa el fusible', () => {
  const raiz = join(import.meta.dirname, '..', '..')
  const runtime = []
  const recorrer = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n.startsWith('.')) continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { recorrer(p); continue }
      if (!n.endsWith('.mjs') || n.includes('.test.')) continue
      const src = readFileSync(p, 'utf8')
      // Llama a Anthropic quien arma la RUTA del endpoint (fetch a /v1/messages) o usa el SDK.
      const llamaDirecto = /\/v1\/messages/.test(src) || /messages\.create\(/.test(src)
      if (llamaDirecto) runtime.push({ p: p.slice(raiz.length + 1), conFusible: /fusible/.test(src) })
    }
  }
  recorrer(raiz)
  const sinFusible = runtime.filter((f) => !f.conFusible).map((f) => f.p)
    // Los que sólo NOMBRAN la URL sin llamar (listas, mensajes de error, el verificador).
    .filter((p) => !['lib/ia/medidor.mjs', 'scripts/xsas-sin-llm.mjs', 'scripts/verificar-independencia-ia.mjs'].includes(p))
  assert.deepEqual(sinFusible, [], `llamadores de Anthropic sin fusible: ${sinFusible.join(', ')}`)
  assert.ok(runtime.some((f) => f.p === 'lib/ia/proveedores/anthropic.mjs' && f.conFusible), 'el proveedor mismo verifica')
})
