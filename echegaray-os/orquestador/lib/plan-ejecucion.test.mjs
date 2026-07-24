import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveEstable, tareaDeAccion, construirTareas, sincronizarEjecucion, MAPEO, SUBJECT_TYPE,
} from './plan-ejecucion.mjs'

// Un plan mínimo con las cinco clases de acción y una dependencia real.
function planFake() {
  return {
    estado: 'ok', fecha: '24/7/2026',
    horizontes: {
      dias_7: {
        titulo: 'Próximos 7 días',
        acciones: [
          { id: 'a1', fecha: '2026-07-24', tipo: 'cobrar', descripcion: 'Cobrar MESSINA $4.300.876', motivo: 'ingreso', dependencias: [], requiere_aprobacion: false },
          { id: 'a2', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000', motivo: 'vencido', dependencias: [], requiere_aprobacion: true },
          { id: 'a3', fecha: '2026-07-24', tipo: 'financiar', descripcion: 'Usar descubierto por $800.000', motivo: 'crítico', dependencias: [], requiere_aprobacion: true },
          { id: 'a4', fecha: '2026-07-26', tipo: 'cancelar_financiacion', descripcion: 'Cancelar $800.000 de la línea', motivo: 'entró caja', dependencias: ['a1'], requiere_aprobacion: true },
          { id: 'a5', fecha: '2026-07-25', tipo: 'postergar', descripcion: 'Postergar Ferretería X $1.000.000', motivo: 'liquidez', dependencias: [], requiere_aprobacion: true },
        ],
      },
    },
  }
}

test('la clave estable NO depende del id de corrida del plan: mismo contenido → misma clave', () => {
  const a = { id: 'a99', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }
  const b = { id: 'zzz', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }
  assert.equal(claveEstable(a), claveEstable(b)) // idempotencia: el id del plan no entra en la clave
  assert.match(claveEstable(a), /^plan-tesoreria:2026-07-24:pagar:/)
})

test('cada tipo de acción va al especialista correcto', () => {
  assert.equal(MAPEO.cobrar.agent, 'comercial')
  assert.equal(MAPEO.pagar.agent, 'administracion')
  assert.equal(MAPEO.postergar.agent, 'compras')
  assert.equal(MAPEO.financiar.agent, 'cfo')
  assert.equal(MAPEO.cancelar_financiacion.agent, 'cfo')
})

test('la tarea corre con una capacidad de PREPARACIÓN interna, no con la capacidad externa', () => {
  const t = tareaDeAccion({ fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000', requiere_aprobacion: true }, {})
  assert.equal(t.capability_slug, 'advise.admin') // interna, clr C
  assert.equal(t.inputs.aprobacion.capability_externa, 'finance.payment') // el paso con plata, Nivel E/F
  assert.equal(t.inputs.aprobacion.requiere_aprobacion, true)
  assert.match(t.success_criteria, /APROBACIÓN/)
})

test('la tarea guarda la trazabilidad: subject_type, acción origen y evidencia requerida', () => {
  const t = tareaDeAccion({ fecha: '2026-07-24', tipo: 'cobrar', descripcion: 'Cobrar MESSINA $4.300.876', motivo: 'x' }, { planFecha: '24/7/2026' })
  assert.equal(t.subject_type, SUBJECT_TYPE)
  assert.equal(t.inputs.origen, 'finanzas.plan_tesoreria')
  assert.equal(t.inputs.accion.descripcion, 'Cobrar MESSINA $4.300.876')
  assert.ok(t.inputs.evidencia_requerida)
})

test('un tipo de acción desconocido no inventa especialista: devuelve null', () => {
  assert.equal(tareaDeAccion({ tipo: 'inexistente', descripcion: 'x' }, {}), null)
})

test('construirTareas traduce las dependencias del plan a claves estables', () => {
  const { tareas } = construirTareas(planFake(), { horizonte: 'dias_7' })
  const cancelar = tareas.find((t) => t.type === 'tesoreria_cancelar_linea')
  const cobrar = tareas.find((t) => t.type === 'tesoreria_cobrar')
  assert.deepEqual(cancelar._depsClaves, [cobrar.dedupe_key]) // a4 dependía de a1
})

test('construirTareas arma una tarea por acción del horizonte', () => {
  const { tareas, ignoradas } = construirTareas(planFake(), { horizonte: 'dias_7' })
  assert.equal(tareas.length, 5)
  assert.equal(ignoradas.length, 0)
})

test('dry-run no escribe nada y reporta por especialista', async () => {
  const deps = {
    planTesoreria: async () => planFake(),
    query: async () => { throw new Error('no debería tocar la base en dry') },
    withTx: async () => { throw new Error('no debería abrir transacción en dry') },
  }
  const r = await sincronizarEjecucion(deps, { horizonte: 'dias_7', dry: true })
  assert.equal(r.estado, 'dry')
  assert.equal(r.total, 5)
  assert.deepEqual(r.por_especialista, { comercial: 1, administracion: 1, cfo: 2, compras: 1 })
})

test('si el plan no está disponible, no crea nada (degrada honesto)', async () => {
  const deps = { planTesoreria: async () => ({ estado: 'sin dato', motivo: 'sin caja' }) }
  const r = await sincronizarEjecucion(deps, {})
  assert.equal(r.estado, 'sin dato')
  assert.equal(r.creadas, 0)
})

test('el enqueue usa dedupe_key y comparte un correlation_id; las deps van a orq.task_deps', async () => {
  const enqueued = []
  const deps2 = []
  const correlaciones = new Set()
  const fakeClient = {
    query: async (sql, params) => {
      if (/orq\.enqueue_task/.test(sql)) { const p = JSON.parse(params[0]); enqueued.push(p); return { rows: [{ id: `id-${p.dedupe_key}` }] } }
      if (/update orq\.tasks set correlation_id/.test(sql)) { correlaciones.add(params[0]); return { rows: [] } }
      if (/insert into orq\.task_deps/.test(sql)) { deps2.push(params); return { rows: [] } }
      if (/update orq\.tasks set state='cancelled'/.test(sql)) return { rows: [] }
      return { rows: [] }
    },
  }
  const deps = {
    planTesoreria: async () => planFake(),
    withTx: async (fn) => fn(fakeClient),
    query: async () => ({ rows: [] }), // para marcarEjecutado (no toca la base real en el test)
  }
  const r = await sincronizarEjecucion(deps, { horizonte: 'dias_7', autorizadoPor: 'director' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.creadas, 5)
  assert.ok(enqueued.every((p) => p.dedupe_key && p.dedupe_key.startsWith('plan-tesoreria:')), 'cada tarea con dedupe_key estable')
  assert.equal(correlaciones.size, 1, 'un solo correlation_id para todo el plan')
  assert.equal(r.dependencias, 1) // a4 → a1
  assert.deepEqual(deps2[0], ['id-plan-tesoreria:2026-07-26:cancelar_financiacion:cancelar-800-000-de-la-linea',
    'id-plan-tesoreria:2026-07-24:cobrar:cobrar-messina-4-300-876'])
})

test('idempotencia: dos corridas del mismo plan producen las mismas claves (enqueue deduplica)', () => {
  const uno = construirTareas(planFake(), {}).tareas.map((t) => t.dedupe_key).sort()
  const dos = construirTareas(planFake(), {}).tareas.map((t) => t.dedupe_key).sort()
  assert.deepEqual(uno, dos)
})

// ═══ CANDADO DE AUTORIZACIÓN (24/07) — no crear tareas sin autoridad explícita ═══

test('sin autorizadoPor NO crea tareas: devuelve el plan como pendiente_ejecucion', async () => {
  let tocoBase = false
  const deps = {
    planTesoreria: async () => planFake(),
    withTx: async () => { tocoBase = true; return {} },
  }
  const r = await sincronizarEjecucion(deps, { horizonte: 'dias_7' }) // sin autorizadoPor
  assert.equal(r.estado, 'pendiente_ejecucion')
  assert.equal(tocoBase, false, 'no debe abrir transacción ni crear tareas')
  assert.equal(r.total, 5)
  assert.match(r.nota, /autorización/)
})

test('con autorizadoPor válido SÍ crea tareas', async () => {
  const deps = {
    planTesoreria: async () => planFake(),
    query: async () => ({ rows: [] }), // para marcarEjecutado
    withTx: async (fn) => fn({ query: async (sql, p) => {
      if (/enqueue_task/.test(sql)) { return { rows: [{ id: `id-${JSON.parse(p[0]).dedupe_key}` }] } }
      return { rows: [] }
    } }),
  }
  const r = await sincronizarEjecucion(deps, { horizonte: 'dias_7', autorizadoPor: 'director' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.autorizado_por, 'director')
  assert.equal(r.creadas, 5)
})
