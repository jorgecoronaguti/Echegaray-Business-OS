// EL DEFECTO: LA CLAVE SE RECORTABA DE UN SOLO LADO, Y NUEVE PERSONAS CONTABAN CERO.
//
// El bloque 1.1 de «Jornales por Quincena» contaba 5 de 17 personas para el piso de convenio. La
// causa, medida el 28/08: `categoriasDelBloque` armaba la lista de categorías con `.trim()` —"OF",
// "A"— y las fórmulas la buscaban con `COUNTIFS` contra la columna D del espejo SIN recortar, donde
// el dueño escribió "OF ", "A " con un espacio al final. `COUNTIFS` no normaliza su rango: nueve
// personas contaban cero, sin un error y sin una celda roja. Otras tres quedaban afuera por dos
// códigos nuevos de la quincena en curso (`OF E`, `M OF`).
//
// ═══ POR QUÉ ESTE ARCHIVO TRAE UN EVALUADOR ═══
//
// Lo que hay que probar no es que la fórmula diga TRIM: es que el CONTEO sea el mismo con la columna
// sucia y con la columna limpia. Eso sólo se afirma ejecutando la fórmula sobre una grilla, y acá no
// hay Sheets. `evaluar` implementa las semánticas que están en juego —`COUNTIFS` compara el valor
// CRUDO de la celda, `TRIM` colapsa los espacios internos y los de las puntas, `N` lee un texto como
// cero— y falla ruidoso ante cualquier forma que no reconoce, para que reescribir la fórmula de otra
// manera no pase en silencio.
//
// LA MUTACIÓN: si las tres fórmulas vuelven a `COUNTIFS/SUMIFS/MINIFS` sobre el rango sin recortar,
// el primer test se pone rojo con 5 contra 17.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriasDelBloque, filasPlantel, personasDelBloque } from './motor-salarial.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { CONVENIO_POR_CODIGO, claveDeCategoria } from './uocra-paritaria.mjs'

// ── LA GRILLA SINTÉTICA: EL PLANTEL DE LA QUINCENA 17/08–31/08, CON SUS CÓDIGOS ──
//
// 17 personas. Los códigos son los que trae el espejo: nueve con el espacio al final que escribe el
// dueño, dos con el código nuevo `OF E` (Pastran y Quiroga ascendieron) y uno con `M OF` (Castillo).
// Los $/hora no cambian el conteo, pero hacen que la Σ signifique algo cuando el test la compara.
const PLANTEL = [
  ['Aguero', 'OF ', 5600], ['Ochoa', 'OF ', 5600], ['Petina', 'OF ', 5300],
  ['Rosales', 'OF ', 5400], ['Tello', 'OF ', 5500], ['Sosa', 'A ', 4500],
  ['Alaniz', 'A ', 4600], ['Gonzalez', 'A ', 4400], ['Videla', 'A ', 4500],
  ['Navarro', 'OF M', 5200], ['Molina', 'OF M', 5100], ['Diaz', 'A M', 4300],
  ['Funes', 'A M', 4200], ['Luna', 'A M', 4400],
  ['Pastran', 'OF E', 6000], ['Quiroga Sebastian', 'OF E', 6100],
  ['Castillo', 'M OF', 5600],
]
const F0 = 526
const BLOQUE = { inicio: F0, fin: F0 + PLANTEL.length - 1 }
const HOJA = '_J_OBREROS'

/** El espejo: B = nombre, D = categoría, W = $/hora. Con `sucio=false` la columna D viene limpia. */
function espejo({ sucio = true, jornalRaro = null } = {}) {
  const g = []
  PLANTEL.forEach(([nombre, cat, jornal], i) => {
    const fila = []
    fila[1] = nombre
    fila[3] = sucio ? cat : cat.replace(/\s+/g, ' ').trim()
    fila[22] = jornalRaro && nombre === jornalRaro.nombre ? jornalRaro.valor : jornal
    g[F0 - 1 + i] = fila
  })
  return g
}

// ── EL EVALUADOR ──
const RANGO = /^'([^']+)'!\$([A-Z])\$(\d+):\$\2\$(\d+)$/
const COL = { D: 3, W: 22 }
const valores = (grid, ref) => {
  const m = RANGO.exec(ref)
  if (!m) throw new Error(`no sé resolver el rango ${ref}`)
  const c = COL[m[2]]
  if (c == null) throw new Error(`no sé resolver la columna ${m[2]}`)
  const out = []
  for (let r = Number(m[3]); r <= Number(m[4]); r++) out.push((grid[r - 1] ?? [])[c] ?? '')
  return out
}
/** `TRIM` de Sheets: colapsa los espacios internos y saca los de las puntas. */
const TRIM = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
/** `N` de Sheets: un texto vale cero. Es lo que evita el #VALUE! en el producto. */
const N = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const ES_NUM = (v) => typeof v === 'number' && Number.isFinite(v)
/** `COUNTIFS`/`SUMIFS` comparan el valor CRUDO de la celda: no recortan nada. Ésta es la causa raíz. */
const CRUDO = (v) => (typeof v === 'string' ? v : String(v ?? ''))

