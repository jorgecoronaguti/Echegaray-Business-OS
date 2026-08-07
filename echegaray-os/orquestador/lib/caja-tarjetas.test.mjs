// LAS CINCO TARJETAS, VERIFICADAS EN FRÍO — SON LAS CELDAS MÁS MIRADAS DEL ARCHIVO.
//
// EL CONTRATO ES EL IDIOMA ÚNICO (6ª directiva del dueño, 06/08, la definitiva): las cinco hablan
// EL MES, y la última es la consecuencia de las otras — tengo + cobro − pago = termino. La historia
// de las cinco versiones anteriores de "LIBRE" vive en caja-tarjetas.mjs; este test fija que no
// vuelva ninguna: ni una tarjeta con ventana propia, ni un número que no se pueda derivar de los
// otros cuatro a simple vista.
//
// LO QUE SE VERIFICA ACÁ Y NO EN LA GRILLA: que cada fórmula sea EXACTAMENTE la que produce
// `terminoLibro` con los filtros correctos — comparada contra la función, no contra un literal.
import test from 'node:test'
import assert from 'node:assert/strict'
import { tarjetas, NO_REAL, FIN_DE_MES } from './caja-tarjetas.mjs'
import { terminoLibro } from './libro-sumas.mjs'

const REF = {
  total: '$C$15', fecha: '$D$15', invArs: '$C$11', invUsd: '$C$12', invFecha: '$D$11',
  pisoSimple: '$I$15', pisoFecha: '$G$15',
}
const T = () => tarjetas(REF)
const de = (clave) => T().find((t) => t.clave === clave)

test('son CINCO en el orden de la historia: tengo → debo pagar → voy a cobrar → invertido → termino', () => {
  assert.deepEqual(T().map((t) => t.clave), ['disponible', 'comprometida', 'libre', 'invertido', 'cierre'])
})

test('las cinco tienen rótulo, cifra y contexto: la forma de la tarjeta no se negocia', () => {
  for (const t of T()) {
    assert.ok(t.rotulo && t.rotulo === t.rotulo.toUpperCase(), `"${t.clave}" sin rótulo en versales`)
    assert.match(t.valor, /^=/, `la cifra de "${t.clave}" tiene que ser una fórmula`)
    assert.match(t.contexto, /^=/, `"${t.clave}" sin contexto es un número mudo`)
    assert.equal(t.especie, 'plata', `"${t.clave}": las cinco son plata`)
  }
})

test('NINGÚN rótulo ni contexto nombra un mes por su nombre: en septiembre mentiría', () => {
  for (const t of T()) {
    for (const s of [t.rotulo, t.contexto]) {
      assert.doesNotMatch(String(s), /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i,
        `"${t.clave}" quedó clavada a un mes: ${s}`)
    }
  }
})

test('CAJA DISPONIBLE es EL TOTAL del panel de cuentas — banco y caja, sin Balanz', () => {
  const t = de('disponible')
  assert.equal(t.valor, `=${REF.total}`)
  assert.match(t.contexto, /bancos y efectivo/)
})

