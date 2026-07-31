// Los contratos son lo único que las cuatro piezas comparten. Si acá se afloja una
// validación, el error aparece tres capas más abajo — típicamente cuando Google devuelve
// 400 y ya es tarde para decirle algo útil a la persona.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPACIDAD, INTENCION, zIntencion, zSolicitud, zInstante, zCadencia, ERROR,
  errorAsistente, esReintentable, resultadoOk, resultadoError, resultadoAclaracion,
  zResultado, zCalendarEvento, zGoogleTarea, zIdentidad, TZ_EMPRESA,
} from './contratos.mjs'

test('la lista de intenciones incluye todas las capacidades y el desconocido', () => {
  for (const id of Object.values(CAPACIDAD)) assert.doesNotThrow(() => zIntencion.parse(id))
  assert.doesNotThrow(() => zIntencion.parse(INTENCION.DESCONOCIDO))
  assert.throws(() => zIntencion.parse('inventada'))
})

test('un instante sin offset no es un instante', () => {
  // Sin offset, "2026-08-06T20:00" significa cosas distintas según quién lo lea. Es
  // exactamente el error que agenda una reunión tres horas corrida.
  assert.doesNotThrow(() => zInstante.parse('2026-08-06T20:00:00-03:00'))
  assert.doesNotThrow(() => zInstante.parse('2026-08-06T20:00Z'))
  assert.throws(() => zInstante.parse('2026-08-06T20:00:00'))
  assert.throws(() => zInstante.parse('mañana a las 20'))
  assert.throws(() => zInstante.parse('06/08/2026'))
})

test('la cadencia sólo acepta el formato de orq.schedules', () => {
  for (const c of ['daily:08:00', 'weekly:lun:08:00', 'weekly:sab:21:30', 'monthly:1:08:00', 'monthly:15:09:00']) {
    assert.doesNotThrow(() => zCadencia.parse(c), c)
  }
  for (const c of ['diario', 'weekly:lunes:08:00', 'daily:8:00', 'yearly:1:08:00']) {
    assert.throws(() => zCadencia.parse(c), undefined, c)
  }
})

test('la solicitud declara por dónde vino: es la métrica que gobierna el costo', () => {
  const s = zSolicitud.parse({ intencion: CAPACIDAD.AYUDA, via: 'deterministico' })
  assert.equal(s.via, 'deterministico')
  assert.equal(s.confianza, 1)
  assert.deepEqual(s.faltantes, [])
  assert.equal(s.ambiguedad, null)
  assert.throws(() => zSolicitud.parse({ intencion: CAPACIDAD.AYUDA, via: 'a ojo' }))
})

test('sólo lo temporal y el fallo de entrega se reintentan', () => {
  assert.equal(esReintentable(ERROR.TEMPORAL), true)
  assert.equal(esReintentable(ERROR.ENTREGA_MATTERMOST), true)
  for (const c of [ERROR.PERMISO_DENEGADO, ERROR.GOOGLE_SIN_ACCESO, ERROR.NO_ENCONTRADO, ERROR.DEFINITIVO, ERROR.DATO_FALTANTE]) {
    assert.equal(esReintentable(c), false, c)
  }
})

test('el error separa lo que ve la persona de lo que va al log', () => {
  const e = errorAsistente(ERROR.GOOGLE_SIN_ACCESO, 'No pude acceder a Google Drive porque la conexión está vencida.', 'invalid_grant: token expired for x@y')
  assert.equal(e.codigo, ERROR.GOOGLE_SIN_ACCESO)
  assert.ok(!e.mensaje.includes('invalid_grant'), 'el detalle técnico no puede filtrarse al chat')
  assert.ok(e.detalle.includes('invalid_grant'))
  assert.equal(e.reintentable, false)
  // El detalle se recorta: un stack entero en la auditoría no es evidencia, es ruido.
  assert.ok(errorAsistente(ERROR.TEMPORAL, 'x', 'y'.repeat(2000)).detalle.length <= 500)
})

test('un resultado ok SIEMPRE lleva evidencia, y uno con error nunca la lleva', () => {
  const ok = zResultado.parse(resultadoOk(CAPACIDAD.TASKS_TAREA_CREAR, 'Listo.', { id: 'tarea-1' }))
  assert.equal(ok.ok, true)
  assert.equal(ok.evidencia.id, 'tarea-1')
  assert.equal(ok.error, null)

  const err = zResultado.parse(resultadoError(CAPACIDAD.DRIVE_BUSCAR, errorAsistente(ERROR.NO_ENCONTRADO, 'No encontré ese archivo.')))
  assert.equal(err.ok, false)
  assert.equal(err.evidencia, null)
  assert.equal(err.texto, 'No encontré ese archivo.') // lo que ve la persona ES el mensaje del error

  const acl = zResultado.parse(resultadoAclaracion(CAPACIDAD.RECORDATORIO_CREAR, '¿Rodrigo Bronia o Rodrigo Echegaray?', [{ valor: 'a', etiqueta: 'Rodrigo Bronia' }], { contenido: 'buscar las llaves' }))
  assert.equal(acl.ok, false)
  assert.equal(acl.error, null)
  assert.equal(acl.aclaracion.opciones.length, 1)
  assert.equal(acl.aclaracion.parcial.contenido, 'buscar las llaves')
})

test('un evento sin título o sin inicio válido no se crea a medias', () => {
  assert.doesNotThrow(() => zCalendarEvento.parse({ titulo: 'Reunión con Rodrigo', inicio: '2026-08-01T09:00:00-03:00' }))
  assert.throws(() => zCalendarEvento.parse({ titulo: '', inicio: '2026-08-01T09:00:00-03:00' }))
  assert.throws(() => zCalendarEvento.parse({ titulo: 'x', inicio: 'mañana' }))
  assert.throws(() => zCalendarEvento.parse({ titulo: 'x', inicio: '2026-08-01T09:00:00-03:00', duracionMin: -30 }))
})

test('una tarea de Google lleva lista por defecto y vencimiento opcional', () => {
  const t = zGoogleTarea.parse({ titulo: 'Llamar a Santander' })
  assert.equal(t.lista, '@default')
  assert.equal(t.vence, null)
  assert.throws(() => zGoogleTarea.parse({ titulo: 'x', vence: 'el viernes' }))
})

test('la identidad trae la zona de la empresa por defecto', () => {
  const i = zIdentidad.parse({ plataformaUserId: 'mm-1', nombreVisible: 'Rodrigo' })
  assert.equal(i.zonaHoraria, TZ_EMPRESA)
  assert.equal(i.plataforma, 'mattermost')
  assert.equal(i.activo, true)
  assert.deepEqual(i.alias, [])
})
