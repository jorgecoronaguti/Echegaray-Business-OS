// EL GUARDIÁN QUE EL TIMER PROMETÍA DESDE EL 31/07 Y NO EXISTÍA.
//
// El comentario de `echegaray-arca-sync.timer` decía "el script le pregunta a la API cuánto queda
// antes de gastar, y se niega si no alcanza (ver orquestador/lib/afipsdk-presupuesto.mjs)". Ese
// archivo no estaba. La única defensa real era el propio comentario que decía no depender de sí mismo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ventanaDe, contarEnVentana, decidir, presupuesto, registrarConsumo, leerUso, credencialAceptada,
} from './afipsdk-presupuesto.mjs'

const tmp = async (nombre) => join(await mkdtemp(join(tmpdir(), 'afipsdk-')), nombre)

// ── EL CONTEO ────────────────────────────────────────────────────────────────────────────────────

test('la ventana es el mes calendario y no arrastra el gasto del mes anterior', () => {
  assert.equal(ventanaDe('2026-08-07'), '2026-08')
  const registro = {
    eventos: [
      { fecha: '2026-07-27', cantidad: 2 }, { fecha: '2026-08-03', cantidad: 2 }, { fecha: '2026-08-07', cantidad: 1 },
    ],
  }
  assert.equal(contarEnVentana(registro, '2026-08'), 3)
  assert.equal(contarEnVentana(registro, '2026-07'), 2)
  assert.equal(contarEnVentana({}, '2026-08'), 0)
})

// ── LA DECISIÓN ──────────────────────────────────────────────────────────────────────────────────

test('SE NIEGA cuando lo que queda no alcanza — y dice cuánto queda', () => {
  // Plan free 10, reserva 2 para el dueño: con 8 gastadas no queda nada para una corrida de 2.
  const d = decidir({ usadas: 8, pedido: 2, limite: 10, reserva: 2 })
  assert.equal(d.ok, false)
  assert.equal(d.disponible, 0)
  assert.match(d.motivo, /necesito 2 automatización\(es\) y quedan 0/)
})

test('LA RESERVA DEL DUEÑO NO SE GASTA SOLA: con 6 usadas de 10 todavía entra una corrida, con 7 no', () => {
  // 10 − 2 de reserva = 8 disponibles para el timer. Sin reserva, el agente puede dejar al dueño sin
  // poder bajar sus comprobantes justo el día que los necesita, y no hay forma de conseguir más.
  assert.equal(decidir({ usadas: 6, pedido: 2, limite: 10, reserva: 2 }).ok, true)
  assert.equal(decidir({ usadas: 7, pedido: 2, limite: 10, reserva: 2 }).ok, false)
})

test('FALLA CERRADO si el límite no se entiende: no hay tope implícito', () => {
  // Interpretar un límite vacío como "no hay tope" gasta el plan entero en una corrida.
  for (const limite of [0, -1, NaN, null, 'diez']) {
    const d = decidir({ usadas: 0, pedido: 2, limite })
    assert.equal(d.ok, false, `límite ${String(limite)} tendría que bloquear`)
    assert.match(d.motivo, /no declarado o inválido/)
  }
  // No pasar el parámetro es otra cosa: ahí manda el límite declarado del plan (10), que es el que
  // el dueño escribió en el timer. "No me dijeron" ≠ "me dijeron cualquier cosa".
  assert.equal(decidir({ usadas: 0, pedido: 2 }).ok, true)
})

// ── EL ARCHIVO ───────────────────────────────────────────────────────────────────────────────────

test('el contador persiste entre corridas y el presupuesto lo mira', async () => {
  const archivo = await tmp('uso.json')
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-03', detalle: 'R', archivo })
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-03', detalle: 'E', archivo })
  const p = await presupuesto({ pedido: 2, hoy: '2026-08-07', archivo, limite: 10, reserva: 2 })
  assert.equal(p.usadas, 2)
  assert.equal(p.ok, true)
  assert.equal(p.ventana, '2026-08')
  // Y una corrida que ya gastó todo el margen se niega la próxima vez.
  await registrarConsumo({ cantidad: 6, fecha: '2026-08-07', archivo })
  assert.equal((await presupuesto({ pedido: 2, hoy: '2026-08-07', archivo, limite: 10, reserva: 2 })).ok, false)
})

test('la primera corrida no explota, pero un registro ILEGIBLE sí', async () => {
  // ENOENT es legítimo (nunca se gastó nada). Un JSON roto NO: leerlo como "cero gastadas" sería
  // inventar saldo justo cuando no se sabe.
  const nuevo = await tmp('no-existe.json')
  assert.deepEqual(await leerUso(nuevo), { eventos: [] })
  const roto = await tmp('roto.json')
  await writeFile(roto, '{ esto no es json', 'utf8')
  await assert.rejects(() => leerUso(roto), /no puedo leer el registro de uso/)
})

test('la bitácora se poda: no crece para siempre', async () => {
  const archivo = await tmp('podado.json')
  await writeFile(archivo, JSON.stringify({ eventos: Array.from({ length: 500 }, () => ({ fecha: '2026-01-01', cantidad: 1 })) }), 'utf8')
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-07', archivo })
  assert.equal(JSON.parse(await readFile(archivo, 'utf8')).eventos.length, 400)
})

// ── LA CREDENCIAL ────────────────────────────────────────────────────────────────────────────────

test('un 401 BLOQUEA la corrida antes de gastar cuota — es lo que pasó el 03/08', () => {
  // Verificado el 07/08 contra la API real: GET /api/v1/automations con el token del OS devuelve
  // 401 {"message":"El token proporcionado es invalido."}. Sin este preflight, el sync quema la
  // corrida semanal contra un token muerto y el journal se queda sin el motivo.
  const fetchImpl = async () => ({ status: 401, text: async () => '{"message":"El token proporcionado es invalido."}' })
  return credencialAceptada({ token: 'x', fetchImpl }).then((r) => {
    assert.equal(r.ok, false)
    assert.equal(r.status, 401)
    assert.match(r.motivo, /token proporcionado es invalido/)
    assert.match(r.motivo, /REFRESH_TOKEN/, 'tiene que decir cómo se arregla')
  })
})

test('la sonda NO bloquea por un error que no habla del token', async () => {
  // Un 500 de AfipSDK o un timeout no prueban que la credencial esté mal. Negarse ahí dejaría el sync
  // muerto por una causa que no es.
  const cae = await credencialAceptada({ token: 'x', fetchImpl: async () => { throw new Error('ETIMEDOUT') } })
  assert.equal(cae.ok, true)
  const err500 = await credencialAceptada({ token: 'x', fetchImpl: async () => ({ status: 500, text: async () => '' }) })
  assert.equal(err500.ok, true)
})

test('sin token no se sondea nada: se dice que falta', async () => {
  const r = await credencialAceptada({ token: null, fetchImpl: async () => { throw new Error('no debería llamarse') } })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /no hay ACCESS_TOKEN/)
})

test('la sonda es READ-ONLY: método GET y ninguna creación de automatización', async () => {
  // Una sonda que creara una automatización para averiguar si queda cuota sería el chiste completo.
  let visto = null
  await credencialAceptada({ token: 'x', fetchImpl: async (url, opts) => { visto = { url, opts }; return { status: 200, text: async () => '' } } })
  assert.equal(visto.opts.method, 'GET')
  assert.equal(visto.opts.body, undefined)
})