const FORMAS = [
  // Las tres que emite el generador HOY.
  [/^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\)\)$/, (g, [rango, clave]) =>
    valores(g, rango).filter((v) => TRIM(v) === clave).length],
  [/^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\);N\((.+?)\)\)$/, (g, [rango, clave, imp]) => {
    const d = valores(g, rango); const w = valores(g, imp)
    return d.reduce((acc, v, i) => acc + (TRIM(v) === clave ? 1 : 0) * N(w[i]), 0)
  }],
  [/^=IFERROR\(MIN\(FILTER\((.+?);TRIM\((.+?)\)="(.*)";ISNUMBER\((.+?)\);(.+?)>0\)\);""\)$/,
    (g, [imp, rango, clave]) => {
      const d = valores(g, rango); const w = valores(g, imp)
      const hits = w.filter((v, i) => TRIM(d[i]) === clave && ES_NUM(v) && v > 0)
      return hits.length ? Math.min(...hits) : ''
    }],
  // Las tres de ANTES. Viven acá para que la mutación se pueda correr de verdad: si alguien las
  // revierte, el evaluador las entiende y el test falla por el NÚMERO, que es lo que importa.
  [/^=COUNTIFS\((.+?);"(.*)"\)$/, (g, [rango, clave]) =>
    valores(g, rango).filter((v) => CRUDO(v) === clave).length],
  [/^=SUMIFS\((.+?);(.+?);"(.*)"\)$/, (g, [imp, rango, clave]) => {
    const d = valores(g, rango); const w = valores(g, imp)
    return d.reduce((acc, v, i) => acc + (CRUDO(v) === clave ? N(w[i]) : 0), 0)
  }],
  [/^=IFERROR\(MINIFS\((.+?);(.+?);"(.*)";(.+?);">0"\);""\)$/, (g, [imp, rango, clave]) => {
    const d = valores(g, rango); const w = valores(g, imp)
    const hits = w.filter((v, i) => CRUDO(d[i]) === clave && ES_NUM(v) && v > 0)
    return hits.length ? Math.min(...hits) : ''
  }],
]

function evaluar(formula, grid) {
  for (const [re, fn] of FORMAS) {
    const m = re.exec(String(formula))
    if (m) return fn(grid, m.slice(1))
  }
  throw new Error(`el evaluador no reconoce esta fórmula, así que no puede afirmar nada sobre ella: ${formula}`)
}

const cuadro = (grid) => filasPlantel({
  hoja: HOJA, bloque: BLOQUE, categorias: categoriasDelBloque(grid, BLOQUE),
  personas: personasDelBloque(grid, BLOQUE), filaInicio: 40, escalonVigente: null,
  tabla: CONVENIO_POR_CODIGO,
})
const filasDeCategoria = (c) => c.filas.slice(1, 1 + (c.fUltima - c.fPrimera + 1))
/** Lo que publica la fila de TOTAL de 1.1: la suma de la columna B de las categorías. */
const personasDelCuadro = (grid) =>
  filasDeCategoria(cuadro(grid)).reduce((acc, f) => acc + Number(evaluar(f[1], grid)), 0)
const sigmaDelCuadro = (grid) =>
  filasDeCategoria(cuadro(grid)).reduce((acc, f) => acc + Number(evaluar(f[2], grid)), 0)

test('EL DEFECTO · el piso cuenta a las 17 personas aunque la planilla escriba "OF " con un espacio', () => {
  const sucio = espejo({ sucio: true })
  assert.equal(personasDelBloque(sucio, BLOQUE), 17, 'la nómina del bloque son 17')
  // ÉSTE es el número que la pestaña real publicaba en 5. Con la mutación —volver a COUNTIFS sobre
  // el rango crudo— esta grilla cae a 8: cuentan sólo los ocho cuyo código no lleva espacio al final
  // (OF M, A M, OF E, M OF). En el archivo vivo caían a 5 porque la distribución es otra; lo que se
  // prueba acá no es el 5, es que la gente con espacio deja de contar.
  assert.equal(personasDelCuadro(sucio), 17,
    'el piso de convenio volvió a dejar gente afuera por un espacio al final del código')
})

