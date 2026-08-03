// EL DEFECTO QUE ESTE AUDITOR ATRAPA NO DA ERROR NI DESCUADRA NINGUNA SUMA.
//
// Por eso cada test de abajo reproduce una forma CONCRETA de que la fecha mala se cuele, no la forma
// general del auditor: la que importa es la que un MAX no ve.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aSerial, fechasAbsurdas, serialDeHoy, serialATexto, ATRAS_DIAS, ADELANTE_DIAS } from './auditar-fechas-absurdas.mjs'

const HOY = serialDeHoy(new Date(Date.UTC(2026, 7, 3))) // 03/08/2026

test('la fecha vieja que el MAX no ve: un 2019 tipeado en una columna de 2026', () => {
  // Ésta es la razón de existir del auditor. `MAX(… <=TODAY())` se queda con la más nueva: la fila
  // de 2019 no mueve el rótulo ni un día, no da error y no descuadra nada. Y sin embargo cae en el
  // tramo "Vencido — averiguar por qué" y ensucia la única alerta de esa pestaña.
  const filas = [[serialDeHoy(new Date(Date.UTC(2026, 6, 24)))], [serialDeHoy(new Date(Date.UTC(2019, 4, 12)))]]
  const malas = fechasAbsurdas(filas, { hoy: HOY, desdeFila: 20 })
  assert.equal(malas.length, 1)
  assert.equal(malas[0].fila, 21)
  assert.equal(malas[0].motivo, 'muy vieja')
})

test('la columna en formato MIXTO: la fecha tipeada a mano también se audita', () => {
  // Las filas escritas a mano son justo las que más se tipean mal. Un auditor que sólo mirara los
  // números de serie pasaría por alto exactamente las peligrosas.
  const malas = fechasAbsurdas([['12/05/2019'], ['24/07/2026']], { hoy: HOY, desdeFila: 4 })
  assert.equal(malas.length, 1)
  assert.equal(malas[0].valor, '12/05/2019')
})

test('el texto se lee dd/mm/aaaa y no mm/dd: "03/08/2026" es agosto, no marzo', () => {
  // `new Date("03/08/2026")` devuelve el 8 de MARZO en muchos entornos. Con esa lectura, una fecha
  // de agosto pasaría por marzo y el auditor la reportaría o la dejaría pasar por la razón equivocada.
  assert.equal(serialATexto(aSerial('03/08/2026')), '03/08/2026')
})

test('un 31/02 no se "corrige" a marzo en silencio: no es una fecha', () => {
  assert.equal(aSerial('31/02/2026'), null)
})

test('la fecha futura absurda también se declara, aunque el rótulo ya la filtre', () => {
  // `<=TODAY()` la saca del MAX, así que el rótulo no miente — pero la fila sigue mal cargada y su
  // importe cae en el tramo "Más adelante" de un año que no existe.
  const filas = [[HOY + ADELANTE_DIAS + 30]]
  const malas = fechasAbsurdas(filas, { hoy: HOY })
  assert.equal(malas.length, 1)
  assert.equal(malas[0].motivo, 'muy futura')
})

test('un diferido normal a nueve meses NO es un hallazgo: un auditor ruidoso deja de leerse', () => {
  assert.deepEqual(fechasAbsurdas([[HOY + 270]], { hoy: HOY }), [])
})

test('un cheque de hace dos años tampoco: la ventana cubre lo que la empresa arrastra', () => {
  assert.deepEqual(fechasAbsurdas([[HOY - 730]], { hoy: HOY }), [])
  assert.equal(fechasAbsurdas([[HOY - ATRAS_DIAS - 1]], { hoy: HOY }).length, 1)
})

test('celdas vacías, rótulos y notas del rango abierto no son hallazgos', () => {
  // El rango va abierto (`C2:C`) y barre lo que haya debajo del registro. Reportar cada rótulo
  // ahogaría los hallazgos reales entre ruido, que es como muere un auditor.
  assert.deepEqual(fechasAbsurdas([[''], [null], ['DEBITADO'], ['⇒ Total'], [0]], { hoy: HOY }), [])
})

test('la ventana hacia adelante se puede cerrar por columna: el banco no tiene futuro', () => {
  // Un movimiento del extracto con fecha futura no es un diferido: es un error de importación.
  assert.equal(fechasAbsurdas([[HOY + 3]], { hoy: HOY, adelante: 0 }).length, 1)
  assert.deepEqual(fechasAbsurdas([[HOY + 3]], { hoy: HOY }), [])
})

test('"hoy" se calcula en UTC: con horas locales, medio año daría el día anterior', () => {
  const d = new Date(Date.UTC(2026, 7, 3, 2, 30))
  assert.equal(serialATexto(serialDeHoy(d)), '03/08/2026')
})
