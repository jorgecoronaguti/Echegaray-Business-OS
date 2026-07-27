import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contraparteDe, esVencida, justificacionEconomica, generarBorrador, gobernanza,
  prioridadCfo, claveCfo, accionProactiva, alertasDeResumen, generarAccionesProactivas,
  enriquecerPlan, cicloCfoProactivo,
} from './cfo-proactivo.mjs'
import { claveEstable } from './plan-ejecucion.mjs'

// Un plan realista con las clases de acción y horizontes acumulados (dias_7 ⊂ dias_30), tal como lo
// produce planTesoreria(). Los números son los que el motor ya calculó — el CFO los CONSUME, no recalcula.
function planFake() {
  const cobrarVencida = {
    id: 'a1', fecha: '2026-07-24', tipo: 'cobrar', descripcion: 'Cobrar MESSINA $4.300.876',
    motivo: 'cobranza con fecha cumplida — es capital de trabajo que ya debería estar',
    impacto_pesos: 4300876, costo_financiero: 0, efecto_liquidez: 4300876, requiere_aprobacion: false, dependencias: [],
  }
  const pagarVencido = {
    id: 'a2', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000',
    motivo: 'vencido — el costo de esperar ya corre', impacto_pesos: 700000, costo_financiero: 0, efecto_liquidez: -700000,
    medio: 'Transferencia (VEP)', requiere_aprobacion: true, dependencias: [],
  }
  const financiar = {
    id: 'a3', fecha: '2026-07-24', tipo: 'financiar', descripcion: 'Usar descubierto por $800.000',
    motivo: 'crítico: se paga aunque la caja no alcance', impacto_pesos: 800000, costo_financiero: 45000, efecto_liquidez: 800000,
    excede_limite: false, requiere_aprobacion: true, dependencias: [],
  }
  const cancelar = {
    id: 'a4', fecha: '2026-07-26', tipo: 'cancelar_financiacion', descripcion: 'Cancelar $800.000 de la línea',
    motivo: 'entró caja: se repaga la línea', impacto_pesos: 800000, costo_financiero: 0, efecto_liquidez: -800000,
    requiere_aprobacion: true, dependencias: ['a1'],
  }
  const postergar = {
    id: 'a5', fecha: '2026-07-25', tipo: 'postergar', descripcion: 'Postergar Ferretería Norte $1.000.000',
    motivo: 'no es crítico y pagarlo hoy perforaría la liquidez mínima', impacto_pesos: 1000000, costo_financiero: 0, efecto_liquidez: 0,
    requiere_aprobacion: true, dependencias: [],
  }
  const resumen = { excede_limite_linea: false, linea_maxima_usada: 800000, limite_linea: 20000000 }
  return {
    estado: 'ok', fecha: '24/7/2026',
    horizontes: {
      dias_7: { titulo: 'Próximos 7 días', acciones: [cobrarVencida, pagarVencido, financiar, cancelar, postergar], resumen },
      // dias_30 REPITE la cobranza vencida (horizontes acumulados) + una acción nueva → prueba dedup.
      dias_30: {
        titulo: 'Próximos 30 días',
        acciones: [cobrarVencida, { id: 'b1', fecha: '2026-08-10', tipo: 'pagar', descripcion: 'Pagar Proveedor Z $200.000', motivo: 'entra en la caja disponible', impacto_pesos: 200000, costo_financiero: 0, efecto_liquidez: -200000, requiere_aprobacion: true, dependencias: [] }],
        resumen,
      },
    },
  }
}

// ─── contraparte / vencida ───

test('contraparteDe saca el cliente/proveedor de la descripción canónica del plan', () => {
  assert.equal(contraparteDe({ descripcion: 'Cobrar MESSINA $4.300.876' }), 'MESSINA')
  assert.equal(contraparteDe({ descripcion: 'Pagar Ferretería Norte $1.000.000' }), 'Ferretería Norte')
  assert.equal(contraparteDe({ descripcion: 'Usar descubierto por $800.000' }), 'descubierto')
  assert.equal(contraparteDe({ descripcion: '' }), null) // no inventa
})

