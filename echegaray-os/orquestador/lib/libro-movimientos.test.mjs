// EL LIBRO CANÓNICO, VERIFICADO EN FRÍO.
//
// Sin red, sin base, sin Google: se le arman los movimientos a mano y se prueba la parte donde se
// pierde la plata, que es la deduplicación. Cada test de acá abajo corresponde a un error REAL que ya
// ocurrió en este archivo y que costó plata — no son casos inventados.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  movimiento, claveDe, deduplicar, separarInternas, estadoContraCorte, sumar,
  ENTRA, SALE, ESTADOS, RUBRO_INTERNO,
} from './libro-movimientos.mjs'

const base = { fecha: 46000, importe: 1000, signo: SALE, estado: 'REAL', origen: { pestana: 'Compras', fila: 7 } }

test('un movimiento sin fecha, sin importe o sin estado ROMPE, y dice qué le falta', () => {
  // Falla cerrado a propósito: un movimiento incompleto no es un dato parcial, es un agujero que
  // después aparece como "una diferencia sin causa" — que es exactamente lo que no se acepta.
  assert.throws(() => movimiento({ ...base, fecha: undefined }), /fecha/)
  assert.throws(() => movimiento({ ...base, importe: 'mil' }), /importe/)
  assert.throws(() => movimiento({ ...base, estado: 'quizás' }), /estado/)
  assert.throws(() => movimiento({ ...base, signo: 0 }), /signo/)
  assert.throws(() => movimiento({ ...base, origen: {} }), /origen\.pestana/)
})

test('EL IMPORTE ES MAGNITUD Y EL SIGNO VA APARTE: nunca el mismo hecho dos veces', () => {
  // Guardar "-45.695" Y además signo = -1 es tener el hecho duplicado, y el día que uno de los dos se
  // invierta la suma da un número plausible y equivocado.
  const m = movimiento({ ...base, importe: -45695, signo: SALE })
  assert.equal(m.importe, 45695)
  assert.equal(m.signo, SALE)
  assert.equal(m.signo * m.importe, -45695, 'el que suma es el producto, no el importe suelto')
})

test('EL CHEQUE 313 FÍSICO NO ES EL CHEQUE 313 ECHEQ', () => {
  // Costó un pago desaparecido. Con el número solo, los dos colapsan en una fila.
  const fisico = claveDe({ ...base, instrumento: 'cheque', numeroCheque: '313' })
  const echeq = claveDe({ ...base, instrumento: 'echeq', numeroCheque: '313' })
  assert.notEqual(fisico, echeq)
  // Y el mismo cheque escrito con ceros a la izquierda sigue siendo el mismo cheque.
  assert.equal(claveDe({ ...base, instrumento: 'cheque', numeroCheque: '00313' }), fisico)
})

test('UNA NOTA DE CRÉDITO NO COLAPSA CON SU FACTURA: el signo entra en la clave', () => {
  // Sumarlas como compras costó $41,9M. Sin el signo en la clave, la nota y la factura del mismo
  // comprobante se fusionan y una de las dos desaparece.
  const factura = claveDe({ ...base, cuit: '30-71037035-0', comprobante: '0002-00000683', signo: SALE })
  const nota = claveDe({ ...base, cuit: '30-71037035-0', comprobante: '0002-00000683', signo: ENTRA })
  assert.notEqual(factura, nota)
})

test('EL BANCO SE IDENTIFICA POR SU REFERENCIA, NO POR EL SALDO CORRIDO', () => {
  // El saldo corrido cambia cuando se inserta un movimiento anterior, así que la MISMA operación se ve
  // distinta en dos importaciones: así entraron 68 duplicados.
  const a = claveDe({ ...base, referenciaBanco: 'REF-99887', importe: 1000 })
  const b = claveDe({ ...base, referenciaBanco: 'REF-99887', importe: 999999 })
  assert.equal(a, b, 'el importe no puede entrar en la clave del banco')
})

test('SIN IDENTIFICADOR PROPIO, DOS FILAS SON DOS MOVIMIENTOS aunque digan lo mismo', () => {
  // Seis pagos de $750.000 al mismo proveedor son un plan de pagos. Colapsarlos "porque son iguales"
  // es inventar que cinco no existieron.
  const a = claveDe({ ...base, origen: { pestana: 'Cheques Emitidos', fila: 30 } })
  const b = claveDe({ ...base, origen: { pestana: 'Cheques Emitidos', fila: 31 } })
  assert.notEqual(a, b)
})

test('LA DEDUPLICACIÓN DICE QUÉ COLAPSÓ: una que se come un pago real se ve igual que una que anda', () => {
  const m = (fila, estado) => movimiento({ ...base, estado, origen: { pestana: 'Compras', fila },
    cuit: '30-71037035-0', comprobante: '0002-00000683' })
  const { libro, colapsos } = deduplicar([m(7, 'PROYECTADO'), m(9, 'REAL')])
  assert.equal(libro.length, 1)
  assert.equal(colapsos.length, 1, 'sin la lista, un colapso indebido es invisible')
  assert.equal(colapsos[0].se_descarta.fila, 9)
})

test('GANA EL MÁS FUERTE, NO EL PRIMERO: un proyectado que se cumple se marca REAL, no se suma dos veces', () => {
  // Es la regla absoluta del criterio percibido. Si decidiera el orden de llegada, el mismo libro
  // daría dos resultados distintos según qué extractor corrió antes.
  const m = (estado, fila) => movimiento({ ...base, estado, origen: { pestana: 'Compras', fila },
    cuit: '30-71037035-0', comprobante: '0002-00000683' })
  for (const orden of [['PROYECTADO', 'REAL'], ['REAL', 'PROYECTADO']]) {
    const { libro } = deduplicar([m(orden[0], 1), m(orden[1], 2)])
    assert.equal(libro[0].estado, 'REAL', `con el orden ${orden.join('→')} tendría que ganar el REAL`)
  }
})

