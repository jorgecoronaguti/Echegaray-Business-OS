import { test } from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from './asistente.mjs'
import { especialistas } from '../registro-especialistas.mjs'
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
  // Un área tiene a lo sumo un especialista: si no, el canal no podría decidir.
  const porArea = todos.filter((e) => e.area === especialista.area)
  assert.equal(porArea.length, 1, `${especialista.area} tiene más de un especialista`)
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

test('no reclama lo ambiguo: ahí decide el canal, no el asistente', () => {
  // "creá algo para el jueves" sin decir de qué tipo: el intérprete lo detecta pero el
  // especialista NO lo reclama, para no ganarle el mensaje al área del canal.
  assert.equal(especialista.reconoce('programame algo para el jueves a las 9'), null)
  assert.equal(especialista.reconoce('cuánta caja tengo hoy'), null)
  assert.ok(especialista.reconoce('recordame el lunes pagar IERIC'))
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