test('esVencida se lee del motivo que el plan ya escribió, no se recalcula una fecha', () => {
  assert.equal(esVencida({ motivo: 'vencido — el costo de esperar ya corre' }), true)
  assert.equal(esVencida({ motivo: 'entra en la caja disponible' }), false)
})

// ─── consume, NO recalcula ───

test('CONSUME sin recalcular: el monto y el detalle económico son EXACTAMENTE los del plan', () => {
  const a = { tipo: 'financiar', descripcion: 'Usar descubierto por $800.000', impacto_pesos: 800000, costo_financiero: 45000, efecto_liquidez: 800000, motivo: 'crítico' }
  const pa = accionProactiva(a)
  assert.equal(pa.monto, 800000)                       // = impacto_pesos, sin tocar
  assert.equal(pa.detalle_economico.costo_financiero, 45000) // = costo_financiero, sin tocar
  assert.equal(pa.detalle_economico.efecto_liquidez, 800000)
  const j = justificacionEconomica(a)
  assert.equal(j.monto, 800000)
  assert.equal(j.costo_financiero, 45000)
  assert.match(j.texto, /\$800\.000/) // la justificación cita el número del plan, no uno nuevo
})

test('la suma de los montos de las acciones del CFO = la suma del plan (no se inventa ni se pierde plata)', () => {
  const plan = planFake()
  const r = generarAccionesProactivas(plan, { hoy: new Date('2026-07-24T12:00:00Z') })
  const sumaCfo = r.acciones.filter((a) => a.tipo_cfo !== 'alertar_vencimiento').reduce((s, a) => s + a.monto, 0)
  // Acciones únicas del plan (dedup por clave estable, igual que el CFO).
  const vistas = new Map()
  for (const h of Object.values(plan.horizontes)) for (const a of h.acciones) vistas.set(claveEstable(a), a)
  const sumaPlan = [...vistas.values()].reduce((s, a) => s + Math.round(a.impacto_pesos), 0)
  assert.equal(sumaCfo, sumaPlan)
})

// ─── borradores ───

test('genera un BORRADOR de reclamo para la cobranza vencida, marcado como sujeto a aprobación humana', () => {
  const a = { tipo: 'cobrar', descripcion: 'Cobrar MESSINA $4.300.876', impacto_pesos: 4300876, motivo: 'cobranza con fecha cumplida — ya debería estar' }
  const b = generarBorrador(a, { empresa: 'Echegaray Construcciones' })
  assert.ok(b && b.cuerpo)
  assert.match(b.cuerpo, /MESSINA/)
  assert.match(b.cuerpo, /\$4\.300\.876/)
  assert.match(b.nota, /aprobación humana/i)
})

test('genera borrador de negociación para postergar, y NO genera borrador para pagar/financiar', () => {
  assert.ok(generarBorrador({ tipo: 'postergar', descripcion: 'Postergar Ferretería Norte $1.000.000', impacto_pesos: 1000000 }))
  assert.equal(generarBorrador({ tipo: 'pagar', descripcion: 'Pagar AFIP $700.000', impacto_pesos: 700000 }), null)
  assert.equal(generarBorrador({ tipo: 'financiar', descripcion: 'Usar descubierto por $800.000', impacto_pesos: 800000 }), null)
})

// ─── GOBERNANZA: efecto externo ⇒ Nivel E / requiere aprobación ───

