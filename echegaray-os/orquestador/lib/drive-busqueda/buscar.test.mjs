// EL PIPELINE Y EL RANKING, CON UN ÍNDICE DE MENTIRA PERO CASOS DE VERDAD.
//
// Las filas de abajo son archivos REALES del Drive de la empresa (nombre y ruta salidos de
// `public.drive_index`). Un índice de juguete con nombres inventados prueba que el algoritmo
// funciona sobre nombres inventados; estos prueban que funciona sobre los nombres que la
// gente tiene que encontrar todos los días.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearIndice, buscar, analizarConsulta, ETAPAS } from './buscar.mjs'
import { puntuar, rankear, hayGanador, rutaLegible, carpetaDe, puntajeFrescura, PESOS } from './ranking.mjs'
import { _reiniciarSinonimos } from './normalizar.mjs'

const A = 'administracion'
const FILAS = [
  { drive_file_id: 'f-vision', name: 'Vision / Tracción', path: `${A}/Estrategia/Vision/Vision / Tracción`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-20T10:00:00Z', depth: 3 },
  { drive_file_id: 'f-cash', name: 'Flujo de Caja - Cash Flow ECSAS', path: `${A}/Flujo de Caja - Cash Flow ECSAS`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-31T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-daily', name: 'Daily Meeting - Echegaray Construcciones', path: `${A}/Daily Meeting - Echegaray Construcciones`, tipo: 'documento', is_folder: false, modified_time: '2026-07-29T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-avance1', name: 'Avances de Obra', path: `${A}/Avances de Obra`, tipo: 'archivo', is_folder: false, modified_time: '2026-07-15T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-avance2', name: 'Avances de Obra', path: `${A}/Estrategia/Avances de Obra`, tipo: 'archivo', is_folder: false, modified_time: '2026-06-15T09:00:00Z', depth: 2 },
  { drive_file_id: 'f-curva', name: 'Curva de Avance Fisico.xlsx', path: `${A}/Obras/Curva de Avance Fisico.xlsx`, tipo: 'planilla', is_folder: false, modified_time: '2026-05-01T09:00:00Z', depth: 2 },
  { drive_file_id: 'f-gastos', name: 'CONTROL DE GASTOS.xlsx', path: `${A}/CONTROL DE GASTOS.xlsx`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-10T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-gastos-pdf', name: 'PLANILLA DE GASTOS.pdf', path: `${A}/PRESUPUESTOS/PLANILLA DE GASTOS.pdf`, tipo: 'pdf', is_folder: false, modified_time: '2024-07-10T09:00:00Z', depth: 2 },
  { drive_file_id: 'f-estrategia', name: 'Estrategia', path: `${A}/Estrategia`, tipo: 'carpeta', is_folder: true, modified_time: '2026-07-01T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-jornales', name: 'JORNALES', path: `${A}/JORNALES`, tipo: 'planilla', is_folder: false, modified_time: '2026-07-28T09:00:00Z', depth: 1 },
  { drive_file_id: 'f-libro', name: 'Libro de Sueldos y Jornales de Enero de 2025.pdf', path: `${A}/LEGALES/Libro de Sueldos y Jornales de Enero de 2025.pdf`, tipo: 'pdf', is_folder: false, modified_time: '2025-02-01T09:00:00Z', depth: 2 },
]

const AHORA = new Date('2026-07-31T13:00:00Z').getTime()

/** Un port que no habla con ninguna base: devuelve las filas y nada más. */
function portDe(filas = FILAS, extra = {}) {
  const consultas = []
  return {
    consultas,
    query: async (sql, params) => {
      consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
      if (sql.includes('drive_index')) return { rows: filas }
      if (sql.includes('drive_alias')) return { rows: extra.alias ?? [] }
      if (sql.includes('drive_busqueda_uso')) return { rows: extra.usos ?? [] }
      return { rows: [] }
    },
  }
}

const buscarCon = async (texto, opts = {}) => {
  _reiniciarSinonimos()
  const port = opts.port ?? portDe(opts.filas, opts)
  const indice = crearIndice({ port })
  return { ...(await buscar({ indice, port, texto, tipo: opts.tipo ?? null, ahora: AHORA })), port, indice }
}

// ── Los casos que el dueño pidió, uno por uno ────────────────────────────────

const CASOS_VISION = [
  'vision', 'Vision', 'visión', 'Vision/Tracción', 'vision traccion', 'vision/traccion',
  'vision estrategia', 'estrategia vision', 'archivo vision', 'pasame vision', 'abrime vision',
  'pasame el archivo vision/traccion', 'quiero la planilla vision',
]
for (const caso of CASOS_VISION) {
  test(`"${caso}" encuentra Vision / Tracción`, async () => {
    const r = await buscarCon(caso)
    const primero = r.ganador ?? r.opciones[0]
    assert.ok(primero, `no encontró nada para "${caso}"`)
    assert.equal(primero.name, 'Vision / Tracción')
  })
}

test('"cash flow" y "flujo de caja" caen en el mismo archivo', async () => {
  for (const q of ['cash flow', 'flujo de caja', 'cashflow', 'el flujo']) {
    const r = await buscarCon(q)
    const primero = r.ganador ?? r.opciones[0]
    assert.equal(primero?.name, 'Flujo de Caja - Cash Flow ECSAS', q)
  }
})

test('"daily" encuentra el Daily Meeting', async () => {
  const r = await buscarCon('daily')
  assert.equal(r.ganador?.name, 'Daily Meeting - Echegaray Construcciones')
})

test('"control gastos" encuentra CONTROL DE GASTOS antes que PLANILLA DE GASTOS', async () => {
  const r = await buscarCon('control gastos')
  assert.equal(r.opciones[0].name, 'CONTROL DE GASTOS.xlsx')
})

test('"jornales" pone JORNALES arriba del Libro de Sueldos', async () => {
  const r = await buscarCon('jornales')
  assert.equal(r.opciones[0].name, 'JORNALES')
})

test('"avances obra" empata de verdad: dos archivos se llaman igual, así que pregunta', async () => {
  const r = await buscarCon('avances obra')
  assert.equal(r.ganador, null, 'no puede elegir por su cuenta entre dos nombres idénticos')
  assert.equal(r.opciones.length, 2)
  assert.equal(r.opciones[0].name, 'Avances de Obra')
  // A nombre igual, el más reciente primero.
  assert.equal(r.opciones[0].drive_file_id, 'f-avance1')
})

// ── Las etapas ───────────────────────────────────────────────────────────────

test('las cinco etapas están y en orden de la más estricta a la más laxa', () => {
  assert.deepEqual(ETAPAS.map((e) => e.nombre),
    ['exacta', 'normalizada', 'parcial', 'todos_los_tokens', 'alguna_palabra'])
})

test('etapa 1 (exacta): el nombre ES lo pedido', async () => {
  const r = await buscarCon('vision traccion')
  assert.equal(r.etapa, 'exacta')
})

test('etapa 3 (parcial): "vision" está DENTRO del nombre', async () => {
  const r = await buscarCon('vision')
  assert.equal(r.etapa, 'parcial')
})

test('etapa 4 (todos los tokens): "vision estrategia" cruza nombre y carpeta', async () => {
  const r = await buscarCon('vision estrategia')
  assert.equal(r.etapa, 'todos_los_tokens')
  assert.equal(r.ganador?.name, 'Vision / Tracción')
})

test('no encuentra lo que no está, y lo dice sin inventar', async () => {
  const r = await buscarCon('zzzz-inexistente-qwerty')
  assert.equal(r.etapa, null)
  assert.equal(r.ganador, null)
  assert.deepEqual(r.opciones, [])
})

test('el tipo pedido filtra, pero no deja a la persona sin nada', async () => {
  const conPdf = await buscarCon('gastos', { tipo: 'pdf' })
  assert.equal(conPdf.opciones[0].tipo, 'pdf')
  // No hay ninguna carpeta llamada "daily": el filtro no puede convertirlo en "no hay nada".
  const sinCarpeta = await buscarCon('daily', { tipo: 'carpeta' })
  assert.ok(sinCarpeta.opciones.length > 0)
})

// ── El ranking ───────────────────────────────────────────────────────────────

test('el nombre exacto le gana a un archivo mucho más nuevo', () => {
  const consulta = analizarConsulta('vision traccion')
  const viejoExacto = puntuar(FILAS[0], consulta, { ahora: AHORA })
  const nuevoQueApenasCoincide = puntuar(
    { name: 'otra cosa', path: `${A}/Vision`, tipo: 'planilla', modified_time: '2026-07-31T12:00:00Z', depth: 1 },
    consulta, { ahora: AHORA },
  )
  assert.ok(viejoExacto.score > nuevoQueApenasCoincide.score)
})

test('la palabra entera pesa más que el pedazo suelto', () => {
  const c = analizarConsulta('obra')
  const entera = puntuar({ name: 'Avances de Obra', path: A }, c, { ahora: AHORA })
  const pedazo = puntuar({ name: 'Maniobras varias', path: A }, c, { ahora: AHORA })
  assert.ok(entera.score > pedazo.score)
})

test('el nombre pesa más que la carpeta', () => {
  const c = analizarConsulta('estrategia')
  const enNombre = puntuar({ name: 'Estrategia 2026', path: `${A}/Otros` }, c, { ahora: AHORA })
  const enRuta = puntuar({ name: 'Acta 12', path: `${A}/Estrategia` }, c, { ahora: AHORA })
  assert.ok(enNombre.score > enRuta.score)
})

test('ante la duda, el archivo antes que la carpeta', () => {
  const c = analizarConsulta('estrategia')
  const archivo = puntuar({ name: 'Estrategia', path: A, is_folder: false }, c, { ahora: AHORA })
  const carpeta = puntuar({ name: 'Estrategia', path: A, is_folder: true }, c, { ahora: AHORA })
  assert.ok(archivo.score > carpeta.score)
})

test('la frescura desempata pero nunca decide sola', () => {
  assert.equal(puntajeFrescura(null), 0)
  assert.equal(puntajeFrescura('2020-01-01T00:00:00Z', AHORA), 0)
  assert.ok(puntajeFrescura('2026-07-31T00:00:00Z', AHORA) <= PESOS.FRESCURA_MAX)
  // Su techo es menor que el peso de UNA palabra en el nombre: no da vuelta un resultado.
  assert.ok(PESOS.FRESCURA_MAX < PESOS.TOKEN_NOMBRE)
})

test('el puntaje viene con el desglose de por qué', () => {
  const { senales } = puntuar(FILAS[0], analizarConsulta('vision traccion'), { ahora: AHORA })
  assert.ok(senales.nombre_exacto > 0)
  assert.ok(Object.keys(senales).length >= 2)
})

test('hayGanador: gana el que le saca diferencia, empata el que no', () => {
  assert.equal(hayGanador([]), false)
  assert.equal(hayGanador([{ score: 10 }]), true)
  assert.equal(hayGanador([{ score: 100 }, { score: 40 }]), true)
  assert.equal(hayGanador([{ score: 100 }, { score: 98 }]), false)
})

test('rutaLegible y carpetaDe muestran DÓNDE está, sin la ruta entera', () => {
  assert.equal(carpetaDe(`${A}/Estrategia/Vision/Vision / Tracción`), 'Vision')
  assert.equal(rutaLegible(`${A}/Estrategia/x`), 'administracion > Estrategia')
  assert.equal(rutaLegible('archivo-suelto'), null)
  assert.ok(rutaLegible('a/b/c/d/e/f').startsWith('…'))
})

// ── El aprendizaje ───────────────────────────────────────────────────────────

test('lo que se aceptó diez veces para esta consulta pasa a ir primero', async () => {
  const consulta = analizarConsulta('avances obra')
  const sinAprender = await buscarCon('avances obra')
  assert.equal(sinAprender.opciones[0].drive_file_id, 'f-avance1')

  const usos = [{ consulta_norm: consulta.norm, drive_file_id: 'f-avance2', veces: 10 }]
  const conAprendizaje = await buscarCon('avances obra', { usos })
  assert.equal(conAprendizaje.opciones[0].drive_file_id, 'f-avance2', 'el aprendizaje no movió el orden')
})

test('el aprendizaje tiene techo: no convierte en ganador a algo que no coincide', () => {
  const c = analizarConsulta('vision')
  const irrelevante = puntuar({ name: 'Acta 12', path: A }, c, { ahora: AHORA, aceptaciones: 999 })
  const bueno = puntuar(FILAS[0], c, { ahora: AHORA })
  assert.ok(bueno.score > irrelevante.score)
})

test('el índice se lee UNA vez y se reusa: no una consulta por búsqueda', async () => {
  _reiniciarSinonimos()
  const port = portDe()
  const indice = crearIndice({ port })
  for (let i = 0; i < 5; i++) await buscar({ indice, port, texto: 'vision', ahora: AHORA })
  const lecturas = port.consultas.filter((c) => c.sql.includes('drive_index')).length
  assert.equal(lecturas, 1, 'el índice se recargó de más')
  const usos = port.consultas.filter((c) => c.sql.includes('drive_busqueda_uso')).length
  assert.equal(usos, 1, 'el aprendizaje viaja con el índice, no por búsqueda')
})

test('sin las tablas nuevas el buscador funciona igual (la migración es una mejora, no un requisito)', async () => {
  _reiniciarSinonimos()
  const port = {
    query: async (sql) => {
      if (sql.includes('drive_index')) return { rows: FILAS }
      throw new Error('relation "public.drive_alias" does not exist')
    },
  }
  const indice = crearIndice({ port })
  const r = await buscar({ indice, port, texto: 'vision', ahora: AHORA })
  assert.equal(r.ganador?.name, 'Vision / Tracción')
})
