import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completarSemana, duracion, encabezadoDelDia, hora, lecturaDelDia, lecturaDelDiaSinMarca, pendienteDeImputar, siguienteAccion, totalDelPeriodo, trabajadoHoy } from './asistencia.ts'
import type { DiaDeAsistencia } from '../types/index.ts'

const dia = (p: Partial<DiaDeAsistencia>): DiaDeAsistencia => ({
  fecha: '2026-08-20', entrada: null, salida: null, incidencias: 0, motivo: null,
  estado: 'sin_registrar', minutos: null, obra_id: null, ...p,
})

test('la acción es UNA sola y sigue al estado', () => {
  assert.equal(siguienteAccion(null).tipo, 'entrada')
  assert.equal(siguienteAccion(dia({ estado: 'en_curso' })).tipo, 'salida')
  assert.equal(siguienteAccion(dia({ estado: 'falta_salida' })).tipo, 'salida')
  // Con el día cerrado NO hay acción: ofrecer «registrar entrada» de nuevo duplicaría el día.
  assert.equal(siguienteAccion(dia({ estado: 'completo' })).tipo, null)
})

test('«falta salida» avisa en warn, no acusa en neg', () => {
  assert.equal(lecturaDelDia(dia({ estado: 'falta_salida' })).tono, 'warn')
  assert.equal(lecturaDelDia(dia({ estado: 'en_curso' })).tono, 'curso')
})

test('la hora no lleva segundos y una fecha inválida no rompe la pantalla', () => {
  assert.equal(hora('2026-08-20T07:58:12-03:00'), '07:58')
  assert.equal(hora('no es una fecha'), null)
  assert.equal(hora(null), null)
})

test('la duración se lee en reloj, no en decimal', () => {
  assert.equal(duracion(460), '7 h 40 min')
  assert.equal(duracion(480), '8 h')
  assert.equal(duracion(40), '40 min')
  assert.equal(duracion(null), null)
  assert.equal(duracion(-5), null, 'un negativo es un defecto, no un dato: no se dibuja')
})

test('EL TOTAL NO INVENTA EL DÍA ABIERTO — y dice cuántos quedaron afuera', () => {
  // El defecto que atrapa: sumar el día en curso como 0 h da un total que parece completo y no lo
  // está; sumarlo «hasta ahora» fabrica horas que nadie trabajó.
  const t = totalDelPeriodo([
    dia({ estado: 'completo', minutos: 480 }),
    dia({ estado: 'completo', minutos: 460 }),
    dia({ estado: 'en_curso' }),
    dia({ estado: 'falta_salida' }),
    dia({ estado: 'sin_registrar' }),
  ])
  assert.equal(t.minutos, 940)
  assert.equal(t.sinCerrar, 2, 'el día en curso y el que quedó sin salida')
})

test('presencia vs HH: sin las dos puntas NO se calcula el pendiente', () => {
  // El defecto que atrapa: sin una sola marca de asistencia, «pendiente 148 h» acusa a la obra de no
  // imputar cuando lo que falta es la asistencia.
  assert.equal(pendienteDeImputar(0, 148), null)
  assert.equal(pendienteDeImputar(9080, 0), null)
  const r = pendienteDeImputar(9080, 148)
  assert.ok(r)
  assert.equal(r.pendiente, 9080 - 8880)
})

test('el encabezado grande NUNCA escribe una hora que nadie marcó', () => {
  const sinFichar = encabezadoDelDia(null)
  assert.equal(sinFichar.titulo, 'Todavía no fichaste')
  // EL DEFECTO QUE ATRAPA: un `detalle` armado con `hora(dia?.entrada) ?? '00:00'` publicaría
  // «fichaste hoy a las 00:00» sobre un día en el que nadie tocó el botón.
  assert.equal(sinFichar.detalle, null)
  assert.ok(!JSON.stringify(sinFichar).includes('00:00'))

  const enCurso = encabezadoDelDia({
    fecha: '2026-08-24', entrada: '2026-08-24T07:12:00-03:00', salida: null,
    incidencias: 0, motivo: null, estado: 'en_curso', minutos: null, obra_id: null,
  })
  assert.equal(enCurso.titulo, 'En obra')
  assert.equal(enCurso.detalle, 'fichaste hoy a las 07:12')
})

test('el día en curso no publica un total trabajado, aunque el mockup lo dibuje', () => {
  const enCurso = {
    fecha: '2026-08-24', entrada: '2026-08-24T07:12:00-03:00', salida: null,
    incidencias: 0, motivo: null, estado: 'en_curso' as const, minutos: null, obra_id: null,
  }
  assert.equal(trabajadoHoy(enCurso), null)
  assert.equal(trabajadoHoy(null), null)
  // Cerrado sí: los minutos los cerró la base con las dos puntas.
  assert.equal(trabajadoHoy({ ...enCurso, estado: 'completo', salida: '2026-08-24T16:42:00-03:00', minutos: 570 }), '9 h 30 min')
})

