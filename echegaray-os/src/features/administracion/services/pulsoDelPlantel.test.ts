// LAS PRUEBAS DEL PULSO — cada una revienta si se vuelve al defecto que arregló.
//
// Las tres primeras son la misma prueba escrita tres veces: EL SILENCIO NO ES 0. Si alguien cambia
// `Map` por un `Record` con default 0 —que es la forma natural de escribir esto— las tres se ponen
// rojas de golpe, que es exactamente lo que tienen que hacer.

import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClasificacionDelDia } from './asistenciaDelDia.ts'
import {
  SIN_MARCAR, asistenciaHoyPorPersona, estadoHoy, hayControlDeVencimientos, hayMarcaDeHoy,
  hhPorPersona, horasVisibles, marcasPorPersona, mesCorriente, papelesPorPersona, rotuloDePapeles,
  rotuloHoy,
} from './pulsoDelPlantel.ts'

const HOY = '2026-08-24'

// ── HOY ─────────────────────────────────────────────────────────────────────────────────────────

test('sin marca es «sin fichar», y NUNCA «ausente»', () => {
  assert.equal(estadoHoy(undefined), 'sin_fichar')
  // El vocabulario entero: si mañana aparece un cuarto estado con la palabra «ausente», esto cae.
  assert.ok(!['ausente', 'falta'].includes(estadoHoy(undefined)))
})

test('los estados de la vista se traducen sin inventar ninguno', () => {
  assert.equal(estadoHoy({ persona_id: 'a', estado: 'activo' }), 'en_obra')
  assert.equal(estadoHoy({ persona_id: 'a', estado: 'cerrada' }), 'ya_cerro')
  assert.equal(estadoHoy({ persona_id: 'a', estado: 'falta_salida' }), 'en_obra')
  // Una marca sin entrada —una incidencia suelta— no es una jornada: se lee igual que no fichar.
  assert.equal(estadoHoy({ persona_id: 'a', estado: 'sin_registrar' }), 'sin_fichar')
  // Un estado que la vista todavía no publica no se adivina: se lee como ausencia de fichada.
  assert.equal(estadoHoy({ persona_id: 'a', estado: 'inventado' }), 'sin_fichar')
})

test('dos marcas de la misma persona: gana la jornada abierta', () => {
  // Cerró en una obra y sigue abierto en otra: está EN OBRA. Sin esta regla, el orden en que
  // PostgREST devuelva las filas decidiría si la persona figura trabajando o no.
  const m = marcasPorPersona([
    { persona_id: 'a', estado: 'cerrada' },
    { persona_id: 'a', estado: 'activo' },
  ])
  assert.equal(estadoHoy(m.get('a')), 'en_obra')
  const alReves = marcasPorPersona([
    { persona_id: 'a', estado: 'activo' },
    { persona_id: 'a', estado: 'cerrada' },
  ])
  assert.equal(estadoHoy(alReves.get('a')), 'en_obra')
})

// ── HOY · LA ASISTENCIA DEL DÍA ─────────────────────────────────────────────────────────────────
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// La columna HOY del Plantel decía «● sin fichar» en las diecisiete filas, en ámbar, porque leía
// SÓLO `asistencia_marca` —una capacidad con cuatro marcas de prueba en toda su historia—. Si
// alguien vuelve a hacer que la celda hable de fichaje, o inventa un segundo `if` que decida qué es
// una ausencia, estas pruebas se ponen rojas.

test('sin nada declarado la celda dice «sin marcar»: nunca «sin fichar» ni «ausente»', () => {
  const r = rotuloHoy(SIN_MARCAR)
  assert.equal(r.texto, 'sin marcar')
  assert.equal(r.simbolo, '', 'el silencio no lleva símbolo de estado')
  assert.equal(r.tono, 'silencio')
  assert.equal(r.horas, null, 'sin marcar no es cero horas')
  assert.doesNotMatch(r.texto, /fich|ausen|falt|cargar/i)
})

