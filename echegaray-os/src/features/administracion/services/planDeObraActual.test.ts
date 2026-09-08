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
//
// ═══ QUÉ NO PRUEBA ═══
//
// Que la base acepte la escritura y que la RLS deje. Eso es de la acción y del E2E.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diaAnterior, planDeCambioDeObra, puedeCambiarObraActual } from './planDeObraActual.ts'

const HOY = '2026-09-08'
const AYER = '2026-09-07'

const pisos = { obra_id: 'pisos-industriales', nombre: 'PISOS INDUSTRIALES', desde: '2026-08-01' }
const vigenteEnPisos = [{ id: 'a1', ...pisos }]
const salon = { id: 'salon-comercial', nombre: 'SALÓN COMERCIAL' }

test('diaAnterior no se corre de día por la zona horaria', () => {
  assert.equal(diaAnterior('2026-09-08'), '2026-09-07')
  assert.equal(diaAnterior('2026-01-01'), '2025-12-31')
  assert.equal(diaAnterior('2026-03-01'), '2026-02-28')
})

test('cambiar de obra cierra la anterior AYER y abre la nueva HOY', () => {
  const plan = planDeCambioDeObra({ vigentes: vigenteEnPisos, destino: salon, hoy: HOY })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
  assert.equal(plan.sinCambio, false)
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES.')
})

test('el cierre nunca queda antes del comienzo: la asignación creada hoy cierra hoy', () => {
  const plan = planDeCambioDeObra({
    vigentes: [{ id: 'a1', obra_id: pisos.obra_id, nombre: pisos.nombre, desde: HOY }],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: HOY }])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
})

test('elegir la misma obra no escribe nada', () => {
  const plan = planDeCambioDeObra({
    vigentes: vigenteEnPisos, destino: { id: pisos.obra_id, nombre: pisos.nombre }, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [])
  assert.equal(plan.abrir, null)
  assert.equal(plan.sinCambio, true)
  assert.equal(plan.acuse, 'Ya estaba en PISOS INDUSTRIALES.')
})

test('«Sin obra» sólo cierra: no abre una asignación a ninguna parte', () => {
  const plan = planDeCambioDeObra({ vigentes: vigenteEnPisos, destino: null, hoy: HOY })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.equal(plan.abrir, null)
  assert.equal(plan.acuse, 'Desde hoy sin obra · antes PISOS INDUSTRIALES.')
})

test('quien no tenía ninguna obra sólo abre, y el acuse no inventa un «antes»', () => {
  const plan = planDeCambioDeObra({ vigentes: [], destino: salon, hoy: HOY })
  assert.deepEqual(plan.cerrar, [])
  assert.deepEqual(plan.abrir, { obra_id: 'salon-comercial', desde: HOY })
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL.')
})

test('«Sin obra» sobre quien ya no tenía ninguna no escribe nada', () => {
  const plan = planDeCambioDeObra({ vigentes: [], destino: null, hoy: HOY })
  assert.equal(plan.sinCambio, true)
  assert.deepEqual(plan.cerrar, [])
})

test('con dos obras vigentes, elegir una cierra la otra y no reabre la elegida', () => {
  const plan = planDeCambioDeObra({
    vigentes: [{ id: 'a1', ...pisos }, { id: 'a2', obra_id: salon.id, nombre: salon.nombre, desde: '2026-08-15' }],
    destino: salon, hoy: HOY,
  })
  assert.deepEqual(plan.cerrar, [{ id: 'a1', hasta: AYER }])
  assert.equal(plan.abrir, null, 'la asignación al destino ya existía: reabrirla partiría el período')
  assert.equal(plan.acuse, 'Desde hoy en SALÓN COMERCIAL · antes PISOS INDUSTRIALES.')
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
