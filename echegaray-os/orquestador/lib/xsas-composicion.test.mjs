// COMPOSICIÓN A.output→B.input + REEVALUACIÓN + FALLA PARCIAL + RESUME + ROUTING RESEARCH.
// Cada test protege una de las dos brechas cerradas el 02/09; los negativos prueban que el control puede fallar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { atender } from './xsas-gateway.mjs'
import { compatible, sumarAlBus, completarDesdeBus } from './xsas-composicion.mjs'
import { pideInvestigacion } from './xsas-resolutores.mjs'

const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('camino determinístico llamó al modelo') },
  pedirTextoONull: async () => { throw new Error('camino determinístico llamó al modelo') },
})

// ── el contrato puro ───────────────────────────────────────────────────────────────────────

test('compatible: tipos exactos, sin conversiones — un número no se vuelve string solo', () => {
  assert.equal(compatible('Quattropani', 'string'), true)
  assert.equal(compatible(42, 'string'), false, 'NO se convierte 42 a "42"')
  assert.equal(compatible([1, 2], 'array'), true)
  assert.equal(compatible('', 'string'), false)
})

test('el bus guarda campo, valor y ORIGEN; texto y error no son datos encadenables', () => {
  const bus = sumarAlBus({}, { tool: 'a.tool', datos: { obra: 'X', total: 7, resumen_texto: 'bla', error: null } })
  assert.deepEqual(bus.obra, { valor: 'X', origen: 'a.tool' })
  assert.equal(bus.resumen_texto, undefined)
  const b2 = completarDesdeBus({ schema: { input_schema: { properties: { obra: { type: 'string' } } } } }, { args: {}, faltan: ['obra'] }, bus)
  assert.equal(b2.args.obra, 'X')
  assert.deepEqual(b2.conectados, [{ arg: 'obra', origen: 'a.tool' }])
})

// ── el arnés de capabilities con contratos reales (nombres genéricos, nada hardcodeado) ────

const tool = ({ nombre, desc, req = [], props = {}, salida, corridas, falla = false }) => ({
  capability: 'drive.read',
  schema: { name: nombre, description: desc, input_schema: { type: 'object', properties: props, required: req } },
  async run(a) {
    corridas.push({ nombre, args: a })
    if (falla) return { error: `${nombre} se cayó` }
    return typeof salida === 'function' ? salida(a) : salida
  },
})

function armarRegistro(corridas, { cFalla = false } = {}) {
  const mapa = new Map([
    ['a.detectar', tool({
      nombre: 'detectar_proyecto', desc: 'DETECTA el proyecto activo. USALO cuando digan "detecta el proyecto activo".',
      salida: { proyecto: 'Quattropani', total: 3 }, corridas,
    })],
    ['b.computar', tool({
      nombre: 'computar_proyecto', desc: 'COMPUTA un proyecto. USALO cuando digan "computa eso", "computalo".',
      req: ['proyecto'], props: { proyecto: { type: 'string', description: 'el proyecto' } },
      salida: (a) => ({ computo_id: `comp-${a.proyecto}`, proyecto: a.proyecto }), corridas,
    })],
    ['c.valorizar', tool({
      nombre: 'valorizar_computo', desc: 'VALORIZA un computo. USALO cuando digan "valoriza eso", "valorizalo".',
      req: ['computo_id'], props: { computo_id: { type: 'string', description: 'el cómputo' } },
      salida: { total_valorizado: 99 }, corridas, falla: cFalla,
    })],
    ['d.clima', tool({
      nombre: 'estado_independiente', desc: 'ESTADO general independiente. USALO cuando digan "el estado general".',
      salida: { estado: 'ok' }, corridas,
    })],
    ['x.numero', tool({
      nombre: 'produce_numero', desc: 'PRODUCE un numero. USALO cuando digan "produci el numero".',
      salida: { computo_id: 12345 }, corridas, // número donde C espera string → INCOMPATIBLE
    })],
  ])
  return {
    mapa,
    porArchivo: new Map([...mapa.keys()].map((k) => [`orquestador/lib/tools/${k}.mjs`, [k]])),
    fallaron: [],
  }
}
const CATALOGO = [{ clave: 'demo', modulos: ['orquestador/lib/tools/a.detectar.mjs', 'orquestador/lib/tools/b.computar.mjs', 'orquestador/lib/tools/c.valorizar.mjs', 'orquestador/lib/tools/d.clima.mjs', 'orquestador/lib/tools/x.numero.mjs'] }]
const elegirDemo = () => ({ skills: ['demo'], motivo: 'test', resolucion: 'determinista', confianza: 'alta' })
const ACTOR = { id: 'u', rol: 'direccion', permisos: ['drive.read', 'os.read'] }

