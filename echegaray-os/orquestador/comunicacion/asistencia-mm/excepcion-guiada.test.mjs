// LA EXCEPCIÓN, GUIADA POR TIPO. Qué protegen estos tests.
//
// El formulario viejo mostraba el CATÁLOGO ENTERO de motivos y recién al guardar avisaba que
// "trabajó 5 horas · Faltó con aviso" es imposible. Un diálogo de Mattermost es ESTÁTICO: no
// hay evento de cambio, así que no se puede filtrar la lista después de abrirlo. La única
// forma de que la combinación inválida no exista es elegir el TIPO de novedad ANTES —tres
// desplegables en el post: no vino · hizo menos horas · hizo horas extra— y armar un
// formulario distinto para cada uno.
//
// Lo que se prueba acá es esa promesa: que al jefe de obra NUNCA se le ofrezca una opción que
// el backend le va a rechazar. La validación de fondo (`asistencia-motivos.mjs`) no cambia y
// también se verifica: sigue siendo la red que atrapa lo que llegue por otro camino.
//
// Sin red y sin base: el único doble es el cliente de Google y el de Mattermost. El núcleo de
// JORNALES, el catálogo de motivos y las sesiones son los REALES. Nunca se corre el pipeline
// productivo ni se toca la planilla verdadera.

import test from 'node:test'
import assert from 'node:assert/strict'

import { PASO } from './acciones.mjs'
import { validarDialogo, validarMensaje } from './contrato-mattermost.mjs'
import { FECHA_HOY, OBRA, accionesDe, crearEntorno, motivosReales } from './dobles-de-prueba.mjs'
import * as mensaje from './mensaje.mjs'

/** El tipo viaja por el cable como texto: se escribe literal para probar el contrato real. */
const TIPO = Object.freeze({ AUSENCIA: 'ausencia', PARCIAL: 'parcial', EXTRA: 'extra' })

/** Qué desplegable del post abre cada tipo. Los ids van sin guión: viajan dentro de la URL. */
const MENU_DE = Object.freeze({
  [TIPO.AUSENCIA]: 'novino',
  [TIPO.PARCIAL]: 'menoshoras',
  [TIPO.EXTRA]: 'horasextra',
})

/** La jornada del jueves 30/07/2026 en la planilla del fixture. */
const JORNADA = 9

const elegirObra = (e, clave = OBRA.REVOQUE) => e.accion({ paso: PASO.OBRA, selected_option: clave })

const campo = (elementos, nombre) => elementos.find((x) => x.name === nombre) ?? null
const valores = (elemento) => (elemento?.options ?? []).map((o) => o.value)
/** '8,5' o '8.5' → 8.5. La coma es del locale es-AR, no del contrato. */
const numero = (v) => Number(String(v).replace(',', '.'))
const horasOfrecidas = (elementos) => valores(campo(elementos, 'horas')).map(numero)
const clavesOrdenadas = (lista) => [...lista].sort()
const clavesDelCatalogo = (fichas) => clavesOrdenadas(fichas.map((m) => m.clave))

/** Abre el formulario de un tipo para la primera persona marcable de la cuadrilla. */
async function abrirFormulario(e, tipo, { obra = OBRA.REVOQUE, indice = 0 } = {}) {
  const cuadrilla = await elegirObra(e, obra)
  const menu = accionesDe(cuadrilla).find((a) => a.id === MENU_DE[tipo])
  assert.ok(menu, `el post de la cuadrilla no ofrece el desplegable «${MENU_DE[tipo]}»`)
  const ref = menu.options[indice].value
  const respuesta = await e.accion({ paso: PASO.EXCEPCION, tipo, selected_option: ref })
  const dialogo = e.mattermost.dialogos.at(-1)
  assert.ok(dialogo, `elegir una persona en «${tipo}» no abrió ningún formulario`)
  assert.equal(validarDialogo(dialogo).ok, true, 'el formulario no cumple el contrato de Mattermost')
  return { cuadrilla, ref, respuesta, dialogo, elementos: dialogo.dialog.elements ?? [] }
}

const propsDelUltimoPost = (e) => JSON.stringify(e.mattermost.posts.at(-1)?.props ?? {})

// ── EL POST: ELEGIR EL TIPO ES EL PRIMER PASO ───────────────────────────────────

test('el post de la cuadrilla deja elegir el TIPO de novedad antes de abrir ningún formulario', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ids = accionesDe(cuadrilla).map((a) => a.id)
  assert.deepEqual(ids, ['novino', 'menoshoras', 'horasextra', 'registrar', 'cancelar'],
    'sin los tres desplegables el jefe vuelve a elegir motivo y horas que no combinan')
  assert.deepEqual(mensaje.TIPO, TIPO, 'el tipo tiene que ser un contrato público, no un string suelto')
})

