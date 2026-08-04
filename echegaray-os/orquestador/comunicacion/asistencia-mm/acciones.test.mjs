// TESTS DEL RUTEADOR. Sin red y sin base: el único doble es el cliente de Google
// (`lib/jornales-fixture.mjs`) y el cliente de Mattermost. El núcleo de JORNALES, el
// catálogo de motivos y el repositorio de sesiones son los REALES — probar contra una
// imitación del núcleo habría dejado probada la imitación.
//
// Regla de oro respetada: NUNCA se corre el pipeline real ni se toca la planilla productiva.

import test from 'node:test'
import assert from 'node:assert/strict'

import { fakeGoogleJornales, idxCol } from '../../lib/jornales-fixture.mjs'
import { ESTADO_SESION } from '../asistencia-sesion.mjs'
import { validarDialogo, validarMensaje } from './contrato-mattermost.mjs'
import { PASO, crearRuteadorAcciones } from './acciones.mjs'
import {
  FECHA_HOY, OBRA, USUARIO, accionesDe, attachmentsDe, crearEntorno, googleQueFalla,
  jornadaConfigDoble, mattermostDoble, motivosReales, nucleoReal, permisosDoble, textoDe,
} from './dobles-de-prueba.mjs'

/** Toda respuesta que re-renderiza el post tiene que ser un mensaje válido de Mattermost. */
function respuestaValida(r) {
  assert.equal(r.status, 200)
  if (r.body?.update) {
    const v = validarMensaje(r.body.update)
    assert.equal(v.ok, true, `update inválido: ${v.fallas.join(' | ')}`)
  }
  return r
}

const elegirObra = (e, clave = OBRA.REVOQUE) => e.accion({ paso: PASO.OBRA, selected_option: clave })
const registrar = (e, extra = {}) => e.accion({ paso: PASO.REGISTRAR, ...extra })

// ── CONSTRUCCIÓN ────────────────────────────────────────────────────────────────

test('el ruteador exige sus dependencias al construirse, no al primer click', () => {
  assert.throws(() => crearRuteadorAcciones({}), /faltan dependencias/)
  assert.throws(
    () => crearRuteadorAcciones({
      google: {}, nucleo: { listarObrasPorFecha() {} }, sesiones: {}, permisos: {},
      motivos: motivosReales, mattermost: {},
    }),
    /nucleo\.registrarAsistencia/,
  )
  assert.doesNotThrow(() => crearRuteadorAcciones({
    google: {}, nucleo: nucleoReal, sesiones: {}, permisos: permisosDoble(),
    motivos: motivosReales, mattermost: mattermostDoble(),
  }))
})

// ── FECHA ───────────────────────────────────────────────────────────────────────

test('Hoy: publica la fecha del día con las obras de la planilla', async () => {
  const e = await crearEntorno()
  const r = respuestaValida(await e.accion({ paso: PASO.FECHA, valor: 'hoy' }))
  assert.match(textoDe(r), /jueves 30\/07\/2026/)
  const select = accionesDe(r).find((a) => a.type === 'select')
  assert.deepEqual(select.options.map((o) => o.value).sort(),
    [OBRA.ESTRELLA, OBRA.MESSINAS, OBRA.REVOQUE].sort())
})

test('Ayer: retrocede un día y vuelve a leer la planilla', async () => {
  const e = await crearEntorno()
  const r = respuestaValida(await e.accion({ paso: PASO.FECHA, valor: 'ayer' }))
  assert.match(textoDe(r), /miércoles 29\/07\/2026/)
})

test('Otra fecha…: abre el diálogo y no toca el post', async () => {
  const e = await crearEntorno()
  const r = await e.accion({ paso: PASO.FECHA, valor: 'otra' })
  assert.equal(e.mattermost.dialogos.length, 1)
  assert.equal(validarDialogo(e.mattermost.dialogos[0]).ok, true)
  assert.equal(r.body.update, undefined)
})

test('fecha futura: se rechaza con una frase clara y no se lee la planilla', async () => {
  const e = await crearEntorno()
  const r = await e.dialogo('asistencia.fecha', { fecha: '31/07/2026' })
  assert.deepEqual(r.body.errors, { fecha: 'No se puede cargar asistencia de una fecha futura.' })
  assert.equal(e.mattermost.posts.length, 0)
})

