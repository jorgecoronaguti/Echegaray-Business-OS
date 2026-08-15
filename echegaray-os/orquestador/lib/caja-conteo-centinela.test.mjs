// EL CENTINELA DEL CONTEO — los defectos que este mecanismo existe para cerrar.
//
// Cada test de acá se pone rojo si se revierte el arreglo. No prueban que el código haga lo que hace:
// prueban que el ancla no se mueva sola, que no se invente, y que el intervalo declarado sea el real.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTO, NO_DETECTA, RESOLUCION_HORAS, anclaComoSerial, mismoValor, observacionSiguiente,
  ventanaDelConteo,
} from './caja-conteo-centinela.mjs'
import { fechaDeSerial, instanteDelSello } from './caja-ancla-por-instante.mjs'

const T = (h, m = 0, d = 15) => new Date(2026, 7, d, h, m, 0)

test('EL ANCLA NO SE MUEVE MIENTRAS EL CONTEO ES EL MISMO — el sello rodante de dos horas', () => {
  // El 14/08 el sello se rehacía en cada corrida y un pago de $3.000.000 en billetes bajaba la caja
  // hasta la corrida siguiente y después desaparecía adentro del sello. La caja mintiendo hacia
  // arriba, en silencio. Si `observacionSiguiente` volviera a estampar `ahora` con el mismo valor,
  // este test se pone rojo.
  const a = observacionSiguiente(null, { valor: 12000000, ahora: T(9) })
  assert.equal(a.accion, 'primera')
  const b = observacionSiguiente(a.fila, { valor: 12000000, ahora: T(11) })
  const c = observacionSiguiente(b.fila, { valor: 12000000, ahora: T(13) })
  assert.equal(c.accion, 'sigue')
  assert.deepEqual(c.fila.vistoDesde, T(9), 'el ancla sigue siendo la PRIMERA vez que se vio el conteo')
  assert.deepEqual(c.fila.vistoHasta, T(13), 'lo que avanza es la última confirmación, no el ancla')
  assert.equal(c.fila.corridas, 3)
})

test('un decimal fantasma de la API no cuenta como conteo nuevo', () => {
  // El valor viaja como flotante: una comparación exacta re-anclaría en cada corrida.
  const a = observacionSiguiente(null, { valor: 12000000, ahora: T(9) })
  const b = observacionSiguiente(a.fila, { valor: 12000000.0000001, ahora: T(11) })
  assert.equal(b.accion, 'sigue')
  assert.deepEqual(b.fila.vistoDesde, T(9))
  assert.equal(mismoValor(12000000, 12000000.004), true)
  assert.equal(mismoValor(12000000, 12000000.02), false, 'dos centavos SÍ son otro conteo')
})

test('EL CAMBIO DE VALOR ES EL DISPARADOR, y el instante de esa corrida es el ancla nueva', () => {
  const a = observacionSiguiente(null, { valor: 4320000, ahora: T(15, 1) })
  const b = observacionSiguiente(a.fila, { valor: 4320000, ahora: T(15, 9) })
  const c = observacionSiguiente(b.fila, { valor: 12000000, ahora: T(17) })
  assert.equal(c.accion, 'cambio')
  assert.deepEqual(c.fila.vistoDesde, T(17), 'el ancla es cuando lo VI, que es lo único que puedo afirmar')
  assert.equal(c.fila.valorPrevio, 4320000)
  assert.deepEqual(c.fila.previoVistoEn, T(15, 9), 'el borde izquierdo es la última corrida que lo vio viejo')
})

test('EL INTERVALO ES EL REAL, NO EL DEL CONTEO ANTERIOR — y lleva la fecha', () => {
  // EL DEFECTO QUE CIERRA: `ventanaDelSello` tomaba como borde izquierdo la F del sello, o sea cuándo
  // se selló el conteo ANTERIOR (el 07/08 para un conteo del 14/08: una semana), e imprimía sólo
  // HH:mm. Una ventana de siete días se leía como una de dos horas. Acá el borde izquierdo es la
  // corrida previa y el texto lleva el día, así que un intervalo largo se ve largo.
  const v = ventanaDelConteo({ vistoDesde: T(17), previoVistoEn: T(15, 9) })
  assert.equal(v.acotado, true)
  assert.equal(Math.round(v.horas * 60), 111)
  assert.match(v.texto, /15\/08 15:09/)
  assert.match(v.texto, /15\/08 17:00/)
  assert.match(v.texto, /1\.9 h/)

  const largo = ventanaDelConteo({ vistoDesde: T(17, 0, 15), previoVistoEn: T(15, 9, 8) })
  assert.match(largo.texto, /08\/08 15:09/, 'un intervalo de una semana MUESTRA la fecha del otro extremo')
})

