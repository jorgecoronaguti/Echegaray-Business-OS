// CONSOLIDACIÓN DEL NÚCLEO — cada test protege un invariante del DoD, y cada control PUEDE dar rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { atender } from './xsas-gateway.mjs'
import { partirObjetivo, toolsDelNucleo, invalidarTools } from './xsas-resolutores.mjs'

const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('el camino determinístico llamó al modelo') },
  pedirTextoONull: async () => { throw new Error('el camino determinístico llamó al modelo') },
})

// ── partirObjetivo: conservador por diseño ─────────────────────────────────────────────────

test('partirObjetivo: parte por separadores fuertes y NO parte una frase con «y» interno', () => {
  assert.deepEqual(
    partirObjetivo('como estamos de caja y que vence esta semana'),
    ['como estamos de caja', 'que vence esta semana'])
  assert.deepEqual(partirObjetivo('mostrame efectivo y banco'), [], '«banco» solo no es un pedido')
  assert.deepEqual(partirObjetivo('hola'), [])
  assert.equal(partirObjetivo('a b; c d; e f; g h; i j; k l; m n').length, 0, 'más de 6 partes no es un objetivo: es una lista')
})

// ── objetivo compuesto: varias capacidades, residuo declarado, 0 modelo ────────────────────

const toolLectura = (nombre, descripcion, corridas) => ({
  capability: 'drive.read',
  schema: { name: nombre, description: descripcion, input_schema: { type: 'object', properties: {}, required: [] } },
  async run(a) { corridas.push(nombre); return { resumen_texto: `resultado de ${nombre}` } },
})

function registroDoble(corridas) {
  const mapa = new Map([
    ['caja.vencido', toolLectura('vencimientos_de_caja', 'QUÉ VENCE esta semana. USALO cuando pregunten "que vence esta semana".', corridas)],
    ['os.cobranzas', toolLectura('estado_cobranzas', 'QUIÉN NO COBRÓ y el estado de cobranzas. USALO cuando pregunten "quien no cobro", "como vienen las cobranzas".', corridas)],
  ])
  return {
    mapa,
    porArchivo: new Map([
      ['orquestador/lib/tools/a.mjs', ['caja.vencido']],
      ['orquestador/lib/tools/b.mjs', ['os.cobranzas']],
    ]),
    fallaron: [],
  }
}

const CATALOGO = [{ clave: 'finanzas', modulos: ['orquestador/lib/tools/a.mjs', 'orquestador/lib/tools/b.mjs'] }]
const ACTOR = { id: 'u', rol: 'direccion', permisos: ['drive.read', 'os.read'] }
const elegirTodo = () => ({ skills: ['finanzas'], motivo: 'test', resolucion: 'determinista', confianza: 'alta' })

test('OBJETIVO COMPUESTO: dos capacidades distintas corren en un solo pedido, SIN modelo', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'que vence esta semana y como vienen las cobranzas' },
    { registro: registroDoble(corridas), catalogo: CATALOGO, elegir: elegirTodo, ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true, JSON.stringify(r.error ?? r.respuesta ?? '').slice(0, 200))
  assert.equal(r.capacidades.via, 'objetivo_compuesto')
  assert.deepEqual(corridas.sort(), ['estado_cobranzas', 'vencimientos_de_caja'])
  assert.equal(r.llm ?? null, null, 'un objetivo resoluble por capacidades no paga modelo')
  assert.match(r.respuesta, /resultado de vencimientos_de_caja/)
  assert.match(r.respuesta, /resultado de estado_cobranzas/)
  // Los resultados viajan como DATOS estructurados, no sólo como párrafo.
  assert.equal(r.datos.partes.filter((p) => p.estado === 'RESUELTA').length, 2)
})

test('RESIDUO AISLADO: lo resoluble se completa y lo ambiguo queda PENDIENTE con motivo — no «todo error»', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'que vence esta semana y como vienen las cobranzas y explicame la estrategia comercial de la competencia' },
    { registro: registroDoble(corridas), catalogo: CATALOGO, elegir: elegirTodo, ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(corridas.length, 2, 'las DOS resolubles corren aunque la tercera no')
  const pend = r.datos.partes.filter((p) => p.estado === 'PENDIENTE_RAZONAMIENTO')
  assert.equal(pend.length, 1)
  assert.match(r.degradacion, /pendiente/i)
  assert.match(r.respuesta, /Quedan sin resolver/)
})

test('GUARDIÁN: si las partes caen en la MISMA capacidad, no hay compuesto — flujo normal', async () => {
  const corridas = []
  const registro = registroDoble(corridas)
  registro.mapa.delete('os.cobranzas')
  registro.porArchivo.set('orquestador/lib/tools/b.mjs', [])
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'que vence esta semana y que vence el mes que viene' },
    { registro, catalogo: CATALOGO, elegir: elegirTodo, ia: razonadorMuerto() },
  )
  assert.notEqual(r.capacidades?.via, 'objetivo_compuesto', 'una sola capacidad no es un objetivo compuesto')
})

// ── descubrimiento por convención: una capability nueva SIN tocar el núcleo ────────────────

const FIXTURE_TOOL = `
export function registroXsas() {
  return {
    'fixture.caso_k': {
      capability: 'os.read',
      schema: { name: 'fixture_caso_k', description: 'FIXTURE de test del descubrimiento.', input_schema: { type: 'object', properties: {}, required: [] } },
      async run() { return { resumen_texto: 'fixture viva' } },
    },
    'fixture.escribe': {
      capability: 'os.write',
      schema: { name: 'fixture_escribe', description: 'FIXTURE que escribe sin firma.', input_schema: { type: 'object', properties: {}, required: [] } },
      async run() { return { hecho: true } },
    },
  }
}
`

test('CASO K: una tool nueva por convención entra al registro SIN editar el núcleo — y la escritura sin firma NO', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsas-caso-k-'))
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); invalidarTools() })
  fs.writeFileSync(path.join(dir, 'fixture-caso-k-tool.mjs'), FIXTURE_TOOL)
  invalidarTools()
  const registro = await toolsDelNucleo({ google: null, refrescar: true, dirTools: dir })
  assert.ok(registro.mapa.has('fixture.caso_k'), 'la capability nueva tiene que descubrirse sola')
  assert.ok(registro.descubiertas.includes('fixture.caso_k'))
  assert.ok(!registro.mapa.has('fixture.escribe'), 'descubrir NO es autorizar: sin firma no entra')
  assert.ok(registro.sinFirma.includes('fixture.escribe'), 'la escritura descubierta queda en la cola de firma')
  // Y el gateway la usa por intención exacta sin ningún cambio en el cerebro:
  const r = await atender(
    { actor: ACTOR, canal: 'app', intencion: 'fixture.caso_k' },
    { registro, catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.match(r.respuesta, /fixture viva/)
})

test('PRUEBA NEGATIVA del descubrimiento: sin `registroXsas` el archivo se ignora', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsas-caso-k-neg-'))
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); invalidarTools() })
  fs.writeFileSync(path.join(dir, 'sin-convencion-tool.mjs'), 'export const nada = 1')
  invalidarTools()
  const registro = await toolsDelNucleo({ google: null, refrescar: true, dirTools: dir })
  assert.equal(registro.descubiertas.length, 0)
})
