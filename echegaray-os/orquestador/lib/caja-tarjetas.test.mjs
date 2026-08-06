// LAS CUATRO TARJETAS, VERIFICADAS EN FRÍO — SON LAS CELDAS MÁS MIRADAS DEL ARCHIVO.
//
// POR QUÉ EXISTE (05/08/2026). El dueño va a mirar estos números y decidir. Una tarjeta que suma mal
// no da error: da un número plausible, y un número plausible y falso en la primera pantalla es el
// peor defecto posible de esta pestaña.
//
// EL CONTRATO CAMBIÓ EL 06/08: eran cinco tarjetas, el dueño borró RIESGO y CUELLO de la pestaña, y
// ordenó el reorden JPM — disponible OPERATIVO (sin Balanz), INVERTIDO discriminado, comprometida,
// proyectada. Un test que siguiera midiendo las cinco obligaría a mantener lo que él borró.
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
  total: '$C$15', fecha: '$D$15', invArs: '$C$11', invUsd: '$C$12', invFecha: '$D$11',
  piso: '$H$15', pisoSimple: '$I$15', pisoFecha: '$G$15',
}
const T = () => tarjetas(REF)
const de = (clave) => T().find((t) => t.clave === clave)

test('son CINCO, en el orden que pidió el dueño: disponible → comprometida → LIBRE → invertido → proyectada', () => {
  // 06/08: "invertido y caja proyectada al final", y en el medio la respuesta a su pregunta — ¿puedo
  // usar la caja disponible entera? NO: LIBRE = disponible − comprometida es lo que se usa sin romper
  // compromisos (el net cash position de un panel de tesorería).
  assert.deepEqual(T().map((t) => t.clave), ['disponible', 'comprometida', 'libre', 'invertido', 'proyectada'])
})

test('las cuatro tienen rótulo, cifra y contexto: la forma de la tarjeta no se negocia', () => {
  for (const t of T()) {
    assert.ok(t.rotulo && t.rotulo === t.rotulo.toUpperCase(), `"${t.clave}" sin rótulo en versales`)
    assert.match(t.valor, /^=/, `la cifra de "${t.clave}" tiene que ser una fórmula`)
    assert.match(t.contexto, /^=/, `"${t.clave}" sin contexto es un número mudo: no dice a qué fecha vale`)
    assert.equal(t.especie, 'plata', `"${t.clave}": las cuatro son plata; la única de texto era el cuello, que el dueño borró`)
  }
})

test('CAJA DISPONIBLE es EL TOTAL del panel de cuentas — que desde el 06/08 es el operativo', () => {
  // No se recalcula: es la celda del total, que ya excluye las filas ‖ (Balanz y valores en cartera).
  // El contexto dice de qué está hecho — "bancos y efectivo", no "todo lo que la empresa tiene".
  const t = de('disponible')
  assert.equal(t.valor, `=${REF.total}`)
  assert.match(t.contexto, /bancos y efectivo/)
})

test('INVERTIDO cita las filas Balanz de la grilla — una sola fuente, nunca una segunda posición', () => {
  // Si la tarjeta trajera su propio número (de BALANZ en banco-santander.mjs), el día que el extracto
  // de Balanz reemplace el aporte la portada diría una cosa y el panel de cuentas otra. La referencia
  // a las celdas C hace estructuralmente imposible esa discrepancia.
  const t = de('invertido')
  assert.equal(t.valor, `=N(${REF.invArs})+N(${REF.invUsd})`)
  // El N() no es decoración: la celda de una fila sin dato dice "" y sin él la suma da #VALUE!.
  assert.match(t.contexto, /Balanz/, 'el contexto declara DÓNDE está lo invertido')
  assert.match(t.contexto, /liquidez T\+1/, 'y su naturaleza: rescatarlo tarda un día hábil, no es caja de hoy')
  assert.ok(t.contexto.includes(REF.invFecha), 'la fecha de la posición sale de la fila Balanz, no del reloj')
})

