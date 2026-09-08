import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarJornada, asignadosPorObra, ausenciasSinJornada, avisoDeFaltantes, casillasIniciales,
  estadoDeCasilla, hs,
  leerHoras, loQueViaja, ponerLaJornada, resumenJornada, sobreLaJornada, sumarPersonasNuevas,
} from './jornadaPorObra.ts'
import type { PersonaDeLaObra, RegistroDelDia } from './jornadaPorObra.ts'

// La obra del ejemplo: jornada pactada de 8,8 hs (`obra_canonica.jornada_horas` de las nueve obras
// activas al 07/09/2026). El número entra por parámetro a propósito: si mañana una obra pacta otra,
// la pantalla la respeta sin tocar una línea.
const JORNADA = 8.8

const p = (id: string, nombre: string, nota: string | null = null): PersonaDeLaObra =>
  ({ persona_id: id, nombre, nota })
const reg = (
  persona_id: string, horas: number, tipo_hora = 'normal', id = `r-${persona_id}-${tipo_hora}`,
): RegistroDelDia => ({ id, persona_id, fecha: '2026-09-07', horas, tipo_hora, notas: null })

const PLANTEL = [p('a', 'González'), p('b', 'Molina'), p('c', 'Ríos', 'capataz')]

test('SIN MARCAR NO ES AUSENTE: la fila sin registro no cuenta como falta ni como cero', () => {
  // El defecto que atrapa: convertir el silencio en una novedad de liquidación. Si `sin_marcar`
  // cayera en `ausentes`, o si `horas` volviera 0 en vez de null, la pantalla afirmaría que Molina
  // faltó cuando lo único cierto es que nadie lo marcó.
  const filas = armarJornada({ personas: PLANTEL, registros: [reg('a', 5)], jornada: JORNADA })
  const molina = filas.find((f) => f.persona.persona_id === 'b')!
  assert.equal(molina.estado, 'sin_marcar')
  assert.equal(molina.horas, null)

  const r = resumenJornada(filas)
  assert.equal(r.ausentes, 0)
  assert.equal(r.sinMarcar, 2)
  assert.deepEqual(r.faltan, ['Molina', 'Ríos'])
})

test('LA CASILLA VIENE PUESTA CON LA JORNADA DE LA OBRA, no con un 8 hardcodeado', () => {
  const filas = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: JORNADA })
  assert.equal(filas[0].propuesta, 8.8)
  // Otra obra, otra jornada: el mismo código tiene que devolver el número de ESA obra.
  const otra = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: 4 })
  assert.equal(otra[0].propuesta, 4)
})

test('LO YA CARGADO GANA SOBRE LA PROPUESTA: González hizo 5 y la casilla dice 5', () => {
  // El defecto que atrapa: reabrir el día y ver 8,8 encima de las 5 que ya se habían corregido.
  // Guardar sin tocar nada volvería a poner la jornada completa y borraría la excepción.
  const filas = armarJornada({ personas: [p('a', 'González')], registros: [reg('a', 5)], jornada: JORNADA })
  assert.equal(filas[0].estado, 'presente')
  assert.equal(filas[0].horas, 5)
  assert.equal(filas[0].propuesta, 5)
  assert.equal(filas[0].registroId, 'r-a-normal')
})

test('UNA AUSENCIA TIENE HORAS Y NO ES TRABAJO: no suma al total del día', () => {
  // `registros_hh` exige horas > 0, así que el ausente se guarda con las horas de la jornada y
  // tipo_hora='ausencia'. Si el total las sumara, un día con un ausente y siete presentes daría más
  // horas de las que se trabajaron — y eso viaja al costo de la obra.
  const filas = armarJornada({
    personas: PLANTEL,
    registros: [reg('a', 8.8), reg('b', 8.8, 'ausencia'), reg('c', 8.8)],
    jornada: JORNADA,
  })
  const molina = filas.find((f) => f.persona.persona_id === 'b')!
  assert.equal(molina.estado, 'ausente')
  assert.equal(molina.horas, 0)

  const r = resumenJornada(filas)
  assert.equal(r.presentes, 2)
  assert.equal(r.ausentes, 1)
  assert.equal(r.horas, 17.6, 'las 8,8 del ausente no pueden entrar en el total')
})

