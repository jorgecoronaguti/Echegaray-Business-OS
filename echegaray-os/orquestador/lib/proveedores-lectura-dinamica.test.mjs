import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { sobranteDeColchon, ultimaConDato } from './proveedores-colchon.mjs'
import {
  fusionarLecturas, leerCuerpoDeDinamica, leerParaDecidirBorrado, RENDER_EMITIDO, RENDER_ESCRITO,
} from './proveedores-lectura-dinamica.mjs'

/**
 * UN SHEET DE MENTIRA QUE MIENTE COMO EL DE VERDAD.
 *
 * Lo único que imita —y es todo lo que hace falta— es el comportamiento medido el 05/08 sobre
 * `Proveedores!A16:D26`: las celdas que emite una dinámica NO tienen `userEnteredValue`, así que
 * `render: 'FORMULA'` las devuelve vacías y sólo `FORMATTED_VALUE` las ve.
 *
 * Layout: fila 1 el rótulo (texto real), 2 a 4 el cuerpo de la dinámica, 5 una fórmula del dueño que
 * devuelve "", 6 y 7 aire de verdad, 8 el título de la sección de abajo.
 */
function sheetConDinamica() {
  const emitido = [
    ['Proveedor', 'CUIT (OS)', 'Comprado 2026', 'Comprobantes'],
    ['Alumetal', '30-1', '5.174.285', '2'],
    ['Corralon Progreso', '30-2', '4.100.000', '3'],
    ['DUPEC', '30-3', '469.565', '1'],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['3 · NOTAS DE CRÉDITO', '', '', ''],
  ]
  const escrito = [
    ['Proveedor', 'CUIT (OS)', 'Comprado 2026', 'Comprobantes'],
    ['', '', '', ''], ['', '', '', ''], ['', '', '', ''],
    ['', '', '', '=IF($A5="";"";"algo")'],
    ['', '', '', ''],
    ['', '', '', ''],
    ['3 · NOTAS DE CRÉDITO', '', '', ''],
  ]
  const llamadas = []
  return {
    llamadas,
    readSheetValues(_id, rango, { render } = {}) {
      llamadas.push({ rango, render })
      return Promise.resolve(render === RENDER_ESCRITO ? escrito : emitido)
    },
  }
}

const leer = (google, rango = 'Proveedores!A36:D83') => ({ google, id: 'X', rango })

describe('leerCuerpoDeDinamica', () => {
  it('EL DEFECTO: en FORMULA la dinámica se lee vacía y la guarda la da por no emitida', async () => {
    const google = sheetConDinamica()
    // Lo que hacía el generador hasta el 05/08: medir el alto emitido sobre la lectura FORMULA.
    const enFormula = await google.readSheetValues('X', 'r', { render: RENDER_ESCRITO })
    assert.equal(ultimaConDato(enFormula, { desde: 2, hasta: 5 }), 0,
      'así se veía: tres proveedores en la pantalla y cero filas para la guarda')

    const cuerpo = await leerCuerpoDeDinamica(leer(google))
    assert.equal(ultimaConDato(cuerpo, { desde: 2, hasta: 5 }), 4,
      'la última fila emitida es la 4 — la guarda tiene que verla')
  })

  it('pide el render que ve la salida de la dinámica, no el que ve lo escrito', async () => {
    const google = sheetConDinamica()
    await leerCuerpoDeDinamica(leer(google))
    assert.deepEqual(google.llamadas, [{ rango: 'Proveedores!A36:D83', render: RENDER_EMITIDO }])
  })
})

describe('fusionarLecturas', () => {
  it('gana lo escrito cuando hay algo escrito, y lo emitido rellena el resto', () => {
    const f = fusionarLecturas([['', '=A1'], ['x']], [['pivot', 'calculado'], ['', 'otro']])
    assert.deepEqual(f, [['pivot', '=A1'], ['x', 'otro']])
  })

  it('una fórmula que devuelve "" sigue contando como celda con algo', () => {
    const f = fusionarLecturas([['=IF(1;"";"")']], [['']])
    assert.equal(f[0][0], '=IF(1;"";"")')
  })

  it('tolera lecturas de distinto alto y ancho — la API recorta las filas vacías del final', () => {
    assert.deepEqual(fusionarLecturas([['a']], [[], ['b', 'c']]), [['a'], ['b', 'c']])
    assert.deepEqual(fusionarLecturas([], []), [])
  })
})

describe('leerParaDecidirBorrado', () => {
  /**
   * LA SECCIÓN 2 COMO QUEDÓ EL 05/08: el rótulo, el cuerpo de la dinámica y nada más hasta el título
   * de abajo (el pie no se escribió porque la guarda abortó). Debajo del pivot no hay ninguna fórmula
   * que frene el conteo, que es la condición en la que el borrado deja de ser hipotético.
   */
  function seccionSinPie() {
    const cuerpo = (n) => [`Proveedor ${n}`, `30-${n}`, `${n}.000`, '1']
    const emitido = [['Proveedor', 'CUIT (OS)', 'Comprado 2026', 'Comprobantes'],
      cuerpo(1), cuerpo(2), cuerpo(3), cuerpo(4)]
    while (emitido.length < 11) emitido.push(['', '', '', ''])
    emitido.push(['3 · NOTAS DE CRÉDITO', '', '', ''])
    const escrito = emitido.map((f, i) => (i === 0 || i === emitido.length - 1 ? f : ['', '', '', '']))
    return {
      readSheetValues: (_id, _r, { render } = {}) => Promise.resolve(render === RENDER_ESCRITO ? escrito : emitido),
    }
  }

  it('EL DEFECTO: con una sola lectura FORMULA, el cuerpo de la dinámica es aire y se borra', async () => {
    const google = seccionSinPie()
    const soloFormula = await google.readSheetValues('X', 'r', { render: RENDER_ESCRITO })
    // El bloque va del rótulo (fila 1) al título de abajo (fila 12), con el colchón de 3 filas.
    const malo = sobranteDeColchon({ filas: soloFormula, desde: 1, hasta: 12, colchon: 3 })
    assert.equal(malo.ultima, 1, 'para FORMULA el bloque termina en el rótulo: los cuatro no existen')
    assert.deepEqual([malo.desdeBorrar, malo.hastaBorrar], [5, 12],
      'proponía borrar de la 5 a la 11 — filas del cuerpo entre ellas')

    const fusionada = await leerParaDecidirBorrado(leer(google))
    const bien = sobranteDeColchon({ filas: fusionada, desde: 1, hasta: 12, colchon: 3 })
    assert.equal(bien.ultima, 5, 'la última con algo es el cuarto proveedor')
    assert.deepEqual([bien.desdeBorrar, bien.hastaBorrar], [9, 12], 'sólo se devuelve el aire de verdad')
  })

  it('lee las dos veces el MISMO rango, con los dos renders', async () => {
    const google = sheetConDinamica()
    await leerParaDecidirBorrado(leer(google, 'Proveedores!A1:AZ100'))
    assert.deepEqual(google.llamadas.map((l) => l.render), [RENDER_ESCRITO, RENDER_EMITIDO])
    assert.deepEqual([...new Set(google.llamadas.map((l) => l.rango))], ['Proveedores!A1:AZ100'])
  })

  it('una fila que sólo tiene salida de dinámica NO cuenta como vacía', async () => {
    const google = sheetConDinamica()
    const fusionada = await leerParaDecidirBorrado(leer(google))
    assert.equal(ultimaConDato(fusionada, { desde: 2, hasta: 5 }), 4)
  })
})
