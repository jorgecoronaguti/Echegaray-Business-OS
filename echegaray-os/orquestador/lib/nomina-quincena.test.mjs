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

test('la Nómina NOMBRA las equivalencias que dedujo el OS, no las hace pasar por decididas', () => {
  // ═══ QUÉ CUIDA ESTE TEST, Y QUÉ DEJÓ DE CUIDAR ═══
  //
  // Cuidaba dos cosas: que la columna «Convenio» del cuadro 1 llevara la marca de procedencia, y que
  // al pie se nombraran las equivalencias deducidas. La columna se fue el 31/08 cuando el dueño
  // ordenó rehacer el cuadro como instrucción de pago —«quiero saber cuanto y como tengo q pagarle a
  // cada uno»—, y el convenio no es parte de esa instrucción.
  //
  // Lo que NO se fue, y es lo que importa, es la línea al pie: una equivalencia que dedujo el OS
  // —«M OF → Medio Oficial», que el jornal de Castillo contradice— no puede leerse igual que una que
  // declaró el dueño. Sin columna, esa distinción vive entera en esa línea, así que el test la exige
  // más fuerte que antes: que se detecte, que se arme y que se escriba.
  assert.match(NOMINA, /if \(conv && esInferida\(codigo\)\) conInferencia\.push/,
    'dejó de detectar qué equivalencias dedujo el OS')
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
test('la Nómina publica las dos tarifas seguidas, y la plata ANTES que el detalle', () => {
  // ═══ EL ENCABEZADO SE BUSCA POR SU PRIMERA COLUMNA, NO POR LA SEGUNDA ═══
  //
  // Este test anclaba al literal `fila('Persona', 'Cat.', 'Convenio'`. El 31/08/2026 el dueño mandó
  // rehacer el cuadro para que se leyera como una instrucción de pago —«quiero saber cuanto y como
  // tengo q pagarle a cada uno»— y las columnas de plata pasaron al frente. El test se puso rojo por
  // el reordenamiento, no por un defecto: seguía exigiendo que «Cat.» fuera la segunda columna.
  //
  // Lo que este test cuida NO es el orden general del cuadro —ése lo decide el dueño— sino UNA cosa
  // que sí es del código: que las tres tarifas se lean seguidas. Así que ahora ancla sólo a
  // «'Persona'» y verifica la vecindad de las tres, que es la propiedad que importa.
  // Se busca la línea de encabezado que CONTIENE las tarifas, no «la primera que empieza con
  // Persona»: desde que el cuadro que decide se separó del que explica, hay dos encabezados que
  // empiezan igual y el rango entre uno y otro abarca doscientas líneas de código — cualquier
  // apóstrofo suelto de un comentario en el medio desparejaba el conteo de comillas.
  // Acotado a 400 caracteres y no `[^\n]*`: el encabezado del cuadro pasó a ocupar dos líneas y un
  // patrón que no cruza el salto lo daba por desaparecido.
  const enc = /fila\('Persona',[\s\S]{0,400}?'\$\/h c\/aum\.'\)/.exec(NOMINA)
  assert.ok(enc, 'se fue el encabezado con las tarifas')
  const cols = [...enc[0].matchAll(/'([^']+)'/g)].map((m) => m[1])
  const i = cols.indexOf('$/h hoy')
  assert.ok(i > 0, 'desapareció la columna de lo que cobra hoy')
  // Y el cuadro que DECIDE existe, con las tres columnas de plata y sin el detalle encima.
  const decide = /fila\('Persona', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO'[\s\S]{0,400}?\)/.exec(NOMINA)
  assert.ok(decide, 'se fue el cuadro de instrucción de pago')
  const dc = [...decide[0].matchAll(/'([^']+)'/g)].map((m) => m[1])
  // TRECE, Y CADA UNA LA PIDIÓ EL DUEÑO (31/08). El tope existe para que el cuadro no vuelva a
  // llenarse de detalle solo, no para bloquear lo que él pide: sube de a uno y con el pedido escrito.
  //
  //   +1 «no me gusta esa mezcla de conceptos en la columna "ya transferido" con "adelantos"
  //      separar» — sumaba billetes de obra con transferencias del banco en una sola celda.
  //   +1 «necesito q aparezcan las categorias de los empleados» — sin ella no se puede leer contra
  //      qué piso se mide el aumento de cada uno.
  assert.ok(dc.length <= 13, `el cuadro volvió a tener ${dc.length} columnas: no se lee de un vistazo`)
  // Y la categoría va con el respaldo, no delante de la plata: es lo que EXPLICA la tarifa.
  assert.ok(dc.indexOf('TOTAL A PAGAR') < dc.indexOf('Categoría'),
    'la categoría se metió delante de la plata: el cuadro decide un pago, no describe un plantel')
  // Y la plata va antes que el respaldo: el número que decide primero, cómo salió después.
  assert.ok(dc.indexOf('TOTAL A PAGAR') < dc.indexOf('Horas'),
    'el detalle de horas y tarifas se metió delante de la plata')
  for (const c of ['POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR']) {
    assert.ok(dc.includes(c), `desapareció «${c}», que es lo que el dueño opera`)
  }
  // ═══ LO ENTREGADO EN OBRA Y LO TRANSFERIDO SON DOS COLUMNAS, Y LAS DOS SE RESTAN ═══
  //
  // Separarlas sin restarlas las dos es peor que tenerlas juntas: le paga de nuevo a quien ya
  // recibió los billetes. Por eso no alcanza con que los rótulos existan — se verifica la CUENTA.
  assert.ok(dc.includes('ADELANTO') && dc.includes('YA TRANSFERIDO'),
    'volvieron a mezclarse los billetes de obra con las transferencias del banco')
  const efectivo = /`=N\(F\$\{n\}\)-N\(D\$\{n\}\)-N\(C\$\{n\}\)-N\(B\$\{n\}\)`/.test(NOMINA)
  assert.ok(efectivo, 'el efectivo dejó de restar las DOS columnas de lo ya entregado: se paga dos veces')
  const conAumento = /`=N\(H\$\{n\}\)-N\(D\$\{n\}\)-N\(C\$\{n\}\)-N\(B\$\{n\}\)`/.test(NOMINA)
  assert.ok(conAumento, 'el escenario con aumento no resta lo ya entregado por las dos vías')
  // El «+» inicial NO puede volver: Sheets lo parsea como fórmula (=+Aumento…) y el encabezado
  // publica #ERROR!. Se vio en el render real del 29/08 — la celda decía #ERROR! sobre la columna
  // con los números correctos abajo.
  assert.ok(!cols.some((c) => /^\s*[+=]/.test(String(c ?? ''))), 'un rótulo que empieza con + o = entra como fórmula y publica #ERROR!')
  assert.deepEqual(cols.slice(i, i + 2), ['$/h hoy', '$/h c/aum.'],
    'las dos tarifas dejaron de leerse seguidas: la comparación no se puede hacer de un vistazo')

  // Y el aumento sale de la MISMA función que la tarifa nueva: dos cuentas del mismo aumento se
  // separan el día que el porcentaje cambie.
  // ═══ UNA SOLA CUENTA DEL AUMENTO ═══
  //
  // Antes había dos columnas —«Aumento $/h» y «$/h CON AUMENTO»— y este test exigía que las dos
  // salieran de la misma familia de funciones, porque dos cuentas del mismo aumento se separan el
  // día que el porcentaje cambie. La columna del aumento se fue con el rediseño del 31/08, así que
  // ahora hay UNA sola cuenta y el invariante se cuida por el otro lado: que la tarifa nueva salga
  // de `jornalConAumento` y que nadie la reimplemente acá con un `× 0,5` escrito al lado.
  assert.match(NOMINA, /const objetivo = jornalConAumento\(q\.jornal, basico\)/,
    'la tarifa con aumento dejó de salir de `jornalConAumento`')
  assert.ok(!/\*\s*0[.,]5/.test(NOMINA),
    'alguien volvió a escribir la mitad de la brecha a mano: la regla vive en `jornalConAumento`')
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
