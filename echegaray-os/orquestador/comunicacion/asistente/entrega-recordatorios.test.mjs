// Tests del paso de entrega. Los dobles están sólo en la frontera (Mattermost y el reloj);
// el repositorio y las reglas son los reales.
//
// El test más importante de este archivo no es el del camino feliz: es el de la caída en el
// medio. El worker publica y muere antes de anotar la entrega — eso pasa — y la persona NO
// puede recibir el mismo recordatorio dos veces cuando el proceso vuelve.

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { ESTADO_RECORDATORIO } from './contratos.mjs'
import { crearEntregador, textoEntrega } from './entrega-recordatorios.mjs'
import { ESTADO_ENTREGA, RecordatoriosMemoria } from './recordatorios.mjs'
import { logDoble, mattermostDoble, relojFijo } from './dobles-recordatorios.mjs'

const LUNES_8 = '2026-08-03T08:00:00-03:00'
const JORGE = { userId: 'u-jorge', display: 'Jorge' }
const RODRIGO = { userId: 'u-rodrigo', display: 'Rodrigo' }

/** Entorno completo con el reloj ya parado en el momento del recordatorio. */
function armar({ mm = mattermostDoble(), enElMomento = true, ...opciones } = {}) {
  const reloj = relojFijo(enElMomento ? LUNES_8 : '2026-08-03T07:00:00-03:00')
  const repo = new RecordatoriosMemoria({ ahora: reloj.ahora })
  const log = logDoble()
  const entregar = crearEntregador({
    repo, abrirDM: (u) => mm.abrirDM(u), publicar: (p) => mm.publicar(p),
    ahora: reloj.ahora, worker: 'w-test', intervaloMs: 0, log, ...opciones,
  })
  return { reloj, repo, mm, log, entregar }
}

describe('entrega de recordatorios · el texto que ve la persona', () => {
  it('propio: sin ids, sin JSON, sin trazas', () => {
    assert.equal(textoEntrega({ creador_user_id: 'u1', destinatario_user_id: 'u1', contenido: 'cargar saldos' }),
      'Recordatorio: cargar saldos.')
  })

  it('cruzado: dice quién lo pidió', () => {
    assert.equal(textoEntrega({ creador_user_id: 'u1', destinatario_user_id: 'u2', creador_display: 'Jorge', contenido: 'buscar las llaves' }),
      'Jorge te recordó: buscar las llaves.')
  })

  it('el punto final no se duplica ni se pierde', () => {
    assert.equal(textoEntrega({ creador_user_id: 'u1', destinatario_user_id: 'u1', contenido: 'cargar saldos.  ' }),
      'Recordatorio: cargar saldos.')
  })
})

describe('entrega de recordatorios · camino real', () => {
  it('entrega un recordatorio propio por DM y lo cierra', async () => {
    const { repo, mm, entregar } = armar()
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    const res = await entregar()
    assert.deepEqual([res.corrio, res.entregados, res.fallidos], [true, 1, 0])
    assert.deepEqual(mm.textos, ['Recordatorio: cargar saldos.'])
    assert.equal(mm.dms[0], 'u-jorge')
    assert.equal((await repo.porId(r.id)).estado, ESTADO_RECORDATORIO.ENTREGADO)
    assert.equal(repo.entregas[0].estado, ESTADO_ENTREGA.ENTREGADA)
    assert.equal(repo.entregas[0].post_id, 'post_1', 'queda la evidencia de que Mattermost lo aceptó')
    assert.equal(repo.entregas[0].canal_id, 'dm_u-jorge')
  })

  it('el cruzado se entrega al DESTINATARIO, no al que lo pidió', async () => {
    const { repo, mm, entregar } = armar()
    await repo.crear({ creador: JORGE, destinatario: RODRIGO, contenido: 'buscar las llaves', cuando: LUNES_8 })
    await entregar()
    assert.deepEqual(mm.dms, ['u-rodrigo'])
    assert.deepEqual(mm.textos, ['Jorge te recordó: buscar las llaves.'])
  })

  it('no entrega nada antes de la hora', async () => {
    const { repo, mm, entregar } = armar({ enElMomento: false })
    await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    const res = await entregar()
    assert.deepEqual([res.entregados, res.fallidos], [0, 0])
    assert.equal(mm.posts.length, 0)
  })

  it('un recurrente suena en cada ocurrencia y en ninguna dos veces', async () => {
    const { repo, reloj, mm, entregar } = armar()
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8, cadencia: 'weekly:lun:08:00' })
    for (let i = 0; i < 3; i++) {
      await entregar()
      await entregar() // segunda pasada en el MISMO instante: no puede volver a sonar
      reloj.poner((await repo.porId(r.id)).proxima_ejecucion)
    }
    assert.equal(mm.posts.length, 3, 'una entrega por ocurrencia, ni una más')
    assert.equal(repo.entregas.length, 3)
    assert.equal((await repo.porId(r.id)).estado, ESTADO_RECORDATORIO.ACTIVO)
  })

  it('respeta su propio intervalo: no consulta la base en cada vuelta del loop', async () => {
    const { repo, entregar, reloj } = armar({ intervaloMs: 30_000 })
    await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    assert.equal((await entregar()).corrio, true)
    assert.equal((await entregar()).corrio, false)
    reloj.avanzar(30_001)
    assert.equal((await entregar()).corrio, true)
  })
})

