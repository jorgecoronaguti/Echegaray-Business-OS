import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoComprobante, condicionAPago, matchProveedor, aNumero, aFechaAR, validar, valoresInput, claveNumero, indiceCompras, COL, COL_INPUT, GRUPOS_FORMULA } from './carga-comprobantes.mjs'

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

// El total NO se escribe: lo calcula la fórmula O = N+M. Tampoco T (monto pagado): en el Sheet vivo
// es =IF(F="pago";O;0). Y las columnas del dueño (I/J/K) y las derivadas (AB/AC/AD/AE) no aparecen
// en el input: se dejan para la fórmula o para él.
test('valoresInput escribe sólo lo del comprobante, con el pago deducido de la condición', () => {
  const v = valoresInput({ categoria: 'B', fecha: '5/1/2026', proveedor: 'Combustibles Barcelo', tipo: 'A', numero: '113-010489', concepto: 'combustible auto elevador', neto: '$28.479,30', iva: '$5.981', condicion: 'Contado' })
  assert.equal(v[COL.fecha], '05/01/2026')
  assert.equal(v[COL.proveedor], 'Combustibles Barcelo')
  assert.equal(v[COL.tipo], 'F A')
  assert.equal(v[COL.neto], 28479.30)
  assert.equal(v[COL.iva], 5981)
  assert.equal(v[COL.modalidad], 'Pago')
  assert.equal(v[COL.estado], 'Pagado')
  assert.equal(v[COL.pagado], undefined) // T es fórmula: nunca un número pegado
  assert.equal(v[COL.total], undefined) // O es fórmula, no se escribe
  assert.equal(v[COL.obra], undefined) // J la completa el dueño
  assert.equal(v[COL.rubroCaja], undefined) // AB/AC son ARRAYFORMULA
})

test('cuenta corriente entra pendiente y sin pago', () => {
  const v = valoresInput({ fecha: '5/1/2026', proveedor: 'Robles Jose Maria', neto: 471540.39, iva: 0, condicion: 'Cuenta Corriente' })
  assert.equal(v[COL.modalidad], 'Cuenta Corriente')
  assert.equal(v[COL.estado], 'Pendiente')
  assert.equal(v[COL.pagado], undefined) // no se pagó todavía
})

// Q (fecha prevista de pago) es la fecha de caja de la que cuelga AD. Sólo se escribe si el propio
// comprobante la declara; jamás se copia de la fila anterior ni se inventa.
test('la fecha de pago sólo se escribe si el comprobante la declara', () => {
  const tique = valoresInput({ fecha: '21/7/2026', proveedor: 'Combustibles Barcelo', neto: 13878.97, iva: 2914.58, condicion: 'Contado', fechaPago: '21/7/2026' })
  assert.equal(tique[COL.prevDia], '21/07/2026')
  const sinDato = valoresInput({ fecha: '22/7/2026', proveedor: 'Combustibles Barcelo', neto: 100, iva: 21 })
  assert.equal(sinDato[COL.prevDia], undefined)
})

// El contrato de columnas se corrió una vez y nadie se enteró: la cola (Y..AJ) tiene que coincidir
// con el encabezado real. Este test congela el mapa para que un cambio de la pestaña se vea acá.
test('el mapa de columnas coincide con el encabezado real de Compras (fila 3)', () => {
  assert.equal(COL.estado, 'X')
  assert.equal(COL.tipoCosto, 'Y')
  assert.equal(COL.estadoVisual, 'Z')
  assert.equal(COL.estadoCarga, 'AA')
  assert.equal(COL.rubroCaja, 'AB')
  assert.equal(COL.rubroCaja2, 'AC')
  assert.equal(COL.fechaCaja, 'AD')
  assert.equal(COL.familia, 'AE')
  assert.equal(COL.subRubro, 'AF')
  assert.equal(COL.comercial, 'AJ')
  // Y las que se estampan por fórmula no pueden solaparse con las de input.
  const input = new Set(COL_INPUT.map((k) => COL[k]))
  for (const [a, b] of GRUPOS_FORMULA) {
    assert.ok(!input.has(a), `${a} está en GRUPOS_FORMULA y en COL_INPUT a la vez`)
    assert.ok(!input.has(b), `${b} está en GRUPOS_FORMULA y en COL_INPUT a la vez`)
  }
})

// EL CRUCE DE DUPLICADOS. Caso real del 23/07: el dueño mandó 5 fotos y dos de esas facturas ya
// estaban en la pestaña (filas 770 y 771). ARCA todavía no las tenía (sincroniza con retraso), así
// que el único control capaz de atraparlas es el cruce contra la propia pestaña.
test('claveNumero ignora el relleno de ceros de cada tramo', () => {
  assert.equal(claveNumero('0004-00003600'), '4-3600')
  assert.equal(claveNumero('00004-00003600'), '4-3600')
  assert.equal(claveNumero('4-3600'), '4-3600')
  assert.equal(claveNumero(''), '')
})

test('indiceCompras detecta lo ya cargado por N° y por fecha+importe', () => {
  const fila = (id, fecha, prov, tipo, num, neto, iva, total) => {
    const r = new Array(40).fill('')
    r[0] = id; r[2] = fecha; r[4] = prov; r[6] = tipo; r[7] = num; r[12] = neto; r[13] = iva; r[14] = total
    return r
  }
  const grilla = [
    ['Gastos proyectados y reales'], [], ['ID', 'Categoría'],
    fila('766', '16/7/2026', 'Corralon Progreso', 'F A', '0004-00003600', '$ 42.671', '$ 8.961', '$ 51.631,30'),
    fila('767', '20/7/2026', 'Corralon Progreso', 'F A', '0006-00003320', '$ 14.504', '$ 3.046', '$ 17.550,00'),
  ]
  const idx = indiceCompras(grilla)

  // #2 del fajo: mismo proveedor y N° (escrito con otro relleno) ⇒ ya está, en la fila 4.
  const yaEsta = idx.buscar({ proveedor: 'Corralon Progreso', numero: '00004-00003600', fecha: '16/7/2026', neto: 42670.49, iva: 8960.81 })
  assert.equal(yaEsta.fila, 4)
  assert.match(yaEsta.motivo, /N°/)

  // La misma factura sin N° legible: la atrapa igual por proveedor + fecha + total.
  const sinNumero = idx.buscar({ proveedor: 'Corralon Progreso', numero: '', fecha: '20/7/2026', total: 17550 })
  assert.equal(sinNumero.fila, 5)
  assert.match(sinNumero.motivo, /importe/)

  // Un comprobante nuevo del mismo proveedor NO se marca como duplicado.
  assert.equal(idx.buscar({ proveedor: 'Corralon Progreso', numero: '0006-00003321', fecha: '22/7/2026', neto: 1000, iva: 210 }), null)
  // Y el mismo número de otro proveedor tampoco.
  assert.equal(idx.buscar({ proveedor: 'Combustibles Barcelo', numero: '0004-00003600', fecha: '16/7/2026', neto: 1, iva: 0 }), null)
})
