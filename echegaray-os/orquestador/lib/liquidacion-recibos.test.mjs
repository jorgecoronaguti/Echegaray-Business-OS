// EL RECIBO ES PLATA: ESTE LECTOR TIENE QUE PODER DECIR QUE NO.
//
// Cada test de acá fija una forma de equivocarse que le saca plata a una persona real o se la
// pone de más. El dueño lo escribió así: «no tolero errores porque es plata de gente».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO, importeArgentino, encabezadoDeRecibo, netoDeRecibo, periodoDeRecibo, periodoNormalizado, cruzar, cargables } from './liquidacion-recibos.mjs'

test('importe es-AR · el punto es miles y la coma es el decimal', () => {
  // Leerlo al revés convierte $215.564,62 en 215,56 — o en 21.556.462. Los dos se pagan.
  assert.equal(importeArgentino('$ 215.564,62'), 215564.62)
  assert.equal(importeArgentino('$ 40.648,22'), 40648.22)
  assert.equal(importeArgentino('$ -31.740,00'), -31740)
  assert.equal(importeArgentino(''), null)
  assert.equal(importeArgentino('—'), null)
})

test('encabezado · la identidad es el CUIL, y el legajo se declara dudoso', () => {
  const e = encabezadoDeRecibo('82026AGUERO CRISTIAN DOMINGO56.348,00387.349,2420-29427106-7')
  assert.equal(e.nombre, 'AGUERO CRISTIAN DOMINGO')
  assert.equal(e.cuil, '20294271067')
  // El legajo real es 5, no 56: el «6» es el primer dígito de $6.348,00. Por eso no se usa como
  // identidad y por eso se marca. Afirmar 56 sería inventar una persona.
  assert.equal(e.legajoDudoso, true)
})

test('encabezado · sin CUIL no hay línea: no se adivina la persona', () => {
  assert.equal(encabezadoDeRecibo('CONCEPTOUNIDADBASEMONTO'), null)
  assert.equal(encabezadoDeRecibo(''), null)
  assert.equal(encabezadoDeRecibo('82026SIN CUIL ACA123'), null)
})

test('neto · sale del renglón que lo dice, y si no está es null — nunca 0', () => {
  assert.equal(netoDeRecibo(['SUELDO BRUTO$ 387.349,24', 'SUELDO NETO$ 330.430,68']), 330430.68)
  // Un recibo sin la línea no vale 0 pesos: vale «no se pudo leer». Devolver 0 le pagaría nada
  // a alguien y el total de la quincena cerraría igual.
  assert.equal(netoDeRecibo(['COSTO TOTAL EMPLEADOR$ 474.819,10']), null)
  assert.equal(netoDeRecibo([]), null)
})

test('neto · no confunde SUELDO BRUTO con SUELDO NETO', () => {
  // Están a dos renglones de distancia y difieren en un 15%.
  assert.equal(netoDeRecibo(['SUELDO BRUTO$ 387.349,24']), null)
})

test('período · distingue una quincena de una liquidación final', () => {
  assert.deepEqual(
    periodoDeRecibo(['OS PERS CONSTRUCCIONADMISTRACION CENTRAL, 25/08/2026LIQUIDACION FINAL']),
    { fechaPago: '25/08/2026', etiqueta: 'LIQUIDACION FINAL' },
  )
  assert.deepEqual(
    periodoDeRecibo(['ADMISTRACION CENTRAL, 31/08/2026SEGUNDA QUINCENA 08/2026']),
    { fechaPago: '31/08/2026', etiqueta: 'SEGUNDA QUINCENA 08/2026' },
  )
})

const R = (nombre, cuil, neto, etiqueta = 'SEGUNDA QUINCENA 08/2026') => ({ nombre, cuil, neto, etiqueta })
const C = (legajo, nombre, neto) => ({ legajo, nombre, neto, liquidacion: '2da. QUINCENA 08/2026' })

test('cruce · dos fuentes que coinciden al centavo dan CONFIRMADO', () => {
  const f = cruzar({ recibos: [R('AGUERO CRISTIAN DOMINGO', '20294271067', 215564.62)], cubo: [C('5', 'AGUERO, CRISTIAN DOMINGO', 215564.62)] })
  assert.equal(f[0].estado, ESTADO.CONFIRMADO)
  assert.equal(f[0].legajo, '5')          // el legajo BUENO lo aporta el Cubo, no el PDF
})

test('cruce · un centavo de diferencia es CONFLICTO, y NO se carga', () => {
  // La tentación es redondear para que cierre. Ese redondeo es el defecto.
  const f = cruzar({ recibos: [R('AGUERO CRISTIAN DOMINGO', '20294271067', 215564.62)], cubo: [C('5', 'AGUERO, CRISTIAN DOMINGO', 215564.61)] })
  assert.equal(f[0].estado, ESTADO.CONFLICTO)
  assert.equal(Math.round(f[0].diferencia * 100), 1)
  assert.deepEqual(cargables(f), [])
})

