// LAS FÓRMULAS QUE SE ANCLAN EN COMPRAS SIGUEN AL RÓTULO, Y EL PORTÓN NO DEJA TOCAR LO DEL DUEÑO (14/09/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { traducirAlLayoutVivo, filasAlLayoutDeReferencia, columnaParaEscribir, portonDeRequests } from './compras-layout.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

const F = '=ARRAYFORMULA(IF($E$4:$E="";"";IF(($X$4:$X="Pendiente")*($AJ$4:$AJ=1);$O$4:$O-$T$4:$T;0)))'

test('con el encabezado de hoy la traducción es la identidad; con «Obra» cada columna a la derecha de K se corre', () => {
  assert.equal(traducirAlLayoutVivo(F, { vivo: COMPRAS_2508 }), F)
  assert.equal(traducirAlLayoutVivo(F, { vivo: COMPRAS_CON_OBRA }),
    '=ARRAYFORMULA(IF($E$4:$E="";"";IF(($Y$4:$Y="Pendiente")*($AK$4:$AK=1);$P$4:$P-$U$4:$U;0)))')
})

test('los dos «Rubro de caja» se traducen por ocurrencia, no por nombre', () => {
  assert.equal(traducirAlLayoutVivo('=$AB$4:$AB&$AC$4:$AC', { vivo: COMPRAS_CON_OBRA }), '=$AC$4:$AC&$AD$4:$AD')
})

test('lo que está entre comillas no se toca, y una referencia relativa se rechaza', () => {
  assert.equal(traducirAlLayoutVivo('=IF($O$4:$O>0;"$O$4";"")', { vivo: COMPRAS_CON_OBRA }), '=IF($P$4:$P>0;"$O$4";"")')
  assert.throws(() => traducirAlLayoutVivo('=O4+N4', { vivo: COMPRAS_CON_OBRA }), /relativa/)
})

test('un rótulo que falta en la fila viva es un error con su nombre, no una letra de respaldo', () => {
  const sinSaldo = COMPRAS_CON_OBRA.map((r) => (r === 'Total' ? 'Total con IVA' : r))
  assert.throws(() => traducirAlLayoutVivo(F, { vivo: sinSaldo }), /«Total»/)
  assert.throws(() => traducirAlLayoutVivo(F, { vivo: [] }), /fila de rótulos viva/)
})

test('las filas del layout vivo vuelven al de referencia por rótulo (para las libs que indexan)', () => {
  const fila = COMPRAS_CON_OBRA.map((r, i) => `${i}:${r}`)
  const [ref] = filasAlLayoutDeReferencia([fila], COMPRAS_CON_OBRA)
  assert.equal(ref[14], '15:Total')
  assert.equal(ref[37], '38:Saldo pendiente (OS)')
  assert.equal(ref.includes('11:Obra'), false, 'la columna nueva no existe en la referencia')
})

test('EL PORTÓN · cada escritor resuelve SU columna, antes y después de insertar', () => {
  assert.equal(columnaParaEscribir(COMPRAS_2508, 'compras-saldo-pendiente', 'saldo').letra, 'AL')
  assert.equal(columnaParaEscribir(COMPRAS_CON_OBRA, 'compras-saldo-pendiente', 'saldo').letra, 'AM')
  assert.equal(columnaParaEscribir(COMPRAS_CON_OBRA, 'proveedores-aging-columna', 'tramo').letra, 'AO')
  assert.equal(columnaParaEscribir(COMPRAS_CON_OBRA, 'rubro-caja-sheet', 'fechaCaja').letra, 'AE')
  assert.throws(() => columnaParaEscribir(COMPRAS_CON_OBRA, 'compras-saldo-pendiente', 'fechaCaja'), /no escribe «fechaCaja»/)
  assert.throws(() => columnaParaEscribir(COMPRAS_CON_OBRA, 'un-script-cualquiera', 'saldo'), /no está declarado/)
})

test('EL PORTÓN · un request que cae en una columna del dueño aborta; la letra vieja después de insertar, también', () => {
  const celda = (i) => ({ updateCells: { range: { sheetId: 1, startRowIndex: 3, endRowIndex: 4, startColumnIndex: i, endColumnIndex: i + 1 } } })
  // El saldo escrito donde ESTABA (índice 37) cae, después de insertar, en «¿Comprobante repetido? (OS)».
  assert.throws(() => portonDeRequests(COMPRAS_CON_OBRA, 'compras-saldo-pendiente', [celda(37)]), /AL/)
  // Índice 36 después de insertar es «¿Proveedor comercial? (OS)»: del dueño, y lo dice.
  assert.throws(() => portonDeRequests(COMPRAS_CON_OBRA, 'compras-saldo-pendiente', [celda(36)]), /del dueño/)
  assert.doesNotThrow(() => portonDeRequests(COMPRAS_CON_OBRA, 'compras-saldo-pendiente', [celda(38)]))
  // El generador que ancla «Fecha de caja» sí puede escribirla — y sólo ésa y el rubro.
  assert.doesNotThrow(() => portonDeRequests(COMPRAS_CON_OBRA, 'rubro-caja-sheet', [celda(29), celda(30)]))
  assert.throws(() => portonDeRequests(COMPRAS_CON_OBRA, 'rubro-caja-sheet', [celda(31)]), /del dueño/)
})