test('CAJA COMPROMETIDA es la ventana de 7 DÍAS, con el mes completo en el contexto (5ª directiva)', () => {
  // La ventana a fin de mes dio $46,8M contra $45,9M disponibles y el dueño la rechazó: "estan
  // tomandose mal las temporalidades" — lo que vence después de las cobranzas del 14/15/28 se paga
  // con ESA plata, no con la de hoy. El titular es lo que la caja de HOY sí tiene que cubrir (7
  // días, vencido impago adentro — sin `desde`), y el mes entero queda a la vista en el contexto.
  const c = de('comprometida')
  assert.equal(c.valor,
    `=${terminoLibro({ signo: -1, estados: NO_REAL, hasta: 'TODAY()+7', medida: 'magnitud' })}`)
  assert.match(c.rotulo, /7 DÍAS/, 'el rótulo declara su ventana — sin eso el número se lee como el mes')
  assert.match(c.contexto, /todo el mes/, 'el mes completo no se esconde: baja al contexto')
  assert.ok(c.contexto.includes('EOMONTH(TODAY();0)+1'), 'el contexto mide el mes con la misma suma del libro')
  assert.ok(!c.valor.includes('"REAL"'), 'lo REAL ya salió de la cuenta: no es obligación')
})

test('CAJA PROYECTADA es la caja OPERATIVA de hoy MÁS la ventana del libro, y excluye lo REAL', () => {
  // Lo REAL ya está adentro del saldo de las cuentas (por el extracto o por la línea de movimientos
  // posteriores al corte). Sumarlo otra vez contaría dos veces cada cobro del mes. Parte del total
  // operativo: lo invertido no cubre un vencimiento hasta que se rescata.
  const t = de('proyectada')
  assert.equal(t.valor, `=${REF.total}+${terminoLibro({ desde: 'TODAY()', hasta: `TODAY()+${HORIZONTE}`, estados: NO_REAL })}`)
  assert.ok(!t.valor.includes('="REAL"'))
  assert.ok(!t.valor.includes(REF.invArs) && !t.valor.includes(REF.invUsd),
    'la proyección no suma lo invertido: una comitente no paga un cheque')
  assert.equal(NO_REAL.includes('REAL'), false, 'REAL no puede estar en la lista de estados proyectables')
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
  // Una referencia vacía produciría `=` o `=N()+N()`: una celda en error en la primera pantalla de la
  // pestaña más mirada del archivo. Es barato romper acá y carísimo descubrirlo allá. La grilla pasa
  // '' cuando la fila Balanz desaparece de CUENTAS: ese caso tiene que frenar acá.
  assert.throws(() => tarjetas({ ...REF, invArs: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, total: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas(), /faltan las referencias/)
})

test('LIBRE es el PISO de la escalera — 4ª y definitiva (06/08): ninguna resta nueva, una referencia', () => {
  // ═══ POR QUÉ NINGUNA DE LAS TRES RESTAS ANTERIORES PODÍA ESTAR BIEN ═══
  //
  // v1 bancos−comprometido ($897k, "muy poco") · v2 +Balanz ($43,2M, "una cosa son los bancos,
  // otra balanz") · v3 = v1 (−$1,8M, "¿deficitarios? pésimo"). Las tres comparaban la caja de HOY
  // contra los pagos de TODO el mes ignorando CUÁNDO entran las cobranzas. La pregunta real es
  // cuánto se puede usar hoy sin que ningún día del recorrido quede al descubierto, y esa respuesta
  // es el piso de la escalera — que la pestaña ya calcula. La tarjeta lo referencia con MIN de las
  // dos puntas de la fila de cierre, el mismo criterio con el que esa fila elige su propio rótulo.
  const l = de('libre')
  // 5ª directiva: el MÍNIMO SIMPLE ($I), no el peor caso ($H) — el peor caso restaba $22,6M de
  // cheques de cobertura incierta y tapaba el recorrido medido; ese escenario vive en la escalera.
  assert.equal(l.valor, `=N(${REF.pisoSimple})`,
    'el mínimo medido del recorrido, de la fila de cierre — no una cuarta aritmética')
  assert.match(l.contexto, /cobrando lo proyectado/,
    'sin la cláusula, el piso se lee como plata garantizada — y depende de las cobranzas')
  assert.ok(l.contexto.includes(REF.pisoFecha), 'la fecha del punto más bajo sale de la fila de cierre')
})

test('FALLA CERRADO también sin las referencias del piso', () => {
  assert.throws(() => tarjetas({ ...REF, piso: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, pisoFecha: '' }), /faltan las referencias/)
})
