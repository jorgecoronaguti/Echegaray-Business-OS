// Tests del repositorio de recordatorios y de sus reglas. Sin base y sin red: el reloj y
// Mattermost son dobles, todo lo demás es el código real.
//
// Lo que estos tests custodian es lo que no se puede ver mirando el chat: que una ocurrencia
// no se entregue dos veces, que ninguna se saltee, que dos workers no se peleen el mismo
// recordatorio y que un fallo de entrega termine — en éxito o en dead-letter, pero termine.

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { ESTADO_RECORDATORIO } from './contratos.mjs'
import {
  BACKOFF_TECHO_MS, ESTADO_ENTREGA, MAX_INTENTOS_DEFAULT, RecordatoriosMemoria,
  backoffMs, frecuenciaEnTexto, planFallo, planReprogramacion, puedeCancelar,
} from './recordatorios.mjs'
import { relojFijo } from './dobles-recordatorios.mjs'

const LUNES_8 = '2026-08-03T08:00:00-03:00' // lunes 3 de agosto de 2026, 08:00 AR
const JORGE = { userId: 'u-jorge', display: 'Jorge' }
const RODRIGO = { userId: 'u-rodrigo', display: 'Rodrigo' }

/** Repositorio con el reloj parado un minuto ANTES del lunes 8:00. */
function armar(iso = '2026-08-03T07:59:00-03:00') {
  const reloj = relojFijo(iso)
  return { reloj, repo: new RecordatoriosMemoria({ ahora: reloj.ahora }) }
}

const crearPropio = (repo, extra = {}) => repo.crear({
  creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8, ...extra,
})

describe('recordatorios · creación', () => {
  it('un recordatorio propio queda activo, para uno mismo y con su momento', async () => {
    const { repo } = armar()
    const r = await crearPropio(repo)
    assert.equal(r.estado, ESTADO_RECORDATORIO.ACTIVO)
    assert.equal(r.creador_user_id, 'u-jorge')
    assert.equal(r.destinatario_user_id, 'u-jorge')
    assert.equal(r.proxima_ejecucion, new Date(LUNES_8).toISOString())
    assert.equal(r.duplicado, false)
  })

  it('un recordatorio cruzado guarda a los dos, con el nombre visible de cada uno', async () => {
    const { repo } = armar()
    const r = await repo.crear({ creador: JORGE, destinatario: RODRIGO, contenido: 'buscar las llaves', cuando: LUNES_8 })
    assert.equal(r.creador_display, 'Jorge')
    assert.equal(r.destinatario_user_id, 'u-rodrigo')
    assert.equal(r.destinatario_display, 'Rodrigo')
  })

  it('el mismo mensaje reintentado NO crea un segundo recordatorio', async () => {
    const { repo } = armar()
    const a = await crearPropio(repo, { idempotencyKey: 'comm-evt-1' })
    const b = await crearPropio(repo, { idempotencyKey: 'comm-evt-1' })
    assert.equal(b.duplicado, true)
    assert.equal(b.id, a.id)
    assert.equal(repo.filas.length, 1)
  })

  it('sin contenido o sin momento no hay recordatorio', async () => {
    const { repo } = armar()
    await assert.rejects(() => repo.crear({ creador: JORGE, contenido: '  ', cuando: LUNES_8 }))
    await assert.rejects(() => repo.crear({ creador: JORGE, contenido: 'algo', cuando: 'el jueves' }))
  })
})

describe('recordatorios · listado y cancelación', () => {
  it('cada uno ve los propios y los que le pusieron, y nada más', async () => {
    const { repo } = armar()
    await crearPropio(repo)
    await repo.crear({ creador: JORGE, destinatario: RODRIGO, contenido: 'llevar la documentación', cuando: LUNES_8 })
    assert.equal((await repo.listarDe('u-jorge')).length, 2)   // el suyo + el que creó
    assert.equal((await repo.listarDe('u-rodrigo')).length, 1) // el que le pusieron
    assert.equal((await repo.listarDe('u-ajeno')).length, 0)
  })

  it('cancelar es lógico y sólo lo puede hacer el creador o el destinatario', async () => {
    const { repo } = armar()
    const r = await repo.crear({ creador: JORGE, destinatario: RODRIGO, contenido: 'algo', cuando: LUNES_8 })
    assert.equal((await repo.cancelar(r.id, 'u-ajeno')).motivo, 'recordatorio_ajeno')
    assert.equal((await repo.porId(r.id)).estado, ESTADO_RECORDATORIO.ACTIVO)
    const ok = await repo.cancelar(r.id, 'u-rodrigo') // el destinatario también puede
    assert.equal(ok.ok, true)
    assert.equal(ok.recordatorio.estado, ESTADO_RECORDATORIO.CANCELADO)
    assert.ok(ok.recordatorio.cerrado_at, 'queda la marca de cuándo se cerró')
    assert.equal((await repo.cancelar(r.id, 'u-jorge')).motivo, 'recordatorio_cerrado')
  })

  it('un recordatorio cancelado ya no se reclama para entregar', async () => {
    const { repo, reloj } = armar()
    const r = await crearPropio(repo)
    await repo.cancelar(r.id, 'u-jorge')
    reloj.poner(LUNES_8)
    assert.equal((await repo.reclamarVencidos({ worker: 'w1' })).length, 0)
  })

  it('puedeCancelar: la regla es de propiedad, no de rol', () => {
    const rec = { creador_user_id: 'a', destinatario_user_id: 'b' }
    assert.equal(puedeCancelar(rec, 'a'), true)
    assert.equal(puedeCancelar(rec, 'b'), true)
    assert.equal(puedeCancelar(rec, 'c'), false)
  })
})