// ── LA SEMANA NO ACUSA POR ADELANTADO (hallazgo 3 de la auditoría del 25/08/2026) ──────────────

const LUN_A_VIE = [1, 2, 3, 4, 5]

test('UN DÍA QUE TODAVÍA NO PASÓ NO ES «SIN FICHAR»: nadie puede faltar a mañana', () => {
  // El defecto que atrapa: el martes 25 la semana mostraba Mié 26, Jue 27 y Vie 28 con la ✕ roja
  // de «sin fichar». Si `lecturaDelDiaSinMarca` vuelve a mirar sólo la ausencia de marcas, esto
  // se pone rojo.
  assert.equal(lecturaDelDiaSinMarca('2026-08-26', '2026-08-25', LUN_A_VIE), 'futuro')
  assert.equal(lecturaDelDiaSinMarca('2026-08-28', '2026-08-25', LUN_A_VIE), 'futuro')
  // Hoy sí se juzga: a las 06:00 todavía no fichó, y eso es exactamente lo que vino a ver.
  assert.equal(lecturaDelDiaSinMarca('2026-08-25', '2026-08-25', LUN_A_VIE), 'sin_fichar')
  assert.equal(lecturaDelDiaSinMarca('2026-08-24', '2026-08-25', LUN_A_VIE), 'sin_fichar')
})

test('EL SÁBADO Y EL DOMINGO NO SE JUZGAN si la obra no los trabaja — ni antes ni después', () => {
  assert.equal(lecturaDelDiaSinMarca('2026-08-29', '2026-08-25', LUN_A_VIE), 'no_laborable') // sábado futuro
  assert.equal(lecturaDelDiaSinMarca('2026-08-30', '2026-08-25', LUN_A_VIE), 'no_laborable') // domingo futuro
  assert.equal(lecturaDelDiaSinMarca('2026-08-23', '2026-08-25', LUN_A_VIE), 'no_laborable') // domingo pasado
})

test('el domingo es 7 y no 0: una obra que trabaja domingos los ve como días de trabajo', () => {
  // `dias_habiles` usa isodow (1 lunes … 7 domingo). Con `getUTCDay()` a secas el domingo daría 0
  // y una obra que declara el 7 vería sus domingos como descanso.
  assert.equal(lecturaDelDiaSinMarca('2026-08-23', '2026-08-25', [1, 2, 3, 4, 5, 6, 7]), 'sin_fichar')
  assert.equal(lecturaDelDiaSinMarca('2026-08-22', '2026-08-25', [1, 2, 3, 4, 5]), 'no_laborable') // sábado
})

test('sin días hábiles declarados NO se inventa una semana laboral', () => {
  assert.equal(lecturaDelDiaSinMarca('2026-08-23', '2026-08-25', []), 'sin_fichar')
  assert.equal(lecturaDelDiaSinMarca('2026-08-23', '2026-08-25', null), 'sin_fichar')
})

test('la semana se dibuja entera y cada día que falta dice POR QUÉ falta', () => {
  const filas = completarSemana('2026-08-24', [
    dia({ fecha: '2026-08-24', estado: 'completo', minutos: 540, entrada: '2026-08-24T07:00:00-03:00' }),
  ], '2026-08-25', LUN_A_VIE)
  assert.equal(filas.length, 7)
  assert.deepEqual(filas.map((f) => f.sinMarca), [
    null,          // lunes 24 · vino de la base
    'sin_fichar',  // martes 25 · hoy, y todavía no fichó
    'futuro', 'futuro', 'futuro',
    'no_laborable', 'no_laborable',
  ])
  // La fila real no se toca: sus marcas y sus minutos siguen siendo los de la base.
  assert.equal(filas[0].minutos, 540)
  // Y la sintética sigue sin minutos: no es un día de cero horas.
  assert.equal(filas[1].minutos, null)
})

test('un día no laborable en el que SÍ se fichó se dibuja como cualquier otro: el hecho gana', () => {
  const filas = completarSemana('2026-08-24', [
    dia({ fecha: '2026-08-29', estado: 'completo', minutos: 300 }),
  ], '2026-08-31', LUN_A_VIE)
  const sabado = filas.find((f) => f.fecha === '2026-08-29')
  assert.equal(sabado?.sinMarca, null)
  assert.equal(sabado?.minutos, 300)
})