test('EL AUSENTE GANA SOBRE UNA IMPUTACIÓN VIEJA DEL MISMO DÍA', () => {
  // El defecto que atrapa: alguien cargó horas, después se declaró la ausencia, y la pantalla sigue
  // mostrando «presente» porque encontró primero la fila de horas.
  const filas = armarJornada({
    personas: [p('a', 'González')],
    registros: [reg('a', 8.8), reg('a', 8.8, 'ausencia')],
    jornada: JORNADA,
  })
  assert.equal(filas[0].estado, 'ausente')
  assert.equal(resumenJornada(filas).horas, 0)
})

test('CON DOS FILAS TRABAJADAS EL DÍA NO TIENE UN REGISTRO QUE CORREGIR', () => {
  // Normales + extras cargadas aparte suman 10,8. Devolver el id de la primera haría que corregir a
  // 9 dejara la fila de extras en pie: el día terminaría con 11 horas en vez de 9.
  const filas = armarJornada({
    personas: [p('a', 'González')],
    registros: [reg('a', 8.8), reg('a', 2, 'extra_50')],
    jornada: JORNADA,
  })
  assert.equal(filas[0].horas, 10.8)
  assert.equal(filas[0].registroId, null)
})

test('EL PIE RECLAMA POR NOMBRE cuando falta uno solo, y por cantidad cuando son varios', () => {
  assert.equal(avisoDeFaltantes([]), null)
  assert.equal(avisoDeFaltantes(['Molina']), 'Falta marcar a Molina')
  assert.equal(avisoDeFaltantes(['Molina', 'Ríos']), 'Falta marcar a Molina y Ríos')
  assert.equal(avisoDeFaltantes(['Molina', 'Ríos', 'Paz']), 'Faltan marcar 3 personas')
})

test('CERO TIPEADO NO ES UNA MARCA: se rechaza y manda a la A', () => {
  // El defecto que atrapa: un 0 en la casilla entraría a `registros_hh` contra el CHECK horas > 0 y
  // volvería un error de Postgres sin sentido para el jefe; o peor, se guardaría como ausencia sin
  // que nadie lo haya decidido.
  assert.equal(leerHoras('0').horas, null)
  assert.match(leerHoras('0').error!, /tocá la A/)
  assert.equal(leerHoras('').horas, null)
  assert.equal(leerHoras('').error, null, 'en blanco es dejar sin marcar, no un error')
  assert.equal(leerHoras('5').horas, 5)
  assert.equal(leerHoras('8,8').horas, 8.8, 'la coma del teclado en español es un decimal')
  assert.equal(leerHoras('-1').horas, null)
  assert.equal(leerHoras('25').horas, null)
  assert.equal(leerHoras('nueve').horas, null)
})

test('LO QUE SOBRA DE LA JORNADA SE CALCULA, NO SE DECLARA COMO RECARGO', () => {
  assert.equal(sobreLaJornada(10.8, 8.8), 2)
  assert.equal(sobreLaJornada(5, 8.8), 0)
  // El error binario no puede llegar a la pantalla: 10,8 − 8,8 en punto flotante da 1,9999999999999996.
  assert.equal(sobreLaJornada(11.8, 8.8), 3)
})

test('LAS HORAS SE MUESTRAN EN EL LOCALE DEL LUGAR: 8,8 y no 8.8', () => {
  // El defecto que atrapa: mostrar «8.8» en la casilla. El teclado del teléfono en español escribe
  // coma, así que quien corrige tipearía «8,5» sobre un «8.8» — dos separadores conviviendo en el
  // mismo campo. Lo que se muestra tiene que ser exactamente lo que se puede volver a tipear.
  assert.equal(hs(8.8), '8,8')
  assert.equal(hs(79.2), '79,2')
  assert.equal(hs(8), '8')
  assert.equal(leerHoras(hs(8.8)).horas, 8.8, 'lo que se muestra se vuelve a leer sin perder nada')
})

