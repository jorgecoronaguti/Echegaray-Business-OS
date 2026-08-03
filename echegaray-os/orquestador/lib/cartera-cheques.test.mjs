// Tests de la cartera viva. Herméticos: no hay red, ni base, ni Sheet.
//
// LO QUE ESTOS TESTS PROTEGEN es que el número de cartera de CAJA no vuelva a ser una copia. El
// defecto que motivó el módulo no daba error: CAJA mostraba $10.000.000 con $10.290.000 en cartera
// porque leía una celda con un importe pegado, y el calendario leía DOS CELDAS FIJAS ($C$47/$F$47),
// así que el segundo cheque de la cartera no entraba en ningún tramo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaCartera, formulaCuentaCartera, formulaCarteraTramo,
  formulaImporteEnCartera, formulaFechaDeCheque, formulaCanarioDetalle, rango, EN_CARTERA,
} from './cartera-cheques.mjs'
import { COL as R, FILA0 } from '../scripts/cheques-raw-pestana.mjs'

/** El paréntesis balanceado es la diferencia entre una fórmula y un #ERROR! en la pestaña real. */
const balanceada = (f) => {
  let n = 0
  let enTexto = false
  for (const c of String(f)) {
    if (c === '"') enTexto = !enTexto
    else if (!enTexto && c === '(') n++
    else if (!enTexto && c === ')') n--
    if (n < 0) return false
  }
  return n === 0 && !enTexto
}

const TODAS = () => [
  formulaCartera(), formulaCuentaCartera(),
  formulaCarteraTramo(null, 'TODAY()'), formulaCarteraTramo('TODAY()+7', 'TODAY()+14'),
  formulaCarteraTramo('MAX(TODAY()+14;EOMONTH(TODAY();1))', null),
  formulaImporteEnCartera('00000514'), formulaFechaDeCheque('00000514'),
  formulaCanarioDetalle(2, '$C$12', '$C$47:$C$48', '$C$28'),
]

test('EL RANGO ES ABIERTO: si entra un cheque más, la fórmula lo toma sin tocar nada', () => {
  assert.equal(rango(R.importe), `_CHEQUES_RAW!$G$${FILA0}:$G`)
  // Un rango CERRADO ($G$4:$G$12) es el defecto que se está arreglando: fosiliza en la fila 12.
  for (const f of TODAS()) assert.ok(!/\$[A-K]\$\d+:\$[A-K]\$\d+/.test(f.replace(/\$C\$\d+:\$C\$\d+/g, '')),
    `hay un rango cerrado sobre la réplica en: ${f}`)
})