test('fecha escrita a mano: se acepta 29/07/2026 y se actualiza el post por la API', async () => {
  const e = await crearEntorno()
  const r = await e.dialogo('asistencia.fecha', { fecha: '29/07/2026' })
  assert.deepEqual(r.body, {})
  assert.equal(e.mattermost.posts.length, 1)
  assert.match(JSON.stringify(e.mattermost.posts[0].props), /miércoles 29\/07\/2026/)
})

test('fecha que no existe en JORNALES: se declara, no se inventa una columna', async () => {
  // El 26/07 es domingo y el bloque de julio no tiene esa columna.
  const e = await crearEntorno({ hoy: () => '2026-07-26' })
  const r = respuestaValida(await e.accion({ paso: PASO.FECHA, valor: 'hoy' }))
  assert.match(textoDe(r), /todavía no tiene la columna del 26\/07\/2026/)
  assert.equal(accionesDe(r).some((a) => a.type === 'select'), false)
})

// ── OBRA Y CUADRILLA ────────────────────────────────────────────────────────────

test('elegir la obra: llega la cuadrilla entera, presente con la jornada del día', async () => {
  const e = await crearEntorno()
  const r = respuestaValida(await elegirObra(e))
  const texto = textoDe(r)
  for (const n of ['Aguero Cristian', 'Quiroga Sebastian', 'Emanuel Alaniz']) {
    assert.match(texto, new RegExp(n))
  }
  assert.match(texto, /9 h/)
  assert.deepEqual(accionesDe(r).map((a) => a.name),
    ['No vino', 'Hizo menos horas', 'Hizo horas extra', 'Registrar', 'Cancelar'],
    'el tipo de novedad se elige ANTES del formulario: por eso son tres desplegables')
  assert.equal(e.eventos.some((x) => x.evento.endsWith('sheet_read')), true)
})

test('obra que no está en la planilla: lo dice y vuelve a la lista de obras', async () => {
  const e = await crearEntorno()
  const r = respuestaValida(await elegirObra(e, OBRA.INEXISTENTE))
  assert.match(textoDe(r), /no figura en la planilla/)
  assert.equal(accionesDe(r).some((a) => a.id === 'registrar'), false)
})

test('sin elegir obra no se puede registrar', async () => {
  const e = await crearEntorno()
  const r = await registrar(e)
  assert.match(r.body.ephemeral_text, /Primero elegí la obra/)
})

test('la obra ya cargada arranca en «sin cambio»: no se pisa lo que alguien cargó', async () => {
  const e = await crearEntorno()
  const r = respuestaValida(await elegirObra(e, OBRA.MESSINAS))
  assert.match(textoDe(r), /ya cargado/)
  const confirmada = respuestaValida(await registrar(e))
  assert.match(textoDe(confirmada), /ya decía lo mismo/)
  assert.equal(e.google.escrituras.length, 0, 'no se escribe una celda que no cambia')
})

// ── EXCEPCIONES ─────────────────────────────────────────────────────────────────

test('marcar excepción: abre el diálogo de esa persona, con sus datos precargados', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'novino')
    .options.find((o) => o.text.includes('Quiroga')).value
  const r = respuestaValida(await e.accion({ paso: PASO.EXCEPCION, tipo: 'ausencia', selected_option: ref }))
  const d = e.mattermost.dialogos.at(-1)
  assert.equal(validarDialogo(d).ok, true)
  assert.match(d.dialog.title, /Quiroga/)
  assert.equal(JSON.parse(d.dialog.state).ref, ref)
  assert.equal(r.body.update !== undefined, true, 'el desplegable se limpia re-renderizando')
})

test('aplicar la excepción: se guarda, se ve en el post y se resume distinto', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'novino')
    .options.find((o) => o.text.includes('Quiroga')).value
  const r = await e.dialogo('asistencia.excepcion', { motivo: 'falta' }, { ref, tipo: 'ausencia' })
  assert.deepEqual(r.body, {})
  const post = e.mattermost.posts.at(-1)
  assert.equal(validarMensaje(post).ok, true)
  const texto = JSON.stringify(post.props)
  assert.match(texto, /Quiroga Sebastian — no vino/)
  assert.match(texto, /"title":"Ausentes","value":"1"/)
  assert.match(texto, /"title":"Horas","value":"18 h"/)
})