// ── LAS CASILLAS DE `/campo/asistencia` ────────────────────────────────────────────────────────
//
// EL DEFECTO QUE COSTÓ UN REVERT (07/09/2026). La primera versión hacía nacer la casilla con la
// jornada puesta como VALOR: `sin_marcar` era inalcanzable, toda fila nacía «presente» y un solo
// toque en Guardar escribió 77,4 HH de nueve personas en una obra viva. Estas pruebas son el
// control que aquel comentario no era.

test('LA CASILLA DE UNA FILA SIN REGISTRO NACE VACÍA, no con la jornada', () => {
  const filas = armarJornada({ personas: PLANTEL, registros: [], jornada: JORNADA })
  const casillas = casillasIniciales(filas)
  for (const p of PLANTEL) {
    assert.equal(casillas[p.persona_id].texto, '',
      'precargar la jornada convierte el silencio de todo el plantel en una afirmación')
    assert.equal(casillas[p.persona_id].ausente, false)
  }
})

test('SIN_MARCAR ES ALCANZABLE: una casilla vacía NO es «presente»', () => {
  // El defecto exacto del revert: si `estadoDeCasilla` devolviera 'presente' para una casilla
  // vacía, el pie diría «3 presentes · 0 hs» y el envío llevaría a tres personas que nadie marcó.
  const v = estadoDeCasilla('a', { texto: '', ausente: false })
  assert.equal(v.estado, 'sin_marcar')
  assert.equal(v.horas, null)
  assert.equal(v.error, null)
})

test('UNA CASILLA SIN MARCAR NO VIAJA AL SERVIDOR', () => {
  // La prueba del efecto: aunque alguien toque Guardar con el plantel entero sin marcar, el envío
  // sale VACÍO. Ésta es la que se pone roja si vuelve el default.
  const filas = armarJornada({ personas: PLANTEL, registros: [], jornada: JORNADA })
  const vista = PLANTEL.map((p) => estadoDeCasilla(p.persona_id, casillasIniciales(filas)[p.persona_id]))
  assert.deepEqual(loQueViaja(vista, JORNADA), [], 'guardar sin marcar nada no puede escribir nada')
  assert.equal(resumenJornada(filas).sinMarcar, 3)
})

test('SÓLO VIAJA LO CONFIRMADO: un número escrito o una A tocada', () => {
  const vista = [
    estadoDeCasilla('a', { texto: '5', ausente: false }),
    estadoDeCasilla('b', { texto: '', ausente: false }),
    estadoDeCasilla('c', { texto: '', ausente: true }),
  ]
  assert.deepEqual(loQueViaja(vista, JORNADA), [
    { persona_id: 'a', estado: 'presente', horas: 5 },
    // EL MOTIVO VIAJA CON LA AUSENCIA. `null` = todavía no se declaró, que es un estado legítimo:
    // marcar que alguien no vino sin saber por qué es honesto.
    { persona_id: 'c', estado: 'ausente', horas: 8.8, motivo: null },
  ])
})

test('UNA CASILLA CON UN VALOR IMPOSIBLE NO VIAJA', () => {
  // El defecto que atrapa: mandar «25» o «cero» y que la base lo rechace con un error de CHECK que
  // no le dice nada al jefe. O peor, que entre un 0 que la ausencia sí acepta.
  const vista = [
    estadoDeCasilla('a', { texto: '25', ausente: false }),
    estadoDeCasilla('b', { texto: '0', ausente: false }),
    estadoDeCasilla('c', { texto: '8', ausente: false }),
  ]
  assert.deepEqual(loQueViaja(vista, JORNADA), [{ persona_id: 'c', estado: 'presente', horas: 8 }])
})

