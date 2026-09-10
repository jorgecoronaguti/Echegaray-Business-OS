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
import { grillaObras, SIN_CONTRATO, contratoMalPublicado } from './obras-grilla.mjs'
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
  // 07/09/2026: la columna «Certificado» salió con el rediseño de dos cuadros. La fila en dólares
  // está COBRADA, así que la revaluación se mide donde sigue publicándose: la E.
  const f = bloque('quattropani-salon-comercial').fProt
  const conTC = val(`E${f}`)
  const comoAntes = val(`E${f}`, 1) // TC = 1 es exactamente la conducta vieja: un dólar, un peso
  assert.equal(redondo(conTC - comoAntes), redondo(15_400 * (TC - 1)),
    'la diferencia es EXACTAMENTE el importe en dólares revaluado, ni un peso más')
  assert.equal(redondo(conTC), 95_784_757.31)
  assert.equal(redondo(comoAntes), 72_823_819.31)
  assert.ok(conTC - comoAntes > 22_900_000, 'no es un ajuste cosmético: son $22,9M')
})

test('NINGUNA OTRA OBRA SE MUEVE: la conversión toca la fila en dólares y nada más', () => {
  // Un defecto plausible sería revaluar de más —por ejemplo si el criterio de moneda no filtrara— y
  // eso no daría error: daría números más grandes y creíbles en las siete obras.
  for (const b of g.bloques) {
    if (b.clave === 'quattropani-salon-comercial') continue
    assert.equal(val(`E${b.fProt}`), val(`E${b.fProt}`, 1), `${b.clave}: no tiene filas en dólares`)
  }
})

test('el CONTRATO de cada obra sale de Cobranzas, y las que lo declaran cierran EXACTO', () => {
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
    // LAS TRES DE MESSINA QUE ENTRARON EL 07/09 van en `null` acá y NO es un descuido: el fixture de
    // Cobranzas de este test es el de agosto y todavía no tiene sus filas. En la Cobranzas REAL las
    // tres sí declaran contrato (OC 2266 $20.090.868 · OC 2256 $10.000.000 · OC 2097+2226
    // $9.463.142). Lo que este test prueba es el EXTRACTOR —que lee el contrato del texto de la OC y
    // lo cruza contra los importes—, no que el fixture esté al día: clavar acá los importes reales
    // sin sus filas en el fixture haría pasar el test por una coincidencia, no por la regla.
    'messina-playon-dilucion-acido': null,
    'messina-adicional-tercer-muro': null,
    'messina-pisos-120-rampa': null,
  }
  assert.deepEqual(Object.fromEntries(contratos), esperado)
  for (const [clave, c] of Object.entries(esperado)) {
    if (c === null || clave === 'quattropani-salon-comercial') continue
    const f = bloque(clave).fProt
    // «Falta certificar» y «% cert.» salieron el 07/09/2026 con el rediseño de dos cuadros: eran la
    // magnitud INTERMEDIA entre el contrato y el cobro, y el dueño se quedó con las dos puntas. Lo
    // que la pestaña sigue afirmando —y lo que este test verifica— es que el contrato publicado es
    // el que el extractor leyó del texto de la Orden de Compra, sin retoques.
    assert.equal(val(`D${f}`), c, `${clave}: el contrato se publica en su propia celda`)
  }
})

test('QUATTROPANI COBRÓ Y TIENE POR COBRAR MÁS QUE SU CONTRATO, y la pestaña lo deja ver', () => {
  // No es un error de carga: el anticipo dice "(paga el 33% del 50%) + Materiales" y esos materiales
  // se facturan con margen fuera del contrato. Es el único caso de las obras declaradas donde el
  // contrato NO explica lo facturado, y era la razón de ser de la columna «Saldo contrato».
  //
  // ESA COLUMNA SALIÓ (07/09/2026) y hay que decir qué se perdió: la pestaña ya no publica el saldo
  // con su signo. Lo que SÍ se sigue viendo, y es la misma señal leída en las tres columnas que
  // quedaron: cobrado + por cobrar pasa el contratado.
  const f = bloque('quattropani-salon-comercial').fProt
  const excedente = val(`E${f}`) + val(`F${f}`) - val(`D${f}`)
  assert.equal(redondo(excedente), 63_723_007.31)
  assert.ok(excedente > 0, 'la obra facturó por encima de su contrato y las tres columnas lo muestran')
  // Y sin la conversión de dólares el excedente se veía $22,9M más chico: los dos arreglos se tocan.
  assert.equal(redondo(val(`E${f}`, 1) + val(`F${f}`, 1) - val(`D${f}`, 1)), redondo(excedente - 15_400 * (TC - 1)))
})