test('sin lectura anterior el intervalo queda ABIERTO y lo dice: no se cierra a ojo', () => {
  const v = ventanaDelConteo({ vistoDesde: T(17), previoVistoEn: null })
  assert.equal(v.acotado, false)
  assert.equal(v.desde, null)
  assert.equal(v.horas, null)
  assert.match(v.texto, /no sé desde cuándo estaba/)
})

test('LA ADOPCIÓN: la primera corrida NO muda el ancla desde el conteo real hasta ahora', () => {
  // EL DEFECTO QUE CIERRA. Al enchufar el centinela, la pestaña YA tenía un ancla estampada (el sello
  // del 15/08). Si la primera observación tomara `ahora`, el ancla saltaría hacia adelante y todo lo
  // que se movió en el medio quedaría absorbido DENTRO del conteo: la caja mintiendo hacia arriba,
  // que es el modo de falla más caro de este módulo.
  const yaEstampado = T(10, 30)
  const r = observacionSiguiente(null, { valor: 12000000, ahora: T(17), adopcion: yaEstampado })
  assert.deepEqual(r.fila.vistoDesde, yaEstampado)
  assert.deepEqual(r.fila.vistoHasta, T(17))
})

test('la adopción NO acepta un instante del futuro ni una fecha basura', () => {
  const futuro = observacionSiguiente(null, { valor: 12000000, ahora: T(17), adopcion: T(19) })
  assert.deepEqual(futuro.fila.vistoDesde, T(17), 'un sello posterior a esta corrida no es evidencia de nada')
  const basura = observacionSiguiente(null, { valor: 12000000, ahora: T(17), adopcion: new Date('nada') })
  assert.deepEqual(basura.fila.vistoDesde, T(17))
  assert.deepEqual(fechaDeSerial(0), null, 'un serial 0 no es una fecha: es una celda vacía')
  assert.deepEqual(fechaDeSerial(''), null)
})

test('UN VALOR ILEGIBLE NO ES UNA OBSERVACIÓN: falla cerrado en vez de anclar en cero', () => {
  // Un ancla en 0 abre la ventana desde el principio de los tiempos y mete el histórico ENTERO como
  // movimiento posterior al conteo. Antes que eso, no hay observación.
  // `Number('')` es 0 y 0 es finito: sin la guarda explícita, una celda VACÍA se observaba como un
  // conteo de cero y el ancla saltaba a esta corrida con un saldo inventado.
  for (const malo of ['', null, undefined, 'doce millones', NaN, 0]) {
    assert.throws(() => observacionSiguiente(null, { valor: malo, ahora: T(9) }), /valor numérico/)
  }
})

test('el ancla viaja a Sheets como serial CON hora y vuelve idéntica', () => {
  const fila = { vistoDesde: T(17, 45) }
  const serial = anclaComoSerial(fila)
  assert.ok(Number.isFinite(serial) && serial > 46000, 'tiene que ser un serial de Sheets creíble')
  assert.ok(Math.abs(serial - Math.trunc(serial)) > 1e-9, 'con parte horaria: un ancla sin hora es una fecha tipeada')
  // La vuelta es la inversa exacta. Dos conversiones con husos distintos serían tres horas de
  // corrimiento que nadie ve porque el número sigue siendo creíble.
  assert.equal(Math.round(fechaDeSerial(serial).getTime() / 1000), Math.round(T(17, 45).getTime() / 1000))
  assert.equal(Math.round(instanteDelSello(T(17, 45)) * 86400), Math.round(serial * 86400))
})

test('los límites del mecanismo están DECLARADOS en el módulo, no sólo en un informe', () => {
  assert.equal(RESOLUCION_HORAS, 2, 'la resolución es el período del timer y se cita en el texto del dueño')
  assert.ok(NO_DETECTA.some((x) => /mismo monto/i.test(x)), 'recontar el mismo monto es indetectable y tiene que estar dicho')
  assert.ok(NO_DETECTA.some((x) => /minuto exacto/i.test(x)))
  assert.equal(CONCEPTO.arqueoUsd, 'CAJA_ARQUEO_USD', 'el conteo en dólares también se vigila')
})
