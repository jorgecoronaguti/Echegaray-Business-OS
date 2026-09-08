// EL DESPLEGABLE DE OBRA ACTUAL NO PUEDE BORRAR LA HISTORIA NI DEJAR DOS OBRAS ABIERTAS.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// 1. Cambiar de obra cerrando la anterior con `hasta = hoy`: la persona queda vigente HOY en dos
//    obras, y la grilla —que elige la de más horas— sigue mostrando la vieja. El dueño toca el
//    desplegable, ve que no cambia nada, y lo vuelve a tocar.
// 2. Cerrar con `hasta = ayer` una asignación creada HOY: `hasta < desde`, un período que afirma
//    que la persona trabajó menos que ningún día. Pasa siempre que alguien se equivoca de obra y
//    lo corrige en el momento, que es el caso más frecuente de todos.
// 3. Elegir la misma obra que ya tenía y que igual escriba: cerraría y reabriría la asignación, y
//    el período trabajado quedaría partido en dos por un clic que no cambió nada.
// 4. «Sin obra» abriendo una asignación a ninguna parte.
// 5. Cerrar sólo UNA de las abiertas cuando la persona tiene dos —en la base las hay: una la creó
//    la web sin `desde`, la otra la reconstruyó el historial de JORNALES—. Si la que quedaba
//    abierta era la de la obra destino, el `insert` chocaba contra el índice único
//    `obra_asignacion_una_vigente` y la persona terminaba cerrada y sin abrir: 0 vigentes. Si era
//    de otra obra, quedaba en dos obras a la vez.
//
// ═══ QUÉ NO PRUEBA ═══
//
// Que la base acepte la escritura y que la RLS deje. Eso es de la acción y del E2E.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaAnterior, diaSiguiente, planDeCambioDeObra, planDeCancelacion, puedeCambiarObraActual,
  tramosProgramados, validarProgramacion,
} from './planDeObraActual.ts'

const HOY = '2026-09-08'
const AYER = '2026-09-07'

const pisos = { obra_id: 'pisos-industriales', nombre: 'PISOS INDUSTRIALES', desde: '2026-08-01' }
const abiertaEnPisos = [{ id: 'a1', ...pisos }]
const salon = { id: 'salon-comercial', nombre: 'SALÓN COMERCIAL' }

test('diaAnterior no se corre de día por la zona horaria', () => {
  assert.equal(diaAnterior('2026-09-08'), '2026-09-07')
  assert.equal(diaAnterior('2026-01-01'), '2025-12-31')
  assert.equal(diaAnterior('2026-03-01'), '2026-02-28')
})

test('cambiar de obra cierra la anterior AYER y abre la nueva HOY', () => {
  const plan = planDeCambioDeObra({ abiertas: abiertaEnPisos, destino: salon, hoy: HOY })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
  assert.equal(plan.sinCambio, false)
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES.')
})

