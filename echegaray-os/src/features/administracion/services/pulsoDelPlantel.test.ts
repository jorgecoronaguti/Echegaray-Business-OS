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
  hhPorPersona, horasVisibles, marcasPorPersona, ofertaDeMarcar, papelesPorPersona,
  personasConTardanza, pieDeTardanzas, quincenaCorriente, rotuloDePapeles, rotuloHoy, tardanzasDeHoy,
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

// ── HH DE LA QUINCENA ───────────────────────────────────────────────────────────────────────────

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

test('la ventana es la QUINCENA en curso y se cierra HOY (dueño, 16/09/2026)', () => {
  // LOS BORDES SON EL DEFECTO POSIBLE: el 15 todavía es la primera quincena, el 16 ya es la segunda,
  // y la segunda termina el último día del mes —30, 31 o 28— sin que nadie lo escriba a mano.
  assert.deepEqual(quincenaCorriente('2026-09-01'), { desde: '2026-09-01', hasta: '2026-09-01' })
  assert.deepEqual(quincenaCorriente('2026-09-15'), { desde: '2026-09-01', hasta: '2026-09-15' })
  assert.deepEqual(quincenaCorriente('2026-09-16'), { desde: '2026-09-16', hasta: '2026-09-16' })
  assert.deepEqual(quincenaCorriente('2026-09-30'), { desde: '2026-09-16', hasta: '2026-09-30' })
  assert.deepEqual(quincenaCorriente('2026-08-31'), { desde: '2026-08-16', hasta: '2026-08-31' })
  assert.deepEqual(quincenaCorriente('2027-02-28'), { desde: '2027-02-16', hasta: '2027-02-28' })
})

test('HH quincena no arrastra la quincena ya liquidada ni lo cargado por adelantado', () => {
  // ES EL PEDIDO: con la ventana del mes, el 16 la columna seguía sumando del 1 al 15 — horas de una
  // quincena que ya se pagó. Revertir a `desde = día 1` pone esta prueba en rojo.
  const filas = [
    { persona_id: 'a', fecha: '2026-09-15', horas: 9, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-09-16', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-09-17', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'b', fecha: '2026-09-15', horas: 9, tipo_hora: 'normal' },
  ]
  const el16 = quincenaCorriente('2026-09-16')
  const hh16 = hhPorPersona(filas, el16.desde, el16.hasta)
  assert.equal(hh16.get('a'), 8)
  // Quien sólo trabajó en la quincena anterior es «sin HH» en ésta, no 0.
  assert.equal(hh16.has('b'), false)
  const el15 = quincenaCorriente('2026-09-15')
  const hh15 = hhPorPersona(filas, el15.desde, el15.hasta)
  assert.equal(hh15.get('a'), 9)
  assert.equal(hh15.get('b'), 9)
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

// ── EL BOTÓN «PRESENTE» DE LA COLUMNA HOY (09/09/2026) ─────────────────────────────────────────
//
// Cada una se pone roja si se afloja UNA de las condiciones que impiden que un botón repetido en
// 62 filas escriba lo que nadie quiso escribir.

const PUEDE = {
  puedeMarcar: true, presencia: 'sin_marcar', obraId: 'quattropani', esJefe: false, enLaEmpresa: true,
} as const

test('el caso para el que se hizo: con permiso, sobre el silencio y con obra, hay botón', () => {
  assert.equal(ofertaDeMarcar(PUEDE), 'boton')
})

test('un jefe de obra NO ve el botón: no se marca a sí mismo', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Es la regla del teléfono («Vos no te marcás: marcás a tu cuadrilla», `personasAMarcar`). El
  // jefe de obra es el único rol que además ES una persona del plantel: sin esto, la fila con su
  // propio nombre le ofrece declararse presente —y cargarse la jornada del día— en la pantalla que
  // abre todas las mañanas.
  assert.equal(ofertaDeMarcar({ ...PUEDE, esJefe: true }), 'nada')
})

test('sin obra asignada NO hay botón, y la celda lo dice: la obra no se inventa', () => {
  // Marcar presente imputa la jornada por defecto a UNA obra. Si esto devolviera 'boton', el clic
  // rebotaría en la acción («Elegí la obra») o —peor, el día que alguien "arregle" ese rebote—
  // escribiría costo de mano de obra en una obra elegida por la pantalla.
  assert.equal(ofertaDeMarcar({ ...PUEDE, obraId: null }), 'sin_obra')
})

test('sobre una ausencia o una licencia no hay botón: corregirlas es otra pantalla', () => {
  // Un segundo toque sobre alguien ya declarado reescribiría `marcado_por` con quien sólo pasó a
  // mirar la lista — y esa firma es lo que hace que la declaración valga. Y sacar una ausencia sin
  // ver su motivo borraría el porqué que alguien cargó.
  for (const presencia of ['ausente', 'licencia'] as const) {
    assert.equal(ofertaDeMarcar({ ...PUEDE, presencia }), 'nada', `${presencia} recibió botón`)
  }
})

test('sobre un PRESENTE la celda ofrece quitarlo (dueño, 10/09/2026)', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Textual: *«si quiero sacarle el presente a alguien que lo tiene, no puedo actualmente; está
  // mal»*. La marca se ponía desde esta celda y no había forma de sacarla desde ninguna pantalla:
  // `asistencia_dia` no admite «volver a sin marcar» por update —eso es borrar la fila— y la lista
  // devolvía 'nada'. Si alguien vuelve a colapsar «ya declarado» en un solo caso, esto da rojo.
  assert.equal(ofertaDeMarcar({ ...PUEDE, presencia: 'presente' }), 'quitar')
})

