// LAS HORAS SALEN DE LAS LÍNEAS, Y LA COLUMNA DE RESUMEN ESTÁ CORRIDA UN BLOQUE.
//
// Los casos son composiciones literales de `Planilla para Cotizar (2).xlsm`. El más importante es
// el par T1019/T1020: el resumen de T1019 vale 18,5 / 18,0 y ésa es la composición de T1020. Si
// alguien vuelve a leer `Análisis!M:N` como si fueran las HH de la tarea de al lado, la prueba
// «el resumen de T1019 es en realidad la composición de T1020» se pone roja.
import assert from 'node:assert/strict'
import test from 'node:test'
import { COLUMNA_ANALISIS, INDICE_ROTO_DIAGRAMACION, contrastarConResumen, hhPorCategoria, verificarColumnasHH } from './base-maestra-hh.mjs'

/** T1001 REPLANTEO, `Análisis!7:14`. 0,06 h de oficial y 0,06 de ayudante por m². */
const T1001 = Object.freeze([
  { nombre: 'OFICIAL', cantidad: 0.06, tipo: 'mano_obra' },
  { nombre: 'AYUDANTE', cantidad: 0.06, tipo: 'mano_obra' },
  { nombre: 'CARGA SOCIAL OF', cantidad: 0.06, tipo: 'carga_social' },
  { nombre: 'CARGA SOCIAL AY', cantidad: 0.06, tipo: 'carga_social' },
  { nombre: 'CLAVO PUNTA PARIS 2"', cantidad: 0.03, tipo: 'material' },
  { nombre: 'TANZA', cantidad: 0.04, tipo: 'material' },
  { nombre: 'ALFALJIA', cantidad: 0.08, tipo: 'material' },
])

/** T1058 INSTALACIÓN ELECTRICA, `Análisis!559:571`: 45 h de oficial especializado, 50 de ayudante. */
const T1058 = Object.freeze([
  { nombre: 'OFICIAL ESPECIALIZADO', cantidad: 45, tipo: 'mano_obra' },
  { nombre: 'AYUDANTE', cantidad: 50, tipo: 'mano_obra' },
  { nombre: 'CARGA SOCIAL OF', cantidad: 50, tipo: 'carga_social' },
  { nombre: 'CARGA SOCIAL AY', cantidad: 50, tipo: 'carga_social' },
  { nombre: 'CABLE UNIPOLAR 1,5 TIPO PIRELLI', cantidad: 260, tipo: 'material' },
])

/** T1126.1, la partida en dólares: el oficial especializado también se llama distinto. */
const T1126_1 = Object.freeze([
  { nombre: 'OFICIAL ESPECIALIZADO - EN DOLARES', cantidad: 1, tipo: 'mano_obra' },
  { nombre: 'CARGA SOCIAL OF E - DOLAR', cantidad: 1, tipo: 'carga_social' },
  { nombre: 'COSTO HORA BOBCAT S650 - DOLAR', cantidad: 1, tipo: 'equipo' },
])

test('las HH salen de las líneas de mano de obra, separadas por categoría', () => {
  const hh = hhPorCategoria(T1001)
  assert.equal(hh.oficial_h_u, 0.06)
  assert.equal(hh.ayudante_h_u, 0.06)
  assert.equal(hh.total_h_u, 0.12)
  assert.equal(hh.lineasUsadas, 2)
})

test('EL DEFECTO: las cargas sociales NO son horas de trabajo, y hay dos barreras', () => {
  // Se cotizan por `hr` y llevan «OF»/«AY» en el nombre. La primera barrera es el tipo:
  // `clasificarTipo()` las marca `carga_social` y acá no entran. Si esa barrera falla —alguien
  // las importa como mano de obra— la segunda es la categoría: «CARGA SOCIAL OF» no dice
  // OFICIAL, así que no se suma a ninguna categoría y aparece en `sinCategoria`, visible.
  assert.equal(hhPorCategoria(T1001).total_h_u, 0.12)
  const siPasaranElTipo = hhPorCategoria(T1001.map((l) => ({ ...l, tipo: l.tipo === 'carga_social' ? 'mano_obra' : l.tipo })))
  assert.equal(siPasaranElTipo.total_h_u, 0.12, 'ni siquiera con el tipo mal se cuentan como horas')
  assert.deepEqual(siPasaranElTipo.sinCategoria.map((x) => x.nombre), ['CARGA SOCIAL OF', 'CARGA SOCIAL AY'])
})

test('un regex de categoría escrito como /OF/ o /AY/ se tragaría las cargas sociales', () => {
  // La prueba de que el `\b` de `CATEGORIA` no es cosmético: sin él, «CARGA SOCIAL OF» pasa por
  // oficial y la dotación de T1001 se duplica a 0,24 h/m².
  assert.equal(/\bOFICIAL\b/.test('CARGA SOCIAL OF'), false)
  assert.equal(/\bAYUDANTE\b|\bAYUD\b|\bPEON\b/.test('CARGA SOCIAL AY'), false)
  assert.equal(/OF/.test('CARGA SOCIAL OF'), true, 'así se rompía')
})

