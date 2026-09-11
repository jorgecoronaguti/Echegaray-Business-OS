import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  letraColumna, celdaA1, serialAIso, diaSemanaIso, isoDesdeTexto, normalizarClave, parseHoras,
  celdaEscrita, detectarBloques, resolverColumnas, trabajadoresDeBloque, bloquePorFecha,
  columnaDeFecha, obrasDeBloque, personalDeObra, leerCeldaDiaria,
} from './jornales-estructura.mjs'
import { gridJornales, isoASerial, FECHA_HOY, FECHA_SABADO, FECHA_INEXISTENTE } from './jornales-fixture.mjs'

const grid = gridJornales()
const bloques = detectarBloques(grid, { anio: 2026 })
const julio = bloquePorFecha(bloques, FECHA_HOY)
const enero = bloquePorFecha(bloques, '2026-01-05')

test('letraColumna cubre una y dos letras (AB es la 28ª)', () => {
  assert.equal(letraColumna(0), 'A')
  assert.equal(letraColumna(5), 'F')
  assert.equal(letraColumna(25), 'Z')
  assert.equal(letraColumna(26), 'AA')
  assert.equal(letraColumna(27), 'AB')
  assert.throws(() => letraColumna(-1))
})

test('celdaA1 cita la pestaña (los nombres tienen espacios)', () => {
  assert.equal(celdaA1('Obreros 26', 21, 5), "'Obreros 26'!F21")
})

test('serial de Google ↔ ISO, ida y vuelta sin corrimiento de día', () => {
  assert.equal(serialAIso(isoASerial('2026-07-30')), '2026-07-30')
  assert.equal(serialAIso(isoASerial('2026-01-01')), '2026-01-01')
  assert.equal(serialAIso('no'), null)
})

test('el día de la semana se CALCULA — no se lee la fila de letras (que tiene un error real)', () => {
  assert.equal(diaSemanaIso('2026-07-30'), 4) // jueves
  assert.equal(diaSemanaIso('2026-07-29'), 3) // miércoles: el Sheet lo rotula "M"
  const col29 = julio.fechas.find((f) => f.iso === '2026-07-29')
  assert.equal(col29.dia_semana, 3, 'no debe heredar el rótulo equivocado del Sheet')
})

test('isoDesdeTexto usa el año de contexto y rechaza basura', () => {
  assert.equal(isoDesdeTexto('30/7', 2026), '2026-07-30')
  assert.equal(isoDesdeTexto('5/1/25', null), '2025-01-05')
  assert.equal(isoDesdeTexto('40/7', 2026), null)
  assert.equal(isoDesdeTexto('hola', 2026), null)
})

test('normalizarClave colapsa espacios, acentos e invisibles sin tocar el original', () => {
  assert.equal(normalizarClave('LA  ESTRELLA'), 'LA ESTRELLA')
  assert.equal(normalizarClave('OFICINAS Y FÁBRICA'), 'OFICINAS Y FABRICA')
  assert.equal(normalizarClave('Quiroga Sebastian '), 'QUIROGA SEBASTIAN')
  assert.equal(normalizarClave('a​b'), 'A B')
})

test('parseHoras acepta coma y punto, rechaza texto libre', () => {
  assert.equal(parseHoras('5,5'), 5.5)
  assert.equal(parseHoras('5.5'), 5.5)
  assert.equal(parseHoras(9), 9)
  assert.equal(parseHoras('0'), 0)
  assert.equal(parseHoras(''), null)
  assert.equal(parseHoras(null), null)
  assert.equal(parseHoras('NO SE TOCA HASTA JUL'), null)
  assert.equal(parseHoras('8 hs'), null)
})

test('celda vacía NO es 0 — son estados distintos', () => {
  assert.equal(celdaEscrita(null), false)
  assert.equal(celdaEscrita({ valor: '' }), false)
  assert.equal(celdaEscrita({ valor: '0', numero: 0 }), true)
  assert.equal(celdaEscrita({ valor: '14', formula: '=8+6' }), true)
})

