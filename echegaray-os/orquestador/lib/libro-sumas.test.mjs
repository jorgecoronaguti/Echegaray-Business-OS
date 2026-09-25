// EL CONTRATO ENTRE LAS VISTAS Y EL LIBRO — si la pestaña y este mapa divergen, acá se rompe.
//
// La trampa que este archivo mata: LIBRO.col es una COPIA del ENCABEZADO que escribe
// libro-movimientos-pestana.mjs (el script no se puede importar: ejecuta main() al cargarse). Una
// copia sin test es una segunda fuente de verdad — si alguien inserta una columna en la pestaña,
// todas las vistas leerían la columna corrida SIN UN SOLO ERROR, que es el modo de falla más caro
// del repo. El test lee el fuente del script y compara posición por posición.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBRO, rangoLibro, terminoLibro, terminoSumproduct, formulaLibro, cobranzaFacturada } from './libro-sumas.mjs'
import { rangoAbierto, ubicarColumna } from './columnas-por-encabezado.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

test('LIBRO.col espeja el ENCABEZADO real de libro-movimientos-pestana.mjs, posición por posición', () => {
  const fuente = fs.readFileSync(path.join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  const m = fuente.match(/const ENCABEZADO = \[([\s\S]*?)\]/)
  assert.ok(m, 'no encontré el ENCABEZADO en el script — si lo renombraron, este contrato quedó ciego')
  const encabezado = m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  const esperado = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
    'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave', 'Cliente']
  assert.deepEqual(encabezado, esperado, 'el ENCABEZADO de la pestaña cambió: hay que actualizar LIBRO.col y TODAS las vistas que leen el libro')
  // Y las letras del mapa apuntan a esas posiciones exactas.
  const letra = (i) => String.fromCharCode(65 + i)
  const posiciones = { fecha: 0, signo: 1, importe: 2, rubro: 5, estado: 7, instrumento: 8, obra: 12, origen: 13, cliente: 16 }
  for (const [campo, i] of Object.entries(posiciones)) {
    assert.equal(LIBRO.col[campo], letra(i), `LIBRO.col.${campo} tiene que ser la columna ${letra(i)} ("${esperado[i]}")`)
  }
  // LA COLUMNA NUEVA VA AL FINAL, Y ESO ES PARTE DEL CONTRATO. `scripts/conciliar-libro.mjs` lee la
  // pestaña POR ÍNDICE (origen es el 13): una columna insertada en el medio le corre tres campos y
  // sigue conciliando, contra los datos equivocados y sin un solo error. Si alguien mueve `Cliente`
  // adentro del bloque original, este assert se pone rojo antes de que llegue al archivo.
  assert.equal(esperado.indexOf('Cliente'), esperado.length - 1,
    'una columna nueva se agrega AL FINAL: en el medio, corre los índices que lee el portón')
  assert.equal(esperado.indexOf('Origen'), 13, 'el portón lee "Origen" en el índice 13 — si se movió, hay que arreglarlo allá')
})

test('rango abierto: sin tope de fila, para que el libro pueda crecer sin dejar celdas afuera', () => {
  assert.equal(rangoLibro('A'), "_MOVIMIENTOS!$A$2:$A")
  assert.ok(!/\$A\$\d+:\$A\$\d+/.test(rangoLibro('A')), 'un tope escrito hoy es la fila 200 de Cobranzas de nuevo')
})

test('el término lleva SIEMPRE la guarda ISNUMBER(fecha): una celda vacía compara como serial 0', () => {
  const t = terminoLibro({ desde: '0', signo: -1 })
  assert.ok(t.includes('_MOVIMIENTOS!$A$2:$A;">=1"'), t)
  assert.ok(terminoSumproduct({ desde: '0', signo: -1 }).includes('ISNUMBER(_MOVIMIENTOS!$A$2:$A)'))
})

