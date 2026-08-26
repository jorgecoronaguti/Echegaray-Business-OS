import test from 'node:test'
import assert from 'node:assert/strict'
import {
  diferenciaEnHoras, minutosDeHora, quePide, textoDeDiferencia, titularDeLaBandeja,
} from './bandejaCorrecciones.ts'

// LOS DEFECTOS QUE ATRAPA:
//
//  1. PUBLICAR 0 CUANDO NO SE PUEDE MEDIR. Un pedido de salida sobre un día sin entrada no mueve
//     cero horas: no se sabe cuántas mueve. Un 0 lo haría parecer irrelevante justo cuando es raro.
//  2. IGNORAR LA SALIDA QUE YA ESTABA. Si el día ya tenía salida, el pedido mueve la DIFERENCIA
//     contra esa, no la jornada entera: contarla entera duplicaría las horas en juego.
//  3. PUBLICAR UN TOTAL COMO SI ESTUVIERAN TODOS CONTADOS cuando alguno no se pudo medir.

const salida = (hora: string, entrada: string | null, yaSalida: string | null = null) => ({
  tipo: 'salida' as const, hora_propuesta: hora, entrada, salida: yaSalida, fecha: '2026-08-26',
})

test('un pedido de salida mide desde la entrada real', () => {
  assert.equal(diferenciaEnHoras(salida('17:00', '2026-08-26T08:00:00')), 9)
})

test('sin entrada registrada no se mide: null, nunca 0', () => {
  assert.equal(diferenciaEnHoras(salida('17:00', null)), null)
  assert.equal(textoDeDiferencia(null), 'sin medir')
})

test('si el día YA tenía salida, lo que mueve es la diferencia contra esa', () => {
  // Aprobar PISA la salida anterior: contar la jornada entera diría que el día suma nueve horas
  // cuando en realidad suma una.
  assert.equal(diferenciaEnHoras(salida('17:00', '2026-08-26T08:00:00', '2026-08-26T16:00:00')), 1)
})

test('correr la ENTRADA hacia adelante saca horas, y el signo lo dice', () => {
  const p = { tipo: 'entrada' as const, hora_propuesta: '09:00', entrada: '2026-08-26T08:00:00', salida: '2026-08-26T17:00:00', fecha: '2026-08-26' }
  assert.equal(diferenciaEnHoras(p), -1)
  assert.equal(textoDeDiferencia(-1), '-1 h')
})

test('el signo positivo se escribe', () => {
  assert.equal(textoDeDiferencia(1.5), '+1,5 h')
})

test('una hora ilegible no se inventa', () => {
  assert.equal(minutosDeHora('no'), null)
  assert.equal(minutosDeHora('99:99'), null)
  assert.equal(minutosDeHora('17:30:00'), 1050)
})

test('«qué pide» dice cuál de las dos marcas se toca, y si la pisa', () => {
  assert.equal(quePide(salida('17:00', '2026-08-26T08:00:00')), 'Cargar la salida a las 17:00')
  assert.equal(
    quePide(salida('17:00', '2026-08-26T08:00:00', '2026-08-26T16:00:00')),
    'Cambiar la salida a 17:00',
  )
})

test('con alguno sin medir el total es un PISO y se dice que lo es', () => {
  const t = titularDeLaBandeja([salida('17:00', '2026-08-26T08:00:00'), salida('17:00', null)])
  assert.match(t.subtitular, /al menos/)
})

test('con todos medidos el total no lleva «al menos»', () => {
  const t = titularDeLaBandeja([salida('17:00', '2026-08-26T08:00:00')])
  assert.doesNotMatch(t.subtitular, /al menos/)
  assert.match(t.subtitular, /9 h en juego/)
})

test('la bandeja vacía dice de dónde salen los pedidos, no «0 horas»', () => {
  const t = titularDeLaBandeja([])
  assert.equal(t.titular, 'sin pedidos por resolver')
  assert.doesNotMatch(t.subtitular, /0 h/)
})
