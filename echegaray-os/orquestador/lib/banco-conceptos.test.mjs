import { test } from 'node:test'
import assert from 'node:assert/strict'
import { norm, conceptoCompatible, numeroAnotado, agruparPorConcepto } from './banco-conceptos.mjs'

const conceptos = (grupos) => grupos.map((g) => g.map((f) => f.concepto).sort()).sort()

test('el mismo concepto con otras mayúsculas y espacios es el mismo movimiento', () => {
  // El caso real del 30/07: el depósito de $16.807.425,92 quedó dos veces porque una descarga escribió
  // "Deposito E-cheq 48hs Presencia Bsr" y la otra todo en minúscula.
  assert.equal(conceptoCompatible('Deposito E-cheq 48hs Presencia Bsr', 'deposito e-cheq  48hs presencia bsr'), 'exacto')
  assert.equal(norm('  Pago   HABERES  '), 'pago haberes')
})

test('un concepto RECORTADO por la descarga sigue siendo el mismo movimiento', () => {
  assert.equal(conceptoCompatible('Pago haberes - 260701507', 'Pago haberes - 260701507 260701507'), 'prefijo')
})

test('DOS CONCEPTOS QUE DIFIEREN EN EL MEDIO NO SE EMPAREJAN: ahí se borraría plata real', () => {
  assert.equal(conceptoCompatible('Id debin cuit 30712345678', 'Id debin z0kv8 cuit 30712345678'), null)
})

test('un prefijo pobre no empareja cualquier cosa', () => {
  // Sin el piso de 8 caracteres, "Iva" identificaría a media planilla.
  assert.equal(conceptoCompatible('Iva', 'Iva percepcion rg 5617'), null)
})

test('numeroAnotado lee el número que el OS anotó, con Nº / No / N° y sin los ceros a la izquierda', () => {
  // El banco escribe "Cheque debitado" a secas: sin leer la anotación, el débito no se atribuye a ningún cheque.
  assert.equal(numeroAnotado('Cheque debitado - Nº 221'), '221')
  assert.equal(numeroAnotado('Cheque debitado - No 0221'), '221')
  assert.equal(numeroAnotado('Cheque debitado - N° 221'), '221')
  assert.equal(numeroAnotado('Cheque debitado'), null)
  assert.equal(numeroAnotado(null), null)
})

// El trío que DISCRIMINA la regla del representante: `largo` y `otro` no son compatibles entre sí
// (difieren en el final), pero los dos lo son con `corto`. Sólo comparando contra el más corto caen
// juntos. Un trío de prefijos encadenados (a → ab → abc) NO sirve de prueba: da un solo grupo con
// cualquier representante, y por eso un test así pasa aunque la regla se haya borrado.
const largo = { concepto: 'Pago haberes 2607 aaa' }
const corto = { concepto: 'Pago haberes 2607' }
const otro = { concepto: 'Pago haberes 2607 bbb' }

test('EL REPRESENTANTE ES EL MÁS CORTO: la copia recortada absorbe a las dos largas', () => {
  // Si el representante fuera "el primero que llegó", `otro` se compararía contra `largo`, no contra
  // `corto`, no emparejaría, y abriría un grupo aparte: el deduplicador informaría "no hay duplicados"
  // sobre filas que sí lo son. Es el defecto del 31/07 (42 movimientos contados dos veces).
  assert.equal(agruparPorConcepto([largo, corto, otro]).length, 1)
  assert.deepEqual(conceptos(agruparPorConcepto([largo, corto, otro])),
    [[largo.concepto, corto.concepto, otro.concepto].sort()])
})

test('LÍMITE CONOCIDO: si el concepto más corto llega ÚLTIMO, el grupo ya se partió', () => {
  // La regla mejora el agrupamiento pero NO lo vuelve independiente del orden: cuando `otro` llega
  // antes que `corto`, ya abrió su propio grupo y nada lo vuelve a juntar. Queda escrito como test para
  // que el límite sea visible y para que nadie afirme una invariancia que el código no da.
  // Consecuencia práctica: el dedup SUBESTIMA duplicados, nunca borra de más. Es el lado seguro.
  assert.equal(agruparPorConcepto([largo, otro, corto]).length, 2)
})

test('movimientos legítimamente distintos quedan en grupos separados', () => {
  // Dos cheques físicos del mismo día y el mismo importe son dos movimientos reales: juntarlos borra plata.
  const filas = [{ concepto: 'Cheque debitado - Nº 221' }, { concepto: 'Cheque debitado - Nº 222' }]
  assert.equal(agruparPorConcepto(filas).length, 2)
})

test('sin filas no hay grupos', () => {
  assert.deepEqual(agruparPorConcepto([]), [])
  assert.deepEqual(agruparPorConcepto(), [])
})
