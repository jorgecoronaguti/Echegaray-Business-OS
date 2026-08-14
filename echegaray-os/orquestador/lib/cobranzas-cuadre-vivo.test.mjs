import test from 'node:test'
import assert from 'node:assert/strict'
import { informe, rangoMensual, RANGO_COBRANZAS } from './cobranzas-cuadre-vivo.mjs'

/** Lo que devuelve `auditarCuadreCobranzas`, con lo mínimo que el informe mira. */
const resultado = (porMes, extra = {}) => ({
  noPudoUbicar: null, cobros: [], meses: porMes, ingreso: [], totalCobranzas: 0, totalCashFlow: 0,
  fueraDeVentana: [], endosados: [], sinUnidad: [], sinFecha: [], sinValuar: [], devoluciones: [],
  tipoCambio: 1491.727, porMes, ...extra,
})
const mes = (m, { bruto, endosado = 0, devolucion = 0, cashflow }) => {
  const cobranzas = bruto - endosado - devolucion
  const dif = cobranzas - cashflow
  return { mes: m, bruto, endosado, devolucion, cobranzas, cashflow, dif, ok: Math.abs(dif) < 1 }
}

test('el informe NOMBRA la resta del mes: un −$20.000.000 sin motivo obliga a ir a buscarlo', () => {
  // Agosto real del 14/08: dos echeq endosados a Alumetal y la devolución de MACRO.
  const r = resultado([mes('2026-08', { bruto: 190211848, endosado: 20000000, devolucion: -96800, cashflow: 170308648 })])
  const linea = informe(r).find((l) => l.includes('2026-08'))
  assert.match(linea, /✓/, 'descontados los dos conciliadores, agosto cierra')
  assert.match(linea, /endosado \$20\.000\.000/)
  assert.match(linea, /devoluciones \$-96\.800/)
  assert.match(linea, /bruto \$190\.211\.848/, 'el bruto de la pestaña queda a la vista para poder rehacer la resta')
})

test('un mes sin conciliadores no arrastra corchetes vacíos', () => {
  const linea = informe(resultado([mes('2026-05', { bruto: 93814100, cashflow: 93814100 })])).find((l) => l.includes('2026-05'))
  assert.match(linea, /✓/)
  assert.ok(!linea.includes('['), 'sin restas que declarar, no hay nada entre corchetes')
})

test('soloFallas deja SÓLO los meses que no cierran — doce renglones iguales esconden el desvío', () => {
  const r = resultado([
    mes('2026-07', { bruto: 166162409, cashflow: 189119604 }),
    mes('2026-08', { bruto: 170211848, cashflow: 170211848 }),
  ])
  const lineas = informe(r, { soloFallas: true })
  assert.equal(lineas.filter((l) => l.includes('2026-')).length, 1)
  assert.ok(lineas.some((l) => l.includes('2026-07') && l.includes('⚠')))
  assert.ok(!lineas.some((l) => l.includes('2026-08')))
  // Y el encabezado con el total NO va: en el log del pipeline sólo interesa lo que falla.
  assert.ok(!lineas.some((l) => l.includes('cobros cargados')))
})

test('una fila que no se pudo valuar se declara AUNQUE se pida sólo las fallas', () => {
  // Es plata que el cuadre no puede ver: si el modo compacto la callara, el ⛔ del pipeline no diría
  // por qué falló y el arreglo obvio sería subir la tolerancia.
  const r = resultado([mes('2026-07', { bruto: 0, cashflow: 0 })], {
    sinValuar: [{ fila: 62, monto: 15400, cliente: 'Quattropani - Melisa García SAS', motivo: 'está en USD y no tengo tipo de cambio' }],
  })
  const lineas = informe(r, { soloFallas: true })
  assert.ok(lineas.some((l) => l.includes('fila  62') && l.includes('Quattropani')))
})

test('si no se pudo ubicar el cuadro el informe dice eso y nada más: no fabrica hallazgos', () => {
  const lineas = informe(resultado([], { noPudoUbicar: 'no encontré la fila "Concepto"' }))
  assert.equal(lineas.length, 2)
  assert.match(lineas[0], /NO PUDE UBICAR/)
})

test('los rangos leen hasta donde está el dato que el control necesita', () => {
  // Hasta BC: la marca de endosado vive en BB ("Valor banco"). Un rango más corto la deja invisible y
  // el control declararía como desvío una exclusión legítima.
  assert.match(RANGO_COBRANZAS, /^Cobranzas!A5:B[C-Z]/)
  // Y el cuadro DESDE LA FILA 1: `ubicarCuadro` busca sus anclas de texto, no cuenta filas.
  assert.match(rangoMensual('Cash Flow Mensual'), /!A1:/)
  assert.match(rangoMensual("Cash Flow 'x'"), /^'Cash Flow ''x'''!/, 'el nombre de pestaña se cita bien')
})
