import test from 'node:test'
import assert from 'node:assert/strict'

// ═══ EL PIE DEL CRONOGRAMA CARGADO ═══

import { metricasDelCronogramaCargado } from './metricasCronograma.ts'
import type { ResumenDelCronograma } from './cronogramaPlan.ts'

const resumen = (p: Partial<ResumenDelCronograma> = {}): ResumenDelCronograma => ({
  finBase: '2026-09-05', finPlan: '2026-09-05', finForecast: '2026-09-21',
  desvioDelFin: 16, atrasadas: 4, medidas: 8, sinPlan: 0, actividades: 8, ...p,
})

const celda = (m: ReturnType<typeof metricasDelCronogramaCargado>, etiqueta: string) =>
  m.find((x) => x.etiqueta === etiqueta)!

test('el fin proyectado publica el desvío contra el plan y se pinta en rojo', () => {
  const c = celda(metricasDelCronogramaCargado(resumen(), '2026-08-05'), 'Fin proyectado')
  assert.equal(c.valor, '21/09')
  assert.equal(c.contexto, '+16 d')
  assert.equal(c.tono, 'neg')
})

test('sin sellar, el fin de línea base lo dice y no muestra la fecha del plan', () => {
  const m = metricasDelCronogramaCargado(resumen({ finBase: null }), null)
  assert.equal(celda(m, 'Fin de línea base').valor, 'sin sellar')
  assert.equal(celda(m, 'Fin de línea base').contexto, undefined)
})

test('sin forecast, «atrasadas» no dice 0: dice que no se pudo medir', () => {
  // El defecto que atrapa: publicar «0 atrasadas» sobre una obra donde ninguna actividad tiene
  // forecast. Cero atrasadas es un hecho; no poder medirlo, otro.
  const m = metricasDelCronogramaCargado(
    resumen({ finForecast: null, desvioDelFin: null, atrasadas: 0, medidas: 0 }), null,
  )
  assert.equal(celda(m, 'Actividades atrasadas').valor, 'sin forecast')
  assert.equal(celda(m, 'Fin proyectado').valor, 'sin forecast')
  assert.equal(celda(m, 'Fin proyectado').contexto, undefined)
})

test('las atrasadas llevan siempre su denominador', () => {
  const c = celda(metricasDelCronogramaCargado(resumen(), null), 'Actividades atrasadas')
  assert.equal(c.valor, '4')
  assert.equal(c.contexto, 'de 8 medidas')
  assert.equal(c.tono, 'warn')
})

test('las actividades sin fecha se publican con el total de la obra', () => {
  const c = celda(metricasDelCronogramaCargado(resumen({ sinPlan: 25, actividades: 33 }), null), 'Sin fecha')
  assert.equal(c.valor, '25')
  assert.equal(c.contexto, 'de 33 actividades')
  assert.equal(c.tono, 'warn')
})

test('camino crítico y holgura NO se publican: exigen precedencias y hoy no hay ninguna', () => {
  const etiquetas = metricasDelCronogramaCargado(resumen(), null).map((m) => m.etiqueta)
  assert.equal(etiquetas.includes('Camino crítico'), false)
  assert.equal(etiquetas.includes('Holgura del crítico'), false)
  assert.equal(etiquetas.length, 5)
})