// ── 1 · TRABAJADOR AUSENTE ──────────────────────────────────────────────────────

test('el que no vino: el formulario sólo ofrece motivos de ausencia, y no pregunta horas', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.AUSENCIA)
  const motivo = campo(elementos, 'motivo')
  assert.ok(motivo, 'el formulario de ausencia tiene que pedir el motivo')
  assert.equal(motivo.optional, false, 'sin motivo, una ausencia no explica nada')
  assert.deepEqual(clavesOrdenadas(valores(motivo)),
    clavesDelCatalogo(motivosReales.motivosPara({ presente: false, horas: 0 })),
    'se está mostrando otra lista que la que el catálogo acepta para una ausencia')
  for (const parcial of ['llego_tarde', 'se_retiro_antes']) {
    assert.equal(valores(motivo).includes(parcial), false,
      `«${parcial}» es de jornada parcial: ofrecerlo en una ausencia lleva al rechazo al guardar`)
  }
})

test('el que no vino: sin campo de horas ni «¿Trabajó?» — la ausencia no se puede contradecir', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.AUSENCIA)
  assert.equal(campo(elementos, 'horas'), null, 'preguntar horas en una ausencia es pedir un dato que ya se sabe')
  assert.equal(campo(elementos, 'presente'), null, 'el tipo ya dice que no vino: volver a preguntarlo habilita el error')
  assert.deepEqual(elementos.map((x) => x.name), ['motivo', 'aclaracion'])
})

// ── 2 · JORNADA PARCIAL (el caso exacto del bug) ────────────────────────────────

test('hizo menos horas: el formulario NO ofrece «Faltó con aviso» ni ningún motivo de día entero', async () => {
  const e = await crearEntorno()
  assert.equal(e.sesion.fecha_operativa, FECHA_HOY, 'la jornada de 9 h sale del jueves 30/07/2026')
  const { elementos } = await abrirFormulario(e, TIPO.PARCIAL)
  const motivo = campo(elementos, 'motivo')
  assert.ok(motivo, 'una jornada parcial sin motivo no se puede registrar')
  assert.equal(motivo.optional, false)
  for (const soloAusencia of ['falta', 'falta_con_aviso', 'vacaciones', 'suspension', 'franco']) {
    assert.equal(valores(motivo).includes(soloAusencia), false,
      `«${soloAusencia}» es de día completo: combinado con 5 horas es exactamente el bug que se reportó`)
  }
})

test('hizo menos horas: la lista de motivos es la que el catálogo acepta para una jornada parcial', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.PARCIAL)
  assert.deepEqual(clavesOrdenadas(valores(campo(elementos, 'motivo'))),
    clavesDelCatalogo(motivosReales.motivosPara({
      presente: true, horas: JORNADA - 0.5, jornada: JORNADA,
    })),
    'la lista se armó por otro camino que el catálogo: van a divergir en el próximo motivo nuevo')
  assert.deepEqual(elementos.map((x) => x.name), ['horas', 'motivo', 'obra_realizada', 'aclaracion'])
})

// ── 3 · HORAS EXTRA ─────────────────────────────────────────────────────────────

test('hizo horas extra: el formulario no pide motivo — el extra no es una novedad que explicar', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.EXTRA)
  assert.equal(campo(elementos, 'motivo'), null,
    'con motivo, el backend rechaza: "eso son horas extra, no una novedad"')
  assert.deepEqual(elementos.map((x) => x.name), ['horas', 'aclaracion'])
})

test('hizo horas extra: todas las horas que se ofrecen superan la jornada', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.EXTRA)
  const horas = horasOfrecidas(elementos)
  assert.equal(campo(elementos, 'horas').type, 'select', 'escribir las horas a mano deja pasar un 5 en un extra')
  assert.ok(horas.length > 0, 'el desplegable de horas extra quedó vacío')
  assert.equal(horas.every((h) => h > JORNADA), true, `hay horas que no son extra: ${horas.join(' ')}`)
  assert.equal(Math.min(...horas), JORNADA + 0.5)
  assert.equal(Math.max(...horas), JORNADA + 6)
})

// ── 4 · JORNADA COMPLETA: NO SE PUEDE PEDIR UN MOTIVO PARA UN DÍA ENTERO ────────

