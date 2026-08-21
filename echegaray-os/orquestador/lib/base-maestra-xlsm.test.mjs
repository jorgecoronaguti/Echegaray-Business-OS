import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarTipo, aRecurso, leerRecursos, leerAnalisis, codigo, aISO, texto, numero,
  esError, verificarEncabezado, ENCABEZADO_RECURSOS, familiaCanonica, LIBRO, esLinea,
} from './base-maestra-xlsm.mjs'

const HOY = '2026-08-21'
const rec = (fila, A, B, C, D, E, F, G, H, I) => ({ fila, A, B, C, D, E, F, G, H, I })

// ── EL TIPO LO DICE LA UNIDAD, NO EL COLOR ──────────────────────────────────────────────────────
test('unidad hs es mano de obra; el RODILLO pintado de verde no lo es', () => {
  assert.equal(clasificarTipo({ unidad: 'hs', familia: 'MANO DE OBRA', division: 'JORNALES', nombre: 'OFICIAL' }).tipo, 'mano_obra')
  // En `Análisis` RODILLO, THINNER y NAFTA están en verde: 58 filas verdes de 270 son ruido.
  assert.equal(clasificarTipo({ unidad: 'HR', familia: 'MAQUINA', division: '', nombre: 'ALQUILER DE RODILLO VIBRATORIO' }).tipo, 'equipo')
  assert.equal(clasificarTipo({ unidad: 'LT', familia: 'COMBUSTIBLE', division: '', nombre: 'NAFTA SUPER' }).tipo, 'material')
})

test('«hr» a secas NO es carga social: el SUMIF(D,"hr") de Excel es case-insensitive y metía los alquileres adentro', () => {
  // Las cuatro reales
  for (const n of ['CARGA SOCIAL OF E', 'CARGA SOCIAL OF', 'CARGA SOCIAL AY', 'CARGA SOCIAL OF E - DOLAR']) {
    assert.equal(clasificarTipo({ unidad: 'hr', familia: 'MANO DE OBRA', division: 'JORNALES', nombre: n }).tipo, 'carga_social', n)
  }
  // MÁQUINA CARGADORA cotiza por `hr` y NO es una carga social
  assert.equal(clasificarTipo({ unidad: 'hr', familia: 'CONTRATISTA', division: 'MAQUINA', nombre: 'MAQUINA CARGADORA' }).tipo, 'equipo')
  // Los `HR` en mayúscula que el SUMIF de Excel también sumaba como cargas sociales
  assert.equal(clasificarTipo({ unidad: 'HR', familia: '', division: '', nombre: 'GRUA 40 TONELADAS' }).tipo, 'otro')
  assert.equal(clasificarTipo({ unidad: 'HR', familia: 'MAQUINA', division: '', nombre: 'BOBCAT - ALQUILER HORA' }).tipo, 'equipo')
})

test('la mano de obra que no se cotiza por hora NO es mano_obra: hs_unitarias no mezcla m² con horas', () => {
  const casos = [
    ['CALCULO ESTRUCTURAL', 'M2'], ['EXCAVACION RESERVORIO', 'm3'],
    ['GEOMEMBRANA 1000 MICRONES con COLOCACION', 'm2'],
    ['MANO DE OBRA DE ARENADO Y PINTADO DE PILETAS', 'M2'], ['TECNICO HYS ', 'HR'],
  ]
  for (const [nombre, unidad] of casos) {
    const r = clasificarTipo({ unidad, familia: 'MANO DE OBRA', division: '', nombre })
    assert.equal(r.tipo, 'otro', `${nombre} (${unidad}) no puede sumar horas`)
    assert.match(r.porque, /subcontrato/)
  }
})

test('sin familia, sin division y sin unidad que hable, el tipo es otro y el motivo lo dice', () => {
  const r = clasificarTipo({ unidad: 'UN', familia: null, division: null, nombre: 'PLAFONES LED' })
  assert.equal(r.tipo, 'otro')
  assert.match(r.porque, /sin evidencia/)
})

test('MATEIAL es un typo de MATERIAL, no una familia', () => {
  assert.equal(familiaCanonica('MATEIAL'), 'MATERIAL')
  assert.equal(clasificarTipo({ unidad: 'KG', familia: 'MATEIAL', nombre: 'CUARZO PARA PISO INDUSTRIAL' }).tipo, 'material')
})