test('detecta los dos bloques y NO confunde la fila "5/1 al 15/1" (sólo 2 fechas)', () => {
  assert.equal(bloques.length, 2)
  assert.equal(enero.fila1, 6)
  assert.equal(julio.fila1, 20)
})

test('los bloques tienen ANCHOS distintos — nada de columnas fijas', () => {
  assert.equal(enero.fechas.length, 10)
  assert.equal(julio.fechas.length, 14)
  assert.equal(letraColumna(enero.col_hasta), 'O')
  assert.equal(letraColumna(julio.col_hasta), 'S')
})

test('las columnas de identidad salen del bloque si las trae, y de la fila 1 si no', () => {
  // enero NO trae rótulos propios → los toma de la fila 1
  assert.equal(letraColumna(enero.columnas.nombre), 'B')
  assert.equal(letraColumna(enero.columnas.cliente), 'AB')
  assert.equal(enero.columnas.categoria, null)
  // julio SÍ trae rótulos propios, incluida Categoria
  assert.equal(letraColumna(julio.columnas.nombre), 'B')
  assert.equal(letraColumna(julio.columnas.obra), 'AC')
  assert.equal(letraColumna(julio.columnas.categoria), 'D')
})

test('resolverColumnas devuelve null si el rótulo no existe en ningún lado', () => {
  const c = resolverColumnas({ filas: [[], []] }, 1)
  assert.equal(c.nombre, null)
  assert.equal(c.cliente, null)
})

test('trabajadoresDeBloque corta en la fila de totales y NO toma las categorías UOCRA', () => {
  const tE = trabajadoresDeBloque(grid, enero)
  assert.equal(tE.length, 3)
  const nombres = tE.map((t) => t.nombre_original)
  assert.ok(!nombres.some((n) => /Oficial|Ayudante|UOCRA/i.test(n)), 'las categorías del convenio no son personas')
})

test('salta la fila intermedia sin nombre (importes) sin cerrar el bloque', () => {
  const tJ = trabajadoresDeBloque(grid, julio)
  assert.equal(tJ.length, 6, 'los 6 trabajadores, ni uno menos por la fila de importes')
  assert.equal(tJ[5].nombre_original, 'Reta Sebastian')
})

test('el mismo trabajador vive en filas distintas en cada bloque', () => {
  const enE = trabajadoresDeBloque(grid, enero).find((t) => t.nombre_clave === 'AGUERO CRISTIAN')
  const enJ = trabajadoresDeBloque(grid, julio).find((t) => t.nombre_clave === 'AGUERO CRISTIAN')
  assert.notEqual(enE.fila1, enJ.fila1)
})

test('el nombre con espacio final matchea por clave y conserva el original', () => {
  const t = trabajadoresDeBloque(grid, julio).find((t) => t.nombre_clave === 'QUIROGA SEBASTIAN')
  assert.equal(t.nombre_original, 'Quiroga Sebastian ')
})

test('obras duplicadas por espacios/acentos colapsan en UNA sola opción', () => {
  const obras = obrasDeBloque(grid, julio)
  const estrella = obras.filter((o) => o.cliente_clave === 'LA ESTRELLA')
  assert.equal(estrella.length, 1, 'LA  ESTRELLA / OFICINAS Y FÁBRICA es la misma que LA ESTRELLA / OFICINAS Y FABRICA')
  assert.equal(estrella[0].personas, 2)
  // el texto ORIGINAL se preserva (no se normaliza el Sheet)
  assert.equal(estrella[0].cliente_original, 'LA  ESTRELLA')
})

test('las obras no incluyen filas sin cliente ni obra, ni totales, ni vacíos', () => {
  const obras = obrasDeBloque(grid, julio)
  assert.deepEqual(obras.map((o) => o.clave).sort(), [
    'JAVIER SANCHEZ|REVOQUE', 'LA ESTRELLA|OFICINAS Y FABRICA', 'MESSINAS|BASES DE TANQUE',
  ].sort())
  assert.ok(!obras.some((o) => o.etiqueta.trim() === ''))
})

