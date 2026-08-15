// LO QUE SE PRUEBA ACÁ ES QUE EL "REAL" NO PUEDA VOLVER A SALIR DE LA PLANILLA, Y QUE UN PAGO A
// CUENTA NO SE PUEDA LEER COMO UNA LIQUIDACIÓN.
//
// Los cinco defectos concretos que estas pruebas atrapan, todos medidos sobre el archivo real:
//
//   1. El banco escribe "Acreditacion en cta pago de haber" (singular) y la clasificación pedía
//      "haberes": trece de los catorce movimientos de la quincena, $3.380.000, caían en
//      «Transferencias a proveedores» y el real del cuadro publicaba $260.000.
//   2. La quincena cierra el SÁBADO 15/08 y el lote salió el viernes 14/08. Con la ventana clavada en
//      el cierre, el lote entero quedaba afuera y el cuadro decía "real $0".
//   3. El pago suelto del 13/08 ($239.790,94, una sola persona) NO es de esta quincena. Una ventana
//      de "hasta − N días" fija se lo comía y el real subía a $3.879.790,94.
//   4. Catorce transferencias del MISMO importe redondo no son la liquidación: son el 50% acordado.
//      Publicarlo sin decirlo hace creer que la quincena está cerrada.
//   5. El efectivo NO tiene fuente. La columna «Total recibo» de JORNALES es `=V*W−Y−X`, un residuo
//      de la misma planilla: usarla daría cero de diferencia todos los días sin probar nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UMBRAL_RELATIVO, UMBRAL_ABSOLUTO, COLS_CONTRASTE, colContraste,
  EFECTIVO_SIN_FUENTE, TOTAL_INFERIDO,
  ultimoDiaHabil, ventanaDePago, formaDelLote, realDelPeriodo, emparejarPorPeriodo, contrastar,
  formulaRealBanco, formulaMovimientos, formulaFechaDelLote, formulaOrigenDelReal,
  formulaTotalInferido, formulaDiferencia, formulaDelta, formulaAvisoUmbral,
  formulaSubtituloContraste, expresionVentana,
} from './jornales-real-vs-estimado.mjs'
import { clasificarMovimiento } from './banco-santander.mjs'

// ── LOS DATOS REALES, TAL COMO SALIERON DE `banco_movimientos` EL 15/08/2026 ──────────────────────
// Trece "Acreditacion en cta pago de haber - 260814507" + un "Pago de haberes por cci", los catorce
// de $260.000 clavados; y arriba, el pago suelto del 13/08 que NO es de esta quincena.
const LOTE_14_08 = Array.from({ length: 13 }, (_, i) => ({
  fecha: '2026-08-14', importe: -260000, referencia: String(34388500 + i),
  concepto: 'Acreditacion en cta pago de haber - 260814507 cuit 30716304643',
})).concat([{ fecha: '2026-08-14', importe: -260000, referencia: '00045027', concepto: 'Pago de haberes por cci - &&000000000000001' }])
const SUELTO_13_08 = { fecha: '2026-08-13', importe: -239790.94, referencia: '34370285', concepto: 'Pago haberes - 260813507' }
// El lote del 17/07: importes TODOS distintos entre sí. Ésa es la liquidación individual.
const LOTE_17_07 = [252200, 238600, 267500, 256000, 258000, 250000, 253400, 251000, 277000, 248000, 240000, 252350, 217100]
  .map((n, i) => ({ fecha: '2026-07-17', importe: -n, referencia: `x${i}`, concepto: 'Pago haberes - 260717507' }))

test('el banco escribe "pago de haber" en singular y eso también es un sueldo', () => {
  // RED antes del arreglo: devolvía 'Transferencias a proveedores' y se llevaba $3.380.000 al cajón
  // equivocado — el mismo lote partido en dos naturalezas.
  assert.equal(clasificarMovimiento('Acreditacion en cta pago de haber - 260814507 cuit 30716304643'), 'Sueldos')
  // Y las dos formas que ya funcionaban siguen funcionando: el arreglo amplía, no reemplaza.
  assert.equal(clasificarMovimiento('Pago de haberes por cci - &&000000000000001'), 'Sueldos')
  assert.equal(clasificarMovimiento('Pago haberes - 260813507'), 'Sueldos')
  // Y NO se lleva puesto lo que no es sueldo: el pago de honorarios usa el MISMO servicio de lote.
  assert.equal(clasificarMovimiento('Pago de honorarios - 260601507'), 'Transferencias a proveedores')
})