test('la obra SIN contrato declarado publica la suma VIVA de sus filas, no el guion', () => {
  // BSA no declara contrato en ninguna fila: factura "50% + 50%" de la OC 279 más un adicional
  // íntegro de la OC 1985. El guion era honesto pero dejaba media columna vacía y el dueño la
  // rechazó dos veces; la suma de sus propias filas ES el precio mientras estén todas cargadas.
  //
  // LA INFERENCIA QUEDA DICHA, no escondida: éste es el único de los tres caminos que SUPONE algo
  // —que la obra tiene todos sus hitos cargados—, y por eso el escritor imprime en cada corrida qué
  // obras cayeron acá y con qué filas, para poder desmentirlo mirando Cobranzas.
  const f = bloque('messina-bsa').fProt
  const d = cel(`D${f}`)
  assert.ok(String(d).startsWith('=SUMIFS'), `la D de BSA es la suma viva y quedó "${d}"`)
  assert.notEqual(d, SIN_CONTRATO, 'ya no publica el guion')
  assert.notEqual(d, 0, 'un 0 afirmaría que el contrato vale cero')
})

test('el cierre del contratado suma las DIEZ obras, porque las diez publican un número', () => {
  const fTot = g.fTotObras
  // Antes citaba sólo las que declaraban contrato y BSA quedaba afuera: el cierre valía $304.227.336
  // sobre una cartera de diez obras de las que cinco no aparecían. Ahora las diez publican —número,
  // «U$S × TC» o suma viva— y el cierre es el valor de la cartera entera.
  assert.equal(cel(`D${fTot}`), `=${g.bloques.map((b) => `D${b.fProt}`).join('+')}`)
  assert.ok(cel(`D${fTot}`).includes(`D${bloque('messina-bsa').fProt}`), 'BSA ahora sí se cita')
  const declarado = g.bloques.reduce((s, b) => s + (b.contrato ?? 0), 0)
  assert.equal(declarado, 304_227_336, 'lo declarado en Cobranzas no cambió')
  assert.ok(val(`D${fTot}`) > declarado, 'y el cierre ahora incluye además las obras sin declaración')
})

test('el cuadro del año también valúa los dólares: el vendido y el cobrado suben igual', () => {
  // Si la corrección viviera sólo en las filas por obra, el cuadro de arriba publicaría un año más
  // chico que la suma de sus obras — y el control de doble conteo del escritor abortaría por eso,
  // mandando a buscar el problema donde no está.
  assert.equal(redondo(val(`D${g.fAno}`) - val(`D${g.fAno}`, 1)), redondo(15_400 * (TC - 1)), 'vendido')
  assert.equal(redondo(val(`E${g.fAno}`) - val(`E${g.fAno}`, 1)), redondo(15_400 * (TC - 1)), 'cobrado')
  // Y las obras caben dentro del año, que es la invariante que el escritor verifica sobre lo publicado.
  assert.ok(val(`E${g.fTotObras}`) <= val(`E${g.fAno}`) + 1)
  assert.ok(val(`F${g.fTotObras}`) <= val(`F${g.fAno}`) + 1)
})

