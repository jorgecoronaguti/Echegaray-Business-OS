import { test } from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from './asistente.mjs'
import { especialistas, especialistaDeArea } from '../registro-especialistas.mjs'
import { resolver, VIA } from '../director.mjs'
import { CAPACIDAD } from '../asistente/contratos.mjs'
import { baseFalsa, filaIdentidad } from '../asistente/dobles-de-prueba.mjs'

/** Puerto que resuelve el binding canal → área, igual que el de director.test.mjs. */
const puertoCanales = (bindings = {}) => ({
  async query(sql, params) {
    const b = bindings[params?.[0]]
    return { rows: b ? [{ area_clave: b.area, canal_nombre: b.canal }] : [] }
  },
})

test('se declara como un especialista más, con área canónica y agente real', async () => {
  const AREAS = new Set(['compras', 'administracion_finanzas', 'obras', 'personas',
    'contabilidad_legales', 'comercial', 'calidad', 'gestion_general'])
  assert.ok(AREAS.has(especialista.area), `área desconocida: ${especialista.area}`)
  const todos = await especialistas({ recargar: true })
  const yo = todos.filter((e) => e.slug === 'asistente')
  assert.equal(yo.length, 1)
  // Es TRANSVERSAL: comparte área con Gestión General pero no es su dueño. Lo que el canal
  // necesita es un solo DUEÑO por área — si el asistente lo fuera, se quedaría con todos los
  // mensajes no reclamados de ese canal en vez de dejárselos al especialista del tema.
  assert.equal(especialista.preferidoDeArea, false)
  const dueño = await especialistaDeArea(especialista.area)
  assert.ok(dueño && dueño.slug !== 'asistente', `el asistente terminó siendo dueño de ${especialista.area}`)
})

test('el Director le entrega los pedidos del asistente sin consultar al modelo', async () => {
  const razonar = async () => { throw new Error('no se consulta al modelo cuando alguien reclama') }
  for (const t of ['recordame el lunes pagar IERIC', 'buscame el contrato de la Estrella',
    'agendá reunión con Rodrigo el jueves a las 10', '¿qué sabés hacer?']) {
    const r = await resolver({ texto: t, port: puertoCanales(), channelId: 'c-dm', razonar })
    assert.equal(r.especialista?.slug, 'asistente', t)
    assert.equal(r.via, VIA.RECLAMO)
  }
})

test('NO le secuestra el mensaje a Personal IA: lo que es de jornales sigue siendo de jornales', async () => {
  for (const t of ['asistencia', 'cargar asistencia', 'quién trabajó ayer', '3 ausente']) {
    const r = await resolver({ texto: t, port: puertoCanales(), channelId: 'c-asistencia' })
    assert.equal(r.especialista?.slug, 'personal', t)
  }
})

test('no reclama lo ambiguo: ahí decide el canal, no el asistente', async () => {
  // "creá algo para el jueves" sin decir de qué tipo: el intérprete lo detecta pero el
  // especialista NO lo reclama, para no ganarle el mensaje al área del canal.
  assert.equal(await especialista.reconoce('programame algo para el jueves a las 9'), null)
  assert.equal(await especialista.reconoce('cuánta caja tengo hoy'), null)
  assert.ok(await especialista.reconoce('recordame el lunes pagar IERIC'))
})

// ── EL DIRECTOR DECIDE ANTES QUE EL ROUTER ───────────────────────────────────
//
// El router ya sabía leer "no era ese", "¿por qué ese?" y "el segundo". En producción no
// servía de nada: el Director preguntaba sólo por gramática, nadie reclamaba esos mensajes y
// la persona recibía el catálogo de lo que el OS sabe hacer. Estos tests recorren el orden
// real —Director → reconocimiento → router— que es donde se rompía.

const ACTOR = { plataforma_user_id: 'u-jorge', plataforma_username: 'jorge' }

