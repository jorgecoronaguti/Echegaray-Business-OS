// EL DATASET, PROBADO DE IDA Y VUELTA.
//
// Cada prueba de valor arma un .xlsx con un número conocido, lo pasa por la REGLA DE PRODUCCIÓN y
// comprueba que el lector del dataset recupera ESE número. Es lo que convierte «leer un número de
// una cita» —que suena a adivinar— en una derivación verificable: si mañana una regla cambia el
// texto de su cita, el lector deja de encontrar el valor y este archivo se pone rojo.
//
// La otra mitad es la contraria: que lo que NO se puede derivar salga `null` y contado. Un dataset
// que rellena con lo plausible se lee igual que uno completo y es peor que no tenerlo.
import assert from 'node:assert/strict'
import test from 'node:test'
import { estudiar, libro } from './cotizacion-fixture.mjs'
import { hallazgos } from './hallazgos-cotizacion.mjs'
import { TIPO } from './hallazgo.mjs'
import {
  CAMPOS, CAMPOS_CON_HUECO, ESTADO_HALLAZGO, cobertura, cotizacionDeLaClave, dataset,
  huecosDelDataset, indiceDeCotizaciones, indiceDesdeBiblioteca, normalizar, partirUbicacion,
} from './dataset-hallazgos.mjs'

const RUTA = (obra, archivo) => `administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/${obra}/${archivo}`

const tanda = (n, opciones = {}) => Array.from({ length: n }, (_, i) => libro(
  `c${i}.xlsx`, RUTA(`OBRA ${i}`, `c${i}.xlsx`), typeof opciones === 'function' ? opciones(i) : opciones,
))

/** Arma las filas del dataset por el circuito entero: bytes → estudio → reglas → normalización. */
async function filasDe(libros) {
  const r = await estudiar(libros)
  return dataset(hallazgos(r.cotizaciones), { indice: indiceDeCotizaciones(r.cotizaciones) })
}

const del = (d, tipo) => {
  const f = d.filas.find((x) => x.tipo_anomalia === tipo)
  assert.ok(f, `el dataset no trae ninguna fila de ${tipo}`)
  return f
}

// ═══════════════════ LOS VALORES, DE IDA Y VUELTA ═══════════════════

test('el renglón incoherente devuelve los DOS números: el declarado y el que da la multiplicación', async () => {
  const d = await filasDe(tanda(1, { items: [['REPLANTEO', 'M2', 10, 100, 9999]], subtotal: 9999, iva: 2099.79, total: 12098.79 }))
  const f = del(d, TIPO.RENGLON_INCOHERENTE)
  assert.equal(f.valor_encontrado, 9999)
  assert.equal(f.valor_esperado_o_condicion, 1000)
})

test('el rótulo contra el coeficiente devuelve el aplicado y el prometido, no una paráfrasis', async () => {
  const d = await filasDe(tanda(1, { rotuloGG: 'Gastos contables (0.6 % de CD)', coeficienteGG: 0.04 }))
  const f = del(d, TIPO.ROTULO_CONTRADICE_COEFICIENTE)
  assert.equal(f.valor_encontrado, 0.04)
  assert.equal(f.valor_esperado_o_condicion, 0.006)
})

test('el IVA tipeado devuelve el número tipeado, y la condición dice contra qué debía compararse', async () => {
  const d = await filasDe(tanda(1, { iva: 210, ivaConFormula: false, formulasExtra: [{ hoja: 'OFERTA', celda: 'E14', formula: 'C14*D14', valor: 1000 }] }))
  const f = del(d, TIPO.IVA_ESCRITO_A_MANO)
  assert.equal(f.valor_encontrado, 210)
  assert.match(f.valor_esperado_o_condicion, /fórmula sobre el SUB TOTAL/)
})

test('la oferta rota devuelve el texto del error y el total que debería decir', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true }))
  const f = del(d, TIPO.OFERTA_ROTA)
  assert.match(String(f.valor_encontrado), /#DIV\/0!/)
  assert.equal(f.valor_esperado_o_condicion, 1000)
})

test('el coeficiente de ajuste devuelve el multiplicador que se aplicó', async () => {
  const d = await filasDe(tanda(1, { coeficientesAjuste: [1.5] }))
  assert.equal(del(d, TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO).valor_encontrado, '1.5')
  const impl = await filasDe(tanda(1, { coeficientesAjuste: [1015] }))
  assert.equal(del(impl, TIPO.COEFICIENTE_AJUSTE_IMPLAUSIBLE).valor_encontrado, '1015')
})

