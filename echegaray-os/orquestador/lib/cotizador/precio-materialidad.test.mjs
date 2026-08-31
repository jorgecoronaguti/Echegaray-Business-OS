// QUE EL ORDEN SEA POR PLATA Y NO POR EDAD — y que lo no medido no valga cero.
//
// La regresión contra la base real vive en `precio-materialidad.pg.test.mjs`: acá se prueba la
// cuenta, sin red y sin Postgres.

import test from 'node:test'
import assert from 'node:assert/strict'
import { errorEsperado, riesgoDeRecurso, priorizar, ERROR_MAXIMO } from './precio-materialidad.mjs'

const HOY = new Date('2026-08-31T00:00:00Z')

test('el error esperado compone la deriva en el tiempo, no la suma', () => {
  const e = errorEsperado({ observadoEn: '2026-02-28', derivaMensual: 0.02, hoy: HOY })
  // seis meses al 2% compuesto = 12,6%, no 12%. La diferencia es chica acá y enorme a dos años.
  assert.ok(e.fraccion > 0.125 && e.fraccion < 0.128, `esperaba ~12,6% y salió ${e.fraccion}`)
  assert.equal(e.medido, true)
})

test('el error se topea y no inventa un 400% sobre un precio de cuatro años', () => {
  const e = errorEsperado({ observadoEn: '2017-06-07', derivaMensual: 0.0263, hoy: HOY })
  assert.equal(e.fraccion, ERROR_MAXIMO)
})

test('un tramo de convenio VIGENTE tiene error CERO EXACTO, no «poco»', () => {
  const e = errorEsperado({ observadoEn: '2026-05-01', caducaEl: '2026-08-31', derivaMensual: 0.0263, hoy: HOY })
  assert.equal(e.fraccion, 0)
  assert.match(e.porQue, /cero exacto/)
})

test('un tramo CADUCADO no se estima con una deriva: cae a no medido', () => {
  const e = errorEsperado({ observadoEn: '2026-05-01', caducaEl: '2026-08-31', derivaMensual: 0.0263, hoy: new Date('2026-09-01T00:00:00Z') })
  assert.equal(e.fraccion, null)
  assert.match(e.porQue, /la escala/)
})

test('sin fecha de observación no hay error estimable — y NO es cero', () => {
  const e = errorEsperado({ observadoEn: null, derivaMensual: 0.0263, hoy: HOY })
  assert.equal(e.fraccion, null)
})

test('el riesgo es plata × error, y un impacto desconocido lo deja en null y no en cero', () => {
  const conPlata = riesgoDeRecurso({
    recurso: { codigo: '367', nombre: 'Panel', serie: [] },
    resolucion: { fecha: '2024-08-07', resultado: 'NECESITA_HUMANO' },
    impacto: 7_999_310, hoy: HOY,
  })
  assert.ok(conPlata.riesgo > 6_000_000, `riesgo salió ${conPlata.riesgo}`)

  const sinPlata = riesgoDeRecurso({
    recurso: { codigo: '116', nombre: 'Buje', serie: [] },
    resolucion: { fecha: null, resultado: 'SIN_PRECIO' },
    impacto: null, hoy: HOY,
  })
  assert.equal(sinPlata.riesgo, null, 'un SIN_PRECIO con riesgo 0 se hunde al fondo de la cola')
  assert.match(sinPlata.porQue, /NO MEDIDO/)
})

test('LA REGLA: ordena por PLATA EN RIESGO, no por antigüedad', () => {
  // El viejo mueve migajas; el nuevo mueve millones. Ordenar por edad pone primero al equivocado.
  const viejoYbarato = riesgoDeRecurso({ recurso: { codigo: 'A', serie: [] }, resolucion: { fecha: '2017-06-07' }, impacto: 300, hoy: HOY })
  const nuevoYcaro = riesgoDeRecurso({ recurso: { codigo: 'B', serie: [] }, resolucion: { fecha: '2025-08-31' }, impacto: 8_000_000, hoy: HOY })
  assert.ok(viejoYbarato.error > nuevoYcaro.error, 'el viejo tiene MÁS error relativo')
  const p = priorizar([viejoYbarato, nuevoYcaro], { objetivo: 0.9 })
  assert.equal(p.elegidos[0].codigo, 'B', 'el que mueve plata va primero aunque sea el más nuevo')
  assert.equal(p.elegidos.length, 1, 'con el 90% cubierto por uno, el segundo no se consulta')
})

test('la cobertura para cuando alcanza el objetivo, y dice qué queda afuera', () => {
  const items = [
    { codigo: 'A', riesgo: 700 }, { codigo: 'B', riesgo: 200 },
    { codigo: 'C', riesgo: 60 }, { codigo: 'D', riesgo: 40 },
  ]
  const p = priorizar(items, { objetivo: 0.9 })
  assert.deepEqual(p.elegidos.map((x) => x.codigo), ['A', 'B'])
  assert.equal(p.riesgoQueQuedaAfuera, 100)
  assert.ok(p.cobertura >= 0.9)
})

test('los NO MEDIDOS no entran al denominador ni se cuentan como resueltos', () => {
  const p = priorizar([{ codigo: 'A', riesgo: 1000 }, { codigo: 'X', riesgo: null }], { objetivo: 0.9 })
  assert.equal(p.riesgoTotal, 1000, 'un riesgo null no puede sumar 0 al total: eso diluiría el %')
  assert.equal(p.noMedidos.length, 1)
  assert.match(p.noMedidosPorQue, /no es un riesgo de cero/)
})

test('dos corridas con la misma entrada eligen el mismo conjunto', () => {
  const items = [{ codigo: 'B', riesgo: 100 }, { codigo: 'A', riesgo: 100 }, { codigo: 'C', riesgo: 100 }]
  const uno = priorizar(items, { objetivo: 0.7 }).elegidos.map((x) => x.codigo)
  const dos = priorizar([...items].reverse(), { objetivo: 0.7 }).elegidos.map((x) => x.codigo)
  assert.deepEqual(uno, dos)
})
