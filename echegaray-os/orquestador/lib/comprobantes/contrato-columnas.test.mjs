// EL CONTRATO DE COLUMNAS DE "Compras", CONGELADO CONTRA LA MEDICIÓN DEL SHEET VIVO.
//
// La medición está abajo, con su fecha y su rango: es un DATO, no una opinión sobre el Sheet. Si la
// pestaña cambia, este test se pone rojo y hay que volver a medir — que es exactamente lo que no
// pasó entre el 14/08 y el 25/08, y por eso `GRUPOS_FORMULA` se fue quedando corta sin avisar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTRATO, NATURALEZA, GRUPOS_FORMULA, COLUMNAS_A_ESTAMPAR, LETRAS_ARRAYFORMULA,
  columna, letrasIndebidas, tramosContiguos, indiceDe, letraDe,
} from './contrato-columnas.mjs'
import { GRUPOS_FORMULA as GRUPOS_DEL_CARGADOR, valoresInput, filaModeloDeFormulas } from '../carga-comprobantes.mjs'

/**
 * MEDIDO EL 25/08/2026 sobre `Compras!A800:AN895` con `readSheetGrid` (96 filas: 92 con datos y las
 * cuatro últimas vacías, que son la plantilla pura). `formula` = celdas con fórmula propia;
 * `derramada` = celdas con valor calculado que NADIE escribió (el derrame de una ARRAYFORMULA de la
 * fila 4). Sólo van las columnas donde la distinción decide algo.
 */
const MEDICION_25_08 = {
  A: { formula: 96 }, D: { formula: 96 }, O: { formula: 96 }, Z: { formula: 96 },
  AG: { formula: 96 }, AH: { formula: 96 }, AI: { formula: 96 },
  // Las tres que el dueño reportó pisadas, con el conteo exacto.
  Q: { formula: 59, valor: 37 },
  R: { formula: 94, valor: 2 },
  U: { formula: 89, valor: 7 },
  // Las dos que el cargador pisa a propósito: la fórmula sobrevive sólo donde no cargó nada.
  T: { formula: 45, valor: 51 },
  X: { formula: 34, valor: 62 },
  // Las diez que derraman desde la fila 4. La cabecera de `escritura.mjs` sólo nombraba cinco.
  AB: { derramada: 92 }, AC: { derramada: 92 }, AD: { derramada: 91 }, AE: { derramada: 66 },
  AF: { derramada: 13 }, AJ: { derramada: 92 }, AK: { derramada: 0 }, AL: { derramada: 92 },
  AM: { derramada: 53 }, AN: { derramada: 14 },
}

// ═══ EL DEFECTO 1: `GRUPOS_FORMULA` NO CUBRÍA TODAS LAS FÓRMULAS POR FILA ═══
//
// Declaraba ocho columnas (`A D O Q:R Z AH:AI`). Medidas, son doce, y dos de las que faltaban tienen
// fórmula en casi todas las filas: `U` (89/96) y `AG` (96/96). Una fila nueva nacía sin ellas.
test('el cargador estampa TODAS las columnas que el Sheet tiene con fórmula por fila', () => {
  const conFormula = Object.entries(MEDICION_25_08).filter(([, m]) => m.formula > 0).map(([l]) => l)
  const cubiertas = new Set()
  for (const [a, b] of GRUPOS_DEL_CARGADOR) {
    for (let i = indiceDe(a); i <= indiceDe(b); i++) cubiertas.add(letraDe(i))
  }
  // T y X quedan fuera a propósito: el cargador les escribe un valor encima y estamparlas después lo
  // borraría. La decisión de sacar esa pisada es del dueño; hasta entonces no entran acá.
  const esperadas = conFormula.filter((l) => !columna(l).pisaElCargador)
  const faltan = esperadas.filter((l) => !cubiertas.has(l))
  assert.deepEqual(faltan, [], `columnas con fórmula por fila que el cargador NO estampa: ${faltan.join(', ')}`)
})

test('las pisadas declaradas son exactamente T y X — una nueva rompe el test', () => {
  assert.deepEqual(CONTRATO.filter((c) => c.pisaElCargador).map((c) => c.letra), ['T', 'X'])
  assert.equal(COLUMNAS_A_ESTAMPAR.includes('T'), false)
  assert.equal(COLUMNAS_A_ESTAMPAR.includes('X'), false)
})

// ═══ EL DEFECTO 2: LA LISTA DE ARRAYFORMULA ESTABA A LA MITAD ═══
//
// `escritura.mjs` declaraba «AC/AD/AE/AF/AJ». Medidas, derraman diez columnas. Escribir aunque sea
// `""` en `AL` (Saldo pendiente) o en `AN` (Tramo de vencimiento) no rompe una fila: rompe la
// columna entera desde la fila 4, y de ahí sale la deuda comercial por tramos.
test('las diez columnas que derraman desde la fila 4 están todas declaradas intocables', () => {
  const derramadas = Object.entries(MEDICION_25_08).filter(([, m]) => 'derramada' in m).map(([l]) => l)
  assert.deepEqual([...LETRAS_ARRAYFORMULA].sort(), derramadas.sort())
  for (const l of derramadas) {
    const [mal] = letrasIndebidas([l])
    assert.ok(mal, `${l} tendría que estar prohibida y no lo está`)
    assert.match(mal.motivo, /derrame/)
  }
})