/** Un puerto con UNA búsqueda abierta de esta persona, como la deja el buscador de Drive. */
const puertoConPendiente = ({ vencido = false, feedback = true, opciones = null } = {}) => ({
  async query(sql, params) {
    if (sql.includes('asistente_pendientes')) {
      if (!sql.trim().startsWith('select')) return { rows: [] }
      if (params?.[1] !== 'u-jorge') return { rows: [] }
      return {
        rows: [{
          id: 1,
          capacidad: CAPACIDAD.DRIVE_BUSCAR,
          parcial: { intencion: CAPACIDAD.DRIVE_BUSCAR, parametros: { terminos: 'flujo de fondos' }, faltante: 'archivoId', feedback, opcional: true },
          pregunta: 'Encontré: Flujo de Caja',
          opciones: opciones ?? [
            { valor: 'f-cash', etiqueta: 'Flujo de Caja - Cash Flow' },
            { valor: 'f-fondos', etiqueta: 'Flujo de Fondos.xlsx — en administracion > AÑO 2025' },
          ],
          expira_at: new Date(Date.now() + (vencido ? -60_000 : 600_000)).toISOString(),
        }],
      }
    }
    return { rows: [] }
  },
})

const RESPUESTAS = ['correcto', 'sí', 'no era ese', '¿por qué ese?', 'gracias', 'el segundo', 'abrí el otro']

test('CON una búsqueda abierta, el Director le entrega el feedback al asistente', async () => {
  const razonar = async () => { throw new Error('no se consulta al modelo para una respuesta corta') }
  for (const t of RESPUESTAS) {
    const r = await resolver({ texto: t, port: puertoConPendiente(), channelId: 'c-dm', actor: ACTOR, razonar })
    assert.equal(r.especialista?.slug, 'asistente', `"${t}" no llegó al asistente`)
  }
})

test('SIN búsqueda abierta, esas mismas frases no son feedback de nada', async () => {
  // Es la mitad importante: "no" y "gracias" sueltos pueden ser para cualquiera. Si el
  // asistente los reclamara siempre, se quedaría con mensajes que no son suyos.
  for (const t of ['no era ese', '¿por qué ese?', 'gracias', 'sí']) {
    assert.equal(await especialista.reconoce(t, { port: puertoConPendiente(), actor: { plataforma_user_id: 'otra-persona' } }), null, t)
  }
})

test('una búsqueda VENCIDA no reclama: la conversación ya terminó', async () => {
  assert.equal(await especialista.reconoce('no era ese', { port: puertoConPendiente({ vencido: true }), actor: ACTOR }), null)
})

test('sin puerto no se inventa un pendiente', async () => {
  assert.equal(await especialista.reconoce('gracias', { actor: ACTOR }), null)
})

test('un pendiente que NO espera feedback igual acepta elegir una opción', async () => {
  // Una pregunta del asistente ("¿cuál te paso?") no declara `feedback`, pero sus opciones se
  // eligen igual. Lo que no corresponde ahí es un "no era ese": no hay nada que rechazar.
  const port = puertoConPendiente({ feedback: false })
  assert.ok(await especialista.reconoce('el segundo', { port, actor: ACTOR }))
  assert.equal(await especialista.reconoce('no era ese', { port, actor: ACTOR }), null)
})

test('el reclamo por respuesta NO le gana a un pedido que otro especialista entiende', async () => {
  // La gramática se evalúa primero: si el mensaje es un pedido reconocible, sigue su camino
  // aunque haya una búsqueda abierta.
  const port = puertoConPendiente()
  const r = await resolver({ texto: 'quién trabajó ayer', port, channelId: 'c-dm', actor: ACTOR, razonar: async () => null })
  assert.notEqual(r.especialista?.slug, 'asistente')
})

test('atender traduce el actor de Mattermost y devuelve la respuesta lista para el canal', async () => {
  const port = baseFalsa({
    identidades: [filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' })],
  })
  const r = await especialista.atender({
    texto: '¿qué sabés hacer?',
    port,
    actor: { plataforma_user_id: 'u-jorge', plataforma_username: 'jorge', channel_id: 'c-dm', root_post_id: 'p-1' },
    correlationId: 'corr-1',
  })
  assert.ok(r.texto.includes('Puedo:'))
  assert.equal(r.estado, 'ejecutado')
  // Un recordatorio o una búsqueda en Drive no son datos reservados: vuelven por donde vinieron.
  assert.equal(r.privado, false)
  assert.equal(r.datos.capacidad, CAPACIDAD.AYUDA)
})

test('la skill declarada en la auditoría nombra la capacidad, no el especialista', () => {
  assert.equal(especialista.skillDe({ intencion: CAPACIDAD.RECORDATORIO_CREAR }), 'asistente.recordatorio_crear')
  assert.equal(especialista.skillDe(null), 'asistente.pedido')
})
