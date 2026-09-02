// LA MEMORIA CONVERSACIONAL — lo hablado sobrevive al chat, se supera con genealogía y no se mezcla.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extraerCandidatas, detectarCorreccion, pideMemoria, comparteTema,
} from './xsas-memoria.mjs'
import { atender } from './xsas-gateway.mjs'

const ACTOR = { id: 'jorge', rol: 'direccion', permisos: ['os.read', 'os.write', 'drive.read'] }

// El razonador muerto PRUEBA que la memoria no necesita un modelo: si alguien lo llama, explota.
const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('la memoria llamó al modelo') },
  pedirTextoONull: async () => { throw new Error('la memoria llamó al modelo') },
})

// Una base falsa con las CUATRO tablas que toca la memoria. Cada tabla es inspeccionable.
function dbFalsa() {
  const mensajes = []
  const memorias = []
  const contextos = new Map()
  const aprendizaje = []
  let n = 0
  const query = async (sql, args = []) => {
    const s = sql.trim().toLowerCase()
    if (s.includes('xsas_aprendizaje')) { aprendizaje.push(args); return { rows: [] } }
    if (s.includes('orq.xsas_mensaje')) {
      if (s.startsWith('insert')) {
        mensajes.push({ conversation_id: args[0], message_id: args[1], actor_id: args[2], emisor: args[3], contenido: args[4], creado_en: new Date() })
        return { rows: [] }
      }
      const f = mensajes.find((m) => m.message_id === args[0] && m.actor_id === args[1] && m.emisor === 'usuario')
      return { rows: f ? [f] : [] }
    }
    if (s.includes('orq.xsas_memoria')) {
      if (s.startsWith('insert')) {
        const id = `mem-${++n}`
        memorias.push({
          id, actor_id: args[0], tema: args[1], entidades: args[2], contenido: args[3], estado: args[4],
          supersede_a: args[5], conversation_id: args[6], message_id: args[7], vigente: true,
          superada_por: null, creado_en: new Date(),
        })
        return { rows: [{ id }] }
      }
      if (s.startsWith('update')) {
        const m = memorias.find((x) => x.id === args[0])
        if (m) { m.vigente = false; m.estado = 'superado'; m.superada_por = args[1] }
        return { rows: [] }
      }
      if (s.includes('where id =')) {
        const m = memorias.find((x) => x.id === args[0] && x.actor_id === args[1])
        return { rows: m ? [m] : [] }
      }
      return { rows: memorias.filter((m) => m.actor_id === args[0] && m.vigente).sort((a, b) => b.creado_en - a.creado_en) }
    }
    if (s.includes('orq.xsas_contexto')) {
      if (s.includes('order by actualizado_en')) {
        return {
          rows: [...contextos.entries()]
            .filter(([k]) => k.startsWith(`${args[0]}|`))
            .map(([k, datos]) => ({ correlation_id: k.split('|')[1], datos, actualizado_en: new Date() })),
        }
      }
      if (s.startsWith('select')) { const f = contextos.get(`${args[0]}|${args[1]}`); return { rows: f ? [{ datos: f }] : [] } }
      const k = `${args[0]}|${args[1]}`
      contextos.set(k, { ...(contextos.get(k) ?? {}), ...JSON.parse(args[2]) })
      return { rows: [] }
    }
    return { rows: [] }
  }
  return { query, mensajes, memorias, contextos, aprendizaje }
}

const registroVacio = { mapa: new Map(), porArchivo: new Map(), porLib: new Map(), sinFirma: [] }

const pedir = (db, texto, corr, actor = ACTOR, requestId = undefined) => atender(
  { tipo: 'mensaje', canal: 'app', mensaje: texto, correlation_id: corr, request_id: requestId, actor },
  { query: db.query, ia: razonadorMuerto(), registro: registroVacio, catalogo: [] },
)

// ═══ EXTRACCIÓN: no se guarda cada frase — sólo lo que un gatillo explícito afirma ═══