test('la columna sucia y la limpia dan EXACTAMENTE lo mismo — persona por persona y peso por peso', () => {
  const sucio = espejo({ sucio: true })
  const limpio = espejo({ sucio: false })
  assert.equal(personasDelCuadro(sucio), personasDelCuadro(limpio))
  assert.equal(sigmaDelCuadro(sucio), sigmaDelCuadro(limpio))
  // Y la Σ es la de las 17 personas, no la de un subconjunto.
  assert.equal(sigmaDelCuadro(sucio), PLANTEL.reduce((a, [, , j]) => a + j, 0))
})

test('un espacio DE MÁS en el medio del código tampoco parte la categoría en dos', () => {
  // `TRIM` de Sheets colapsa los espacios internos y `claveDeCategoria` hace lo mismo del lado JS. Si
  // una sola de las dos puntas dejara de colapsarlos, "OF  M" abriría una fila propia que cuenta 0.
  const g = espejo({ sucio: true })
  g[F0 - 1 + 9][3] = 'OF  M'   // Navarro, con dos espacios en el medio
  assert.deepEqual(categoriasDelBloque(g, BLOQUE), ['OF', 'A', 'OF M', 'A M', 'OF E', 'M OF'],
    'se abrió la categoría fantasma "OF  M": TRIM la colapsa en la fórmula y su fila cuenta 0')
  assert.equal(personasDelCuadro(g), 17)
  // NINGUNA FILA DEL CUADRO PUEDE CONTAR CERO. Todas salieron del propio bloque, así que todas tienen
  // a alguien: una en cero es una clave que la fórmula no puede encontrar. Sin esta vuelta, el total
  // sigue dando 17 —la fantasma cuenta 0 y la buena cuenta 2— y el cuadro miente con el total bien.
  for (const f of filasDeCategoria(cuadro(g))) {
    assert.ok(Number(evaluar(f[1], g)) > 0, `la fila «${f[0]}» cuenta 0 personas y salió del propio bloque`)
  }
})

test('los dos códigos nuevos de la quincena tienen su fila, con su gente y su equivalencia', () => {
  const g = espejo({ sucio: true })
  const c = cuadro(g)
  const filaDe = (cat) => c.filas.find((f) => f[0] === cat)
  assert.ok(filaDe('OF E'), 'Pastran y Quiroga ascendieron a Oficial Especializado y no tienen fila')
  assert.ok(filaDe('M OF'), 'Castillo entró el 19/08 y no tiene fila')
  assert.equal(evaluar(filaDe('OF E')[1], g), 2)
  assert.equal(evaluar(filaDe('M OF')[1], g), 1)
  assert.deepEqual(c.equivalencias.find(([k]) => k === 'OF E'), ['OF E', 'Oficial Especializado'])
  assert.deepEqual(c.equivalencias.find(([k]) => k === 'M OF'), ['M OF', 'Medio Oficial'])
})

test('un texto en la columna de importes no rompe la Σ ni contamina el mínimo', () => {
  // Con `(cond)*W` el producto da #VALUE! aunque la condición sea 0, y la fila entera se apaga.
  const g = espejo({ sucio: true, jornalRaro: { nombre: 'Aguero', valor: 'vacaciones' } })
  const filaOF = cuadro(g).filas.find((f) => f[0] === 'OF')
  assert.equal(evaluar(filaOF[1], g), 5, 'la persona sigue contando: tiene categoría, lo que falta es el importe')
  assert.equal(evaluar(filaOF[2], g), 5300 + 5400 + 5500 + 5600, 'el texto tiene que valer cero, no romper')
  assert.equal(evaluar(filaOF[3], g), 5300, 'el mínimo es el menor NUMÉRICO positivo, no el texto')
})

test('una categoría que no está en el bloque cuenta cero, y su mínimo es vacío', () => {
  const g = espejo({ sucio: true })
  const c = filasPlantel({
    hoja: HOJA, bloque: BLOQUE, categorias: ['ZZ'], personas: 17, filaInicio: 40, escalonVigente: null,
  })
  assert.equal(evaluar(c.filas[1][1], g), 0)
  assert.equal(evaluar(c.filas[1][2], g), 0)
  assert.equal(evaluar(c.filas[1][3], g), '', 'sin gente el mínimo es vacío, nunca 0: un 0 se lee como "cobra cero"')
})

test('las fórmulas se escriben en locale es-AR: el separador es ";" y nunca ","', () => {
  const c = cuadro(espejo({ sucio: true }))
  for (const f of filasDeCategoria(c)) {
    for (const celda of [f[1], f[2], f[3]]) {
      assert.doesNotMatch(String(celda), /,/, `una coma acá la escribe Sheets como error de fórmula: ${celda}`)
      assert.match(String(celda), /^=/)
    }
  }
})

