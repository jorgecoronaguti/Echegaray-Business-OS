// El cuadro por cliente, armado con el encabezado de hoy y con «Obra» insertada en H: el cuadro se
// ubica por SU encabezado y sus fórmulas leen las columnas de Cobranzas por rótulo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ENCABEZADO_CUADRO, columnasDeDatosBajoElCuadro, formulaDias, grilla, ubicarCuadro } from './cobranzas-por-cliente.mjs'
import { COLUMNAS_CUADRO } from '../lib/cobranzas-por-cliente.mjs'
import { columnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'

const COB = columnasCobranzas(COBRANZAS_1409, COLUMNAS_CUADRO)
const COB_OBRA = columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_CUADRO)
/** La fila 64 con el cuadro empezando en `c0` y un dato de la pestaña a la izquierda. */
const filaCab = (c0) => ['47', '', '', '', '', '', 'Cliente', ...Array(c0 - 7).fill(''), ...ENCABEZADO_CUADRO]

test('el cuadro se ubica por su encabezado: AC hoy, AD cuando Google lo corre al insertar «Obra»', () => {
  assert.equal(ubicarCuadro(filaCab(28)), 28)
  assert.equal(ubicarCuadro(filaCab(29)), 29)
  assert.throws(() => ubicarCuadro(['Cliente', 'Otra cosa']), /no está en la fila 64/)
  assert.throws(() => ubicarCuadro([...filaCab(28), ...ENCABEZADO_CUADRO]), /aparece 2 veces/)
})

test('la grilla de hoy es la de siempre, y la de después lee N/P y escribe en AD', () => {
  const antes = grilla(COB, 28)
  assert.equal(antes[3][0], '=IFERROR(SORT(UNIQUE(FILTER($G$5:$G$400;$G$5:$G$400<>"")));"")')
  assert.equal(antes[3][3], '=IF($AC65="";"";SUMIFS($M$5:$M$400;$G$5:$G$400;$AC65)-SUMIFS($M$5:$M$400;$G$5:$G$400;$AC65;$AA$5:$AA$400;"USD")+SUMIFS($M$5:$M$400;$G$5:$G$400;$AC65;$AA$5:$AA$400;"USD")*TIPO_CAMBIO_USD)')
  assert.equal(antes[30][3], '=SUM($M$5:$M$400)-SUMIF($AA$5:$AA$400;"USD";$M$5:$M$400)+SUMIF($AA$5:$AA$400;"USD";$M$5:$M$400)*TIPO_CAMBIO_USD-AF90', 'el control contra la pestaña, en pesos')

  const despues = grilla(COB_OBRA, 29)
  assert.equal(despues[3][3], '=IF($AD65="";"";SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65)-SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$AB$5:$AB$400;"USD")+SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$AB$5:$AB$400;"USD")*TIPO_CAMBIO_USD)')
  assert.equal(despues[3][4], '=IF($AD65="";"";SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$P$5:$P$400;"Cobrado")-SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$P$5:$P$400;"Cobrado";$AB$5:$AB$400;"USD")+SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$P$5:$P$400;"Cobrado";$AB$5:$AB$400;"USD")*TIPO_CAMBIO_USD)')
  assert.equal(despues[30][3], '=SUM($N$5:$N$400)-SUMIF($AB$5:$AB$400;"USD";$N$5:$N$400)+SUMIF($AB$5:$AB$400;"USD";$N$5:$N$400)*TIPO_CAMBIO_USD-AG90')
  assert.equal(COBRANZAS_CON_OBRA[13], 'TOTAL a cobrar (neto de retenciones)')
})

test('los días de cobro usan «Fecha cobro» y «Fecha de Venta» por rótulo (Q/C hoy, R/C después)', () => {
  assert.match(formulaDias(null, COB), /ISNUMBER\(\$Q\$5:\$Q\$400\)\*ISNUMBER\(\$C\$5:\$C\$400\)/)
  const d = formulaDias('$AD65', COB_OBRA)
  assert.match(d, /\(\$R\$5:\$R\$400-\$C\$5:\$C\$400\)/)
  assert.match(d, /\(\$P\$5:\$P\$400="Cobrado"\)/)
  assert.equal(COBRANZAS_CON_OBRA[17], 'Fecha cobro')
})

test('sin columnas resueltas o sin la posición del cuadro, no hay grilla', () => {
  assert.throws(() => grilla(undefined, 28), /faltan columnas de Cobranzas/)
  assert.throws(() => grilla(COB), /falta la columna del cuadro/)
})

test('el cuadro no se escribe sobre una columna de datos: AD4 dice «Asignación» (medido el 24/09/2026)', () => {
  // La fila 4 real: …AA Retención 2,5% · AB Moneda · AC vacía · AD Asignación · AE:AK vacías.
  const fila4 = Array(27).fill('x').concat(['Moneda', '', 'Asignación', '', '', '', '', '', '', ''])
  assert.deepEqual(columnasDeDatosBajoElCuadro(fila4, 29), ['AD4 «Asignación»'])
  assert.deepEqual(columnasDeDatosBajoElCuadro(fila4, 30), [], 'desde AE, las ocho columnas están libres')
})