test('cruce · el Cubo TRUNCA el nombre y eso no puede dejar a nadie afuera', () => {
  // «MALDONADO, BATISTA EMILIA» es el nombre cortado a 25 caracteres de «MALDONADO BATISTA
  // EMILIANO MIGUEL». Con igualdad exacta quedaba SOLO_PDF y su recibo no se cargaba.
  const f = cruzar({
    recibos: [R('MALDONADO BATISTA EMILIANO MIGUEL', '20359232668', 663141.56)],
    cubo: [C('42', 'MALDONADO, BATISTA EMILIA', 663141.56)],
  })
  assert.equal(f[0].estado, ESTADO.CONFIRMADO)
})

test('cruce · un prefijo corto NO empareja: dos Gonzalez no son la misma persona', () => {
  // «GONZALEZ» es prefijo de «GONZALEZ TOBARES JUAN GUILLERMO» y de «GONZALEZ CARLOS SAMUEL».
  // Sin el mínimo de 12 caracteres, el primero se lleva el recibo del otro.
  const f = cruzar({
    recibos: [R('GONZALEZ', '20314422555', 192887.48)],
    cubo: [C('82', 'GONZALEZ CARLOS SAMUEL', 230240.12)],
  })
  assert.equal(f[0].estado, ESTADO.SOLO_PDF)
})

test('cruce · una persona del Cubo sin recibo se ve, no desaparece', () => {
  const f = cruzar({ recibos: [], cubo: [C('95', 'OCHOA, EDUARDO ARIEL', 67794.8)] })
  assert.equal(f.length, 1)
  assert.equal(f[0].estado, ESTADO.SOLO_CUBO)
  assert.deepEqual(cargables(f), [])
})

test('cruce · un recibo no se empareja dos veces', () => {
  // Dos hermanos con el mismo apellido y el mismo neto: si el segundo se lleva la fila del primero,
  // uno de los dos queda sin cargar y el otro cobra dos veces.
  const f = cruzar({
    recibos: [R('CASTRO GALVAN GERSON ULISES', '20277987016', 123806.34), R('CASTRO GALVAN HEBER LUCAS', '23329393500', 123806.34)],
    cubo: [C('88', 'CASTRO GALVAN GERSON ULISES', 123806.34), C('94', 'CASTRO GALVAN HEBER LUCAS', 123806.34)],
  })
  assert.equal(f.filter((x) => x.estado === ESTADO.CONFIRMADO).length, 2)
  assert.deepEqual(f.map((x) => x.legajo).sort(), ['88', '94'])
})

test('cargables · sólo pasa lo confirmado por las dos fuentes', () => {
  const f = [
    { estado: ESTADO.CONFIRMADO }, { estado: ESTADO.CONFLICTO },
    { estado: ESTADO.SOLO_PDF }, { estado: ESTADO.SOLO_CUBO },
  ]
  assert.equal(cargables(f).length, 1)
})

test('período · las dos fuentes lo escriben distinto y significan lo mismo', () => {
  assert.equal(periodoNormalizado('SEGUNDA QUINCENA 08/2026'), 'Q2-08/2026')
  assert.equal(periodoNormalizado('2da. QUINCENA 08/2026'), 'Q2-08/2026')
  assert.equal(periodoNormalizado('PRIMERA QUINCENA 08/2026'), 'Q1-08/2026')
  assert.equal(periodoNormalizado('1RA. QUINCENA 08/2026'), 'Q1-08/2026')
  assert.equal(periodoNormalizado('LIQUIDACION FINAL'), 'FINAL')
  assert.equal(periodoNormalizado('cualquier cosa'), null)
})

test('cruce · el recibo de la 2da quincena NO se compara contra la 1ra', () => {
  // EL DEFECTO REAL, del 31/08/2026: el Cubo trae las DOS quincenas, así que cada persona aparece
  // dos veces con importes distintos. Sin el período en la llave, el recibo de la segunda
  // emparejaba con la fila de la primera y salían 21 CONFLICTO con los dos números idénticos
  // en pantalla. Peor: si las dos quincenas hubieran coincidido en importe, habría dado
  // CONFIRMADO sobre la fila equivocada.
  const cubo = [
    { legajo: '42', nombre: 'MALDONADO, BATISTA EMILIA', neto: 663526.08, liquidacion: '1RA. QUINCENA 08/2026' },
    { legajo: '42', nombre: 'MALDONADO, BATISTA EMILIA', neto: 663141.56, liquidacion: '2da. QUINCENA 08/2026' },
  ]
  const f = cruzar({ recibos: [R('MALDONADO BATISTA EMILIANO MIGUEL', '20359232668', 663141.56)], cubo })
  assert.equal(f[0].estado, ESTADO.CONFIRMADO)
  assert.equal(f[0].netoCubo, 663141.56)
  // Y la fila de la 1ra quincena queda visible como no emparejada, no desaparecida.
  assert.equal(f.filter((x) => x.estado === ESTADO.SOLO_CUBO).length, 1)
})

test('cruce · una liquidación final no empareja contra una quincena', () => {
  const f = cruzar({
    recibos: [R('SOSA NESTROR RAUL', '20338364505', 330430.68, 'LIQUIDACION FINAL')],
    cubo: [{ legajo: '75', nombre: 'SOSA, NESTROR RAUL', neto: 330430.68, liquidacion: '1RA. QUINCENA 08/2026' }],
  })
  assert.equal(f[0].estado, ESTADO.SOLO_PDF)
})
