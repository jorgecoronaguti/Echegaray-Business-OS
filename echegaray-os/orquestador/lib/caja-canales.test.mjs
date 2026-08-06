// LA PARTICIÓN POR CANAL, EN FRÍO — con el caso medido que la hizo falta.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  instrumentoDePago, estadoDeEgreso, canalDeMovimiento, veredictoPorMetodo, faltanteEnCartera,
  INSTRUMENTOS_BANCO, INSTRUMENTOS_DIFERIDOS, CANAL,
} from './caja-canales.mjs'
import { CMP } from './caja-posterior-al-corte.mjs'

const CORTE = 46240

test('"Echeq" se reconoce ANTES que "cheque": contiene la palabra y va a otro canal', () => {
  assert.equal(instrumentoDePago('Echeq'), 'echeq')
  assert.equal(instrumentoDePago('Cheque'), 'cheque')
  assert.equal(instrumentoDePago('Transferencia'), 'transferencia')
  assert.equal(instrumentoDePago('Débito'), 'debito')
  assert.equal(instrumentoDePago('Tarjeta Crédito'), 'tarjeta')
  assert.equal(instrumentoDePago('Efectivo'), 'efectivo')
  // Los seis valores de arriba son los que EXISTEN hoy en la columna P del archivo vivo (medido el
  // 06/08). Una celda vacía no es un método: es un pago sin declarar, y tiene que notarse.
  assert.equal(instrumentoDePago(''), 'desconocido')
  assert.equal(instrumentoDePago(null), 'desconocido')
})

test('la lista de medios bancarios SALE de la fórmula viva, no de una copia', () => {
  // Si alguien agrega "Depósito" a CMP.tiposBanco (la fórmula de CAJA), este archivo tiene que
  // enterarse solo. Con una lista tipeada aparte, el veredicto quedaría verde sobre un hueco nuevo.
  assert.deepEqual(INSTRUMENTOS_BANCO, CMP.tiposBanco.map(instrumentoDePago))
  assert.ok(INSTRUMENTOS_BANCO.includes('transferencia') && INSTRUMENTOS_BANCO.includes('debito'))
  // Y ningún medio puede estar de los dos lados: sería contarlo dos veces.
  for (const i of INSTRUMENTOS_DIFERIDOS) assert.ok(!INSTRUMENTOS_BANCO.includes(i), i)
})

test('EL DEFECTO: "Pagado" con echeq y fecha posterior al corte es un COMPROMISO, no un hecho', () => {
  // El caso real: Compras f794, FEMENIA, $1.839.200, echeq, fecha de caja 46264, Estado "Pagado".
  // Como REAL no lo miraba ninguna vista de proyección y ningún saldo lo restaba: $0 en todo el cuadro.
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: 46264, corte: CORTE }), 'COMPROMETIDO')
  assert.equal(estadoDeEgreso({ instrumento: 'cheque', pagado: true, fecha: 46249, corte: CORTE }), 'COMPROMETIDO')
  assert.equal(estadoDeEgreso({ instrumento: 'tarjeta', pagado: true, fecha: 46264, corte: CORTE }), 'COMPROMETIDO')
  // Un pago sin método declarado y con fecha futura tampoco pudo haber salido por ningún lado.
  assert.equal(estadoDeEgreso({ instrumento: 'desconocido', pagado: true, fecha: 46264, corte: CORTE }), 'COMPROMETIDO')
})

test('una transferencia posterior al corte SIGUE siendo REAL — la línea de posteriores la resta', () => {
  // Es la mitad que no se toca: si esto se degradara a COMPROMETIDO, la fórmula de CAJA la restaría
  // del saldo Y la escalera la proyectaría otra vez. El mismo peso, dos veces.
  assert.equal(estadoDeEgreso({ instrumento: 'transferencia', pagado: true, fecha: 46246, corte: CORTE }), 'REAL')
  assert.equal(estadoDeEgreso({ instrumento: 'debito', pagado: true, fecha: 46246, corte: CORTE }), 'REAL')
  assert.equal(estadoDeEgreso({ instrumento: 'efectivo', pagado: true, fecha: 46246, corte: CORTE }), 'REAL')
})

test('un cheque pagado ANTES del corte sigue siendo REAL: el extracto ya lo tiene', () => {
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: 46000, corte: CORTE }), 'REAL')
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: CORTE, corte: CORTE }), 'REAL')
})

test('sin corte no se degrada nada: convertiría años de pagos hechos en compromisos vivos', () => {
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: 46264, corte: null }), 'REAL')
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: null, corte: CORTE }), 'REAL')
})

test('lo no pagado es PROYECTADO, cualquiera sea el método', () => {
  for (const i of ['echeq', 'transferencia', 'efectivo', 'desconocido']) {
    assert.equal(estadoDeEgreso({ instrumento: i, pagado: false, fecha: 46264, corte: CORTE }), 'PROYECTADO')
  }
})

