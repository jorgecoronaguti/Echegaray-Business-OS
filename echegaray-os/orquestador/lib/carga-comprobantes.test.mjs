import test from 'node:test'
import assert from 'node:assert/strict'
import * as carga from './carga-comprobantes.mjs'
import { tipoComprobante, condicionAPago, matchProveedor, distanciaEdicion, aNumero, aFechaAR, valoresInput, discrepanciaNeto, redondear2, verificarEscritura, mismoValor, colIndice, COL } from './carga-comprobantes.mjs'

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

test('el punto decimal impreso NO es un separador de miles — el ticket de Trielec (21/08)', () => {
  // El tique 0038-00002973 imprime los decimales con PUNTO. Borrar todos los puntos cargó
  // $95.277,07 como $9.527.707 — cada importe ×100, coherentes entre sí, invisibles para la
  // identidad aritmética. Un grupo final de DOS dígitos tras el punto es un decimal, siempre.
  assert.equal(aNumero('95277.07'), 95277.07)
  assert.equal(aNumero('76836.35'), 76836.35)
  assert.equal(aNumero('16135.63'), 16135.63)
  assert.equal(aNumero('2305.09'), 2305.09)
  assert.equal(aNumero('12806.0590'), 12806.059, 'cuatro decimales tampoco son un grupo de miles')
  assert.equal(aNumero('227872.31'), 227872.31)
  // Lo es-AR de siempre sigue intacto: puntos que agrupan de a tres son miles.
  assert.equal(aNumero('9.527.707'), 9527707)
  assert.equal(aNumero('686.070,00'), 686070)
  assert.equal(aNumero('1.234'), 1234)
  // Y el espejo US con comas de miles no fabrica un decimal.
  assert.equal(aNumero('1,234,567'), 1234567)
  assert.equal(aNumero('1,234.56'), 1234.56)
  assert.equal(aNumero('-95277.07'), -95277.07)
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

// ESTE ARCHIVO NO CONTESTA "¿QUÉ LE FALTA?" (03/08). `validar()` vivía acá y contestaba distinto que
// `preguntasDe()` del bot: dos criterios para la misma pregunta. La respuesta se unificó en
// `comprobantes/faltantes.mjs`, parametrizada por política, y sus casos se prueban allá.
//
// Este test se pone ROJO si alguien la vuelve a definir acá. No es celo de estilo: la divergencia
// anterior hizo que el bot revisara el proveedor con una regla que el cargador no tenía y viceversa,
// y cada cara creía estar aplicando "la" validación.
test('este módulo NO define qué le falta a un comprobante: eso vive en faltantes.mjs', () => {
  assert.equal(carga.validar, undefined, 'volvió a haber una segunda definición de "qué le falta"')
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

test('verificarEscritura compara el NÚMERO crudo, no el mostrado por el formato', () => {
  // El 03/08/2026 las 7 filas quedaron perfectas en Compras y el script las declaró no escritas:
  // el formato moneda sin decimales muestra "$ 54.448" para 54447,71 y la comparación daba 29
  // centavos de diferencia. Un verificador que da rojo sobre una escritura correcta se desactiva,
  // y entonces no sirve el día que la escritura sí falla.
  const r = verificarEscritura(
    [{ M: 54447.71, N: 9558.36 }],
    [[...Array(12), { valor: '$ 54.448', numero: 54447.71 }, { valor: '$ 9.558', numero: 9558.36 }]],
    { desde: 800 },
  )
  assert.equal(r.ok, true, `no debería haber diferencias: ${JSON.stringify(r.distintas)}`)
})

test('pero un número REALMENTE distinto sigue dando rojo', () => {
  const r = verificarEscritura(
    [{ M: 54447.71 }],
    [[...Array(12), { valor: '$ 99.999', numero: 99999 }]],
    { desde: 800 },
  )
  assert.equal(r.ok, false)
  assert.equal(r.distintas[0].columna, 'M')
})

test('una celda vacía sigue siendo vacía aunque se espere un número', () => {
  const r = verificarEscritura([{ M: 54447.71 }], [[...Array(12), { valor: '', numero: null }]], { desde: 800 })
  assert.equal(r.ok, false)
  assert.equal(r.vacias[0].columna, 'M')
})

test('EL CASO REAL: "COMESTIBLES BARCELO" es Combustibles Barcelo, que tiene 127 compras', () => {
  // El OCR de una carga de combustible leyó "COMESTIBLES". El bot ofreció dar de alta un proveedor
  // nuevo, lo que habría partido en dos la cuenta corriente de uno de los mayores proveedores.
  const lista = ['Combustibles Barcelo', 'Alumetal', 'Corralon Progreso', 'DUPEC']
  const m = matchProveedor('COMESTIBLES BARCELO', lista)
  assert.equal(m.esNuevo, false, 'lo declaró proveedor nuevo')
  assert.equal(m.valor, 'Combustibles Barcelo')
  assert.equal(m.motivo, 'ocr')
})

test('el umbral es estricto: un proveedor de verdad distinto SIGUE siendo nuevo', () => {
  // El error caro es el opuesto: fusionar dos proveedores que sí son distintos.
  const lista = ['Combustibles Barcelo', 'Alumetal', 'Hormiserv']
  for (const nuevo of ['Ferretería del Centro', 'Aceros del Sur', 'Hormigonera XXI']) {
    assert.equal(matchProveedor(nuevo, lista).esNuevo, true, `fusionó "${nuevo}" con otro proveedor`)
  }
  // NOTA: "Alumetal Norte SA" SÍ se fusiona con "Alumetal", pero por la regla de CONTENCIÓN que ya
  // existía, no por la distancia de edición. Es un riesgo real y anterior a este cambio: un
  // proveedor cuyo nombre contiene al de otro se absorbe en silencio. Queda declarado acá.
  assert.equal(matchProveedor('Alumetal Norte SA', lista).motivo, 'parcial')
})

test('si dos proveedores empatan a la misma distancia, se declara nuevo y no se adivina', () => {
  // Los dos quedan a distancia 1 del leído: no hay forma de saber cuál es.
  const lista = ['Ferreteria Sar', 'Ferreteria Ser']
  const m = matchProveedor('Ferreteria Sur', lista)
  assert.equal(m.esNuevo, true, 'eligió uno de dos candidatos igual de parecidos')
})

test('un nombre corto no entra al match por distancia: el umbral daría 0', () => {
  const lista = ['RSV', 'RSX']
  assert.equal(matchProveedor('RSW', lista).esNuevo, true)
})

test('la distancia de edición corta temprano y no miente', () => {
  assert.equal(distanciaEdicion('comestibles barcelo', 'combustibles barcelo', 3), 2)
  assert.equal(distanciaEdicion('igual', 'igual', 3), 0)
  assert.equal(distanciaEdicion('abc', 'xyz', 2), 3, 'por encima del tope devuelve tope+1')
  assert.equal(distanciaEdicion('a', 'aaaaaaaa', 2), 3, 'diferencia de largo mayor al tope')
})