function dbContexto() {
  const contextos = new Map()
  const query = async (sql, args) => {
    const s = sql.trim().toLowerCase()
    if (s.includes('orq.xsas_contexto')) {
      if (s.startsWith('select')) { const f = contextos.get(`${args[0]}|${args[1]}`); return { rows: f ? [{ datos: f }] : [] } }
      if (s.startsWith('insert')) { const k = `${args[0]}|${args[1]}`; contextos.set(k, { ...(contextos.get(k) ?? {}), ...JSON.parse(args[2]) }); return { rows: [] } }
    }
    return { rows: [] }
  }
  return { query, contextos }
}

test('A→B→C REAL por contrato: el proyecto de A entra a B, el computo_id de B entra a C — 0 modelo, con reevaluación', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'detecta el proyecto activo y despues computa eso y despues valoriza eso' },
    { registro: armarRegistro(corridas), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true, JSON.stringify(r.error ?? r.respuesta).slice(0, 300))
  assert.equal(r.llm ?? null, null, 'encadenar tools conocidas no paga modelo')
  assert.deepEqual(corridas.map((c) => c.nombre), ['detectar_proyecto', 'computar_proyecto', 'valorizar_computo'])
  assert.equal(corridas[1].args.proyecto, 'Quattropani', 'B recibió el output de A por contrato')
  assert.equal(corridas[2].args.computo_id, 'comp-Quattropani', 'C recibió el output de B por contrato')
  const partes = r.datos.partes
  assert.equal(partes.filter((p) => p.estado === 'RESUELTA').length, 3)
  assert.deepEqual(partes[1].encadenado, [{ arg: 'proyecto', origen: 'a.detectar' }], 'la conexión queda en la genealogía')
  // Sólo los campos requeridos viajaron: B no recibió `total` aunque A lo produjo.
  assert.equal(corridas[1].args.total, undefined)
})

test('INPUT INCOMPATIBLE: un número donde se espera string = CAPABILITY_INCOMPATIBLE, sin conversión inventada', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'produci el numero y despues valoriza eso' },
    { registro: armarRegistro(corridas), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  const inc = r.datos.partes.find((p) => p.estado === 'CAPABILITY_INCOMPATIBLE')
  assert.ok(inc, JSON.stringify(r.datos.partes))
  assert.match(inc.motivo, /espera string/)
  assert.equal(corridas.filter((c) => c.nombre === 'valorizar_computo').length, 0, 'lo incompatible NO se ejecuta')
})

test('FALLA PARCIAL: C bloqueada por dato no borra a A y B, y la D independiente corre igual', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'detecta el proyecto activo y despues valoriza eso y despues el estado general' },
    { registro: armarRegistro(corridas), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto() },
  )
  // A corre; C (valorizar) necesita computo_id que NADIE produjo → FALTA_DATO; D corre igual.
  assert.equal(r.ok, true)
  const estados = Object.fromEntries(r.datos.partes.map((p) => [p.tool ?? p.pedido, p.estado]))
  assert.equal(estados['a.detectar'], 'RESUELTA')
  assert.equal(estados['d.clima'], 'RESUELTA', 'la independiente no espera a la bloqueada')
  assert.equal(estados['c.valorizar'], 'FALTA_DATO')
  assert.match(r.degradacion, /pendiente/i)
})

