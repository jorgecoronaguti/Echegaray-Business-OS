// LA REGLA QUE DECIDE A QUIÉN SE LE COMPLETAN LOS DÍAS QUE FALTAN.
//
// `nomina-pestana.mjs` no tenía un solo test, y publica la pestaña que se mira el día de pago: si
// completa de más, se pagan horas que nadie trabajó; si completa de menos, se le descuentan a alguien
// que sí fue. La regla estaba adentro de un script de 800 líneas que lee el Sheet y escribe el Sheet,
// o sea imposible de probar sin tocar ninguno de los dos. Vive acá, pura, y acá se prueba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ultimaColumnaHabilCargada, dejoDeCargar } from './nomina-devengado.mjs'

/** Quincena 17→31/08/2026: 17 lunes … 22 sábado, 23 domingo, 24 lunes … 29 sábado, 30 domingo, 31 lunes. */
const COLUMNAS = [
  { col: 5, etiqueta: '17/08', habil: true }, { col: 6, etiqueta: '18/08', habil: true },
  { col: 7, etiqueta: '19/08', habil: true }, { col: 8, etiqueta: '20/08', habil: true },
  { col: 9, etiqueta: '21/08', habil: true }, { col: 10, etiqueta: '22/08', habil: false },
  { col: 11, etiqueta: '23/08', habil: false }, { col: 12, etiqueta: '24/08', habil: true },
  { col: 13, etiqueta: '25/08', habil: true }, { col: 14, etiqueta: '26/08', habil: true },
  { col: 15, etiqueta: '27/08', habil: true }, { col: 16, etiqueta: '28/08', habil: true },
  { col: 17, etiqueta: '29/08', habil: false }, { col: 18, etiqueta: '30/08', habil: false },
  { col: 19, etiqueta: '31/08', habil: true },
]
const cargóEn = (cols) => (col) => cols.includes(col)

test('el sábado de dos personas no deja a las otras catorce «sin cargar»', () => {
  // El caso del auditor: una guardia el sábado 29 para dos, el resto cargó hasta el viernes 28.
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17]))
  assert.equal(delResto, 16, 'el último día HÁBIL cargado es el viernes 28, no el sábado 29')
  const unaCualquiera = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14, 15, 16]))
  assert.equal(dejoDeCargar({ ultimaSuya: unaCualquiera, ultimaDelResto: delResto }), false,
    'cargó hasta el mismo viernes que el resto: sigue en el frente')
})

test('el que dejó de cargar de verdad sigue detectándose', () => {
  // Sosa Raúl: horas hasta el 25/08, baja ese día. El resto cargó hasta el 26.
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13, 14]))
  const suya = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7, 8, 9, 12, 13]))
  assert.equal(dejoDeCargar({ ultimaSuya: suya, ultimaDelResto: delResto }), true)
})

test('quien nunca cargó no cuenta como que dejó de cargar: es un alta, no una baja', () => {
  const delResto = ultimaColumnaHabilCargada(COLUMNAS, cargóEn([5, 6, 7]))
  assert.equal(dejoDeCargar({ ultimaSuya: -1, ultimaDelResto: delResto }), false)
})

test('si nadie cargó todavía, nadie dejó de cargar', () => {
  assert.equal(ultimaColumnaHabilCargada(COLUMNAS, cargóEn([])), -1)
  assert.equal(dejoDeCargar({ ultimaSuya: 5, ultimaDelResto: -1 }), false)
})

test('un sábado no puede ser el último día de nadie a los efectos de esta regla', () => {
  // Alguien que SÓLO cargó el sábado: no tiene día hábil, así que no se lo marca de baja.
  assert.equal(ultimaColumnaHabilCargada(COLUMNAS, cargóEn([10])), -1)
})

// ═══ LA PESTAÑA TIENE QUE DIBUJAR LA PROCEDENCIA, NO SÓLO LA CATEGORÍA (28/08/2026) ═══
//
// `rotuloConvenio` y `lineaEquivalenciasInferidas` están probadas en `uocra-paritaria.test.mjs`: lo
// que este test cuida es el CABLE. La columna «Convenio» dibujaba `conv`, que es la categoría pelada,
// y con eso `M OF → Medio Oficial` —una lectura del OS que el jornal de Castillo contradice— se veía
// idéntica al `OF → Oficial` que declaró el dueño. Volver a `conv ?? SIN_DATO` pone rojo esto.
//
// Es un test sobre el TEXTO del script, con el mismo criterio que `ancla-registro.test.mjs`: la
// pestaña sólo se puede generar leyendo y escribiendo el Sheet real, así que la alternativa era no
// probar el cable en absoluto.
const NOMINA = readFileSync(new URL('../scripts/nomina-pestana.mjs', import.meta.url), 'utf8')

