// EL DEFECTO DEL 04/08, DE PUNTA A PUNTA, Y LO QUE EL CHAT CONTESTA EN CADA CASO.
//
// El dueño escribió «crea un evento para mañana a las 15…» y recibió «no tengo habilitado "Crear un
// evento en el calendario" para vos». Su Google estaba enlazado y la capacidad andaba: lo que
// faltaba era reconocerlo. La tabla tenía `u-jorge`; el evento traía `sascwozf13gppfubp6zkq3s8ho`.
//
// Estos tests usan el `habilitada` REAL (`googlePropioDisponible`), que es la función que decidía
// que no. Doblar eso dejaría probada una simulación de la decisión que causó el defecto.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atenderPedido } from './router.mjs'
import { CAPACIDAD, ERROR } from './contratos.mjs'
import { googlePropioDisponible, motivoGooglePropio } from './google-cliente.mjs'
import { MOTIVO_IDENTIDAD } from './identidades.mjs'
import { capacidad as capacidadAyuda } from './capacidades/ayuda.mjs'
import { baseFalsa, filaIdentidad, capacidadFalsa, registroFalso } from './dobles-de-prueba.mjs'
import { mmFalso } from '../comprobantes/dobles.mjs'
import { zCalendarEvento } from './contratos.mjs'

const AHORA = new Date('2026-08-04T12:00:00-03:00')
const ID_JORGE = 'sascwozf13gppfubp6zkq3s8ho'   // el id REAL de Mattermost
const EMAIL_JORGE = 'jorge@ecsas.com.ar'

const USUARIO_MM = {
  id: ID_JORGE, username: 'jorge', email: EMAIL_JORGE,
  first_name: 'Jorge', last_name: 'Corona', nickname: '', delete_at: 0, is_bot: false,
}

/** Las filas que había de verdad en producción: ids de una siembra de ejemplo. */
const SEMBRADAS = [filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: EMAIL_JORGE })]

/** Calendar, declarada como la real: exige la cuenta de Google DE LA PERSONA, y sabe explicarse. */
function capacidades() {
  return [
    capacidadAyuda,
    capacidadFalsa({
      id: CAPACIDAD.CALENDAR_EVENTO_CREAR, entrada: zCalendarEvento, efectoExterno: true,
      nombre: 'Crear un evento en el calendario',
      descripcion: 'agendarte una reunión en tu Google Calendar',
      permisos: ['calendar.write'],
      habilitada: (ctx) => googlePropioDisponible(ctx, ctx?.googleDeps),
      motivoNoHabilitada: (ctx) => motivoGooglePropio(ctx, ctx?.googleDeps),
    }),
  ]
}

function entorno({ identidades = SEMBRADAS, mm = mmFalso({ usuarios: { [ID_JORGE]: USUARIO_MM } }), conToken = [EMAIL_JORGE] } = {}) {
  const db = baseFalsa({ identidades, ahora: () => AHORA })
  const lista = capacidades()
  const ctx = {
    port: db,
    actor: { plataformaUserId: ID_JORGE, plataformaUsername: 'jorge' },
    channelId: 'canal-1', rootPostId: 'post-1', commEventId: 'e1111111-1111-4111-8111-111111111111',
    ahora: () => AHORA,
    mattermost: mm,
    // La cuenta de Google se resuelve aparte; acá lo que se prueba es la IDENTIDAD.
    googleDe: async () => null,
    googleDeps: { tieneToken: async (e) => conToken.includes(String(e).toLowerCase()) },
  }
  const deps = { registro: registroFalso(lista) }
  return {
    db,
    pedir: (texto, extra = {}) => atenderPedido({ texto, ctx: { ...ctx, ...extra }, deps }),
    cap: (id) => lista.find((c) => c.id === id),
  }
}

// Sin invitados a propósito: lo que se prueba es la identidad de QUIEN PIDE, no la de terceros.
const PEDIDO = 'agendá la visita a la obra mañana a las 15'

