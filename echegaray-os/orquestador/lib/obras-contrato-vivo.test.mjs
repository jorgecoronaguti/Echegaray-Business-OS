// LAS FÓRMULAS DE `OBRAS`, EVALUADAS SOBRE LAS 91 FILAS REALES DE COBRANZAS.
//
// POR QUÉ ESTE ARCHIVO EXISTE APARTE. `obras-grilla.test.mjs` prueba que la fórmula tiene la FORMA
// esperada — compara el texto que el generador emite contra el texto que el test espera, las dos
// puntas del mismo lado. Eso ya dejó pasar un `#ERROR!` a las siete obras del archivo del dueño, y
// dejó pasar durante toda la vida de la pestaña que U$S 15.400 se sumaran como $15.400: ninguna
// aserción de cadena puede ver que un total está corto.
//
// Acá se EVALÚA. `evaluar-formula-sheet.mjs` corre la fórmula en frío contra la foto del archivo
// (`cobranzas-fixture.mjs`) y el test compara NÚMEROS. Es lo más cerca de "lo que Sheets calcula"
// que se puede llegar sin tocar el Sheet real — y tocarlo desde un worktree ya borró una pestaña.
//
// LO QUE ESTE ARCHIVO NO PRUEBA, y hay que decirlo: que el rango con nombre `TIPO_CAMBIO_USD` exista
// en el archivo (lo verifica el escritor antes de publicar, leyéndolo), y que Sheets evalúe igual que
// este evaluador. Las columnas G (cita Compras) y H (INDEX/MATCH/ARRAYFORMULA) no se evalúan.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaObras, SIN_CONTRATO, saldoContratoMalPublicado } from './obras-grilla.mjs'
import { MONEDA_CUERPO } from './formato-statement.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { contratoDeObra } from './cobranzas-contrato.mjs'
import { comoHoja, comoFilas, DESDE } from './cobranzas-fixture.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'

/** El tipo de cambio leído del archivo el 13/08/2026 (rango con nombre `TIPO_CAMBIO_USD`). */
const TC = 1491.97
const COLS = { cliente: 6, concepto: 8, oc: 7, moneda: 26 }
const filas = comoFilas()
const HOY = new Date(Date.UTC(2026, 7, 13))

const ALIAS = { 'San Francisco': ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ'] }
const porCliente = OBRAS_FUTURAS.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())

/** Los contratos derivados igual que los deriva el escritor, sobre la foto del archivo. */
const contratos = new Map(OBRAS_FUTURAS.map((o) => [o.clave, contratoDeObra(filas, COLS, {
  variantes: ALIAS[o.cliente] ?? [o.cliente], needle: o.ventaTexto, unica: porCliente.get(o.cliente) === 1,
}, DESDE).contrato]))

const obras = OBRAS_FUTURAS.map((o) => ({ ...o, contrato: contratos.get(o.clave) }))
const g = grillaObras({ obras })
const bloque = (clave) => g.bloques.find((b) => b.clave === clave)
const cel = (ref) => {
  const [, L, n] = /^([A-Z]+)(\d+)$/.exec(ref)
  return g.filas[Number(n) - 1][L.charCodeAt(0) - 65]
}

/**
 * El valor que Sheets sacaría de esa celda, con el tipo de cambio que se le pase.
 *
 * LA PROPIA GRILLA VA COMO `hoja`, y no es un detalle: `Saldo contrato` es `=47590272-C18`, o sea que
 * lee una celda de al lado que a su vez es un SUMIFS sobre Cobranzas. Sin modelarla, C18 valía 0 y el
 * saldo daba el contrato entero — que es exactamente el número equivocado que el test tiene que
 * distinguir del correcto.
 */
const val = (ref, tc = TC) => evaluarFormula(cel(ref), {
  hoja: hojaDeGrilla(g.filas), hojas: { Cobranzas: comoHoja() }, nombres: { TIPO_CAMBIO_USD: tc }, hoy: HOY,
})

const redondo = (x) => Math.round(Number(x) * 100) / 100

test('LA VENTA DE QUATTROPANI CRECE $22.960.938 AL VALUAR LOS DÓLARES — el defecto, medido', () => {
  // La fila 62 de Cobranzas (ID 58) tiene Moneda=USD e importe 15.400. El dueño: *"Son 15.400
  // dólares"*. Antes de este arreglo la pestaña la sumaba como $15.400.
  const f = bloque('quattropani-salon-comercial').fProt
  const conTC = val(`C${f}`)
  const comoAntes = val(`C${f}`, 1) // TC = 1 es exactamente la conducta vieja: un dólar, un peso
  assert.equal(redondo(conTC - comoAntes), redondo(15_400 * (TC - 1)),
    'la diferencia es EXACTAMENTE el importe en dólares revaluado, ni un peso más')
  assert.equal(redondo(conTC), 133_211_023.38)
  assert.equal(redondo(comoAntes), 110_250_085.38)
  assert.ok(conTC - comoAntes > 22_900_000, 'no es un ajuste cosmético: son $22,9M de venta')
})

