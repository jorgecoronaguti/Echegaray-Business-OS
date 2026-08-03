import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoComprobante, condicionAPago, matchProveedor, aNumero, aFechaAR, validar, valoresInput, discrepanciaNeto, redondear2, verificarEscritura, mismoValor, colIndice, COL } from './carga-comprobantes.mjs'

test('el tipo de comprobante se normaliza al valor exacto del desplegable', () => {
  assert.equal(tipoComprobante('A'), 'F A')
  assert.equal(tipoComprobante('Factura B'), 'F B')
  assert.equal(tipoComprobante('C'), 'F C')
  assert.equal(tipoComprobante('Nota de Credito A'), 'N C')
  assert.equal(tipoComprobante('cualquier cosa'), null) // no se inventa un tipo
})

// La condición de venta de la factura es lo ÚNICO que la foto declara sobre el pago. Contado = ya
// pagada; Cuenta Corriente = pendiente. Sin condición no se inventa un estado.
test('la condición de venta define modalidad, estado y total/parcial', () => {
  assert.deepEqual(condicionAPago('Contado'), { modalidad: 'Pago', estado: 'Pagado', totalParcial: 'Total' })
  assert.deepEqual(condicionAPago('Cuenta Corriente'), { modalidad: 'Cuenta Corriente', estado: 'Pendiente', totalParcial: 'Total' })
  assert.equal(condicionAPago('').estado, null)
})

// E es un desplegable ESTRICTO. Un proveedor que no está no se fuerza como variante nueva silenciosa:
// se marca esNuevo para que el dueño lo confirme, nunca se inventa una grafía.
test('el proveedor se matchea contra la lista y marca los nuevos', () => {
  const lista = ['Combustibles Barcelo', 'Robles Jose Maria', 'Ferretería Cobos']
  assert.deepEqual(matchProveedor('combustibles barcelo', lista), { valor: 'Combustibles Barcelo', esNuevo: false })
  assert.equal(matchProveedor('FERRETERIA COBOS', lista).valor, 'Ferretería Cobos') // tilde no cruza
  const nuevo = matchProveedor('Corralón El Sol', lista)
  assert.equal(nuevo.esNuevo, true)
  assert.equal(nuevo.valor, 'Corralón El Sol') // el nombre tal cual, sin inventar variante
})

test('los importes es-AR entran como número y las fechas como DD/MM/YYYY', () => {
  assert.equal(aNumero('$28.479,30'), 28479.30)
  assert.equal(aNumero('$ 5.981'), 5981)
  assert.equal(aNumero(44664), 44664)
  assert.equal(aNumero('no'), null)
  assert.equal(aFechaAR('5/1/2026'), '05/01/2026')
  assert.equal(aFechaAR('2026-01-05'), '05/01/2026')
  assert.equal(aFechaAR(new Date(2026, 0, 5)), '05/01/2026')
  assert.equal(aFechaAR('sin fecha'), null)
})

test('validar exige lo mínimo para que las fórmulas y los cruces funcionen', () => {
  assert.deepEqual(validar({ fecha: '5/1/2026', proveedor: 'RSV', neto: '$44.664' }), [])
  assert.ok(validar({ proveedor: 'RSV', neto: 100 }).includes('fecha ilegible o ausente'))
  assert.ok(validar({ fecha: '5/1/2026', neto: 100 }).includes('sin proveedor'))
  assert.ok(validar({ fecha: '5/1/2026', proveedor: 'RSV' }).includes('sin importe numérico'))
})