// ── EL DESPERDICIO ES FRACCIÓN ──────────────────────────────────────────────────────────────────
test('el desperdicio entra como fracción y un 5 tipeado donde va 0,05 se rechaza', () => {
  const ok = aRecurso(rec(10, 3, 'ADHESIVO KLAUKOL', 'kg', 460.06, 45870, 'RUIZ OLALDE', 'MATERIAL', 'AGLOMERANTES', 0.05), { ingesta: HOY })
  assert.equal(ok.ok, true)
  assert.equal(ok.recurso.desperdicio, 0.05)
  const mal = aRecurso(rec(11, 4, 'X', 'kg', 100, null, null, 'MATERIAL', null, 5), { ingesta: HOY })
  assert.equal(mal.ok, false)
  assert.match(mal.motivo, /no es una fracción/)
})

test('el desperdicio vacío es 0, no null: la vista multiplica por (1+desperdicio)', () => {
  const r = aRecurso(rec(12, 159, 'HORMIGÓN H-17', 'm3', 112000, null, 'HORMISERV', 'MATERIAL', 'HORMIGON', null), { ingesta: HOY })
  assert.equal(r.recurso.desperdicio, 0)
})

// ── EL CÓDIGO ES EL MISMO EN LAS DOS HOJAS ──────────────────────────────────────────────────────
test('«0.1» texto en Recursos y 0.1 número en Análisis son el mismo recurso', () => {
  assert.equal(codigo('0.1'), codigo(0.1))
  assert.equal(codigo(255.1), '255.1')
  assert.equal(codigo(1), '1')
  assert.equal(codigo('  T1002 '), 'T1002')
  assert.equal(codigo(''), null)
})

// ── NADA EN ERROR ENTRA ─────────────────────────────────────────────────────────────────────────
test('una celda #REF! no se convierte en texto ni en número: invalida la fila', () => {
  assert.equal(esError({ error: '#REF!' }), true)
  assert.equal(esError('#N/A'), true)
  assert.equal(texto({ error: '#REF!' }), null)
  assert.equal(numero({ error: '#VALUE!' }), null)
  const r = aRecurso(rec(20, 7, { error: '#REF!' }, 'kg', 100, null, null, 'MATERIAL', null, 0), { ingesta: HOY })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /está en error/)
})

test('una línea de análisis con #REF! en la cantidad se rechaza y no entra como 0', () => {
  const { tareas, invalidos } = leerAnalisis([
    { fila: 7, A: 'T1001', C: 'REPLANTEO', D: 'M2' },
    { fila: 8, B: 1, E: { error: '#REF!' } },
    { fila: 9, B: 2, E: 0.06 },
  ], { ingesta: HOY, recursosValidos: new Set(['1', '2']) })
  assert.equal(tareas[0].lineas.length, 1)
  assert.equal(invalidos.length, 1)
  assert.match(invalidos[0].motivo, /está en error/)
})

// ── LO QUE NO EXISTE NO ENTRA ───────────────────────────────────────────────────────────────────
test('el recurso «MAL» no existe en Recursos: la línea se rechaza y la tarea sobrevive', () => {
  const { tareas, invalidos } = leerAnalisis([
    { fila: 473, A: 'T1046', C: 'PILETA', D: 'UN' },
    { fila: 474, B: 'MAL' },
    { fila: 475, B: 1, E: 3 },
  ], { ingesta: HOY, recursosValidos: new Set(['1']) })
  assert.equal(tareas.length, 1)
  assert.equal(tareas[0].lineas.length, 1)
  assert.equal(invalidos.length, 1)
  assert.match(invalidos[0].motivo, /"MAL", que no existe/)
})

// ── LOS DUPLICADOS NO SE FUSIONAN ───────────────────────────────────────────────────────────────
test('código de tarea duplicado: gana el primero (VLOOKUP FALSE) y el segundo se denuncia con nombre y fila', () => {
  const { tareas, conflictos } = leerAnalisis([
    { fila: 739, A: 'Correa', C: 'PERFIL "C" 120x50x15X2', D: 'un' },
    { fila: 740, B: 1, E: 2 },
    { fila: 755, A: 'Correa', C: 'PERFIL "C" 140x50x15x2,5', D: 'un' },
    { fila: 756, B: 1, E: 9 },
  ], { ingesta: HOY, recursosValidos: new Set(['1']) })
  assert.equal(tareas.length, 1)
  assert.equal(tareas[0].fila, 739)
  assert.equal(tareas[0].nombre, 'PERFIL "C" 120x50x15X2')
  assert.equal(conflictos.length, 1)
  assert.deepEqual(conflictos[0].filas.map((f) => f.entra), [true, false])
  assert.equal(conflictos[0].filas[1].nombre, 'PERFIL "C" 140x50x15x2,5')
})