test('LA FALLA DE B NO BORRA A A: error declarado, el resto sigue', async () => {
  const corridas = []
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'detecta el proyecto activo y despues computa eso y despues valoriza eso' },
    { registro: armarRegistro(corridas, { cFalla: true }), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto() },
  )
  const estados = Object.fromEntries(r.datos.partes.map((p) => [p.tool, p.estado]))
  assert.equal(estados['a.detectar'], 'RESUELTA')
  assert.equal(estados['b.computar'], 'RESUELTA')
  assert.equal(estados['c.valorizar'], 'RESUELTA', 'la tool corrió; su {error} interno viaja en datos') // run no lanza
})

test('RESUME SIN REPETIR: el follow-up con el dato retoma SÓLO la pendiente, con el bus persistido', async () => {
  const db = dbContexto()
  const corridas = []
  await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'obj-1', mensaje: 'detecta el proyecto activo y despues el estado general y despues valoriza eso' },
    { registro: armarRegistro(corridas), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto(), query: db.query },
  )
  assert.equal(corridas.length, 2, 'A y D corrieron; C quedó FALTA_DATO')
  const guardado = db.contextos.get('u|obj-1').compuesto
  assert.equal(guardado.pendientes.length, 1)
  assert.equal(guardado.bus.proyecto.valor, 'Quattropani', 'el bus persiste con lo ya producido')

  const corridas2 = []
  const r2 = await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'obj-1', mensaje: 'comp-Quattropani' },
    { registro: armarRegistro(corridas2), catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto(), query: db.query },
  )
  assert.equal(r2.ok, true)
  assert.deepEqual(corridas2.map((c) => c.nombre), ['valorizar_computo'], 'NADA se repite: sólo corre la pendiente')
  assert.equal(db.contextos.get('u|obj-1').compuesto, null, 'objetivo cumplido: la pendiente se limpia')
})

// ── routing research vs dominio ────────────────────────────────────────────────────────────

test('pideInvestigacion: intención+objeto, general — y sus NEGATIVOS de clase', () => {
  assert.equal(pideInvestigacion('buscá en la web cuánto cotiza el dólar'), true)
  assert.equal(pideInvestigacion('buscame el precio actual del hierro del 8'), true)
  assert.equal(pideInvestigacion('investigá cuánto vale el gasoil en San Juan'), true)
  // negativos: dominio obra/interno
  assert.equal(pideInvestigacion('cotizame esta obra'), false, 'sin verbo de búsqueda no hay research')
  assert.equal(pideInvestigacion('armá la cotización de este proyecto'), false)
  assert.equal(pideInvestigacion('buscá los comprobantes de julio'), false, 'buscar interno sin señal de afuera')
  assert.equal(pideInvestigacion('buscá cuánto sale la obra según los planos'), false, 'nombra la obra: dominio cotizador')
})

test('«buscá en la web cuánto cotiza el dólar» corre web.search con la consulta — no finanzas ni cotizador', async () => {
  const corridas = []
  const registro = armarRegistro(corridas)
  registro.mapa.set('web.search', tool({
    nombre: 'web_search', desc: 'Busca en INTERNET información actual.',
    req: ['query'], props: { query: { type: 'string', description: 'qué buscar' } },
    salida: (a) => ({ resumen_texto: `busqué: ${a.query}`, fuentes: ['x'] }), corridas,
  }))
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'buscá en la web cuánto cotiza el dólar' },
    { registro, catalogo: CATALOGO, elegir: elegirDemo, ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.capacidades.via, 'investigacion_directa')
  assert.deepEqual(corridas.map((c) => c.nombre), ['web_search'])
  assert.equal(r.llm ?? null, null)
})
