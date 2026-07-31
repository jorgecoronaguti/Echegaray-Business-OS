// Tests de la conciliación extracto ↔ base. Herméticos: el núcleo es puro, no toca red ni base.
//
// LO QUE PROTEGEN: que el extracto verificado pueda sanear la base SIN borrar plata real. Los casos que
// están acá son los que aparecieron de verdad en el extracto 01/07→31/07 contra una base con 41 copias.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planConciliacion, conceptoCompatible, emparejable, numeroAnotado, norm } from './banco-conciliar-extracto.mjs'

const b = (id, fecha, concepto, importe, extra = {}) => ({ id, fecha, concepto, importe, saldo: null, referencia: null, origen: 'semilla', ...extra })
const m = (fecha, concepto, importe, referencia, saldo = null) => ({ fecha, concepto, importe, referencia, saldo })

test('el concepto se compara sin mayúsculas ni espacios de más: eso lo cambia la descarga, no el banco', () => {
  assert.equal(norm('  Deposito   E-cheq  48hs '), 'deposito e-cheq 48hs')
  assert.equal(conceptoCompatible('Deposito E-cheq 48hs Presencia Bsr', 'deposito e-cheq  48hs presencia bsr'), 'exacto')
})

test('EL CASO REAL: el concepto RECORTADO es el mismo movimiento', () => {
  // La semilla guardó "Pago haberes - 260701507" y el CSV trae el número repetido al final. Y una
  // captura corta "Deposito de efectivo - Tarj nro. …" en el ancho de la columna.
  assert.equal(conceptoCompatible('Pago haberes - 260701507', 'Pago haberes - 260701507       260701507'), 'prefijo')
  assert.equal(conceptoCompatible('Deposito de efectivo', 'Deposito de efectivo - Tarj nro. 5892445 - atm: s1ori063'), 'prefijo')
})

test('DOS CONCEPTOS QUE DIFIEREN EN EL MEDIO NO SE EMPAREJAN', () => {
  // "Id debin cuit 30710630670" vs "Id debin z0kv879… cuit 30710630670": el prefijo no alcanza y NO se
  // deben emparejar por parecido. Si son el mismo movimiento, lo va a decir la fecha+importe y el
  // seguro de la baja — no una heurística de texto que un día empareje dos cosas distintas.
  assert.equal(conceptoCompatible('Transferencia recibida - credin - Id debin cuit 307', 'Transferencia recibida - credin - Id debin z0kv8 cuit 307'), null)
  // Y un prefijo demasiado corto tampoco: "iva" no identifica nada.
  assert.equal(conceptoCompatible('Iva', 'Iva percepcion rg 2408'), null)
})

test('EL NÚMERO DE CHEQUE ANOTADO A MANO TIENE QUE COINCIDIR CON LA REFERENCIA', () => {
  // Para un cheque, la referencia del banco ES el número. La semilla lo anotó en el concepto. Si no se
  // comparan, dos cheques de $200.000 del mismo día se emparejan al azar y la referencia 221 termina en
  // la fila del 220: el cruce contra public.cheques queda siendo una identidad EQUIVOCADA.
  assert.equal(numeroAnotado('Cheque debitado - Nº 221'), '221')
  assert.equal(numeroAnotado('Cheque debitado'), null)
  assert.equal(numeroAnotado('Iva percepcion rg 2408'), null, 'un rg 2408 no es un número de cheque')
  const fila = { concepto: 'Cheque debitado - Nº 221' }
  assert.equal(emparejable(fila, { concepto: 'Cheque debitado', referencia: '221' }), 'prefijo')
  assert.equal(emparejable(fila, { concepto: 'Cheque debitado', referencia: '000000221' }), 'prefijo', 'el relleno de ceros no cuenta')
  assert.equal(emparejable(fila, { concepto: 'Cheque debitado', referencia: '220' }), null, 'otro cheque no es este cheque')
  // Sin referencia no hay con qué contradecir: el concepto manda.
  assert.equal(emparejable(fila, { concepto: 'Cheque debitado', referencia: null }), 'prefijo')
})

test('CADA CHEQUE SE QUEDA CON SU PROPIA REFERENCIA, no con la del vecino', () => {
  // Dos cheques del mismo importe el mismo día, anotados. El orden de los ids es el inverso al del
  // extracto a propósito: sin la regla del número, el 221 caería en la fila del 220.
  const base = [b(60, '2026-07-22', 'Cheque debitado - Nº 221', -200000), b(61, '2026-07-21', 'Cheque debitado - Nº 220', -200000)]
  const ext = [m('2026-07-21', 'Cheque debitado', -200000, '220'), m('2026-07-22', 'Cheque debitado', -200000, '221')]
  const p = planConciliacion(base, ext)
  assert.equal(p.asignar.length, 2)
  assert.equal(p.asignar.find((a) => a.id === 60).referencia, '221')
  assert.equal(p.asignar.find((a) => a.id === 61).referencia, '220')
  assert.equal(p.sobran.length, 0)
})

