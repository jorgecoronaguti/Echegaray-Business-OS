// `/asistencia` es la MISMA carga que `@os asistencia`, por otra puerta.
//
// Lo que estos tests cuidan es justamente eso: que la puerta nueva no afloje nada ni invente
// un camino propio. Si algún día el comando deja de llamar al mismo arranque, o responde al
// canal algo que debía ser privado, se rompe acá.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearComandoAsistencia, RESPUESTA } from './comando-asistencia.mjs'

const TOKEN = 'token-del-comando-de-mattermost'
const CAMPOS = {
  token: TOKEN, user_id: 'usr-jefe', user_name: 'jorge',
  channel_id: 'canal-asistencia', command: '/asistencia', text: '',
}

/** Doble del arranque: registra con qué lo llamaron. */
function inicioDoble(devuelve) {
  const llamadas = []
  return {
    llamadas,
    fn: async (args) => { llamadas.push(args); return devuelve },
  }
}
const CON_MENSAJE = { texto: 'Carga de asistencia', attachments: [{ title: 'Asistencia' }, { title: 'Obra' }], estado: 'iniciado' }

test('el mensaje interactivo va AL CANAL: un efímero no se puede actualizar', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  const r = await manejar({ campos: CAMPOS })
  assert.equal(r.status, 200)
  assert.equal(r.body.response_type, RESPUESTA.CANAL)
  assert.equal(r.body.attachments.length, 2)
})

test('llama EXACTAMENTE al mismo arranque que @os asistencia, con la identidad real', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn, url: 'https://x/accion' })
  await manejar({ campos: CAMPOS })
  assert.equal(i.llamadas.length, 1, 'el comando no puede tener su propio camino')
  const a = i.llamadas[0].actor
  assert.equal(a.plataforma_user_id, 'usr-jefe')
  assert.equal(a.channel_id, 'canal-asistencia', 'el canal viaja: la guarda lo necesita')
  assert.equal(i.llamadas[0].url, 'https://x/accion')
})

test('la identidad sale de Mattermost, nunca del cuerpo del pedido', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  await manejar({ campos: { ...CAMPOS, plataforma_user_id: 'otro-usuario', user_id: 'usr-jefe' } })
  assert.equal(i.llamadas[0].actor.plataforma_user_id, 'usr-jefe')
})

test('sin token configurado NO se atiende: mejor apagado que abierto', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: null, iniciar: i.fn })
  const r = await manejar({ campos: CAMPOS })
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  assert.equal(i.llamadas.length, 0, 'no se abrió nada')
})

test('un token que no coincide se rechaza sin decir por qué', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  const r = await manejar({ campos: { ...CAMPOS, token: 'otro-token-cualquiera' } })
  assert.equal(i.llamadas.length, 0)
  assert.ok(!/venc|existe|largo|correcto/i.test(r.body.text), 'no se filtra en qué falló')
})

test('un token de otro largo tampoco pasa (y no rompe la comparación)', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  for (const t of ['', 'corto', TOKEN + 'x', undefined, null, 12345]) {
    const r = await manejar({ campos: { ...CAMPOS, token: t } })
    assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  }
  assert.equal(i.llamadas.length, 0)
})

test('sin identidad no se abre nada', async () => {
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  const r = await manejar({ campos: { ...CAMPOS, user_id: '' } })
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  assert.equal(i.llamadas.length, 0)
})

test('un RECHAZO es privado: no ensucia el canal ni expone a nadie', async () => {
  // La guarda corre dentro del arranque y devuelve texto sin attachments.
  const i = inicioDoble({ texto: 'La asistencia se carga desde el canal #asistencia.', estado: 'denegado' })
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn })
  const r = await manejar({ campos: CAMPOS })
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  assert.match(r.body.text, /#asistencia/)
})

test('si el arranque explota, se responde en castellano y sin stack', async () => {
  const manejar = crearComandoAsistencia({
    tokenComando: TOKEN,
    iniciar: async () => { throw new Error('boom en /var/secreto token=abc') },
  })
  const r = await manejar({ campos: CAMPOS })
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  assert.ok(!/boom|secreto|token=|Error:/.test(JSON.stringify(r.body)))
})

