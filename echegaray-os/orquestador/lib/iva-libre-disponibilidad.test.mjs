// Lo que estos tests fijan es el DEFECTO, no el código: cada uno rompe si se revierte el arreglo.
//
// El defecto grande no era aritmético sino de cableado —la proyección se calculaba y se tiraba— así
// que hay tests de las dos clases: los que prueban la cuenta y los que prueban que el número LLEGA a
// una celda (que las columnas de agosto a diciembre dejen de estar vacías y que la cadena del saldo
// mire al mes anterior de verdad).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alicuotaValida, factorIvaSobreBruto, proyectarLibreDisponibilidad, mesEnQueSeAgota,
  formulaDebitoProyectado, formulaCreditoProyectado, formulaAPagarProyectado,
  formulaLibreDispProyectada, supuestoDelMes, RANGO_ALICUOTA_IVA, periodoDe,
  anclaDeProyeccion, esNumero, aNumero,
} from './iva-libre-disponibilidad.mjs'

const A = 0.21

test('sin alícuota declarada NO se proyecta — antes que inventar un 21%, romper', () => {
  const f = [{ periodo: '2026-08', base_debito: 100, base_credito: 0, supuesto: 's' }]
  assert.throws(() => proyectarLibreDisponibilidad([], f, undefined), /alícuota no declarada/)
  assert.throws(() => proyectarLibreDisponibilidad([], f, 0), /alícuota no declarada/)
  // 21 en vez de 0,21: el error de tipeo que multiplicaría el impuesto por cien.
  assert.throws(() => proyectarLibreDisponibilidad([], f, 21), /alícuota no declarada/)
  assert.equal(alicuotaValida(0.21), true)
  assert.equal(alicuotaValida(21), false)
})

test('el IVA se extrae del bruto con a/(1+a), no con a — si no, sobreestima un 21%', () => {
  // Un cobro de $121.000 contiene $21.000 de IVA, no $25.410.
  assert.equal(Math.round(121000 * factorIvaSobreBruto(A)), 21000)
  assert.notEqual(Math.round(121000 * factorIvaSobreBruto(A)), Math.round(121000 * A))
})

test('el saldo a favor absorbe la posición y NO se vuelve negativo', () => {
  const reales = [{ periodo: '2026-07', debito: 0, credito: 0, libre_disp: 1000 }]
  // Un mes con débito muy superior: se paga la diferencia y el saldo queda en CERO, no en -X.
  const p = proyectarLibreDisponibilidad(reales, [
    { periodo: '2026-08', base_debito: 121000 * 10, base_credito: 0, supuesto: 's' },
    { periodo: '2026-09', base_debito: 121000, base_credito: 0, supuesto: 's' },
  ], A)
  const ago = p.find((x) => x.periodo === '2026-08')
  assert.equal(Math.round(ago.a_pagar_efectivo), 210000 - 1000)
  assert.equal(ago.libre_disp, 0)
  // Sin el MAX(0), septiembre arrastraría un saldo negativo y pagaría de MENOS.
  const sep = p.find((x) => x.periodo === '2026-09')
  assert.equal(Math.round(sep.a_pagar_efectivo), 21000)
})

test('la libre disponibilidad DECLARADA en la DDJJ manda sobre la recalculada', () => {
  // La DDJJ dice 7.050.036 aunque débito−crédito diera otra cosa: el número oficial no se recalcula.
  const p = proyectarLibreDisponibilidad(
    [{ periodo: '2026-07', debito: 23623112, credito: 11328238, libre_disp: 7050036 }], [], A)
  assert.equal(p[0].libre_disp, 7050036)
  assert.equal(p[0].es_proyeccion, false)
})

test('todo mes proyectado viaja marcado y con su supuesto — nunca como HECHO', () => {
  const p = proyectarLibreDisponibilidad(
    [{ periodo: '2026-07', debito: 0, credito: 0, libre_disp: 0 }],
    [{ periodo: '2026-08', base_debito: 121, base_credito: 0, supuesto: 'de las cobranzas esperadas' }], A)
  const ago = p[1]
  assert.equal(ago.es_proyeccion, true)
  assert.match(ago.supuesto, /cobranzas esperadas/)
  assert.equal(p[0].es_proyeccion, false)
})

