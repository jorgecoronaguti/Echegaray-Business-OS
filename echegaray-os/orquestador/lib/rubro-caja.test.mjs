import test from 'node:test'
import assert from 'node:assert/strict'
import { rubroDeCaja, repartir, formulaRubro, REGLAS, RUBROS, SIN_CLASIFICAR } from './rubro-caja.mjs'

// Los casos que ya se equivocaron una vez en esta planilla. Cada uno es plata que cambió de línea.
test('el orden de las reglas decide, y ese orden está medido', () => {
  // "Sueldos" contra una obra son JORNALES; sin obra, son administración. Si esta regla se invierte,
  // $144,8M se van de la línea de jornales a la de sueldos de oficina.
  assert.equal(rubroDeCaja({ proveedor: 'Sueldos', cliente: 'La Estrella' }), 'Nómina · Jornales de obra')
  assert.equal(rubroDeCaja({ proveedor: 'Sueldos', cliente: 'Administracion' }), 'Nómina · Sueldos administración')
  // El F931 es CARGA SOCIAL, no impuesto: $84,5M. Aunque venga con unidad de negocio "Impuestos".
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'F931', unidad: 'Impuestos' }), 'Nómina · Cargas sociales')
  // UOCRA/FCL/IERIC/FODECO son gremiales, no impuestos: $17,6M.
  assert.equal(rubroDeCaja({ proveedor: 'UOCRA', unidad: 'Impuestos' }), 'Nómina · Gremiales')
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'IERIC' }), 'Nómina · Gremiales')
  // Un impuesto de verdad.
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'Ganancias', unidad: 'Impuestos' }), 'Impuestos')
})

test('un proveedor recurrente gana sobre su unidad de negocio', () => {
  // RSV factura GPS todos los meses con unidad "Estructura": es un servicio recurrente, y si cae en
  // Estructura se cuenta dos veces (ya está en la pestaña Recurrentes).
  assert.equal(rubroDeCaja({ proveedor: 'RSV', unidad: 'Estructura' }), 'Servicios recurrentes')
})

test('materiales civil y mantenimiento salen de la unidad de negocio', () => {
  assert.equal(rubroDeCaja({ proveedor: 'Corralon Progreso', unidad: 'Civil' }), 'Materiales Civil')
  assert.equal(rubroDeCaja({ proveedor: 'Ferretec', unidad: 'Mantenimiento' }), 'Materiales Mantenimiento')
})

test('lo que no matchea ninguna regla queda marcado, no escondido', () => {
  assert.equal(rubroDeCaja({ proveedor: 'X', unidad: '', cliente: '' }), SIN_CLASIFICAR)
})

test('repartir avisa cuando NO es una partición', () => {
  const ok = repartir([
    { proveedor: 'Sueldos', cliente: 'La Estrella', total: 100 },
    { proveedor: 'Corralon', unidad: 'Civil', total: 50 },
  ])
  assert.equal(ok.cierra, true)
  assert.equal(ok.total, 150)
  assert.equal(ok.sin_clasificar, 0)

  const mal = repartir([{ proveedor: 'Desconocido', total: 999 }])
  assert.equal(mal.cierra, false, 'una fila sin rubro tiene que romper el control, no pasar callada')
  assert.equal(mal.sin_clasificar, 1)
})

test('la fórmula del Sheet se genera desde las MISMAS reglas', () => {
  const f = formulaRubro()
  // Una regla nueva en REGLAS aparece sola en la fórmula: no hay dos listas que mantener.
  for (const r of RUBROS) assert.ok(f.includes(`"${r}"`), `falta el rubro ${r} en la fórmula`)
  assert.ok(f.includes(`"${SIN_CLASIFICAR}"`))
  // es-AR: separador ';' y ninguna coma de argumento suelta.
  assert.ok(f.startsWith('=ARRAYFORMULA('))
  assert.ok(f.includes(';'), 'la fórmula tiene que estar en es-AR')
  // El orden de anidado tiene que ser el de REGLAS: la primera regla es la más externa.
  const pos = REGLAS.map((r) => f.indexOf(`"${r.rubro}"`))
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b), 'el orden de la fórmula no es el de REGLAS')
})

test('cada regla declara dónde vive su detalle y quién la paga', () => {
  for (const r of REGLAS) {
    assert.ok(r.detalle, `${r.rubro} no dice en qué pestaña está su detalle`)
    assert.ok(r.paga, `${r.rubro} no dice de dónde sale el monto`)
  }
  // El único rubro que NO se paga desde Compras es jornales: su monto real está en la planilla.
  const fuera = REGLAS.filter((r) => r.paga !== 'compras').map((r) => r.rubro)
  assert.deepEqual(fuera, ['Nómina · Jornales de obra'])
})
