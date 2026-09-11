// EL ESPEJO DEL BLOQUE, CONTRA LA GRAMÁTICA REAL DEL ARCHIVO.
//
// Se prueba sobre `jornales-fixture.mjs`, que reproduce las rarezas medidas en «Obreros 26» el
// 30/07/2026: dos bloques de anchos distintos, rótulos propios en uno y heredados de la fila 1 en el
// otro, fechas como serial y como texto, una celda con fórmula de extras, otra con texto libre, una
// vacía y un 0 conviviendo, y una fila de totales que cierra el bloque.
//
// LA MUTACIÓN QUE LOS PONE ROJOS: sumar las celdas para calcular el total en vez de leer la columna
// que la planilla calcula, o dejar que una columna sin rótulo caiga en una letra adivinada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gridJornales, JULIO } from './jornales-fixture.mjs'
import {
  columnasDelResumen, espejoDeGrid, filasDelEspejo, fotoDelBloque, resumir,
} from './jornales-espejo.mjs'
import { detectarBloques, bloquePorFecha } from './jornales-estructura.mjs'

/**
 * UNA GRILLA MÍNIMA CON UNA FILA 1 DE RÓTULOS Y UN BLOQUE DEBAJO — para fijar el encabezado REAL.
 *
 * El fixture grande reproduce el archivo de JULIO; esto fija el de HOY, medido con una sonda de sólo
 * lectura. Los dos tienen que convivir: el mapeo se resuelve por rótulo justamente para que el
 * layout pueda cambiar sin que nadie toque código.
 */
function gridDeRotulos(fila1, { colDesde = 5, colHasta = 17 } = {}) {
  const celdaTxt = (v) => (v == null ? null : { valor: v, numero: null, formula: null, derivada: false })
  const filas = [
    fila1.map(celdaTxt),
    [],  // la fila del bloque: sin rótulos propios, como el bloque vigente del archivo real
    [],
  ]
  return {
    grid: { titulo: 'x', filas, merges: [], offset: { fila: 0, col: 0 } },
    bloque: { fila: 1, fila1: 2, col_desde: colDesde, col_hasta: colHasta, fechas: [] },
  }
}

const grid = gridJornales()
const bloques = detectarBloques(grid, { anio: 2026 })
const julio = bloquePorFecha(bloques, '2026-07-16')

test('LA VENTANA SALE DEL MIN Y EL MAX, NO DE LA PRIMERA Y LA ÚLTIMA COLUMNA', () => {
  // En el archivo real las fechas del encabezado vienen desordenadas. Rotular la quincena con la
  // primera columna la nombra mal, y una quincena mal nombrada no coteja contra ninguna.
  const foto = fotoDelBloque(grid, julio, { pestana: 'Obreros 26' })
  const ordenadas = [...JULIO].sort()
  assert.equal(foto.desde, ordenadas[0])
  assert.equal(foto.hasta, ordenadas[ordenadas.length - 1])
  assert.equal(foto.dias, JULIO.length)
})

test('LAS HORAS DE CADA DÍA SON LAS DE LA CELDA, Y LO QUE NO ES NÚMERO NO ES CERO', () => {
  const foto = fotoDelBloque(grid, julio, { pestana: 'Obreros 26' })
  const alaniz = foto.personas.find((p) => /Alaniz/i.test(p.nombre))
  // El 22/7 tiene un 0 CARGADO: es un día escrito que vale cero, no un día sin cargar.
  assert.equal(alaniz.horas_por_dia['2026-07-22'], 0)
  // El 31/7 tiene texto libre («NO SE TOCA HASTA JUL»): entra como null, nunca como 0.
  assert.equal(alaniz.horas_por_dia['2026-07-31'], null)
  assert.ok('2026-07-31' in alaniz.horas_por_dia, 'la celda está ESCRITA: tiene que figurar')
  // El 30/7 no está cargado para nadie salvo Reta: no aparece la clave.
  assert.ok(!('2026-07-30' in alaniz.horas_por_dia), 'una celda vacía no genera clave')

  const quiroga = foto.personas.find((p) => /Quiroga/i.test(p.nombre))
  // Celda con fórmula de extras `=8+6`: vale 14, que es lo que la planilla muestra.
  assert.equal(quiroga.horas_por_dia['2026-07-16'], 14)
})

test('EL TOTAL SE LEE DE LA COLUMNA DE LA PLANILLA — NO SE SUMA ACÁ', () => {
  // EL DEFECTO QUE ATRAPA, y es el motivo por el que este módulo existe: si el total saliera de sumar
  // las celdas, el cotejo compararía la suma del OS contra la suma del OS y diría «coincide» siempre,
  // incluso el día que el parser se coma una celda. Un control no se valida contra la información que
  // produce.
  const foto = fotoDelBloque(grid, julio, { pestana: 'Obreros 26' })
  const aguero = foto.personas.find((p) => /Aguero/i.test(p.nombre))
  const sumaDeCeldas = Object.values(aguero.horas_por_dia).reduce((s, h) => s + (h ?? 0), 0)
  assert.ok(sumaDeCeldas > 0, 'el fixture tiene horas cargadas')
  // El fixture NO tiene la columna de resumen cargada para esta fila: la planilla no dice nada, y el
  // espejo tampoco. NULL, y nunca la suma propia disfrazada de dato de la planilla.
  assert.equal(aguero.horas, null)
  assert.notEqual(aguero.horas, sumaDeCeldas)
})

