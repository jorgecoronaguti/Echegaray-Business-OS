import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPeriodo, rotulo, ventanaDe } from './periodo.ts'

test('«este mes» empieza el 1° y TERMINA HOY, no a fin de mes', () => {
  // El defecto que atrapa: cerrar la ventana el 31 hace que el total del mes en curso se lea como
  // el total del mes completo. Son dos números distintos y sólo uno es cierto.
  assert.deepEqual(ventanaDe('mes', '2026-08-20'), { desde: '2026-08-01', hasta: '2026-08-20' })
  assert.deepEqual(ventanaDe('mes', '2026-08-01'), { desde: '2026-08-01', hasta: '2026-08-01' })
})

test('«mes pasado» es el mes calendario anterior, entero', () => {
  assert.deepEqual(ventanaDe('mes-pasado', '2026-08-20'), { desde: '2026-07-01', hasta: '2026-07-31' })
  // Y cruza el año sin restarle 1 al mes a mano.
  assert.deepEqual(ventanaDe('mes-pasado', '2026-01-09'), { desde: '2025-12-01', hasta: '2025-12-31' })
})

test('el fin de mes sale del calendario, no de una tabla de 30 y 31', () => {
  assert.equal(ventanaDe('mes-pasado', '2026-03-05').hasta, '2026-02-28')
  assert.equal(ventanaDe('mes-pasado', '2028-03-05').hasta, '2028-02-29', 'año bisiesto')
  assert.equal(ventanaDe('mes-pasado', '2026-05-05').hasta, '2026-04-30')
})

test('«últimos 3 meses» son tres meses calendario incluido el corriente, no 90 días', () => {
  // Nadie compara su trabajo contra «hace noventa días»: se compara contra junio, julio y agosto.
  assert.deepEqual(ventanaDe('trimestre', '2026-08-20'), { desde: '2026-06-01', hasta: '2026-08-20' })
  assert.deepEqual(ventanaDe('trimestre', '2026-02-10'), { desde: '2025-12-01', hasta: '2026-02-10' })
})

test('el período elegido manda, y lo que falta cae al mes en curso', () => {
  assert.deepEqual(
    ventanaDe('elegir', '2026-08-20', { desde: '2026-03-01', hasta: '2026-03-31' }),
    { desde: '2026-03-01', hasta: '2026-03-31' },
  )
  // Media ventana produciría un total que parece de un período y es de otro.
  assert.deepEqual(ventanaDe('elegir', '2026-08-20', { desde: '2026-03-01' }), { desde: '2026-03-01', hasta: '2026-08-20' })
  assert.deepEqual(ventanaDe('elegir', '2026-08-20', {}), { desde: '2026-08-01', hasta: '2026-08-20' })
})

test('un período dado vuelta se da vuelta, no devuelve cero horas en silencio', () => {
  assert.deepEqual(
    ventanaDe('elegir', '2026-08-20', { desde: '2026-03-31', hasta: '2026-03-01' }),
    { desde: '2026-03-01', hasta: '2026-03-31' },
  )
})

test('un período que no existe no se acepta: el filtro cae al mes, nunca a una ventana vacía', () => {
  assert.equal(esPeriodo('mes'), true)
  assert.equal(esPeriodo('quincena'), false, 'la quincena es de la liquidación, no de esta pantalla')
  assert.equal(esPeriodo(null), false)
  assert.equal(esPeriodo(''), false)
})

test('la ventana se escribe con día, mes y año: un total sin período declarado no se verifica', () => {
  assert.equal(rotulo({ desde: '2026-08-01', hasta: '2026-08-20' }), '01/08/2026 – 20/08/2026')
})