test('una decisión se extrae como decidido; la charla y las preguntas no producen memoria', () => {
  const c = extraerCandidatas('para la obra quattropani decidimos usar el proveedor aberturas san juan')
  assert.equal(c.length, 1)
  assert.equal(c[0].estado, 'decidido')
  assert.ok(c[0].entidades.includes('quattropani'))
  assert.ok(c[0].tema.includes('proveedor'))

  assert.equal(extraerCandidatas('buenas, como va todo por la obra').length, 0)
  assert.equal(extraerCandidatas('¿qué proveedor conviene para la obra quattropani?').length, 0)
  assert.equal(extraerCandidatas('confirmamos el hormigón H21 para las bases')[0].estado, 'confirmado')
  assert.equal(extraerCandidatas('la superficie cubierta es 540 m2 en quattropani')[0].estado, 'mencionado')
})

test('la corrección trae el par nuevo/viejo en las dos direcciones', () => {
  const a = detectarCorreccion('eso que te dije ayer estaba mal: son 450 m2, no 540')
  assert.deepEqual({ es: a.es, nuevo: a.nuevo, viejo: a.viejo }, { es: true, nuevo: '450 m2', viejo: '540' })
  const b = detectarCorreccion('me equivoqué: no es zeta hierros sino aceros cuyo')
  assert.equal(b.es, true)
  assert.equal(b.viejo, 'zeta hierros')
  assert.equal(b.nuevo, 'aceros cuyo')
  assert.equal(detectarCorreccion('la obra va bien, son 450 m2 los que llevamos').es, false)
})

test('pideMemoria detecta la consulta y NO secuestra la orden que menciona una decisión', () => {
  assert.equal(pideMemoria('¿qué habíamos decidido sobre el proveedor de quattropani?').aspecto, 'decision')
  assert.equal(pideMemoria('por qué elegimos ese proveedor?').aspecto, 'porque')
  assert.equal(pideMemoria('¿qué quedó pendiente de los planos?').aspecto, 'pendiente')
  assert.equal(pideMemoria('seguí con lo que habíamos hablado de quattropani').aspecto, 'retomar')
  assert.equal(pideMemoria('hacé lo que decidimos ayer con el pedido').es, false)
  assert.equal(pideMemoria('cargá la factura de rsv en compras').es, false)
})

test('comparteTema nunca cruza entidades distintas', () => {
  const qtp = { tema: ['proveedor', 'quattropani'], entidades: ['quattropani'] }
  const mal = { tema: ['proveedor', 'maldonado'], entidades: ['maldonado'] }
  assert.equal(comparteTema(qtp, mal), false)
  assert.equal(comparteTema(qtp, { tema: ['proveedor', 'aberturas', 'quattropani'], entidades: ['quattropani'] }), true)
})

// ═══ ENTRE CHATS: lo dicho en la conversación A se contesta en la conversación B, sin modelo ═══

test('chat A establece una decisión; chat B NUEVO la recupera con provenance; el raw quedó guardado', async () => {
  const db = dbFalsa()
  await pedir(db, 'para la obra quattropani decidimos usar el proveedor aberturas san juan', 'chat-a', ACTOR, 'msg-1')

  assert.equal(db.memorias.length, 1)
  assert.equal(db.memorias[0].estado, 'decidido')
  assert.ok(db.mensajes.some((m) => m.emisor === 'usuario' && m.conversation_id === 'chat-a'))

  const r = await pedir(db, '¿qué habíamos decidido sobre el proveedor de quattropani?', 'chat-b')
  assert.equal(r.ok, true)
  assert.equal(r.capacidades.via, 'memoria_conversacional')
  assert.match(r.respuesta, /aberturas san juan/)
  assert.match(r.respuesta, /chat-a/)          // trazabilidad: dice de qué conversación salió
  assert.equal(db.aprendizaje.length, 0)       // una mención NO se promueve a learning
})