test('la excepción sin motivo se rechaza en el campo, no con un banner genérico', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'novino').options[0].value
  const r = await e.dialogo('asistencia.excepcion', {}, { ref, tipo: 'ausencia' })
  assert.equal(r.body.errors?.motivo !== undefined, true, JSON.stringify(r.body))
  assert.match(r.body.errors.motivo, /motivo/i)
})

test('el accidente de trabajo exige la línea que después necesita la ART', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'novino').options[0].value
  const mal = await e.dialogo('asistencia.excepcion', { motivo: 'accidente' }, { ref, tipo: 'ausencia' })
  assert.match(JSON.stringify(mal.body), /ART/)
  const bien = await e.dialogo('asistencia.excepcion',
    { motivo: 'accidente', aclaracion: 'se cortó la mano cortando hierro' }, { ref, tipo: 'ausencia' })
  assert.deepEqual(bien.body, {})
})

test('horas por encima de la jornada: se cargan como total y el núcleo separa el extra', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'horasextra').options[0].value
  await e.dialogo('asistencia.excepcion', { horas: '11' }, { ref, tipo: 'extra' })
  const r = respuestaValida(await registrar(e))
  assert.match(textoDe(r), /11 h \(2 extra\)/)
  const escrito = e.google.escrituras[0].data.map((d) => d.values[0][0])
  assert.equal(escrito.includes('=9+2'), true, `se esperaba la fórmula de horas extra: ${escrito}`)
})

// ── REGISTRAR ───────────────────────────────────────────────────────────────────

test('el caso normal son DOS interacciones: elegir la obra y apretar Registrar', async () => {
  const e = await crearEntorno()
  const uno = respuestaValida(await elegirObra(e))
  const dos = respuestaValida(await registrar(e))
  assert.equal(accionesDe(uno).some((a) => a.id === 'registrar'), true)
  assert.match(textoDe(dos), /Asistencia registrada/)
  assert.match(textoDe(dos), /3 celdas escritas en Obreros 26/)
  assert.match(textoDe(dos), /Cargó @jefe\.obra/)
  assert.equal(accionesDe(dos).length, 0, 'el post confirmado no se vuelve a apretar')
  assert.equal(e.google.escrituras.length, 1, 'una sola escritura, en batch')
  assert.equal(e.google.escrituras[0].data.length, 3)
  assert.equal(e.sesiones.filas[0].estado, ESTADO_SESION.CONFIRMADA)
  assert.equal(e.eventos.filter((x) => x.evento.endsWith('written')).length, 1)
})

test('doble clic en Registrar a la vez: gana uno solo y no se escribe dos veces', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  const [a, b] = await Promise.all([registrar(e), registrar(e)])
  const textos = [textoDe(a), textoDe(b)]
  assert.equal(textos.filter((t) => /Asistencia registrada/.test(t)).length, 1)
  assert.equal(textos.filter((t) => /ya se registró/.test(t)).length, 1)
  assert.equal(e.google.escrituras.length, 1)
})

test('doble clic en Registrar, uno después del otro: el segundo no escribe nada', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  await registrar(e)
  const segundo = await registrar(e)
  assert.match(segundo.body.ephemeral_text, /ya se cerró/)
  assert.equal(e.google.escrituras.length, 1)
})

test('pisar una carga previa exige un sí aparte antes de escribir', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e, OBRA.MESSINAS)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'menoshoras').options[0].value
  await e.dialogo('asistencia.excepcion', { horas: '6', motivo: 'se_retiro_antes' }, { ref, tipo: 'parcial' })
  const pide = respuestaValida(await registrar(e))
  assert.match(textoDe(pide), /Se pisan 1 carga/)
  assert.equal(accionesDe(pide).find((a) => a.id === 'registrar').name, 'Registrar igual')
  assert.equal(e.google.escrituras.length, 0)
  const listo = respuestaValida(await registrar(e, { confirmar: true }))
  assert.match(textoDe(listo), /Asistencia registrada/)
  assert.equal(e.google.escrituras.length, 1)
})