test('ventana + signo + estados: la forma que usan las tres vistas', () => {
  const t = terminoLibro({ desde: 'B$3', hasta: 'B$3+7', signo: 1, estados: ['PROYECTADO', 'VENCIDO'] })
  const C = '_MOVIMIENTOS!$C$2:$C;_MOVIMIENTOS!$A$2:$A;">=1";_MOVIMIENTOS!$A$2:$A;">="&(B$3);_MOVIMIENTOS!$A$2:$A;"<"&(B$3+7);_MOVIMIENTOS!$B$2:$B;1'
  assert.equal(t, `(SUMIFS(${C};_MOVIMIENTOS!$H$2:$H;"=PROYECTADO")+SUMIFS(${C};_MOVIMIENTOS!$H$2:$H;"=VENCIDO"))`)
  assert.equal(terminoSumproduct({ desde: 'B$3', hasta: 'B$3+7', signo: 1, estados: ['PROYECTADO', 'VENCIDO'] }),
    'SUMPRODUCT(ISNUMBER(_MOVIMIENTOS!$A$2:$A)'
    + '*(_MOVIMIENTOS!$A$2:$A>=B$3)'
    + '*(_MOVIMIENTOS!$A$2:$A<B$3+7)'
    + '*(_MOVIMIENTOS!$B$2:$B=1)'
    + '*((_MOVIMIENTOS!$H$2:$H="PROYECTADO")+(_MOVIMIENTOS!$H$2:$H="VENCIDO"))'
    + '*N(_MOVIMIENTOS!$C$2:$C)*N(_MOVIMIENTOS!$B$2:$B))')
})

test('medida: neto multiplica por el signo, magnitud no — y neto es el default', () => {
  assert.equal(terminoLibro({}), '(SUMIFS(_MOVIMIENTOS!$C$2:$C;_MOVIMIENTOS!$A$2:$A;">=1";_MOVIMIENTOS!$B$2:$B;1)'
    + '-SUMIFS(_MOVIMIENTOS!$C$2:$C;_MOVIMIENTOS!$A$2:$A;">=1";_MOVIMIENTOS!$B$2:$B;-1))')
  assert.equal(terminoLibro({ medida: 'magnitud' }), 'SUMIFS(_MOVIMIENTOS!$C$2:$C;_MOVIMIENTOS!$A$2:$A;">=1")')
  assert.ok(terminoSumproduct({}).endsWith('*N(_MOVIMIENTOS!$C$2:$C)*N(_MOVIMIENTOS!$B$2:$B))'))
  assert.ok(terminoSumproduct({ medida: 'magnitud' }).endsWith('*N(_MOVIMIENTOS!$C$2:$C))'))
})

test('el filtro de CLIENTE es un grupo OR sobre la columna Q, en es-AR y sin comas', () => {
  // La columna Q la escribe `libro-clientes.mjs` con el nombre canónico. NO se filtra por contraparte
  // (la J): en un egreso la contraparte es el PROVEEDOR, así que `contraparte="LA ESTRELLA"` devolvería
  // cero para siempre — sin error, mostrando que a ese cliente no se le pagó nada nunca.
  const uno = terminoLibro({ signo: -1, clientes: ['LA ESTRELLA'] })
  assert.ok(uno.includes('_MOVIMIENTOS!$Q$2:$Q;"=LA ESTRELLA"'), uno)
  assert.ok(!uno.includes('$J$2:$J'), 'filtrar por contraparte cuenta el proveedor, no el cliente')
  // Varios clientes son un OR sumado, igual que los rubros: se multiplica por el grupo entero.
  const dos = terminoLibro({ clientes: ['MESSINA', 'ARCOR'] })
  assert.ok(dos.includes('_MOVIMIENTOS!$Q$2:$Q;"=MESSINA"') && dos.includes('_MOVIMIENTOS!$Q$2:$Q;"=ARCOR"'), dos)
  // Sin `clientes`, la condición no aparece: la lista vacía no puede filtrar todo a cero.
  assert.ok(!terminoLibro({ signo: 1 }).includes('$Q$2:$Q'))
  assert.ok(!terminoLibro({ signo: 1, clientes: [] }).includes('$Q$2:$Q'))
  // El archivo es es-AR: el separador de argumentos es `;`. Una coma entra como TEXTO, sin error.
  assert.ok(!dos.includes(','), dos)
})

