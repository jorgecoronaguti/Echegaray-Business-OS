// EL EXTRACTOR DE CONTRATOS Y LA MONEDA — CONTRA LAS 91 FILAS DEL ARCHIVO REAL.
//
// Cada test de acá está escrito contra un DEFECTO concreto, no contra el código: si se afloja el
// marcador, si se suman los contratos repetidos, si se toma uno solo cuando la obra está partida o si
// el `0` de la col AA se trata como moneda, alguno se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contratoDeclarado, contratoDeObra, filasDeObra, normalizarMoneda, monedasDesconocidas, saldoDeObra,
  sumaConUSD, valuarEnPesos, MARCADOR_CONTRATO, contratoUsdDeclarado, sinCuentas, prefiereContratoUsd, valuarFilaCobranza,
  RANGO_COBRANZAS, IDX_MONEDA_COBRANZAS, COL_MONEDA_COBRANZAS, indiceDeColumna,
} from './cobranzas-contrato.mjs'
import { FILAS, COLUMNAS, comoFilas, DESDE } from './cobranzas-fixture.mjs'

const COLS = { cliente: 6, concepto: 8, oc: 7, moneda: 26 }
const filas = comoFilas()
const SF = ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ']

test('el contrato sale de la Orden de Compra, en las cuatro redacciones que usa el archivo', () => {
  assert.equal(contratoDeclarado('Anticipo inicio obra 50% $ 47.590.272 Cotización n°'), 47_590_272)
  assert.equal(contratoDeclarado('Resto 50% s/ total 47.590.272 — certificación quincenal 1/4'), 47_590_272)
  assert.equal(contratoDeclarado('Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9'), 97_650_000)
  assert.equal(contratoDeclarado('Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra'), 8_758_810)
  // El `$` pegado al número, que es como está escrito Playón.
  assert.equal(contratoDeclarado('Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC'), 65_000_000)
})

test('UN NÚMERO DE ORDEN DE COMPRA NO ES UN CONTRATO: sin marcador, no hay contrato', () => {
  // ESTE ES EL TEST QUE SOSTIENE TODO EL EXTRACTOR. La misma columna guarda números de OC de ocho
  // dígitos. Sin exigir el marcador, "OC 53239034" declararía un contrato de $53.239.034 en una fila
  // de ARCOR que no tiene contrato ninguno, y el saldo pendiente saldría creíble y falso — que es la
  // peor clase de defecto de este repo, porque no da error.
  for (const t of ['OC 53239034', 'OC 53241303 - 50%', '53312775 6A', '02-00002097', '00002-00001864',
    '53357412', 'Certificado 2', 'Certificado 3', 'Anticipo 50% inicio obra', 'SERVICIO DE METALURGIA', '']) {
    assert.equal(contratoDeclarado(t), null, `"${t}" no declara contrato`)
  }
  // Y contra el archivo entero: las 91 filas, sin excepción declarada a mano.
  const col = (f, L) => f[1 + COLUMNAS.indexOf(L)]
  const conNumeroSuelto = FILAS.filter((f) => /\d/.test(String(col(f, 'H'))) && !MARCADOR_CONTRATO.test(String(col(f, 'H'))))
  assert.ok(conNumeroSuelto.length >= 25, 'el archivo tiene números de OC de sobra para que esto signifique algo')
  for (const [n, , , oc] of conNumeroSuelto) assert.equal(contratoDeclarado(oc), null, `fila ${n}: "${oc}"`)
})

test('el punto es separador de miles y no decimal: es-AR o el contrato sale 47,59', () => {
  assert.equal(contratoDeclarado('s/ total 47.590.272'), 47_590_272)
  assert.notEqual(contratoDeclarado('s/ total 47.590.272'), 47.590272)
})