test('si la cuadrilla cambió en la planilla, se avisa y NO se escribe', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  // Alguien mueve a una persona de obra mientras el jefe mira la lista.
  e.google.grid.filas[22][idxCol('AB')] = { valor: 'MESSINAS', numero: null, formula: null, derivada: false }
  const r = respuestaValida(await registrar(e))
  assert.match(textoDe(r), /cuadrilla de la obra cambió/)
  assert.equal(e.google.escrituras.length, 0)
  const listo = respuestaValida(await registrar(e))
  assert.match(textoDe(listo), /Asistencia registrada/)
  assert.equal(listo.body.update.props.attachments[0].text.includes('Emanuel Alaniz'), false)
})

test('alguien tocó la celda entre el plan y la escritura: se corta todo, no se escribe a medias', async () => {
  let lecturas = 0
  const google = fakeGoogleJornales({
    alLeer(grid) {
      lecturas++
      // La 3ª lectura es la que hace `registrarAsistencia` antes de escribir.
      if (lecturas === 3) grid.filas[20][idxCol('R')] = { valor: '4', numero: 4, formula: null, derivada: false }
    },
  })
  const e = await crearEntorno({ google })
  await elegirObra(e)
  const r = respuestaValida(await registrar(e))
  assert.match(textoDe(r), /Alguien cambió la planilla/)
  assert.equal(e.google.escrituras.length, 0)
  assert.equal(e.sesiones.filas[0].estado, ESTADO_SESION.FALLIDA,
    'la sesión queda fallida para que la clave de idempotencia no quede quemada')
})

test('sin jornada del día (sábado) no se registra: faltan las horas y no se inventan', async () => {
  const e = await crearEntorno({ hoy: () => '2026-07-25' })
  const cuadrilla = respuestaValida(await elegirObra(e))
  assert.match(textoDe(cuadrilla), /Falta indicar las horas/)
  const r = await registrar(e)
  assert.match(textoDe(r), /faltan las horas/i)
  assert.equal(e.google.escrituras.length, 0)
})

test('feriado: la cuadrilla arranca en franco con 0 h, no presente', async () => {
  const e = await crearEntorno({
    jornadaConfig: jornadaConfigDoble({ horas: 0, origen: 'feriado', etiqueta: 'Día de prueba' }),
  })
  const r = respuestaValida(await elegirObra(e))
  assert.match(textoDe(r), /feriado/)
  assert.match(textoDe(r), /no vino · franco/)
})

// ── CANCELAR, PERMISOS Y SESIÓN ─────────────────────────────────────────────────

test('cancelar: cierra la sesión y deja dicho que no se escribió nada', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  const r = respuestaValida(await e.accion({ paso: PASO.CANCELAR }))
  assert.match(textoDe(r), /No se escribió nada/)
  assert.equal(e.sesiones.filas[0].estado, ESTADO_SESION.CANCELADA)
  assert.equal(e.google.escrituras.length, 0)
  const despues = await elegirObra(e)
  assert.match(despues.body.ephemeral_text, /ya se cerró/)
})

test('el click de una tarjeta VIEJA se rechaza aunque la sesión se haya atado al abrirse', async () => {
  // La tarjeta del slash command la publica el bot, así que la sesión nace atada por
  // `root_post_id` y no por la meta. Mirando sólo la meta, el botón del mensaje anterior
  // pasaba —y encima el refresco aterrizaba en el mensaje nuevo, no en el que se tocó.
  const e = await crearEntorno()
  await e.sesiones.atarPost(e.sesion.id, 'post-de-la-tarjeta')
  const r = await e.accion({ paso: PASO.OBRA, selected_option: OBRA.REVOQUE }, { post_id: 'post-viejo' })
  assert.match(r.body.ephemeral_text, /mensaje de asistencia anterior/i)
  assert.equal(e.google.lecturas, 0, 'ni se toca la planilla')
})

test('el click de LA tarjeta atada sigue pasando: la guarda no bloquea el caso normal', async () => {
  const e = await crearEntorno()
  await e.sesiones.atarPost(e.sesion.id, 'post-1') // el mismo `post_id` que manda el doble
  const r = respuestaValida(await elegirObra(e))
  assert.ok(attachmentsDe(r).length > 0)
})

