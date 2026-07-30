// La SEGUNDA PUERTA a la pantalla de asistencia.
//
// Desde la v2 la carga se hace en una pantalla, no conversando. Pero el flujo por chat quedó
// vivo a propósito (celular sin navegador, pantalla caída), así que la regla de cuándo se
// invita y cuándo se conversa tiene que estar clavada con tests: si esto se corre de lugar,
// o el jefe deja de poder cargar, o se le rompe una carga a mitad de camino.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from './especialistas/personal.mjs'

const ACTOR = { plataforma_user_id: 'usr-jefe-1', plataforma_username: 'jorge' }

/** Doble de la invitación: devuelve un texto reconocible sin firmar nada de verdad. */
const invitaSiempre = () => 'ABRIR PANTALLA https://ejemplo/asistencia?t=xxx'

/**
 * Corre `atender` sin base ni Google. Lo único que se observa es SI se invitó: cuando la
 * ejecución sigue al flujo conversacional, ese flujo no puede completarse sin `port` — a
 * veces devuelve un error con gracia y a veces lanza, y ninguna de las dos cosas es lo que
 * este archivo mide.
 */
async function atender(texto, invitar) {
  let invitado = false
  const espiado = (...a) => { const t = invitar(...a); invitado = Boolean(t); return t }
  let salida = null
  try { salida = await especialista.atender({ texto, actor: ACTOR, invitar: espiado }) } catch { /* el conversacional necesita base */ }
  return { invitado, salida }
}

test('arrancar una carga abre la PANTALLA, no el formulario conversacional', async () => {
  const { invitado, salida } = await atender('asistencia', invitaSiempre)
  assert.equal(invitado, true)
  assert.equal(salida.estado, 'invitado')
  assert.match(salida.texto, /ABRIR PANTALLA/)
  assert.equal(salida.privado, true, 'la invitación lleva un enlace de un solo uso: nunca es pública')
})

test('"asistencia por chat" es la salida de emergencia: NO invita', async () => {
  for (const texto of ['asistencia por chat', 'asistencia por mensaje', 'asistencia por acá']) {
    const { invitado } = await atender(texto, invitaSiempre)
    assert.equal(invitado, false, `«${texto}»: pidió cargar por chat, no se le devuelve un enlace`)
  }
})

test('un paso intermedio del formulario NUNCA invita (rompería la carga en curso)', async () => {
  for (const paso of ['obra 1', '1 presente', '3 ausente', 'revisar', 'confirmar', 'cancelar']) {
    const { invitado } = await atender(paso, invitaSiempre)
    assert.equal(invitado, false, `«${paso}» es un paso del formulario, no un arranque`)
  }
})

test('una CONSULTA nunca invita: se responde con el dato', async () => {
  for (const q of ['quién faltó ayer', 'asistencia de hoy', 'horas extra del 17/01']) {
    const { invitado } = await atender(q, invitaSiempre)
    assert.equal(invitado, false, `«${q}» es una consulta`)
  }
})

test('sin enlace configurado se cae al flujo por chat: nadie queda sin poder cargar', async () => {
  const { invitado, salida } = await atender('asistencia', () => null)
  assert.equal(invitado, false)
  assert.ok(salida === null || salida.estado !== 'invitado', 'sin enlace tiene que seguir por chat')
})

test('el default real no inventa un enlace cuando falta el secreto', async () => {
  const previo = { s: process.env.ASISTENCIA_ENLACE_SECRETO, u: process.env.ASISTENCIA_URL_BASE }
  delete process.env.ASISTENCIA_ENLACE_SECRETO
  delete process.env.ASISTENCIA_URL_BASE
  try {
    let salida = null
    try { salida = await especialista.atender({ texto: 'asistencia', actor: ACTOR }) } catch { /* necesita base */ }
    assert.ok(salida === null || salida.estado !== 'invitado', 'sin secreto no puede haber invitación')
  } finally {
    if (previo.s) process.env.ASISTENCIA_ENLACE_SECRETO = previo.s
    if (previo.u) process.env.ASISTENCIA_URL_BASE = previo.u
  }
})

test('la skill declarada en la auditoría no cambia por invitar', () => {
  assert.equal(especialista.skillDe({ destino: 'registro' }), 'personal.registrar_asistencia')
  assert.equal(especialista.skillDe({ destino: 'consulta' }), 'personal.consultar_asistencia')
})
