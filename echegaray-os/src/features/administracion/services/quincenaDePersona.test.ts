import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cifrasDeQuincena, diasDeLaQuincena, rotuloCorto, ultimasQuincenas,
} from './quincenaDePersona.ts'
import { quincenaDe } from './quincena.ts'
import type { ImputacionHH } from '../types/index.ts'

// Septiembre de 2026: la 1ª quincena va del martes 1 al martes 15, con los sábados 5 y 12 y los
// domingos 6 y 13 adentro. Es el caso que rompe cualquier grilla pensada de lunes a viernes.
const r = (p: Partial<ImputacionHH>): ImputacionHH => ({
  id: p.id ?? `${p.fecha}-${p.tipo_hora ?? 'normal'}-${p.obra_canonica_id ?? 'estrella'}`,
  fecha: '2026-09-07', fecha_inicio_semana: '2026-09-07',
  obra_canonica_id: 'estrella', obra_nombre: 'La Estrella',
  actividad_id: null, actividad_nombre: null,
  horas: 8, tipo_hora: 'normal', notas: null, fuente_legacy: 'sheet:jornales',
  creado_en: null, cargo: null, corregido_en: null, corrigio: null, ...p,
})

const Q1 = quincenaDe('2026-09-08')
const dia = (dias: ReturnType<typeof diasDeLaQuincena>, fecha: string) =>
  dias.find((d) => d.fecha === fecha)!

test('LA VENTANA ES LA QUINCENA ENTERA MENOS LOS DOMINGOS — el sábado sigue', () => {
  // Orden del dueño 08/09/2026: los domingos salen de la consideración. La franja de la ficha
  // dibuja las MISMAS columnas que la grilla de Administración: si contara quince y la grilla
  // trece, los dos «días hábiles» de la empresa serían distintos según qué pantalla se mire.
  const dias = diasDeLaQuincena([], Q1, { hoy: '2026-09-15' })
  assert.equal(dias.length, 13, 'del 1 al 15 son 15 días menos los domingos 6 y 13')
  assert.equal(dias[0].fecha, '2026-09-01')
  assert.equal(dias[12].fecha, '2026-09-15')
  assert.equal(dias.filter((d) => d.nombre === 'domingo').length, 0, 'ni un domingo')
  assert.equal(dia(dias, '2026-09-05').finDeSemana, true, 'el sábado 5 SIGUE, atenuado')
})

test('UN DÍA HÁBIL TRANSCURRIDO SIN REGISTRO NO ES UNA AUSENCIA — y el futuro tampoco es un cero', () => {
  // El defecto que atrapa: pintar de rojo, o de cero, lo que nadie cargó. «Sin registrar» no es
  // ausente (regla del módulo) y un día que todavía no llegó no puede tener horas.
  const dias = diasDeLaQuincena([], Q1, { hoy: '2026-09-08' })
  assert.equal(dia(dias, '2026-09-07').estado, 'sin_registrar', 'lunes 7, ya pasó y nadie cargó')
  assert.equal(dia(dias, '2026-09-07').horas, null, 'sin registro NO es cero')
  assert.equal(dia(dias, '2026-09-10').estado, 'futuro', 'jueves 10, todavía no pasó')
  assert.equal(dia(dias, '2026-09-05').estado, 'no_laborable', 'sábado 5 sin cargar no se reclama')
})

test('LOS DÍAS HÁBILES DE LA QUINCENA NO CUENTAN DOMINGOS', () => {
  // EL DEFECTO QUE ATRAPA: con los domingos en la ventana, `diasHabiles` los sumaba como
  // «no_laborable» y no molestaba; pero cualquier conteo que los recorra (la referencia de horas,
  // el «sin marcar») los tenía delante. Ahora no existen, y el número de referencia lo demuestra.
  const cifras = cifrasDeQuincena(diasDeLaQuincena([], Q1, { hoy: '2026-09-15' }), 9)
  assert.equal(cifras.diasHabiles, 11, '13 columnas menos los dos sábados no laborables')
  assert.equal(cifras.referencia, 99, '11 × 9 hs')
})