test('GOBERNANZA: emitir la propuesta es SIEMPRE Nivel D; el paso externo con efecto es Nivel E', () => {
  const g = gobernanza({ tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' })
  assert.equal(g.emision.nivel, 'D')      // emitir es interno/reversible
  assert.equal(g.efecto_externo, 'plata')
  assert.equal(g.ejecucion.nivel, 'E')     // mover plata es Nivel E
  assert.equal(g.ejecucion.requiere_aprobacion, true)
  assert.equal(g.ejecucion.via, 'orq.pending_operations')
})

test('TODA acción con efecto externo sale marcada Nivel E / requiere aprobación; la alerta es D pura', () => {
  const r = generarAccionesProactivas(planFake(), { hoy: new Date('2026-07-24T12:00:00Z') })
  for (const a of r.acciones) {
    if (a.efecto_externo) {
      assert.equal(a.ejecucion.nivel, 'E', `${a.tipo_cfo} con efecto externo debe ser Nivel E`)
      assert.equal(a.ejecucion.requiere_aprobacion, true)
      assert.equal(a.requiere_aprobacion, true)
    } else {
      // Alerta informativa: Nivel D, sin ejecución externa, sin aprobación.
      assert.equal(a.ejecucion, null)
      assert.equal(a.requiere_aprobacion, false)
    }
    // La emisión de la propuesta NUNCA es más que Nivel D.
    assert.equal(a.emision.nivel, 'D')
  }
})

test('una acción con efecto de comunicación (cobrar/postergar) también es Nivel E (no manda sola)', () => {
  assert.equal(gobernanza({ tipo: 'cobrar', descripcion: 'Cobrar X $1' }).efecto_externo, 'comunicacion')
  assert.equal(gobernanza({ tipo: 'cobrar', descripcion: 'Cobrar X $1' }).ejecucion.nivel, 'E')
  assert.equal(gobernanza({ tipo: 'postergar', descripcion: 'Postergar X $1' }).ejecucion.requiere_aprobacion, true)
})

// ─── PRIORIZACIÓN ───

test('PRIORIZACIÓN: lo vencido pesa más que lo futuro; entre iguales manda la magnitud', () => {
  const hoy = new Date('2026-07-24T12:00:00Z')
  const vencido = prioridadCfo({ tipo: 'pagar', fecha: '2026-07-24', motivo: 'vencido — corre', impacto_pesos: 100000 }, hoy)
  const futuro = prioridadCfo({ tipo: 'pagar', fecha: '2026-08-10', motivo: 'entra en caja', impacto_pesos: 100000 }, hoy)
  assert.ok(vencido > futuro, 'un pago vencido prioriza sobre uno futuro del mismo monto')
  const grande = prioridadCfo({ tipo: 'pagar', fecha: '2026-08-10', motivo: 'entra en caja', impacto_pesos: 5000000 }, hoy)
  assert.ok(grande > futuro, 'a igual urgencia, mayor monto prioriza')
})

test('la lista sale ORDENADA por prioridad descendente y la cobranza vencida grande va primera', () => {
  const r = generarAccionesProactivas(planFake(), { hoy: new Date('2026-07-24T12:00:00Z') })
  for (let i = 1; i < r.acciones.length; i++) {
    assert.ok(r.acciones[i - 1].prioridad >= r.acciones[i].prioridad, 'orden no creciente de prioridad')
  }
  assert.equal(r.acciones[0].tipo_cfo, 'reclamar_cobranza') // MESSINA vencida $4,3M encabeza
})

// ─── IDEMPOTENCIA ───

test('IDEMPOTENCIA: la clave del CFO se apoya en la clave estable del plan y no depende del id de corrida', () => {
  const a = { id: 'x1', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }
  const b = { id: 'zzz', fecha: '2026-07-24', tipo: 'pagar', descripcion: 'Pagar AFIP $700.000' }
  assert.equal(claveCfo(a), claveCfo(b))
  assert.match(claveCfo(a), /^cfo:plan-tesoreria:/)
})

test('IDEMPOTENCIA: dos corridas del mismo plan producen la misma lista de claves', () => {
  const hoy = new Date('2026-07-24T12:00:00Z')
  const uno = generarAccionesProactivas(planFake(), { hoy }).acciones.map((a) => a.clave).sort()
  const dos = generarAccionesProactivas(planFake(), { hoy }).acciones.map((a) => a.clave).sort()
  assert.deepEqual(uno, dos)
})

test('IDEMPOTENCIA: horizontes acumulados NO duplican una acción (la cobranza aparece en dias_7 y dias_30)', () => {
  const r = generarAccionesProactivas(planFake(), { hoy: new Date('2026-07-24T12:00:00Z') })
  const claves = r.acciones.map((a) => a.clave)
  assert.equal(new Set(claves).size, claves.length, 'sin claves repetidas')
  const cobranzas = r.acciones.filter((a) => a.tipo_cfo === 'reclamar_cobranza')
  assert.equal(cobranzas.length, 1) // MESSINA una sola vez pese a estar en dos horizontes
})

// ─── ALERTAS Nivel D ───

test('alertasDeResumen emite una alerta Nivel D cuando el plan excede el límite de la línea; nada si no', () => {
  assert.equal(alertasDeResumen({ excede_limite_linea: false }).length, 0)
  const al = alertasDeResumen({ excede_limite_linea: true, linea_maxima_usada: 25000000, limite_linea: 20000000 }, { horizonte: 'dias_7' })
  assert.equal(al.length, 1)
  assert.equal(al[0].efecto_externo, null)
  assert.equal(al[0].requiere_aprobacion, false)
})

// ─── F2: contexto de precisión ───

test('la precisión del forecast (F2) se ANEXA como advertencia sin tocar ningún monto', () => {
  const precision = { por_metrica_horizonte: [{ metrica: 'saldo_proyectado_final', horizonte: 'dias_7', mape: 0.12, n_medido: 6, sesgo: { sistematico: true, direccion: 'sobreestima' } }] }
  const r = generarAccionesProactivas(planFake(), { hoy: new Date('2026-07-24T12:00:00Z'), precision })
  assert.match(r.nota_precision_forecast, /sobreestima/)
  // Los montos siguen siendo los del plan (la nota no los cambia).
  assert.equal(r.acciones.find((a) => a.tipo_cfo === 'reclamar_cobranza').monto, 4300876)
})

// ─── enriquecerPlan (puente hacia plan-ejecucion) ───

test('enriquecerPlan adjunta borrador/justificación/tipo_cfo a las acciones sin tocar los montos', () => {
  const plan = planFake()
  const prop = generarAccionesProactivas(plan, { hoy: new Date('2026-07-24T12:00:00Z') })
  const ep = enriquecerPlan(plan, prop)
  const cobranza = ep.horizontes.dias_7.acciones.find((a) => a.tipo === 'cobrar')
  assert.equal(cobranza.impacto_pesos, 4300876)   // monto intacto
  assert.ok(cobranza.borrador)                      // borrador adjunto
  assert.ok(cobranza.justificacion_economica)
  assert.equal(cobranza.tipo_cfo, 'reclamar_cobranza')
})

// ─── BORDE: Nivel D por defecto (no crea tareas), y delega SÓLO con autorización ───

test('BORDE sin autorización: emite la lista + borradores y NO crea ninguna tarea (Nivel D puro)', async () => {
  let tocoSinc = false
  const r = await cicloCfoProactivo({
    planTesoreria: async () => planFake(),
    sincronizarEjecucion: async () => { tocoSinc = true; return {} },
  }, { hoy: new Date('2026-07-24T12:00:00Z') })
  assert.equal(r.estado, 'ok')
  assert.ok(r.acciones.length > 0)
  assert.ok(r.con_borrador >= 1)
  assert.equal(r.ejecucion.creada, false)
  assert.equal(tocoSinc, false, 'sin autorización no delega la creación de tareas')
})

test('BORDE con autorización: delega en sincronizarEjecucion pasando el plan ENRIQUECIDO (borrador en inputs)', async () => {
  let planRecibido = null
  const r = await cicloCfoProactivo({
    planTesoreria: async () => planFake(),
    sincronizarEjecucion: async (_deps, opts) => { planRecibido = opts.planPreCalculado; return { estado: 'ok', creadas: 6 } },
  }, { hoy: new Date('2026-07-24T12:00:00Z'), autorizadoPor: 'cfo-ia' })
  assert.equal(r.ejecucion.estado, 'ok')
  assert.ok(planRecibido, 'delegó a plan-ejecucion')
  const cobranza = planRecibido.horizontes.dias_7.acciones.find((a) => a.tipo === 'cobrar')
  assert.ok(cobranza.borrador, 'el borrador viaja en el plan enriquecido para llegar a inputs de la tarea')
})

test('BORDE degrada honesto: si el plan no está disponible, no propone nada', async () => {
  const r = await cicloCfoProactivo({ planTesoreria: async () => ({ estado: 'sin dato', motivo: 'sin caja' }) }, {})
  assert.equal(r.estado, 'sin dato')
  assert.deepEqual(r.acciones, [])
})