test('cinco filas que repiten el MISMO contrato declaran UNO, no cinco', () => {
  // Las 4 certificaciones de Pisos Industriales más su anticipo dicen las cinco $47.590.272. Sumarlas
  // daría $237.951.360 sobre un contrato de $47.590.272: un saldo pendiente de $190M inventado.
  const r = contratoDeObra(filas, COLS, { variantes: SF, needle: 'Pisos Industriales' }, DESDE)
  assert.equal(r.valores.length, 5, 'las cinco filas lo declaran')
  assert.equal(r.contrato, 47_590_272)
  assert.equal(r.partido, false)
  assert.deepEqual(r.valores.map((v) => v.fila), [66, 71, 72, 73, 74], 'y se sabe de qué filas salió')
})

test('una obra PARTIDA suma sus partes: Playón es blanco 65M + negro 37,5M', () => {
  // Quedarse con uno —el primero, el máximo— publicaría $65.000.000 de contrato sobre una obra de
  // $102.500.000 y un saldo pendiente de −$37.500.000 que no existe.
  const r = contratoDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' }, DESDE)
  assert.equal(r.contrato, 102_500_000)
  assert.equal(r.partido, true, 'y queda marcado como partido para que se pueda mirar')
  assert.deepEqual([...r.distintos].sort((a, b) => b - a), [65_000_000, 37_500_000])
  assert.equal(r.valores.length, 6, 'las seis filas de la obra lo declaran')
})

test('una obra sin contrato declarado da null, NUNCA cero', () => {
  // BSA no lo declara en ninguna de sus filas. Un 0 afirmaría que el contrato vale cero y el saldo
  // saldría −$14.120.243; null hace que la pestaña publique "—" y no afirme nada.
  const r = contratoDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'BSA' }, DESDE)
  assert.equal(r.contrato, null)
  assert.notEqual(r.contrato, 0)
  assert.deepEqual(r.valores, [])
})

test('Quattropani SÍ declara contrato — en las certificaciones, no en el anticipo', () => {
  // El anticipo dice sólo "Anticipo 50% inicio obra", sin monto: mirar esa fila sola lleva a concluir
  // que la obra no tiene contrato. Las 9 certificaciones lo dicen completo.
  const r = contratoDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], unica: true }, DESDE)
  assert.equal(r.contrato, 97_650_000)
  assert.equal(r.valores.length, 9)
  assert.deepEqual(r.valores.map((v) => v.fila), [84, 85, 86, 87, 88, 89, 90, 91, 92])
})

test('la regla `unica` toma TODAS las filas del cliente; si no, manda el texto', () => {
  // Es la regla del dueño (13/08): un cliente con UNA obra declarada ES esa obra. Sin ella el
  // anticipo de Quattropani —que no la nombra en ninguna columna— quedaba afuera.
  const conUnica = filasDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], unica: true })
  const porTexto = filasDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], needle: 'Salón Comercial' })
  assert.equal(conUnica.length, 13)
  assert.equal(porTexto.length, 9, 'por texto se pierden las 3 filas del anticipo y la del IVA')
  // MESSINA tiene dos obras: ahí NO se puede usar `unica` sin robarle filas a la otra.
  const playon = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' })
  const bsa = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'BSA' })
  assert.equal(playon.filter((i) => bsa.includes(i)).length, 0, 'ninguna fila cae en las dos obras')
})

test('la obra se reconoce por el Concepto O por la Orden de Compra, indistinto de mayúsculas', () => {
  // El anticipo de Playón nombra la obra sólo en la OC ("Playon de Azufre"), y con otra redacción que
  // el Concepto ("Playon Azufre"). Mirar una sola columna dejaba media obra afuera.
  const r = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' })
  assert.equal(r.length, 6)
})

test('la moneda vacía es PESOS, "USD" es dólares, y el 0 de formato NO es una moneda', () => {
  assert.equal(normalizarMoneda(''), 'ARS')
  assert.equal(normalizarMoneda(undefined), 'ARS')
  assert.equal(normalizarMoneda('USD'), 'USD')
  assert.equal(normalizarMoneda('usd'), 'USD')
  // Las filas ID 35 y 36 (LA ESTRELLA) tienen un 0 que la pestaña dibuja "$0,00": es formato de
  // moneda derramado sobre una columna categórica, y esas dos filas son en pesos.
  assert.equal(normalizarMoneda(0), 'ARS')
  assert.equal(normalizarMoneda('$0,00'), 'ARS')
})