test('la ventana arranca en el último día HÁBIL del cierre, no en el cierre', () => {
  // 15/08/2026 es SÁBADO: el banco acreditó el viernes 14. Con la ventana clavada en el cierre, los
  // $3.640.000 quedaban afuera y el cuadro publicaba "real $0" con la plata ya fuera de la cuenta.
  assert.equal(ultimoDiaHabil('2026-08-15'), '2026-08-14')
  assert.equal(ventanaDePago({ hasta: '2026-08-15' }).desde, '2026-08-14')
  // Un cierre en día hábil no se corre: 15/07 es miércoles y la ventana arranca ese mismo día.
  assert.equal(ventanaDePago({ hasta: '2026-07-15' }).desde, '2026-07-15')
  // 31/07 es viernes; el lote de ese mismo día tiene que entrar.
  assert.equal(ventanaDePago({ hasta: '2026-07-31' }).desde, '2026-07-31')
  assert.equal(ventanaDePago({ hasta: '2026-07-15' }).hasta, '2026-07-25')
})

test('las ventanas de dos quincenas consecutivas NO se solapan: un pago tiene un solo dueño', () => {
  const a = ventanaDePago({ hasta: '2026-07-31' })
  const b = ventanaDePago({ hasta: '2026-08-15' })
  assert.ok(a.hasta < b.desde, `se solapan: ${a.hasta} ≥ ${b.desde}`)
})

test('el real de la quincena en curso son los catorce movimientos del 14/08 y NADA más', () => {
  const r = realDelPeriodo({ pagos: [SUELTO_13_08, ...LOTE_14_08], hasta: '2026-08-15' })
  assert.equal(r.total, 3640000)
  assert.equal(r.movimientos, 14)
  assert.equal(r.fecha, '2026-08-14')
  // El pago suelto del 13/08 no está adentro: si entrara, el real sería $3.879.790,94.
  assert.notEqual(r.total, 3879790.94)
})

test('catorce importes iguales son un pago uniforme; trece distintos, una liquidación', () => {
  const uniforme = formaDelLote(LOTE_14_08)
  assert.equal(uniforme.uniforme, true)
  assert.equal(uniforme.modo, -260000)
  assert.equal(uniforme.repetidos, 14)
  // El lote del 17/07 tiene importes todos distintos: no hay modo repetido y NO es uniforme.
  const individual = formaDelLote(LOTE_17_07)
  assert.equal(individual.uniforme, false)
  assert.equal(individual.repetidos, 1)
  // Un lote de un solo movimiento tampoco es "uniforme": no hay nada que repetir.
  assert.equal(formaDelLote([SUELTO_13_08]).uniforme, false)
  assert.equal(formaDelLote([]).movimientos, 0)
})

test('el emparejamiento es por PERÍODO: el lote va a su quincena y el suelto queda huérfano', () => {
  const r = emparejarPorPeriodo({
    quincenas: [{ desde: '2026-07-16', hasta: '2026-07-31' }, { desde: '2026-08-01', hasta: '2026-08-15' }],
    pagos: [SUELTO_13_08, ...LOTE_14_08],
  })
  assert.equal(r.quincenas[0].movimientos, 0)
  assert.equal(r.quincenas[1].movimientos, 14)
  assert.equal(r.quincenas[1].total, 3640000)
  assert.equal(r.quincenas[1].uniforme, true)
  // El pago del 13/08 no cae en ninguna ventana y se DECLARA: imputarlo "porque tiene que ser de
  // alguien" es cómo un control deja de ser un control.
  assert.equal(r.huerfanos.length, 1)
  assert.equal(r.huerfanos[0].importe, -239790.94)
})

test('un pago no puede respaldar dos quincenas', () => {
  const r = emparejarPorPeriodo({
    quincenas: [{ hasta: '2026-08-15' }, { hasta: '2026-08-15' }],
    pagos: LOTE_14_08,
  })
  assert.equal(r.quincenas[0].movimientos + r.quincenas[1].movimientos, 14)
})

