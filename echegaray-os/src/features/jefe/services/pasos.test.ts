import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarPlan, aporteDelPaso, planDePasos } from './pasos.ts'
import type { EscrituraDePasos, FirmaDePaso, PasoDeLaTarea } from './pasos.ts'

const p = (id: string, peso = 1, hecho_en: string | null = null): PasoDeLaTarea =>
  ({ id, nombre: id, peso, hecho_en })

// Los tres pasos del fixture `[PRUEBA E2E] Columna de encadenado H17`: peso 1 cada uno.
const COLUMNA = [p('armadura'), p('encofrado'), p('hormigonado')]

test('CADA PASO FIRMA LO QUE APORTA: tres pasos de peso igual aportan 33,3 puntos cada uno', () => {
  // El defecto que atrapa: la fila de ejecución se insertaba sin `cantidad` ni `avance_pct` y la
  // base la rechazaba con `obra_ejecucion_dice_algo`. Si el plan vuelve a producir una firma sin
  // número, este test se pone rojo antes que Postgres.
  assert.equal(aporteDelPaso(COLUMNA, 'armadura'), 33.3)
  const plan = planDePasos(COLUMNA, new Set(['armadura']))
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.deepEqual(plan.firmas, [{ paso_id: 'armadura', avance_pct: 33.3 }])
  for (const f of plan.firmas) {
    assert.ok(Number.isFinite(f.avance_pct), 'una firma sin avance_pct la rechaza el CHECK de la base')
  }
})

test('EL PESO MANDA, NO LA CANTIDAD DE PASOS: el que pesa el doble aporta el doble', () => {
  const pasos = [p('excavacion', 1), p('hormigon', 3)]
  assert.equal(aporteDelPaso(pasos, 'excavacion'), 25)
  assert.equal(aporteDelPaso(pasos, 'hormigon'), 75)
})

test('LAS FIRMAS NO SON LA FUENTE DEL PORCENTAJE: suman 99,9 y la actividad igual llega a 100', () => {
  // La vista `actividad_avance` calcula el avance por pasos desde `hecho_en`, no sumando
  // `obra_ejecucion.avance_pct`. Este test fija esa diferencia por escrito: si alguien mañana hace
  // que el avance por pasos salga de la suma de las firmas, la actividad terminada quedaría en
  // 99,9 % para siempre.
  const suma = COLUMNA.reduce((s, x) => s + (aporteDelPaso(COLUMNA, x.id) ?? 0), 0)
  assert.equal(Math.round(suma * 10) / 10, 99.9)
})

test('SIN PESO NO SE ESCRIBE NADA: el plan sale en error antes de tocar la base', () => {
  const sinPeso = [p('a', 0), p('b', 0)]
  const plan = planDePasos(sinPeso, new Set(['a']))
  assert.equal(plan.ok, false)
  if (plan.ok) return
  assert.match(plan.error, /no declaran cuánto pesa/)
})

test('una tarea por pasos sin pasos cargados lo dice, y no marca nada', () => {
  const plan = planDePasos([], new Set(['a']))
  assert.equal(plan.ok, false)
})

test('tocar y destocar el mismo paso no es un cambio', () => {
  const plan = planDePasos(COLUMNA, new Set())
  assert.equal(plan.ok, false)
  if (plan.ok) return
  assert.equal(plan.error, 'No cambiaste ningún paso.')
})

test('desmarcar es un cambio válido, y no lleva firma (un aporte negativo lo rechaza el CHECK)', () => {
  const plan = planDePasos([p('armadura', 1, '2026-08-25T12:06:12Z'), p('encofrado')], new Set())
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  assert.deepEqual(plan.desmarcar, ['armadura'])
  assert.deepEqual(plan.firmas, [])
  assert.deepEqual(plan.marcar, [])
})

/** Un escritor de mentira que anota el orden en el que lo llaman y puede fallar donde se le pida. */
function espia(falla?: 'firmar' | 'marcar' | 'desmarcar') {
  const orden: string[] = []
  const filas: FirmaDePaso[] = []
  const escritura: EscrituraDePasos = {
    async firmar(f) {
      orden.push('firmar'); filas.push(...f)
      return { error: falla === 'firmar' ? 'new row violates check constraint "obra_ejecucion_dice_algo"' : null }
    },
    async marcar() { orden.push('marcar'); return { error: falla === 'marcar' ? 'boom' : null } },
    async desmarcar() { orden.push('desmarcar'); return { error: falla === 'desmarcar' ? 'boom' : null } },
  }
  return { orden, filas, escritura }
}

test('PRIMERO SE FIRMA Y DESPUÉS SE MARCA — el desmarcado va último', async () => {
  const plan = planDePasos([p('armadura'), p('encofrado', 1, '2026-08-24T10:00:00Z')], new Set(['armadura']))
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  const e = espia()
  const r = await aplicarPlan(plan, e.escritura, '2026-08-25T12:00:00Z')
  assert.equal(r.ok, true)
  assert.deepEqual(e.orden, ['firmar', 'marcar', 'desmarcar'])
})

test('SI LA FIRMA REBOTA, EL PASO NO SE MARCA: el avance no se mueve sin su rastro', async () => {
  // Éste es el hallazgo 1 exacto: con el orden viejo el paso quedaba marcado (avance 33,3 %) y la
  // ejecución no existía. Invertir el orden en `aplicarPlan` pone este test en rojo.
  const plan = planDePasos(COLUMNA, new Set(['armadura']))
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  const e = espia('firmar')
  const r = await aplicarPlan(plan, e.escritura, '2026-08-25T12:00:00Z')
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /obra_ejecucion_dice_algo/)
  assert.deepEqual(e.orden, ['firmar'], 'se marcó el paso a pesar de que la firma rebotó')
})
