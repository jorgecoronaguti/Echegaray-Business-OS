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
}
const T = () => tarjetas(REF)
const de = (clave) => T().find((t) => t.clave === clave)

test('son CINCO en el orden de la historia: tengo → debo pagar → voy a cobrar → invertido → termino', () => {
  assert.deepEqual(T().map((t) => t.clave), ['disponible', 'comprometida', 'aCobrar', 'invertido', 'finDeMes'])
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
  assert.match(c.contexto, /próx\. 7 días/)
  assert.ok(c.contexto.includes(terminoLibro({ signo: -1, estados: NO_REAL, hasta: 'TODAY()+7', medida: 'magnitud' })))
  assert.ok(!c.valor.includes('"REAL"'), 'lo REAL ya salió de la cuenta: no es obligación')
})

test('A COBRAR es la MISMA suma del mes con el signo contrario — la pata que faltaba ver', () => {
  const a = de('aCobrar')
  assert.equal(a.valor, `=${terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })}`)
  assert.match(a.contexto, /si se cobra lo proyectado/, 'una proyección no es plata y el contexto lo dice')
})

test('INVERTIDO cita las filas Balanz de la grilla — una sola fuente, nunca una segunda posición', () => {
  const t = de('invertido')
  assert.equal(t.valor, `=N(${REF.invArs})+N(${REF.invUsd})`)
  assert.match(t.contexto, /Balanz/)
  assert.match(t.contexto, /liquidez T\+1/)
  assert.ok(t.contexto.includes(REF.invFecha))
})

test('CAJA · FIN DE MES es la CONSECUENCIA PERFECTA: referencia a las tres hermanas, ninguna suma nueva', () => {
  // A3 (disponible) + E3 (a cobrar) − C3 (comprometida). Si esta fórmula volviera a sumar el libro
  // por su cuenta, la identidad podría romperse en silencio — referenciando, no puede.
  const t = de('finDeMes')
  assert.equal(t.valor, '=N($A$3)+N($E$3)-N($C$3)')
  assert.match(t.contexto, /tengo \+ cobro − pago/, 'la identidad queda escrita para el que mira')
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
  assert.throws(() => tarjetas(), /faltan las referencias/)
})