test('EL CONTROL: un REAL diferido posterior al corte no lo absorbe NINGUNA línea de CAJA', () => {
  // Éste es el veredicto que no puede salir de una sola fuente: el estado lo pone el libro y la
  // absorción la deciden las fórmulas del Sheet. Si el extractor volviera a marcarlo REAL, esto se
  // pone rojo — que es lo que no pasaba antes.
  const hueco = canalDeMovimiento({ estado: 'REAL', instrumento: 'echeq', fecha: 46264 }, { corte: CORTE })
  assert.equal(hueco.cubierto, false)
  assert.equal(hueco.canal, CANAL.ninguno)

  assert.equal(canalDeMovimiento({ estado: 'COMPROMETIDO', instrumento: 'echeq', fecha: 46264 }, { corte: CORTE }).canal, CANAL.libro)
  assert.equal(canalDeMovimiento({ estado: 'REAL', instrumento: 'echeq', fecha: 46000 }, { corte: CORTE }).canal, CANAL.extracto)
  assert.equal(canalDeMovimiento({ estado: 'REAL', instrumento: 'transferencia', fecha: 46246 }, { corte: CORTE }).canal, CANAL.posteriores)
  assert.equal(canalDeMovimiento({ estado: 'REAL', instrumento: 'efectivo', fecha: 46246 }, { corte: CORTE }).canal, CANAL.efectivo)
})

test('un valor que ENTRA no se trata como uno que SALE: su canal es la cartera', () => {
  // Acusar de hueco al echeq cobrado sería acusar al diseño: la línea de cobros lo excluye a
  // propósito porque su canal es "Valores a depositar". Lo que hay que probar es otra cosa —que el
  // valor esté cargado en _CHEQUES_RAW—, y eso se cruza contra esa otra fuente.
  const c = canalDeMovimiento({ estado: 'REAL', instrumento: 'echeq', fecha: 46249, signo: 1 }, { corte: CORTE })
  assert.equal(c.canal, CANAL.cartera)
  assert.equal(c.cubierto, true)
})

test('EL SEGUNDO DEFECTO: el echeq cobrado que la cartera no tiene son $20M que no muestra nadie', () => {
  // Caso real (06/08): Cobranzas f43 y f48, LA ESTRELLA, $10.000.000 c/u, acreditan 46249 y 46265.
  // La marca "ENDOSADO A ALUMETAL" que los excluía vivía en la columna BB y hoy está VACÍA, así que
  // el libro los toma como cobros reales. _CHEQUES_RAW "En custodia" posterior al corte: $0.
  // La exclusión de los echeq del saldo bancario tiene una PRECONDICIÓN que nadie verificaba.
  const movs = [
    { signo: 1, estado: 'REAL', instrumento: 'echeq', fecha: 46249, importe: 10000000 },
    { signo: 1, estado: 'REAL', instrumento: 'echeq', fecha: 46265, importe: 10000000 },
    // los que no cuentan: ya acreditados, proyectados, o por transferencia (esos sí van al banco)
    { signo: 1, estado: 'REAL', instrumento: 'echeq', fecha: 46000, importe: 5000000 },
    { signo: 1, estado: 'PROYECTADO', instrumento: 'echeq', fecha: 46300, importe: 7000000 },
    { signo: 1, estado: 'REAL', instrumento: 'transferencia', fecha: 46249, importe: 3000000 },
    { signo: -1, estado: 'COMPROMETIDO', instrumento: 'echeq', fecha: 46249, importe: 9000000 },
  ]
  assert.deepEqual(faltanteEnCartera(movs, 0, { corte: CORTE }), { esperado: 20000000, enCartera: 0, falta: 20000000 })
  // Con el valor cargado en la réplica, el control se apaga solo — no hace falta tocar código.
  assert.equal(faltanteEnCartera(movs, 20000000, { corte: CORTE }).falta, 0)
  // Y una cartera más grande que lo esperado no es un faltante negativo: es cero.
  assert.equal(faltanteEnCartera(movs, 99000000, { corte: CORTE }).falta, 0)
  // Sin corte no hay ventana y no se acusa a nadie.
  assert.equal(faltanteEnCartera(movs, 0, { corte: null }).esperado, 0)
})

test('el veredicto por método lleva la PLATA de cada uno y pone los huecos primero', () => {
  // Un método "conectado" que mueve $0 y uno desconectado que mueve $40M no se distinguen contando
  // filas: lo que decide es el monto.
  const v = veredictoPorMetodo([
    { estado: 'REAL', instrumento: 'transferencia', fecha: 46246, importe: 203132, signo: -1 },
    { estado: 'REAL', instrumento: 'echeq', fecha: 46264, importe: 1839200, signo: -1 },
    { estado: 'REAL', instrumento: 'echeq', fecha: 46242, importe: 469565, signo: -1 },
    { estado: 'COMPROMETIDO', instrumento: 'cheque', fecha: 46250, importe: 500000, signo: -1 },
  ], { corte: CORTE })
  assert.equal(v[0].cubierto, false, 'el hueco va primero: es lo que hay que mirar')
  assert.equal(v[0].metodo, 'echeq')
  assert.equal(v[0].filas, 2)
  assert.equal(Math.round(v[0].monto), -(1839200 + 469565))
  assert.ok(v.slice(1).every((x) => x.cubierto))
})