test('una moneda que no se entiende NO se trata como pesos en silencio: se denuncia', () => {
  // Es la segunda mitad del defecto que se arregló. Repartir en "USD" y "todo lo demás" convierte al
  // segundo balde en un cajón de descarte: un "EUR" tipeado mañana entraría al total como pesos.
  assert.equal(monedasDesconocidas(filas, COLS.moneda, DESDE).length, 0, 'el archivo de hoy está limpio')
  const conEuro = filas.map((f, i) => (i === 3 ? Object.assign([...f], { 26: 'EUR' }) : f))
  const raras = monedasDesconocidas(conEuro, COLS.moneda, DESDE)
  assert.deepEqual(raras, [{ fila: DESDE + 3, valor: 'EUR' }])
})

test('el archivo real tiene UNA sola fila en dólares, y es la que el dueño señaló', () => {
  // La tupla se indexa por NOMBRE de columna, no contando comas: el 14/08 entró la `C` (Fecha
  // emisión) y un destructuring posicional pasó a leer la columna de al lado sin dar error.
  const col = (f, L) => f[1 + COLUMNAS.indexOf(L)]
  const enUSD = FILAS.filter((f) => normalizarMoneda(col(f, 'AA')) === 'USD')
  assert.equal(enUSD.length, 1)
  assert.equal(enUSD[0][0], 62, 'la fila 62 del archivo (ID 58): el anticipo de Quattropani')
  assert.equal(col(enUSD[0], 'J'), 15_400, 'U$S 15.400 — "Son 15.400 dólares", textual del dueño')
})

test('la suma con dólares no usa `<>USD` ni el atajo `×(TC−1)`: sólo criterios positivos', () => {
  const f = sumaConUSD({ rango: 'J:J', criterios: 'G:G;"X"', moneda: 'AA:AA', tc: 'TIPO_CAMBIO_USD' })
  assert.equal(f, 'SUMIFS(J:J;G:G;"X")-SUMIFS(J:J;G:G;"X";AA:AA;"USD")+SUMIFS(J:J;G:G;"X";AA:AA;"USD")*TIPO_CAMBIO_USD')
  // `<>USD` dependería de si Sheets considera que una celda VACÍA lo cumple — y 88 de las 91 filas la
  // tienen vacía: si no lo cumpliera, la pestaña quedaría casi en cero.
  assert.ok(!f.includes('<>'), 'ningún criterio negativo sobre la moneda')
  // `×(TC−1)` da el mismo número con un SUMIFS menos y RESTA el importe si el TC queda en blanco.
  assert.ok(!f.includes('-1)'), 'ningún atajo que cambie el signo cuando falta el tipo de cambio')
  assert.equal(f.split('SUMIFS(').length - 1, 3, 'todo, menos los dólares mal contados, más los valuados')
})

// ══ LA VALUACIÓN EN JAVASCRIPT: el otro lado de `sumaConUSD` ══════════════════════════════════════

/** El `TIPO_CAMBIO_USD` leído del archivo vivo el 13/08/2026. */
const TC = 1492.524

test('valuarEnPesos es la MISMA decisión que la fórmula: la fila real de Quattropani', () => {
  // La fila 62 del fixture: U$S 15.400. La fórmula de la pestaña la valúa multiplicando por
  // TIPO_CAMBIO_USD; acá se hace lo mismo, sobre la misma columna y con el mismo normalizador.
  const col = (f, L) => f[1 + COLUMNAS.indexOf(L)]
  const enUSD = FILAS.find(([f]) => f === 62)
  const v = valuarEnPesos(col(enUSD, 'J'), col(enUSD, 'AA'), TC)
  assert.equal(v.moneda, 'USD')
  assert.equal(v.tipoCambio, TC)
  assert.equal(Math.round(v.pesos), 22_984_870)
})

test('los pesos no se tocan, y el cero de formato de las filas 39/40 tampoco', () => {
  for (const celda of ['', undefined, 0, 'ARS']) {
    assert.deepEqual(valuarEnPesos(500000, celda, TC), { moneda: 'ARS', tipoCambio: 1, pesos: 500000 })
  }
  // Un importe negativo (el cobro devuelto) conserva su signo: el signo lo decide el llamador.
  assert.equal(valuarEnPesos(-96800, '', TC).pesos, -96800)
})

