// LAS CINCO TARJETAS, VERIFICADAS EN FRÍO — SON LAS CELDAS MÁS MIRADAS DEL ARCHIVO.
//
// POR QUÉ EXISTE (05/08/2026). El dueño va a mirar estos cinco números y decidir. Una tarjeta que
// suma mal no da error: da un número plausible, y un número plausible y falso en la primera pantalla
// es el peor defecto posible de esta pestaña.
//
// LO QUE SE VERIFICA ACÁ Y NO EN LA GRILLA: que cada fórmula sea EXACTAMENTE la que produce
// `terminoLibro` con los filtros correctos. Se compara contra la función, no contra una expresión
// escrita a mano en el test: un literal copiado sería una segunda fuente de verdad que se desactualiza
// el día que el libro cambie una columna, y el test seguiría en verde midiendo el contrato viejo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { tarjetas, NO_REAL, HORIZONTE } from './caja-tarjetas.mjs'
import { terminoLibro } from './libro-sumas.mjs'

const REF = {
  total: '$C$13', fecha: '$D$13', piso: '$I$13', peorCaso: '$H$13', fechaPiso: '$G$13',
  tramos: '$F$7:$F$12', saldos: '$I$7:$I$12',
}
const T = () => tarjetas(REF)
const de = (clave) => T().find((t) => t.clave === clave)

test('son CINCO, en el orden de la pregunta que se hace un tesorero', () => {
  // Leído de izquierda a derecha cuenta una historia: cuánto tengo, cuánto está comprometido, con
  // cuánto termino el mes, cuál es el peor momento y cuándo es. En cualquier otro orden son cinco
  // números sueltos que hay que leer de a uno, que es lo que este rediseño vino a eliminar.
  assert.deepEqual(T().map((t) => t.clave), ['disponible', 'comprometida', 'proyectada', 'riesgo', 'cuello'])
})

test('las cinco tienen rótulo, cifra y contexto: la forma de la tarjeta no se negocia', () => {
  for (const t of T()) {
    assert.ok(t.rotulo && t.rotulo === t.rotulo.toUpperCase(), `"${t.clave}" sin rótulo en versales`)
    assert.match(t.valor, /^=/, `la cifra de "${t.clave}" tiene que ser una fórmula`)
    assert.match(t.contexto, /^=/, `"${t.clave}" sin contexto es un número mudo: no dice a qué fecha vale`)
  }
})

test('CAJA COMPROMETIDA sale del libro en MAGNITUD, no en neto', () => {
  // En neto la tarjeta publicaría un negativo, que se lee como si la deuda fuera a favor. Lo
  // comprometido contesta "cuánto debo": es un número positivo.
  assert.equal(de('comprometida').valor,
    `=${terminoLibro({ signo: -1, estados: ['COMPROMETIDO'], medida: 'magnitud' })}`)
})

test('CAJA PROYECTADA es la caja de hoy MÁS la ventana del libro, y excluye lo REAL', () => {
  // Lo REAL ya está adentro del saldo de las cuentas (por el extracto o por la línea de movimientos
  // posteriores al corte). Sumarlo otra vez contaría dos veces cada cobro del mes.
  const t = de('proyectada')
  assert.equal(t.valor, `=${REF.total}+${terminoLibro({ desde: 'TODAY()', hasta: `TODAY()+${HORIZONTE}`, estados: NO_REAL })}`)
  assert.ok(!t.valor.includes('="REAL"'))
  assert.equal(NO_REAL.includes('REAL'), false, 'REAL no puede estar en la lista de estados proyectables')
})

test('RIESGO DE LIQUIDEZ es el piso, y su contexto trae la banda de incertidumbre', () => {
  // El piso solo se lee como CERTEZA y con él se decide un plazo fijo. Hay dos grupos de cheques cuya
  // cobertura no se sabe: sin la banda esa ignorancia se lee como dato.
  const t = de('riesgo')
  assert.equal(t.valor, `=${REF.piso}`)
  assert.match(t.contexto, /puede bajar hasta/)
  // SI LA BANDA ES DE ANCHO CERO, LA FRASE NO APARECE: una banda que no existe es ruido, y un aviso
  // que suena siempre deja de avisar.
  assert.ok(t.contexto.startsWith(`=IF(${REF.peorCaso}>=${REF.piso};"el punto más bajo`),
    `la banda tiene que compararse contra el piso: ${t.contexto.slice(0, 60)}`)
})

test('EL CUELLO DE BOTELLA SALE DEL MISMO MATCH QUE EL PISO', () => {
  // Con un MATCH propio podría señalar otro tramo el día que dos empaten, y la portada diría "el piso
  // es $X" arriba de "cae en otro tramo". Dos afirmaciones que se contradicen destruyen las dos.
  const t = de('cuello')
  assert.equal(t.valor, `=IFERROR(INDEX(${REF.tramos};MATCH(MIN(${REF.saldos});${REF.saldos};0));"—")`)
  assert.equal(t.especie, 'texto', '"Esta semana" es accionable; una fecha obliga a mirar el almanaque')
})

test('NINGUNA fórmula usa la coma como separador de argumentos (es-AR)', () => {
  for (const t of T()) {
    for (const f of [t.valor, t.contexto]) {
      const sospechosas = f.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/, `"${t.clave}" va a dar #ERROR! en es-AR:\n  ${f}`)
    }
  }
})

test('FALLA CERRADO: sin una referencia, rompe antes de escribir una celda en error', () => {
  // Una referencia vacía produciría `=` o `=MIN()`: una celda en error en la primera pantalla de la
  // pestaña más mirada del archivo. Es barato romper acá y carísimo descubrirlo allá.
  assert.throws(() => tarjetas({ ...REF, piso: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas(), /faltan las referencias/)
})
