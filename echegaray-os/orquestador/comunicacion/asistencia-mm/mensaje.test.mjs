// TESTS DE LA INTERFAZ. Sin red, sin base: `mensaje.mjs` es puro.
//
// Cada test afirma dos cosas distintas y las dos importan:
//   · que el JSON sea VÁLIDO para Mattermost (si no, el bloque interactivo no se dibuja y
//     nadie se entera: el post sale mudo);
//   · que la UX diga lo que tiene que decir (la excepción se ve, el caso normal no molesta).

import test from 'node:test'
import assert from 'node:assert/strict'

import { validarDialogo, validarMensaje } from './contrato-mattermost.mjs'
import {
  MARCA, dialogoExcepcion, dialogoFecha, mensajeCancelado, mensajeConfirmado,
  mensajeCuadrilla, mensajeInicial,
} from './mensaje.mjs'

const URL = 'https://chat.example/asistencia/accion'
const JORNADA = { horas: 9, origen: 'calibrado', requiere_manual: false, feriado: false }

const OBRAS = [
  { clave: 'javier sanchez|revoque', nombre: 'JAVIER SANCHEZ · Revoque', cantidad: 3 },
  { clave: 'la estrella|oficinas', nombre: 'LA ESTRELLA · Oficinas', cantidad: 2 },
]

const persona = (nombre, extra = {}) => ({
  ref: `b20f${nombre.length}`, nombre, categoria: 'OF M', carga_actual: null, ya_cargado: false,
  bloqueado: null, revisar: null, motivo: null, aclaracion: null, obra_realizada: null,
  sin_cambio: false, presente: true, horas: 9, ...extra,
})

const CUADRILLA = [
  persona('Aguero Cristian'),
  persona('Quiroga Sebastian'),
  persona('Emanuel Alaniz'),
]

const valido = (msg) => {
  const r = validarMensaje(msg)
  assert.equal(r.ok, true, `attachments inválidos: ${r.fallas.join(' | ')}`)
  return msg
}

const acciones = (msg) => msg.props.attachments.flatMap((a) => a.actions ?? [])
const textoTodo = (msg) => msg.props.attachments
  .map((a) => [a.title, a.text, a.fallback].filter(Boolean).join('\n')).join('\n')

// ── MENSAJE INICIAL ─────────────────────────────────────────────────────────────

test('mensaje inicial: fecha con Hoy / Ayer / Otra fecha y el desplegable de obras', () => {
  const msg = valido(mensajeInicial({ fecha: '2026-07-30', obras: OBRAS, jornada: JORNADA, url: URL }))
  const nombres = acciones(msg).map((a) => a.name)
  assert.deepEqual(nombres.slice(0, 3), ['Hoy', 'Ayer', 'Otra fecha…'])
  const select = acciones(msg).find((a) => a.type === 'select')
  assert.equal(select.integration.context.paso, 'obra')
  assert.deepEqual(select.options.map((o) => o.value), OBRAS.map((o) => o.clave))
  assert.match(textoTodo(msg), /jueves 30\/07\/2026/)
  assert.match(textoTodo(msg), /jornada 9 h/)
})

test('mensaje inicial: sin obras ese día lo dice y no ofrece un desplegable vacío', () => {
  const msg = valido(mensajeInicial({ fecha: '2026-07-26', obras: [], jornada: JORNADA, url: URL }))
  assert.equal(acciones(msg).some((a) => a.type === 'select'), false)
  assert.match(textoTodo(msg), /ninguna obra/i)
})

test('mensaje inicial: el aviso reemplaza el texto cuando no hay obras, y se suma cuando sí', () => {
  const sin = mensajeInicial({ fecha: '2026-08-10', obras: [], jornada: null, url: URL, aviso: 'La planilla no tiene la columna del 10/08/2026.' })
  assert.match(textoTodo(valido(sin)), /no tiene la columna/)
  const con = mensajeInicial({ fecha: '2026-07-30', obras: OBRAS, jornada: JORNADA, url: URL, aviso: 'Esa obra no figura.' })
  assert.match(textoTodo(valido(con)), /Esa obra no figura/)
})

test('mensaje inicial: sin jornada conocida se declara, no se inventa un número', () => {
  const msg = valido(mensajeInicial({
    fecha: '2026-07-25', obras: OBRAS, url: URL,
    jornada: { horas: null, requiere_manual: true, origen: 'piso' },
  }))
  assert.match(textoTodo(msg), /sin definir/i)
  assert.doesNotMatch(textoTodo(msg), /jornada \d/)
})

