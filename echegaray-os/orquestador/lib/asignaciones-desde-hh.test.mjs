import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarTramos, conciliar, umbralQuincena, diasHabilesEntre, NOTAS_JORNALES, MARCA_JORNALES,
} from './asignaciones-desde-hh.mjs'

const P = 'p-1'
const HOY = '2026-09-08'
const activos = new Set([P])
const fila = (fecha, obra_id, horas = 8, tipo_hora = 'normal') => ({ persona_id: P, fecha, obra_id, horas, tipo_hora })
const habiles = (desde, n, obra) => {
  const out = []
  let d = new Date(`${desde}T00:00:00Z`)
  while (out.length < n) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(fila(d.toISOString().slice(0, 10), obra))
    d = new Date(d.getTime() + 86_400_000)
  }
  return out
}

test('umbral de quincena: en curso o la anterior', () => {
  assert.equal(umbralQuincena('2026-09-08'), '2026-08-16')
  assert.equal(umbralQuincena('2026-09-20'), '2026-09-01')
  assert.equal(umbralQuincena('2026-01-03'), '2025-12-16')
})

test('días hábiles entre: el fin de semana no cuenta', () => {
  assert.equal(diasHabilesEntre('2026-09-04', '2026-09-07'), 0) // viernes → lunes
  assert.equal(diasHabilesEntre('2026-09-01', '2026-09-02'), 0)
  assert.equal(diasHabilesEntre('2026-08-28', '2026-09-08'), 6)
})

test('un tramo por obra, días y horas sumados; el fin de semana no lo parte', () => {
  const filas = [...habiles('2026-08-31', 5, 'la-estrella'), fila('2026-09-07', 'la-estrella', 9)]
  const { tramos } = armarTramos(filas, { hoy: HOY, activos })
  assert.equal(tramos.length, 1)
  assert.deepEqual(
    { ...tramos[0] },
    { persona_id: P, obra_id: 'la-estrella', desde: '2026-08-31', hasta: '2026-09-07', dias: 6, horas: 49, abierto: true },
  )
})

test('cambio de obra = tramo nuevo; volver a la primera obra es otro tramo', () => {
  const filas = [
    fila('2026-03-02', 'A'), fila('2026-03-03', 'A'), fila('2026-03-04', 'B'), fila('2026-03-05', 'A'),
  ]
  const { tramos } = armarTramos(filas, { hoy: HOY, activos })
  assert.deepEqual(tramos.map((t) => [t.obra_id, t.desde, t.hasta, t.abierto]), [
    ['A', '2026-03-02', '2026-03-03', false],
    ['B', '2026-03-04', '2026-03-04', false],
    ['A', '2026-03-05', '2026-03-05', false], // último día en marzo: viejo → cerrado
  ])
})

test('hueco de 7 días hábiles no parte; de 8 sí', () => {
  // lunes 03/08 y luego el 13/08 (jueves): entre medio 7 hábiles (4,5,6,7,10,11,12)
  const sinCorte = armarTramos([fila('2026-08-03', 'A'), fila('2026-08-13', 'A')], { hoy: HOY, activos })
  assert.equal(sinCorte.tramos.length, 1)
  // 03/08 → 14/08 (viernes): 8 hábiles entre medio
  const conCorte = armarTramos([fila('2026-08-03', 'A'), fila('2026-08-14', 'A')], { hoy: HOY, activos })
  assert.equal(conCorte.tramos.length, 2)
  assert.deepEqual(conCorte.tramos.map((t) => t.desde), ['2026-08-03', '2026-08-14'])
})

test('doble obra en un día: gana la de más horas y se reporta', () => {
  const filas = [fila('2026-09-01', 'A', 8), fila('2026-09-02', 'A', 3), fila('2026-09-02', 'B', 5)]
  const { tramos, dobles } = armarTramos(filas, { hoy: HOY, activos })
  assert.deepEqual(tramos.map((t) => [t.obra_id, t.desde, t.hasta, t.horas]), [
    ['A', '2026-09-01', '2026-09-01', 8], ['B', '2026-09-02', '2026-09-02', 5],
  ])
  assert.deepEqual(dobles, [{
    persona_id: P, fecha: '2026-09-02', elegida: 'B', horas_elegida: 5, descartadas: [{ obra_id: 'A', horas: 3 }],
  }])
})

