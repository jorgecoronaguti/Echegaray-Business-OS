import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aFechaISO, aNumeroArgentino, datosDelNombre, esCarpetaDeRecibos, esEstadoDeCuenta,
  esNombreDeRecibo, esReciboDeSueldo, importeDeclarado, obraDeLasCarpetas,
} from './recibos-drive.mjs'

// Los nombres de este archivo son los REALES de Drive, listados en vivo el 26/08/2026. Inventarlos
// habría hecho pasar los tests contra un dialecto que el dueño no escribe.

test('el nombre con número y fecha da los dos', () => {
  assert.deepEqual(datosDelNombre('RECIBO 11 - 31:7:26.pdf'), { numero: '11', fecha: '2026-07-31', faltan: [] })
  assert.deepEqual(datosDelNombre('RECIBO 5 - 11:3:26.pdf'), { numero: '5', fecha: '2026-03-11', faltan: [] })
})

test('«RECIBO 15:9» NO es el recibo número 15 — es una fecha sin año', () => {
  // EL DEFECTO QUE ATRAPA: leer el primer número como «número de recibo» inventaría los recibos
  // 15, 22 y 27 de La Estrella, que no existen. Y sin año, la fecha no se completa.
  for (const n of ['RECIBO 15:9.pdf', 'RECIBO 22:9.pdf', 'RECIBO 27:10.pdf']) {
    const d = datosDelNombre(n)
    assert.equal(d.numero, null, n)
    assert.equal(d.fecha, null, n)
    assert.match(d.faltan.join(' '), /año/)
  }
})

test('«RECIBO 19:1:26» es la fecha del 19 de enero, sin número', () => {
  assert.deepEqual(datosDelNombre('RECIBO 19:1:26.pdf').numero, null)
  assert.equal(datosDelNombre('RECIBO 19:1:26.pdf').fecha, '2026-01-19')
})

test('el nombre con sólo número deja la fecha en null y lo dice', () => {
  const d = datosDelNombre('Recibo 17. r.pdf')
  assert.equal(d.numero, '17')
  assert.equal(d.fecha, null)
  assert.deepEqual(d.faltan, ['el nombre no trae fecha'])
})

test('un nombre que no dice nada no inventa nada', () => {
  assert.deepEqual(datosDelNombre('Recibos Julio 2025.pdf'), {
    numero: null, fecha: null, faltan: ['el nombre no trae ni número ni fecha'],
  })
})

test('una fecha imposible es null, no el 31 de febrero', () => {
  assert.equal(aFechaISO(31, 2, 26), null)
  assert.equal(aFechaISO(30, 6, 26), '2026-06-30')
  assert.equal(aFechaISO(1, 12, 2025), '2025-12-01')
})

test('un recibo de sueldo NO es el recibo de un cliente', () => {
  // EL DEFECTO QUE ATRAPA: `ARCOR/SECONDI/…/Recibo de sueldo DIAZ GOMEZ.pdf` está DENTRO de la
  // carpeta del cliente ARCOR. Publicarlo le mostraría a ARCOR el sueldo de gente de otra empresa.
  assert.equal(esReciboDeSueldo('Recibo de sueldo DIAZ GOMEZ .pdf'), true)
  assert.equal(esReciboDeSueldo('Recibo Cortez - liq final OSCAR CORTEZ.pdf'), true)
  assert.equal(esReciboDeSueldo('RECIBO 10 - 30:6:26.pdf'), false)
})

test('«RECIBOS DE SUELDO» no es una carpeta de recibos del cliente', () => {
  assert.equal(esCarpetaDeRecibos('RECIBOS'), true)
  assert.equal(esCarpetaDeRecibos('CERTIFICADOS'), true)
  assert.equal(esCarpetaDeRecibos('RECIBOS DE SUELDO'), false)
  assert.equal(esCarpetaDeRecibos('8. AGOSTO'), false)
})

test('se llama recibo el que empieza con recibo', () => {
  assert.equal(esNombreDeRecibo('RECIBO 9 - 13:6:26.pdf'), true)
  assert.equal(esNombreDeRecibo('ESTADO DE DEURA - 29:6:26.pdf'), false)
  assert.equal(esNombreDeRecibo('PRESUPUESTO.pdf'), false)
})

// El texto es el de `Recibo 10.pdf` de Javier Sánchez, extraído con pdf-parse el 26/08/2026.
const ESTADO_DE_CUENTA = 'JAVIER SANCHEZ /\nIMOTOR SALDO PENDIENTE $ 55.814.174,70\n'
  + 'Obra \tCODIGO \t% FACTURADO FORMA DE PAGO FECHA FA \tFecha de COBRO \tDOLAR \tESTADO \tSub Total - Neto\n'
  + '153.368.716,40\t$\nPago 1 \tLINEA B \t9,78% \tEFECTIVO \t25-jun \t15.000.000,00\t$\n'
  + 'SALDO PENDIENTE \tJS \t78,24% \t33.368.716,40\t$\n'

test('de un estado de cuenta NO sale un importe', () => {
  // EL DEFECTO QUE ATRAPA: cualquier regla del tipo «el número más grande» o «el último total»
  // devolvería 55.814.174,70 —un saldo real del cuadro— presentado como el importe del recibo.
  assert.equal(importeDeclarado(ESTADO_DE_CUENTA), null)
  assert.equal(esEstadoDeCuenta(ESTADO_DE_CUENTA), true)
})

test('de un recibo de verdad sí sale el importe', () => {
  assert.equal(importeDeclarado('Recibí de LA ESTRELLA la suma de pesos diez millones ($ 10.000.000,00)'), 10000000)
  assert.equal(importeDeclarado('IMPORTE: $ 1.234.567,89'), 1234567.89)
  assert.equal(aNumeroArgentino('1.234.567,89'), 1234567.89)
})

test('dos obras que declaran la misma carpeta no deciden nada', () => {
  // Messina declara la MISMA carpeta de Drive para «BSA - Planta» y «BSA - Adicional».
  assert.equal(obraDeLasCarpetas(['bsa-planta', 'bsa-adicional']), null)
  assert.equal(obraDeLasCarpetas([]), null)
  assert.equal(obraDeLasCarpetas(['quattropani', 'quattropani']), 'quattropani')
})