test('FUERA DE LA VENTANA NO SE TOCA NADA: junio no lo cubre este extracto', () => {
  const base = [b(1, '2026-06-25', 'Algo de junio', -100), b(2, '2026-07-01', 'Deposito', 500)]
  const ext = [m('2026-07-01', 'Deposito', 500, '8538')]
  const p = planConciliacion(base, ext)
  assert.deepEqual(p.ventana, { desde: '2026-07-01', hasta: '2026-07-01' })
  assert.equal(p.fuera, 1)
  assert.equal(p.sobran.length, 0, 'la fila de junio no es candidata a nada')
  assert.equal(p.asignar.length, 1)
  assert.equal(p.asignar[0].referencia, '8538')
})

test('DOS PASADAS: el exacto se queda con su fila y el recortado no se la roba', () => {
  // Las dos filas de la base son el MISMO movimiento (una con el concepto completo, otra recortado).
  // El extracto tiene uno solo. El exacto tiene que ganar y el recortado quedar como copia.
  const base = [b(10, '2026-07-01', 'Pago haberes - 260701507', -1807057.16), b(11, '2026-07-01', 'Pago haberes - 260701507   260701507', -1807057.16)]
  const ext = [m('2026-07-01', 'Pago haberes - 260701507   260701507', -1807057.16, '33690901')]
  const p = planConciliacion(base, ext)
  assert.equal(p.asignar.length, 1)
  assert.equal(p.asignar[0].id, 11, 'la fila con el concepto exacto es la que se queda')
  assert.equal(p.asignar[0].modo, 'exacto')
  assert.equal(p.sobran.length, 1)
  assert.equal(p.sobran[0].id, 10)
  assert.equal(p.huerfanas.length, 0, 'tiene gemela: la baja es segura')
})

test('EL SEGURO DE LA BAJA: una fila que el extracto NO explica no se borra, se reporta', () => {
  // Si el extracto no tiene NINGÚN movimiento de esa fecha e importe, borrar sería perder plata real.
  const base = [b(20, '2026-07-05', 'Un pago que el extracto no lista', -900000), b(21, '2026-07-05', 'Deposito', 100)]
  const ext = [m('2026-07-05', 'Deposito', 100, '1')]
  const p = planConciliacion(base, ext)
  assert.equal(p.sobran.length, 0, 'no se propone ninguna baja')
  assert.equal(p.huerfanas.length, 1)
  assert.equal(p.huerfanas[0].id, 20)
})

test('DOS CHEQUES DE $200.000 EL MISMO DÍA SON DOS MOVIMIENTOS, NO UNO REPETIDO', () => {
  // El caso que hace peligroso cualquier dedup por (fecha, concepto, importe). Acá el extracto los
  // lista dos veces con referencias distintas, así que las dos filas de la base tienen dueño.
  const base = [b(30, '2026-07-16', 'Cheque debitado', -200000), b(31, '2026-07-16', 'Cheque debitado', -200000)]
  const ext = [m('2026-07-16', 'Cheque debitado', -200000, '217'), m('2026-07-16', 'Cheque debitado', -200000, '218')]
  const p = planConciliacion(base, ext)
  assert.equal(p.asignar.length, 2, 'los dos se emparejan')
  assert.equal(p.sobran.length, 0, 'ninguno es duplicado')
  assert.deepEqual(p.asignar.map((a) => a.id).sort(), [30, 31])
  assert.deepEqual(p.asignar.map((a) => a.referencia).sort(), ['217', '218'])
})

test('lo que el extracto trae y la base no tiene es un ALTA con su referencia', () => {
  const base = [b(40, '2026-07-30', 'Impuesto ley 25.413 debito 0,6%', -3731.79)]
  const ext = [m('2026-07-30', 'Impuesto ley 25.413 debito 0,6%', -3731.79, '8696'), m('2026-07-31', 'Compra con tarjeta de debito - Merpago*ieric', -15092.62, '16996641')]
  const p = planConciliacion(base, ext)
  assert.equal(p.faltan.length, 1)
  assert.equal(p.faltan[0].referencia, '16996641')
  assert.equal(p.sobran.length, 0)
})

test('NO ENSUCIA LA ENTRADA: el extracto que me pasan queda como estaba', () => {
  // La primera versión marcaba `m.__asignado` sobre el objeto recibido y lo dejaba sucio para el que
  // lo usara después (el mismo array se vuelve a recorrer para insertar).
  const ext = [m('2026-07-01', 'Deposito', 500, '1')]
  const antes = JSON.stringify(ext)
  planConciliacion([b(1, '2026-07-01', 'Deposito', 500)], ext)
  assert.equal(JSON.stringify(ext), antes)
})

test('un extracto vacío no propone nada (y no borra la base entera)', () => {
  const p = planConciliacion([b(1, '2026-07-01', 'x', 1)], [])
  assert.equal(p.ventana, null)
  assert.deepEqual(p.sobran, [])
  assert.deepEqual(p.asignar, [])
  assert.equal(p.fuera, 1)
})

test('el resultado no depende del orden: se empareja la fila más vieja primero', () => {
  const base = [b(52, '2026-07-01', 'Deposito', 500), b(51, '2026-07-01', 'Deposito', 500)]
  const ext = [m('2026-07-01', 'Deposito', 500, '9')]
  const p = planConciliacion(base, ext)
  assert.equal(p.asignar[0].id, 51, 'gana la de id menor, no la que vino primero en el array')
})