test('el vocabulario ENTERO de la celda: ningún estado nombra el fichaje ni acusa una falta', () => {
  // El barrido es la prueba: alcanza con que UN estado vuelva a decir «no fichó» para que caiga.
  const casos: ClasificacionDelDia[] = [
    SIN_MARCAR,
    { presencia: 'sin_marcar', fuente: null, horas: 9, motivo: null },
    { presencia: 'presente', fuente: 'declarada', horas: null, motivo: null },
    { presencia: 'ausente', fuente: 'declarada', horas: null, motivo: null },
    { presencia: 'licencia', fuente: 'hh', horas: null, motivo: null },
  ]
  for (const c of casos) {
    const r = rotuloHoy(c)
    assert.doesNotMatch(r.texto, /fich/i, `«${r.texto}» habla de fichaje`)
    // LA PALABRA DEL ESTADO NUNCA ES UN NÚMERO. Es el defecto entero: la cantidad no puede volver
    // a ocupar el lugar del hecho.
    assert.doesNotMatch(r.texto, /\d/, `«${r.texto}» pone una cantidad donde va el estado`)
  }
})

test('9 h sin nadie que lo haya declarado: «sin marcar» arriba y «9 h» al lado, en dos capas', () => {
  // EL DEFECTO QUE ATRAPA, y es el que reportó el dueño por tercera vez: la celda decía «9 h» y
  // nada más, así que la cantidad hacía de estado y la columna daba por presente a quien nadie
  // había mirado.
  const r = rotuloHoy({ presencia: 'sin_marcar', fuente: null, horas: 9, motivo: null })
  assert.equal(r.texto, 'sin marcar')
  assert.equal(r.tono, 'silencio')
  assert.equal(r.horas, '9 h', 'la cantidad tiene su propia capa y no desaparece')
  assert.equal(rotuloHoy({ presencia: 'sin_marcar', fuente: null, horas: 7.5, motivo: null }).horas, '7,5 h')
})

test('presente declarado sin horas: estado presente y NINGUNA cantidad inventada', () => {
  const r = rotuloHoy({ presencia: 'presente', fuente: 'declarada', horas: null, motivo: null })
  assert.equal(r.texto, 'presente')
  assert.equal(r.simbolo, '●')
  assert.equal(r.tono, 'pos')
  assert.equal(r.horas, null, 'un presente sin horas no lleva un 0: nadie cargó nada')
})

test('la ausencia y la licencia llevan su símbolo y su motivo, y se distinguen entre sí', () => {
  const a = rotuloHoy({ presencia: 'ausente', fuente: 'declarada', horas: null, motivo: 'Gripe' })
  assert.deepEqual([a.simbolo, a.tono, a.texto], ['A', 'neg', 'gripe'])
  const l = rotuloHoy({ presencia: 'licencia', fuente: 'hh', horas: null, motivo: 'Vacaciones' })
  assert.deepEqual([l.simbolo, l.tono, l.texto], ['L', 'neutro', 'vacaciones'])
  // Sin motivo declarado se escribe la palabra del estado, no un hueco al lado de la letra.
  assert.equal(rotuloHoy({ presencia: 'ausente', fuente: 'declarada', horas: null, motivo: null }).texto, 'ausente')
})

test('la asistencia de hoy sale de las filas de HOY, no de las del mes', () => {
  const m = asistenciaHoyPorPersona([
    { persona_id: 'a', fecha: HOY, horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: HOY, horas: 1, tipo_hora: 'extra_50' },
    { persona_id: 'b', fecha: '2026-08-10', horas: 8, tipo_hora: 'normal' },
    { persona_id: null, fecha: HOY, horas: 8, tipo_hora: 'normal' },
  ], HOY)
  // NUEVE HORAS Y NADIE QUE LO HAYA DECLARADO SIGUE SIENDO «SIN MARCAR». La cantidad está, el
  // estado no: son dos hechos y el segundo no existe todavía.
  assert.deepEqual(m.get('a'), { presencia: 'sin_marcar', fuente: null, horas: 9, motivo: null })
  // «b» cargó el 10 y hoy no: quien no está en el Map es SIN_MARCAR, no «ausente».
  assert.equal(m.has('b'), false)
  assert.equal(m.size, 1, 'las filas legacy sin persona_id no le inventan un día a nadie')
})

test('lo declarado gana: una ausencia de hoy no se lee como jornada por una imputación suelta', () => {
  const m = asistenciaHoyPorPersona([
    { persona_id: 'a', fecha: HOY, horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: HOY, horas: 8, tipo_hora: 'ausencia', notas: 'Falta con aviso' },
  ], HOY)
  // La regla es la de `clasificar()` y se REUSA: si acá apareciera una segunda copia del `if`, el
  // día que cambie la de `asistenciaDelDia.ts` esta pantalla se quedaría con la vieja.
  // LAS 8 H IMPUTADAS SE SIGUEN VIENDO al lado de la ausencia: son el otro hecho, y existen en
  // `registros_hh`. Esconderlas resolvería la contradicción a favor de la ausencia sin decirlo, y
  // una de las dos afirmaciones se liquida.
  assert.deepEqual(m.get('a'), { presencia: 'ausente', fuente: 'hh', horas: 8, motivo: 'Falta con aviso' })
})