test('quitar se ofrece aunque la persona ya no tenga obra asignada', () => {
  // Quitar no imputa nada a ninguna obra: es lo contrario de marcar, así que la razón por la que
  // 'boton' exige obra no aplica. Sin esto, justo la fila sin obra —la que más se marca por error,
  // porque la marca es la que le pone la jornada— sería la única que no se puede deshacer.
  assert.equal(ofertaDeMarcar({ ...PUEDE, presencia: 'presente', obraId: null }), 'quitar')
})

test('quien no puede marcar tampoco puede quitar', () => {
  assert.equal(ofertaDeMarcar({ ...PUEDE, presencia: 'presente', puedeMarcar: false }), 'nada')
  assert.equal(ofertaDeMarcar({ ...PUEDE, presencia: 'presente', esJefe: true }), 'nada')
})

test('sin permiso no hay botón ni «sin obra»; a quien ya no está tampoco', () => {
  // Falla cerrado por las dos puntas: el rol y la pertenencia. La cerradura sigue siendo la RLS,
  // pero una puerta que ofrece lo que la base va a rebotar enseña a desconfiar de la pantalla.
  assert.equal(ofertaDeMarcar({ ...PUEDE, puedeMarcar: false }), 'nada')
  assert.equal(ofertaDeMarcar({ ...PUEDE, puedeMarcar: false, obraId: null }), 'nada')
  assert.equal(ofertaDeMarcar({ ...PUEDE, enLaEmpresa: false }), 'nada')
})

// ── TARDANZA DESDE EL PLANTEL (dueño, 15/09/2026) ───────────────────────────────────────────────

test('la marca de hoy sólo existe sobre un presente, y sólo si alguna de las dos está puesta', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un Map con `{false, false}` por persona haría que la celda dibuje «con marca» para todo el
  // plantel el día que alguien lo lea con `has()`; y una fila ausente con la marca puesta —cargada
  // por script antes del CHECK— pintaría el ▲ sobre alguien que no vino.
  const m = tardanzasDeHoy([
    { persona_id: 'a', estado: 'presente', llego_tarde: true, salio_antes: false },
    { persona_id: 'b', estado: 'presente', llego_tarde: false, salio_antes: false },
    { persona_id: 'c', estado: 'ausente', llego_tarde: true, salio_antes: true },
    // Sin columnas (migración pendiente): se lee como sin marca, nunca como marca.
    { persona_id: 'd', estado: 'presente' },
    { persona_id: 'e', estado: 'presente', salio_antes: true },
  ])
  assert.deepEqual([...m.keys()].sort(), ['a', 'e'])
  assert.deepEqual(m.get('a'), { llegoTarde: true, salioAntes: false })
  assert.deepEqual(m.get('e'), { llegoTarde: false, salioAntes: true })
})

test('el pie cuenta PERSONAS con marca en la quincena, no días', () => {
  // Dos marcas de la misma persona son UN presentismo perdido: contar filas diría «3» donde hay 2.
  assert.equal(personasConTardanza([
    { persona_id: 'a', estado: 'presente', llego_tarde: true },
    { persona_id: 'a', estado: 'presente', salio_antes: true },
    { persona_id: 'b', estado: 'presente', llego_tarde: true, salio_antes: true },
    { persona_id: 'c', estado: 'presente' },
    { persona_id: 'd', estado: 'licencia', llego_tarde: true },
  ]), 2)
  assert.equal(personasConTardanza([]), 0)
})

test('el pie dice «sin lectura» cuando no pudo leer la quincena, y nunca un 0 en su lugar', () => {
  const q = { desde: '2026-09-16', hasta: '2026-09-30' }
  const sinLectura = pieDeTardanzas({ conMarca: null, quincena: q })
  assert.match(sinLectura, /sin lectura de la 2ª quincena de septiembre/)
  assert.doesNotMatch(sinLectura, /\b0\b|nadie/)
  assert.match(pieDeTardanzas({ conMarca: 0, quincena: q }), /nadie con marca en la 2ª quincena de septiembre/)
  assert.match(pieDeTardanzas({ conMarca: 1, quincena: q }), /1 persona con marca/)
  assert.match(pieDeTardanzas({ conMarca: 3, quincena: q }), /3 personas con marca/)
  // LA LEYENDA DEL ▲ VA SIEMPRE: es lo que explica el glifo de la celda.
  assert.match(sinLectura, /^▲ llegó tarde o salió antes · pierde el presentismo de la quincena/)
})

test('antes del 16/09/2026 el pie avisa que el presentismo todavía no rige', () => {
  // La marca se guarda igual —es un hecho del día— pero no descuenta: sin el aviso alguien buscaría
  // en la liquidación de la 1ª quincena de septiembre un descuento que no existe.
  const antes = pieDeTardanzas({ conMarca: 2, quincena: { desde: '2026-09-01', hasta: '2026-09-15' } })
  assert.match(antes, /2 personas con marca en la 1ª quincena de septiembre \(el presentismo rige desde el 16\/09\/2026\)/)
  const despues = pieDeTardanzas({ conMarca: 2, quincena: { desde: '2026-09-16', hasta: '2026-09-30' } })
  assert.doesNotMatch(despues, /rige desde/)
})