test('ausencia y licencia heredan la obra del tramo y lo mantienen vivo; sin tramo no cuentan', () => {
  const filas = [
    fila('2026-08-10', 'B', 0, 'ausencia'),          // antes de trabajar: no hay obra que heredar
    fila('2026-08-17', 'A'),
    fila('2026-08-18', 'B', 0, 'ausencia'),          // su obra en la fila no manda: hereda A
    fila('2026-08-28', 'A', 0, 'licencia'),      // 7 hábiles después: sigue en el tramo
  ]
  const { tramos } = armarTramos(filas, { hoy: HOY, activos })
  assert.equal(tramos.length, 1)
  assert.deepEqual([tramos[0].obra_id, tramos[0].desde, tramos[0].hasta, tramos[0].dias, tramos[0].abierto],
    ['A', '2026-08-17', '2026-08-28', 1, true])
})

test('el último tramo queda abierto sólo si es reciente y la persona está activa', () => {
  const viejo = armarTramos([fila('2026-08-14', 'A')], { hoy: HOY, activos })
  assert.equal(viejo.tramos[0].abierto, false)
  const reciente = armarTramos([fila('2026-08-17', 'A')], { hoy: HOY, activos })
  assert.equal(reciente.tramos[0].abierto, true)
  const inactivo = armarTramos([fila('2026-09-07', 'A')], { hoy: HOY, activos: new Set() })
  assert.equal(inactivo.tramos[0].abierto, false)
})

// ─── conciliar ───────────────────────────────────────────────────────────────────────────────

const tramoAbierto = { persona_id: P, obra_id: 'A', desde: '2026-06-01', hasta: '2026-09-07', dias: 60, horas: 480, abierto: true }

test('sin nada previo: se inserta con rol integrante, notas marcadas y hasta null si está abierto', () => {
  const r = conciliar([tramoAbierto], [])
  assert.equal(r.insertar.length, 1)
  assert.deepEqual(r.insertar[0], {
    persona_id: P, obra_id: 'A', rol: 'integrante', desde: '2026-06-01', hasta: null, dias: 60, horas: 480, notas: NOTAS_JORNALES,
  })
})

test('asignación web vigente de la MISMA obra creada hoy: el tramo se cierra el día anterior y no abre nada', () => {
  const web = { id: 'w', persona_id: P, obra_id: 'A', desde: '2026-09-08', hasta: null, notas: null }
  const r = conciliar([tramoAbierto], [web])
  assert.equal(r.insertar.length, 1)
  assert.equal(r.insertar[0].hasta, '2026-09-07')
  assert.equal(r.recortados.length, 1)
  assert.equal(r.cerrados.length, 0)
})

test('asignación web de la misma obra que ya cubre el inicio del tramo: no se inserta y se reporta', () => {
  const web = { id: 'w', persona_id: P, obra_id: 'A', desde: null, hasta: null, notas: null }
  const r = conciliar([tramoAbierto], [web])
  assert.equal(r.insertar.length, 0)
  assert.equal(r.omitidos[0].motivo, 'solapa_web')
  assert.equal(r.omitidos[0].contra.id, 'w')
})

test('asignación web vigente en OTRA obra: el tramo abierto se cierra en su último día', () => {
  const web = { id: 'w', persona_id: P, obra_id: 'B', desde: '2026-09-08', hasta: null, notas: null }
  const r = conciliar([tramoAbierto], [web])
  assert.equal(r.insertar[0].hasta, '2026-09-07')
  assert.equal(r.cerrados.length, 1)
  assert.equal(r.cerrados[0].contra.id, 'w')
})

test('asignación web CERRADA en otra obra no cierra el tramo; una de otra persona tampoco', () => {
  const cerrada = { id: 'w', persona_id: P, obra_id: 'B', desde: null, hasta: '2026-09-08', notas: null }
  const ajena = { id: 'x', persona_id: 'p-2', obra_id: 'B', desde: null, hasta: null, notas: null }
  const r = conciliar([tramoAbierto], [cerrada, ajena])
  assert.equal(r.insertar[0].hasta, null)
  assert.equal(r.cerrados.length, 0)
})