describe('recordatorios · claim con lease', () => {
  it('dos workers a la vez: se lo lleva UNO solo', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner(LUNES_8)
    const w1 = await repo.reclamarVencidos({ worker: 'w1' })
    const w2 = await repo.reclamarVencidos({ worker: 'w2' })
    assert.equal(w1.length, 1)
    assert.equal(w2.length, 0, 'el segundo worker no puede tomar un recordatorio con lease vivo')
    assert.equal(w1[0].lease_worker, 'w1')
  })

  it('no se reclama nada antes de su momento', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner('2026-08-03T07:59:59-03:00')
    assert.equal((await repo.reclamarVencidos({ worker: 'w1' })).length, 0)
  })

  it('si el worker que lo tomó muere, otro lo retoma cuando vence el lease', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner(LUNES_8)
    await repo.reclamarVencidos({ worker: 'w1', leaseSegundos: 120 })
    reloj.avanzar(60_000)
    assert.equal((await repo.reclamarVencidos({ worker: 'w2' })).length, 0, 'el lease sigue vivo')
    reloj.avanzar(61_000)
    const w2 = await repo.reclamarVencidos({ worker: 'w2' })
    assert.equal(w2.length, 1)
    assert.equal(w2[0].lease_worker, 'w2')
  })

  it('el estado vive en el almacén, no en el objeto: otra instancia ve el mismo lease', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner(LUNES_8)
    await repo.reclamarVencidos({ worker: 'w1' })
    // "Reinicio": un repositorio nuevo sobre el mismo almacenamiento.
    const otro = new RecordatoriosMemoria({ ahora: reloj.ahora })
    otro.filas = repo.filas
    otro.entregas = repo.entregas
    assert.equal((await otro.reclamarVencidos({ worker: 'w2' })).length, 0)
    assert.equal((await otro.listarDe('u-jorge')).length, 1)
  })
})