test('la resta de la fila de cierre va entre paréntesis: sin ellos restaría un tercio de lo que debe', () => {
  // Desde que cada suma vale `todo − dólares + dólares×TC`, un `A-B` sin agrupar restaría sólo el
  // primer término de B y SUMARÍA los otros dos. No da error: da un número creíble.
  const fAno = g.fAno
  const resta = cel(`F${fAno}`)
  assert.ok(resta.startsWith('=(') && resta.includes(')-('), 'los dos lados agrupados')
  // La identidad que importa: cobrado + por cobrar > 0 al total del año.
  assert.ok(val(`E${fAno}`) > 0 && val(`F${fAno}`) > 0)
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

test('el contrato se verifica sobre la FÓRMULA de la D, no sobre lo que se ve', () => {
  const bloques = [{ clave: 'sf-pisos-industriales', fProt: 10, contrato: 47590272 }]
  const publicado = []
  publicado[9] = ['2.1 · San Francisco — PISOS', 46239, 46295, 47590272, '', '', '', '', '']
  assert.deepEqual(contratoMalPublicado(bloques, publicado), [])
  // LA RAZÓN POR LA QUE ESTE CONTROL NO PUEDE MIRAR LA PANTALLA: `MONEDA_CUERPO` dibuja el CERO con
  // el mismo guion que `SIN_CONTRATO`, así que un contrato de $0 y una obra sin contrato son el
  // mismo carácter. Leyendo lo que se ve, el control abortó cinco obras sanas una vez.
  assert.equal(MONEDA_CUERPO.pattern.split(';')[2], '"—"')
})

test('el contrato de OTRA obra no pasa: el número tiene que ser el de ÉSTA', () => {
  const bloques = [{ clave: 'sf-instalacion-electrica', fProt: 11, contrato: 40000000 }]
  const cruzada = []
  cruzada[10] = ['2.2', 46244, 46311, 47590272, '', '', '', '', ''] // el contrato del vecino
  const malas = contratoMalPublicado(bloques, cruzada)
  assert.equal(malas.length, 1)
  assert.match(malas[0], /contrato \$40\.000\.000 y la D quedo "47590272"/)
})

test('sin contrato declarado, la D tiene que ser la suma viva — y el control lo puede negar', () => {
  const bloques = [{ clave: 'bsa', fProt: 15, contrato: null, contratoUsd: null }]
  const viva = []; viva[14] = ['2.6 · BSA', 46232, 46255, '=SUMIFS(Cobranzas!J:J;...)', '', '', '', '', '']
  assert.deepEqual(contratoMalPublicado(bloques, viva), [])
  // Un guion vuelve a dejar la columna vacía; un cero AFIRMA que el contrato vale cero; una celda
  // en blanco es indistinguible de una fórmula que se rompió en silencio. Los tres son defectos.
  for (const publicado of ['—', 0, '']) {
    const fila = []; fila[14] = ['2.6 · BSA', 46232, 46255, publicado, '', '', '', '', '']
    assert.equal(contratoMalPublicado(bloques, fila).length, 1, `"${publicado}" tiene que denunciarse`)
  }
})

test('el contrato en DÓLARES se publica como fórmula, y pegarlo en pesos se denuncia', () => {
  // Quattropani declara "Resto 50% s/ contrato U$S 63.000 + IVA". Valuarlo en el escritor lo
  // congelaría al dólar del día de la corrida: el contrato de una obra en dólares se mueve con el
  // dólar, y la pestaña ya tiene el TC en el título del cuadro.
  const bloques = [{ clave: 'quattropani', fProt: 20, contrato: null, contratoUsd: 63_000 }]
  const conFormula = []; conFormula[19] = ['2.7', 46262, 46396, '=63000*Datos!B2', '', '', '', '', '']
  assert.deepEqual(contratoMalPublicado(bloques, conFormula), [])
  const pegado = []; pegado[19] = ['2.7', 46262, 46396, 95_060_720, '', '', '', '', '']
  assert.equal(contratoMalPublicado(bloques, pegado).length, 1, 'un número pegado se congela: es defecto')
})

test('la fila que no se pudo releer se denuncia, no se da por buena', () => {
  const bloques = [{ clave: 'messina-playon-azufre', fProt: 44, contrato: 102500000 }]
  const malas = contratoMalPublicado(bloques, [])
  assert.ok(malas.length >= 1, 'sin relectura no hay verificación: tiene que denunciar')
  assert.ok(malas.every((m) => m.startsWith('messina-playon-azufre:')), 'y decir de qué obra habla')
})

test('LA CUENTA ANOTADA EN LA OC NO BAJA EL CONTRATO DE QUATTROPANI A $1.504 — cadena completa', () => {
  // EL DEFECTO REAL, verificado contra el Sheet vivo el 10/09/2026: la obra se publicó CONTRATADA EN
  // $1.504, con margen −$39,1 M, en la pestaña OBRAS y en /clientes.
  //
  // LA FOTO ES DEL 13/08 Y AHÍ QUATTROPANI DECLARABA PESOS ("s/ contrato 97.650.000"). La redacción
  // de HOY —dólares, y la cuenta del día pegada al final— se inyecta sobre la foto y se dice: lo que
  // se prueba es la CADENA (extractor → grilla → celda D evaluada), no la foto.
  const H78 = 'Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9 -  ($1503,6*USD3500)'
  const anotada = comoFilas().map((r) => {
    if (!String(r[COLS.oc]).startsWith('Resto 50% s/ contrato 97.650.000')) return r
    const f = [...r]
    f[COLS.oc] = String(r[COLS.oc]).endsWith('1/9') ? H78 : String(r[COLS.oc]).replace('97.650.000', 'U$S 63.000')
    return f
  })
  assert.ok(anotada.some((r) => String(r[COLS.oc]) === H78), 'la fila con la anotación está puesta')

  const q = OBRAS_FUTURAS.find((o) => o.clave === 'quattropani-salon-comercial')
  const c = contratoDeObra(anotada, COLS, { variantes: [q.cliente], needle: q.ventaTexto, unica: true }, DESDE)
  assert.equal(c.contrato, null, 'el tipo de cambio anotado no es un contrato en pesos')
  assert.equal(c.contratoUsd, 63_000)

  const g2 = grillaObras({ obras: OBRAS_FUTURAS.map((o) => (o.clave === 'quattropani-salon-comercial'
    ? { ...o, contrato: c.contrato, contratoUsd: c.contratoUsd }
    : { ...o, contrato: contratos.get(o.clave) })) })
  const b = g2.bloques.find((x) => x.clave === 'quattropani-salon-comercial')
  const publicado = evaluarFormula(g2.filas[b.fProt - 1][3], {
    hoja: hojaDeGrilla(g2.filas), hojas: { Cobranzas: comoHoja() }, nombres: { TIPO_CAMBIO_USD: TC }, hoy: HOY,
  })
  assert.equal(redondo(publicado), redondo(63_000 * TC))
  assert.ok(publicado > 90_000_000, `la obra vale noventa y pico de millones y publicó ${publicado}`)
  // Y el control de publicación tiene que estar de acuerdo con la celda que el generador emitió: si
  // no, el escritor abortaría por publicar bien.
  assert.deepEqual(contratoMalPublicado([b], g2.filas), [])
})
