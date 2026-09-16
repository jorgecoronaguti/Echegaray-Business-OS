// LA CLASIFICACIÓN DE RIESGO DECIDE SI CLAUDE ENTRA O NO. Por eso es determinística y se prueba:
// una decisión así no puede depender de un modelo, y un control que no puede dar rojo no controla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, escaleraDe, RIESGO, ESTADO, correrTarea, leerBloqueadas } from './router.mjs'
import { claudeDisponible, ClaudeNoDisponible, ejecutorClaude } from './ejecutores.mjs'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('D3 por señal: migración, RLS, Sheet, finanzas, producción, seguridad', () => {
  for (const t of [
    { titulo: 'agregar columna', archivos: ['supabase/migrations/2026_x.sql'] },
    { titulo: 'arreglar la policy de RLS de obras', archivos: ['src/a.ts'] },
    { titulo: 'replicar _UOCRA_RAW del Sheet a Postgres', archivos: ['orquestador/scripts/x.mjs'] },
    { titulo: 'corregir el cálculo de la caja', archivos: ['src/a.ts'] },
    { titulo: 'un timer nuevo en producción', archivos: ['src/a.ts'] },
    { titulo: 'rotar el token de auth', archivos: ['src/a.ts'] },
  ]) assert.equal(clasificar(t).riesgo, RIESGO.D3, `debía ser D3: ${t.titulo}`)
})

test('D3 GANA aunque el archivo sea un .tsx inocente — falla hacia arriba', () => {
  const c = clasificar({ titulo: 'mostrar el cash flow', archivos: ['src/components/A.tsx'] })
  assert.equal(c.riesgo, RIESGO.D3)
})

test('D0 cuando la tarea se expresa como transformación pura', () => {
  assert.equal(clasificar({ titulo: 'renombrar rótulo', archivos: ['src/a.tsx'], transformar: (s) => s }).riesgo, RIESGO.D0)
})

test('D1 un solo archivo liviano · D2 varios', () => {
  assert.equal(clasificar({ titulo: 'poner al día el spec', archivos: ['tests/a.spec.ts'] }).riesgo, RIESGO.D1)
  assert.equal(clasificar({ titulo: 'poner al día', archivos: ['tests/a.spec.ts', 'src/c/B.tsx'] }).riesgo, RIESGO.D2)
})

test('CLAUDE NO ES LA PRIMERA OPCIÓN en ningún riesgo salvo D3', () => {
  for (const r of [RIESGO.D0, RIESGO.D1, RIESGO.D2]) {
    assert.notEqual(escaleraDe(r)[0], 'claude', `en ${r} Claude no puede ir primero`)
  }
  assert.deepEqual(escaleraDe(RIESGO.D0), ['deterministico'], 'D0 no llama a ningún modelo')
  assert.deepEqual(escaleraDe(RIESGO.D3), ['claude'], 'D3 no se degrada sola a un modelo más chico')
})

test('CLAUDE_UNAVAILABLE: el ejecutor Claude tira y NO devuelve nada simulado', async () => {
  const antes = process.env.CLAUDE_UNAVAILABLE
  process.env.CLAUDE_UNAVAILABLE = '1'
  try {
    assert.equal(claudeDisponible(), false)
    await assert.rejects(() => ejecutorClaude({ instruccion: 'x' }), (e) => e instanceof ClaudeNoDisponible && e.esperaAClaude === true)
  } finally { if (antes === undefined) delete process.env.CLAUDE_UNAVAILABLE; else process.env.CLAUDE_UNAVAILABLE = antes }
})

test('una tarea D3 con CLAUDE_UNAVAILABLE queda BLOQUEADA y se persiste para retomar', async () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'devrouter-'))
  const antes = process.env.CLAUDE_UNAVAILABLE
  process.env.CLAUDE_UNAVAILABLE = '1'
  try {
    const tz = await correrTarea(raiz, { id: 'T-rls', titulo: 'arreglar la policy de RLS', objetivo: 'x', archivos: ['src/a.ts'], plan: [] })
    assert.equal(tz.estado, ESTADO.BLOQUEADA_ESPERA_CLAUDE)
    const pend = JSON.parse(readFileSync(path.join(raiz, '.claude/estado/dev-router-bloqueadas.json'), 'utf8'))
    assert.equal(pend[0].id, 'T-rls', 'el bloqueo se persiste con su id para retomarlo')
    const bit = readFileSync(path.join(raiz, '.claude/estado/dev-router.jsonl'), 'utf8')
    assert.match(bit, /bloqueada-espera-claude/)
  } finally { if (antes === undefined) delete process.env.CLAUDE_UNAVAILABLE; else process.env.CLAUDE_UNAVAILABLE = antes }
})