test('el cierre nunca queda antes del comienzo: la asignación creada hoy cierra hoy', () => {
  const plan = planDeCambioDeObra({
    abiertas: [{ id: 'a1', obra_id: pisos.obra_id, nombre: pisos.nombre, desde: HOY }],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: HOY }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
})

test('elegir la misma obra no escribe nada', () => {
  const plan = planDeCambioDeObra({
    abiertas: abiertaEnPisos, destino: { id: pisos.obra_id, nombre: pisos.nombre }, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [])
  assert.equal(plan.abrir, null)
  assert.equal(plan.sinCambio, true)
  assert.equal(plan.acuse, 'Ya estaba en PISOS INDUSTRIALES.')
})

test('«Sin obra» sólo cierra: no abre una asignación a ninguna parte', () => {
  const plan = planDeCambioDeObra({ abiertas: abiertaEnPisos, destino: null, hoy: HOY })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.equal(plan.abrir, null)
  assert.equal(plan.acuse, 'Desde hoy sin obra · antes PISOS INDUSTRIALES.')
})

test('quien no tenía ninguna obra sólo abre, y el acuse no inventa un «antes»', () => {
  const plan = planDeCambioDeObra({ abiertas: [], destino: salon, hoy: HOY })
  assert.deepEqual(plan.cerrar, [])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL.')
})

test('«Sin obra» sobre quien ya no tenía ninguna no escribe nada', () => {
  const plan = planDeCambioDeObra({ abiertas: [], destino: null, hoy: HOY })
  assert.equal(plan.sinCambio, true)
  assert.deepEqual(plan.cerrar, [])
})

test('con dos obras vigentes, elegir una cierra la otra y no reabre la elegida', () => {
  const plan = planDeCambioDeObra({
    abiertas: [{ id: 'a1', ...pisos }, { id: 'a2', obra_id: salon.id, nombre: salon.nombre, desde: '2026-08-15' }],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.equal(plan.abrir, null, 'la asignación al destino ya existía: reabrirla partiría el período')
  assert.equal(plan.acuse, 'Ya estaba en SALÓN COMERCIAL · se cerró PISOS INDUSTRIALES.')
})

// ═══ DOS ABIERTAS A LA VEZ NO ES UN CASO RARO: ESTÁ EN LA BASE ═══
//
// El índice único `obra_asignacion_una_vigente` es por (obra, persona, actividad), no por persona:
// deja que la misma persona tenga abiertas dos obras distintas. Al 08/09/2026 las había (PASTRAN:
// instalacion-electrica + le-galpon-9), y varias eran una fila de la web sin `desde` más una del
// historial de JORNALES. Cerrar sólo «la más reciente» es lo que rompía el desplegable.

const galpon = { id: 'le-galpon-9', nombre: 'GALPÓN 9' }

test('DOS abiertas y el destino es otra obra: se cierran LAS DOS y se abre una sola', () => {
  const plan = planDeCambioDeObra({
    abiertas: [
      { id: 'a1', ...pisos },
      { id: 'a2', obra_id: galpon.id, nombre: galpon.nombre, desde: '2026-08-20' },
    ],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }, { id: 'a2', hasta: AYER }],
    'cerrar sólo la más reciente deja a la persona en dos obras a la vez')
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES, GALPÓN 9.')
})

test('DOS abiertas y una YA es el destino: un cierre, ninguna alta, y el acuse no dice «desde hoy»', () => {
  const plan = planDeCambioDeObra({
    abiertas: [
      { id: 'a1', obra_id: salon.id, nombre: salon.nombre, desde: '2026-08-15' },
      { id: 'a2', obra_id: galpon.id, nombre: galpon.nombre, desde: '2026-08-20' },
    ],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a2', hasta: AYER }])
  assert.equal(plan.abrir, null,
    'abrir una segunda al destino viola obra_asignacion_una_vigente y la persona queda sin ninguna')
  assert.equal(plan.acuse, 'Ya estaba en SALÓN COMERCIAL · se cerró GALPÓN 9.')
})

test('DOS abiertas a la MISMA obra destino: se conserva la de historia más larga y se cierra la otra', () => {
  const plan = planDeCambioDeObra({
    abiertas: [
      { id: 'a1', obra_id: salon.id, nombre: salon.nombre, desde: null },
      { id: 'a2', obra_id: salon.id, nombre: salon.nombre, desde: '2026-08-15' },
    ],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }],
    'la fila sin desde es la incompleta: se cierra ella, no la que tiene historia')
  assert.equal(plan.abrir, null)
  assert.equal(plan.sinCambio, false, 'quedaban dos filas abiertas: había algo que escribir')
})

test('una abierta SIN desde cierra AYER: no hay comienzo por delante del cual quedar', () => {
  const plan = planDeCambioDeObra({
    abiertas: [{ id: 'a1', obra_id: pisos.obra_id, nombre: pisos.nombre, desde: null }],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
})

test('«Sin obra» cierra TODAS las abiertas, no la última', () => {
  const plan = planDeCambioDeObra({
    abiertas: [
      { id: 'a1', ...pisos },
      { id: 'a2', obra_id: galpon.id, nombre: galpon.nombre, desde: null },
      { id: 'a3', obra_id: salon.id, nombre: salon.nombre, desde: HOY },
    ],
    destino: null, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [
    { id: 'a1', hasta: AYER }, { id: 'a2', hasta: AYER }, { id: 'a3', hasta: HOY },
  ])
  assert.equal(plan.abrir, null)
  assert.equal(plan.acuse, 'Desde hoy sin obra · antes PISOS INDUSTRIALES, GALPÓN 9, SALÓN COMERCIAL.')
})

// EL PLAN NO PUEDE DEPENDER DEL ORDEN EN QUE POSTGREST DEVOLVIÓ LAS FILAS. La lectura no lleva
// `order`: si el resultado cambiara con el orden, el mismo clic escribiría cosas distintas.
test('el plan es el mismo venga como venga ordenada la lectura', () => {
  const filas = [
    { id: 'a1', ...pisos },
    { id: 'a2', obra_id: salon.id, nombre: salon.nombre, desde: '2026-08-15' },
    { id: 'a3', obra_id: salon.id, nombre: salon.nombre, desde: null },
  ]
  const directo = planDeCambioDeObra({ abiertas: filas, destino: salon, hoy: HOY })
  const alReves = planDeCambioDeObra({ abiertas: [...filas].reverse(), destino: salon, hoy: HOY })
  assert.deepEqual(
    [...alReves.cerrar].sort((x, y) => x.id.localeCompare(y.id)),
    [...directo.cerrar].sort((x, y) => x.id.localeCompare(y.id)),
  )
  assert.deepEqual(alReves.abrir, directo.abrir)
})

// ═══ EL JEFE DE OBRA SÍ MUEVE GENTE; `campo` NO (dueño, 08/09/2026, tarde) ═══
//
// *"Tenés que habilitar a los jefes de obra a poder modificar las obras asignadas del personal"* —
// reemplaza la restricción de la mañana. El jefe abre la carga del día y la cuadrilla que ve tiene
// que ser la que tiene enfrente; si para eso hay que llamar a Administración, la asistencia se
// carga en la obra equivocada.
//
// EL DEFECTO QUE ATRAPA: que la lista se amplíe de más. `campo` es el único rol que la RLS acota
// por obra y quien no tiene perfil no tiene nada; si alguno de esos dos empieza a devolver `true`,
// cualquiera con una sesión mueve costo de mano de obra entre obras. Y el rol se compara contra la
// CLAVE de la base: «administración» con tilde no es un rol, es un rótulo de pantalla.
test('dirección, administración y jefe de obra cambian la obra de una persona; nadie más', () => {
  assert.equal(puedeCambiarObraActual('direccion'), true)
  assert.equal(puedeCambiarObraActual('administracion'), true)
  assert.equal(puedeCambiarObraActual('jefe_obra'), true, 'el jefe arma su cuadrilla antes de marcarla')
  assert.equal(puedeCambiarObraActual('campo'), false, 'el operario carga lo suyo, no decide plantel')
  assert.equal(puedeCambiarObraActual('cliente'), false)
  assert.equal(puedeCambiarObraActual(null), false)
  assert.equal(puedeCambiarObraActual(undefined), false)
  assert.equal(puedeCambiarObraActual('administración'), false, 'el rol es la clave de la base, sin tilde')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PROGRAMAR UN PASE A FUTURO (dueño, 08/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// *«necesito que me permitas designar una obra actual, pero ya quiero poder definir lo de los días
// siguientes… una cosa es hoy y cuando planifico quiero poner lo de mañana y siguientes»*.
//
// ═══ QUÉ DEFECTOS ATRAPAN ESTOS TESTS ═══
//
// 6. Que programar rompa el cambio de hoy. Es el riesgo real: `desde` es un parámetro nuevo con
//    default, y cualquier cambio de forma en `abrir` —agregarle `hasta: null`, por ejemplo— o de
//    fecha de cierre se lleva puesto el gesto que el dueño usa todos los días. El test de la
//    mutación compara los dos planes objeto contra objeto.
// 7. Cerrar la anterior AYER al programar un pase para el jueves. La persona quedaría sin obra
//    desde hoy hasta el jueves, y las horas que cargue en el medio no tendrían asignación detrás.
// 8. Un tramo con fin que no devuelve a la persona a su obra: el 13 se termina el pase y queda sin
//    obra para siempre, en silencio, semanas después de que alguien lo programó.
// 9. Programar hacia atrás, o a dos años, o con el fin antes del inicio.

const MANANA = '2026-09-09'
const PASADO = '2026-09-10'

test('MUTACIÓN: programar «desde hoy» produce el MISMO plan que no pasar desde', () => {
  const sinDesde = planDeCambioDeObra({ abiertas: abiertaEnPisos, destino: salon, hoy: HOY })
  const conHoy = planDeCambioDeObra({ abiertas: abiertaEnPisos, destino: salon, hoy: HOY, desde: HOY })
  assert.deepEqual(conHoy, sinDesde,
    'el desplegable de la grilla no pasa `desde`: si el default se corre, el gesto diario cambia')
  assert.deepEqual(sinDesde.abrir, { obra_id: 'salon-comercial', desde: HOY },
    '`abrir` no puede llevar `hasta` cuando el tramo es abierto: la forma del objeto es el contrato')
  assert.equal(sinDesde.reabrir, null, 'sin fin no hay regreso que programar')
})

test('programar para mañana cierra la vigente HOY, no ayer, y abre recién mañana', () => {
  const plan = planDeCambioDeObra({
    abiertas: abiertaEnPisos, destino: salon, hoy: HOY, desde: MANANA,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: HOY }],
    'cerrarla ayer deja a la persona sin obra el día de hoy, que todavía trabaja en PISOS')
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: MANANA })
  assert.equal(plan.reabrir, null)
  assert.equal(plan.acuse, 'Desde el 09/09 en SALÓN COMERCIAL · antes PISOS INDUSTRIALES.')
})

test('el acuse de un pase programado NO dice «desde hoy»', () => {
  const plan = planDeCambioDeObra({ abiertas: [], destino: salon, hoy: HOY, desde: PASADO })
  assert.equal(plan.acuse, 'Desde el 10/09 en SALÓN COMERCIAL.',
    'decir «desde hoy» manda a buscar a la persona a una obra donde todavía no está')
})

// ═══ EL TRAMO SANDWICH: «TRES DÍAS EN QUATTROPANI Y VUELVE A SAN FRANCISCO» ═══
test('un tramo con fin abre el pase, lo cierra, y devuelve a la persona a su obra al día siguiente', () => {
  const plan = planDeCambioDeObra({
    abiertas: abiertaEnPisos, destino: salon, hoy: HOY, desde: MANANA, hasta: '2026-09-11',
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: HOY }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: MANANA, hasta: '2026-09-11' })
  assert.deepEqual(plan.reabrir, { obra_id: 'pisos-industriales', desde: '2026-09-12' },
    'sin el regreso la persona queda sin obra desde el 12/09 y nadie se entera hasta que pasa')
  assert.equal(plan.acuse, 'Del 09/09 al 11/09 en SALÓN COMERCIAL · vuelve a PISOS INDUSTRIALES.')
})

test('quien no tenía ninguna obra no «vuelve» a ninguna parte', () => {
  const plan = planDeCambioDeObra({
    abiertas: [], destino: salon, hoy: HOY, desde: MANANA, hasta: '2026-09-11',
  })
  assert.equal(plan.reabrir, null, 'inventar un regreso es inventar dónde estaba antes')
  assert.equal(plan.acuse, 'Del 09/09 al 11/09 en SALÓN COMERCIAL.')
})

test('un tramo YA programado no es «la obra vigente»: el regreso mira dónde está HOY', () => {
  const plan = planDeCambioDeObra({
    abiertas: [
      { id: 'a1', ...pisos },
      // Alguien ya había programado GALPÓN 9 para el 20. Todavía no rige.
      { id: 'a2', obra_id: galpon.id, nombre: galpon.nombre, desde: '2026-09-20' },
    ],
    destino: salon, hoy: HOY, desde: MANANA, hasta: '2026-09-11',
  })
  assert.deepEqual(plan.reabrir, { obra_id: 'pisos-industriales', desde: '2026-09-12' },
    'volver a GALPÓN 9 la mandaría a una obra donde nunca estuvo')
})

test('programar un pase a la obra donde YA está no escribe nada', () => {
  const plan = planDeCambioDeObra({
    abiertas: abiertaEnPisos, destino: { id: pisos.obra_id, nombre: pisos.nombre },
    hoy: HOY, desde: MANANA, hasta: '2026-09-11',
  })
  assert.equal(plan.sinCambio, true, 'un sandwich de una obra a sí misma parte el período por nada')
  assert.equal(plan.reabrir, null)
})

test('«Sin obra» programado cierra en la víspera del pase, no ayer', () => {
  const plan = planDeCambioDeObra({
    abiertas: abiertaEnPisos, destino: null, hoy: HOY, desde: PASADO,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: MANANA }])
  assert.equal(plan.abrir, null)
  assert.equal(plan.acuse, 'Desde el 10/09 sin obra · antes PISOS INDUSTRIALES.')
})

test('diaSiguiente no se corre de día ni de mes ni de año', () => {
  assert.equal(diaSiguiente('2026-09-08'), '2026-09-09')
  assert.equal(diaSiguiente('2026-12-31'), '2027-01-01')
  assert.equal(diaSiguiente('2026-02-28'), '2026-03-01')
})

// ═══ LAS TRES REGLAS DE FECHA ═══
test('no se programa hacia atrás, ni a más de 60 días, ni con el fin antes del inicio', () => {
  assert.equal(validarProgramacion({ hoy: HOY, desde: HOY }), null, 'hoy es válido: es el default')
  assert.equal(validarProgramacion({ hoy: HOY, desde: MANANA, hasta: MANANA }), null,
    'un pase de un solo día es un pase')
  assert.match(
    validarProgramacion({ hoy: HOY, desde: AYER }) ?? '',
    /hacia atrás/,
    'programar el pasado reimputa costo de mano de obra de días ya cargados',
  )
  assert.equal(validarProgramacion({ hoy: HOY, desde: '2026-11-07' }), null, 'el día 60 entra')
  assert.match(validarProgramacion({ hoy: HOY, desde: '2026-11-08' }) ?? '', /60 días/, 'el 61 no')
  assert.match(
    validarProgramacion({ hoy: HOY, desde: PASADO, hasta: MANANA }) ?? '',
    /anterior al primero/,
  )
  assert.match(validarProgramacion({ hoy: HOY, desde: 'mañana' }) ?? '', /no es una fecha/)
})

// ═══ CANCELAR ═══
//
// El defecto que atrapa: cancelar borrando SÓLO la fila futura. El tramo anterior quedó cerrado en
// la víspera, así que la persona termina sin ninguna asignación abierta y la grilla la muestra
// «Sin obra» — exactamente el estado que el cambio de obra evita a propósito.

const tramoVigente = {
  id: 't1', obra_id: pisos.obra_id, nombre: pisos.nombre, desde: '2026-08-01', hasta: HOY,
}
const tramoProgramado = {
  id: 't2', obra_id: salon.id, nombre: salon.nombre, desde: MANANA, hasta: null,
}

test('cancelar borra el tramo futuro Y reabre el que le había cedido el lugar', () => {
  const plan = planDeCancelacion({ tramos: [tramoVigente, tramoProgramado], id: 't2', hoy: HOY })
  assert.equal(plan.error, null)
  assert.deepEqual(plan.borrar, ['t2'])
  assert.equal(plan.reabrirId, 't1',
    'sin reabrir, cancelar deja a la persona sin ninguna asignación abierta')
  assert.equal(plan.acuse, 'Se canceló el pase a SALÓN COMERCIAL · sigue en PISOS INDUSTRIALES.')
})

test('cancelar un sandwich borra TAMBIÉN el regreso: si no, queda un hueco sin obra en el medio', () => {
  const plan = planDeCancelacion({
    tramos: [
      { ...tramoVigente },
      { ...tramoProgramado, hasta: '2026-09-11' },
      { id: 't3', obra_id: pisos.obra_id, nombre: pisos.nombre, desde: '2026-09-12', hasta: null },
    ],
    id: 't2', hoy: HOY,
  })
  assert.deepEqual(plan.borrar, ['t2', 't3'])
  assert.equal(plan.reabrirId, 't1')
})

test('el tramo que ya rige NO se cancela: se cambia', () => {
  const plan = planDeCancelacion({
    tramos: [{ ...tramoProgramado, desde: HOY }], id: 't2', hoy: HOY,
  })
  assert.match(plan.error ?? '', /ya rige/,
    'borrarlo dejaría sin asignación las horas ya cargadas contra él')
  assert.deepEqual(plan.borrar, [], 'un plan con error no puede llevar escrituras adentro')
  assert.equal(plan.reabrirId, null)
})

test('cancelar algo que ya no está no rompe ni borra otra cosa', () => {
  const plan = planDeCancelacion({ tramos: [tramoVigente], id: 't2', hoy: HOY })
  assert.match(plan.error ?? '', /ya no existe/)
  assert.deepEqual(plan.borrar, [])
})

test('no se reabre un cierre viejo que terminó de verdad', () => {
  const plan = planDeCancelacion({
    tramos: [
      { id: 'viejo', obra_id: galpon.id, nombre: galpon.nombre, desde: '2026-05-01', hasta: '2026-06-30' },
      tramoProgramado,
    ],
    id: 't2', hoy: HOY,
  })
  assert.equal(plan.reabrirId, null,
    'reabrir «el último cerrado» resucitaría un período cerrado hace tres meses')
  assert.equal(plan.acuse, 'Se canceló el pase a SALÓN COMERCIAL.')
})

test('programado es lo que empieza DESPUÉS de hoy, y el primero es el próximo', () => {
  const lista = tramosProgramados([
    { id: 't3', obra_id: galpon.id, nombre: galpon.nombre, desde: '2026-09-20', hasta: null },
    tramoVigente,
    tramoProgramado,
    { id: 't0', obra_id: salon.id, nombre: salon.nombre, desde: null, hasta: null },
  ], HOY)
  assert.deepEqual(lista.map((t) => t.id), ['t2', 't3'],
    'el vigente no es un plan, y una fila sin `desde` no empieza en el futuro')
})