// ── MENSAJE DE CUADRILLA ────────────────────────────────────────────────────────

test('cuadrilla: toda la gente presente con la jornada, resumen y los tres tipos de novedad', () => {
  const resumen = { presentes: 3, ausentes: 0, horas: 27, extra: 0, sin_cambio: 0, bloqueadas: 0 }
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-30', obra: { clave: 'x', nombre: 'JAVIER SANCHEZ · Revoque' },
    jornada: JORNADA, personal: CUADRILLA, marcas: {}, resumen, url: URL,
  }))
  const texto = textoTodo(msg)
  for (const p of CUADRILLA) assert.match(texto, new RegExp(p.nombre))
  assert.equal((texto.match(new RegExp(MARCA.NORMAL, 'g')) ?? []).length >= 3, true)
  const nombres = acciones(msg).map((a) => a.name)
  assert.deepEqual(nombres, ['No vino', 'Hizo menos horas', 'Hizo horas extra', 'Registrar', 'Cancelar'],
    'el tipo de novedad se elige antes de abrir el formulario, no adentro')
  const campos = msg.props.attachments[0].fields.map((f) => f.title)
  assert.deepEqual(campos, ['Presentes', 'Ausentes', 'Horas'])
})

test('cuadrilla: la excepción se ve y el caso normal no molesta', () => {
  const marcas = {
    [CUADRILLA[1].ref]: { presente: false, horas: 0, motivo: 'falta', sin_cambio: false },
    [CUADRILLA[2].ref]: { presente: true, horas: 6, motivo: 'llego_tarde', sin_cambio: false },
  }
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA,
    personal: CUADRILLA, marcas, url: URL,
    resumen: { presentes: 2, ausentes: 1, horas: 15, extra: 0 },
  }))
  const lineas = msg.props.attachments[0].text.split('\n')
  const de = (n) => lineas.find((l) => l.includes(n))
  assert.ok(de('Aguero Cristian').startsWith(MARCA.NORMAL))
  assert.ok(de('Quiroga Sebastian').startsWith(MARCA.EXCEPCION))
  assert.match(de('Quiroga Sebastian'), /no vino/)
  assert.match(de('Quiroga Sebastian'), /falta/)
  assert.ok(de('Emanuel Alaniz').startsWith(MARCA.EXCEPCION))
  assert.match(de('Emanuel Alaniz'), /6 h/)
})

test('cuadrilla: la celda que no se toca se marca y no se ofrece para excepción', () => {
  const gente = [...CUADRILLA, persona('Reta Sebastian', { bloqueado: 'texto escrito a mano, no se toca', sin_cambio: true, presente: false, horas: 0 })]
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, personal: gente,
    marcas: {}, url: URL, resumen: { presentes: 3, ausentes: 0, horas: 27, extra: 0, bloqueadas: 1 },
  }))
  assert.match(msg.props.attachments[0].text, new RegExp(`${MARCA.BLOQUEADA} Reta Sebastian`))
  const select = acciones(msg).find((a) => a.type === 'select')
  assert.equal(select.options.some((o) => o.text.includes('Reta')), false)
})

test('cuadrilla: horas por encima de la jornada se muestran como extra, sin pedirlas', () => {
  const marcas = { [CUADRILLA[0].ref]: { presente: true, horas: 11, motivo: null, sin_cambio: false } }
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, personal: CUADRILLA,
    marcas, url: URL, resumen: { presentes: 3, ausentes: 0, horas: 29, extra: 2 },
  }))
  assert.match(msg.props.attachments[0].text, /11 h \(2 extra\)/)
  assert.equal(msg.props.attachments[0].fields.some((f) => f.title === 'Extra'), true)
})

test('cuadrilla: sin jornada del día se avisa que faltan las horas', () => {
  const gente = CUADRILLA.map((p) => ({ ...p, horas: null }))
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-25', obra: { nombre: 'Revoque' },
    jornada: { horas: null, requiere_manual: true }, personal: gente, marcas: {}, url: URL,
    resumen: { presentes: 0, ausentes: 0, horas: 0, extra: 0, sin_horas: 3 },
  }))
  assert.match(textoTodo(msg), /Falta indicar las horas de 3/)
  assert.match(msg.props.attachments[0].text, new RegExp(`${MARCA.SIN_HORAS} Aguero`))
})