// ── LA COLUMNA HOY LEE `asistencia_dia` (08/09/2026) ────────────────────────────────────────────
//
// Sin la fuente enchufada la columna decía «sin cargar» de todo el que no tuviera horas, incluido
// el que el jefe acababa de marcar presente. Estos tres tests caen si la presencia declarada deja
// de llegar a `clasificar` o si el declarado sin horas vuelve a quedarse fuera del Map.

test('declarado presente y sin horas: la columna dice «presente», no «sin marcar»', () => {
  const m = asistenciaHoyPorPersona([], HOY, [{ persona_id: 'a', estado: 'presente', motivo: null }])
  assert.deepEqual(m.get('a'), { presencia: 'presente', fuente: 'declarada', horas: null, motivo: null })
  assert.equal(rotuloHoy(m.get('a')!).texto, 'presente')
  assert.equal(rotuloHoy(m.get('a')!).horas, null)
  assert.notDeepEqual(m.get('a'), SIN_MARCAR, 'la declaración del jefe se perdió en silencio')
})

test('la ausencia declarada por el jefe gana sobre las horas cargadas, y las horas se ven', () => {
  const m = asistenciaHoyPorPersona(
    [{ persona_id: 'a', fecha: HOY, horas: 8, tipo_hora: 'normal' }],
    HOY, [{ persona_id: 'a', estado: 'ausente', motivo: 'falta' }],
  )
  const c = m.get('a')!
  assert.equal(c.presencia, 'ausente')
  // LAS HORAS SE SIGUEN VIENDO: esconderlas elegiría una de las dos afirmaciones.
  assert.equal(c.horas, 8)
  // Y YA NO HAY CONFLICTO QUE MARCAR (dueño, 08/09/2026 18:50): la liquidación se queda con las
  // horas cargadas y la ausencia de ese día vale 0. La columna deja de pintar de rojo un día que
  // nadie tiene que resolver.
  assert.equal(c.conflicto ?? false, false)
})

test('sin presencia declarada la columna se comporta exactamente como antes', () => {
  const filas = [{ persona_id: 'a', fecha: HOY, horas: 8, tipo_hora: 'normal' }]
  assert.deepEqual(asistenciaHoyPorPersona(filas, HOY, []), asistenciaHoyPorPersona(filas, HOY))
})

test('el ● de presencia sólo lo prende una marca REAL', () => {
  assert.equal(hayMarcaDeHoy(undefined), false)
  assert.equal(hayMarcaDeHoy({ persona_id: 'a', estado: 'sin_registrar' }), false)
  assert.equal(hayMarcaDeHoy({ persona_id: 'a', estado: 'activo' }), true)
  assert.equal(hayMarcaDeHoy({ persona_id: 'a', estado: 'cerrada' }), true)
})

// ── HH DEL MES ──────────────────────────────────────────────────────────────────────────────────

test('la persona sin imputaciones NO aparece en el Map: «sin HH» no es 0', () => {
  const hh = hhPorPersona(
    [{ persona_id: 'a', fecha: '2026-08-10', horas: 8, tipo_hora: 'normal' }],
    '2026-08-01', HOY,
  )
  assert.equal(hh.has('a'), true)
  assert.equal(hh.has('b'), false)
  assert.equal(hh.get('b'), undefined)
})