test('personalDeObra devuelve sólo la cuadrilla de esa obra', () => {
  const p = personalDeObra(grid, julio, 'JAVIER SANCHEZ|REVOQUE')
  assert.equal(p.length, 3)
  const vacia = personalDeObra(grid, julio, 'OBRA|QUE NO EXISTE')
  assert.equal(vacia.length, 0)
})

test('bloquePorFecha devuelve null si la fecha no existe (no se crea una columna)', () => {
  assert.equal(bloquePorFecha(bloques, FECHA_INEXISTENTE), null)
  assert.ok(bloquePorFecha(bloques, FECHA_SABADO))
})

test('columnaDeFecha resuelve la columna exacta y declara la ambigüedad', () => {
  const c = columnaDeFecha(julio, FECHA_HOY)
  assert.equal(c.ok, true)
  assert.equal(letraColumna(c.col), 'R')
  assert.equal(columnaDeFecha(julio, FECHA_INEXISTENTE).motivo, 'fecha_no_en_bloque')
  const dup = { fechas: [{ iso: 'x', col: 1 }, { iso: 'x', col: 9 }] }
  assert.equal(columnaDeFecha(dup, 'x').motivo, 'fecha_ambigua')
})

test('leerCeldaDiaria distingue vacía, 0, fórmula y texto no numérico', () => {
  const col = columnaDeFecha(julio, FECHA_HOY).col
  const tJ = trabajadoresDeBloque(grid, julio)
  const vacia = leerCeldaDiaria(grid, tJ[0].fila, col)
  assert.equal(vacia.escrita, false)
  assert.equal(vacia.horas, null)

  const cargada = leerCeldaDiaria(grid, tJ[5].fila, col) // Reta: 30/7 ya tiene 9
  assert.equal(cargada.escrita, true)
  assert.equal(cargada.horas, 9)

  const colExtra = columnaDeFecha(julio, '2026-07-16').col
  const conFormula = leerCeldaDiaria(grid, tJ[1].fila, colExtra)
  assert.equal(conFormula.formula, '=8+6')
  assert.equal(conFormula.horas, 14)

  const colTexto = columnaDeFecha(julio, '2026-07-31').col
  const conTexto = leerCeldaDiaria(grid, tJ[2].fila, colTexto)
  assert.equal(conTexto.texto_no_numerico, true)
  assert.equal(conTexto.horas, null)

  const colCero = columnaDeFecha(julio, '2026-07-22').col
  const cero = leerCeldaDiaria(grid, tJ[2].fila, colCero)
  assert.equal(cero.escrita, true)
  assert.equal(cero.horas, 0)
})