// ── EL CASO REAL, CON LOS NÚMEROS DEL SHEET AL 04/08/2026 ────────────────────────────────────────
// Es la regresión que importa: si alguien vuelve a dejar los meses futuros sin proyectar, o rompe el
// arrastre, este test deja de decir "agosto" y el cuadro vuelve a mostrar $0 de IVA hasta diciembre.
test('con los datos reales, el saldo a favor se agota en AGOSTO 2026', () => {
  // "Impuestos y Financieros"!H16/H17/H19 — julio, ya cargado en el Sheet.
  const reales = [{ periodo: '2026-07', debito: 23623112, credito: 11328238, libre_disp: 7050036 }]
  // "Cash Flow Mensual" filas 6+10 (cobranzas) y 24+25+29+30 (compras CON factura), ago→dic.
  const futuros = [
    { periodo: '2026-08', base_debito: 20135520 + 151317518, base_credito: 47201626 + 0 + 928365 + 0, supuesto: 's' },
    { periodo: '2026-09', base_debito: 139009021, base_credito: 27466989 + 1894491 + 3596056 + 966695, supuesto: 's' },
    { periodo: '2026-10', base_debito: 26084250, base_credito: 27933928 + 1926697 + 3657189 + 983129, supuesto: 's' },
    { periodo: '2026-11', base_debito: 13128500, base_credito: 28408805 + 1959451 + 3719361 + 999842, supuesto: 's' },
    { periodo: '2026-12', base_debito: 13128500, base_credito: 28920163 + 1994721 + 3786309 + 1017839, supuesto: 's' },
  ]
  const p = proyectarLibreDisponibilidad(reales, futuros, A)
  assert.equal(mesEnQueSeAgota(p), '2026-08')

  const porMes = Object.fromEntries(p.map((x) => [x.periodo, x]))
  // Agosto y septiembre son los dos meses que SALEN plata; el cuadro hoy muestra $0 en los dos.
  assert.equal(Math.round(porMes['2026-08'].a_pagar_efectivo), 14353137)
  assert.equal(Math.round(porMes['2026-09'].a_pagar_efectivo), 18237856)
  assert.equal(porMes['2026-08'].libre_disp, 0)
  // De octubre en adelante las compras superan a las cobranzas esperadas: vuelve a haber saldo.
  assert.equal(Math.round(porMes['2026-10'].a_pagar_efectivo), 0)
  assert.ok(porMes['2026-12'].libre_disp > 0)

  // El total del año que HOY no está en el cash flow.
  const total = p.reduce((s, x) => s + (x.a_pagar_efectivo || 0), 0)
  assert.equal(Math.round(total), 32590994)
})

test('mesEnQueSeAgota devuelve null si el saldo aguanta todo el horizonte', () => {
  const p = proyectarLibreDisponibilidad(
    [{ periodo: '2026-07', debito: 0, credito: 0, libre_disp: 99999999 }],
    [{ periodo: '2026-08', base_debito: 121, base_credito: 0, supuesto: 's' }], A)
  assert.equal(mesEnQueSeAgota(p), null)
})

// ── LAS FÓRMULAS QUE LLEGAN A LA CELDA ───────────────────────────────────────────────────────────

test('las fórmulas salen en locale es_AR: separador ; y nunca una coma', () => {
  const fs = [
    formulaDebitoProyectado(["'Cash Flow Mensual'!I$6", "'Cash Flow Mensual'!I$10"]),
    formulaCreditoProyectado(["'Cash Flow Mensual'!I$24"]),
    formulaAPagarProyectado('I16', 'I17', 'H19'),
    formulaLibreDispProyectada('H19', 'I16', 'I17'),
  ]
  for (const f of fs) {
    assert.ok(f.startsWith('='), f)
    assert.equal(f.includes(','), false, `fórmula con coma (rompe en es_AR): ${f}`)
  }
  assert.ok(fs[2].includes(';'))
})

test('la alícuota va por rango con nombre, jamás enterrada como número en la fórmula', () => {
  const d = formulaDebitoProyectado(["'Cash Flow Mensual'!I$6"])
  assert.ok(d.includes(RANGO_ALICUOTA_IVA), d)
  // Ni el 21 ni el 0.21 aparecen escritos: si alguien los hardcodea, esto se pone rojo.
  assert.equal(/0[.,]21|\b21\b/.test(d), false, `alícuota hardcodeada en la fórmula: ${d}`)
})

test('el débito extrae el IVA del bruto también en la fórmula, no lo aplica sobre el bruto', () => {
  const d = formulaDebitoProyectado(["'Cash Flow Mensual'!I$6"])
  assert.ok(d.includes(`${RANGO_ALICUOTA_IVA}/(1+${RANGO_ALICUOTA_IVA})`), d)
})

