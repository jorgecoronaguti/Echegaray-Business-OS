import test from 'node:test'
import assert from 'node:assert/strict'
import { rubroDeCaja, repartir, formulaRubro, formulaFechaCaja, REGLAS, RUBROS, SIN_CLASIFICAR } from './rubro-caja.mjs'

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

test('un plan de pago de F931 es deuda previsional, no un impuesto', () => {
  // Los 20 registros reales: estaban dentro de "Impuestos" ($9.835.877) y tapaban que de IVA e IIBB
  // no hay nada cargado. Son cuotas fijas de deuda de seguridad social.
  // Lo que decide es el CONCEPTO, no el cliente: "Plan de pago" a secas no alcanza, porque bajo esa
  // misma etiqueta hay impuestos nacionales (ver el test de abajo).
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', concepto: 'Deuda Previcional - 931 Dic 25 — cuota 3' }), 'Deuda previsional (planes de pago)')
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', concepto: 'JUNIO Financiación - Cuota 1 1° Venc — Plan F931 W303094' }), 'Deuda previsional (planes de pago)')
  // Un impuesto de verdad (IVA, IIBB) sigue cayendo en Impuestos.
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', unidad: 'Impuestos', concepto: 'IVA junio' }), 'Impuestos')
  // Y el F931 del mes corriente sigue siendo carga social, no deuda financiada.
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'F931' }), 'Nómina · Cargas sociales')
})

test('bajo la etiqueta "Plan de pago" también hay impuestos de verdad', () => {
  // Estas dos filas reales llevan cliente "Plan de pago" pero son impuestos nacionales, no deuda
  // previsional. Filtrando por cliente en vez de por concepto se las llevaba puestas ($783.684).
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'Plan de pago', concepto: 'Anticipo de Ganancias E6' }), 'Impuestos')
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'Plan de pago', concepto: 'Acciones y Participaciones' }), 'Impuestos')
})

test('la financiación del F931 de junio es un PLAN, no el F931 del mes', () => {
  // Tiene cliente F931, así que la regla de cargas sociales se lo llevaba: $7.484.627 aparecían como
  // aporte del mes cuando son una cuota fija ya comprometida. Para la caja no es lo mismo.
  assert.equal(
    rubroDeCaja({ proveedor: 'ARCA', cliente: 'F931', concepto: 'JUNIO Financiación - Cuota 1 1° Venc — Plan F931 W303094' }),
    'Deuda previsional (planes de pago)',
  )
  // El F931 del mes corriente, sin plan, sigue siendo carga social.
  assert.equal(rubroDeCaja({ proveedor: 'ARCA', cliente: 'F931', concepto: 'F931 junio' }), 'Nómina · Cargas sociales')
})

test('la fecha de caja extrae la PRIMERA fecha aunque la celda tenga texto alrededor', () => {
  // EL CASO REAL (02/08): Alumetal, $11.423.913, con "28/1/2026 y 7/3/26" en la fecha prevista —un
  // pago en dos veces. DATEVALUE fallaba, la fila quedaba sin fecha de caja, y el control del Cash
  // Flow la reportaba como "gasto sin fecha de pago". El dueño la había cargado: tenía DOS.
  const f = formulaFechaCaja()
  assert.match(f, /REGEXEXTRACT/, 'tiene que extraer la fecha del texto, no confiar en DATEVALUE solo')
  assert.match(f, /\\d\{1,2\}\/\\d\{1,2\}\/\\d\{2,4\}/, 'el patrón dd/mm/aaaa, con año de 2 o 4 dígitos')
})

test('la fecha de caja YA NO mira la columna Y, que no es una fecha', () => {
  // "Tipo de Costo" contiene "Directo"/"Indirecto". La rama era una referencia fosilizada de cuando
  // las columnas estaban en otro lado. Un número tipeado ahí se habría leído como fecha de pago.
  const f = formulaFechaCaja()
  assert.ok(!f.includes('$Y$4:$Y'), `no puede referenciar la columna Y: ${f}`)
})

test('la fecha de caja sigue prefiriendo el número cuando la celda ya es una fecha', () => {
  const f = formulaFechaCaja()
  assert.match(f, /ISNUMBER\(\$Q\$4:\$Q\);\$Q\$4:\$Q/, 'una fecha real no pasa por el parseo de texto')
})

test('la fórmula de fecha de caja es es-AR y cierra paréntesis', () => {
  const f = formulaFechaCaja()
  assert.equal([...f].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0), 0)
  assert.ok(!f.replace(/"[^"]*"/g, '""').includes(','), `separador con coma: ${f}`)
})