describe('recordatorios · entrega y no-duplicación por ocurrencia', () => {
  it('la misma ocurrencia no se puede entregar dos veces', async () => {
    const { repo } = armar()
    const r = await crearPropio(repo)
    const primera = await repo.registrarEntrega(r, { programadaPara: LUNES_8, estado: ESTADO_ENTREGA.ENTREGADA, postId: 'p1' })
    const segunda = await repo.registrarEntrega(r, { programadaPara: LUNES_8, estado: ESTADO_ENTREGA.ENTREGADA, postId: 'p2' })
    assert.equal(primera.duplicado, false)
    assert.equal(segunda.duplicado, true, 'el conflicto por ocurrencia no es un error: es "ya se entregó"')
    assert.equal(repo.entregas.length, 1)
    assert.equal(await repo.yaEntregada(r.id, LUNES_8), true)
  })

  it('un intento FALLIDO no quema la ocurrencia: el reintento que entra la pisa', async () => {
    const { repo } = armar()
    const r = await crearPropio(repo)
    await repo.registrarEntrega(r, { programadaPara: LUNES_8, estado: ESTADO_ENTREGA.FALLIDA, error: 'timeout' })
    assert.equal(await repo.yaEntregada(r.id, LUNES_8), false)
    const ok = await repo.registrarEntrega(r, { programadaPara: LUNES_8, estado: ESTADO_ENTREGA.ENTREGADA, postId: 'p9', intento: 2 })
    assert.equal(ok.duplicado, false)
    assert.equal(repo.entregas.length, 1, 'sigue habiendo UNA fila por ocurrencia')
    assert.equal(repo.entregas[0].estado, ESTADO_ENTREGA.ENTREGADA)
  })

  it('un recordatorio único se cierra tras entregarse', async () => {
    const { repo } = armar()
    const r = await crearPropio(repo)
    const despues = await repo.reprogramar(r)
    assert.equal(despues.estado, ESTADO_RECORDATORIO.ENTREGADO)
    assert.ok(despues.cerrado_at)
    assert.equal(despues.lease_hasta, null, 'el lease se libera al cerrar')
  })

  it('un recurrente recorre sus ocurrencias en orden: ni repite ni saltea', async () => {
    const { repo, reloj } = armar()
    let rec = await repo.crear({ creador: JORGE, contenido: 'cargar saldos', cuando: LUNES_8, cadencia: 'weekly:lun:08:00' })
    const ocurrencias = []
    for (let i = 0; i < 5; i++) {
      reloj.poner(rec.proxima_ejecucion)
      const [tomado] = await repo.reclamarVencidos({ worker: 'w1' })
      assert.ok(tomado, `la ocurrencia ${i + 1} tiene que estar disponible`)
      const e = await repo.registrarEntrega(tomado, { programadaPara: tomado.proxima_ejecucion, estado: ESTADO_ENTREGA.ENTREGADA, postId: `p${i}` })
      assert.equal(e.duplicado, false, `la ocurrencia ${i + 1} no puede estar ya entregada`)
      ocurrencias.push(tomado.proxima_ejecucion)
      rec = await repo.reprogramar(tomado)
      assert.equal(rec.estado, ESTADO_RECORDATORIO.ACTIVO, 'un recurrente sigue vivo')
    }
    assert.equal(new Set(ocurrencias).size, 5, 'ninguna ocurrencia se entregó dos veces')
    const dias = ocurrencias.map((o) => new Date(o).toISOString().slice(0, 10))
    assert.deepEqual(dias, ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'])
    assert.equal(repo.entregas.length, 5)
  })

  it('la próxima se calcula desde la ocurrencia entregada y no desde "ahora"', () => {
    const plan = planReprogramacion({ cadencia: 'daily:08:00', proxima_ejecucion: '2026-08-03T11:00:00.000Z' },
      Date.parse('2026-08-06T15:00:00Z')) // el worker estuvo caído tres días
    assert.equal(plan.proximaEjecucion, '2026-08-04T11:00:00.000Z', 'no se saltea el 4, 5 y 6 en silencio')
  })
})

describe('recordatorios · fallo de entrega', () => {
  it('el reintento espera cada vez más y NO mueve la ocurrencia', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner(LUNES_8)
    const [tomado] = await repo.reclamarVencidos({ worker: 'w1' })
    const uno = await repo.marcarFallido(tomado, 'mattermost 500')
    assert.equal(uno.intentos, 1)
    assert.equal(uno.agotado, false)
    assert.equal(uno.estado, ESTADO_RECORDATORIO.ACTIVO)
    assert.equal(uno.proxima_ejecucion, new Date(LUNES_8).toISOString(),
      'la ocurrencia es la identidad de la entrega: el backoff no la puede correr')
    assert.equal(uno.ultimo_error, 'mattermost 500')
    // La espera se hace corriendo el lease: hasta que no venza, nadie lo reclama.
    assert.equal((await repo.reclamarVencidos({ worker: 'w2' })).length, 0)
    reloj.avanzar(61_000)
    const [reintento] = await repo.reclamarVencidos({ worker: 'w2' })
    assert.ok(reintento, 'pasado el backoff vuelve a estar disponible')
    const dos = await repo.marcarFallido(reintento, 'otra vez')
    assert.equal(dos.intentos, 2)
    assert.ok(Date.parse(dos.lease_hasta) - reloj.ahora() > 61_000, 'la segunda espera es mayor que la primera')
  })

  it('después de agotar los intentos queda en dead-letter, no girando para siempre', async () => {
    const { repo, reloj } = armar()
    await crearPropio(repo)
    reloj.poner(LUNES_8)
    let actual = (await repo.reclamarVencidos({ worker: 'w1' }))[0]
    for (let i = 1; i <= MAX_INTENTOS_DEFAULT; i++) actual = await repo.marcarFallido(actual, `fallo ${i}`)
    assert.equal(actual.agotado, true)
    assert.equal(actual.estado, ESTADO_RECORDATORIO.FALLIDO)
    assert.equal(actual.ultimo_error, `fallo ${MAX_INTENTOS_DEFAULT}`)
    assert.ok(actual.cerrado_at)
    reloj.avanzar(BACKOFF_TECHO_MS * 10)
    assert.equal((await repo.reclamarVencidos({ worker: 'w1' })).length, 0, 'un fallido no vuelve nunca')
  })

  it('el backoff crece pero tiene techo', () => {
    assert.equal(backoffMs(1), 60_000)
    assert.equal(backoffMs(2), 120_000)
    assert.equal(backoffMs(3), 240_000)
    assert.equal(backoffMs(99), BACKOFF_TECHO_MS)
    assert.equal(planFallo({ intentos: 1 }, { maxIntentos: 2 }).agotado, true)
  })
})

describe('recordatorios · cadencia en castellano', () => {
  it('la confirmación se puede desmentir porque dice el día y la hora', () => {
    assert.equal(frecuenciaEnTexto('weekly:lun:08:00'), 'todos los lunes a las 08:00')
    assert.equal(frecuenciaEnTexto('daily:07:30'), 'todos los días a las 07:30')
    assert.equal(frecuenciaEnTexto('monthly:5:09:00'), 'el 5 de cada mes a las 09:00')
    assert.equal(frecuenciaEnTexto(null), null)
  })
})