test('UNA QUINCENA CON TRES DOMINGOS PIERDE TRES COLUMNAS', () => {
  // La segunda quincena de agosto de 2026 (16 al 31) tiene domingos el 16, el 23 y el 30: el largo
  // de la quincena cambia con el mes y la cantidad de domingos también. Clavar «13» sería una
  // segunda definición del período, escondida en una constante.
  const dias = diasDeLaQuincena([], { desde: '2026-08-16', hasta: '2026-08-31' }, { hoy: '2026-08-31' })
  assert.equal(dias.length, 13, '16 días menos tres domingos')
  assert.equal(dias[0].fecha, '2026-08-17', 'el 16 era domingo: la franja arranca el lunes 17')
  assert.equal(dias.filter((d) => d.nombre === 'domingo').length, 0)
})

test('UN FERIADO NO ES UN DÍA SIN CARGAR', () => {
  const dias = diasDeLaQuincena([], Q1, { hoy: '2026-09-15', feriados: ['2026-09-08'] })
  assert.equal(dia(dias, '2026-09-08').estado, 'no_laborable')
})

test('LO DECLARADO MANDA SOBRE EL ALMANAQUE: un sábado con horas es un sábado trabajado', () => {
  // El defecto que atrapa: pintar el sábado como no laborable y esconder horas que sí se pagaron.
  const dias = diasDeLaQuincena([r({ fecha: '2026-09-05', horas: 6 })], Q1, { hoy: '2026-09-15' })
  assert.equal(dia(dias, '2026-09-05').estado, 'trabajado')
  assert.equal(dia(dias, '2026-09-05').horas, 6)
})

test('LA AUSENCIA LLEVA SU MOTIVO, Y LA LICENCIA NO SE DEGRADA A FALTA', () => {
  const dias = diasDeLaQuincena([
    r({ fecha: '2026-09-07', tipo_hora: 'ausencia', horas: 8, notas: 'falta' }),
    r({ fecha: '2026-09-09', tipo_hora: 'licencia', horas: 8, notas: 'enfermedad' }),
  ], Q1, { hoy: '2026-09-15' })
  assert.equal(dia(dias, '2026-09-07').estado, 'ausencia')
  assert.equal(dia(dias, '2026-09-07').motivo, 'Faltó sin avisar')
  assert.equal(dia(dias, '2026-09-07').horas, null, 'una ausencia no suma horas trabajadas')
  assert.equal(dia(dias, '2026-09-09').estado, 'licencia')
  assert.equal(dia(dias, '2026-09-09').motivo, 'Enfermedad')
})

test('UN DÍA REPARTIDO ENTRE DOS OBRAS SE VE, y con el nombre real de cada una', () => {
  // El defecto que atrapa: quedarse con la primera obra del día y afirmar que trabajó sólo ahí.
  const dias = diasDeLaQuincena([
    r({ fecha: '2026-09-07', horas: 4, obra_canonica_id: 'estrella', obra_nombre: 'La Estrella' }),
    r({ fecha: '2026-09-07', horas: 4.5, obra_canonica_id: 'arcor', obra_nombre: 'ARCOR Planta' }),
  ], Q1, { hoy: '2026-09-15' })
  const d = dia(dias, '2026-09-07')
  assert.equal(d.horas, 8.5)
  assert.deepEqual(d.obras, ['La Estrella', 'ARCOR Planta'])
  assert.equal(cifrasDeQuincena(dias, 9).enDosObras, 1)
})

test('LA REFERENCIA SALE DE LA JORNADA DE LA OBRA, y sin jornada NO HAY REFERENCIA', () => {
  // El defecto que atrapa: el «/ 44,0 h» del bloque anterior — un total teórico que no existe como
  // dato. Sin `obra_canonica.jornada_horas` la comparación no se dibuja.
  const dias = diasDeLaQuincena([r({ fecha: '2026-09-01', horas: 9 })], Q1, { hoy: '2026-09-02' })
  // Transcurridos y hábiles: el martes 1 y el miércoles 2. Los otros trece no llegaron.
  assert.equal(cifrasDeQuincena(dias, 9).diasHabiles, 2)
  assert.equal(cifrasDeQuincena(dias, 9).referencia, 18)
  assert.equal(cifrasDeQuincena(dias, null).referencia, null, 'sin jornada, «—»')
  assert.equal(cifrasDeQuincena(dias, 0).referencia, null, 'cero no es una jornada')
})

