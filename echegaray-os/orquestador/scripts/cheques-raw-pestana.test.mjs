// Tests de la réplica _CHEQUES_RAW. Herméticos: sin red, sin base, sin Google.
//
// ═══ EL DEFECTO QUE MOTIVÓ ESTOS TESTS (30/07) ═══
//
// La fila de la réplica hacía `String(c.fecha_pago).slice(0, 10)`. El driver de Postgres devuelve una
// columna `date` como objeto **Date**, así que eso daba "Fri Jul 31" — SIN AÑO. Y no dio error: la
// celda quedó como texto con pinta de fecha, ninguna verificación la marcó, y el daño recién apareció
// dos pasos después, cuando toda fórmula que compara fechas sobre la réplica devolvía cero (la banda
// "¿cuándo se vuelve caja?" mostraba "—" con $10.290.000 en cartera vencidos al 31/07).
//
// Una fecha mal escrita no grita: calla. Por eso se prueba con un Date REAL, que es como llega.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaISO, fila, COLUMNAS, COL, FILA0 } from './cheques-raw-pestana.mjs'

test('fechaISO: un objeto Date (como lo devuelve pg) NO pierde el año ni corre el día', () => {
  // EL BUG HACÍA DOS DAÑOS A LA VEZ, y este test los fija los dos. `String(Date).slice(0,10)`:
  //   1. se queda con "Thu Jul 30" → SIN AÑO;
  //   2. y ese día ya está CORRIDO, porque String() usa la hora local y en Argentina (-03:00) la
  //      medianoche UTC del 31 es el 30 a las 21:00. El cheque del 31/07 quedaba escrito como 30.
  const d = new Date('2026-07-31T00:00:00Z')
  assert.equal(String(d).slice(0, 10), 'Thu Jul 30', 'así se veía el defecto: sin año y un día antes')
  assert.equal(fechaISO(d), '2026-07-31', 'y así tiene que quedar')
})

test('fechaISO: el texto ya en ISO pasa igual, y tolera el timestamp completo', () => {
  assert.equal(fechaISO('2026-08-15'), '2026-08-15')
  assert.equal(fechaISO('2026-08-15T00:00:00.000Z'), '2026-08-15')
})

test('fechaISO: lo que no es fecha da cadena vacía, no basura', () => {
  assert.equal(fechaISO(null), '')
  assert.equal(fechaISO(undefined), '')
  assert.equal(fechaISO(''), '')
  assert.equal(fechaISO('sin fecha'), '')
  assert.equal(fechaISO(new Date('no es fecha')), '', 'un Date inválido no escribe "Invalid Date"')
})

test('fechaISO usa UTC: una columna date a medianoche no se corre un día', () => {
  // Con getFullYear/getMonth locales y TZ negativa (Argentina, -03:00), la medianoche UTC del 1º
  // cae el último día del mes anterior. Ese error tampoco da error: da un día equivocado.
  assert.equal(fechaISO(new Date('2026-08-01T00:00:00Z')), '2026-08-01')
  assert.equal(fechaISO(new Date('2026-01-01T00:00:00Z')), '2026-01-01')
})

test('fila: escribe la fecha en ISO venga como Date o como texto', () => {
  const base = {
    tipo: 'recibido', numero: '00000514', banco: 'Santander', librador: 'Mineral Del Río SA',
    contraparte: null, importe: '290000', estado: 'En custodia', cuenta: 'CC', orden_pago: null, obra: null,
  }
  const conDate = fila({ ...base, fecha_pago: new Date('2026-07-31T00:00:00Z') })
  const conTexto = fila({ ...base, fecha_pago: '2026-07-31' })
  assert.equal(conDate[5], '2026-07-31')
  assert.equal(conTexto[5], '2026-07-31')
  assert.deepEqual(conDate, conTexto, 'la réplica sale igual venga como venga de la base')
})

test('fila: el importe es NÚMERO (la banda lo suma con SUMIFS) y los nulos son cadena vacía', () => {
  const f = fila({ tipo: 'emitido', numero: '307', importe: '317000.50', estado: 'Aceptado' })
  assert.equal(f[6], 317000.5)
  assert.equal(typeof f[6], 'number')
  assert.equal(f[3], '', 'librador nulo → vacío, no "null"')
  assert.equal(f[9], '', 'orden de pago nula → vacío, no "null"')
  assert.equal(f[5], '', 'sin fecha de pago → vacío')
})

test('el contrato de columnas es el que referencian las pestañas visibles', () => {
  // Si este orden cambia, las fórmulas de "Cheques Recibidos"/"Cheques Emitidos" apuntan a otra cosa
  // EN SILENCIO. El mapa COL y el orden de COLUMNAS tienen que seguir de acuerdo.
  assert.equal(COLUMNAS.length, 12)
  assert.equal(FILA0, 4)
  const letra = (i) => String.fromCharCode(65 + i)
  const esperado = { tipo: 0, numero: 1, banco: 2, librador: 3, contraparte: 4, fechaPago: 5, importe: 6, estado: 7, cuenta: 8, ordenPago: 9, obra: 10, libradorCuit: 11 }
  for (const [k, i] of Object.entries(esperado)) assert.equal(COL[k], letra(i), `${k} va en la columna ${letra(i)}`)
  assert.equal(COLUMNAS[esperado.fechaPago][0], 'Fecha de pago')
  assert.equal(COLUMNAS[esperado.importe][0], 'Importe')
  assert.equal(COLUMNAS[esperado.estado][0], 'Estado')
  // EL CUIT SE AGREGÓ AL FINAL, A PROPÓSITO. Insertarlo al lado del Librador (columna E) habría
  // corrido importe, estado y fecha una letra: la cartera de CAJA pasaría a sumar texto EN SILENCIO.
  assert.equal(COLUMNAS[11][0], 'CUIT del librador')
  assert.equal(COL.libradorCuit, 'L')
})

test('el CUIT que el dueño tipeó a mano viaja en la réplica', () => {
  // Él completó Librador y CUIT en la pestaña vieja porque el registro por operación no los traía.
  // Los dos datos están hoy en public.cheques: reemplazar esa pestaña hereda su trabajo, no lo borra.
  const f = fila({ tipo: 'recibido', numero: '00000514', librador: 'Mineral Del Rio SA', librador_cuit: '33710848659', importe: 290000 })
  assert.equal(f[3], 'Mineral Del Rio SA')
  // CON GUIONES: es como se lee un CUIT y como el dueño lo había tipeado. Lo formatea lib/cuit.mjs.
  assert.equal(f[11], '33-71084865-9')
  assert.equal(fila({ tipo: 'recibido' })[11], '', 'sin CUIT → vacío, no "null"')
})