test('cuadrilla: cuando hay que confirmar, el botón cambia y el context lo lleva', () => {
  const msg = valido(mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, personal: CUADRILLA,
    marcas: {}, url: URL, resumen: { presentes: 3, ausentes: 0, horas: 27, extra: 0 },
    confirmacion: { texto: 'Se pisan 2 cargas.' }, aviso: 'Se pisan 2 cargas.',
  }))
  const registrar = acciones(msg).find((a) => a.id === 'registrar')
  assert.equal(registrar.name, 'Registrar igual')
  assert.equal(registrar.integration.context.confirmar, true)
  assert.match(textoTodo(msg), /Se pisan 2 cargas/)
})

// ── CONFIRMADO Y CANCELADO ──────────────────────────────────────────────────────

test('confirmado: dice qué se escribió, en qué obra y fecha, y quién lo hizo — sin botones', () => {
  const msg = valido(mensajeConfirmado({
    resumen: { presentes: 3, ausentes: 0, horas_total: 27, horas_extra: 0 },
    celdas: [{ celda: 'Obreros 26!R21', nombre: 'Aguero Cristian', horas: 9, normales: 9, extra: 0 }],
    actor: { username: 'jefe.obra' }, fecha: '2026-07-30',
    obra: { nombre: 'JAVIER SANCHEZ · Revoque' }, pestana: 'Obreros 26', columna: 'R',
  }))
  const texto = textoTodo(msg)
  assert.match(texto, /Asistencia registrada/)
  assert.match(texto, /JAVIER SANCHEZ · Revoque — jueves 30\/07\/2026/)
  assert.match(texto, /1 celda escrita en Obreros 26 · columna R/)
  assert.match(texto, /Cargó @jefe\.obra/)
  assert.equal(acciones(msg).length, 0, 'un post confirmado no se vuelve a apretar')
})

test('confirmado: sin celdas lo declara en vez de fingir que escribió', () => {
  const msg = valido(mensajeConfirmado({
    resumen: {}, celdas: [], actor: { username: 'jefe.obra' },
    fecha: '2026-07-30', obra: { nombre: 'Messinas' }, nota: 'nada que escribir',
  }))
  assert.match(textoTodo(msg), /ya decía lo mismo|nada que escribir/)
})

test('cancelado: no escribió nada y no deja botones', () => {
  const msg = valido(mensajeCancelado())
  assert.match(textoTodo(msg), /No se escribió nada/)
  assert.equal(acciones(msg).length, 0)
})

// ── DIÁLOGOS ────────────────────────────────────────────────────────────────────

const MOTIVOS = [
  { clave: 'falta', etiqueta: 'Faltó' },
  { clave: 'llego_tarde', etiqueta: 'Llegó tarde' },
  { clave: 'accidente', etiqueta: 'Accidente de trabajo' },
]

test('diálogo de jornada parcial: horas, motivo, otra obra y aclaración — sin «¿Trabajó?»', () => {
  const d = dialogoExcepcion({
    tipo: 'parcial',
    persona: { ...CUADRILLA[0], novedad: { presente: true, horas: 9, motivo: null, aclaracion: null, obra_realizada: null } },
    motivos: MOTIVOS, obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
    estado: { sesion_id: 's1', ref: CUADRILLA[0].ref },
  })
  const r = validarDialogo(d)
  assert.equal(r.ok, true, `diálogo inválido: ${r.fallas.join(' | ')}`)
  assert.deepEqual(d.dialog.elements.map((e) => e.name), ['horas', 'motivo', 'obra_realizada', 'aclaracion'],
    'ya no se pregunta si trabajó: eso lo eligió el desplegable que abrió este formulario')
  assert.equal(d.dialog.callback_id, 'asistencia.excepcion')
  assert.deepEqual(JSON.parse(d.dialog.state), { sesion_id: 's1', ref: CUADRILLA[0].ref, tipo: 'parcial' })
})

