// LA MONEDA DE UN COBRO — el defecto de los U$S 15.400 que entraban como $15.400.
//
// Ningún caso de acá es inventado: la fila es la 62 de Cobranzas (ID 58), Quattropani · Melisa García
// SAS, "Anticipo 50% inicio obra", FA 220, cobro del 31/07/2026 por U$S 15.400. `Obras!D14` la valúa
// en $22.984.870 al `TIPO_CAMBIO_USD` del archivo y los dos Cash Flow la contaban $15.400.
//
// Si se revierte el arreglo —si `deCobranzas` deja de leer la columna "Moneda"— el primer test dice
// exactamente cuánta plata falta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { deCobranzas } from './libro-extractores-cobranzas.mjs'
import { comoFilas, DESDE } from './cobranzas-fixture.mjs'

/** El `TIPO_CAMBIO_USD` leído del archivo vivo el 13/08/2026. */
const TC = 1492.524
/** 31/07/2026, la fecha de cobro de la fila real. */
const F_COBRO = 46234
const CORTE = 46240

// El encabezado real de la fila 4. "Moneda" va después de "Valor banco" sólo para que el fixture sea
// corto: las dos columnas se resuelven por RÓTULO, no por posición — que es lo que las hace sobrevivir
// a que el dueño inserte una columna.
const ENC = ['x', 'Obra / Cliente', 'Estado', 'TOTAL a cobrar (neto de retenciones)',
  'Fecha cobro', 'Fecha cobro', 'Forma de Cobro', 'Valor banco', 'Moneda']

/** Las filas de datos arrancan en la 5: las cuatro de arriba son título, agrupador y encabezado. */
const hoja = (...datos) => [[], [], [], ENC, ...datos]

/** La fila real de Quattropani, con la moneda que se le quiera dar. */
const quattropani = (moneda) => ['', 'QUATTROPANI /MELISA GARCIA SAS', 'Cobrado', 15400,
  F_COBRO, F_COBRO, 'Transferencia', '', moneda]

test('un cobro en USD entra al libro VALUADO — $22.984.870, no $15.400', () => {
  const ms = deCobranzas(hoja(quattropani('USD')), CORTE, { tipoCambio: TC })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].importe, 15400 * TC, 'el importe del libro está en pesos')
  assert.equal(Math.round(ms[0].importe), 22_984_870, 'el mismo número que publica Obras!D14')
  // La diferencia que este test defiende, dicha en plata: es lo que faltaba en los dos Cash Flow.
  assert.equal(Math.round(ms[0].importe - 15400), 22_969_470)
})

test('el origen viaja con el número: moneda, importe nativo y tipo de cambio aplicado', () => {
  // Sin esto, el $22.984.870 es un número que nadie puede desmentir sin volver a la pestaña. La
  // invariante `importe = importeOrigen × tipoCambio` es lo que permite auditarlo desde el libro.
  const [m] = deCobranzas(hoja(quattropani('USD')), CORTE, { tipoCambio: TC })
  assert.equal(m.moneda, 'USD')
  assert.equal(m.importeOrigen, 15400, 'lo que dice la fila, en su moneda')
  assert.equal(m.tipoCambio, TC)
  assert.equal(m.importe, m.importeOrigen * m.tipoCambio)
})

test('un cobro en PESOS sigue entrando igual que antes — el arreglo no toca lo que ya andaba', () => {
  // Las 88 filas de las 91 del archivo tienen la celda VACÍA y son pesos: exigir el código explícito
  // dejaría la pestaña sin datos. El cero de las filas ID 35/36 (formato derramado) también es pesos.
  for (const moneda of ['', undefined, 0, 'ARS']) {
    const ms = deCobranzas(hoja(['', 'MESSINA', 'Cobrado', 500000, 46005, 46005, 'Transferencia', '', moneda]),
      46000, { tipoCambio: TC })
    assert.equal(ms.length, 1, `moneda ${JSON.stringify(moneda)}`)
    assert.equal(ms[0].importe, 500000, `moneda ${JSON.stringify(moneda)}: nada se multiplica`)
    assert.equal(ms[0].moneda, 'ARS')
    assert.equal(ms[0].tipoCambio, 1)
  }
})