test('jornada parcial: ninguna opción de horas llega a la jornada — la mayor es 8,5 con 9 h', async () => {
  const e = await crearEntorno()
  const { elementos } = await abrirFormulario(e, TIPO.PARCIAL)
  const horas = horasOfrecidas(elementos)
  assert.equal(campo(elementos, 'horas').type, 'select')
  assert.ok(horas.length > 0, 'el desplegable de horas de jornada parcial quedó vacío')
  assert.equal(horas.every((h) => h > 0 && h < JORNADA), true,
    `hay horas que no son una jornada parcial: ${horas.join(' ')}`)
  assert.equal(Math.max(...horas), JORNADA - 0.5, 'con la jornada entera el catálogo no acepta ningún motivo')
  assert.equal(Math.min(...horas), 0.5, 'con 0 horas ya no es parcial: es una ausencia y va por el otro desplegable')
})

// ── 5 · TRABAJADOR PRESENTE: EL CAMINO FELIZ SIGUE ENTERO ──────────────────────

test('jornada parcial válida: se guarda y el post se vuelve a dibujar con la novedad', async () => {
  const e = await crearEntorno()
  const { ref } = await abrirFormulario(e, TIPO.PARCIAL)
  const r = await e.dialogo('asistencia.excepcion',
    { horas: '6', motivo: 'se_retiro_antes' }, { ref, tipo: TIPO.PARCIAL })
  assert.deepEqual(r.body, {}, `la carga válida se rechazó: ${JSON.stringify(r.body)}`)
  const post = e.mattermost.posts.at(-1)
  assert.ok(post, 'se guardó pero el post no se actualizó: el jefe no ve lo que cargó')
  assert.equal(validarMensaje(post).ok, true)
  assert.match(propsDelUltimoPost(e), /6 h/)
  assert.match(propsDelUltimoPost(e), /se retiro antes/)
})

// ── 6 · EL TIPO MANDA SOBRE LO QUE VENGA EN EL FORMULARIO ──────────────────────

test('ausencia: aunque lleguen horas y «presente» metidos a mano, se guarda 0 horas y ausente', async () => {
  const e = await crearEntorno()
  const { ref } = await abrirFormulario(e, TIPO.AUSENCIA)
  const r = await e.dialogo('asistencia.excepcion',
    { horas: '8', presente: 'si', motivo: 'falta_con_aviso' }, { ref, tipo: TIPO.AUSENCIA })
  assert.deepEqual(r.body, {}, `el tipo del state tiene que mandar: ${JSON.stringify(r.body)}`)
  const props = propsDelUltimoPost(e)
  assert.match(props, /— no vino/, 'un campo del formulario no puede contradecir al tipo elegido')
  assert.match(props, /"title":"Ausentes","value":"1"/)
  assert.match(props, /"title":"Horas","value":"18 h"/, 'las 8 horas inventadas se colaron en el total')
})

// ── 7 · NADA DE INGLÉS CUANDO SE RECHAZA ───────────────────────────────────────

test('un rechazo del formulario se explica en castellano, no con el cartel de Mattermost', async () => {
  const e = await crearEntorno()
  const { ref } = await abrirFormulario(e, TIPO.PARCIAL)
  const r = await e.dialogo('asistencia.excepcion',
    { horas: '6', motivo: 'otro' }, { ref, tipo: TIPO.PARCIAL })
  const cuerpo = JSON.stringify(r.body)
  assert.equal(typeof r.body.error, 'string',
    `sin «error» de primer nivel Mattermost pone "Submission failed with validation errors": ${cuerpo}`)
  assert.ok(r.body.error.trim().length > 0)
  assert.match(r.body.error, /aclaraci/i, 'el error de primer nivel tiene que decir qué falta')
  assert.doesNotMatch(cuerpo, /Submission failed|validation errors/i)
  if (r.body.errors) {
    assert.ok(r.body.errors.aclaracion, 'el error por campo se cuelga del campo, no de otro')
  }
})

// ── 8 · LA RED DE ATRÁS NO CAMBIÓ ──────────────────────────────────────────────

test('la validación de fondo sigue rechazando la combinación imposible si le llega igual', () => {
  const v = motivosReales.validarNovedad({
    presente: true, horas: 5, jornada: JORNADA, motivo: 'falta_con_aviso',
  })
  assert.equal(v.ok, false, 'guiar el formulario no reemplaza la validación: es la última defensa')
  assert.match(v.error, /jornada parcial/i)
  const bien = motivosReales.validarNovedad({
    presente: true, horas: 5, jornada: JORNADA, motivo: 'se_retiro_antes',
  })
  assert.equal(bien.ok, true, `la combinación válida no puede haberse roto: ${bien.error}`)
})