test('la columna «Convenio» de la Nómina se dibuja con la marca de procedencia', () => {
  assert.match(NOMINA, /rotuloConvenio\(codigo\) \?\? SIN_DATO/,
    'volvió a dibujar la categoría pelada: una inferencia del OS se ve igual que una decisión del dueño')
  assert.match(NOMINA, /if \(conv && esInferida\(codigo\)\) conInferencia\.push/)
  assert.match(NOMINA, /const inferidas = lineaEquivalenciasInferidas\(conInferencia\)/,
    'la línea al pie que nombra las inferencias dejó de armarse')
  assert.match(NOMINA, /if \(inferidas\) fila\(sub\(inferidas\)\)/, 'se arma la línea pero no se escribe')
})

test('los comentarios de la Nómina no describen un código que ya no existe', () => {
  // El `Math.max(q.jornal, objetivo)` se borró y dos comentarios lo siguieron describiendo: "LO QUE SE
  // PAGA ES EL PISO × FACTOR" y "Si el jornal pactado ya es mayor…". En un módulo de nómina un
  // comentario que miente es una trampa armada para el que venga a tocarlo.
  assert.doesNotMatch(NOMINA, /LO QUE SE PAGA ES EL PISO × FACTOR/)
  assert.doesNotMatch(NOMINA, /Math\.max\(q\.jornal/)
  assert.doesNotMatch(NOMINA, /el escenario\n\s*\/\/ «piso» es el mismo que el de hoy/)
})

// ═══ LAS TRES TARIFAS DEL EMPLEADO, UNA AL LADO DE LA OTRA (29/08/2026) ═══
//
// El dueño ordenó rehacer el criterio: el convenio aporta el 50% de su básico como SUBA sobre lo que
// cada uno cobra hoy, no una tarifa que lo reemplaza. En la pestaña eso se tiene que poder LEER: qué
// cobra, cuánto sube, cuánto va a cobrar. Antes las dos puntas estaban separadas por tres columnas de
// plata y la del medio no existía — para saber cuánto subía cada uno había que restar dos celdas
// lejanas, que es justo la cifra que el dueño decidió.
test('la Nómina publica tarifa de hoy · aumento de su categoría · tarifa nueva, y en ese orden', () => {
  const enc = /fila\('Persona', 'Cat\.', 'Convenio'[\s\S]*?'Aumento'\)/.exec(NOMINA)
  assert.ok(enc, 'se fue el encabezado del cuadro 1 de la Nómina')
  const cols = [...enc[0].matchAll(/'([^']+)'/g)].map((m) => m[1])
  const i = cols.indexOf('$/h HOY')
  assert.ok(i > 0, 'desapareció la columna de lo que cobra hoy')
  // El «+» inicial NO puede volver: Sheets lo parsea como fórmula (=+Aumento…) y el encabezado
  // publica #ERROR!. Se vio en el render real del 29/08 — la celda decía #ERROR! sobre la columna
  // con los números correctos abajo.
  assert.ok(!cols.some((c) => /^\s*[+=]/.test(String(c ?? ''))), 'un rótulo que empieza con + o = entra como fórmula y publica #ERROR!')
  assert.deepEqual(cols.slice(i, i + 3), ['$/h HOY', 'Aumento $/h', '$/h CON AUMENTO'],
    'las tres tarifas dejaron de leerse seguidas: la cuenta no se puede seguir de izquierda a derecha')
  // Y el aumento sale de la MISMA función que la tarifa nueva: dos cuentas del mismo aumento se
  // separan el día que el porcentaje cambie.
  assert.match(NOMINA, /const suba = tarifaConAumento\(q\.jornal, basico\)/)
  assert.match(NOMINA, /suba \? Math\.round\(suba\.aumento\) : SIN_DATO/)
})

test('el vocabulario del código dice «aumento», no «piso» — no quedan dos nombres para la misma columna', () => {
  // Los nombres viejos sobrevivieron al cambio de criterio y quedaron nombrando un piso que ya no
  // existe, con los encabezados de la pestaña diciendo «CON AUMENTO». Dos vocabularios para la misma
  // columna es como alguien vuelve a implementar un piso creyendo que arregla algo.
  //
  // SE MIRA EL CÓDIGO, NO LA PROSA: la primera versión de este test se puso roja contra su propio
  // comentario, que nombraba las variables viejas para explicar de qué hablaba. Un guard que no
  // distingue una mención de un uso obliga a no poder escribir de qué se trata.
  const codigo = NOMINA.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n')
  for (const viejo of ['jornalPiso', 'pisoR', 'bancoPiso', 'efPiso', 'totPiso']) {
    assert.doesNotMatch(codigo, new RegExp(`\\b${viejo}\\b`),
      `volvió ${viejo} a la Nómina: el código nombra un piso que no existe`)
  }
  // Y el guard tiene que poder ver un uso de verdad: si no, es una constante que siempre da verde.
  assert.match(`${codigo}\nconst jornalPiso = 1`, /\bjornalPiso\b/)
})