test('tramo cerrado que no se solapa con la web se inserta tal cual', () => {
  const t = { ...tramoAbierto, desde: '2026-02-02', hasta: '2026-03-31', abierto: false }
  const web = { id: 'w', persona_id: P, obra_id: 'A', desde: '2026-09-08', hasta: null, notas: null }
  const r = conciliar([t], [web])
  assert.deepEqual([r.insertar[0].desde, r.insertar[0].hasta], ['2026-02-02', '2026-03-31'])
  assert.equal(r.recortados.length, 0)
})

test('idempotente: una fila ya importada (misma persona+obra+desde) no se repite', () => {
  const previa = { id: 'j', persona_id: P, obra_id: 'A', desde: '2026-06-01', hasta: null, notas: `${MARCA_JORNALES} · 08/09/2026` }
  const r = conciliar([tramoAbierto], [previa])
  assert.equal(r.insertar.length, 0)
  assert.equal(r.omitidos[0].motivo, 'ya_importado')
})

test('las asignaciones de prueba (ZZ-E2E / PRUEBA) se ignoran', () => {
  const prueba = { id: 'z', persona_id: P, obra_id: 'ZZ-E2E-obra', desde: null, hasta: null, notas: '[PRUEBA E2E]' }
  const r = conciliar([tramoAbierto], [prueba])
  assert.equal(r.insertar[0].hasta, null)
  assert.equal(r.cerrados.length, 0)
})

// ═══ planDeConjunto: el historial de JORNALES es un DERIVADO, se recalcula entero ═══
import { planDeConjunto } from './asignaciones-desde-hh.mjs'

const asig = (o) => ({ id: o.id, persona_id: o.persona_id ?? P, obra_id: o.obra_id, desde: o.desde, hasta: o.hasta ?? null, notas: o.notas ?? NOTAS_JORNALES })
const tramo = (o) => ({ persona_id: o.persona_id ?? P, obra_id: o.obra_id, desde: o.desde, hasta: o.hasta, dias: 1, horas: 8, abierto: !!o.abierto })