test('«PONER LA JORNADA» LLENA LAS VACÍAS Y NO PISA LO ESCRITO', () => {
  // El defecto que atrapa: que el botón general borre la corrección de González. Abrir, corregir a
  // 5, tocar «poner la jornada» para el resto, y encontrarse a González con 8,8 otra vez.
  const antes = {
    a: { texto: '5', ausente: false },
    b: { texto: '', ausente: false },
    c: { texto: '', ausente: true },
  }
  const despues = ponerLaJornada(antes, JORNADA)
  assert.equal(despues.a.texto, '5', 'lo corregido no se pisa')
  assert.equal(despues.b.texto, '8,8')
  assert.equal(despues.c.texto, '', 'al ausente no se le pone jornada')
  assert.equal(despues.c.ausente, true)
})

test('SIN JORNADA PACTADA NO SE PONE NADA, y la ausencia se NOMBRA en vez de descartarse', () => {
  // El defecto que atrapa: marcar «no vino» en una obra sin jornada, que la marca se caiga del
  // envío y que la pantalla acuse éxito. El jefe cree que quedó registrado y no quedó nada.
  const casillas = { a: { texto: '', ausente: true } }
  assert.deepEqual(ponerLaJornada(casillas, 0), casillas)
  const vista = [estadoDeCasilla('a', casillas.a)]
  assert.deepEqual(loQueViaja(vista, 0), [])
  assert.deepEqual(ausenciasSinJornada(vista, 0), ['a'])
  assert.deepEqual(ausenciasSinJornada(vista, 8.8), [])
})

test('REABRIR MUESTRA LO CARGADO: la casilla trae las 5, no la jornada ni un vacío', () => {
  const filas = armarJornada({ personas: PLANTEL, registros: [reg('a', 5)], jornada: JORNADA })
  const casillas = casillasIniciales(filas)
  assert.equal(casillas['a'].texto, '5')
  assert.equal(casillas['b'].texto, '', 'a quien no tiene nada cargado no se le inventa un número')
})

test('REABRIR A UN AUSENTE LO MUESTRA AUSENTE, con la casilla vacía', () => {
  const filas = armarJornada({
    personas: PLANTEL, registros: [reg('a', 8.8, 'ausencia')], jornada: JORNADA,
  })
  const casillas = casillasIniciales(filas)
  // El motivo cargado vuelve con la casilla: reabrir un parte médico tiene que mostrar el parte
  // médico, no un desplegable en blanco que invite a elegir otra cosa.
  assert.deepEqual(casillas['a'], { texto: '', ausente: true, motivo: null })
  assert.equal(estadoDeCasilla('a', casillas['a']).estado, 'ausente')
})

test('EL MOTIVO DEL AUSENTE VIAJA, y sin motivo también se puede guardar', () => {
  // El pedido del dueño: «parte médico, etc». Y su contracara: NO se exige. Obligar a elegir la
  // causa para poder guardar hace que se elija cualquiera con tal de cerrar el formulario, y una
  // causa inventada es peor que ninguna.
  const conMotivo = [estadoDeCasilla('a', { texto: '', ausente: true, motivo: 'enfermedad' })]
  assert.deepEqual(loQueViaja(conMotivo, JORNADA), [
    { persona_id: 'a', estado: 'ausente', horas: 8.8, motivo: 'enfermedad' },
  ])
  const sinMotivo = [estadoDeCasilla('a', { texto: '', ausente: true })]
  assert.deepEqual(loQueViaja(sinMotivo, JORNADA), [
    { persona_id: 'a', estado: 'ausente', horas: 8.8, motivo: null },
  ])
})

