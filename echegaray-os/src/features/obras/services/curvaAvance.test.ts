import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lecturaCurva, puntosDeHoy } from './curvaAvance.ts'
import { desvioDePlazo } from './ganttObras.ts'

// Una obra de 100 días, mirada al día 38: por calendario debería ir 38%.
const INICIO = '2026-06-01'
const FIN = '2026-09-09'
const HOY = '2026-07-09'

test('el esperado sale de la MISMA regla que pinta el Gantt, no de una cuenta propia', () => {
  // Si esta pantalla se hiciera su propia aritmética de calendario, el día que cambiara el umbral o
  // el redondeo el Resumen y la cartera dirían dos atrasos distintos de la misma obra.
  const { lectura } = lecturaCurva(INICIO, FIN, 28, HOY)
  const d = desvioDePlazo(INICIO, FIN, 28, HOY)
  assert.equal(lectura?.esperadoPct, d.avanceEsperadoPct)
  assert.equal(lectura?.brechaPuntos, d.brechaPuntos)
  assert.equal(lectura?.semaforo, d.semaforo)
})

test('el titular dice los puntos que faltan, no un porcentaje inventado', () => {
  const { lectura } = lecturaCurva(INICIO, FIN, 28, HOY)
  assert.equal(lectura?.esperadoPct, 38)
  assert.equal(lectura?.realPct, 28)
  assert.equal(lectura?.titular, '−10 pts vs esperado')
})

test('ir adelantado NO es un desvío: no se escribe un «+» que no significa nada', () => {
  const { lectura } = lecturaCurva(INICIO, FIN, 55, HOY)
  assert.equal(lectura?.brechaPuntos, 0)
  assert.equal(lectura?.titular, 'al día')
})

// ═══ EL HUECO NO SE DIBUJA COMO UN CERO ═══
//
// Una curva con real 0 y esperado 0 afirma que la obra no avanzó. Sin avance medido lo que pasa es
// que nadie lo midió, y sin fechas de plan no hay contra qué comparar: son dos huecos distintos, y
// cada uno se nombra por lo que le falta. Si alguien reemplaza estos `null` por un 0, estas tres
// aserciones se ponen rojas.

test('sin avance medido no hay curva, y el motivo lo dice', () => {
  const c = lecturaCurva(INICIO, FIN, null, HOY)
  assert.equal(c.lectura, null)
  assert.equal(c.motivo, 'sin avance medido para comparar')
})

test('sin fechas de plan no hay curva, y el motivo es otro', () => {
  assert.equal(lecturaCurva(null, FIN, 28, HOY).motivo, 'sin fechas de plan contra las que comparar')
  assert.equal(lecturaCurva(INICIO, null, 28, HOY).motivo, 'sin fechas de plan contra las que comparar')
})

test('avance 0 medido SÍ dibuja curva: cero medido no es lo mismo que sin medir', () => {
  const { lectura } = lecturaCurva(INICIO, FIN, 0, HOY)
  assert.equal(lectura?.realPct, 0)
  assert.equal(lectura?.brechaPuntos, 38)
})

test('el punto esperado cae sobre la recta de esquina a esquina', () => {
  // La recta del esperado va de (inicio, 0%) a (fin, 100%). Si el eje horizontal se calculara con
  // otra cuenta que el avance esperado, el punto quedaría al lado de su propia recta y el gráfico
  // se leería como un error de la obra, no del dibujo.
  const { lectura } = lecturaCurva(INICIO, FIN, 28, HOY)
  const { esperado, real } = puntosDeHoy(lectura!, 320, 96)
  assert.equal(esperado.x, (320 * 38) / 100)
  assert.equal(esperado.y, 96 - (96 * 38) / 100)
  // El real comparte el eje del día: la brecha se lee como un segmento vertical, no como distancia.
  assert.equal(real.x, esperado.x)
  assert.ok(real.y > esperado.y, 'ir atrasado tiene que dibujarse por debajo de la recta')
})

test('pasado el fin del plan el esperado no se pasa de 100 ni se sale del lienzo', () => {
  const { lectura } = lecturaCurva(INICIO, FIN, 90, '2026-12-31')
  assert.equal(lectura?.esperadoPct, 100)
  const { esperado } = puntosDeHoy(lectura!, 320, 96)
  assert.equal(esperado.x, 320)
  assert.equal(esperado.y, 0)
})

test('terminada al 100% queda al día aunque el calendario ya se haya consumido', () => {
  const { lectura } = lecturaCurva(INICIO, FIN, 100, '2026-12-31')
  assert.equal(lectura?.semaforo, 'al_dia')
  assert.equal(lectura?.titular, 'al día')
})
