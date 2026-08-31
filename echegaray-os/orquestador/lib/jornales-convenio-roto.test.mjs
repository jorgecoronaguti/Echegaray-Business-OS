import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatasDeConvenioRoto, esError } from './jornales-residuo.mjs'

/** El bloque 4.1 tal como está publicado hoy: encabezado, cuatro categorías y su total. */
const ENC = ['Categoría', 'Personas', 'Σ $/hora HOY', 'Σ aumento', 'Convenio (tuya)', 'Básico convenio']
const armar = (filasE, filasValorE) => ({
  formulas: [['otra cosa'], ENC, ...filasE.map((e, i) => [`CAT${i}`, 1, 2, 3, e, 5]), ['⇒ Plantel vigente', 17, 0, 0, '', '']],
  valores: [['otra cosa'], ENC, ...filasValorE.map((v, i) => [`CAT${i}`, 1, 2, 3, v, 5]), ['⇒ Plantel vigente', 17, 0, 0, '', '']],
})

test('propone vaciar la fórmula rota de la columna del dueño', () => {
  const { formulas, valores } = armar(
    ['Oficial', '=IFERROR($E99*(1+$D100);"")'],
    ['Oficial', '#REF!'])
  const c = candidatasDeConvenioRoto(formulas, valores)
  assert.equal(c.length, 1)
  assert.equal(c[0].fila, 4, 'la fila se cuenta en base 1, como la escribe la API')
  assert.equal(c[0].col, 4, 'la columna se ubica por su rótulo, no por la letra E')
  assert.match(c[0].valor, /#REF!/)
})

test('NO toca lo que el dueño escribió: su columna es de texto', () => {
  const { formulas, valores } = armar(
    ['Oficial', 'Medio Oficial', 'Ayudante'],
    ['Oficial', 'Medio Oficial', 'Ayudante'])
  assert.deepEqual(candidatasDeConvenioRoto(formulas, valores), [])
})

test('una fórmula que ANDA se conserva: rota es la condición, no ser fórmula', () => {
  const { formulas, valores } = armar(['=A1', 'Oficial'], ['Oficial Especializado', 'Oficial'])
  assert.deepEqual(candidatasDeConvenioRoto(formulas, valores), [])
})

test('un texto en error tampoco se toca: hacen falta las DOS condiciones', () => {
  // Si el dueño pegó el texto «#REF!» a mano, no es una fórmula y no es del generador.
  const { formulas, valores } = armar(['#REF!'], ['#REF!'])
  assert.deepEqual(candidatasDeConvenioRoto(formulas, valores), [])
})

test('sin el encabezado no se busca nada: prefiere no hacer a hacer a ciegas', () => {
  assert.deepEqual(candidatasDeConvenioRoto([['Categoría', 'Personas']], [['Categoría', 'Personas']]), [])
  assert.deepEqual(candidatasDeConvenioRoto([], []), [])
})

test('el bloque termina en su fila de total y no invade lo de abajo', () => {
  const formulas = [ENC, ['OF', 1, 2, 3, 'Oficial', 5], ['⇒ Plantel vigente', 17, 0, 0, '=roto', ''], ['OTRO CUADRO', 1, 2, 3, '=tambien', 5]]
  const valores = [ENC, ['OF', 1, 2, 3, 'Oficial', 5], ['⇒ Plantel vigente', 17, 0, 0, '#REF!', ''], ['OTRO CUADRO', 1, 2, 3, '#REF!', 5]]
  const c = candidatasDeConvenioRoto(formulas, valores)
  assert.equal(c.length, 1, 'la fila de total entra; lo que sigue después ya es otro cuadro')
  assert.equal(c[0].fila, 3)
})

test('reconoce los errores que publica Sheets, y sólo ésos', () => {
  for (const e of ['#REF!', '#VALUE!', '#N/A', '#DIV/0!', '#NAME?', '#¿NOMBRE?']) assert.ok(esError(e), e)
  for (const n of ['Oficial', '', '0', '$1.000', '#hashtag']) assert.equal(esError(n), false, n)
})