test('sin formulario abierto: se explica cómo abrir uno, sin tocar la planilla', async () => {
  const e = await crearEntorno({ abrirSesion: false })
  const r = await elegirObra(e)
  assert.match(r.body.ephemeral_text, /escribí «asistencia»/i)
  assert.equal(e.google.lecturas, 0)
})

test('sin permiso: se niega antes de leer la planilla y queda auditado', async () => {
  const e = await crearEntorno({ permisos: permisosDoble(false) })
  const r = await elegirObra(e)
  assert.match(r.body.ephemeral_text, /No pude habilitarte/)
  // Nombra la vía que habilita —el canal— en vez de mandar a pedirle un permiso a Dirección.
  assert.match(r.body.ephemeral_text, /canal de asistencia/i)
  assert.equal(e.google.lecturas, 0, 'nada de leer la planilla para después negar')
  assert.equal(e.eventos.some((x) => x.evento.endsWith('denied')), true)
})

test('un pedido sin identidad no se atiende', async () => {
  const e = await crearEntorno()
  for (const payload of [null, {}, { context: { paso: 'obra' } }, 'texto']) {
    const r = await e.rutear({ payload })
    assert.equal(r.status, 400)
    assert.match(r.body.ephemeral_text, /No entendí esa acción/)
  }
})

test('un paso desconocido no rompe nada', async () => {
  const e = await crearEntorno()
  const r = await e.accion({ paso: 'borrar_todo' })
  assert.equal(r.status, 200)
  assert.match(r.body.ephemeral_text, /No entendí esa acción/)
  assert.equal(e.google.escrituras.length, 0)
})

// ── ERRORES: NUNCA UN STACK, UNA RUTA NI UN SECRETO ─────────────────────────────

const FILTRACIONES = [/Bearer/i, /sk-/, /\/home\//, /\.mjs/, /at .*\(/, /Error:/, /secret/i, /token/i]

function sinFiltraciones(texto) {
  for (const re of FILTRACIONES) {
    assert.doesNotMatch(texto, re, `la respuesta filtró algo técnico: ${texto}`)
  }
}

test('si la planilla revienta, el jefe lee una frase y nadie ve un stack', async () => {
  const e = await crearEntorno({ google: googleQueFalla() })
  for (const r of [await e.accion({ paso: PASO.FECHA, valor: 'hoy' }), await elegirObra(e), await registrar(e)]) {
    assert.equal(r.status, 200)
    sinFiltraciones(textoDe(r))
  }
})

test('si la escritura falla, tampoco se filtra nada y la sesión queda reintentable', async () => {
  const google = fakeGoogleJornales({
    alEscribir() { throw new Error('Bearer sk-SECRETO falló en /home/jorge/orquestador/lib/google.mjs:42') },
  })
  const e = await crearEntorno({ google })
  await elegirObra(e)
  const r = respuestaValida(await registrar(e))
  sinFiltraciones(textoDe(r))
  assert.match(textoDe(r), /No se pudo escribir en la planilla/)
  assert.equal(e.sesiones.filas[0].estado, ESTADO_SESION.FALLIDA)
})

test('si no se puede abrir el diálogo, se avisa y el post queda como estaba', async () => {
  const e = await crearEntorno({ mattermost: mattermostDoble({ abre: false }) })
  const cuadrilla = await elegirObra(e)
  const ref = accionesDe(cuadrilla).find((a) => a.id === 'novino').options[0].value
  const r = await e.accion({ paso: PASO.EXCEPCION, selected_option: ref })
  assert.match(r.body.ephemeral_text, /No se pudo abrir el formulario/)
  sinFiltraciones(textoDe(r))
})

test('la pestaña candada por el dueño no se fuerza: se informa y se corta', async () => {
  const e = await crearEntorno({ google: fakeGoogleJornales({ protegido: true }) })
  await elegirObra(e)
  const r = respuestaValida(await registrar(e))
  assert.match(textoDe(r), /está tomada/)
  sinFiltraciones(textoDe(r))
})

// EL 03/08, EN PRODUCCIÓN: dos cargas de Rodrigo —una del 31/07 y otra del 03/08, ya de agosto—
// murieron con el mensaje de "pestaña tomada" cuando lo que estaba puesto era el FRENO DE MANO de
// todos los Sheets. Son dos causas distintas y se destraban en lugares distintos.
test('el FRENO GENERAL de Sheets no se reporta como pestaña candada', async () => {
  const e = await crearEntorno({ google: fakeGoogleJornales({ congelado: true }) })
  await elegirObra(e)
  const r = respuestaValida(await registrar(e))
  assert.match(textoDe(r), /frenada por pedido de Dirección/)
  assert.doesNotMatch(textoDe(r), /está tomada/)
  sinFiltraciones(textoDe(r))
})

// ── VARIAS PERSONAS CON LA MISMA NOVEDAD ────────────────────────────────────────────
// El pedido del dueño (03/08): «que se pueda agregar más de una persona». Lo que obligaba a
// repetir el trámite era un diálogo POR CABEZA para la misma novedad.

/** Ref de una persona de la cuadrilla, por el texto de su nombre en el desplegable. */
const refDe = (cuadrilla, nombre) => accionesDe(cuadrilla).find((a) => a.id === 'novino')
  .options.find((o) => o.text.includes(nombre)).value

const menuRepetir = (r) => accionesDe(r).find((a) => a.id === 'repetir')

test('sin ninguna novedad cargada NO se ofrece repetir: un desplegable que no hace nada es peor que ninguno', async () => {
  const e = await crearEntorno()
  const cuadrilla = respuestaValida(await elegirObra(e))
  assert.equal(menuRepetir(cuadrilla), undefined)
})

test('marcada la primera persona, aparece «Aplicar lo mismo a…» con el RESTO de la cuadrilla', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = refDe(cuadrilla, 'Quiroga')
  await e.dialogo('asistencia.excepcion', { motivo: 'falta' }, { ref, tipo: 'ausencia' })
  const post = e.mattermost.posts.at(-1)
  assert.equal(validarMensaje(post).ok, true)
  const menu = (post.props.attachments.flatMap((a) => a.actions ?? [])).find((a) => a.id === 'repetir')
  assert.ok(menu, 'tiene que ofrecerse repetir la novedad recién cargada')
  assert.ok(menu.options.length > 0)
  assert.equal(menu.options.some((o) => o.value === ref), false, 'no se ofrece copiársela a sí mismo')
  assert.match(JSON.stringify(post.props), /Aplicar lo mismo a/)
})

