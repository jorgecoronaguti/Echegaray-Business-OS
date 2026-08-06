// LAS ALERTAS Y LAS ACCIONES DE CAJA, VERIFICADAS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). Estas siete líneas son lo único de la portada que le dice al dueño QUÉ
// HACER. Una alerta que no se enciende cuando corresponde es peor que no tenerla: enseña a confiar en
// un tablero que calla. Y una que se enciende siempre enseña lo contrario, que es igual de malo.
//
// LO QUE NO SE PUEDE VERIFICAR ACÁ, Y SE DICE: no se evalúan las fórmulas. Node no es Sheets. Lo que
// estos tests prueban es que las condiciones ESTÉN y que la línea de calma niegue exactamente esas
// condiciones y no una copia — que es el modo de falla real: aflojar un umbral en un lado y dejar el
// viejo en el otro, y que la pestaña diga "sin alertas" arriba de tres alertas encendidas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { alertas, acciones, MARCA_ALERTA, MARCA_OK } from './caja-avisos.mjs'
import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'

const REF = { piso: '$I$13', fechaPiso: '$G$13' }
const A = () => alertas(REF)
const AC = () => acciones(REF)

test('CUATRO ALERTAS Y TRES ACCIONES: el tope es el diseño, no una casualidad', () => {
  // El dueño puso el número. Un tablero que puede mostrar quince alertas termina mostrando quince
  // siempre, y entonces no avisa ninguna. Cuando aparezca la número cinco hay que decidir cuál sale.
  assert.equal(A().length, 4)
  assert.equal(AC().length, 3)
})

test('todas son fórmulas condicionales: un aviso de texto vale hasta la corrida siguiente', () => {
  // Con el timer detenido —y ya estuvo detenido semanas— una alerta escrita como texto sigue diciendo
  // "todo en orden" sobre una caja que se dio vuelta.
  for (const f of [...A(), ...AC()]) assert.match(f, /^=IF\(/)
})

test('LOS SIETE CONTROLES DEL ANEXO ESTÁN CITADOS: la mudanza fue de lugar, no de cobertura', () => {
  const todo = A().join(' ')
  for (const n of [ANEXO.difEcheq, ANEXO.difConciliacion, ANEXO.efectivoSinExplicar,
    ANEXO.vencidoSinConciliar, ANEXO.oficinaSinCanal, ANEXO.chequesSinMarca, ANEXO.chequesSinFecha]) {
    assert.ok(todo.includes(n), `${n} no está en ninguna alerta: se perdió al mudarse al anexo`)
  }
})

test('LA CALMA NIEGA LAS MISMAS CONDICIONES QUE ENCIENDEN LAS ALERTAS', () => {
  // Es el invariante que hace que "· sin alertas" signifique algo. Se verifica exigiendo que la
  // primera línea nombre TODO lo que las otras tres miran: si alguna condición no está adentro del
  // NOT(OR(...)), existe un estado en el que la pestaña dice que está todo bien y no lo está.
  const [primera, ...resto] = A()
  assert.match(primera, /NOT\(OR\(/)
  assert.ok(primera.includes(`"${MARCA_OK} sin alertas"`))
  const nombres = [...new Set(resto.join(' ').match(/(ANEXO|CAJA)_[A-Z_]+/g) ?? [])]
  assert.ok(nombres.length >= 7, 'el resto de las alertas tiene que mirar algo')
  for (const n of nombres) {
    assert.ok(primera.includes(n), `la línea de calma ignora ${n}: podría decir "sin alertas" con esa alerta encendida`)
  }
})

test('LA ALERTA NOMBRA AL CULPABLE, con su monto', () => {
  // Un total agrupado sin decir cuál manda es el "número mudo" que este archivo persigue desde julio:
  // no habilita ninguna acción. "No cierra $2,3M" manda a buscar en siete lados; "manda efectivo sin
  // depositar $2,3M" manda a uno.
  const [, noCierra, falta] = A()
  for (const f of [noCierra, falta]) {
    assert.ok(f.includes('manda'))
    assert.ok(f.includes('"$#,##0"'), 'el monto se dibuja, no se deja como número crudo dentro del texto')
    assert.ok(f.startsWith(`=IF(`) && f.includes(`"${MARCA_ALERTA} `), 'una alerta arranca con su marca')
  }
})

test('EL ARQUEO MANDA SOBRE LA ANTIGÜEDAD DEL EXTRACTO', () => {
  // Sin conteo cargado la caja física vale $0 y eso desfigura el total entero; un extracto de ocho días
  // desfigura una sola cuenta. Las dos van en la misma línea porque las dos son "el dato no está
  // fresco", y el tope de cuatro alertas obliga a elegir cuál se dice primero.
  const cuarta = A()[3]
  assert.ok(cuarta.indexOf(DESDE_CAJA.arqueoArs) < cuarta.indexOf(DESDE_CAJA.bancoCorte))
  assert.ok(cuarta.includes('la caja física vale $0'))
})

test('LA PRIMERA ACCIÓN ES CUBRIR O COLOCAR, nunca las dos, y con la reserva declarada', () => {
  const [primera] = AC()
  assert.ok(primera.includes('"Cubrir "'), 'si falta plata, dice cuánto')
  assert.ok(primera.includes('colocables'), 'y si sobra, cuánto se puede inmovilizar')
  assert.ok(primera.includes(`MAX(0;${REF.piso}-MAX(0;N(${DESDE_CAJA.minima})))`),
    'lo colocable es el piso menos la reserva, y nunca negativo: un negativo se lee como "conseguí esto"')
  // SIN RESERVA DECLARADA NO SE PUBLICA UN NÚMERO: publicaría el piso entero, que invita a inmovilizar
  // hasta el último peso que la empresa va a necesitar. Es el error más caro posible en esta línea.
  assert.ok(primera.includes(`IF(N(${DESDE_CAJA.minima})<=0;"Cargá la caja mínima`))
})

test('LAS ACCIONES DE COBRAR Y DE PAGAR SALEN DEL LIBRO, con monto y con fecha', () => {
  const [, cobrar, pagar] = AC()
  assert.ok(cobrar.includes('_MOVIMIENTOS!') && cobrar.includes('="VENCIDO"'), 'la cobranza vencida sale del libro')
  assert.ok(cobrar.includes('Reclamar'))
  assert.ok(pagar.includes('_MOVIMIENTOS!') && pagar.includes('TODAY()+7'), 'lo que vence en la semana, también')
  assert.ok(pagar.includes('Preparar'))
})

test('LA FECHA SÓLO SE IMPRIME SI EXISTE: el tramo abierto no tiene borde', () => {
  // `TEXT("";"dd/mm")` dibuja 30/12 —el serial 0— y una acción que dice "cubrir $X antes del 30/12"
  // manda a hacer algo en una fecha inventada. El último tramo de la escalera no tiene fecha a
  // propósito: es "de acá en adelante".
  for (const f of [A()[0], AC()[0]]) {
    assert.ok(f.includes(`IF(ISNUMBER(${REF.fechaPiso})`), 'la fecha del piso se comprueba antes de imprimirse')
  }
})

test('NINGUNA fórmula usa la coma como separador de argumentos (es-AR)', () => {
  for (const f of [...A(), ...AC()]) {
    const sospechosas = f.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
    assert.doesNotMatch(sospechosas, /,/, `va a dar #ERROR! en es-AR:\n  ${f}`)
  }
})

test('FALLA CERRADO: sin el piso, no se emite una alerta que no puede evaluarse', () => {
  assert.throws(() => alertas({}), /piso/)
  assert.throws(() => acciones({ piso: '$I$13' }), /piso/)
})
