// LAS PRUEBAS DEL PULSO — cada una revienta si se vuelve al defecto que arregló.
//
// Las tres primeras son la misma prueba escrita tres veces: EL SILENCIO NO ES 0. Si alguien cambia
// `Map` por un `Record` con default 0 —que es la forma natural de escribir esto— las tres se ponen
// rojas de golpe, que es exactamente lo que tienen que hacer.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alertasDelPlantel, estadoHoy, hayControlDeVencimientos, hhPorPersona, horasVisibles,
  lecturaDePapeles, marcasPorPersona, mesCorriente, papelesPorPersona, partirCifra,
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

test('sin ninguna fila de legajo NO es «al día»', () => {
  // El defecto: contar 0 vencidos y escribir «al día» para alguien cuyo legajo nadie abrió nunca.
  assert.deepEqual(lecturaDePapeles(undefined), { texto: 'sin legajo', tono: 'nulo' })
  assert.deepEqual(
    lecturaDePapeles({ vencidos: 0, porVencer: 0, faltan: 0, total: 0 }),
    { texto: 'sin legajo', tono: 'nulo' },
  )
  assert.deepEqual(
    lecturaDePapeles({ vencidos: 0, porVencer: 0, faltan: 0, total: 4 }),
    { texto: 'al día', tono: 'pos' },
  )
})

test('847 papeles sin un solo vencimiento cargado NO son un control de vencimientos', () => {
  // ES EL ESTADO REAL DE LA BASE (sonda 24/08/2026): 847 filas, 0 con `fecha_vencimiento`, 0 con
  // `presente = false`. Si esto devolviera true, la columna escribiría «al día» en 61 filas y
  // afirmaría un control que nadie está haciendo. Que la COLUMNA exista no prueba que el control
  // exista: eso lo prueba el dato.
  const comoEstaHoy = Array.from({ length: 847 }, (_, i) => ({
    persona_id: `p${i % 62}`, presente: true, fecha_vencimiento: null,
  }))
  assert.equal(hayControlDeVencimientos(comoEstaHoy), false)
  assert.equal(hayControlDeVencimientos([]), false)

  // Un solo vencimiento cargado ya enciende la columna: no hace falta tocar código.
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
  // El vencido gana la celda: es el único de los tres que ya es un problema.
  assert.deepEqual(lecturaDePapeles(p.get('a')), { texto: '1 vencido', tono: 'neg' })
})

// ── LOS BANNERS ─────────────────────────────────────────────────────────────────────────────────

const PLANTEL = [
  { id: 'a', obra_actual_id: 'o1', en_la_empresa: true },
  { id: 'b', obra_actual_id: null, en_la_empresa: true },
  { id: 'c', obra_actual_id: 'o1', en_la_empresa: false },
]

test('los banners cuentan lo que dice su rótulo', () => {
  const alertas = alertasDelPlantel({
    personas: PLANTEL,
    marcas: marcasPorPersona([{ persona_id: 'a', estado: 'activo' }]),
    papeles: papelesPorPersona([
      { persona_id: 'b', presente: true, fecha_vencimiento: '2026-08-01' },
    ], HOY),
    hoyDisponible: true,
    papelesDisponible: true,
  })
  const por = (k: string) => alertas.find((x) => x.clave === k)
  // «c» está fuera de la empresa: no ficha, no tiene obra y no cuenta en ningún banner.
  assert.equal(por('sin_fichar')?.texto, '1 sin fichar hoy')
  assert.equal(por('sin_obra')?.texto, '1 sin obra asignada')
  assert.equal(por('papeles')?.texto, '1 persona con papeles vencidos')
})

test('sin nada que avisar no hay un solo banner', () => {
  const alertas = alertasDelPlantel({
    personas: [{ id: 'a', obra_actual_id: 'o1', en_la_empresa: true }],
    marcas: marcasPorPersona([{ persona_id: 'a', estado: 'activo' }]),
    papeles: papelesPorPersona([{ persona_id: 'a', presente: true, fecha_vencimiento: null }], HOY),
    hoyDisponible: true,
    papelesDisponible: true,
  })
  assert.deepEqual(alertas, [])
})

test('la fuente que no se pudo leer NO publica un conteo', () => {
  // El defecto: `presencia_del_dia` rechazada por RLS ⇒ cero marcas ⇒ «17 sin fichar hoy». Un
  // control que no pudo mirar no dice «no está».
  const alertas = alertasDelPlantel({
    personas: PLANTEL,
    marcas: new Map(),
    papeles: new Map(),
    hoyDisponible: false,
    papelesDisponible: false,
  })
  assert.deepEqual(alertas.map((a) => a.clave), ['sin_obra'])
})

// ── LA BANDA DEL CANÓNICO 19 ────────────────────────────────────────────────────────────────────
//
// La banda pinta la CIFRA y deja el rótulo en tinta. Si `partirCifra` se escribiera con el
// `texto.split(' ')` que uno teclea sin pensar, cada una de estas se pone roja: el rótulo se
// quedaría con el número («7 7 papeles vencidos»), o un texto sin cifra devolvería un rótulo vacío
// y la alerta aparecería como una pastilla en blanco.

test('la cifra se separa del rótulo y NINGUNO se queda con el otro', () => {
  assert.deepEqual(partirCifra('3 sin obra asignada'), { cifra: '3', rotulo: 'sin obra asignada' })
  assert.deepEqual(
    partirCifra('7 personas con papeles vencidos'),
    { cifra: '7', rotulo: 'personas con papeles vencidos' },
  )
})

test('una alerta sin número conserva su texto ENTERO como rótulo', () => {
  // El defecto que atrapa: partir a ciegas por el primer espacio se comería la primera palabra de
  // cualquier alerta futura que no cuente nada, y la pastilla diría algo distinto de lo escrito.
  assert.deepEqual(partirCifra('sin lectura de presencia'), { cifra: null, rotulo: 'sin lectura de presencia' })
})

test('los tres banners reales pasan por la banda sin perder su número', () => {
  // No es una prueba de la función sola: es el contrato entre `alertasDelPlantel` (quien escribe el
  // texto) y la banda (quien lo parte). Si alguien reescribe un texto poniendo el número al final
  // —«papeles vencidos: 7»— la pastilla se queda sin cifra y esto lo dice acá, no en producción.
  const alertas = alertasDelPlantel({
    personas: PLANTEL,
    marcas: marcasPorPersona([]),
    papeles: papelesPorPersona(
      [{ persona_id: 'a', presente: true, fecha_vencimiento: '2026-08-01' }],
      HOY,
    ),
    hoyDisponible: true,
    papelesDisponible: true,
  })
  assert.ok(alertas.length > 0, 'el plantel de prueba tiene que producir alertas')
  for (const a of alertas) {
    const { cifra, rotulo } = partirCifra(a.texto)
    assert.ok(cifra !== null, `«${a.texto}» tiene que empezar por su número`)
    assert.ok(rotulo.length > 0 && !rotulo.startsWith(cifra), `«${a.texto}» duplica su cifra en el rótulo`)
  }
})