test('LAS CIFRAS SEPARAN AUSENCIA DE LICENCIA Y CUENTAN EL MOTIVO MÁS FRECUENTE', () => {
  const dias = diasDeLaQuincena([
    r({ fecha: '2026-09-01', horas: 8 }),
    r({ fecha: '2026-09-02', horas: 8 }),
    r({ fecha: '2026-09-03', horas: 2, tipo_hora: 'extra_50' }),
    r({ fecha: '2026-09-03', horas: 8 }),
    r({ fecha: '2026-09-04', tipo_hora: 'ausencia', horas: 8, notas: 'lluvia' }),
    r({ fecha: '2026-09-07', tipo_hora: 'ausencia', horas: 8, notas: 'lluvia' }),
    r({ fecha: '2026-09-08', tipo_hora: 'licencia', horas: 8, notas: 'vacaciones' }),
  ], Q1, { hoy: '2026-09-08' })
  const c = cifrasDeQuincena(dias, 9)
  assert.equal(c.trabajadas, 26, 'la extra suma; la ausencia no')
  assert.equal(c.diasTrabajados, 3)
  assert.equal(c.ausencias, 2)
  assert.equal(c.licencias, 1)
  assert.equal(c.extras, 2)
  assert.equal(c.motivoFrecuente, 'Lluvia · obra parada')
  assert.equal(c.sinRegistrar, 0, 'los seis días hábiles transcurridos están todos declarados')
})

test('UNA PERSONA SIN NINGÚN REGISTRO NO PUBLICA CEROS DE TRABAJO', () => {
  // El defecto que atrapa: una ficha recién abierta que se lee igual que la de alguien que faltó.
  const dias = diasDeLaQuincena([], Q1, { hoy: '2026-09-15' })
  assert.equal(dias.every((d) => d.horas === null), true, 'ningún día afirma horas')
  const c = cifrasDeQuincena(dias, 9)
  assert.equal(c.diasTrabajados, 0)
  assert.equal(c.ausencias, 0, 'no cargar no es faltar')
  assert.equal(c.motivoFrecuente, null)
  assert.equal(c.sinRegistrar, 11, 'once días hábiles sin una sola marca')
  const barras = ultimasQuincenas([], '2026-09-08')
  assert.equal(barras.length, 6)
  assert.equal(barras.every((b) => b.horas === 0 && b.obra === null), true)
})

test('LAS ÚLTIMAS SEIS QUINCENAS VAN DE LA MÁS VIEJA A LA ACTUAL, con su obra dominante', () => {
  // El defecto que atrapa: saltar de quince en quince días. Sumar 15 al 16 de febrero cae el 3 de
  // marzo y se pierde una quincena entera del historial.
  const barras = ultimasQuincenas([
    r({ fecha: '2026-08-20', horas: 8, obra_canonica_id: 'arcor', obra_nombre: 'ARCOR Planta' }),
    r({ fecha: '2026-08-21', horas: 8, obra_canonica_id: 'arcor', obra_nombre: 'ARCOR Planta' }),
    r({ fecha: '2026-08-24', horas: 4, obra_canonica_id: 'estrella', obra_nombre: 'La Estrella' }),
    r({ fecha: '2026-09-07', horas: 9 }),
    r({ fecha: '2026-09-08', tipo_hora: 'ausencia', horas: 9 }),
  ], '2026-09-08')
  assert.deepEqual(barras.map((b) => b.clave), [
    '2026-06-16', '2026-07-01', '2026-07-16', '2026-08-01', '2026-08-16', '2026-09-01',
  ])
  assert.deepEqual(barras.map((b) => b.rotulo).slice(-3), ['1ª ago', '2ª ago', '1ª sep'])
  assert.equal(barras[4].horas, 20)
  assert.equal(barras[4].obra, 'ARCOR Planta', 'la de más horas, con su nombre real')
  assert.equal(barras[4].dias, 3)
  assert.equal(barras[5].horas, 9, 'la ausencia del 8 no suma')
  assert.equal(barras[5].actual, true)
  assert.equal(barras.filter((b) => b.actual).length, 1)
})