test('una ausencia tiene horas y no es trabajo', () => {
  const hh = hhPorPersona([
    { persona_id: 'a', fecha: '2026-08-10', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-08-11', horas: 8, tipo_hora: 'ausencia' },
    { persona_id: 'a', fecha: '2026-08-12', horas: 8, tipo_hora: 'licencia' },
    { persona_id: 'a', fecha: '2026-08-13', horas: 2, tipo_hora: 'extra_50' },
  ], '2026-08-01', HOY)
  assert.equal(hh.get('a'), 10)
})

test('las filas legacy sin persona_id no se le atribuyen a nadie', () => {
  // 19 filas del Sheet de JORNALES vienen con el trabajador en texto libre. Si se colaran, se
  // sumarían todas juntas bajo una clave inventada y alguien tendría 671 horas que no son suyas.
  const hh = hhPorPersona([
    { persona_id: null, fecha: '2026-08-10', horas: 671, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-08-10', horas: 8, tipo_hora: 'normal' },
  ], '2026-08-01', HOY)
  assert.deepEqual([...hh.entries()], [['a', 8]])
})

test('la ventana del mes se cierra HOY, no a fin de mes', () => {
  assert.deepEqual(mesCorriente('2026-08-24'), { desde: '2026-08-01', hasta: '2026-08-24' })
  // Una imputación cargada por adelantado no cuenta como trabajada todavía.
  const hh = hhPorPersona([
    { persona_id: 'a', fecha: '2026-08-31', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-07-31', horas: 8, tipo_hora: 'normal' },
  ], '2026-08-01', HOY)
  assert.equal(hh.has('a'), false)
})

test('las horas se escriben en es-AR', () => {
  assert.equal(horasVisibles(7.5), '7,5')
  assert.equal(horasVisibles(160), '160')
})

// ── PAPELES ─────────────────────────────────────────────────────────────────────────────────────

test('847 papeles sin un solo vencimiento cargado NO son un control de vencimientos', () => {
  // ES EL ESTADO REAL DE LA BASE (sonda 24/08/2026): 847 filas, 0 con `fecha_vencimiento`, 0 con
  // `presente = false`. Si esto devolviera true, la primera línea de Personal publicaría una señal
  // de «papeles vencidos» calculada sobre un control que nadie está haciendo. Que la COLUMNA exista
  // en la base no prueba que el control exista: eso lo prueba el dato.
  const comoEstaHoy = Array.from({ length: 847 }, (_, i) => ({
    persona_id: `p${i % 62}`, presente: true, fecha_vencimiento: null,
  }))
  assert.equal(hayControlDeVencimientos(comoEstaHoy), false)
  assert.equal(hayControlDeVencimientos([]), false)

  // Un solo vencimiento cargado ya enciende la señal: no hace falta tocar código.
  assert.equal(hayControlDeVencimientos(
    [...comoEstaHoy, { persona_id: 'p0', presente: true, fecha_vencimiento: '2027-01-01' }]), true)
  // Y un papel que Administración declaró ausente también: es una afirmación de alguien.
  assert.equal(hayControlDeVencimientos(
    [...comoEstaHoy, { persona_id: 'p0', presente: false, fecha_vencimiento: null }]), true)
})

test('un vencimiento nulo es «no vence», no «vencido»', () => {
  // El DNI no vence. Derivarlo sumándole un plazo a la emisión fabricaría un vencimiento con cara
  // de dato real, y esta persona aparecería en rojo todos los días.
  const p = papelesPorPersona([
    { persona_id: 'a', presente: true, fecha_vencimiento: null },
  ], HOY)
  assert.deepEqual(p.get('a'), { vencidos: 0, porVencer: 0, faltan: 0, total: 1 })
})

test('vencido, por vencer y faltante se cuentan por separado', () => {
  const p = papelesPorPersona([
    { persona_id: 'a', presente: true, fecha_vencimiento: '2026-08-23' },  // ayer
    { persona_id: 'a', presente: true, fecha_vencimiento: '2026-09-10' },  // dentro de 30 días
    { persona_id: 'a', presente: true, fecha_vencimiento: '2027-01-01' },  // lejos
    { persona_id: 'a', presente: false, fecha_vencimiento: null },         // Administración: no está
  ], HOY)
  assert.deepEqual(p.get('a'), { vencidos: 1, porVencer: 1, faltan: 1, total: 4 })
})

// ═══ LOS BANNERS Y LA BANDA SE FUERON CON EL PORTE 19 v2 ═══
//
// Lo que probaban —que cada aviso cuente lo que dice su rótulo, que una fuente sin leer no publique
// un conteo, y que la cifra no se duplique en el texto— lo prueba ahora
// `senalesPersonal.test.ts` sobre `senalesDePersonal`, que devuelve la cifra y el rótulo POR
// SEPARADO. La mitad de aquellas pruebas existía para vigilar que `partirCifra` volviera a partir
// una frase que `alertasDelPlantel` acababa de armar; ese ida y vuelta ya no existe.


// ── LA CELDA PAPELES (handoff CRM / Administración v4) ──────────────────────────────────────────
//
// La columna volvió a la fila cuando la banda de señales se retiró. Volvió DICIENDO OTRA COSA, y
// estas pruebas son la diferencia entre las dos versiones: la de agosto certificaba, ésta cuenta.

const SIN_CONTROL = { leidos: true, controlDeVencimientos: false }
const CON_CONTROL = { leidos: true, controlDeVencimientos: true }
const VACIO = { vencidos: 0, porVencer: 0, faltan: 0, total: 0 }

test('no se pudo leer la tabla: dice «sin lectura», nunca «sin cargar»', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Si la celda dedujera el estado del mapa —«no está en el mapa ⇒ no tiene papeles»—, un error de
  // RLS escribiría «sin cargar» en las 62 filas de un plantel con 847 papeles cargados. Un control
  // que no pudo mirar no dice «no está». Por eso `leidos` es un parámetro y no una deducción.
  assert.deepEqual(
    rotuloDePapeles(undefined, { leidos: false, controlDeVencimientos: false }),
    { texto: 'sin lectura', tono: 'sin_lectura' },
  )
  // Y no se salva ni cuando la persona SÍ tiene papeles leídos de otra corrida.
  assert.equal(
    rotuloDePapeles({ ...VACIO, total: 6 }, { leidos: false, controlDeVencimientos: false }).texto,
    'sin lectura',
  )
})

test('sin vencimientos cargados la celda NUNCA dice «al día»: cuenta', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Es el que retiró la columna en agosto. `documentacion_legajo` tiene 847 filas y CERO con
  // `fecha_vencimiento`: con `controlDeVencimientos: false` la celda no puede afirmar vigencia
  // ninguna. Si alguien vuelve a escribir «al día», «vigente» o «ok», esto se pone rojo.
  const r = rotuloDePapeles({ ...VACIO, total: 6 }, SIN_CONTROL)
  assert.deepEqual(r, { texto: '6 cargados', tono: 'dato' })
  assert.doesNotMatch(r.texto, /al día|vigente|ok/i)
})

test('cero papeles es «sin cargar», nunca «0 cargados»', () => {
  assert.deepEqual(rotuloDePapeles(VACIO, SIN_CONTROL), { texto: 'sin cargar', tono: 'falta' })
  assert.deepEqual(rotuloDePapeles(undefined, SIN_CONTROL), { texto: 'sin cargar', tono: 'falta' })
})

test('un papel es «1 cargado»: el plural delata que nadie miró la celda', () => {
  assert.equal(rotuloDePapeles({ ...VACIO, total: 1 }, SIN_CONTROL).texto, '1 cargado')
})

test('un papel que Administración marcó AUSENTE no se cuenta como cargado', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `total` cuenta las filas de `documentacion_legajo`, y una fila con `presente = false` existe
  // justamente para decir que el papel NO está. Medido el 05/09/2026 sobre la base real hay 3.
  // Contarlas haría que la celda dijera «6 cargados» de un legajo que tiene 4 papeles y dos huecos
  // que la propia Administración declaró — la misma mentira que «al día», en chiquito.
  const r = rotuloDePapeles({ vencidos: 0, porVencer: 0, faltan: 2, total: 6 }, SIN_CONTROL)
  assert.deepEqual(r, { texto: '4 cargados', tono: 'dato' })
})