test('sin conversión posible NO hay importe: ni el nativo ni cero', () => {
  // Es la regla dura. Devolver el monto nativo sería repetir el defecto con otro código de moneda, y
  // devolver 0 borraría la venta del cuadro. El llamador tiene que abortar nombrando la fila.
  const rara = valuarEnPesos(8000, 'EUR', TC)
  assert.equal(rara.pesos, undefined)
  assert.equal(rara.moneda, null)
  assert.match(rara.motivo, /"EUR"/)
  for (const tc of [null, undefined, 0, -1, NaN, '1492,524']) {
    const sinTC = valuarEnPesos(15400, 'USD', tc)
    assert.equal(sinTC.pesos, undefined, `tc=${JSON.stringify(tc)}`)
    assert.match(sinTC.motivo, /tipo de cambio/)
  }
})

test('cuando la fila dice el saldo Y el precio, el contratado es el PRECIO', () => {
  // Mampostería es la única fila del archivo que distingue las dos cosas, y la distingue bien: el
  // "s/ total" es lo que queda por facturar y el "precio" es lo que vale la obra. Leyendo el saldo,
  // la pestaña publicaba $9.273.576 sobre una obra de $14.273.576 y su margen salía $5.000.000 peor.
  const t = 'Venta propia s/ total 9.273.576,40 — saldo de mampostería y cierre pádel'
    + ' (precio 14.273.576,40; 5.000.000 cobrados el 17/07 en la fila 50) — cobro íntegro al cierre'
  assert.equal(contratoDeclarado(t), 14_273_576.4)
  assert.notEqual(contratoDeclarado(t), 9_273_576.4, 'el saldo no es el contrato')
})

test('«ACTUALIZACIÓN DE PRECIOS» no declara ningún precio: el número tiene que estar pegado', () => {
  // Un marcador que enganchara la palabra suelta convertiría un concepto en un contrato inventado.
  assert.equal(contratoDeclarado('ACTUALIZACION DE PRECIOS OBRA CIVIL'), null)
  assert.equal(contratoDeclarado('Ajuste de precios según índice CAC'), null)
})

test('la obra cobrada entera se declara cobrada; la que tiene una fila pendiente, no', () => {
  // Regla del dueño (07/09/2026): la pestaña OBRAS es una herramienta de cobranza y una obra
  // íntegramente cobrada no admite ninguna decisión. Se mide por ESTADO, no comparando importes:
  // una obra en dólares o con retenciones nunca cierra al peso contra su contrato.
  const cols = { cliente: 0, concepto: 1, oc: 2, estado: 3 }
  const filas = [
    ['MESSINA', 'Pisos 120m2 - Anticipo 50%', 'OC 2097', 'Cobrado'],
    ['MESSINA', 'Pisos 120m2 - Restante 50%', 'OC 2097', 'Cobrado'],
    ['MESSINA', 'Playón Dilución — Anticipo', 'OC 2266', 'Pendiente'],
    ['MESSINA', 'Playón Dilución — Saldo', 'OC 2266', 'Cobrado'],
  ]
  const pisos = saldoDeObra(filas, cols, { variantes: ['MESSINA'], needle: 'Pisos 120m2' }, 5)
  assert.equal(pisos.cobrada, true)
  assert.deepEqual(pisos.pendientes, [])

  const dilucion = saldoDeObra(filas, cols, { variantes: ['MESSINA'], needle: 'Playón Dilución' }, 5)
  assert.equal(dilucion.cobrada, false, 'una sola fila pendiente la mantiene en la pestaña')
  assert.deepEqual(dilucion.pendientes, [7], 'y se sabe cuál es, para poder desmentirlo')
})

