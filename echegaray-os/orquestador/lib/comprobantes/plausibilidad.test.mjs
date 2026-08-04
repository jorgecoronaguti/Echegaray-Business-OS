// ¿ESTE DATO PUEDE SER CIERTO? — los límites del control, uno por uno.
//
// El caso que lo motivó está probado de punta a punta en
// `comunicacion/comprobantes/lectura-implausible.test.mjs`. Acá se prueban los BORDES, que es donde
// un control de plausibilidad se rompe: o suena en un comprobante legítimo —y entonces deja de
// leerse— o calla en uno imposible, que es cómo entró el de Barcelo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaPlausible, ivaPlausible, palabrasInventadas, ecoDelOcr, dudasDeLectura, BANDAS_IVA,
} from './plausibilidad.mjs'

const HOY = new Date('2026-08-04T21:48:00Z')
const con = (fecha) => fechaPlausible(fecha, { ahora: HOY })

// ── LA FECHA ────────────────────────────────────────────────────────────────

test('la fecha del comprobante real: 05/12/2003 no es una fecha, es un año mal leído', () => {
  const r = con('05/12/2003')
  assert.equal(r.verificable, true)
  assert.equal(r.plausible, false)
  assert.equal(r.leida, '05/12/2003', 'la evidencia viaja: sin ella no se puede declarar qué se leyó')
  assert.match(r.motivo, /23 años/)
  assert.equal(r.desde, '01/01/2025')
})

test('la ventana: hoy, ayer y el 1° de enero del año pasado entran', () => {
  for (const f of ['04/08/2026', '03/08/2026', '01/01/2025', '31/12/2025']) {
    assert.equal(con(f).plausible, true, `${f} tiene que ser plausible`)
  }
})

test('el día anterior a la ventana ya no entra — el borde es un borde', () => {
  assert.equal(con('31/12/2024').plausible, false)
  assert.equal(con('01/01/2025').plausible, true)
})

test('el futuro no es una fecha leída, con un día de tolerancia por el huso', () => {
  assert.equal(con('05/08/2026').plausible, true, 'un día adelante: el servidor está en UTC y el papel en AR')
  assert.equal(con('07/08/2026').plausible, false)
  assert.equal(con('04/08/2027').plausible, false)
})

test('sin fecha no opina: ese hueco ya lo cubre FALTA.FECHA y preguntarlo dos veces es peor', () => {
  assert.equal(con(null).verificable, false)
  assert.equal(con('').verificable, false)
  assert.equal(con('no se lee').verificable, false)
  assert.equal(con('31/02/2026').verificable, false, 'el 31 de febrero no existe: no es una fecha que juzgar')
})

// ── EL IVA ──────────────────────────────────────────────────────────────────

test('el IVA del comprobante real: $0,01 sobre $5.223,35 no es ninguna alícuota', () => {
  const r = ivaPlausible({ neto: 5223.35, iva: 0.01, otrosTributos: 0, total: 5223.36 })
  assert.equal(r.verificable, true)
  assert.equal(r.plausible, false)
  assert.match(r.motivo, /no se parece a ninguna alícuota/)
  assert.match(r.motivo, /2,5 · 5 · 10,5 · 21 · 27%/)
})

test('IVA CERO ES PLAUSIBLE: un tique B legítimamente no discrimina, y eso no es un error', () => {
  assert.equal(ivaPlausible({ neto: 5223.36, iva: 0, total: 5223.36 }).plausible, true)
  assert.equal(ivaPlausible({ neto: 5223.36, iva: null, total: 5223.36 }).plausible, true)
})

test('las cinco alícuotas pasan, y la mezcla 21 + 10,5 también', () => {
  const casos = [
    [100000, 2500], [100000, 5000], [100000, 10500], [100000, 21000], [100000, 27000],
    [100000, 15000], // renglones a las dos alícuotas: el promedio cae en el medio
  ]
  for (const [neto, iva] of casos) {
    assert.equal(ivaPlausible({ neto, iva, total: neto + iva }).plausible, true, `${iva} sobre ${neto}`)
  }
})

test('el redondeo por renglón no dispara nada: la tolerancia existe para eso', () => {
  assert.equal(ivaPlausible({ neto: 28479.30, iva: 5980.65, total: 34459.95 }).plausible, true)
  assert.equal(ivaPlausible({ neto: 28479.30, iva: 5981.00, total: 34460.30 }).plausible, true)
})