// ═══ TRAER A ALGUIEN A LA OBRA SIN RECARGAR LA PANTALLA (08/09/2026) ═══
//
// EL DEFECTO QUE ATRAPA: el recién llegado se dibuja —`estadoDeCasilla(id, undefined)` lo muestra
// vacío, que es lo correcto— y «poner la jornada a los que faltan» lo SALTEA, porque ese botón
// recorre `Object.entries(casillas)` y no las filas. Sin este puente, el único al que hay que
// tipearle las horas a mano es justamente el que se acaba de traer, y nada da rojo.

test('EL QUE LLEGA DESPUÉS TIENE CASILLA, y le alcanza «poner la jornada»', () => {
  const antes = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: JORNADA })
  const conTipeado = { ...casillasIniciales(antes), a: { texto: '5', ausente: false } }

  const despues = armarJornada({
    personas: [p('a', 'González'), p('d', 'Nuevo')], registros: [], jornada: JORNADA,
  })
  const casillas = sumarPersonasNuevas(conTipeado, despues)

  assert.deepEqual(Object.keys(casillas).sort(), ['a', 'd'])
  assert.equal(casillas.a.texto, '5', 'lo ya tipeado no se pisa al traer a un compañero')
  assert.equal(casillas.d.texto, '', 'el recién llegado nace VACÍO, como todos')
  // Y AHORA SÍ LO ALCANZA EL BOTÓN GENERAL, que es lo que sin la casilla no pasaba.
  assert.equal(ponerLaJornada(casillas, JORNADA).d.texto, hs(JORNADA))
})

test('EL QUE SE FUE DE LA CUADRILLA PIERDE SU CASILLA: no puede viajar en el guardado', () => {
  const antes = armarJornada({
    personas: [p('a', 'González'), p('b', 'Molina')], registros: [], jornada: JORNADA,
  })
  const conTipeado = { ...casillasIniciales(antes), b: { texto: '8', ausente: false } }
  const despues = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: JORNADA })
  assert.deepEqual(Object.keys(sumarPersonasNuevas(conTipeado, despues)), ['a'])
})

// ── EL CONTEO DE LA LISTA DE OBRAS ───────────────────────────────────────────────────────────────
//
// Defecto visto en producción el 08/09/2026: «SF - PISOS INDUSTRIALES · 8 personas» y seis filas al
// abrir. El conteo sumaba FILAS de `obra_asignacion`; el roster de la pantalla deduplica por
// persona. Un número que promete dos personas que no existen manda a buscar gente que no falta.

const asg = (persona_id: string, obra_id: string, desde: string | null = null, hasta: string | null = null) =>
  ({ persona_id, obra_id, desde, hasta })

const nadieEsJefe = () => false

test('la misma persona con DOS asignaciones vigentes cuenta UNA vez', () => {
  // El traspaso normal de un frente a otro: una asignación cierra el 07 y otra abre el 08.
  const cuenta = asignadosPorObra([
    asg('ochoa', 'sf', '2026-08-01', '2026-09-08'),
    asg('ochoa', 'sf', '2026-09-08', null),
    asg('quiroga', 'sf', null, null),
  ], '2026-09-08', nadieEsJefe)
  assert.equal(cuenta.get('sf'), 2, 'el conteo volvió a sumar filas en vez de personas')
})

test('el conteo NO incluye a los jefes: son los que no se marcan a sí mismos', () => {
  const cuenta = asignadosPorObra(
    [asg('nievas', 'sf'), asg('acosta', 'sf')], '2026-09-08', (id) => id === 'nievas',
  )
  assert.equal(cuenta.get('sf'), 1)
})

test('la asignación que no está vigente ese día no cuenta, y la obra sin gente no aparece', () => {
  const cuenta = asignadosPorObra([
    asg('ochoa', 'sf', null, '2026-09-07'),
    asg('sinObra', null as unknown as string, null, null),
  ], '2026-09-08', nadieEsJefe)
  assert.equal(cuenta.has('sf'), false, 'una asignación cerrada ayer no pone a nadie en la obra de hoy')
  assert.equal(cuenta.size, 0)
})