test('el oficial especializado cuenta como oficial, se llame como se llame', () => {
  assert.equal(hhPorCategoria(T1058).oficial_h_u, 45)
  assert.equal(hhPorCategoria(T1058).ayudante_h_u, 50)
  assert.equal(hhPorCategoria(T1126_1).oficial_h_u, 1)
})

test('materiales y equipos no aportan horas', () => {
  assert.equal(hhPorCategoria(T1126_1).total_h_u, 1)
  assert.equal(hhPorCategoria([{ nombre: 'HORMIGÓN H-17', cantidad: 30, tipo: 'material' }]).total_h_u, 0)
})

test('una línea de mano de obra sin categoría reconocible se lista, no se reparte', () => {
  const hh = hhPorCategoria([
    { nombre: 'OFICIAL', cantidad: 2, tipo: 'mano_obra' },
    { nombre: 'MANO DE OBRA VARIOS', cantidad: 5, tipo: 'mano_obra' },
  ])
  assert.equal(hh.oficial_h_u, 2)
  assert.equal(hh.ayudante_h_u, 0)
  assert.equal(hh.sinCategoria.length, 1)
  assert.equal(hh.sinCategoria[0].cantidad, 5)
})

test('una cantidad que no es número no vale cero: se lista', () => {
  const hh = hhPorCategoria([{ nombre: 'OFICIAL', cantidad: null, tipo: 'mano_obra' }])
  assert.equal(hh.total_h_u, 0)
  assert.equal(hh.sinCategoria[0].porque, 'la línea no tiene cantidad')
})

test('EL DEFECTO PRINCIPAL: el resumen de T1019 es en realidad la composición de T1020', () => {
  // `Análisis!M231/N231` (cabecera de T1019) valen 18,5 / 18,0. La composición de T1019 suma
  // 2,08 / 1,04; la de T1020, 18,5 / 18,0. La fórmula posicional del resumen se corrió un bloque.
  const t1019 = hhPorCategoria([
    { nombre: 'OFICIAL', cantidad: 2.08, tipo: 'mano_obra' },
    { nombre: 'AYUDANTE', cantidad: 1.04, tipo: 'mano_obra' },
  ])
  const contra = contrastarConResumen(t1019, { M: 18.5, N: 18 })
  assert.equal(contra.estado, 'DIFIERE')
  assert.match(contra.porque, /apunta a otro bloque/)
  // Y la prueba de que es un CORRIMIENTO y no ruido: ese resumen es exacto para la tarea siguiente.
  const t1020 = hhPorCategoria([
    { nombre: 'OFICIAL', cantidad: 18.5, tipo: 'mano_obra' },
    { nombre: 'AYUDANTE', cantidad: 18, tipo: 'mano_obra' },
  ])
  assert.equal(contrastarConResumen(t1020, { M: 18.5, N: 18 }).estado, 'COINCIDE')
})

test('un resumen vacío es SIN_RESUMEN, nunca 0 horas', () => {
  // 116 de las 173 tareas con mano de obra tienen el resumen vacío (100) o corrido (16). Cero
  // horas de oficial diría que la partida no lleva trabajo.
  const r = contrastarConResumen(hhPorCategoria(T1001), { M: null, N: null })
  assert.equal(r.estado, 'SIN_RESUMEN')
  assert.notEqual(r.estado, 'COINCIDE')
})

test('el resumen NUNCA es la fuente: la composición viene rotulada como tal', () => {
  assert.equal(hhPorCategoria(T1001).fuente, 'COMPOSICION')
  assert.equal(contrastarConResumen(hhPorCategoria(T1001), { M: 0.06, N: 0.06 }).resumen.fuente, 'COLUMNA_RESUMEN_ANALISIS')
})

test('EL ÍNDICE QUE USA DIAGRAMACION NO ES EL DE LAS HH', () => {
  // `VLOOKUP(B8, Análisis!A:N, 10)` rotulado «OF» trae CS —pesos— y el 11 rotulado «AY» trae FECHA.
  assert.equal(INDICE_ROTO_DIAGRAMACION.of, COLUMNA_ANALISIS.CS)
  assert.equal(INDICE_ROTO_DIAGRAMACION.ay, COLUMNA_ANALISIS.FECHA)
  assert.notEqual(INDICE_ROTO_DIAGRAMACION.of, COLUMNA_ANALISIS.OF_E_OF)
  assert.notEqual(INDICE_ROTO_DIAGRAMACION.ay, COLUMNA_ANALISIS.AY)
  assert.equal(COLUMNA_ANALISIS.OF_E_OF, 13)
  assert.equal(COLUMNA_ANALISIS.AY, 14)
})

test('si alguien inserta una columna en el libro, el guardarraíl lo dice', () => {
  const bueno = { J: 'CS', K: 'FECHA', M: 'OF E - OF', N: 'AY' }
  assert.deepEqual(verificarColumnasHH(bueno), [])
  const corrido = { J: 'CS', K: 'CONSIDERACIONES', M: 'AY', N: '' }
  assert.equal(verificarColumnasHH(corrido).length, 3)
})