test('COMPROMETIDA = todo lo que hay que pagar en el mes − lo ya pagado, con la urgencia en contexto', () => {
  // La definición textual del dueño. Lo REAL (pagado) queda afuera porque ya salió del saldo del
  // banco; lo vencido impago entra (sin `desde`). El "próx. 7 días" del contexto conserva la
  // urgencia que antes era el titular.
  const c = de('comprometida')
  assert.equal(c.valor, `=${terminoLibro({ signo: -1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
  assert.match(c.contexto, /7 días:/)
  assert.ok(c.contexto.includes(terminoLibro({ signo: -1, estados: NO_REAL, hasta: 'TODAY()+7', medida: 'magnitud' })))
  assert.ok(!c.valor.includes('"REAL"'), 'lo REAL ya salió de la cuenta: no es obligación')
})

test('EL CONTEXTO DE COMPROMETIDA cuenta la historia entera: total del mes → pagado → falta', () => {
  // "es comprometida y cuando se pagan los compromisos deben salir de ahí" (dueño, 07/08). Salen —
  // pero sin el TOTAL a la vista, $60M pagados junto a $44M comprometidos no cierran ninguna
  // historia. La frase es: de $X del mes pagaste $Y (el titular es la resta, a ojo). Y CORTA: la
  // versión larga se truncaba en la celda, y una frase cortada es peor que ninguna.
  const c = de('comprometida')
  const pagado = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  assert.match(c.contexto, /del mes pagaste/)
  assert.ok(c.contexto.includes(pagado))
  // El TOTAL del mes = lo pagado + lo que falta (el titular C3): derivable a ojo, nunca una 3ª suma.
  assert.ok(c.contexto.includes(`(${pagado}+N($C$3))`), 'el total del mes se arma con el titular, no con otra suma del libro')
})

test('CON FRONTERA, COMPROMETIDA suma en vivo las pendientes que el libro todavía no incorporó', () => {
  // La asimetría que se comía la LIBRE: disponible lee Compras en vivo, la foto del libro no conoce
  // las compras cargadas después de la última regeneración. El término vivo arranca EN LA FILA
  // SIGUIENTE a la frontera, filtra Pendiente y fecha de caja dentro del mes, y suma el SALDO
  // (total − pagado). Una pagada nueva NO entra: ya salió del banco, sumarla sería doble conteo.
  const c = tarjetas({ ...REF, fronteraCompras: 833 }).find((t) => t.clave === 'comprometida')
  assert.match(c.valor, /\+SUMPRODUCT/)
  assert.ok(c.valor.includes('Compras!$X$834:$X$1334'), 'arranca en la fila siguiente a la frontera')
  assert.ok(c.valor.includes('="Pendiente"'), 'sólo pendientes: una pagada nueva ya salió del saldo')
  assert.ok(c.valor.includes(`<${FIN_DE_MES}`), 'sólo lo que cae dentro del mes')
  assert.ok(c.valor.includes('N(Compras!$O$834:$O$1334)-N(Compras!$T$834:$T$1334)'), 'el saldo, no el total')
  assert.ok(!c.valor.includes(','), 'locale es-AR: sin comas como separador de argumentos')
  // Y LA LIBRE LO HEREDA SOLA: sigue siendo la resta de las tarjetas vecinas, por referencia.
  const l = tarjetas({ ...REF, fronteraCompras: 833 }).find((t) => t.clave === 'libre')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
})

test('SIN FRONTERA, la tarjeta queda como era: falla hacia el comportamiento anterior', () => {
  // Una corrida vieja del generador o una lectura caída no pueden inventar un término a medias.
  const c = de('comprometida')
  assert.ok(!c.valor.includes('SUMPRODUCT((Compras'), 'sin frontera no hay término vivo')
})

test('LIBRE es la resta de sus dos vecinas — la definición textual del dueño', () => {
  // "disponible es toda la plata q hay, comprometida es lo q hay q pagar el resto del mes, POR
  // ENDE surge libre disponibilidad". Por referencia a A3 y C3: se verifica con los ojos. Y cuando
  // da negativo, el contexto explica la cobertura (cobranzas del mes) en vez de dejar un paréntesis
  // rojo sin historia.
  const l = de('libre')
  assert.equal(l.rotulo, 'LIBRE DISPONIBILIDAD')
  assert.equal(l.valor, '=N($A$3)-N($C$3)')
  assert.match(l.contexto, /disponible − comprometida del mes/)
  assert.match(l.contexto, /se cubre con lo cobrado en el mes/, 'el caso negativo lleva su explicación')
})

test('INVERTIDO cita las filas Balanz de la grilla — una sola fuente, nunca una segunda posición', () => {
  const t = de('invertido')
  assert.equal(t.valor, `=N(${REF.invArs})+N(${REF.invUsd})`)
  assert.match(t.contexto, /Balanz/)
  assert.match(t.contexto, /liquidez T\+1/)
  assert.ok(t.contexto.includes(REF.invFecha))
})

test('SALDO AL CIERRE es la CONSECUENCIA: disponible − comprometida + cobros del mes', () => {
  const t = de('cierre')
  assert.equal(t.rotulo, 'SALDO AL CIERRE')
  assert.equal(t.valor, `=N($A$3)-N($C$3)+${terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`,
    'disponible y comprometida por referencia; los cobros con la suma única del libro')
  assert.match(t.contexto, /la libre al /, 'el cierre declara que ES la libre de fin de mes')
  assert.match(t.contexto, /cobrando lo proyectado/, 'sin la cláusula, se leería como plata garantizada')
  assert.ok(!t.valor.includes(REF.invArs) && !t.valor.includes(REF.invUsd),
    'lo invertido no entra: una comitente no paga un cheque, y el dueño lo quiso aparte')
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
  assert.throws(() => tarjetas({ ...REF, invArs: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, total: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas({ ...REF, pisoSimple: '' }), /faltan las referencias/)
  assert.throws(() => tarjetas(), /faltan las referencias/)
})