test('código de recurso duplicado NO se fusiona: no entra ninguno de los dos', () => {
  const { recursos, conflictos, precios } = leerRecursos([
    rec(5, 99, 'A', 'un', 100, null, null, 'MATERIAL', null, 0),
    rec(6, 99, 'B', 'un', 200, null, null, 'MATERIAL', null, 0),
  ], { ingesta: HOY })
  assert.equal(recursos.length, 0)
  assert.equal(precios.length, 0)
  assert.equal(conflictos[0].clave, '99')
})

// ── NULL NO ES HOY Y CERO NO ES GRATIS ──────────────────────────────────────────────────────────
test('costo 0 o vacío NO crea precio: un recurso sin precio se ve, uno con precio $0 se suma como gratis', () => {
  assert.equal(aRecurso(rec(30, 167, 'X', 'un', 0, null, null, null, 'CARPINTERIA', 0), { ingesta: HOY }).precio, null)
  assert.equal(aRecurso(rec(31, 168, 'Y', 'un', null, null, null, null, null, 0), { ingesta: HOY }).precio, null)
  assert.notEqual(aRecurso(rec(32, 169, 'Z', 'un', 1, null, null, null, null, 0), { ingesta: HOY }).precio, null)
})

test('la fecha vacía queda NULL y la de 2017 queda en 2017: no se «actualiza» a hoy', () => {
  const sinFecha = aRecurso(rec(40, 288, 'MALLA SIMA', 'un', 90000, ' ', 'ALUMETAL', 'MATERIAL', 'ACERO', 0), { ingesta: HOY })
  assert.equal(sinFecha.precio.fecha_precio, null)
  const de2017 = aRecurso(rec(41, 289, 'LUMINARIA', 'un', 1000, 42887, 'X', 'MATERIAL', null, 0), { ingesta: HOY })
  assert.equal(de2017.precio.fecha_precio, '2017-06-01')
  assert.notEqual(de2017.precio.fecha_precio, HOY)
})

test('un número que no es una fecha creíble no se convierte en el año 3500', () => {
  assert.equal(aISO(460.06), null)
  assert.equal(aISO(999999), null)
  assert.equal(aISO(46143), '2026-05-01')
})

// ── TRAZABILIDAD ────────────────────────────────────────────────────────────────────────────────
test('cada dato dice de qué hoja, de qué fila y de qué ingestión salió', () => {
  const r = aRecurso(rec(8, 1, 'OFICIAL', 'hs', 5235, 46143, 'UOCRA', 'MANO DE OBRA', 'JORNALES', 0), { ingesta: HOY })
  assert.equal(r.recurso.origen, `${LIBRO} · Recursos!8 · ingesta ${HOY}`)
  assert.equal(r.precio.fuente, `${LIBRO} · Recursos!8 · ingesta ${HOY}`)
  assert.equal(r.precio.proveedor, 'UOCRA')
  const { tareas } = leerAnalisis([
    { fila: 7, A: 'T1001', C: 'REPLANTEO', D: 'M2' },
    { fila: 8, B: 1, E: 0.06 },
    { fila: 9, B: 2, E: 0.5, L: '0,5 Kg/m2' },
  ], { ingesta: HOY, recursosValidos: new Set(['1', '2']) })
  assert.equal(tareas[0].origen, `${LIBRO} · Análisis!7 · ingesta ${HOY}`)
  assert.equal(tareas[0].lineas[0].nota, 'Análisis!8')
  assert.equal(tareas[0].lineas[1].nota, 'Análisis!9 · 0,5 Kg/m2')
  assert.deepEqual(tareas[0].lineas.map((l) => l.orden), [0, 1])
})

// ── EL ENCABEZADO ES EL CONTRATO ────────────────────────────────────────────────────────────────
test('una columna insertada corre todo y se aborta antes de leer una fila', () => {
  const bien = { CODIGO: 0, A: 'CODIGO', B: 'INSUMO', C: 'UNIDAD', D: 'COSTO', E: 'FECHA', F: 'FUENTE', G: 'FAMILIA', H: 'DIVISION', I: 'DESPERDICIO' }
  assert.deepEqual(verificarEncabezado(bien, ENCABEZADO_RECURSOS), [])
  const corrido = { ...bien, D: 'FECHA', E: 'COSTO' }
  const problemas = verificarEncabezado(corrido, ENCABEZADO_RECURSOS)
  assert.equal(problemas.length, 2)
  assert.match(problemas[0], /columna D dice "FECHA"/)
})

test('las tareas sin descripción o sin unidad no entran, y se dice cuál', () => {
  const { tareas, invalidos } = leerAnalisis([
    { fila: 100, A: 'T9', C: null, D: 'M2' },
    { fila: 200, A: 'T8', C: 'ALGO', D: null },
    { fila: 300, A: 'T7', C: 'BIEN', D: 'M2' },
  ], { ingesta: HOY, recursosValidos: new Set() })
  assert.deepEqual(tareas.map((t) => t.codigo), ['T7'])
  assert.equal(invalidos.length, 2)
  assert.match(invalidos[0].motivo, /no tiene descripción/)
  assert.match(invalidos[1].motivo, /no tiene unidad/)
})