test('EL RÓTULO CORTO DISTINGUE LAS DOS QUINCENAS DEL MISMO MES', () => {
  assert.equal(rotuloCorto(quincenaDe('2026-02-28')), '2ª feb')
  assert.equal(rotuloCorto(quincenaDe('2026-02-01')), '1ª feb')
})

// ── LA FRANJA LEE `asistencia_dia` (08/09/2026) ──────────────────────────────────────────────────
//
// Hasta hoy la ficha dibujaba SÓLO `registros_hh`. Lo que estos cuatro tests atrapan si la fuente
// deja de llegar a `combinarCeldaDia`: una ausencia declarada por el jefe se vuelve a ver como «sin
// registrar» (el gris de «nadie cargó»), un presente declarado desaparece, y —lo peor— la
// contradicción entre una ausencia declarada y las horas del mismo día se esconde.

const decl = (fecha: string, estado: 'presente' | 'ausente' | 'licencia', motivo: string | null = null) =>
  ({ fecha, estado, motivo })

test('la ausencia declarada por el jefe pinta el día aunque no haya una sola fila de horas', () => {
  const dias = diasDeLaQuincena([], Q1, {
    hoy: '2026-09-08', presencia: [decl('2026-09-07', 'ausente', 'falta')],
  })
  const d = dia(dias, '2026-09-07')
  assert.equal(d.estado, 'ausencia', 'sin la fuente enchufada esto vuelve a decir «sin_registrar»')
  assert.equal(d.presencia, 'ausente')
  assert.equal(d.conflicto, false)
  // Y cuenta como ausencia en las cifras: es lo que la ficha resume arriba.
  assert.equal(cifrasDeQuincena(dias, 8.8).ausencias, 1)
})

test('declarado presente y sin horas: no es «sin registrar»', () => {
  const dias = diasDeLaQuincena([], Q1, {
    hoy: '2026-09-08', presencia: [decl('2026-09-07', 'presente')],
  })
  const d = dia(dias, '2026-09-07')
  assert.equal(d.estado, 'presente')
  assert.equal(d.presencia, 'presente')
  // NO es una ausencia ni un día trabajado: nadie cargó horas todavía.
  assert.equal(d.horas, null)
  assert.equal(cifrasDeQuincena(dias, 8.8).ausencias, 0)
})

test('AUSENCIA DECLARADA CON HORAS EL MISMO DÍA: los dos datos se ven y ya no hay conflicto', () => {
  const dias = diasDeLaQuincena([r({ fecha: '2026-09-07', horas: 8 })], Q1, {
    hoy: '2026-09-08', presencia: [decl('2026-09-07', 'ausente', 'falta')],
  })
  const d = dia(dias, '2026-09-07')
  // Dueño, 08/09/2026 18:50: «ausencia sin motivo es cero hs» y el día no se cuenta dos veces. Con
  // horas cargadas se liquidan las horas, así que no queda nada que resolver a mano y la ficha deja
  // de marcarlo. El test anterior exigía `conflicto: true` — era la alarma que él pidió sacar.
  assert.equal(d.conflicto, false, 'volvió la alarma sobre un día que la regla ya resuelve')
  assert.equal(d.estado, 'ausencia', 'lo declarado gana sobre lo imputado')
  // LAS HORAS SE SIGUEN VIENDO: esconderlas elegiría la ausencia sin decirlo.
  assert.equal(d.horas, 8)
})

test('sin declaraciones la franja se comporta EXACTAMENTE como antes de leer `asistencia_dia`', () => {
  const filas = [
    r({ fecha: '2026-09-07', horas: 8 }),
    r({ fecha: '2026-09-08', horas: 8, tipo_hora: 'ausencia', notas: 'falta' }),
  ]
  const dias = diasDeLaQuincena(filas, Q1, { hoy: '2026-09-09' })
  assert.equal(dia(dias, '2026-09-07').estado, 'trabajado')
  // La ausencia declarada por la CARGA DE HORAS —el camino viejo, y lo único que tienen los días
  // anteriores al 08/09/2026— sigue valiendo y no se convierte en un conflicto contra sí misma.
  assert.equal(dia(dias, '2026-09-08').estado, 'ausencia')
  assert.equal(dia(dias, '2026-09-08').conflicto, false)
  assert.deepEqual(dias, diasDeLaQuincena(filas, Q1, { hoy: '2026-09-09', presencia: [] }))
})