test('la cartera son los RECIBIDOS EN CUSTODIA: ni lo depositado ni lo endosado', () => {
  const f = formulaCartera()
  assert.match(f, /^=SUMIFS\(_CHEQUES_RAW!\$G\$4:\$G;/)
  assert.match(f, /"recibido"/)
  assert.match(f, new RegExp(`"${EN_CARTERA}"`))
  // Un depositado YA es plata en el banco y un endosado ya salió: contarlos duplicaría la caja.
  assert.ok(!/Depositado|Endosado/.test(f))
})

test('CADA TRAMO ES (desde, hasta]: un cheque no puede caer en dos ni quedar sin tramo', () => {
  assert.equal(formulaCarteraTramo(null, 'TODAY()'),
    '=SUMIFS(_CHEQUES_RAW!$G$4:$G;_CHEQUES_RAW!$A$4:$A;"recibido";_CHEQUES_RAW!$H$4:$H;"En custodia";_CHEQUES_RAW!$F$4:$F;"<"&TODAY())')
  const medio = formulaCarteraTramo('TODAY()+7', 'TODAY()+14')
  assert.match(medio, /">="&TODAY\(\)\+7/)
  assert.match(medio, /"<"&TODAY\(\)\+14/)
  // El último tramo NO tiene techo: sin esto, un diferido a 2027 desaparece del calendario.
  const ultimo = formulaCarteraTramo('MAX(TODAY()+14;EOMONTH(TODAY();1))', null)
  assert.match(ultimo, /">="&MAX\(TODAY\(\)\+14;EOMONTH\(TODAY\(\);1\)\)/)
  assert.ok(!ultimo.includes('"<"&'), 'el tramo abierto no puede tener borde superior')
})

test('los BORDES son expresiones, no fechas: el calendario se mueve solo cada día', () => {
  for (const f of TODAS()) {
    assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(f), `hay una fecha pegada: ${f}`)
    assert.ok(!/\bDATE\(\d{4}/.test(f), `hay una fecha construida y congelada: ${f}`)
  }
})

test('el importe de una fila del detalle se APAGA cuando el cheque se deposita', () => {
  const f = formulaImporteEnCartera('00000514')
  assert.match(f, /"00000514"/)
  assert.match(f, /"En custodia"/, 'sin el estado adentro, el detalle seguiría mostrando plata que ya entró')
  // El número solo NO identifica un cheque: el tipo tiene que ir en la condición.
  assert.match(f, /"recibido"/)
})

test('la fecha de un cheque que no está da vacío, NO 31/12/1899', () => {
  const f = formulaFechaDeCheque('90020099')
  assert.match(f, /^=IF\(COUNTIFS\(/)
  assert.match(f, /=0;""/, 'un cero en una celda de fecha se dibuja como 1899 y se lee como un dato')
})

test('EL CANARIO: avisa cuando el detalle lista menos cheques que la cartera', () => {
  const f = formulaCanarioDetalle(1, '$C$12', '$C$47:$C$47', '$C$28')
  // Es EL caso real: la cartera pasó a 2 cheques y el detalle listaba 1.
  assert.match(f, /COUNTIFS\(_CHEQUES_RAW!\$A\$4:\$A;"recibido";_CHEQUES_RAW!\$H\$4:\$H;"En custodia"\)<>1/)
  assert.match(f, /la cartera son /)
  assert.match(f, /el detalle suma /, 'segundo caso: una fila pisada a mano')
  assert.match(f, /sin fecha de pago/, 'tercer caso: un valor que no entra en ningún tramo')
  assert.match(f, /✓ al día/)
})

test('CADA RAMA DEL CANARIO ENTRA EN LA COLUMNA: 300px son ~55 caracteres', () => {
  // Un aviso cortado no avisa. La primera versión decía "✓ el detalle coincide con _CHEQUES_RAW: 2
  // cheque(s) por $10.290.000" (67 caracteres) y en el render se veía "✓ el detalle coin".
  const f = formulaCanarioDetalle(2, '$C$12', '$C$47:$C$48', '$C$28')
  const textos = [...f.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((t) => /[⚠✓]/.test(t) || t.length > 12)
  assert.ok(textos.length >= 4, 'las cuatro ramas tienen su texto')
  for (const t of textos) assert.ok(t.length <= 46, `no entra en la columna (${t.length}): ${t}`)
})

test('el canario sin celda de calendario no inventa una comparación', () => {
  const f = formulaCanarioDetalle(2, '$C$12', '$C$47:$C$48')
  assert.ok(!f.includes('sin fecha de pago'), 'sin la celda del calendario, ese control no existe')
  assert.ok(balanceada(f))
})

test('TODAS las fórmulas están balanceadas y en locale es-AR (`;`, no `,`)', () => {
  for (const f of TODAS()) {
    assert.ok(f.startsWith('='), `no es una fórmula: ${f}`)
    assert.ok(balanceada(f), `paréntesis sin cerrar: ${f}`)
    // Una coma como separador de argumentos deja #ERROR! en un archivo es-AR. Las comas DENTRO de un
    // literal de texto son legítimas, así que se miran sólo las de afuera.
    const sinTexto = f.replace(/"[^"]*"/g, '""')
    assert.ok(!sinTexto.includes(','), `separador con coma (rompe en es-AR): ${f}`)
  }
})

test('nada de esto lee "Cheques Recibidos": esa pestaña es un registro, no la fuente', () => {
  // Sumar la pestaña de operaciones daba $119.230.000 contra $47.097.425,92 reales: el mismo valor
  // aparece como Aceptación, Custodia, Rescate y Depósito.
  for (const f of TODAS()) assert.ok(!/Cheques Recibidos|Cobranzas/.test(f), `no puede leer esa pestaña: ${f}`)
})