// ═══ LA CAUSA RAÍZ DE LA PISADA DE Q, CONGELADA ═══
//
// Ninguna línea del cargador escribe `Q`, `R` ni `U`: `valoresInput` es la única fuente de lo que se
// escribe, y no las produce ni con un comprobante que trae todo. Las 37 pisadas de `Q` que el dueño
// midió no salen de acá. Este test es lo que impide que salgan de acá mañana.
test('valoresInput nunca produce una columna que sea fórmula sin pisada declarada', () => {
  const completo = {
    categoria: 'A', fecha: '25/08/2026', proveedor: 'Combustibles Barcelo', tipo: 'A',
    numero: '0001-00012345', concepto: 'Nafta Súper', neto: 100000, iva: 21000, total: 121000,
    condicion: 'Cuenta Corriente', formaPago: 'Echeq', unidad: 'Estructura', obra: 'Taller',
    detalle: 'flota', totalParcial: 'Total',
  }
  const letras = Object.keys(valoresInput(completo))
  for (const l of ['Q', 'R', 'U', 'V', 'W', 'Y', 'AA', ...LETRAS_ARRAYFORMULA]) {
    assert.equal(letras.includes(l), false, `valoresInput escribió ${l}, que no le corresponde`)
  }
  assert.deepEqual(letrasIndebidas(letras), [])
})

// ═══ EL DEFECTO 3: UN CERO EN `T` AFIRMA «PAGUÉ CERO» Y MATA LA FÓRMULA ═══
//
// Medido en la fila 889 del 25/08: `T` con `0` sobre una fila cuyo Estado dice «Pendiente». La
// plantilla tiene ahí `=IF(F="pago";O;0)`, que ya devuelve 0 sola y SIGUE VIVA. Escribir el 0 encima
// no agrega un dato: cambia una celda que se recalcula por una que afirma un hecho que no ocurrió.
test('un monto pagado de cero NO se escribe: la fórmula de T ya dice cero y se queda viva', () => {
  const v = valoresInput({
    fecha: '25/08/2026', proveedor: 'Robles Jose Maria', neto: 0, iva: 0, total: 0, condicion: 'Contado',
  })
  assert.equal(v.T, undefined, 'escribió un 0 en Monto Pagado sobre la fórmula que ya daba 0')
})

test('un monto pagado real sí se escribe — el arreglo del cero no apaga la columna', () => {
  const v = valoresInput({
    fecha: '25/08/2026', proveedor: 'Robles Jose Maria', neto: 100000, iva: 21000, total: 121000, condicion: 'Contado',
  })
  assert.equal(v.T, 121000)
})

// ═══ LA FILA MODELO TIENE QUE EXIGIR LAS DOCE, NO LAS OCHO ═══
//
// `filaModeloDeFormulas` copia las fórmulas de la última fila que las tenga TODAS. Con `U` fuera de
// la lista, una fila con `U` pegada a mano calificaba como modelo y el `PASTE_FORMULA` bajaba ese
// literal —un cero— a todas las filas nuevas: el saldo del pago parcial nacía muerto.
test('una fila con U pegada a mano no puede ser la fila modelo', () => {
  const conFormulaEnTodo = () => {
    const fila = []
    for (const [a, b] of GRUPOS_FORMULA) {
      for (let i = indiceDe(a); i <= indiceDe(b); i++) fila[i] = { formula: '=algo()' }
    }
    return fila
  }
  const sana = conFormulaEnTodo()
  const conUPegada = conFormulaEnTodo()
  conUPegada[indiceDe('U')] = { formula: null, valor: 0 } // exactamente lo medido en la fila 889

  const r = filaModeloDeFormulas([sana, conUPegada], { desde: 888 })
  assert.equal(r.fila, 888, 'eligió como modelo la fila que tiene U pegada a mano')
})

// ═══ UTILITARIOS DEL CONTRATO ═══

test('los tramos contiguos agrupan y no inventan columnas intermedias', () => {
  assert.deepEqual(tramosContiguos(['Q', 'R', 'U']), [['Q', 'R'], ['U', 'U']])
  assert.deepEqual(tramosContiguos(['AG', 'AH', 'AI']), [['AG', 'AI']])
  assert.deepEqual(tramosContiguos(['A', 'C']), [['A', 'A'], ['C', 'C']])
})

test('el contrato cubre A→AN sin huecos y sin repetir una letra', () => {
  assert.equal(CONTRATO.length, 40)
  CONTRATO.forEach((c, i) => assert.equal(c.letra, letraDe(i), `la columna ${i} debería ser ${letraDe(i)}`))
  for (const c of CONTRATO) assert.ok(Object.values(NATURALEZA).includes(c.naturaleza), `${c.letra} sin naturaleza válida`)
})

test('una letra fuera del contrato se rechaza con motivo, no con un booleano', () => {
  assert.deepEqual(letrasIndebidas(['B', 'C', 'E']), [])
  const [q] = letrasIndebidas(['Q'])
  assert.match(q.motivo, /fórmula por fila/)
  const [zz] = letrasIndebidas(['ZZ'])
  assert.match(zz.motivo, /no está en el contrato/)
})