test('UN CLICK aplica la misma novedad a la segunda persona: sin diálogo y sin repetir el trámite', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = refDe(cuadrilla, 'Quiroga')
  await e.dialogo('asistencia.excepcion', { motivo: 'falta' }, { ref, tipo: 'ausencia' })
  const dialogosAntes = e.mattermost.dialogos.length

  const otro = (e.mattermost.posts.at(-1).props.attachments.flatMap((a) => a.actions ?? []))
    .find((a) => a.id === 'repetir').options[0].value
  const r = respuestaValida(await e.accion({ paso: PASO.REPETIR, selected_option: otro }))

  assert.equal(e.mattermost.dialogos.length, dialogosAntes, 'copiar no abre ningún formulario')
  assert.match(textoDe(r), /"title":"Ausentes","value":"2"/)
})

test('se puede seguir aplicando a una TERCERA persona: el origen no se corre de lugar', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = refDe(cuadrilla, 'Quiroga')
  await e.dialogo('asistencia.excepcion', { motivo: 'falta' }, { ref, tipo: 'ausencia' })
  const opciones = (e.mattermost.posts.at(-1).props.attachments.flatMap((a) => a.actions ?? []))
    .find((a) => a.id === 'repetir').options
  await e.accion({ paso: PASO.REPETIR, selected_option: opciones[0].value })
  const r = respuestaValida(await e.accion({ paso: PASO.REPETIR, selected_option: opciones[1].value }))
  assert.match(textoDe(r), /"title":"Ausentes","value":"3"/)
})

test('copiar sin haber marcado nada no inventa una novedad', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = refDe(cuadrilla, 'Quiroga')
  const r = await e.accion({ paso: PASO.REPETIR, selected_option: ref })
  assert.match(r.body.ephemeral_text, /No hay una novedad para copiar/)
})