test('NINGUNA OTRA OBRA SE MUEVE: la conversión toca la fila en dólares y nada más', () => {
  // Un defecto plausible sería revaluar de más —por ejemplo si el criterio de moneda no filtrara— y
  // eso no daría error: daría números más grandes y creíbles en las siete obras.
  for (const b of g.bloques) {
    if (b.clave === 'quattropani-salon-comercial') continue
    assert.equal(val(`C${b.fProt}`), val(`C${b.fProt}`, 1), `${b.clave}: no tiene filas en dólares`)
  }
})

test('el CONTRATO de cada obra sale de Cobranzas, y seis de siete cierran EXACTO', () => {
  // Es la verificación cruzada que vale: el contrato lo declara el TEXTO de la Orden de Compra y la
  // venta sale de la columna de importes. Que den lo mismo prueba que el extractor leyó bien y que
  // están cargados todos los hitos — dos cosas que ninguna de las dos fuentes puede afirmar sola.
  const esperado = {
    'sf-pisos-industriales': 47_590_272,
    'sf-instalacion-electrica': 40_000_000,
    'sf-entrepiso-escalera': 7_728_254,
    'sf-mamposteria': 8_758_810,
    'messina-playon-azufre': 102_500_000,
    'messina-bsa': null,
    'quattropani-salon-comercial': 97_650_000,
  }
  assert.deepEqual(Object.fromEntries(contratos), esperado)
  for (const [clave, c] of Object.entries(esperado)) {
    if (c === null || clave === 'quattropani-salon-comercial') continue
    const f = bloque(clave).fProt
    assert.equal(redondo(val(`I${f}`)), 0, `${clave}: contrato − venta cargada = 0, no falta cargar nada`)
    assert.equal(redondo(val(`B${f}`)), 1, `${clave}: 100% del contrato cargado`)
  }
})

test('QUATTROPANI TIENE $35.561.023 CARGADOS POR ENCIMA DE SU CONTRATO, y se publica con el signo', () => {
  // No es un error de carga: el anticipo dice "(paga el 33% del 50%) + Materiales" y esos materiales
  // se facturan con margen fuera del contrato. Recortar el saldo con un MAX(0;…) escondería el único
  // caso de las siete obras donde el contrato NO explica lo facturado.
  const f = bloque('quattropani-salon-comercial').fProt
  assert.equal(redondo(val(`I${f}`)), -35_561_023.38)
  assert.ok(val(`I${f}`) < 0, 'sale negativo y así se publica')
  assert.ok(val(`B${f}`) > 1, 'el % de contrato pasa de 100 y eso ES la señal')
  // Y sin la conversión de dólares el hallazgo se veía $22,9M más chico: los dos arreglos se tocan.
  assert.equal(redondo(val(`I${f}`, 1)), -12_600_085.38)
})

test('la obra SIN contrato declarado publica el guion, no un cero ni un blanco', () => {
  const f = bloque('messina-bsa').fProt
  assert.equal(cel(`I${f}`), SIN_CONTRATO)
  assert.equal(cel(`B${f}`), SIN_CONTRATO)
  // Un 0 habría afirmado que el contrato vale cero, y el saldo sería −$14.120.243 de una obra que
  // simplemente no declara contrato en ninguna fila.
  assert.notEqual(cel(`I${f}`), 0)
})

test('el cierre de la Sección 2 no mezcla las obras con contrato y las que no lo declaran', () => {
  const fTot = g.totales[1]
  const conContrato = g.bloques.filter((b) => b.contrato)
  // El saldo del cierre es la suma de los saldos de las obras CON contrato: la de BSA no entra por
  // construcción, no porque Sheets ignore un texto (conducta que este worktree no puede verificar).
  assert.equal(cel(`I${fTot}`), `=${conContrato.map((b) => `I${b.fProt}`).join('+')}`)
  assert.ok(!cel(`I${fTot}`).includes(`I${bloque('messina-bsa').fProt}`), 'BSA no se cita')
  assert.equal(redondo(val(`I${fTot}`)), -35_561_023.38, 'y da el saldo de Quattropani, que es el único que no cierra')
  // El % del cierre usa los mismos dos lados que las filas: no puede meter la venta de BSA arriba y
  // dejarla afuera abajo. Con los 6 contratos que cierran + Quattropani por encima, pasa de 100%.
  const contratosTot = conContrato.reduce((s, b) => s + b.contrato, 0)
  assert.equal(contratosTot, 304_227_336)
  assert.equal(redondo(val(`B${fTot}`)), redondo((contratosTot + 35_561_023.38) / contratosTot))
})

test('el TOTAL 2026 de la Sección 1 también valúa los dólares: la venta del año sube igual', () => {
  // Si la corrección viviera sólo en las filas por obra, el cierre del año y la suma de sus clientes
  // dejarían de dar lo mismo — y el escritor abortaría con "SIN UBICAR". Peor: si abortara por esto,
  // se buscaría el problema en la lista de clientes.
  const fTot = g.totales[0]
  assert.equal(redondo(val(`C${fTot}`) - val(`C${fTot}`, 1)), redondo(15_400 * (TC - 1)))
  const fQ = g.filaDeCliente['Quattropani - Melisa García SAS']
  assert.equal(redondo(val(`C${fQ}`)), redondo(val(`C${bloque('quattropani-salon-comercial').fProt}`)),
    'el cliente tiene una sola obra: su fila y la de la obra tienen que dar lo MISMO')
})

