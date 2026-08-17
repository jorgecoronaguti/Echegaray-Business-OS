// UNA QUINCENA QUE NADIE PROBÓ NO ES UN COMPROMISO FIRME (16/08/2026)
//
// El dueño: *"no estas tomando bien los conceptos q surgen de compras proveedores cobranzas"*. Al
// medir la tarjeta de CAJA contra el Sheet vivo apareció el segundo defecto, más hondo que el
// primero: de los $70.420.524 rotulados COMPROMETIDO, **$47.415.800 son quincenas de jornales que
// nadie marcó como pagadas y que el extracto no prueba** — el 67% de la "deuda cierta".
//
// `libro-movimientos.mjs` define los estados y no deja lugar a dudas:
//
//   · COMPROMETIDO — *"está firmado y entregado, con fecha, pero todavía no salió de la cuenta. El
//     caso canónico es el cheque emitido y no debitado: salió de tus manos, no de tu cuenta."*
//   · VENCIDO      — *"estaba previsto para una fecha que ya pasó y nadie lo marcó como real. (…) es
//     un PROYECTADO que necesita que alguien lo mire. Se distingue porque mezclarlo con el resto
//     esconde el trabajo pendiente."*
//
// Una quincena cuya fecha de pago YA PASÓ, sin "Pagado el" y sin débito que la respalde, es la
// segunda descripción, no la primera. De un cheque librado se sabe que no se debitó; de esta
// quincena no se sabe nada — los jornales se pagan en buena parte por caja física y el banco no los
// ve (lo dice `quincenaAMovimientos` en su propia cabecera). Llamarla COMPROMETIDO afirma un hecho
// que nadie verificó, y así $47,4M entraron a la portada de CAJA como deuda probada.
//
// LO QUE ESTE TEST **NO** PIDE: que la plata salga del número. La obligación existe igual —la
// quincena se trabajó— y sacarla haría que la tarjeta dijera que hay plata que no hay. Lo que pide
// es que quede en el estado que declara la duda, para que la tarjeta pueda publicarla.
//
// Y NO TOCA LAS DOS AFIRMACIONES DEL DUEÑO, que ya costaron una regresión publicada: si él marcó la
// quincena (con fecha creíble o imposible), eso manda y sale REAL. Acá sólo cae lo que nadie afirmó.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deJornalesQuincenas } from './libro-extractores-nomina.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

const CORTE = serialDe(2026, 8, 5)
const suma = (ms, estado) => ms.filter((m) => m.estado === estado).reduce((a, m) => a + m.importe, 0)

test('la quincena con fecha PASADA que nadie marcó ni el banco prueba NO es COMPROMETIDO', () => {
  // Pago previsto el 03/08, corte del extracto el 05/08, sin "Pagado el" y sin lote que la cubra.
  const ms = deJornalesQuincenas({
    reales: { pago: [serialDe(2026, 8, 3)], hasta: [serialDe(2026, 7, 31)], pagado: [''], total: [7675588] },
  }, CORTE)
  assert.equal(ms.length, 1)
  assert.notEqual(ms[0].estado, 'COMPROMETIDO',
    'COMPROMETIDO es el cheque librado: se SABE que no se debitó. De esta quincena no se sabe nada')
  assert.equal(ms[0].estado, 'VENCIDO',
    'la fecha pasó y nadie la concilió: es el estado que el libro define para exactamente eso')
})

test('la quincena que TODAVÍA NO VENCIÓ sigue siendo COMPROMETIDO: la obligación existe y no está atrasada', () => {
  // El corte es el 05/08 y el pago está previsto para el 20/08: no hay nada que conciliar todavía.
  // Sin esta rama, el arreglo mandaría a "sin probar" toda la nómina futura, que es el error opuesto.
  const ms = deJornalesQuincenas({
    reales: { pago: [serialDe(2026, 8, 20)], hasta: [serialDe(2026, 8, 15)], pagado: [''], total: [5000000] },
  }, CORTE)
  assert.equal(ms[0].estado, 'COMPROMETIDO')
})

test('LA PLATA NO SE MUEVE: reclasificar no puede cambiar cuánto se debe', () => {
  // La garantía de que esto es un cambio de ETIQUETA y no de importe. Si el arreglo se llevara plata
  // puesta, la tarjeta de deuda bajaría sola y nadie se enteraría — el modo de falla más caro.
  const reales = {
    pago: [serialDe(2026, 8, 3), serialDe(2026, 8, 20)],
    hasta: [serialDe(2026, 7, 31), serialDe(2026, 8, 15)],
    pagado: ['', ''],
    total: [7675588, 5000000],
  }
  const ms = deJornalesQuincenas({ reales }, CORTE)
  assert.equal(suma(ms, 'COMPROMETIDO') + suma(ms, 'VENCIDO'), 7675588 + 5000000,
    'COMPROMETIDO + VENCIDO es lo que la tarjeta publica como deuda: no puede cambiar de total')
  assert.equal(suma(ms, 'REAL'), 0, 'nada se volvió un hecho por reclasificarlo')
})

test('lo que el dueño MARCÓ sigue saliendo REAL: la reclasificación no le pisa la afirmación', () => {
  // La regresión del 16/08 que ya se publicó y se corrigió: descartar la fecha había descartado
  // también la afirmación de que la quincena estaba pagada, y salieron $51,9M de deuda ya cobrada.
  const ms = deJornalesQuincenas({
    reales: { pago: [serialDe(2026, 7, 17)], hasta: [serialDe(2026, 7, 15)], pagado: [serialDe(2026, 7, 17)], total: [3775150] },
  }, CORTE)
  assert.equal(ms[0].estado, 'REAL', 'el dueño marcó el pago: es un hecho y manda sobre cualquier inferencia')
})