test('cambiar de obra apaga el repetir: la novedad era de la cuadrilla anterior', async () => {
  const e = await crearEntorno()
  const cuadrilla = await elegirObra(e)
  const ref = refDe(cuadrilla, 'Quiroga')
  await e.dialogo('asistencia.excepcion', { motivo: 'falta' }, { ref, tipo: 'ausencia' })
  const otra = respuestaValida(await elegirObra(e, OBRA.ESTRELLA))
  assert.equal(menuRepetir(otra), undefined)
})

// ── EL CONTRATO, A LO LARGO DEL RECORRIDO ───────────────────────────────────────────

test('todo lo que se publica en el recorrido completo es JSON válido de Mattermost', async () => {
  const e = await crearEntorno()
  const pasos = [
    await e.accion({ paso: PASO.FECHA, valor: 'hoy' }),
    await elegirObra(e),
    await e.accion({ paso: PASO.EXCEPCION, selected_option: 'inexistente' }),
    await registrar(e),
  ]
  for (const r of pasos) {
    respuestaValida(r)
    for (const a of attachmentsDe(r)) assert.equal(typeof a.fallback, 'string')
  }
  for (const d of e.mattermost.dialogos) assert.equal(validarDialogo(d).ok, true)
  for (const p of e.mattermost.posts) assert.equal(validarMensaje(p).ok, true)
  assert.equal(e.sesion.plataforma_user_id, USUARIO.id)
  assert.equal(e.sesion.fecha_operativa, FECHA_HOY)
})

// ── AUDITORÍA DE LOS RECHAZOS DEL RUTEADOR ──────────────────────────────────────
//
// Sesión vencida, formulario ajeno, payload que no se entiende: los tres devuelven un
// mensaje al usuario y ninguno dejaba rastro. Ahora los tres se anotan, con el detalle
// distinguible en `error_code` — que es lo que permite ver un sondeo desde afuera.

/** Los eventos `denied` de un entorno. */
const rechazos = (e) => e.eventos.filter((x) => x.evento.endsWith('denied'))

test('payload que no se entiende: queda anotado', async () => {
  const e = await crearEntorno()
  const r = await e.rutear({ payload: { channel_id: 'canal-1' } }) // sin user_id
  assert.equal(r.status, 400)
  assert.equal(rechazos(e).length, 1)
  assert.equal(rechazos(e)[0].datos.error_code, 'payload_invalido')
  assert.equal(rechazos(e)[0].datos.channel_id, 'canal-1')
})

test('sin sesión abierta: queda anotado como sesión inexistente', async () => {
  const e = await crearEntorno({ abrirSesion: false })
  await e.accion({ paso: PASO.OBRA, selected_option: OBRA.clave })
  assert.equal(rechazos(e).length, 1)
  assert.equal(rechazos(e)[0].datos.error_code, 'sesion_inexistente')
  assert.equal(rechazos(e)[0].datos.origen, 'accion')
})

test('sin permiso: queda anotado con quién y desde dónde', async () => {
  const e = await crearEntorno({ permisos: permisosDoble(false) })
  await e.accion({ paso: PASO.OBRA, selected_option: OBRA.clave })
  const d = rechazos(e)[0].datos
  assert.equal(d.motivo, 'permiso')
  assert.equal(d.mattermost_user_id, USUARIO.id)
  assert.equal(d.channel_id, 'canal-1')
})

test('un diálogo con un formulario desconocido queda anotado, y como diálogo', async () => {
  const e = await crearEntorno()
  await e.dialogo('asistencia.formulario-que-no-existe', { fecha: '30/07/2026' })
  const d = rechazos(e)[0].datos
  assert.equal(d.error_code, 'formulario_invalido')
  assert.equal(d.origen, 'dialogo')
})

test('un paso inventado queda anotado', async () => {
  const e = await crearEntorno()
  await e.accion({ paso: 'borrar-todo' })
  assert.equal(rechazos(e)[0].datos.error_code, 'paso_desconocido')
})

test('el recorrido normal NO genera un solo rechazo', async () => {
  const e = await crearEntorno()
  await e.accion({ paso: PASO.FECHA, valor: 'hoy' })
  await elegirObra(e)
  assert.equal(rechazos(e).length, 0, 'una auditoría de rechazo falsa es tan mala como no auditar')
})