test('la corrección supersede con genealogía y el chat nuevo devuelve el dato vigente', async () => {
  const db = dbFalsa()
  await pedir(db, 'la superficie cubierta de quattropani es 540 m2', 'chat-a', ACTOR, 'msg-1')
  await pedir(db, 'eso que te dije de la superficie de quattropani estaba mal: es 450 m2, no 540', 'chat-c', ACTOR, 'msg-2')

  const vieja = db.memorias.find((m) => m.contenido.includes('540 m2'))
  const nueva = db.memorias.find((m) => m.contenido.includes('450 m2'))
  assert.equal(vieja.vigente, false)
  assert.equal(vieja.estado, 'superado')
  assert.equal(vieja.superada_por, nueva.id)
  assert.equal(nueva.supersede_a, vieja.id)

  const r = await pedir(db, '¿qué habíamos decidido sobre la superficie de quattropani?', 'chat-d')
  assert.match(r.respuesta, /450 m2/)
  assert.match(r.respuesta, /reemplazó a/)     // reconoce que el dato anterior fue superado
  assert.ok(!/540 m2 — /.test(r.respuesta))    // el superado no aparece como vigente
})

test('el mismo hecho dicho dos veces no se duplica', async () => {
  const db = dbFalsa()
  await pedir(db, 'para la obra quattropani decidimos usar el proveedor aberturas san juan', 'chat-a')
  await pedir(db, 'para la obra quattropani decidimos usar el proveedor aberturas san juan', 'chat-b')
  assert.equal(db.memorias.length, 1)
})

test('dos obras con el mismo tema no se mezclan, y lo inexistente se declara sin inventar', async () => {
  const db = dbFalsa()
  await pedir(db, 'para la obra quattropani decidimos usar el proveedor aberturas san juan', 'chat-a')
  await pedir(db, 'para la obra maldonado decidimos usar el proveedor hierros del norte', 'chat-b')
  assert.equal(db.memorias.filter((m) => m.vigente).length, 2)  // ninguna superó a la otra

  const r = await pedir(db, '¿qué habíamos decidido sobre el proveedor de maldonado?', 'chat-c')
  assert.match(r.respuesta, /hierros del norte/)
  assert.ok(!r.respuesta.includes('aberturas'))

  const nada = await pedir(db, '¿qué habíamos decidido sobre el proveedor de zonda?', 'chat-d')
  assert.equal(nada.capacidades.via, 'memoria_conversacional')
  assert.match(nada.respuesta, /No tengo registrado/)
})

test('otro actor NO recupera la memoria de jorge (aislamiento en la recuperación)', async () => {
  const db = dbFalsa()
  await pedir(db, 'para la obra quattropani decidimos usar el proveedor aberturas san juan', 'chat-a')
  const otro = { id: 'empleado', rol: 'jefe_obra', permisos: ['os.read'] }
  const r = await pedir(db, '¿qué habíamos decidido sobre el proveedor de quattropani?', 'chat-x', otro)
  assert.match(r.respuesta, /No tengo registrado/)
  assert.ok(!r.respuesta.includes('aberturas'))
})

test('el porqué vuelve con la cita del mensaje original (trazabilidad al raw)', async () => {
  const db = dbFalsa()
  await pedir(db, 'elegimos el proveedor aceros cuyo para quattropani porque tiene mejor plazo de pago', 'chat-a', ACTOR, 'msg-9')
  const r = await pedir(db, '¿por qué elegimos ese proveedor para quattropani?', 'chat-b')
  assert.equal(r.capacidades.via, 'memoria_conversacional')
  assert.match(r.respuesta, /Origen: lo dijiste/)
  assert.match(r.respuesta, /mejor plazo de pago/)
})

test('lo pendiente de un chat anterior se recupera en un chat nuevo desde el contexto persistido', async () => {
  const db = dbFalsa()
  db.contextos.set('jorge|chat-a', { pendiente: { pregunta: '¿De qué obra o cliente son estos planos?' } })
  const r = await pedir(db, '¿qué quedó pendiente de los planos?', 'chat-b')
  assert.equal(r.capacidades.via, 'memoria_conversacional')
  assert.match(r.respuesta, /chat-a/)
  assert.match(r.respuesta, /planos/)
})