test('la tarea sin division ni metodo_medicion se carga en null: el libro no los tiene y no se inventan', () => {
  const { tareas } = leerAnalisis([{ fila: 7, A: 'T1001', C: 'REPLANTEO', D: 'M2' }], { ingesta: HOY })
  assert.equal(tareas[0].division, null)
  assert.equal(tareas[0].metodo_medicion, null)
})

// ── EL RÓTULO EN «COD T» NO ABRE UNA TAREA ──────────────────────────────────────────────────────
const VL = (b) => `IFERROR(VLOOKUP($B${b},Recursos,2,0),"")`

test('«Correa» en COD T al lado de un VLOOKUP es un rótulo, no una tarea: 23 tareas fantasma y 23 líneas perdidas', () => {
  const { tareas, conteo } = leerAnalisis([
    { fila: 738, A: 'T1090', C: 'CABREADA', D: 'un', f: {} },
    { fila: 739, A: 'Correa', B: 239, C: 'PERFIL "C" 120x50x15X2', E: 0.08, f: { C: VL(739) } },
    { fila: 742, B: 1, C: 'OFICIAL', E: 3, f: { C: VL(742) } },
  ], { ingesta: HOY, recursosValidos: new Set(['239', '1']) })
  assert.equal(tareas.length, 1)                       // no aparece la tarea «Correa»
  assert.equal(tareas[0].codigo, 'T1090')
  assert.equal(tareas[0].lineas.length, 2)             // y su línea NO se perdió
  assert.equal(tareas[0].lineas[0].rotulo, 'Correa')
  assert.equal(tareas[0].lineas[0].nota, 'Análisis!739 · Correa')
  assert.deepEqual(conteo, { cabeceras: 1, lineas: 2, rotuladas: 1, lineasRechazadas: 0 })
})

test('la cabecera con la descripción TIPEADA sí abre una tarea, aunque el código no sea T####', () => {
  const { tareas } = leerAnalisis([
    { fila: 10, A: 'PILETA-01', C: 'PILETA DE NATACION', D: 'UN', f: { C: null } },
    { fila: 11, B: 1, C: 'OFICIAL', E: 2, f: { C: VL(11) } },
  ], { ingesta: HOY, recursosValidos: new Set(['1']) })
  assert.deepEqual(tareas.map((t) => t.codigo), ['PILETA-01'])
  assert.equal(tareas[0].lineas.length, 1)
})

test('una fila de fórmula sin insumo no cuenta como línea ni ensucia el orden', () => {
  const { tareas, conteo } = leerAnalisis([
    { fila: 779, A: 'T1', C: 'X', D: 'un', f: {} },
    { fila: 780, B: 1, C: 'OFICIAL', E: 1, f: { C: VL(780) } },
    { fila: 781, B: null, C: '', E: null, f: { C: VL(781) } },
    { fila: 782, B: 2, C: 'AYUDANTE', E: 1, f: { C: VL(782) } },
  ], { ingesta: HOY, recursosValidos: new Set(['1', '2']) })
  assert.equal(conteo.lineas, 2)
  assert.deepEqual(tareas[0].lineas.map((l) => l.orden), [0, 1])
})

test('el «MAL» tipeado en la cabecera de T1045 se denuncia: no es una línea y no se importa', () => {
  const { tareas, invalidos } = leerAnalisis([
    { fila: 474, A: 'T1045', B: 'MAL', C: 'CONSTRUCCIÓN DE RAMPAS', D: 'UN', E: null, f: { C: null } },
    { fila: 475, B: 1, C: 'OFICIAL', E: 4, f: { C: VL(475) } },
  ], { ingesta: HOY, recursosValidos: new Set(['1']) })
  assert.equal(tareas.length, 1)
  assert.equal(tareas[0].codigo, 'T1045')
  assert.equal(tareas[0].lineas.length, 1)
  assert.equal(invalidos.length, 1)
  assert.match(invalidos[0].motivo, /trae el código de recurso "MAL" en COD R/)
})

test('sin la fórmula de C, una línea con COD R y sin COD T sigue siendo una línea: la red por si alguien la borra', () => {
  assert.equal(esLinea({ B: 1, f: {} }), true)
  assert.equal(esLinea({ A: 'T1', C: 'ALGO', f: {} }), false)
  assert.equal(esLinea({ A: 'Correa', B: 239, f: { C: VL(739) } }), true)
})