test('UNA TRANSFERENCIA INTERNA NO CAMBIA LA CAJA CONSOLIDADA: los dos lados o ninguno', () => {
  // Mover plata del banco al cajón no cambia cuánta plata hay. Contar un solo lado la inventa.
  const salida = movimiento({ ...base, rubro: RUBRO_INTERNO, signo: SALE, importe: 500000, origen: { pestana: 'Banco', fila: 1 } })
  const entrada = movimiento({ ...base, rubro: RUBRO_INTERNO, signo: ENTRA, importe: 500000, origen: { pestana: 'Banco', fila: 2 } })
  const pago = movimiento({ ...base, importe: 1000, origen: { pestana: 'Compras', fila: 3 } })
  const { consolidado, internas, netoInterno } = separarInternas([salida, entrada, pago])
  assert.equal(internas.length, 2)
  assert.equal(netoInterno, 0, 'si el neto interno no da cero, falta un lado y la caja está inventada')
  assert.deepEqual(consolidado.map((m) => m.origen.pestana), ['Compras'])
})

test('UN PROYECTADO CUYA FECHA PASÓ ES UN VENCIDO — y un real no cambia con el tiempo', () => {
  // La distinción es lo que hace visible el trabajo de conciliación pendiente. Mezclarlo con el resto
  // del proyectado lo esconde.
  assert.equal(estadoContraCorte('PROYECTADO', 45990, 46000), 'VENCIDO')
  assert.equal(estadoContraCorte('PROYECTADO', 46010, 46000), 'PROYECTADO')
  assert.equal(estadoContraCorte('REAL', 45990, 46000), 'REAL')
})

test('EL COMPROMETIDO ATRASADO TAMBIÉN ES UN VENCIDO (cambio de criterio, 17/08/2026)', () => {
  // ═══ ANTES CREÍAMOS ═══ que el COMPROMETIDO no podía estar atrasado, y esta misma línea afirmaba
  // `estadoContraCorte('COMPROMETIDO', 45990, 46000) === 'COMPROMETIDO'`. Era cierto por construcción:
  // el único COMPROMETIDO era el cheque entregado, y `estadoDeEgreso` sólo lo devolvía para fechas
  // POSTERIORES al corte. Medido en el archivo vivo el 17/08: cero COMPROMETIDOS anteriores al corte.
  //
  // ═══ EVIDENCIA NUEVA ═══ desde que la factura cargada y no pagada nace COMPROMETIDA
  // (`esFacturaCargada`), las 3 facturas hoy vencidas por $3.937.365 llegaban a VENCIDO por la rama
  // de PROYECTADO y dejarían de pasar por ella. El titular de la tarjeta no se movería —los dos
  // estados son DEUDA— pero el atraso desaparecería de las alertas. Un defecto más silencioso.
  //
  // ═══ NUEVA REGLA ═══ vence todo lo que se debe y tiene fecha pasada, sin importar de dónde vino.
  assert.equal(estadoContraCorte('COMPROMETIDO', 45990, 46000), 'VENCIDO')
  assert.equal(estadoContraCorte('COMPROMETIDO', 46010, 46000), 'COMPROMETIDO')
  // Y el compromiso SIN FECHA no: `cuotasEnCheque` manda serial 0 para el cheque sin fecha de pago, y
  // 0 es menor que cualquier corte. Sin esta guarda, todos pasarían a VENCIDO de golpe declarando un
  // atraso que nadie midió.
  assert.equal(estadoContraCorte('COMPROMETIDO', 0, 46000), 'COMPROMETIDO')
})

test('UNA SOLA FUNCIÓN SUMA, CON DISTINTA VENTANA: es el punto entero del archivo', () => {
  // CAJA pide un tramo, el Semanal un día, el Mensual un mes. Si cada vista tuviera su propia suma,
  // volvería la duplicación que este libro vino a matar.
  const libro = [
    movimiento({ ...base, fecha: 46000, importe: 100, signo: ENTRA, origen: { pestana: 'Cobranzas', fila: 1 } }),
    movimiento({ ...base, fecha: 46001, importe: 30, signo: SALE, origen: { pestana: 'Compras', fila: 2 } }),
    movimiento({ ...base, fecha: 46010, importe: 500, signo: SALE, estado: 'PROYECTADO', origen: { pestana: 'Compras', fila: 3 } }),
  ]
  assert.equal(sumar(libro, { desde: 46000, hasta: 46002 }).total, 70)
  assert.equal(sumar(libro, { desde: 46000, hasta: 46002, signo: ENTRA }).total, 100)
  assert.equal(sumar(libro, { estados: ['REAL'] }).total, 70, 'el proyectado no entra si no se lo pide')
  assert.equal(sumar(libro, {}).filas, 3)
  // La ventana es [desde, hasta): el borde superior NO entra, o un movimiento cae en dos tramos.
  assert.equal(sumar(libro, { desde: 46001, hasta: 46001 }).filas, 0)
  assert.equal(sumar(libro, { desde: 46001, hasta: 46002 }).filas, 1)
})

test('los cuatro estados están declarados y ninguno es un sinónimo de otro', () => {
  assert.deepEqual(ESTADOS, ['REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])
  assert.equal(new Set(ESTADOS).size, ESTADOS.length)
})