test('LAS COLUMNAS DEL RESUMEN SE RESUELVEN POR RÓTULO, Y LA QUE NO ESTÁ QUEDA EN NULL', () => {
  // El fixture reproduce el encabezado de JULIO/2026: V «DIAS / HORAS», W «$ HORA», AA «TOTAL
  // SEMANA». No tiene las columnas de la cadena de pago — y eso es parte de lo que se prueba: lo que
  // el archivo no rotula viaja NULL, nunca leído de una letra adivinada.
  const cols = columnasDelResumen(grid, julio)
  assert.equal(cols.horas, 21, 'V = DIAS / HORAS')
  assert.equal(cols.valorHora, 22, 'W = $ HORA')
  assert.equal(cols.cobra, 26, 'AA = TOTAL SEMANA en el layout de julio')
  assert.equal(cols.adelanto, null)
  assert.equal(cols.yaTransferido, null)
  assert.equal(cols.porBanco, null)
  assert.equal(cols.enEfectivo, null)
})

test('EL ENCABEZADO REAL DE «Obreros 26», MEDIDO EL 11/09/2026', () => {
  // ESTE ES EL TEST QUE IMPORTA PARA LA PLATA. Los rótulos salen de una sonda de sólo lectura sobre
  // la fila 1 del archivo vivo. Si el layout se corre —alguien inserta una columna— este test sigue
  // verde (se resuelve por rótulo) y si alguien CAMBIA un rótulo, se pone rojo acá antes de que un
  // adelanto aparezca en la celda equivocada de la liquidación.
  const g = gridDeRotulos([
    'x', 'OBRERO', 'Fecha de Ingreso', null, 'DIAS TRABAJADOS', null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null,
    'DIAS / HORAS', '$ HORA', 'BANCO', 'ADELANTO BANCO / EMBARGOS', 'ADELANTO EFECTIVO',
    'TOTAL EFECTIVO', 'TOTAL SEMANA', 'CLIENTE', 'OBRA', 'Dias trabajados en la semana',
  ])
  const cols = columnasDelResumen(g.grid, g.bloque)
  assert.equal(cols.horas, 21, 'V')
  assert.equal(cols.valorHora, 22, 'W')
  assert.equal(cols.porBanco, 23, 'X = BANCO')
  assert.equal(cols.yaTransferido, 24, 'Y = ADELANTO BANCO / EMBARGOS')
  assert.equal(cols.adelanto, 25, 'Z = ADELANTO EFECTIVO')
  assert.equal(cols.enEfectivo, 26, 'AA = TOTAL EFECTIVO')
  assert.equal(cols.cobra, 27, 'AB = TOTAL SEMANA')
})

test('«ADELANTO BANCO / EMBARGOS» NO ES EL ADELANTO EN EFECTIVO', () => {
  // EL DEFECTO QUE ATRAPA: `/^adelanto/` matchea las DOS columnas, y la primera que aparece es la de
  // embargos. Sin el orden de resolución, el embargo de una persona entraría como su adelanto en
  // efectivo — dos importes distintos en la misma celda de la liquidación, y los dos se restan.
  const g = gridDeRotulos([
    ...Array(21).fill(null),
    'DIAS / HORAS', '$ HORA', 'BANCO', 'ADELANTO BANCO / EMBARGOS', 'ADELANTO EFECTIVO',
    'TOTAL EFECTIVO', 'TOTAL SEMANA',
  ])
  const cols = columnasDelResumen(g.grid, g.bloque)
  assert.notEqual(cols.adelanto, cols.yaTransferido)
  assert.equal(cols.adelanto, 25)
  assert.equal(cols.yaTransferido, 24)
})

test('EL ENCABEZADO REAL DE «Oficina 26»: SIN «YA TRANSFERIDO», Y ESO ES UN DATO', () => {
  // Oficina no tiene columna de adelanto por banco. Viaja NULL — que NO es cero: «no hay columna» y
  // «no le transfirieron nada» son dos afirmaciones distintas, y una de las dos se resta del sueldo.
  const g = gridDeRotulos([
    // A..D, después catorce columnas de día sin rótulo, «u» en S (18) y el resumen desde U (20).
    'x', 'OBRERO', 'Fecha de Alta', 'DIAS TRABAJADOS', ...Array(14).fill(null),
    'u', null, 'DIAS / HORAS', '$ HORA', 'BANCO', 'ADELANTO', 'TOTAL RECIBO', 'TOTAL SEMANA',
    'OBRA',
  ], { colDesde: 4, colHasta: 15 })
  const cols = columnasDelResumen(g.grid, g.bloque)
  assert.equal(cols.horas, 20, 'U')
  assert.equal(cols.valorHora, 21, 'V')
  assert.equal(cols.porBanco, 22, 'W = BANCO')
  assert.equal(cols.adelanto, 23, 'X = ADELANTO')
  assert.equal(cols.enEfectivo, 24, 'Y = TOTAL RECIBO')
  assert.equal(cols.cobra, 25, 'Z = TOTAL SEMANA')
  assert.equal(cols.yaTransferido, null, 'no existe la columna: NULL, no 0')
})