test('EL VERIFICADOR MANDA: si el plan da rojo, la tarea NO se acepta aunque el ejecutor diga ok', async () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'devrouter-'))
  const antes = process.env.CLAUDE_UNAVAILABLE
  process.env.CLAUDE_UNAVAILABLE = '1'
  let veces = 0
  try {
    const tz = await correrTarea(raiz, {
      id: 'T-miente', titulo: 'editar un spec', archivos: ['tests/a.spec.ts'], objetivo: 'x',
      intentos: { deterministico: async () => { veces += 1; return { ok: true, ejecutor: 'deterministico', ms: 1, costoUsd: 0, porQue: 'dije que sí' } } },
      plan: [async () => ({ nombre: 'control', verde: false, codigo: 1, ms: 1, cola: 'rojo a propósito', comando: 'false' })],
    }, { maxReparaciones: 1 })
    assert.notEqual(tz.estado, ESTADO.ACEPTADA, 'no se acepta contra un verificador en rojo')
    // Y ES CORRECTO que termine bloqueada, no rechazada: agotó los ejecutores baratos, llegó a
    // Claude, y Claude no está. Eso NO es un fracaso del router: es la respuesta honesta —
    // «esto sí necesita a Claude», persistida para cuando vuelva.
    assert.equal(tz.estado, ESTADO.BLOQUEADA_ESPERA_CLAUDE)
    assert.equal(veces, 2, 'intentó reparar antes de rendirse')
  } finally { if (antes === undefined) delete process.env.CLAUDE_UNAVAILABLE; else process.env.CLAUDE_UNAVAILABLE = antes }
})

test('en verde y sin reparaciones, la tarea se acepta y queda en la bitácora', async () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'devrouter-'))
  const tz = await correrTarea(raiz, {
    id: 'T-ok', titulo: 'editar un spec', archivos: ['tests/a.spec.ts'], objetivo: 'x',
    intentos: { deterministico: async () => ({ ok: true, ejecutor: 'deterministico', ms: 1, costoUsd: 0, porQue: 'ok' }) },
    plan: [async () => ({ nombre: 'control', verde: true, codigo: 0, ms: 1, cola: '', comando: 'true' })],
  })
  assert.equal(tz.estado, ESTADO.ACEPTADA)
  assert.equal(tz.ejecutorQueLaHizo, 'deterministico')
  assert.match(readFileSync(path.join(raiz, '.claude/estado/dev-router.jsonl'), 'utf8'), /aceptada/)
})

test('una tarea que se resuelve SALE de la lista de bloqueadas — si no, el handoff miente', async () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'devrouter-'))
  const antes = process.env.CLAUDE_UNAVAILABLE
  process.env.CLAUDE_UNAVAILABLE = '1'
  try {
    // Primero falla y queda bloqueada…
    await correrTarea(raiz, { id: 'T-doble', titulo: 'editar un spec', archivos: ['tests/a.spec.ts'], objetivo: 'x',
      intentos: { deterministico: async () => ({ ok: false, ms: 1, costoUsd: 0, porQue: 'no pude' }) }, plan: [] }, { maxReparaciones: 0 })
    assert.equal(leerBloqueadas(raiz).length, 1)
    // …y después el mismo id se resuelve.
    const ok = await correrTarea(raiz, { id: 'T-doble', titulo: 'editar un spec', archivos: ['tests/a.spec.ts'], objetivo: 'x',
      intentos: { deterministico: async () => ({ ok: true, ms: 1, costoUsd: 0, porQue: 'ahora sí' }) },
      plan: [async () => ({ nombre: 'c', verde: true, codigo: 0, ms: 1, cola: '', comando: 'true' })] })
    assert.equal(ok.estado, ESTADO.ACEPTADA)
    assert.deepEqual(leerBloqueadas(raiz), [], 'ya no puede seguir figurando como pendiente de Claude')
  } finally { if (antes === undefined) delete process.env.CLAUDE_UNAVAILABLE; else process.env.CLAUDE_UNAVAILABLE = antes }
})