// El total NO se escribe: lo calcula la fórmula O = N+M. Y las columnas del dueño (I/J/K) y las
// derivadas (AC/AD/AE) no aparecen en el input: se dejan para la fórmula o para él.
test('valoresInput escribe sólo lo del comprobante, con el pago deducido de la condición', () => {
  const v = valoresInput({ categoria: 'B', fecha: '5/1/2026', proveedor: 'Combustibles Barcelo', tipo: 'A', numero: '113-010489', concepto: 'combustible auto elevador', neto: '$28.479,30', iva: '$5.981', condicion: 'Contado' })
  assert.equal(v[COL.fecha], '05/01/2026')
  assert.equal(v[COL.proveedor], 'Combustibles Barcelo')
  assert.equal(v[COL.tipo], 'F A')
  assert.equal(v[COL.neto], 28479.30)
  assert.equal(v[COL.iva], 5981)
  assert.equal(v[COL.modalidad], 'Pago')
  assert.equal(v[COL.estado], 'Pagado')
  assert.equal(v[COL.pagado], 28479.30 + 5981) // contado ⇒ pagado = total
  assert.equal(v[COL.total], undefined) // O es fórmula, no se escribe
  assert.equal(v[COL.obra], undefined) // J la completa el dueño
  assert.equal(v[COL.rubroCaja], undefined) // AC es ARRAYFORMULA
})

test('cuenta corriente entra pendiente y sin pago', () => {
  const v = valoresInput({ fecha: '5/1/2026', proveedor: 'Robles Jose Maria', neto: 471540.39, iva: 0, condicion: 'Cuenta Corriente' })
  assert.equal(v[COL.modalidad], 'Cuenta Corriente')
  assert.equal(v[COL.estado], 'Pendiente')
  assert.equal(v[COL.pagado], undefined) // no se pagó todavía
})

// EL CORAZÓN DE LA FIABILIDAD: M tiene que ser Total − IVA para que O = M+N cierre con la plata que
// salió. Cuando la foto trae el TOTAL, M se deriva de él y absorbe la percepción/impuesto interno que
// el "neto gravado" del comprobante no incluía. Sin esto, O quedaría corto: la carga MAL hecha.
test('cuando hay total, M se deriva como Total − IVA y absorbe la percepción', () => {
  // Factura con percepción IIBB: neto gravado 100.000, IVA 21.000, percepción 3.500, total 124.500.
  const v = valoresInput({ fecha: '5/1/2026', proveedor: 'Robles Jose Maria', neto: 100000, iva: 21000, total: 124500, condicion: 'Contado' })
  assert.equal(v[COL.neto], 103500) // 124.500 − 21.000 = M absorbe los 3.500 de percepción
  assert.equal(v[COL.iva], 21000) // N = IVA discriminado, intacto
  // O es fórmula (=M+N) ⇒ 103.500 + 21.000 = 124.500 = total real. Contado ⇒ pagado = ese total.
  assert.equal(v[COL.pagado], 124500)
  assert.equal(v[COL.total], undefined) // O nunca se escribe
})

test('sin total declarado, M usa el neto crudo de la foto (comportamiento previo intacto)', () => {
  const v = valoresInput({ fecha: '5/1/2026', proveedor: 'Combustibles Barcelo', neto: '$28.479,30', iva: '$5.981', condicion: 'Contado' })
  assert.equal(v[COL.neto], 28479.30)
  assert.equal(v[COL.pagado], 28479.30 + 5981)
})

// discrepanciaNeto avisa cuando el neto crudo no cierra con el total: hay una percepción/impuesto
// interno que hay que revisar. Es la alarma que el loader muestra.
test('discrepanciaNeto detecta la percepción no absorbida y tolera el redondeo', () => {
  assert.equal(discrepanciaNeto({ neto: 100000, iva: 21000, total: 124500 }), 3500)
  assert.equal(discrepanciaNeto({ neto: 100000, iva: 21000, total: 121000 }), null) // cierra: sin percepción
  assert.equal(discrepanciaNeto({ neto: 100000, iva: 21000, total: 121000.30 }), null) // < $0,50 = redondeo
  assert.equal(discrepanciaNeto({ neto: 100000, iva: 0, total: 100000 }), null)
  assert.equal(discrepanciaNeto({ total: 124500 }), null) // sin neto no se compara
  assert.equal(discrepanciaNeto({ neto: 100000 }), null) // sin total no se compara
})

test('redondear2 no arrastra el error binario de la resta', () => {
  assert.equal(redondear2(124500 - 21000), 103500)
  assert.equal(redondear2(0.1 + 0.2), 0.3)
  assert.equal(redondear2(null), null)
})