test('una moneda que no se entiende ABORTA nombrando la fila, en vez de grabar el monto nativo', () => {
  // Es el mismo defecto con otro código: un "EUR" tipeado mañana entraría como pesos sin un solo
  // error. La fila tiene que estar en el mensaje — un control que no dice dónde mirar se apaga.
  const filas = hoja(['', 'MESSINA', 'Cobrado', 500000, 46005, 46005, 'Transferencia', '', ''],
    ['', 'CLIENTE EN EUROS', 'Cobrado', 8000, F_COBRO, F_COBRO, 'Transferencia', '', 'EUR'])
  assert.throws(() => deCobranzas(filas, CORTE, { tipoCambio: TC }),
    /fila 6 \(CLIENTE EN EUROS\).*"EUR"/s)
})

test('sin tipo de cambio NO se convierte a cero ni se graba el nativo: aborta', () => {
  // Un TC en 0 o en blanco es el modo de falla silencioso: multiplicar por cero borra la venta del
  // cuadro y no multiplicar la deja 1.492 veces corta. Las dos publican un número creíble y falso.
  for (const tipoCambio of [null, undefined, 0, NaN, '1492,524']) {
    assert.throws(() => deCobranzas(hoja(quattropani('USD')), CORTE, { tipoCambio }),
      /fila 5 \(QUATTROPANI[^)]*\).*tipo de cambio/s, `tipoCambio=${JSON.stringify(tipoCambio)}`)
  }
})

test('sin filas en dólares, la falta de tipo de cambio NO rompe la corrida', () => {
  // La guarda es sobre lo que hay que valuar, no sobre el archivo: pedir el TC siempre haría caer el
  // libro entero por un rango que ninguna fila necesita.
  const ms = deCobranzas(hoja(['', 'MESSINA', 'Cobrado', 500000, 46005, 46005, 'Transferencia', '', '']),
    46000, { tipoCambio: null })
  assert.equal(ms[0].importe, 500000)
})

test('la moneda se resuelve por RÓTULO aunque la columna se mueva de lugar', () => {
  // Una columna insertada corre la letra y no el nombre. Si esto se rompe, la lectura cae en el
  // respaldo posicional (AA) y una fila en dólares vuelve a contarse como pesos.
  const enc = ['x', 'Obra / Cliente', 'Estado', 'TOTAL a cobrar (neto de retenciones)',
    'Fecha cobro', 'Fecha cobro', 'Moneda', 'Forma de Cobro', 'Valor banco']
  const ms = deCobranzas([[], [], [], enc,
    ['', 'QUATTROPANI', 'Cobrado', 15400, F_COBRO, F_COBRO, 'USD', 'Transferencia', '']],
  CORTE, { tipoCambio: TC })
  assert.equal(Math.round(ms[0].importe), 22_984_870)
})

// ══ CONTRA LA PESTAÑA REAL: las 91 filas del 13/08, no un caso de laboratorio ═════════════════════

/** La foto real de Cobranzas con su encabezado en las posiciones del archivo (G, M, N, O, Q, AA). */
function hojaReal() {
  const enc = Array.from({ length: 27 }, () => '')
  enc[6] = 'Obra / Cliente'; enc[12] = 'TOTAL a cobrar (neto de retenciones)'
  enc[13] = 'Forma de Cobro'; enc[14] = 'Estado'; enc[16] = 'Fecha cobro'; enc[26] = 'Moneda'
  return [...Array.from({ length: DESDE - 2 }, () => []), enc, ...comoFilas()]
}

test('sobre las 91 filas reales: valuar mueve el total en $22.969.470 y en una sola fila', () => {
  // `tipoCambio: 1` reproduce EXACTAMENTE el defecto: es lo que hacía el extractor cuando no miraba la
  // columna "Moneda" —un dólar valía un peso—. La diferencia entre los dos totales es la plata que
  // faltaba en los dos Cash Flow, y sale de la pestaña de verdad, no de un fixture escrito para esto.
  const neto = (ms) => ms.reduce((a, m) => a + m.signo * m.importe, 0)
  const bien = deCobranzas(hojaReal(), CORTE, { tipoCambio: TC })
  const roto = deCobranzas(hojaReal(), CORTE, { tipoCambio: 1 })
  assert.equal(bien.length, roto.length, 'valuar no agrega ni borra movimientos: sólo corrige el monto')
  assert.equal(Math.round(neto(bien) - neto(roto)), 22_969_470)
  // Y toca UNA fila: la 62. Si mañana el archivo tuviera más filas en dólares, este número cambia y
  // el test lo va a decir — que es la conducta correcta para una foto que no se actualiza sola.
  const distintas = bien.filter((m, i) => m.importe !== roto[i].importe)
  assert.equal(distintas.length, 1)
  assert.equal(distintas[0].origen.fila, 62, 'Cobranzas f62 (ID 58): el anticipo de Quattropani')
  assert.equal(Math.round(distintas[0].importe), 22_984_870, 'el mismo número que publica Obras!D14')
})