test('formulaLibro es el término con su =, sin nada más', () => {
  const f = formulaLibro({ signo: -1 })
  assert.ok(f.startsWith('=(-SUMIFS('), f)
  assert.equal(f.slice(1), terminoLibro({ signo: -1 }))
})

test('LA CONTRAPARTE ACOTA LO QUE EL RUBRO NO PUEDE: la cuota del prendario no es todo Financiero', () => {
  // `Financiero` lleva la cuota del préstamo Y los cargos del banco. La pestaña publica la CUOTA.
  const t = terminoLibro({ rubros: ['Financiero'], contrapartes: ['Banco Santander · préstamo prendario'] })
  assert.ok(t.includes('_MOVIMIENTOS!$J$2:$J;"=Banco Santander · préstamo prendario"'), t)
  assert.ok(t.includes('_MOVIMIENTOS!$F$2:$F;"=Financiero"'), t)
})

test('varias contrapartes son un OR: el mismo acreedor se llama distinto según quién probó el pago', () => {
  const t = terminoLibro({ rubros: ['Nómina · Gremiales'], contrapartes: ['Fondo de Cese', 'FCL'] })
  assert.ok(t.includes('_MOVIMIENTOS!$J$2:$J;"=Fondo de Cese"') && t.includes('_MOVIMIENTOS!$J$2:$J;"=FCL"'), t)
})

test('sin contrapartes la fórmula no cambia — el filtro es opcional y no deja rastro', () => {
  assert.equal(terminoLibro({ rubros: ['Financiero'] }), terminoLibro({ rubros: ['Financiero'], contrapartes: [] }))
})

// ═══ «OBRA» INSERTADA EN COBRANZAS H (14/09/2026): la marca de factura se lee por rótulo ═══
test('la marca de factura de Cobranzas sale de la columna «Categoría» resuelta por rótulo, donde esté', () => {
  const esperado = (l) => `ISNUMBER(MATCH(_MOVIMIENTOS!$O$2:$O;FILTER(ROW(Cobranzas!$${l}$5:$${l});Cobranzas!$${l}$5:$${l}="B");0))`
  const de = (cab) => cobranzaFacturada(rangoAbierto('Cobranzas', ubicarColumna(cab, 'Categoría', 'Cobranzas')))
  assert.equal(de(COBRANZAS_1409), esperado('B'))
  assert.equal(de(COBRANZAS_CON_OBRA), esperado('B'), '«Obra» entra en H: Categoría no se mueve')
  assert.equal(de(['ID', 'Obra', 'Categoría']), esperado('C'), 'si Categoría se corre, la marca la sigue')
  assert.throws(() => cobranzaFacturada(), /Categoría/)
})