// ═══ VERIFICAR EL EFECTO (03/08) — lo que quedó en la celda, no lo que contestó la API ═══
//
// El cargador imprimió "✔ Escritas 7 fila(s). Sin #ERROR." con las filas 800..806 VACÍAS: la guarda había
// descartado los rangos. Estas funciones son el control que faltaba, y tienen que aguantar el ida y vuelta
// real del Sheet (es-AR formatea los números y las fechas) sin volverse laxas: una celda vacía NUNCA pasa.

test('mismoValor tolera el formato es-AR de vuelta del Sheet, y nunca da por buena una celda vacía', () => {
  assert.equal(mismoValor(28479.3, '$ 28.479,30'), true)   // el importe vuelve formateado
  assert.equal(mismoValor('22/07/2025', '22/7/2025'), true) // la fecha vuelve sin el cero
  assert.equal(mismoValor('Combustibles Barcelo', 'combustibles barcelo'), true)
  assert.equal(mismoValor(28479.3, '$ 28.470,00'), false)  // otro importe NO es el mismo
  assert.equal(mismoValor('ARCOR', 'YPF'), false)
  assert.equal(mismoValor('ARCOR', ''), false, 'la celda vacía es exactamente el caso que hay que cazar')
  assert.equal(mismoValor('ARCOR', null), false)
  assert.equal(mismoValor(0, '0'), true)                   // el 0 es un valor, no un vacío
})

test('colIndice ubica la columna del contrato de Compras', () => {
  assert.equal(colIndice('A'), 0)
  assert.equal(colIndice(COL.total), 14)   // O = Total
  assert.equal(colIndice(COL.rubroCaja), 28) // AC = Rubro de caja
})

test('verificarEscritura CAZA el caso real: la guarda descartó todo y las filas quedaron vacías', () => {
  // Reproduce lo medido el 03/08: se pidieron 2 filas, el Sheet devuelve el bloque sin nada.
  const querido = [{ E: 'ARCOR', H: '0001-00012345', M: 28479.3 }, { E: 'YPF', H: '0002-00000777', M: 5000 }]
  const v = verificarEscritura(querido, [], { desde: 800 })
  assert.equal(v.ok, false, 'no se puede decir "escritas 2 filas" sobre un bloque vacío')
  assert.equal(v.vacias.length, 6, 'cada celda que se pidió escribir y no está, se nombra')
  assert.deepEqual(v.vacias[0], { fila: 800, columna: 'E', esperado: 'ARCOR' })
  assert.equal(v.vacias.at(-1).fila, 801)
})

test('verificarEscritura da OK cuando el dato está en su destino, aunque vuelva formateado', () => {
  const querido = [{ E: 'ARCOR', C: '22/07/2025', M: 28479.3 }]
  const fila = []
  fila[colIndice('C')] = { valor: '22/07/2025' }
  fila[colIndice('E')] = { valor: 'ARCOR' }
  fila[colIndice('M')] = { valor: '$ 28.479,30' }
  const v = verificarEscritura(querido, [fila], { desde: 800 })
  assert.equal(v.ok, true)
  assert.deepEqual(v.vacias, [])
  assert.deepEqual(v.distintas, [])
})

test('verificarEscritura caza la escritura PARTIDA al medio (un 429 entre dos rangos)', () => {
  // Este repo ya pagó una escritura cortada por un 429: entró una columna y la otra no. El total de filas
  // "escritas" no lo detecta; la celda que falta, sí. Y una celda con OTRO valor tampoco pasa.
  const querido = [{ E: 'ARCOR', M: 28479.3 }, { E: 'YPF', M: 5000 }]
  const f0 = []; f0[colIndice('E')] = { valor: 'ARCOR' }; f0[colIndice('M')] = { valor: '$ 28.479,30' }
  const f1 = []; f1[colIndice('E')] = { valor: 'YPF' }; f1[colIndice('M')] = { valor: '$ 500,00' }
  const v = verificarEscritura(querido, [f0, f1], { desde: 800 })
  assert.equal(v.ok, false)
  assert.deepEqual(v.vacias, [])
  assert.deepEqual(v.distintas, [{ fila: 801, columna: 'M', esperado: 5000, encontrado: '$ 500,00' }])
})