test('un cobro en USD que se EXCLUYE se declara en pesos, como el resto del cuadro', () => {
  // Los excluidos son plata que no va a entrar y el dueño los lee sumados contra el cuadro. Uno en
  // dólares declarado en su moneda nativa haría que la suma de exclusiones no cerrara con nada.
  const excluidos = []
  const filas = hoja(['', 'QUATTROPANI', 'Cobrado', 15400, F_COBRO, F_COBRO, 'eCheq', 'ENDOSADO A X', 'USD'])
  const ms = deCobranzas(filas, CORTE, { tipoCambio: TC, excluidos })
  assert.equal(ms.length, 0)
  assert.equal(Math.round(excluidos[0].importe), 22_984_870)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FACTURADO NO ES COBRADO — el dueño, 21/08/2026
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La aclaración es del dueño y el extractor ya la respetaba (`/^cobrado$/` es exacto), pero NINGÚN
// test la fijaba: alcanzaba con que alguien relajara esa expresión a `/cobrad/` o agregara
// "Facturado" a una lista de estados cerrados para que $8.620.282 pasaran de proyectados a reales
// sin que nada gritara. Un criterio implementado y no protegido dura hasta la próxima edición.
//
// Y el modo de fallar es del lado caro: la plata aparecería como YA ENTRADA, así que ninguna vista
// de proyección la miraría, la escalera de cobranzas la daría por cerrada y CAJA la sumaría al
// disponible. Emitir la factura es un hecho del devengado; la caja se mueve cuando el cliente paga.
//
// Las dos filas reales al momento de escribir esto: MESSINA $7.228.782 con cobro previsto el
// 17/09/2026 y ARCOR $1.391.500 para el 12/10/2026. Verificado en `_MOVIMIENTOS`: las dos entran
// como PROYECTADO.

/** La fecha de cobro de las dos filas reales cae DESPUÉS del corte: son cobros que todavía no
 *  vencieron. Usar una fecha pasada las volvería VENCIDO —correcto, pero otra cosa— y taparía lo
 *  que estos tests miden, que es que NO son REAL. */
const F_FUTURA = CORTE + 27

/** La misma fila real, con el estado que se le quiera dar. */
const conEstado = (estado, importe = 7_228_782, fecha = F_FUTURA) =>
  ['', 'MESSINA', estado, importe, fecha, fecha, 'Transferencia', '', '']

test('FACTURADO no es COBRADO: entra como PROYECTADO, no como plata que ya está', () => {
  const [m] = deCobranzas(hoja(conEstado('Facturado')), CORTE, { tipoCambio: TC })
  assert.equal(m.estado, 'PROYECTADO',
    'una factura emitida se contó como cobrada: la plata aparece en caja sin que el cliente haya pagado')
  assert.equal(m.importe, 7_228_782)
})

test('los cuatro estados vivos se reducen a dos, y sólo «Cobrado» exacto es REAL', () => {
  const estadoDe = (e) => deCobranzas(hoja(conEstado(e)), CORTE, { tipoCambio: TC })[0]?.estado
  assert.equal(estadoDe('Cobrado'), 'REAL')
  assert.equal(estadoDe('Facturado'), 'PROYECTADO')
  assert.equal(estadoDe('Pendiente'), 'PROYECTADO')
  assert.equal(estadoDe('Proyectado'), 'PROYECTADO')
})

test('una cobranza NO cobrada con fecha ya pasada es VENCIDO — sigue sin ser plata que entró', () => {
  // El otro lado de la misma regla: vencido y proyectado son distintos entre sí, pero ninguno de
  // los dos es REAL. Lo que no puede pasar nunca es que una factura emitida cuente como cobrada.
  const [m] = deCobranzas(hoja(conEstado('Facturado', 7_228_782, CORTE - 6)), CORTE, { tipoCambio: TC })
  assert.equal(m.estado, 'VENCIDO')
  assert.notEqual(m.estado, 'REAL')
})

test('«Facturado» no se cuela por parecerse: la comparación es exacta, no por prefijo', () => {
  // Si la regla se relajara a /cobrad/, «Facturado — a cobrar» o «Por cobrar» entrarían como REAL.
  for (const e of ['Por cobrar', 'A cobrar', 'Facturado, a cobrar', 'cobrado parcial']) {
    assert.equal(deCobranzas(hoja(conEstado(e)), CORTE, { tipoCambio: TC })[0]?.estado, 'PROYECTADO',
      `"${e}" entró como REAL: la comparación dejó de ser exacta`)
  }
})