test('trabajadoresDeBloque falla claro si no hay columna de nombre', () => {
  assert.throws(
    () => trabajadoresDeBloque({ filas: [[], []] }, { fila: 0, fila1: 1, fechas: [], columnas: { nombre: null } }),
    /no se pudo resolver la columna de nombre/,
  )
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UN RÓTULO DE CIERRE NO CIERRA UNA FILA QUE TIENE NOMBRE (11/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La fila 124 de «Oficina 26» es la de JUAN PABLO NIEVAS: nombre en B, 46 h en U, $416.300 en Z, y
// la palabra «BANCO» suelta en AD —parte de un cuadrito de resumen que vive a la derecha—.
// `RE_CIERRE` la leía como el fin del bloque, así que Nievas no existía para ningún consumidor de
// `trabajadoresDeBloque`, incluido el importador que carga `registros_hh`. Le pasaba en 8 de las 15
// quincenas de Oficina del año.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: volver a `if (RE_CIERRE.test(texto)) break` sin mirar el nombre.

const celdaDe = (v) => (v == null ? null : { valor: v, numero: typeof v === 'number' ? v : null, formula: null, derivada: false })

/** La fila real de Nievas, medida con una sonda de sólo lectura sobre el archivo vivo. */
function gridOficinaConNievas() {
  const fila1 = ['x', 'OBRERO', 'Fecha de Alta', 'DIAS TRABAJADOS', null, null, null,
    null, null, null, null, null, null, null, null, null, null, null,
    'u', null, 'DIAS / HORAS', '$ HORA', 'BANCO', 'ADELANTO', 'TOTAL RECIBO', 'TOTAL SEMANA', 'OBRA']
  const enc = []
  for (let j = 0; j < 4; j++) enc[j] = null
  const isos = ['3/8', '4/8', '5/8', '6/8']
  isos.forEach((t, k) => { enc[4 + k] = { valor: t, numero: 46231 + k, formula: null, derivada: false } })
  const maldonado = []
  maldonado[0] = celdaDe('1'); maldonado[1] = celdaDe('Emi Maldonado')
  for (let k = 0; k < 4; k++) maldonado[4 + k] = celdaDe(9)
  maldonado[20] = celdaDe(36); maldonado[25] = celdaDe('$398.200')
  const nievas = []
  nievas[0] = celdaDe('4'); nievas[1] = celdaDe('Juan Pablo Nievas')
  for (let k = 0; k < 4; k++) nievas[4 + k] = celdaDe(9)
  nievas[20] = celdaDe(36); nievas[25] = celdaDe('$416.300')
  // ← LA PALABRA QUE CERRABA EL BLOQUE, en AD (29), lejos de todo lo suyo.
  nievas[29] = celdaDe('BANCO')
  return {
    titulo: 'Oficina 26',
    filas: [fila1.map(celdaDe), enc, maldonado, nievas, []],
    merges: [], offset: { fila: 0, col: 0 },
  }
}

test('UN «BANCO» SUELTO EN OTRA COLUMNA NO SACA A LA PERSONA DEL BLOQUE', () => {
  const g = gridOficinaConNievas()
  const [b] = detectarBloques(g, { anio: 2026 })
  const t = trabajadoresDeBloque(g, b)
  assert.deepEqual(t.map((x) => x.nombre_original), ['Emi Maldonado', 'Juan Pablo Nievas'])
})

test('EL ENCABEZADO DEL BLOQUE SIGUIENTE CORTA: una quincena no se lleva a la gente de la otra', () => {
  // Es la red que reemplaza lo que `RE_CIERRE` hacía de más. Sin ella, aflojar el corte dejaría que
  // el recorrido pasara de largo el cuadro de referencia y siguiera hasta el bloque de abajo.
  const g = gridOficinaConNievas()
  const enc2 = []
  ;['1/9', '2/9', '3/9'].forEach((t, k) => { enc2[4 + k] = { valor: t, numero: 46260 + k, formula: null, derivada: false } })
  const otro = []
  otro[0] = celdaDe('1'); otro[1] = celdaDe('Alguien De Septiembre'); otro[4] = celdaDe(9)
  g.filas.push(enc2, otro)
  const [b] = detectarBloques(g, { anio: 2026 })
  const nombres = trabajadoresDeBloque(g, b).map((x) => x.nombre_original)
  assert.ok(!nombres.includes('Alguien De Septiembre'), 'el bloque de agosto no se lleva a septiembre')
  assert.equal(nombres.length, 2)
})

test('UNA FILA SIN NOMBRE CON UN RÓTULO DE CIERRE SIGUE CERRANDO', () => {
  const g = gridOficinaConNievas()
  const cierre = []
  cierre[29] = celdaDe('CAJA')
  const despues = []
  despues[0] = celdaDe('9'); despues[1] = celdaDe('No Deberia Entrar'); despues[4] = celdaDe(9)
  g.filas.splice(4, 0, cierre, despues)
  const [b] = detectarBloques(g, { anio: 2026 })
  const nombres = trabajadoresDeBloque(g, b).map((x) => x.nombre_original)
  assert.deepEqual(nombres, ['Emi Maldonado', 'Juan Pablo Nievas'])
})