test('un dígito de más o de menos en el IVA dispara — salvo el que cae sobre otra alícuota', () => {
  assert.equal(ivaPlausible({ neto: 100000, iva: 210000, total: 310000 }).plausible, false, '210%')
  assert.equal(ivaPlausible({ neto: 100000, iva: 100, total: 100100 }).plausible, false, '0,1%')
  assert.equal(ivaPlausible({ neto: 100000, iva: 210, total: 100210 }).plausible, false, '0,21%')

  // ═══ EL LÍMITE DECLARADO DE ESTE CONTROL ═══
  //
  // $2.100 sobre $100.000 es el 2,1%, y el 2,5% ES una alícuota argentina. Este control NO puede
  // distinguir un 21% con un dígito comido de una compra legítima a la alícuota reducida: son el
  // mismo número. Lo que sí lo caza es la identidad aritmética —si el IVA cambia y el total no, la
  // suma deja de cerrar—, que es el control que corresponde y ya existe (`aritmetica.mjs`).
  //
  // Se deja escrito acá, en verde, para que nadie lo lea como un agujero descubierto más tarde: es
  // el precio de no molestar en toda compra a alícuota reducida.
  assert.equal(ivaPlausible({ neto: 100000, iva: 2100, total: 102100 }).plausible, true,
    '2,1% es indistinguible del 2,5%: acá no hay nada que afirmar')
})

test('sin subtotal se mide contra el neto QUE VA A LA CELDA: Total − IVA − otros', () => {
  // Un tique nunca imprime subtotal. Sin este camino el control no opinaría nunca sobre un tique,
  // que es justo el tipo de comprobante que más entra por el chat.
  const r = ivaPlausible({ neto: null, iva: 0.01, otrosTributos: 0, total: 5223.36 })
  assert.equal(r.verificable, true)
  assert.equal(r.plausible, false)
  assert.equal(r.neto, 5223.35)
})

test('una nota de crédito tiene la misma alícuota con los tres importes en negativo', () => {
  assert.equal(ivaPlausible({ neto: -567000, iva: -119070, total: -686070 }).plausible, true)
  // El IVA con el signo cambiado respecto del neto no es una alícuota: es un signo mal puesto, y en
  // este repo confundir una nota de crédito con una compra ya costó $41,9M.
  assert.equal(ivaPlausible({ neto: -567000, iva: 119070, total: -686070 }).plausible, false)
})

test('sin total ni neto no opina: no poder mirar no es haber mirado', () => {
  assert.equal(ivaPlausible({ iva: 5000 }).verificable, false)
  assert.equal(ivaPlausible({}).verificable, false)
  assert.equal(ivaPlausible({ neto: 0, iva: 100, total: 100 }).verificable, false)
})

test('las bandas cubren de 2 a 28,35% y dejan afuera el 0,0002% del caso real', () => {
  const dentro = (r) => BANDAS_IVA.some(([lo, hi]) => r >= lo && r <= hi)
  assert.equal(dentro(0.0002), false)
  assert.equal(dentro(21), true)
  assert.equal(dentro(14), true, 'la mezcla de alícuotas')
  assert.equal(dentro(35), false)
})

// ── EL ECO DEL NOMBRE MAL LEÍDO ─────────────────────────────────────────────

test('las palabras que el OCR inventó son las que el nombre corregido no tiene', () => {
  assert.deepEqual(palabrasInventadas('COMESTIBLES BARCELO', 'Combustibles Barcelo'), ['comestibles'])
  assert.deepEqual(palabrasInventadas('Combustibles Barcelo', 'Combustibles Barcelo'), [])
})

test('"Comestibles y bebidas" es el eco de "COMESTIBLES"; "Gasoil" no lo es', () => {
  const inv = palabrasInventadas('COMESTIBLES BARCELO', 'Combustibles Barcelo')
  assert.equal(ecoDelOcr('Comestibles y bebidas', inv).contaminado, true)
  assert.equal(ecoDelOcr('Gasoil grado 2', inv).contaminado, false)
  assert.equal(ecoDelOcr(null, inv).contaminado, false)
})

test('sin corrección de OCR no hay eco: comprarle cemento a "Cemento Avellaneda" es normal', () => {
  assert.equal(ecoDelOcr('Cemento Loma Negra x 25 kg', []).contaminado, false)
})

// ── LAS DUDAS DE UN ÍTEM ────────────────────────────────────────────────────

test('el reloj sale del momento en que se leyó la foto, no de cuando se dibuja el mensaje', () => {
  // El fajo vive en Postgres y el mensaje se vuelve a dibujar en cada click. Si la fecha se juzgara
  // contra "ahora", el mismo comprobante sería plausible hoy e imposible el año que viene.
  const item = { comprobante: { fecha: '01/03/2025', total: 1000 }, leidoEn: '2026-03-01T10:00:00Z' }
  assert.equal(dudasDeLectura(item).fecha, undefined)
  assert.ok(dudasDeLectura(item, { ahora: new Date('2028-03-01T10:00:00Z') }).fecha)
})

test('lo tipeado por una persona no se cuestiona — si no, corregir redispara el control', () => {
  const c = { fecha: '05/12/2003', neto: 5223.35, iva: 0.01, total: 5223.36 }
  const crudo = dudasDeLectura({ comprobante: c, leidoEn: HOY.toISOString() })
  assert.ok(crudo.fecha && crudo.iva)
  const tipeado = dudasDeLectura({
    comprobante: { ...c, fechaTipeada: true, ivaTipeado: true }, leidoEn: HOY.toISOString(),
  })
  assert.deepEqual(tipeado, {})
})