test('la cadena del saldo mira al mes ANTERIOR — anclarla en un mes fijo nunca la agota', () => {
  // El defecto: escribir H19 para los cinco meses. El saldo de julio se descontaría cinco veces y el
  // cuadro mostraría a la empresa pagando de menos todos los meses.
  const cols = ['I', 'J', 'K', 'L', 'M']
  const previas = cols.map((c, i) => (i === 0 ? 'H' : cols[i - 1]))
  const fs = cols.map((c, i) => formulaLibreDispProyectada(`${previas[i]}19`, `${c}16`, `${c}17`))
  assert.ok(fs[0].includes('H19') && fs[0].includes('I16'))
  assert.ok(fs[1].includes('I19') && fs[1].includes('J16'))
  assert.ok(fs[4].includes('L19') && fs[4].includes('M16'))
  assert.equal(new Set(fs).size, cols.length, 'las cinco fórmulas tienen que ser distintas entre sí')
})

test('el saldo previo se lee con N(): una celda vacía o "—" vale 0 y no rompe la cadena', () => {
  assert.ok(formulaAPagarProyectado('I16', 'I17', 'H19').includes('N(H19)'))
  assert.ok(formulaLibreDispProyectada('H19', 'I16', 'I17').includes('N(H19)'))
})

test('sin celdas base no se proyecta un cero silencioso: rompe', () => {
  assert.throws(() => formulaDebitoProyectado([]), /sin celdas de cobranza/)
  assert.throws(() => formulaCreditoProyectado([]), /sin celdas de compra/)
})

test('el supuesto nombra las dos bases y el rango de la alícuota', () => {
  const s = supuestoDelMes({ cobranzas: ['cobrado', 'esperado'], compras: ['materiales'] })
  assert.match(s, /^PROYECCIÓN/)
  assert.match(s, /cobrado \+ esperado/)
  assert.match(s, /materiales/)
  assert.ok(s.includes(RANGO_ALICUOTA_IVA))
})

test('periodoDe arma el período con el mes en dos dígitos', () => {
  assert.equal(periodoDe(2026, 8), '2026-08')
  assert.equal(periodoDe(2026, 12), '2026-12')
})

// ── EL ANCLA ─────────────────────────────────────────────────────────────────────────────────────

test('un "—" o un vacío NO son un dato: no anclan ni cuentan como mes cargado', () => {
  assert.equal(esNumero('—'), false)
  assert.equal(esNumero(''), false)
  assert.equal(esNumero(null), false)
  assert.equal(esNumero('DDJJ presentada'), false)
  assert.equal(esNumero('$7.050.036'), true)
  assert.equal(aNumero('$7.050.036'), 7050036)
  // es_AR: el punto es separador de miles, la coma es decimal. Al revés daría 7,05.
  assert.equal(aNumero('$1.234,50'), 1234.5)
})

test('el ancla es el ÚLTIMO MES CON DATO EN LA HOJA, no la última DDJJ presentada', () => {
  // La hoja real al 04/08: ene→jul con número (jul lo escribió el dueño a mano), ago→dic vacíos.
  // En Drive sólo hay F.2051 hasta junio.
  const fila = ['$20.803.502', '$25.836.241', '$16.413.003', '$18.757.047', '$19.326.154',
    '$19.344.911', '$7.050.036', '', '', '', '', '']
  const a = anclaDeProyeccion(fila, [1, 2, 3, 4, 5, 6])
  assert.equal(a.ultimoMesConDato, 7, 'julio tiene dato en la hoja aunque no tenga DDJJ en Drive')
  // Anclar en junio daría $19,3M y el cuadro diría que el saldo aguanta todo el año.
  assert.equal(a.libreDisp, 7050036)
  assert.deepEqual(a.mesesAProyectar, [8, 9, 10, 11, 12])
})

test('una DDJJ presentada que la hoja todavía no muestra también corre el ancla', () => {
  const fila = ['$100', '', '', '', '', '', '', '', '', '', '', '']
  const a = anclaDeProyeccion(fila, [1, 2])
  assert.equal(a.ultimoMesConDato, 2)
  assert.deepEqual(a.mesesAProyectar, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('sin ningún dato no se proyecta nada — no se inventa un saldo inicial en cero', () => {
  const a = anclaDeProyeccion(['', '—', ''], [])
  assert.equal(a.ultimoMesConDato, null)
  assert.equal(a.libreDisp, null)
  assert.deepEqual(a.mesesAProyectar, [])
})

test('con diciembre cargado no queda nada por proyectar', () => {
  const a = anclaDeProyeccion(Array(12).fill('$1'), [])
  assert.equal(a.ultimoMesConDato, 12)
  assert.deepEqual(a.mesesAProyectar, [])
})