test('conjunto: sin filas previas, todo se inserta y nada se borra', () => {
  const r = planDeConjunto([tramo({ obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' })], [], { hoy: HOY })
  assert.equal(r.insertar.length, 1)
  assert.deepEqual(r.borrar, [])
})

test('conjunto: la fila que ya está idéntica se conserva — segunda corrida = 0 cambios', () => {
  const t = [tramo({ obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' })]
  const previas = [asig({ id: 'a1', obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' })]
  const r = planDeConjunto(t, previas, { hoy: HOY })
  assert.deepEqual([r.insertar.length, r.borrar.length, r.conservar.length], [0, 0, 1])
})

test('EL DEFECTO: el tramo cambió de fecha y la fila vieja quedaba viva al lado de la nueva', () => {
  const t = [tramo({ obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-05' })]
  const previas = [asig({ id: 'a1', obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' })]
  const r = planDeConjunto(t, previas, { hoy: HOY })
  assert.equal(r.insertar.length, 1)
  assert.deepEqual(r.borrar.map((x) => x.id), ['a1'])
})

test('conjunto: la asignación de la web ni se inserta ni se borra — no es de JORNALES', () => {
  const previas = [asig({ id: 'w1', obra_id: 'obra-web', desde: '2026-08-01', notas: 'la puso el jefe de obra' })]
  const r = planDeConjunto([], previas, { hoy: HOY })
  assert.deepEqual(r.borrar, [])
  assert.deepEqual(r.conservar, [])
})

test('conjunto: lo que empieza de hoy en adelante queda protegido aunque el histórico no lo produzca', () => {
  const previas = [asig({ id: 'f1', obra_id: 'obra-a', desde: HOY })]
  const r = planDeConjunto([], previas, { hoy: HOY })
  assert.deepEqual(r.borrar, [])
  assert.deepEqual(r.protegidas.map((x) => x.id), ['f1'])
})

test('conjunto: una protegida idéntica al tramo deseado no se duplica', () => {
  const t = [tramo({ obra_id: 'obra-a', desde: HOY, hasta: HOY, abierto: false })]
  const previas = [asig({ id: 'f1', obra_id: 'obra-a', desde: HOY, hasta: HOY })]
  const r = planDeConjunto(t, previas, { hoy: HOY })
  assert.deepEqual([r.insertar.length, r.borrar.length], [0, 0])
})

test('conjunto: dos filas de JORNALES iguales (duplicado histórico) dejan una y borran la otra', () => {
  const t = [tramo({ obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' })]
  const previas = [
    asig({ id: 'a1', obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' }),
    asig({ id: 'a2', obra_id: 'obra-a', desde: '2026-08-03', hasta: '2026-08-07' }),
  ]
  const r = planDeConjunto(t, previas, { hoy: HOY })
  assert.deepEqual([r.insertar.length, r.borrar.map((x) => x.id), r.conservar.map((x) => x.id)], [0, ['a2'], ['a1']])
})


// ═══ OBRA CERRADA: NI SE RECONSTRUYE NI SE REABRE (decisión del dueño 09/09/2026) ═══════════════
// El defecto que atrapan: el 08/09 GONZALEZ TOBARES JUAN GUILLERMO quedó VIGENTE en `la-estrella`
// —un cliente sin obra activa— porque su fila de JORNALES de ese día está rotulada así. Si se
// revierte la guarda de `armarTramos`, el primero de estos tests vuelve a ver el tramo abierto.

const CERRADAS = new Set(['la-estrella'])

test('obra cerrada: sus días no arman tramo y salen listados para decidir', () => {
  const filas = [...habiles('2026-09-01', 5, 'la-estrella')]
  const { tramos, cerradas } = armarTramos(filas, { hoy: HOY, activos, obrasCerradas: CERRADAS })
  assert.deepEqual(tramos, [])
  assert.equal(cerradas.length, 5)
  assert.deepEqual(cerradas[0], { persona_id: P, fecha: '2026-09-01', obra_id: 'la-estrella', horas: 8, tipo_hora: 'normal' })
})

test('obra cerrada: el día descartado NO estira el tramo de la obra de al lado', () => {
  // Sin la guarda, el día de la-estrella entraba como día sin obra («ausencia») y heredaba obra-a,
  // corriendo su `hasta` al 08/09 y dejándolo abierto. La obra de ayer no se hereda de una cerrada.
  const filas = [...habiles('2026-08-31', 4, 'obra-a'), fila('2026-09-08', 'la-estrella', 9)]
  const { tramos } = armarTramos(filas, { hoy: HOY, activos, obrasCerradas: CERRADAS })
  assert.equal(tramos.length, 1)
  assert.equal(tramos[0].obra_id, 'obra-a')
  assert.equal(tramos[0].hasta, '2026-09-03')
})

test('obra cerrada: aunque llegue un tramo armado por otro, conciliar no lo inserta', () => {
  const t = [tramo({ obra_id: 'la-estrella', desde: '2026-09-08', hasta: '2026-09-08', abierto: true })]
  const r = conciliar(t, [], { obrasCerradas: CERRADAS })
  assert.deepEqual(r.insertar, [])
  assert.deepEqual(r.omitidos.map((o) => o.motivo), ['obra_cerrada'])
})

test('obra cerrada: la asignación vieja es historia — no se borra ni se vuelve a insertar', () => {
  const previas = [asig({ id: 'v1', obra_id: 'la-estrella', desde: '2025-03-01', hasta: '2025-06-30' })]
  const r = planDeConjunto([], previas, { hoy: HOY, obrasCerradas: CERRADAS })
  assert.deepEqual(r.borrar, [])
  assert.deepEqual(r.protegidas.map((x) => x.id), ['v1'])
  assert.deepEqual(r.insertar, [])
})

test('obra cerrada: el día corta el tramo — no funde los dos tramos vecinos en uno', () => {
  // Sin esto, quitar el día de la obra cerrada dejaba pegados el tramo de antes y el de después:
  // «estuvo en obra-a del 31/08 al 07/09» cuando el 04/09 estuvo en otra parte. Son dos tramos.
  const filas = [
    ...habiles('2026-08-31', 4, 'obra-a'),
    fila('2026-09-04', 'la-estrella', 9),
    ...habiles('2026-09-07', 2, 'obra-a'),
  ]
  const { tramos } = armarTramos(filas, { hoy: HOY, activos, obrasCerradas: CERRADAS })
  assert.deepEqual(tramos.map((t) => [t.obra_id, t.desde, t.hasta]), [
    ['obra-a', '2026-08-31', '2026-09-03'],
    ['obra-a', '2026-09-07', '2026-09-08'],
  ])
})
