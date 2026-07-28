import test from 'node:test'
import assert from 'node:assert/strict'
import {
  verificarCuadro, hipervinculoDetalle, destinoDetalle, detalleDeRubro, SANGRIA_DETALLE,
} from './cash-flow-lineas.mjs'

// El dueño pidió "la mayor certeza": trazabilidad de un click desde cada subconcepto a su origen. La
// etiqueta de cada línea de detalle tiene que ser un HYPERLINK a su pestaña!rango, con el gid resuelto
// por el script (nunca adivinado) — y el VALOR de la línea sigue siendo fórmula viva (regla de oro).

// Las pestañas Estructura y Recurrentes traen su total de una fila ubicada por rótulo. En el generador
// real la ubica getSheetMeta; acá se simula, que es lo que hace pura y testeable a la función.
const FILAS_TABLA = { Estructura: 15, Recurrentes: 24 }

// Las líneas que el propio cuadro calcula sobre sus celdas (intereses del descubierto, impuesto al
// cheque) NO tienen pestaña de origen: no se hiperlinkean.
const SIN_ORIGEN = (l) => l.descubierto || l.impuestoCheque

test('cada subconcepto con origen produce un HYPERLINK con placeholder de gid y range no vacío', () => {
  const { lineas } = verificarCuadro()
  const conOrigen = lineas.filter((l) => !SIN_ORIGEN(l))
  assert.ok(conOrigen.length >= 15, 'la gran mayoría de las líneas se hiperlinkea')
  for (const l of conOrigen) {
    const h = hipervinculoDetalle(l, FILAS_TABLA)
    assert.ok(h, `"${l.nombre}" tiene destino`)
    // Es un HYPERLINK con el placeholder de gid de SU pestaña destino, sin resolver (lo resuelve el script).
    assert.ok(h.formula.startsWith(`=HYPERLINK("#gid=GID{${h.destino}}&range=`),
      `"${l.nombre}" arranca con el HYPERLINK y el placeholder GID{${h.destino}}`)
    // El range no puede quedar vacío: un vínculo sin range no lleva a ningún lado.
    assert.ok(h.rango && h.rango.length > 0, `"${l.nombre}" tiene range no vacío`)
    // El range va dentro del fragmento URL, cerrado por la comilla de la cadena "#gid=…&range=…".
    assert.ok(h.formula.includes(`&range=${h.rango}"`), `"${l.nombre}" mete el range en el fragmento`)
    // El SEGUNDO argumento del HYPERLINK es la ETIQUETA (texto), no un importe: el número queda fórmula viva.
    assert.ok(h.formula.endsWith(`;"${SANGRIA_DETALLE}${l.nombre}"))`) ||
      h.formula.endsWith(`;"${SANGRIA_DETALLE}${l.nombre}")`),
      `"${l.nombre}" muestra su etiqueta, no un número`)
    // El gid es un placeholder, todavía NO un número: no se adivina en la función pura.
    assert.ok(!/#gid=\d/.test(h.formula), `"${l.nombre}" deja el gid sin resolver`)
  }
})

test('las líneas que el cuadro calcula solo (descubierto, impuesto al cheque) NO se hiperlinkean', () => {
  const { lineas } = verificarCuadro()
  const sin = lineas.filter(SIN_ORIGEN)
  assert.ok(sin.length >= 2, 'existen las líneas de descubierto e impuesto al cheque')
  for (const l of sin) {
    assert.equal(hipervinculoDetalle(l, FILAS_TABLA), null, `"${l.nombre}" queda etiqueta simple`)
    assert.equal(destinoDetalle(l, FILAS_TABLA), null)
  }
})

test('el destino de cada tipo de línea es el más específico y cierto', () => {
  const { lineas } = verificarCuadro()
  const buscar = (pred) => lineas.find(pred)
  const dest = (l) => destinoDetalle(l, FILAS_TABLA)

  // Cobranzas → la columna de monto (M) de la pestaña Cobranzas.
  assert.deepEqual(dest(buscar((l) => l.cobranzas === 'civil')), { pestaña: 'Cobranzas', rango: 'M5:M400' })
  // Cheques y tarjeta → la columna de monto (F) de Cheques Emitidos.
  assert.deepEqual(dest(buscar((l) => l.cheques)), { pestaña: 'Cheques Emitidos', rango: 'F2:F400' })
  // Bienes de uso → el sub-rubro de Compras (columna AF).
  assert.deepEqual(dest(buscar((l) => l.soloSub)), { pestaña: 'Compras', rango: 'AF4:AF' })
  // Estructura (rubro con proyección de tabla) → la fila del TOTAL de la pestaña Estructura.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Estructura')), { pestaña: 'Estructura', rango: 'A15' })
  // Servicios recurrentes → la fila del TOTAL de la pestaña Recurrentes.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Servicios recurrentes')), { pestaña: 'Recurrentes', rango: 'A24' })
  // Impuestos → la pestaña de detalle de REGLAS (Impuestos y Financieros).
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Impuestos')), { pestaña: 'Impuestos y Financieros', rango: 'A1' })
  // Jornales de obra → su pestaña real (Jornales por Quincena), no Compras (Compras tiene estimados).
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Nómina · Jornales de obra')), { pestaña: 'Jornales por Quincena', rango: 'A1' })
  // Cargas sociales → la pestaña Cargas Sociales.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Nómina · Cargas sociales')), { pestaña: 'Cargas Sociales', rango: 'A1' })
  // Materiales → la pestaña Proveedores y Materiales.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Materiales Civil')), { pestaña: 'Proveedores y Materiales', rango: 'A1' })
  // Sueldos de administración → su detalle es la propia Compras: cae a la columna fuente del monto (O).
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Nómina · Sueldos administración')), { pestaña: 'Compras', rango: 'O4:O' })
})

test('el destino usa la MISMA lógica de origen que la sección "DÓNDE ESTÁ" (no se duplica)', () => {
  const { lineas } = verificarCuadro()
  // Para los rubros sin pestaña de proyección ni detalle propio en el CUADRO, el destino cae en la
  // pestaña que da detalleDeRubro — exactamente la que muestra la sección textual de respaldo.
  const sueldos = lineas.find((l) => l.rubro === 'Nómina · Sueldos administración')
  assert.equal(detalleDeRubro(sueldos.rubro), 'Compras')
  const materiales = lineas.find((l) => l.rubro === 'Materiales Mantenimiento')
  assert.equal(detalleDeRubro(materiales.rubro), 'Proveedores y Materiales')
  assert.equal(destinoDetalle(materiales, FILAS_TABLA).pestaña, detalleDeRubro(materiales.rubro))
})

test('sin la fila del total ubicada, un rubro de tabla NO inventa la celda del total', () => {
  const { lineas } = verificarCuadro()
  const estructura = lineas.find((l) => l.rubro === 'Estructura')
  // Sin filasTabla (como en la primera corrida antes de ubicar los rótulos) NO se apunta a "A15" a
  // ciegas: cae a la pestaña de detalle (Estructura!A1), que existe con certeza. Nunca una fila adivinada.
  const d = destinoDetalle(estructura, {})
  assert.equal(d.pestaña, 'Estructura')
  assert.notEqual(d.rango, 'A15')
  assert.equal(d.rango, 'A1')
})
