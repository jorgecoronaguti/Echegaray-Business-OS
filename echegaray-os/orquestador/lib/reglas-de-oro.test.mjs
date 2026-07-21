import test from 'node:test'
import assert from 'node:assert/strict'
import { numerosPegados, derivadasHuerfanas, usaInflacion, indicesCompletos, criteriosHuerfanos, esOperador, CALCULADAS, CON_ORIGEN, TOPE_PEGADOS } from './reglas-de-oro.mjs'

const celda = (o) => ({ formula: null, numero: null, derivada: false, formato: null, ...o })

// Sin esta exclusión, las cinco pestañas del cash flow aparecían con 12 "números pegados" que eran
// enero, febrero, marzo… Un control que avisa siempre es un control que nadie mira.
test('el eje de meses no es un número pegado; un importe sí', () => {
  const filas = [
    [celda({ numero: 46023, formato: 'DATE' }), celda({ numero: 46054, formato: 'DATE' })],
    [celda({ formula: '=SUM(B1:C1)' }), celda({ numero: 9666906.66, formato: 'CURRENCY' })],
    [celda({ numero: 12345, derivada: true })],
  ]
  const s = numerosPegados(filas)
  assert.equal(s.length, 1)
  assert.deepEqual(s[0], { fila: 2, col: 2, valor: 9666906.66 })
})

// Así apareció Recurrentes: el cuadro leía de ella su proyección y no la rehacía ningún script.
test('una pestaña derivada sin script que la rehaga es un hallazgo', () => {
  const hojas = ['Compras', 'Estructura', 'Recurrentes', 'Cash Flow Mensual']
  assert.deepEqual(derivadasHuerfanas(hojas, ['Estructura', 'Cash Flow Mensual']), ['Recurrentes'])
  assert.deepEqual(derivadasHuerfanas(hojas, ['Estructura', 'Recurrentes', 'Cash Flow Mensual']), [])
  // Compras es de carga: sus números son el hecho primario, no una pestaña huérfana.
  assert.ok(!derivadasHuerfanas(hojas, []).includes('Compras'))
})

// EL CONTROL QUE ESTABA MAL: TODAY()+EOMONTH es cómo el cuadro decide si un mes ya cerró, o sea
// cómo muestra el REAL. El real no se ajusta por inflación: ya pasó. Daba 108 de 108 mal.
test('mirar si el mes cerró no es proyectar', () => {
  const real = '=IF(EOMONTH(B$3;0)<=EOMONTH(TODAY();0);SUMIFS(Compras!$O$4:$O;Compras!$AC$4:$AC;"Estructura");0)'
  assert.equal(usaInflacion([real]).proyecta, false)
  const proyecta = `${real.slice(0, -3)}/3*IFERROR(INDEX('Parámetros'!$C$74:$C$90;1);1))`
  const u = usaInflacion([proyecta])
  assert.ok(u.proyecta && u.ajusta === 1)
  // Proyectar sin tocar la tabla de índices es peso constante: eso sí es un hallazgo.
  const sinAjustar = '=IF(EOMONTH(B$3;0)>EOMONTH(TODAY();0);PROMEDIO(B5:D5);0)'
  const v = usaInflacion([sinAjustar])
  assert.ok(v.proyecta && v.ajusta === 0)
})

test('un índice sin fuente es un número inventado con buena letra', () => {
  const filas = [
    ['1/7/2026', 0.018, 1, 'REM BCRA'],
    ['1/8/2026', 0.019, 1.019, ''],
  ]
  const i = indicesCompletos(filas, new Date(2026, 11, 1))
  assert.equal(i.meses, 2)
  assert.equal(i.sinFuente, 1)
  assert.equal(i.alcanza, false)
  assert.equal(indicesCompletos([], new Date()).alcanza, false)
})

// Estar en las dos listas era prohibido porque el permiso ganaba siempre y la regla dejaba de
// existir para esa pestaña. Con TOPE_PEGADOS deja de ser un permiso abierto: se admite el caso
// híbrido —Proveedores es toda fórmula MENOS cuatro celdas de conciliación— siempre que el tope
// esté declarado. Sin tope, la combinación vuelve a ser lo que era y no se acepta.
test('una pestaña calculada con origen declarado tiene que tener TOPE', () => {
  const sinTope = CALCULADAS.filter((t) => CON_ORIGEN[t] && TOPE_PEGADOS[t] == null)
  assert.deepEqual(sinTope, [], 'una pestaña calculada no puede tener permiso ABIERTO para números pegados')
})

test('el tope de una pestaña calculada es chico: es una excepción, no una puerta', () => {
  for (const t of CALCULADAS) {
    if (!CON_ORIGEN[t]) continue
    assert.ok(TOPE_PEGADOS[t] <= 10, `${t} tiene tope ${TOPE_PEGADOS[t]}: demasiado para una pestaña que debe ser toda fórmula`)
  }
})

test('no marca un OPERADOR de SUMIFS como rubro desconocido', () => {
  // Falso positivo real: el cuadro cuenta las filas clasificadas con
  // SUMIFS(...;Compras!$AC$4:$AC;"<>";...) y el auditor gritaba que "<>" era un rubro que la
  // definición única no conoce. Un control que grita por algo correcto se deja de mirar.
  const f = ['=SUMIFS(Compras!$O$4:$O;Compras!$AC$4:$AC;"<>";Compras!$AD$4:$AD;"")']
  assert.deepEqual(criteriosHuerfanos(f, ['Materiales Civil'], 'AC'), [])
})

test('sigue marcando un rubro que de verdad no existe', () => {
  const f = ['=SUMIFS(Compras!$O$4:$O;Compras!$AC$4:$AC;"Rubro Inventado")']
  assert.deepEqual(criteriosHuerfanos(f, ['Materiales Civil'], 'AC'), ['Rubro Inventado'])
})

test('esOperador reconoce las formas que usa el archivo', () => {
  for (const o of ['<>', '', '>=100', '<0', '=x', '*']) assert.equal(esOperador(o), true, `${JSON.stringify(o)}`)
  for (const r of ['Materiales Civil', 'Estructura', 'Nómina · SAC']) assert.equal(esOperador(r), false, r)
})