test('la resta de la fila de cierre va entre paréntesis: sin ellos restaría un tercio de lo que debe', () => {
  // Desde que cada suma vale `todo − dólares + dólares×TC`, un `A-B` sin agrupar restaría sólo el
  // primer término de B y SUMARÍA los otros dos. No da error: da un número creíble.
  const fTot = g.totales[0]
  const resta = cel(`E${fTot}`)
  assert.ok(resta.startsWith('=(') && resta.includes(')-('), 'los dos lados agrupados')
  assert.equal(redondo(val(`E${fTot}`)), redondo(val(`C${fTot}`) - val(`C${fTot}`) + val(`E${fTot}`)))
  // La identidad que importa: cobrado + resta = todo lo no cancelado, al total.
  assert.ok(val(`D${fTot}`) > 0 && val(`E${fTot}`) > 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CERO Y EL "SIN CONTRATO" SE DIBUJAN IGUAL — 13/08
//
// El control de la columna I abortó la publicación de cinco obras sanas (Pisos, Instalación
// Eléctrica, Entrepiso, Mampostería y Playón de Azufre) diciendo que "la I quedó —". La I estaba
// perfecta: tenía `=47590272-C18`, y como esas obras están 100% facturadas el resultado es CERO —
// que `MONEDA_CUERPO` ('#,##0;(#,##0);"—"') dibuja con el mismo guion que `SIN_CONTRATO`.
//
// Estos tests fijan que el control mire la FÓRMULA, donde los dos casos no se pueden confundir.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('saldo CERO no es "sin contrato": la obra 100% facturada pasa el control', () => {
  const bloques = [{ clave: 'sf-pisos-industriales', fProt: 18, contrato: 47590272 }]
  const formulas = []
  formulas[17] = ['2.1 · San Francisco — PISOS', '=C18/47590272', 47590272, '', '', '', '', '', '=47590272-C18']
  assert.deepEqual(saldoContratoMalPublicado(bloques, formulas), [])
  // Y ÉSTA es la aserción que el control viejo no podía hacer: leyendo lo que se VE, el saldo cero
  // y el sin-contrato son el mismo carácter. Por eso este control no puede mirar la pantalla.
  assert.equal(MONEDA_CUERPO.pattern.split(';')[2], '"—"')
})

test('la I pegada a mano NO pasa, aunque muestre el número correcto', () => {
  const bloques = [{ clave: 'sf-pisos-industriales', fProt: 18, contrato: 47590272 }]
  const pegada = []
  pegada[17] = ['2.1', '=C18/47590272', 47590272, '', '', '', '', '', 0] // el valor correcto, muerto
  const malas = saldoContratoMalPublicado(bloques, pegada)
  assert.equal(malas.length, 1)
  assert.match(malas[0], /en vez de la fórmula viva "=47590272-C18"/)
})

test('la I con la fórmula de OTRA obra no pasa: el número tiene que ser el de ESTA', () => {
  const bloques = [{ clave: 'sf-instalacion-electrica', fProt: 24, contrato: 40000000 }]
  const cruzada = []
  cruzada[23] = ['2.2', '', '', '', '', '', '', '', '=47590272-C24'] // el contrato del vecino
  assert.equal(saldoContratoMalPublicado(bloques, cruzada).length, 1)
  // Y la fila equivocada tampoco: si la fórmula apunta a otra C, la resta no es de esta obra.
  const otraFila = []
  otraFila[23] = ['2.2', '', '', '', '', '', '', '', '=40000000-C18']
  assert.equal(saldoContratoMalPublicado(bloques, otraFila).length, 1)
})

test('sin contrato declarado, la I lleva el guion y NADA más', () => {
  const bloques = [{ clave: 'bsa', fProt: 40, contrato: null }]
  const guion = []; guion[39] = ['2.7 · BSA', '—', '', '', '', '', '', '', '—']
  assert.deepEqual(saldoContratoMalPublicado(bloques, guion), [])
  // Un cero publicado ahí afirmaría que el contrato vale cero: eso sí es un defecto.
  const cero = []; cero[39] = ['2.7 · BSA', '—', '', '', '', '', '', '', 0]
  assert.equal(saldoContratoMalPublicado(bloques, cero).length, 1)
  // Y una celda vacía tampoco: es indistinguible de una fórmula que se rompió en silencio.
  const vacia = []; vacia[39] = ['2.7 · BSA', '—', '', '', '', '', '', '', '']
  assert.equal(saldoContratoMalPublicado(bloques, vacia).length, 1)
})

test('la fila que no se pudo releer se denuncia, no se da por buena', () => {
  const bloques = [{ clave: 'messina-playon-azufre', fProt: 44, contrato: 102500000 }]
  assert.equal(saldoContratoMalPublicado(bloques, []).length, 1, 'sin relectura no hay verificación')
})
