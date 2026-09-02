// LA ACCIÓN PENDIENTE — «cotiza» + planos sin proyecto NO pide re-adjuntar (dueño, 02/09/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { atender } from './xsas-gateway.mjs'

const PLANO = { nombre: 'planta.txt', contenido: 'LÁMINA E-01 · zapatas Z1 60x60' }
const ACTOR = { id: 'u', rol: 'direccion', permisos: ['drive.read', 'os.read', 'drive.write', 'os.write', 'comercial.read'] }

const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('camino determinístico llamó al modelo') },
  pedirTextoONull: async () => { throw new Error('camino determinístico llamó al modelo') },
})

function dbFalsa() {
  const adjuntos = new Map()
  const contextos = new Map()
  const query = async (sql, args) => {
    const s = sql.trim().toLowerCase()
    if (s.includes('orq.xsas_adjunto')) {
      if (s.includes('any') && s.includes('contenido_b64 is not null')) {
        const out = []
        for (const h of args[1]) {
          const f = adjuntos.get(`${args[0]}|${h}`)
          if (f?.contenido_b64) out.push({ hash: f.hash, nombre: f.nombre, contenido_b64: f.contenido_b64 })
        }
        return { rows: out }
      }
      if (s.startsWith('select')) { const f = adjuntos.get(`${args[0]}|${args[1]}`); return { rows: f ? [f] : [] } }
      if (s.startsWith('insert')) {
        adjuntos.set(`${args[0]}|${args[2]}`, {
          hash: args[2], nombre: args[3], tamano: args[4], familia: args[5], formato: args[6],
          destino: args[7], resumen: JSON.parse(args[8]), contenido_b64: args[9] ?? null, con_bytes: Boolean(args[9]),
        })
        return { rows: [] }
      }
    }
    if (s.includes('orq.xsas_contexto')) {
      if (s.startsWith('select')) { const f = contextos.get(`${args[0]}|${args[1]}`); return { rows: f ? [{ datos: f }] : [] } }
      if (s.startsWith('insert')) {
        const k = `${args[0]}|${args[1]}`
        contextos.set(k, { ...(contextos.get(k) ?? {}), ...JSON.parse(args[2]) })
        return { rows: [] }
      }
    }
    return { rows: [] }
  }
  return { query, adjuntos, contextos }
}

const toolCotizar = (corridas) => ({
  capability: 'os.write',
  adjuntos: true,
  schema: {
    name: 'analizar_planos_y_cotizar',
    description: 'COTIZACIÓN BORRADOR desde planos. USALO cuando digan "cotiza", "cotizame estos planos", "cotizame esta obra".',
    input_schema: { type: 'object', properties: { proyecto: { type: 'string', description: 'cliente u obra' } }, required: ['proyecto'] },
  },
  async run(a) { corridas.push(a); return { resumen_texto: `cotizado ${a.proyecto} con ${a.archivos?.length ?? 0} archivo(s)` } },
})

const registroCon = (corridas) => ({ mapa: new Map([['plano.cotizar', toolCotizar(corridas)]]), porArchivo: new Map(), fallaron: [] })
const extractorNulo = () => ({ pedirTexto: async () => { throw new Error('no') }, pedirTextoONull: async () => JSON.stringify({ proyecto: null }) })

test('EL CIRCUITO ENTERO: «cotiza»+plano → pregunta EN CRIOLLO → «Quattropani» → ejecuta con los bytes guardados', async () => {
  const db = dbFalsa()
  const corridas = []
  // Mensaje 1: adjunto sin proyecto.
  const r1 = await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'conv-p', mensaje: 'cotiza', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorNulo(), query: db.query },
  )
  assert.equal(r1.ok, false)
  assert.match(r1.respuesta, /¿De qué obra o cliente son estos archivos\?/, 'la pregunta va en criollo, sin jerga de capacidades')
  assert.doesNotMatch(r1.respuesta, /capacidad plano\.cotizar/, 'nada de jerga interna')
  assert.match(r1.respuesta, /ya quedaron guardados/)
  assert.equal(corridas.length, 0)
  // El estado quedó en la base: pendiente + bytes.
  const ctx = db.contextos.get('u|conv-p')
  assert.equal(ctx.pendiente.clave, 'plano.cotizar')
  assert.ok([...db.adjuntos.values()][0].contenido_b64, 'los bytes PERSISTEN — sin esto el follow-up es imposible')

  // Mensaje 2: SÓLO el dato que faltaba. Cero modelo (el valor sale del texto).
  const r2 = await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'conv-p', mensaje: 'Quattropani' },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto(), query: db.query },
  )
  assert.equal(r2.ok, true, JSON.stringify(r2.error ?? r2.respuesta).slice(0, 200))
  assert.equal(r2.capacidades.via, 'pendiente_completada')
  assert.equal(corridas.length, 1)
  assert.equal(corridas[0].proyecto, 'Quattropani')
  assert.equal(corridas[0].archivos.length, 1, 'los archivos vuelven desde la base, no desde el usuario')
  assert.equal(Buffer.from(corridas[0].archivos[0].contenido_base64, 'base64').toString(), PLANO.contenido)
  // Y la pendiente se limpió: no captura la conversación futura.
  assert.equal(db.contextos.get('u|conv-p').pendiente, null)
})

test('AISLAMIENTO: otro actor con el MISMO correlation no completa la pendiente ajena', async () => {
  const db = dbFalsa()
  const corridas = []
  await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'conv-a', mensaje: 'cotiza', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorNulo(), query: db.query },
  )
  const r = await atender(
    { actor: { id: 'otro', rol: 'direccion', permisos: ACTOR.permisos }, canal: 'app', correlation_id: 'conv-a', mensaje: 'Quattropani' },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto(), query: db.query },
  )
  assert.notEqual(r.capacidades?.via, 'pendiente_completada')
  assert.equal(corridas.length, 0)
})

test('NO SECUESTRA: con pendiente viva, un pedido nuevo con vida propia sigue su flujo normal y la pendiente espera', async () => {
  const db = dbFalsa()
  const corridas = []
  await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'conv-b', mensaje: 'cotiza', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorNulo(), query: db.query },
  )
  const r = await atender(
    { actor: ACTOR, canal: 'app', correlation_id: 'conv-b', mensaje: 'necesito que me armes un resumen largo de la situacion financiera de la empresa para el banco' },
    { registro: registroCon(corridas), catalogo: [], ia: extractorNulo(), query: db.query },
  )
  assert.notEqual(r.capacidades?.via, 'pendiente_completada')
  assert.equal(corridas.length, 0)
  assert.ok(db.contextos.get('u|conv-b').pendiente, 'la pendiente sigue viva para cuando conteste el dato')
})