test('la obra SIN filas en Cobranzas NO se da por cobrada: esconderla afirmaría que se cobró', () => {
  // Es la diferencia entre "no debe nada" y "no sé nada de ella". Un `pendientes` vacío por falta de
  // datos sacaría de la pestaña justo a la obra de la que hay que preguntar.
  const cols = { cliente: 0, concepto: 1, oc: 2, estado: 3 }
  const r = saldoDeObra([['MESSINA', 'Otra cosa', '', 'Cobrado']], cols,
    { variantes: ['MESSINA'], needle: 'Obra que no está' }, 5)
  assert.equal(r.total, 0)
  assert.equal(r.cobrada, false)
})

test('CANCELAR cuenta como cerrada: una venta que dejó de existir no es plata por cobrar', () => {
  const cols = { cliente: 0, concepto: 1, oc: 2, estado: 3 }
  const filas = [['SF', 'Obra X', '', 'Cobrado'], ['SF', 'Obra X', '', 'CANCELAR']]
  assert.equal(saldoDeObra(filas, cols, { variantes: ['SF'], needle: 'Obra X' }, 5).cobrada, true)
})

// ═══ LA CUENTA ANOTADA AL PASO — H78 DE QUATTROPANI, 10/09/2026 ═══

/** El texto LITERAL de la celda H78 el día que la obra se publicó contratada en $1.504. */
const H78 = 'Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9 -  ($1503,6*USD3500)'

test('el TIPO DE CAMBIO anotado en una cuenta NO es el contrato de la obra (H78, defecto real)', () => {
  // Sin el saneo, `$1503,6` se leía como contrato en pesos, le ganaba al camino U$S×TC y Quattropani
  // salía contratada en $1.504 con margen −$39,1 M en OBRAS y en /clientes. Este test es ESE número.
  assert.equal(contratoDeclarado(H78), null, 'la cuenta no declara ningún contrato en pesos')
  assert.equal(contratoUsdDeclarado(H78), 63_000, 'el contrato de la fila sigue siendo U$S 63.000')
})

test('no alcanza con rechazar el número pegado al asterisco: el prefijo tampoco es un contrato', () => {
  // Un lookahead `(?!\s*[*×x])` deja que el motor retroceda y capture "1503" — un contrato de $1.503
  // en vez de uno de $1.504. Este test existe para que ese arreglo a medias dé rojo.
  assert.equal(contratoDeclarado('($1503,6*USD3500)'), null)
  assert.equal(contratoDeclarado('cert. 1/9 $1.512,262 x U$S 3.500'), null)
  assert.equal(contratoDeclarado('$ 1503,6 × 3500'), null)
})

test('la fila que SÓLO tiene la cuenta no declara un contrato en dólares de U$S 3.500', () => {
  assert.equal(contratoUsdDeclarado('certificación 1/9 - ($1503,6*USD3500)'), null)
})

test('sacar la cuenta NO desarma el resto del texto: el contrato en pesos se sigue leyendo', () => {
  // La contracara del test de arriba: el saneo tiene que ser quirúrgico. Si se comiera la fila entera,
  // las 22 filas que declaran contrato quedarían en null y el saldo pendiente desaparecería.
  assert.equal(contratoDeclarado('Anticipo 50% $95.000.000 s/ contrato — certificación 1/9 ($1503,6*USD3500)'),
    95_000_000)
  assert.equal(contratoDeclarado('Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9'), 97_650_000)
  assert.equal(contratoDeclarado('Anticipo inicio obra 50% $ 47.590.272 Cotización n°'), 47_590_272)
  assert.equal(sinCuentas('OC 02-00002097').trim(), 'OC 02-00002097', 'un número de OC no es una cuenta')
})

test('contratoDeObra sobre la fila de Quattropani devuelve el dólar y NINGÚN peso', () => {
  const cols = { cliente: 0, concepto: 1, oc: 2 }
  const c = contratoDeObra([['Quattropani', 'Certificación 1/9', H78]], cols,
    { variantes: ['Quattropani'], unica: true }, 78)
  assert.equal(c.contrato, null)
  assert.equal(c.contratoUsd, 63_000)
})

