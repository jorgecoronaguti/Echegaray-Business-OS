import test from 'node:test'
import assert from 'node:assert/strict'
import { controlesMudos, referenciasLocales } from './control-mudo.mjs'

const c = (v) => ({ formula: null, valor: v == null ? null : String(v), numero: typeof v === 'number' ? v : null })
const f = (formula, valor = '') => ({ formula, valor, numero: null })
const nada = () => null

test('referenciasLocales toma las celdas de esta hoja y descarta lo que no lo es', () => {
  assert.deepEqual(referenciasLocales('=IF(B25=0;"";B26/B25)'), ['B25', 'B26'])
  assert.deepEqual(referenciasLocales('=B49-B51'), ['B49', 'B51'])
  // Otra pestaña: su grilla no está a la vista, llamarla vacía sería inventar el hallazgo.
  assert.deepEqual(referenciasLocales('=SUMIFS(Compras!$O$4:$O;Compras!$AC$4:$AC;"Estructura")'), [])
  assert.deepEqual(referenciasLocales("=SUM('Cash Flow Mensual'!B4:B9)"), [])
  // Un rango con parte vacía es normal: no es este defecto.
  assert.deepEqual(referenciasLocales('=SUM(B25:B30)'), [])
  assert.deepEqual(referenciasLocales('=SUM(B:B)'), [])
  // Un nombre definido lo audita auditar-rangos-fosilizados, no esto.
  assert.deepEqual(referenciasLocales('=IFERROR(IF(ISNUMBER(ARCA_SIN_CARGAR_MONTO);ARCA_SIN_CARGAR_MONTO;"—");"—")'), [])
  // Un literal que contiene algo con forma de referencia no es una referencia.
  assert.deepEqual(referenciasLocales('=IF(A1="ver B25";"si";"no")'), ['A1'])
  assert.deepEqual(referenciasLocales('no es una fórmula'), [])
})

test('caza el control de Estructura: ⇒ con la fórmula viva y sus dos insumos vacíos', () => {
  // La forma real, leída del archivo el 06/09: filas 23-27 sin nada, el ⇒ en la 28.
  const filas = []
  filas[21] = [c('3 · RESPALDO FISCAL — contra el libro de IVA de ARCA')]
  for (let i = 22; i <= 26; i++) filas[i] = [nada()]
  filas[27] = [c('⇒ Cobertura fiscal de esta pestaña'), f('=IF(B25=0;"";B26/B25)', '')]

  const [h, ...resto] = controlesMudos({ filas })
  assert.equal(resto.length, 0, 'un solo hallazgo')
  assert.equal(h.fila, 28)
  assert.equal(h.col, 'B')
  assert.deepEqual(h.vacias.sort(), ['B25', 'B26'])
})

// ═══ LAS PRUEBAS DE QUE NO GRITA DONDE NO DEBE ═══
// Un control con falsos positivos se deja de mirar, y entonces deja de existir.

test('el mismo bloque CON sus insumos no es hallazgo — es Materiales, que publica 60,8%', () => {
  const filas = []
  filas[48] = [c('Lo que esta pestaña lista, dentro de la ventana'), f('=SUMIFS(Compras!$O$4:$O;…)', '$286.130.294')]
  filas[49] = [c('· con su comprobante en el libro de ARCA'), f('=B49-B51', '$174.083.661')]
  filas[50] = [c('· sin comprobante en el libro'), f("=SUMIFS('_CRUCE_ARCA'!$G$4:$G;…)", '$112.046.633')]
  filas[51] = [c('⇒ Cobertura fiscal de esta pestaña'), f('=IF(B49=0;"";B50/B49)', '60,8%')]
  assert.deepEqual(controlesMudos({ filas }), [])
})

test('un control que da $0 legítimamente NO es mudo: sus insumos existen', () => {
  const filas = [
    [c('⇒ Control contra Compras'), f('=SUMIF(Compras!$AC$4:$AC;"x";Compras!$O$4:$O)', '$16.536.820')],
    [c('⇒ Diferencia — tiene que ser $0'), f('=$B$1-$B$3', '✓ $0')],
    [c('⇒ Total de cuotas del año'), f('=SUM(B10:B12)', '$16.536.820')],
  ]
  filas[2] = [c('Total tabla'), c(16536820)]
  assert.deepEqual(controlesMudos({ filas }), [], 'la diferencia lee B1 y B3, las dos vivas')
})

test('una fila que no es control queda afuera aunque su fórmula apunte a vacío', () => {
  const filas = [[c('Un renglón cualquiera'), f('=B99', '')]]
  assert.deepEqual(controlesMudos({ filas }), [], 'sólo se juzgan las filas ⇒')
})

test('si UNA sola referencia está viva, el control todavía puede moverse y no se marca', () => {
  const filas = [
    [c('⇒ Diferencia'), f('=B2-B99', '')],
    [c('vivo'), c(100)],
  ]
  assert.deepEqual(controlesMudos({ filas }), [], 'B2 existe: la fórmula puede cambiar de valor')
})

test('una celda cuya fórmula devuelve "" IGUAL existe: no vacía a quien la cita', () => {
  const filas = [
    [c('⇒ Diferencia'), f('=B2', '')],
    [c('calculada que hoy da vacío'), f('=IF(1=1;"";5)', '')],
  ]
  assert.deepEqual(controlesMudos({ filas }), [], 'B2 tiene fórmula: el insumo existe aunque hoy no muestre nada')
})
