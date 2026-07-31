import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAPA, fuentesSumadas, pestanasSumadasSegunMapa, verificarCobertura, ROLES_SUMADOS,
} from './cash-flow-cobertura.mjs'
import { formulaCobranzasSinUnidad, formulaCobranzasSinFecha, formulaCobranzas, FIN_COB } from './cash-flow-lineas.mjs'

// LAS 13 PESTAÑAS DEL FLUJO DE FONDOS QUE T04 NOMBRA. El mapa tiene que contemplarlas TODAS, cada
// una con exactamente un rol: ninguna pestaña puede quedar sin decir si alimenta el cuadro o no.
const PESTAÑAS_T04 = [
  'Compras', 'Proveedores', 'Materiales', 'Cobranzas', 'Cheques Emitidos', 'Cheques Recibidos',
  'Impuestos y Financieros', 'Cargas Sociales', 'Jornales por Quincena', 'Tarjeta de Credito',
  'Recurrentes', 'Estructura', 'CAJA',
]

test('el mapa contempla exactamente las 13 pestañas de T04, una vez cada una', () => {
  const enMapa = MAPA.map((m) => m.pestania)
  assert.equal(enMapa.length, new Set(enMapa).size, 'no hay pestañas repetidas en el mapa')
  assert.deepEqual([...enMapa].sort(), [...PESTAÑAS_T04].sort())
})

// LA PRUEBA CENTRAL DE T04: el mapa coincide con lo que el cuadro realmente hace. Si alguien agrega
// una línea que suma de una pestaña nueva, o marca mal un rol, esto lo grita.
test('el mapa es coherente con el cuadro real (sin huecos ni doble conteo)', () => {
  const problemas = verificarCobertura()
  assert.deepEqual(problemas, [], problemas.join('\n'))
})

// La lista de pestañas que el cuadro SUMA, derivada del CUADRO+REGLAS, es exactamente la esperada.
// Cheques Emitidos y Tarjeta entran por las líneas "sin factura"; Compras por sus rubros y por los
// bienes de uso; Jornales por su dato real; Cobranzas por los ingresos; "Impuestos y Financieros" por
// el IVA/IIBB a pagar (que NO vive en Compras). Nada más se suma.
test('las fuentes sumadas son las seis esperadas, ni una más', () => {
  assert.deepEqual([...fuentesSumadas()].sort(), [
    'Cheques Emitidos', 'Cobranzas', 'Compras', 'Impuestos y Financieros', 'Jornales por Quincena', 'Tarjeta de Credito',
  ])
})

// Las derivadas, el ancla y el informativo NUNCA pueden estar entre las sumadas: esa es la garantía
// anti-doble-conteo, y se comprueba contra el cuadro, no contra la buena fe del mapa.
test('ninguna DERIVADA/ANCLA/INFORMATIVO se suma en el cuadro', () => {
  const sumadas = fuentesSumadas()
  for (const m of MAPA.filter((x) => !ROLES_SUMADOS.has(x.rol))) {
    assert.ok(!sumadas.has(m.pestania), `${m.pestania} (${m.rol}) no debe sumarse`)
  }
})

test('cada DERIVADA nombra una fuente que sí se suma (la que ya contempla su plata)', () => {
  const sumadas = fuentesSumadas()
  for (const m of MAPA.filter((x) => x.rol === 'DERIVADA')) {
    assert.ok(m.deriva_de, `${m.pestania} debe declarar deriva_de`)
    assert.ok(sumadas.has(m.deriva_de), `${m.pestania} deriva de ${m.deriva_de}, que debe sumarse`)
  }
})

test('el mapa de pestañas sumadas coincide con las fuentes reales', () => {
  assert.deepEqual([...pestanasSumadasSegunMapa()].sort(), [...fuentesSumadas()].sort())
})

// ── LOS DOS CONTROLES DEL INGRESO (T04): el espejo de los del egreso ──────────────────────────────

test('el control "cobros sin unidad" suma Cobranzas con F vacía, sin endosos', () => {
  const f = formulaCobranzasSinUnidad()
  assert.ok(f.startsWith('=SUMPRODUCT('))
  // Mira la unidad (F) vacía.
  assert.ok(f.includes(`Cobranzas!$F$5:$F$${FIN_COB}=""`))
  // Excluye endosados, igual que las líneas de ingreso.
  assert.ok(f.includes('ENDOSADO'))
  // El monto es M, con guard de no-número (hay celdas con "-").
  assert.ok(f.includes(`Cobranzas!$M$5:$M$${FIN_COB}`) && f.includes('IF(ISNUMBER('))
})

test('"Otras cobranzas" incluye los cobros SIN unidad (decisión del dueño: default a otras + visibilidad)', () => {
  const otras = formulaCobranzas('otras', 1, 2)
  // "otras" = todo lo que no es civil ni mantenimiento…
  assert.ok(otras.includes('<>"civil"') && otras.includes('<>"mantenimiento"'))
  // …SIN exigir F<>"": un cobro con la unidad vacía cae acá, no se pierde del cuadro.
  assert.ok(!otras.includes(`Cobranzas!$F$5:$F$${FIN_COB}<>""`))
  // civil y mantenimiento siguen filtrando por su unidad exacta (no cambian).
  assert.ok(formulaCobranzas('civil', 1, 2).includes('="civil"'))
  assert.ok(formulaCobranzas('mantenimiento', 1, 2).includes('="mantenimiento"'))
})

test('el control "cobros sin fecha" exige que NO haya ni Q ni P, array-safe', () => {
  const f = formulaCobranzasSinFecha()
  assert.ok(f.startsWith('=SUMPRODUCT('))
  // Sin fecha de cobro (Q) Y sin vencimiento (P).
  assert.ok(f.includes(`(1-ISNUMBER(Cobranzas!$Q$5:$Q$${FIN_COB}))`))
  assert.ok(f.includes(`(1-ISNUMBER(Cobranzas!$P$5:$P$${FIN_COB}))`))
  // NOT() no es array-safe en Sheets: se usa (1-ISNUMBER(...)).
  assert.ok(!f.includes('NOT('))
  assert.ok(f.includes('ENDOSADO'))
})