test('UN RÓTULO QUE CAE DENTRO DE LAS COLUMNAS DE DÍA NO ES UNA COLUMNA DE RESUMEN', () => {
  // EL DEFECTO QUE ATRAPA: publicar las horas de un martes como si fueran el total de la quincena.
  const cols = columnasDelResumen(grid, julio)
  for (const [clave, j] of Object.entries(cols)) {
    if (j == null) continue
    assert.ok(
      j < julio.col_desde || j > julio.col_hasta,
      `${clave} cayó en el tramo de días (${j})`,
    )
  }
})

test('EL ESPEJO TOMA LOS DOS BLOQUES Y NO SE LLEVA LAS FILAS QUE NO SON PERSONAS', () => {
  const { bloques: fotos, hallazgos } = espejoDeGrid(grid, { pestana: 'Obreros 26', anio: 2026 })
  assert.equal(hallazgos.length, 0)
  assert.equal(fotos.length, 2, 'enero y julio')
  const nombres = fotos.flatMap((f) => f.personas.map((p) => p.nombre))
  // Las categorías UOCRA de la tabla de referencia parecen nombres y no lo son.
  for (const falso of ['UOCRA', 'Oficial', 'Ayudante', 'Medio Oficial', 'Oficial Especializado']) {
    assert.ok(!nombres.includes(falso), `«${falso}» no es una persona`)
  }
  assert.equal(fotos[1].personas.length, 6, 'seis trabajadores en el bloque de julio')
})

test('QUIEN NO EMPAREJA VIAJA CON `persona_id` EN NULL — NO SE DESCARTA NI SE CREA', () => {
  // EL DEFECTO QUE ATRAPA: tirar la fila. El bloque parecería más chico, el cotejo del resto daría
  // bien, y alguien quedaría sin liquidar sin que nada lo diga.
  const { bloques: fotos } = espejoDeGrid(grid, { pestana: 'Obreros 26', anio: 2026 })
  const { filas, sinPersona } = filasDelEspejo(fotos, {
    personas: [
      { id: 'u1', nombre_completo: 'AGUERO CRISTIAN DOMINGO', en_la_empresa: true, es_prueba: false },
      { id: 'u2', nombre_completo: 'ALANIZ EMANUEL ARIEL', en_la_empresa: true, es_prueba: false },
    ],
  })
  const julioFilas = filas.filter((f) => f.quincena_desde === '2026-07-16')
  assert.equal(julioFilas.length, 6, 'las seis filas viajan')
  assert.equal(julioFilas.filter((f) => f.persona_id != null).length, 2)
  assert.ok(sinPersona.some((s) => /Pastran/i.test(s.nombre)))
  assert.ok(sinPersona.every((s) => s.pestana === 'Obreros 26' && s.fila1 > 0))
})

test('LA IDENTIDAD ES ESTRUCTURAL: dos homónimos no colapsan en una fila', () => {
  const { bloques: fotos } = espejoDeGrid(grid, { pestana: 'Obreros 26', anio: 2026 })
  const { filas } = filasDelEspejo(fotos, { personas: [] })
  const claves = filas.map((f) => `${f.pestana}|${f.bloque_fila1}|${f.fila1}`)
  assert.equal(new Set(claves).size, claves.length, 'ninguna clave repetida')
  // El mismo trabajador aparece en los dos bloques: son dos filas, no una.
  const quirogas = filas.filter((f) => /Quiroga/i.test(f.nombre_planilla))
  assert.equal(quirogas.length, 2)
  assert.notEqual(quirogas[0].quincena_desde, quirogas[1].quincena_desde)
})

test('EL RESUMEN DEL ENSAYO CUENTA LO QUE NO PUDO LEER', () => {
  const { bloques: fotos } = espejoDeGrid(grid, { pestana: 'Obreros 26', anio: 2026 })
  const { filas } = filasDelEspejo(fotos, { personas: [] })
  const r = resumir(filas)
  assert.equal(r.length, 2)
  const julioR = r.find((x) => x.clave.includes('2026-07-16'))
  assert.equal(julioR.personas, 6)
  assert.equal(julioR.sinPersona, 6, 'sin padrón, las seis quedan sin persona y se dicen')
  assert.equal(julioR.sinHoras, 6, 'el fixture no carga la columna de resumen: se cuenta, no se inventa')
})