test('EL CONTRASTE DECLARADO POR EL DUEÑO: $7.278.400 estimados contra $7.280.000 del banco', () => {
  // El OS venía publicando $7.278.400 para la quincena leyendo el espejo de JORNALES. Por banco
  // salieron $3.640.000 y el acuerdo es mitad y mitad, así que el total inferido es $7.280.000.
  const c = contrastar({ estimado: 7278400, real: 3640000 * 2, movimientos: 14 })
  assert.equal(c.diferencia, 1600)
  assert.equal(Math.round(c.delta * 1e6) / 1e6, 0.00022)
  // 0,022% está noventa veces por debajo del umbral: la proyección se puede creer.
  assert.equal(c.supera, false)
  // Y la mitad bancaria, que es la que tiene prueba directa, da la mitad de la misma diferencia.
  assert.equal(contrastar({ estimado: 7278400 / 2, real: 3640000, movimientos: 14 }).diferencia, 800)
})

test('una persona que no cobró por banco pasa el umbral y se ve', () => {
  // Medido el 15/08: el cuadro estimaba $3.923.250 por banco (catorce cargados + el 50% calculado de
  // quien tiene la columna BANCO vacía) y el extracto muestra $3.640.000. Faltó una transferencia.
  const c = contrastar({ estimado: 3923250, real: 3640000, movimientos: 14 })
  assert.equal(c.diferencia, -283250)
  assert.equal(c.supera, true)
  assert.ok(Math.abs(c.delta) > UMBRAL_RELATIVO)
})

test('el redondeo de las transferencias NO enciende el aviso, y por eso el umbral es 2%', () => {
  // Peor caso del redondeo al $10.000 sobre catorce personas: $5.000 × 14 = $70.000 sobre $3,64M.
  const c = contrastar({ estimado: 3640000, real: 3640000 + 70000, movimientos: 14 })
  assert.ok(Math.abs(c.delta) < UMBRAL_RELATIVO, 'el ruido del redondeo tiene que quedar debajo del umbral')
  assert.equal(c.supera, false)
})

test('el piso en pesos apaga el falso positivo de una quincena chica', () => {
  // Dos personas, $500.000 de lote: $10.000 ya son 2% y no significan nada.
  const c = contrastar({ estimado: 500000, real: 510000, movimientos: 2 })
  assert.equal(c.umbral, UMBRAL_ABSOLUTO)
  assert.equal(c.supera, false)
})

test('"sin evidencia" no es "dentro del umbral": el aviso queda en null, no en false', () => {
  // Si el extracto todavía no muestra el lote, la diferencia es −estimado y el aviso gritaría por la
  // razón equivocada. Sin movimientos no hay comparación posible y se dice.
  assert.equal(contrastar({ estimado: 3640000, real: 0, movimientos: 0 }).supera, null)
  assert.equal(contrastar({ estimado: 3640000, real: null }).supera, null)
  assert.equal(contrastar({ estimado: 0, real: 3640000, movimientos: 14 }).supera, null)
})

// ── LAS FÓRMULAS ─────────────────────────────────────────────────────────────────────────────────

const TODAS = [
  formulaRealBanco('$B$60'), formulaMovimientos('$B$60'), formulaFechaDelLote('$B$60'),
  formulaOrigenDelReal({ celdaHasta: '$B$60', celdaMovs: '$C$10' }),
  formulaTotalInferido('$E$10'), formulaDiferencia('$D$10', '$E$10'), formulaDelta('$D$10', '$F$10'),
  formulaAvisoUmbral({ movs: '$C$10', est: '$D$10', dif: '$F$10', delta: '$G$10' }),
  formulaSubtituloContraste(60),
]

test('ninguna fórmula usa la coma: en es_AR la coma es el decimal, no el separador', () => {
  for (const f of TODAS) {
    // Se sacan los patrones de TEXT() y los numberFormat, que VAN en formato US y llevan coma a
    // propósito ("#,##0"): son otra gramática dentro de la misma fórmula.
    const sinPatrones = f.replace(/"[^"]*"/g, '""')
    assert.doesNotMatch(sinPatrones, /,/, `separador coma en: ${f.slice(0, 90)}`)
    assert.match(f, /;/, `no usa el separador es-AR: ${f.slice(0, 90)}`)
  }
})