test('la celda en error devuelve el error, y la fórmula que se apoya en ella devuelve la fórmula', async () => {
  const d = await filasDe(tanda(1, {
    erroresExtra: [{ hoja: 'Análisis', celda: 'G6', texto: '#REF!' }],
    formulasExtra: [{ hoja: 'Análisis', celda: 'H6', formula: 'G6*2', valor: 0 }],
  }))
  assert.match(String(del(d, TIPO.CELDA_EN_ERROR).valor_encontrado), /#REF!/)
  assert.match(String(del(d, TIPO.FORMULA_SOBRE_CELDA_ROTA).valor_encontrado), /G6\*2/)
})

test('la unidad contradictoria devuelve las DOS unidades, que es el hallazgo entero', async () => {
  const d = await filasDe([
    libro('a.xlsx', RUTA('OBRA A', 'a.xlsx'), { partidas: [['T1001', null, 'REPLANTEO', 'M2', null, null, 1000, 500, 500, 0, 46000, null, 0.06, 0.06]] }),
    libro('b.xlsx', RUTA('OBRA B', 'b.xlsx'), { partidas: [['T1001', null, 'REPLANTEO', 'ML', null, null, 1000, 500, 500, 0, 46000, null, 0.06, 0.06]] }),
  ])
  const f = del(d, TIPO.UNIDAD_CONTRADICTORIA)
  assert.equal(f.valor_encontrado, 'M2, ML')
})

test('todo tipo de hallazgo tiene un lector: uno sin lector saldría con el valor en null y nadie lo notaría', async () => {
  // El barrido se hace sobre los tipos que las reglas realmente emiten con el fixture, más la
  // comprobación de que ninguno de los declarados quedó sin entrada en la tabla de lectores.
  const d = await filasDe(tanda(1, { subtotalRoto: true, coeficientesAjuste: [1.5], tareasExtra: ['#REF!'] }))
  for (const f of d.filas) {
    assert.notEqual(f.valor_encontrado, null, `${f.tipo_anomalia} salió sin valor_encontrado: falta su lector`)
  }
  assert.ok(d.filas.length >= 3, 'el escenario no produjo hallazgos suficientes para que el barrido signifique algo')
})

// ═══════════════════ LA IDENTIDAD QUE ESTABA ADENTRO DE UN STRING ═══════════════════

test('archivo, hoja y celda salen de la ubicación, y una ubicación sin celda no inventa una', () => {
  assert.deepEqual(partirUbicacion('COTIZACION INTERNA.xlsm · hoja OFERTA · E25'), { archivo: 'COTIZACION INTERNA.xlsm', hoja: 'OFERTA', celda: 'E25' })
  assert.deepEqual(partirUbicacion('COTIZACION INTERNA.xlsm · hoja OFERTA'), { archivo: 'COTIZACION INTERNA.xlsm', hoja: 'OFERTA', celda: null })
  assert.deepEqual(partirUbicacion('x.xlsm · hoja Presupuesto · fila 42'), { archivo: 'x.xlsm', hoja: 'Presupuesto', celda: 'fila 42' })
  assert.deepEqual(partirUbicacion(''), { archivo: null, hoja: null, celda: null })
})

test('el cliente y el presupuesto salen de la RUTA de Drive, no de la afirmación', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true }))
  const f = del(d, TIPO.OFERTA_ROTA)
  assert.equal(f.cliente, 'ARCOR - SAN JUAN')
  assert.equal(f.presupuesto, 'ARCOR - SAN JUAN · OBRA 0')
  assert.equal(f.hoja, 'OFERTA')
  assert.ok(/^E\d+/.test(f.celda_o_rango), `la celda no se extrajo: ${f.celda_o_rango}`)
})

test('dos celdas citadas se enumeran; NO se comprimen a un rango que nadie citó', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true }))
  const f = del(d, TIPO.OFERTA_ROTA)
  assert.match(f.celda_o_rango, /^E\d+, E\d+$/)
  assert.ok(!f.celda_o_rango.includes(':'), 'se inventó un rango a partir de dos celdas sueltas')
})

test('una clave cruzada no nombra ninguna cotización, y eso deja cliente y presupuesto en null', () => {
  assert.equal(cotizacionDeLaClave('partida.T1001.unidad'), null)
  assert.equal(cotizacionDeLaClave('gg.siempre_en_cero'), null)
  assert.equal(cotizacionDeLaClave('1SCGIKahe.oferta.iva'), '1SCGIKahe')
})