// ── A · la identidad se repara en el momento del pedido ──────────────────────

test('el pedido REAL que falló: con el id de Mattermost sin fila, la identidad se repara y el evento se crea', async () => {
  const e = entorno()

  const r = await e.pedir(PEDIDO)

  assert.equal(r.ok, true, `debía ejecutarse y contestó: ${r.texto ?? r.error?.mensaje}`)
  assert.equal(r.capacidad, CAPACIDAD.CALENDAR_EVENTO_CREAR)
  // Y la identidad quedó escrita con el email que mandó MATTERMOST.
  const fila = e.db.identidades.find((i) => i.plataforma_user_id === ID_JORGE)
  assert.equal(fila.email, EMAIL_JORGE)
  assert.equal(fila.plataforma_username, 'jorge')
})

test('si Mattermost no contesta no se inventa identidad, y el mensaje dice que es problema del OS', async () => {
  const e = entorno({ mm: mmFalso({ usuariosRoto: true }) })

  const r = await e.pedir(PEDIDO)

  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.IDENTIDAD_NO_RESUELTA)
  assert.match(r.error.mensaje, /no te tengo registrado/i)
  assert.match(r.error.mensaje, /Dirección/)
  assert.equal(e.db.identidades.length, 1, 'fail-closed: no se escribió ninguna fila')
  assert.equal(e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas.length, 0)
})

// ── B · el mensaje deja de mentir ────────────────────────────────────────────

test('sin identidad, el chat NO dice "no tenés eso habilitado": dice que no te reconoce y a quién avisarle', async () => {
  const e = entorno({ mm: mmFalso({ usuarios: {} }) }) // Mattermost no conoce ese id

  const r = await e.pedir(PEDIDO)

  assert.equal(r.error.codigo, ERROR.IDENTIDAD_NO_RESUELTA)
  assert.equal(/no tengo habilitado/i.test(r.error.mensaje), false, 'esa frase era la mentira')
  assert.match(r.error.detalle, new RegExp(MOTIVO_IDENTIDAD.NO_REGISTRADA))
})

test('identificado pero sin Google enlazado: se lo nombra por lo que es y se dice qué hacer', async () => {
  const e = entorno({
    identidades: [filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: EMAIL_JORGE })],
    conToken: [], // nadie enlazó su Google
  })

  const r = await e.pedir(PEDIDO)

  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.CAPACIDAD_DESHABILITADA, 'esto SÍ es del usuario, no del OS')
  assert.match(r.error.mensaje, /Conectar con Google/)
  assert.match(r.error.mensaje, new RegExp(EMAIL_JORGE))
  assert.equal(/Dirección/.test(r.error.mensaje), false, 'no es un problema del OS: no se lo mande a Dirección')
})

test('"¿qué sabés hacer?" sin identidad no muestra un bot tonto: muestra lo que no puede y por qué', async () => {
  const e = entorno({ mm: mmFalso({ usuarios: {} }) })

  const r = await e.pedir('¿qué sabés hacer?')

  assert.equal(r.ok, true)
  assert.match(r.texto, /Google Calendar/, 'la capacidad se nombra igual: el OS sabe hacerlo')
  assert.match(r.texto, /ahora no puedo/i)
  assert.match(r.texto, /no te tengo registrado/i)
  assert.deepEqual(r.evidencia.noDisponibles, [{ id: CAPACIDAD.CALENDAR_EVENTO_CREAR, motivo: MOTIVO_IDENTIDAD.NO_REGISTRADA }])
})

test('con la identidad resuelta, la ayuda vuelve a ser la de siempre: nada que aclarar', async () => {
  const e = entorno({ identidades: [filaIdentidad({ id: ID_JORGE, username: 'jorge', nombre: 'Jorge Corona', email: EMAIL_JORGE })] })

  const r = await e.pedir('¿qué sabés hacer?')

  assert.equal(/ahora no puedo/i.test(r.texto), false)
  assert.deepEqual(r.evidencia.noDisponibles, [])
})