// ═══ SUMIFS DA EL MISMO NÚMERO QUE EL SUMPRODUCT DE ANTES (25/09/2026) ═══
// El cambio es de costo de recálculo, no de criterio: se evalúan las DOS formas sobre un libro con filas
// de borde (fecha vacía con importe, colchón vacío, signo en los dos sentidos, importe vacío) y tienen que
// coincidir al peso en cada filtro que escriben las vistas.
test('SUMIFS ≡ SUMPRODUCT: el mismo número sobre un libro con filas de borde, filtro por filtro', async () => {
  const { evaluarFormula, hojaDeGrilla } = await import('./evaluar-formula-sheet.mjs')
  const { terminoSumproduct } = await import('./libro-sumas.mjs')
  const d = (dia) => 46266 + dia // 2026-09-01 + dia
  const filas = [
    ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado', 'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave', 'Cliente'],
    [d(0), 1, 1000, 'ARS', '', 'Ventas', '', 'REAL', 'transferencia', 'MESSINA', '', '', 'OB-1', 'Cobranzas', 5, 'k1', 'MESSINA'],
    [d(2), -1, 300, 'ARS', '', 'Materiales', '', 'PROYECTADO', 'cheque', 'Corralón', '', '', 'OB-1', 'Compras', 9, 'k2', ''],
    [d(3), -1, 250.5, 'ARS', '', 'Nómina · Gremiales', '', 'VENCIDO', 'desconocido', 'FCL', '', '', '', 'Cargas Sociales', 3, 'k3', ''],
    [d(9), 1, 4000, 'ARS', '', 'Ventas', '', 'PROYECTADO', 'transferencia', 'ARCOR', '', '', 'OB-2', 'Cobranzas', 7, 'k4', 'ARCOR'],
    ['', -1, 999, 'ARS', '', 'Materiales', '', 'REAL', 'cheque', 'X', '', '', '', 'Compras', 2, 'k5', ''],
    [d(12), -1, '', 'ARS', '', 'Materiales', '', 'COMPROMETIDO', 'cheque', 'Y', '', '', '', 'Compras', 4, 'k6', ''],
    [d(15), -1, 70, 'ARS', '', 'Financiero', '', 'COMPROMETIDO', 'débito', 'Fondo de Cese', '', '', '', 'Banco', 1, 'k7', ''],
    [d(20), 1, 55, 'ARS', '', 'Ventas', '', 'VENCIDO', 'efectivo', 'MESSINA', '', '', 'OB-1', 'Cobranzas', 8, 'k8', 'MESSINA'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  const hojas = { [LIBRO.pestana]: hojaDeGrilla(filas) }
  const filtros = [
    {}, { medida: 'magnitud' }, { signo: 1 }, { signo: -1 }, { signo: -1, medida: 'magnitud' },
    { desde: String(d(1)), hasta: String(d(13)) }, { desde: '0', signo: -1 },
    { desde: String(d(0)), hasta: `${d(0)}+7`, signo: 1, estados: ['PROYECTADO', 'VENCIDO'] },
    { estados: ['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'], signo: -1, medida: 'magnitud' },
    { rubros: ['Materiales', 'Nómina · Gremiales'], estados: ['PROYECTADO', 'VENCIDO', 'REAL'] },
    { clientes: ['MESSINA', 'ARCOR'], signo: 1 }, { contrapartes: ['Fondo de Cese', 'FCL'] },
    { obra: 'OB-1' }, { origenes: ['Compras'], instrumentos: ['cheque', 'efectivo'] },
    { hasta: 'TODAY()+7', signo: -1, estados: ['COMPROMETIDO', 'VENCIDO'], medida: 'magnitud' },
  ]
  const hoy = new Date(Date.UTC(2026, 8, 3))
  for (const f of filtros) {
    const nuevo = terminoLibro(f)
    assert.ok(nuevo.includes('SUMIFS('), `${JSON.stringify(f)} → ${nuevo}`)
    const a = evaluarFormula(`=${nuevo}`, { hojas, hoy })
    const b = evaluarFormula(`=${terminoSumproduct(f)}`, { hojas, hoy })
    assert.ok(Math.abs(a - b) < 1e-9, `${JSON.stringify(f)}: SUMIFS ${a} ≠ SUMPRODUCT ${b}`)
  }
})

test('SUMIFS: vuelve a SUMPRODUCT con una condición extra o con demasiadas combinaciones', () => {
  assert.match(terminoLibro({ extra: ['(1=1)'] }), /^SUMPRODUCT\(/)
  const muchos = terminoLibro({ estados: ['A', 'B', 'C'], rubros: ['1', '2', '3'], contrapartes: ['x', 'y'] })
  assert.match(muchos, /^SUMPRODUCT\(/, '18 combinaciones × 2 signos no se escriben como 36 SUMIFS')
  // Un comodín que venga en el dato se escapa: «*» en un nombre no puede volverse «cualquier cosa».
  assert.ok(terminoLibro({ contrapartes: ['A*B?'] }).includes('"=A~*B~?"'))
})