test('diálogo de ausencia: sólo el motivo y la aclaración — las horas son 0, no se preguntan', () => {
  const d = dialogoExcepcion({
    tipo: 'ausencia', persona: { nombre: 'Aguero Cristian', novedad: {} },
    motivos: MOTIVOS, obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  assert.equal(validarDialogo(d).ok, true)
  assert.deepEqual(d.dialog.elements.map((e) => e.name), ['motivo', 'aclaracion'])
  assert.equal(d.dialog.elements.find((e) => e.name === 'motivo').optional, false, 'sin motivo no hay ausencia')
})

test('diálogo de horas extra: no hay campo motivo, y las horas ofrecidas superan la jornada', () => {
  const d = dialogoExcepcion({
    tipo: 'extra', persona: { nombre: 'Aguero Cristian', novedad: {} },
    motivos: [], obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  assert.equal(validarDialogo(d).ok, true)
  assert.equal(d.dialog.elements.some((e) => e.name === 'motivo'), false,
    'las horas extra las calcula el núcleo: no hay novedad que explicar')
  const horas = d.dialog.elements.find((e) => e.name === 'horas')
  assert.equal(horas.type, 'select')
  for (const o of horas.options) assert.ok(Number(String(o.value).replace(',', '.')) > 9, `${o.value} no es extra`)
})

test('en «hizo menos horas» ninguna opción llega a la jornada: no se puede pedir motivo por un día completo', () => {
  const d = dialogoExcepcion({
    tipo: 'parcial', persona: { nombre: 'Aguero Cristian', novedad: {} },
    motivos: MOTIVOS, obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  const horas = d.dialog.elements.find((e) => e.name === 'horas')
  assert.equal(horas.type, 'select')
  for (const o of horas.options) assert.ok(Number(String(o.value).replace(',', '.')) < 9, `${o.value} no es parcial`)
})

test('sin jornada conocida las horas vuelven a ser texto: no se inventa una lista', () => {
  const d = dialogoExcepcion({
    tipo: 'parcial', persona: { nombre: 'Aguero Cristian', novedad: {} },
    motivos: MOTIVOS, obras: OBRAS, jornada: { horas: null, requiere_manual: true },
    triggerId: 'trig-1', url: URL,
  })
  assert.equal(d.dialog.elements.find((e) => e.name === 'horas').type, 'text')
})

test('diálogo de excepción: precarga lo que ya tiene la persona', () => {
  const d = dialogoExcepcion({
    tipo: 'ausencia',
    persona: { nombre: 'Quiroga Sebastian', novedad: { presente: false, horas: 0, motivo: 'falta', aclaracion: 'avisó', obra_realizada: null } },
    motivos: MOTIVOS, obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  assert.equal(validarDialogo(d).ok, true)
  const por = (n) => d.dialog.elements.find((e) => e.name === n)
  assert.equal(por('motivo').default, 'falta')
  assert.equal(por('aclaracion').default, 'avisó')
})

test('diálogo de excepción: un nombre largo no rompe el título de 24 caracteres', () => {
  const d = dialogoExcepcion({
    tipo: 'parcial', persona: { nombre: 'Rodriguez Villanueva de los Santos Juan Carlos', novedad: {} },
    motivos: MOTIVOS, obras: OBRAS, jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  assert.equal(validarDialogo(d).ok, true)
  assert.ok(d.dialog.title.length <= 24)
})

test('diálogo de excepción: sin otras obras el campo desaparece en vez de mandarse vacío', () => {
  const d = dialogoExcepcion({
    tipo: 'parcial', persona: { nombre: 'Aguero Cristian', novedad: {} },
    motivos: MOTIVOS, obras: [], jornada: JORNADA, triggerId: 'trig-1', url: URL,
  })
  assert.equal(validarDialogo(d).ok, true)
  assert.equal(d.dialog.elements.some((e) => e.name === 'obra_realizada'), false)
  assert.equal(d.dialog.elements.length, 3)
})

test('diálogo de fecha: un solo campo, con el formato que la gente escribe acá', () => {
  const d = dialogoFecha({ fecha: '2026-07-30', triggerId: 'trig-1', url: URL, estado: { sesion_id: 's1' } })
  assert.equal(validarDialogo(d).ok, true)
  assert.equal(d.dialog.callback_id, 'asistencia.fecha')
  assert.equal(d.dialog.elements[0].default, '30/07/2026')
})

// ── EL CONTRATO, EN LOS DOS SENTIDOS ────────────────────────────────────────────

test('el validador de contrato detecta lo que Mattermost rompe en silencio', () => {
  const malos = [
    { message: '', props: { attachments: [{ fallback: 'x', actions: [{ id: 'a', name: 'A', type: 'select', integration: { url: URL }, options: [] }] }] } },
    { message: '', props: { attachments: [{ fallback: 'x', actions: [{ id: 'a', name: 'A', type: 'link', integration: { url: URL } }] }] } },
    { message: '', props: { attachments: [{ fallback: 'x', actions: [{ id: 'a', name: 'A', type: 'button', integration: {} }] }] } },
    { message: '', props: { attachments: [] } },
  ]
  for (const m of malos) assert.equal(validarMensaje(m).ok, false, JSON.stringify(m))
  const largo = dialogoFecha({ fecha: '2026-07-30', triggerId: 't', url: URL })
  largo.dialog.elements.push(...Array.from({ length: 5 }, (_, i) => ({
    display_name: `x${i}`, name: `x${i}`, type: 'text',
  })))
  assert.equal(validarDialogo(largo).ok, false)
  assert.match(validarDialogo(largo).fallas.join(' '), /tope de Mattermost es 5/)
})

// ── EL ID DE LA ACCIÓN ES PARTE DE LA URL ───────────────────────────────────────
//
// Al apretar un botón, el cliente llama a POST /api/v4/posts/{post_id}/actions/{action_id}
// y el router de Mattermost sólo matchea ids ALFANUMÉRICOS en ese segmento. Un id con
// guión bajo ("fecha_hoy") no llega nunca al servidor: Mattermost devuelve su 404 de router
// ("Sorry, we could not find the page") y el botón queda muerto sin una sola línea de log
// nuestra. Verificado contra el Mattermost real, mismo post y mismo token:
//   · id=obra          (alfanumérico, existe)    → 200 {"status":"OK"}
//   · id=noexisteaqui  (alfanumérico, no existe) → 404 api.post.do_action.action_id.app_error
//   · id=fecha_hoy     (guión bajo)              → 404 api.context.404.app_error  ← ni matcheó
//   · id=fecha-hoy     (guión medio)             → 404 api.context.404.app_error  ← ni matcheó
//
// El ruteo del servidor se hace por `context.paso`, NO por el id: el id sólo tiene que
// sobrevivir a la URL.

/** Lo único que el router de Mattermost acepta en el segmento {action_id}. */
const ID_ACCION = /^[A-Za-z0-9]+$/

/** Todos los mensajes reales que produce el módulo, con nombre para que la falla diga cuál. */
const todosLosMensajes = () => [
  ['inicial', mensajeInicial({ fecha: '2026-07-30', obras: OBRAS, jornada: JORNADA, url: URL })],
  ['inicial sin obras', mensajeInicial({ fecha: '2026-07-26', obras: [], jornada: JORNADA, url: URL })],
  ['cuadrilla', mensajeCuadrilla({
    fecha: '2026-07-30', obra: { clave: 'x', nombre: 'JAVIER SANCHEZ · Revoque' }, jornada: JORNADA,
    personal: CUADRILLA, marcas: {}, url: URL,
    resumen: { presentes: 3, ausentes: 0, horas: 27, extra: 0 },
  })],
  ['cuadrilla a confirmar', mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, personal: CUADRILLA,
    marcas: {}, url: URL, resumen: { presentes: 3, ausentes: 0, horas: 27, extra: 0 },
    confirmacion: { texto: 'Se pisan 2 cargas.' }, aviso: 'Se pisan 2 cargas.',
  })],
  ['cuadrilla toda bloqueada', mensajeCuadrilla({
    fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, marcas: {}, url: URL,
    personal: CUADRILLA.map((p) => ({ ...p, bloqueado: 'escrito a mano', sin_cambio: true })),
    resumen: { presentes: 0, ausentes: 0, horas: 0, extra: 0, bloqueadas: 3 },
  })],
  ['confirmado', mensajeConfirmado({
    resumen: { presentes: 3, ausentes: 0, horas_total: 27, horas_extra: 0 },
    celdas: [{ celda: 'Obreros 26!R21', nombre: 'Aguero Cristian', horas: 9, normales: 9, extra: 0 }],
    actor: { username: 'jefe.obra' }, fecha: '2026-07-30', obra: { nombre: 'Revoque' },
    pestana: 'Obreros 26', columna: 'R',
  })],
  ['cancelado', mensajeCancelado()],
]

test('toda acción de todo mensaje lleva un id alfanumérico: con guión bajo el router de Mattermost tira 404 y el botón no hace nada', () => {
  let total = 0
  for (const [cual, msg] of todosLosMensajes()) {
    valido(msg)
    for (const a of acciones(msg)) {
      total += 1
      assert.match(a.id, ID_ACCION,
        `${cual}: el id «${a.id}» no entra en /posts/{id}/actions/{action_id} — el click muere en el router`)
    }
  }
  assert.ok(total >= 6, `el barrido tiene que ver acciones reales, vio ${total}`)
})

test('los tres botones de fecha apuntan al endpoint de acciones con el paso y el valor que rutea el servidor', () => {
  const msg = valido(mensajeInicial({ fecha: '2026-07-30', obras: OBRAS, jornada: JORNADA, url: URL }))
  for (const [nombre, valor] of [['Hoy', 'hoy'], ['Ayer', 'ayer'], ['Otra fecha…', 'otra']]) {
    const a = acciones(msg).find((x) => x.name === nombre)
    assert.ok(a, `falta el botón ${nombre}`)
    assert.equal(a.type, 'button', `${nombre}: tiene que ser un botón`)
    assert.equal(a.integration.url, URL, `${nombre}: apunta a otra URL que la de acciones`)
    assert.equal(a.integration.context.paso, 'fecha', `${nombre}: el servidor rutea por context.paso`)
    assert.equal(a.integration.context.valor, valor, `${nombre}: valor equivocado`)
    assert.match(a.id, ID_ACCION, `${nombre}: id «${a.id}» inalcanzable por la ruta de Mattermost`)
  }
})

test('ningún mensaje arrastra la interfaz web eliminada: la única URL es la del endpoint de acciones', () => {
  const rastros = [/\/asistencia\/pantalla/, /sesion-web/, /enlace/i, /token=/, /\?t=/]
  for (const [cual, msg] of todosLosMensajes()) {
    const json = JSON.stringify(msg)
    for (const r of rastros) assert.doesNotMatch(json, r, `${cual}: rastro de la pantalla web rechazada`)
    for (const u of json.match(/https?:\/\/[^"\s\\]+/g) ?? []) {
      assert.ok(u.endsWith('/asistencia/accion'), `${cual}: URL que no es el endpoint de acciones: ${u}`)
    }
  }
})

/** Un mensaje mínimo y válido salvo por el id, para probar el candado en los dos sentidos. */
const mensajeConId = (id) => ({
  message: '',
  props: {
    attachments: [{
      fallback: 'Asistencia',
      actions: [{
        id, name: 'Hoy', type: 'button',
        integration: { url: URL, context: { paso: 'fecha', valor: 'hoy' } },
      }],
    }],
  },
})

test('el contrato rechaza un id no alfanumérico: es el candado que impide volver a publicar un botón muerto', () => {
  for (const malo of ['fecha_hoy', 'fecha-hoy', 'Fecha Hoy', 'fecha.hoy']) {
    const r = validarMensaje(mensajeConId(malo))
    assert.equal(r.ok, false, `«${malo}» tendría que rechazarse antes de publicarse`)
    assert.match(r.fallas.join(' | '), /id/, `«${malo}»: la falla tiene que nombrar el id`)
  }
  for (const bueno of ['fechahoy', 'fechaayer', 'fechaotra', 'obra', 'excepcion', 'registrar', 'cancelar']) {
    const r = validarMensaje(mensajeConId(bueno))
    assert.equal(r.ok, true, `«${bueno}» es alfanumérico y tiene que pasar: ${r.fallas.join(' | ')}`)
  }
})

test('nada de asteriscos en el texto: Mattermost le aplica la conversión de Slack', () => {
  const msgs = [
    mensajeInicial({ fecha: '2026-07-30', obras: OBRAS, jornada: JORNADA, url: URL }),
    mensajeCuadrilla({
      fecha: '2026-07-30', obra: { nombre: 'Revoque' }, jornada: JORNADA, personal: CUADRILLA,
      marcas: {}, url: URL, resumen: { presentes: 3, ausentes: 0, horas: 27, extra: 0 },
    }),
    mensajeConfirmado({ resumen: {}, celdas: [], actor: {}, fecha: '2026-07-30', obra: { nombre: 'Revoque' } }),
  ]
  for (const m of msgs) assert.doesNotMatch(textoTodo(m), /[*_~]/, 'sin marcas de formato en el texto')
})