test('ningún literal decimal: un 0,5 escrito por API se parte en dos argumentos', () => {
  for (const f of TODAS) {
    assert.doesNotMatch(f.replace(/"[^"]*"/g, '""'), /\d,\d/, `literal decimal en: ${f.slice(0, 90)}`)
  }
  // El 2% del umbral viaja como división entera, no como 0,02.
  assert.match(formulaAvisoUmbral({ movs: 'C1', est: 'D1', dif: 'F1', delta: 'G1' }), /N\(D1\)\/50/)
  // Y el 80% de la forma del lote, como producto de enteros.
  assert.match(formulaOrigenDelReal({ celdaHasta: 'B1', celdaMovs: 'C1' }), /\*5>=.*\*4/)
})

test('los patrones de TEXT van en formato US aunque el archivo sea es_AR', () => {
  const origen = formulaOrigenDelReal({ celdaHasta: 'B1', celdaMovs: 'C1' })
  assert.match(origen, /TEXT\(ABS\(/)
  assert.match(origen, /;"\$#,##0"\)/)
  assert.match(formulaAvisoUmbral({ movs: 'C1', est: 'D1', dif: 'F1', delta: 'G1' }), /"0\.0%"/)
})

test('el rango de _BANCO_RAW es ABIERTO: un techo fijo deja de ver los lotes nuevos sin avisar', () => {
  for (const f of [formulaRealBanco('B1'), formulaMovimientos('B1'), formulaFechaDelLote('B1')]) {
    assert.match(f, /'_BANCO_RAW'!\$A\$4:\$A(?!\$?\d)/, `techo fijo en: ${f.slice(0, 90)}`)
    assert.doesNotMatch(f, /\$A\$4:\$A\$\d+/)
  }
})

test('el real se filtra por la NATURALEZA del banco, no por el texto del concepto', () => {
  // Una definición de "esto es un sueldo" y una sola: la de `clasificarMovimiento`, que se escribe en
  // la columna F de _BANCO_RAW. Un regex sobre el concepto adentro de la fórmula sería una segunda
  // definición, y el día que difieran nadie se entera.
  assert.match(formulaRealBanco('B1'), /'_BANCO_RAW'!\$F\$4:\$F;"Sueldos"/)
  assert.doesNotMatch(formulaRealBanco('B1'), /REGEXMATCH|SEARCH\(/)
})

test('la ventana de la fórmula dice lo mismo que la del JS: WORKDAY(hasta+1;-1)', () => {
  // Si el JS y la fórmula difirieran habría DOS verdades sobre qué pago es de esta quincena, y el
  // test verde no probaría lo que publica la celda.
  assert.equal(expresionVentana('$B$60').desde, 'WORKDAY($B$60+1;-1)')
  assert.equal(expresionVentana('$B$60').hasta, '$B$60+JORNALES_VENTANA_BANCO')
})

test('el cuadro tiene ocho columnas y su rótulo es reconocible como encabezado', () => {
  // Ocho: el mismo ancho que el resto del hero. Dos anchos de grilla en una pestaña es lo que el
  // auditor de patrón marca y el dueño ve corrido.
  assert.equal(COLS_CONTRASTE.length, 8)
  assert.equal(COLS_CONTRASTE[0], 'Concepto')
  assert.equal(COLS_CONTRASTE[COLS_CONTRASTE.length - 1], 'De dónde sale el real')
  assert.equal(colContraste('Real'), 'E')
  assert.throws(() => colContraste('Canal'), /no tiene la columna/)
})

test('el efectivo declara su límite en vez de estimarlo con la propia planilla', () => {
  assert.match(EFECTIVO_SIN_FUENTE, /residuo de la misma planilla/)
  assert.match(TOTAL_INFERIDO, /^INFERIDO/)
  // Ninguno de los dos textos puede contener una cifra: son el motivo, no un número disfrazado.
  for (const t of [EFECTIVO_SIN_FUENTE, TOTAL_INFERIDO]) assert.doesNotMatch(t, /\$\s?\d/)
})