// ── AUDITORÍA DE LOS RECHAZOS ───────────────────────────────────────────────────
//
// Un intento negado que no deja rastro es un agujero: después nadie puede revisar quién
// quiso cargar, desde dónde y por qué no pudo. Se registra con el MISMO ledger que la
// carga exitosa, y nunca puede voltear el veredicto.

function auditorDoble() {
  const eventos = []
  const fn = async (evento, datos) => { eventos.push({ evento, datos }); return { ok: true } }
  fn.eventos = eventos
  return fn
}
const CON_EQUIPO = { ...CAMPOS, team_id: 'equipo-1' }

test('sin token configurado: el rechazo QUEDA ANOTADO', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: null, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: CON_EQUIPO })
  assert.equal(a.eventos.length, 1)
  const { evento, datos } = a.eventos[0]
  assert.match(evento, /denied$/)
  assert.equal(datos.origen, 'slash_command')
  assert.equal(datos.error_code, 'token_sin_configurar')
  assert.equal(datos.channel_id, 'canal-asistencia')
  assert.equal(datos.team_id, 'equipo-1')
})

test('token inválido: se anota, y la identidad queda marcada como NO verificada', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: { ...CON_EQUIPO, token: 'otro-token-cualquiera' } })
  assert.equal(a.eventos[0].datos.error_code, 'token_invalido')
  assert.equal(a.eventos[0].datos.identidad_verificada, false,
    'con el token mal, el user_id es lo que ALGUIEN DICE ser')
})

test('el token NUNCA viaja a la auditoría', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: { ...CON_EQUIPO, token: 'token-secreto-de-alguien' } })
  const s = JSON.stringify(a.eventos)
  assert.ok(!s.includes('token-secreto-de-alguien') && !s.includes(TOKEN))
})

test('sin identidad: se anota', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: { ...CON_EQUIPO, user_id: '' } })
  assert.equal(a.eventos[0].datos.error_code, 'sin_identidad')
})

test('un pedido ACEPTADO no genera un rechazo: nada de auditorías duplicadas ni falsas', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: CON_EQUIPO })
  assert.equal(a.eventos.length, 0)
})

test('un rechazo se anota UNA sola vez', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  await manejar({ campos: { ...CON_EQUIPO, token: 'mal' } })
  assert.equal(a.eventos.length, 1)
})

test('si la auditoría falla, el rechazo SIGUE siendo un rechazo', async () => {
  const rota = async () => { throw new Error('la base no responde') }
  const i = inicioDoble(CON_MENSAJE)
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: i.fn, auditar: rota })
  const r = await manejar({ campos: { ...CON_EQUIPO, token: 'mal' } })
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA, 'no se cae ni cambia la respuesta')
  assert.equal(i.llamadas.length, 0, 'un fallo de auditoría nunca puede dejar pasar el pedido')
})

test('el mensaje al usuario no cambió por auditar', async () => {
  const a = auditorDoble()
  const manejar = crearComandoAsistencia({ tokenComando: TOKEN, iniciar: inicioDoble(CON_MENSAJE).fn, auditar: a })
  const r = await manejar({ campos: { ...CON_EQUIPO, token: 'mal' } })
  assert.equal(r.status, 200)
  assert.equal(r.body.response_type, RESPUESTA.PRIVADA)
  assert.equal(r.body.text, 'No pude verificar que este pedido venga de Mattermost.')
})

test('no razona: esta puerta tiene que andar sin crédito de API', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./comando-asistencia.mjs', import.meta.url), 'utf8')
  assert.ok(!/anthropic|claude|razonar\(/i.test(src))
})

test('no hay ids de Mattermost escritos a mano', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./comando-asistencia.mjs', import.meta.url), 'utf8')
  const sinComentarios = src.replace(/\/\/.*$/gm, '')
  assert.ok(!/['"][a-z0-9]{26}['"]/.test(sinComentarios), 'el canal sale de la base, no del código')
})