describe('entrega de recordatorios · cuando algo sale mal', () => {
  it('si el DM no abre es un fallo de entrega, no un crash: se reintenta después', async () => {
    const { repo, entregar } = armar({ mm: mattermostDoble({ abre: false }) })
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    const res = await entregar()
    assert.deepEqual([res.entregados, res.fallidos], [0, 1])
    const rec = await repo.porId(r.id)
    assert.equal(rec.estado, ESTADO_RECORDATORIO.ACTIVO)
    assert.equal(rec.intentos, 1)
    assert.equal(rec.proxima_ejecucion, new Date(LUNES_8).toISOString(), 'la ocurrencia no se movió')
    assert.equal(repo.entregas[0].estado, ESTADO_ENTREGA.FALLIDA)
    assert.ok(repo.entregas[0].error, 'queda registrado que Mattermost NO lo aceptó')
  })

  it('si Mattermost rechaza el mensaje tampoco se da por entregado', async () => {
    const { repo, entregar } = armar({ mm: mattermostDoble({ rechaza: true }) })
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    await entregar()
    assert.equal((await repo.porId(r.id)).estado, ESTADO_RECORDATORIO.ACTIVO)
    assert.equal(repo.entregas[0].estado, ESTADO_ENTREGA.FALLIDA)
  })

  it('una excepción publicando no propaga al tick y no frena a los que vienen atrás', async () => {
    const { repo, mm, entregar, log } = armar({ mm: mattermostDoble({ fallaVeces: 1 }) })
    await repo.crear({ creador: JORGE, contenido: 'el que revienta', cuando: LUNES_8 })
    await repo.crear({ creador: RODRIGO, contenido: 'el que sigue', cuando: LUNES_8 })
    const res = await entregar() // no lanza
    assert.deepEqual([res.entregados, res.fallidos], [1, 1])
    assert.deepEqual(mm.textos, ['Recordatorio: el que sigue.'])
    assert.ok(log.lineas.some((l) => l.nivel === 'error'), 'el fallo se registra, no se traga en silencio')
  })

  it('tras agotar los intentos queda en dead-letter y deja de sonar', async () => {
    const { repo, reloj, entregar, log } = armar({ mm: mattermostDoble({ abre: false }), maxIntentos: 2 })
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    await entregar()
    reloj.avanzar(61_000) // pasa el backoff del primer intento
    await entregar()
    const rec = await repo.porId(r.id)
    assert.equal(rec.estado, ESTADO_RECORDATORIO.FALLIDO)
    assert.ok(rec.ultimo_error)
    assert.ok(log.lineas.some((l) => l.msg.includes('abandonado')), 'un recordatorio que se abandona se dice')
    reloj.avanzar(86_400_000)
    assert.deepEqual((await entregar()).fallidos, 0, 'ya no vuelve a intentarse nunca')
  })

  it('si el worker publicó y murió antes de anotar, el que vuelve NO entrega dos veces', async () => {
    const { repo, mm, reloj, entregar } = armar()
    const r = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8 })
    // Lo que quedó del worker muerto: la entrega ya salió a Mattermost y quedó anotada,
    // pero el recordatorio nunca se reprogramó y su lease terminó venciendo.
    await repo.registrarEntrega(r, { programadaPara: r.proxima_ejecucion, estado: ESTADO_ENTREGA.ENTREGADA, postId: 'post_del_muerto' })
    reloj.avanzar(300_000)
    const res = await entregar()
    assert.equal(mm.posts.length, 0, 'la barrera por ocurrencia se consulta ANTES de publicar')
    assert.deepEqual([res.entregados, res.fallidos], [0, 0])
    assert.equal((await repo.porId(r.id)).estado, ESTADO_RECORDATORIO.ENTREGADO, 'igual se cierra: la ocurrencia está saldada')
  })

  it('si la base se cae, el paso devuelve cero y no voltea el tick', async () => {
    const { repo, entregar } = armar()
    repo.reclamarVencidos = async () => { throw new Error('la base no contesta') }
    const res = await entregar()
    assert.deepEqual([res.corrio, res.entregados, res.fallidos], [true, 0, 0])
  })
})
