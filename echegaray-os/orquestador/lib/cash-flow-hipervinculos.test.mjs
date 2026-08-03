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
// cheque) NO tienen pestaña de origen: no se hiperlinkean. Las comisiones bancarias (31/07) tampoco:
// su origen es _BANCO_RAW, una réplica técnica del extracto y no una pestaña de trabajo del dueño.
const SIN_ORIGEN = (l) => l.descubierto || l.impuestoCheque || l.comisionesBancarias

test('cada subconcepto con origen produce un HYPERLINK con placeholder de gid y range no vacío', () => {
  const { lineas } = verificarCuadro()
  const conOrigen = lineas.filter((l) => !SIN_ORIGEN(l))
  assert.ok(conOrigen.length >= 15, 'la gran mayoría de las líneas se hiperlinkea')
  for (const l of conOrigen) {
    const h = hipervinculoDetalle(l, FILAS_TABLA)
    assert.ok(h, `"${l.nombre}" tiene destino`)
    // URL COMPLETA (placeholder URLID{}), no fragmento suelto: "#gid=…" da "El rango no es válido" en
    // Google y no navega. El gid queda como placeholder GID{destino}, sin resolver (lo resuelve el script).
    assert.ok(h.formula.startsWith(`=HYPERLINK("URLID{}#gid=GID{${h.destino}}&range=`),
      `"${l.nombre}" arranca con el HYPERLINK, la URL completa y el placeholder GID{${h.destino}}`)
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
  // Materiales → su número sale de Compras por rubro (SUMIF sobre la columna O), así que el vínculo
  // apunta a la columna fuente del monto. "Proveedores y Materiales" es prosa que nombra DOS pestañas,
  // no un tab único: no se hiperlinkea a una pestaña inexistente.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Materiales Civil')), { pestaña: 'Compras', rango: 'O4:O' })
  // Sueldos de administración → desde el 01/08 su monto sale de la planilla de nómina (Oficina +
  // los retiros de Dirección), no de Compras: el vínculo tiene que llevar a donde está el número.
  assert.deepEqual(dest(buscar((l) => l.rubro === 'Nómina · Sueldos administración' && !l.desdeCompras)),
    { pestaña: 'Jornales por Quincena', rango: 'A1' })
  // ...y la línea de CONTROL del mismo rubro va a Compras, que es la otra fuente — la que controla.
  // Si las dos apuntaran al mismo lado, el vínculo mandaría a verificar un número contra sí mismo.
  assert.deepEqual(dest(buscar((l) => l.desdeCompras)), { pestaña: 'Compras', rango: 'O4:O' })
})

test('el destino usa la MISMA lógica de origen que la sección "DÓNDE ESTÁ" (no se duplica)', () => {
  const { lineas } = verificarCuadro()
  // Una sola fuente de criterio (REGLAS→detalleDeRubro). Para una pestaña DEDICADA real, el destino
  // del vínculo coincide con lo que muestra la sección textual de respaldo — no hay dos lógicas.
  const cargas = lineas.find((l) => l.rubro === 'Nómina · Cargas sociales')
  assert.equal(detalleDeRubro(cargas.rubro), 'Cargas Sociales')
  assert.equal(destinoDetalle(cargas, FILAS_TABLA).pestaña, detalleDeRubro(cargas.rubro))
  // Divergencia intencional: cuando detalleDeRubro es PROSA de dos pestañas ("Proveedores y
  // Materiales"), el TEXTO la muestra tal cual pero el VÍNCULO cae al origen cierto (Compras), porque
  // no se puede hiperlinkear a un tab que no existe.
  const sueldos = lineas.find((l) => l.rubro === 'Nómina · Sueldos administración' && !l.desdeCompras)
  assert.equal(detalleDeRubro(sueldos.rubro), 'Jornales por Quincena')
  assert.equal(destinoDetalle(sueldos, FILAS_TABLA).pestaña, detalleDeRubro(sueldos.rubro))
  const materiales = lineas.find((l) => l.rubro === 'Materiales Mantenimiento')
  assert.equal(detalleDeRubro(materiales.rubro), 'Proveedores y Materiales')
  assert.equal(destinoDetalle(materiales, FILAS_TABLA).pestaña, 'Compras')
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