test('un contrato en pesos MENOR que su cifra en dólares es imposible: manda el dólar', () => {
  // Segunda línea de defensa, para la próxima anotación redactada de otra forma. El tipo de cambio es
  // mayor que uno, así que $1.504 nunca puede ser el mismo contrato que U$S 63.000.
  assert.equal(prefiereContratoUsd(1503.6, 63_000), true)
  assert.equal(prefiereContratoUsd(null, 63_000), true)
  assert.equal(prefiereContratoUsd(47_590_272, 63_000), false, 'el contrato en pesos real le sigue ganando')
  assert.equal(prefiereContratoUsd(95_000_000, null), false)
  assert.equal(prefiereContratoUsd(null, null), false)
})

// ═══ LA RÉPLICA DE COBRANZAS Y LA COLUMNA AA — DEFECTO DEL 10/09/2026 ═══

test('la fila en U$S entra a la réplica valuada, no con el número desnudo (fila 62, Quattropani)', () => {
  // `sync-cobranzas.mjs` leía `A5:R` y la columna "Moneda" es la AA: los U$S 15.400 de la fila 62 se
  // guardaban como $15.400 y el cobrado de la cuenta corriente daba $23.273.434 de menos.
  const v = valuarFilaCobranza(
    { monto_neto: 15_400, iva: null, retenciones: null, total_bruto: 15_400 }, 'USD', 1512.262)
  assert.equal(v.moneda, 'USD')
  assert.equal(v.tipoCambio, 1512.262)
  assert.equal(v.importes.total_bruto, 15_400 * 1512.262)
  assert.ok(v.importes.total_bruto > 23_000_000, 'son veintitrés millones de pesos, no quince mil')
  assert.equal(v.importes.iva, null, 'lo que no tiene importe sigue sin tenerlo: null no es cero')
})

test('la fila en pesos no se toca, y el tipo de cambio queda declarado en 1', () => {
  const v = valuarFilaCobranza({ monto_neto: 8_601_753, total_bruto: 10_408_121 }, '', 1512.262)
  assert.deepEqual(v, { moneda: 'ARS', tipoCambio: 1, importes: { monto_neto: 8_601_753, total_bruto: 10_408_121 } })
})

test('los cuatro importes de la fila se valúan JUNTOS: un total que no es la suma de sus partes es un cuadre roto', () => {
  const v = valuarFilaCobranza({ monto_neto: 100, iva: 21, retenciones: 1, total_bruto: 120 }, 'U$S', 1000)
  assert.deepEqual(v.importes, { monto_neto: 100_000, iva: 21_000, retenciones: 1_000, total_bruto: 120_000 })
  assert.equal(v.importes.monto_neto + v.importes.iva - v.importes.retenciones, v.importes.total_bruto)
})

test('sin tipo de cambio, o con una moneda que no se entiende, NO se devuelve ningún importe', () => {
  // Grabar el número nativo cuando no se puede valuar es exactamente el defecto que esto arregla.
  const sinTc = valuarFilaCobranza({ total_bruto: 15_400 }, 'USD', null)
  assert.equal(sinTc.importes, undefined)
  assert.match(sinTc.motivo, /tipo de cambio/)
  const rara = valuarFilaCobranza({ total_bruto: 100 }, 'EUR', 1512.262)
  assert.equal(rara.moneda, null)
  assert.equal(rara.importes, undefined)
})

test('el rango que replica Cobranzas LLEGA hasta la columna de la moneda: A5:R nunca la leía', () => {
  // Éste es el defecto entero, en una línea: la R es la columna 18 y la moneda es la 27. Mientras el
  // rango se escribía a mano, la columna declarada y la columna leída eran dos verdades distintas.
  assert.equal(IDX_MONEDA_COBRANZAS, 26)
  assert.equal(indiceDeColumna('A'), 0)
  assert.equal(indiceDeColumna('R'), 17, 'hasta donde llegaba el rango viejo')
  assert.ok(RANGO_COBRANZAS.includes(`A5:${COL_MONEDA_COBRANZAS}`), `el rango es ${RANGO_COBRANZAS}`)
  const hasta = /A5:([A-Z]+)/.exec(RANGO_COBRANZAS)[1]
  assert.ok(indiceDeColumna(hasta) >= IDX_MONEDA_COBRANZAS, 'el rango no puede quedarse corto de la moneda')
})