test('cada rechazo se anota UNA vez, no dos', async () => {
  const e = await crearEntorno({ permisos: permisosDoble(false) })
  await e.accion({ paso: PASO.OBRA, selected_option: OBRA.clave })
  await e.accion({ paso: PASO.REGISTRAR })
  assert.equal(rechazos(e).length, 2, 'dos intentos, dos registros: ni más ni menos')
})

test('el rechazo sigue diciendo lo mismo al usuario', async () => {
  const e = await crearEntorno({ abrirSesion: false })
  const r = await e.accion({ paso: PASO.OBRA, selected_option: OBRA.clave })
  assert.match(textoDe(r), /formulario/i)
  assert.equal(r.status, 200)
})

// ── LO QUE QUEDA REGISTRADO CUANDO SE ESCRIBE ───────────────────────────────────
// El evento `written` del camino de botones se armaba a mano y guardaba cuatro campos:
// en producción quedaba sin `celdas_modificadas` —qué celda, de qué valor a cuál— que es
// justo lo que hay que mirar para auditar una carga, y sin el nombre de quien cargó.

test('la escritura queda auditada con la evidencia celda por celda, no con un resumen', async () => {
  const e = await crearEntorno()
  await elegirObra(e)
  respuestaValida(await registrar(e))
  const w = e.eventos.find((x) => String(x.evento).endsWith('written'))
  assert.ok(w, 'no se auditó la escritura')
  const d = w.datos
  assert.ok(Array.isArray(d.celdas_modificadas) && d.celdas_modificadas.length > 0,
    'sin `celdas_modificadas` no se puede reconstruir qué se escribió')
  const c = d.celdas_modificadas[0]
  for (const campo of ['celda', 'trabajador', 'old_value', 'new_value']) {
    assert.ok(campo in c, `a la evidencia le falta «${campo}»: ${JSON.stringify(c)}`)
  }
  assert.equal(d.mattermost_username, 'jefe.obra', 'la carga tiene que quedar a nombre de alguien')
  assert.ok(d.spreadsheet_id, 'sin la planilla no se sabe dónde se escribió')
  assert.ok(d.horas_total > 0, 'el resumen de horas viajaba en null')
})

test('los botones de un mensaje viejo no manejan el formulario nuevo', async () => {
  const e = await crearEntorno()
  await elegirObra(e)                                   // ata la sesión al post-1
  const r = await e.accion({ paso: PASO.OBRA, selected_option: OBRA.REVOQUE }, { post_id: 'post-VIEJO' })
  assert.match(r.body.ephemeral_text ?? '', /mensaje de asistencia anterior/,
    'un click del mensaje viejo tiene que rebotar, no manejar la sesión nueva')
  const ev = e.eventos.filter((x) => String(x.evento).endsWith('denied'))
  assert.equal(ev.at(-1)?.datos?.error_code, 'post_viejo', 'y queda auditado con su motivo')
})

test('un mensaje fuera del contrato de Mattermost deja rastro en el log', async () => {
  // `validarMensaje` es quien conoce el alfabeto de los `action_id` — el defecto que dejó
  // los botones de fecha en «Sorry, we could not find the page» — y durante todo el módulo
  // corrió SÓLO dentro de los tests. Un validador que sólo corre en los tests no defiende.
  const fallas = []
  const e = await crearEntorno({ log: { error: (m, d) => fallas.push({ m, d }), warn() {}, info() {} } })
  await elegirObra(e)
  assert.equal(fallas.length, 0, 'un mensaje bien formado no debe ensuciar el log')

  // Y con un mensaje roto, avisa: se rompe el contrato desde el propio constructor.
  const { validarMensaje } = await import('./contrato-mattermost.mjs')
  const roto = { message: '', props: { attachments: [{ actions: [{ id: 'fecha_hoy', name: 'Hoy', type: 'button', integration: { url: 'https://x' } }] }] } }
  const v = validarMensaje(roto)
  assert.equal(v.ok, false, 'un id con guión bajo tiene que ser rechazado por el contrato')
  assert.ok(v.fallas.some((f) => /fecha_hoy|alfanum/i.test(f)), `el contrato no nombró el problema: ${JSON.stringify(v.fallas)}`)
})