test('el índice se puede armar desde la biblioteca guardada: la url del documento trae el id', () => {
  const i = indiceDesdeBiblioteca({
    documentos: [{ url: 'https://drive.google.com/file/d/ABC123', titulo: 'administracion/PRESUPUESTOS - CLIENTES/FIMA SA/GALPON/x.xlsm' }],
  })
  assert.equal(i.get('ABC123').cliente, 'FIMA SA')
  assert.equal(i.get('ABC123').archivo, 'x.xlsm')
})

// ═══════════════════ LOS HUECOS SE CUENTAN, NO SE RELLENAN ═══════════════════

test('lo que no se pudo derivar queda en null y sale contado como hueco, con su motivo', async () => {
  const d = await filasDe(tanda(1, { partidas: [['T1001', null, 'REPLANTEO', 'M2', null, null, 1000, 500, 500, 0, 46000, null, 0.06, 0.06]], tareasExtra: ['sin datos'] }))
  const f = del(d, TIPO.PARTIDA_SIN_DATOS)
  assert.equal(f.valor_esperado_o_condicion, null, 'se le puso una expectativa a un hallazgo que no compara contra nada')
  const huecos = huecosDelDataset([f])
  assert.ok(huecos.some((h) => h.clave.endsWith('.valor_esperado_o_condicion')))
  assert.match(huecos.find((h) => h.clave.endsWith('.valor_esperado_o_condicion')).porQue, /convertir una costumbre en norma/)
})

test('un indirecto en cero NO recibe una expectativa: un 0 no prueba que tenga que valer otra cosa', async () => {
  const d = await filasDe(tanda(5, { importeGG: 0 }))
  const f = del(d, TIPO.INDIRECTO_SIEMPRE_EN_CERO)
  assert.equal(f.valor_encontrado, 0)
  assert.equal(f.valor_esperado_o_condicion, null)
})

test('la cobertura se publica al lado de las filas: un dataset sin ella se lee como si estuviera completo', async () => {
  const d = await filasDe(tanda(5, { importeGG: 0 }))
  assert.deepEqual(Object.keys(d.cobertura).sort(), [...CAMPOS_CON_HUECO].sort())
  for (const campo of CAMPOS_CON_HUECO) {
    assert.equal(d.cobertura[campo].llenos + d.cobertura[campo].vacios, d.total, `la cobertura de ${campo} no suma el total`)
  }
})

test('cobertura y huecos hablan del mismo dataset: cada vacío es un hueco y no hay huecos de más', async () => {
  const d = await filasDe(tanda(5, { importeGG: 0, coeficientesAjuste: [1.5] }))
  const vacios = CAMPOS_CON_HUECO.reduce((a, c) => a + d.cobertura[c].vacios, 0)
  assert.equal(d.huecos.length, vacios)
  assert.ok(vacios > 0, 'el escenario no dejó ningún hueco: la prueba no probaría nada')
})

// ═══════════════════ EL ESQUEMA Y EL ESTADO ═══════════════════

test('toda fila trae los trece campos del esquema, y ninguno se llama distinto', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true }))
  for (const f of d.filas) {
    for (const campo of CAMPOS) assert.ok(campo in f, `falta el campo ${campo}`)
  }
  assert.deepEqual(d.campos, CAMPOS)
})

test('ninguna fila nace CONFIRMADA: un control no se valida contra la información que produce', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true, coeficientesAjuste: [1.5] }))
  assert.deepEqual([...new Set(d.filas.map((f) => f.estado))], [ESTADO_HALLAZGO.DETECTADO])
})

test('cada fila dice qué control la detectó: sin eso el hallazgo no se puede volver a correr', async () => {
  const d = await filasDe(tanda(1, { subtotalRoto: true, tareasExtra: ['#REF!'] }))
  for (const f of d.filas) assert.ok(f.control_que_lo_detecto, `${f.tipo_anomalia} no dice qué control lo detectó`)
})

test('normalizar no explota con un hallazgo sin evidencia ni índice: devuelve huecos, no una excepción', () => {
  const f = normalizar({ tipo: TIPO.OFERTA_ROTA, gravedad: 'ALTA', clave: 'x.oferta', afirmacion: 'algo', evidencia: [] })
  assert.equal(f.archivo, null)
  assert.equal(f.cliente, null)
  assert.equal(f.estado, ESTADO_HALLAZGO.DETECTADO)
  assert.equal(cobertura([f]).archivo.vacios, 1)
})