test('un legajo donde TODO se declaró ausente dice «sin cargar», no un número negativo', () => {
  assert.deepEqual(
    rotuloDePapeles({ vencidos: 0, porVencer: 0, faltan: 3, total: 3 }, SIN_CONTROL),
    { texto: 'sin cargar', tono: 'falta' },
  )
})

test('un vencido gana sobre el conteo y BLOQUEA: con la libreta vencida no se entra a la obra', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La señal «personas con papeles vencidos» vivía en la banda que se retiró y contaba sin poder
  // decir QUIÉN. Al bajar a la fila no puede quedar escondida detrás del conteo: «9 cargados» sobre
  // alguien con la libreta vencida es peor que no tener la columna.
  const r = rotuloDePapeles({ vencidos: 2, porVencer: 1, faltan: 0, total: 9 }, CON_CONTROL)
  assert.deepEqual(r, { texto: '2 vencidos', tono: 'bloquea' })
  assert.equal(rotuloDePapeles({ ...VACIO, vencidos: 1, total: 3 }, CON_CONTROL).texto, '1 vencido')
})

test('el vencido NO se dibuja mientras el control de vencimientos no exista', () => {
  // Sin una sola fecha cargada en toda la tabla, `hayControlDeVencimientos` es false y un `vencidos`
  // suelto sería ruido de un dato a medio migrar. La celda cuenta y calla.
  assert.equal(
    rotuloDePapeles({ vencidos: 2, porVencer: 0, faltan: 0, total: 9 }, SIN_CONTROL).texto,
    '9 cargados',
  )
})