// ═══ EL BARRIDO: NINGUNA PUNTA NUEVA PUEDE NORMALIZAR DISTINTO (28/08) ═══
//
// El primer intento de arreglo movió la asimetría en vez de matarla: `categoriasDelBloque` pasó a
// `claveDeCategoria` y `sigmaConvenioDelPlantel` —el control que valida la misma Σ por el otro
// camino— se quedó con `.trim()`. Antes eran consistentes en el error; después quedaron divergentes,
// que es peor: la pestaña publicaba $10.866 y el log $11.781.
//
// Este test recorre el árbol y prohíbe la forma que lo causó: leer la COLUMNA DE CATEGORÍA con un
// `.trim()` pelado. No prueba que todo el repo esté bien —no puede—; prueba que la puerta por la que
// entró este defecto tres veces esté cerrada, y que la normalización siga teniendo UNA definición.
const RAIZ = new URL('../', import.meta.url)
const fuentes = () => {
  const out = []
  const caminar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const url = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir)
      if (e.isDirectory()) { if (e.name !== 'node_modules') caminar(url); continue }
      if (e.name.endsWith('.mjs') && !e.name.includes('.test.')) out.push(url)
    }
  }
  caminar(RAIZ)
  return out
}

// LOS ARCHIVOS DONDE LA COLUMNA 3 ES LA CATEGORÍA. El barrido va acotado a propósito: `[3]` en otro
// archivo del repo es una factura, un «activo» o un nombre, y un guardián que grita por siete cosas
// que no son el defecto es un guardián que alguien borra en la próxima corrida. En estos ocho, la D
// del espejo `_J_OBREROS` es el código de categoría y nada más.
const LEEN_LA_COLUMNA_D = [
  'lib/motor-salarial.mjs', 'lib/proyeccion-convenio.mjs', 'lib/jornales-piso-uocra.mjs',
  'lib/desvinculacion-plantel.mjs', 'lib/nomina-devengado.mjs', 'lib/nomina-replica.mjs',
  'scripts/jornales-pestana.mjs', 'scripts/nomina-pestana.mjs',
]

test('nadie lee la columna de categoría con un .trim() pelado', () => {
  const POR_INDICE = /\[3\][^\n]*\.trim\(\)/
  // El nombre de la constante SÍ se puede barrer en todo el árbol: si una llama a la columna por su
  // nombre, está hablando de esta columna.
  const POR_NOMBRE = /\[(?:COL_CATEGORIA|COL\.categoria|col\.categoria)\][^\n]*\.trim\(\)/
  const culpables = []
  for (const f of fuentes()) {
    const rel = f.pathname.split('/orquestador/')[1]
    const re = LEEN_LA_COLUMNA_D.includes(rel) ? new RegExp(`${POR_INDICE.source}|${POR_NOMBRE.source}`) : POR_NOMBRE
    for (const [i, linea] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (re.test(linea)) culpables.push(`${rel}:${i + 1}  ${linea.trim()}`)
    }
  }
  assert.deepEqual(culpables, [],
    'una punta más que normaliza distinto de claveDeCategoria: la clave se recorta de un solo lado otra vez')
})

test('los ocho archivos de la lista siguen siendo los que leen esa columna', () => {
  // Si uno se renombra o se borra, el barrido de arriba se apaga en silencio para ese archivo. Esto
  // es lo que hace que la lista no pueda envejecer sin que nadie se entere.
  for (const rel of LEEN_LA_COLUMNA_D) {
    assert.ok(existsSync(new URL(rel, RAIZ)), `${rel} ya no existe: el barrido dejó de cubrirlo`)
  }
})

test('la normalización de una categoría tiene UNA definición, y las copias que quedan son idénticas', () => {
  // `desvinculacion-plantel.mjs` y `nomina-devengado.mjs` tienen su propio `texto()`, que hoy hace
  // EXACTAMENTE lo mismo que `claveDeCategoria` y por eso no rompe nada. No se unificaron porque ahí
  // `texto` normaliza también nombres y fechas —importar una función llamada «clave de categoría»
  // para limpiar un apellido sería mentir en la otra dirección—. Lo que este test impide es que
  // alguien las simplifique a un `.trim()`: ese día sus categorías dejan de encontrar su equivalencia.
  for (const rel of ['lib/desvinculacion-plantel.mjs', 'lib/nomina-devengado.mjs']) {
    const src = readFileSync(new URL(rel, RAIZ), 'utf8')
    assert.match(src, /const texto = \(v\) => String\(v \?\? ''\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)/,
      `${rel}: su normalización dejó de ser la misma que claveDeCategoria`)
  }
  // Y la definición canónica es la que colapsa los espacios internos, como TRIM en Sheets.
  assert.equal(claveDeCategoria(' OF   M '), 'OF M')
})
