// EL AUMENTO ES ADITIVO: LO QUE COBRA HOY + EL 50% DEL BÁSICO DE SU CATEGORÍA (29/08/2026).
//
// ═══ QUÉ SE REHIZO Y POR QUÉ ═══
//
// El bloque 1.1 de «Jornales por Quincena» publicaba un PISO: el plantel entero REVALUADO a la hora
// de convenio (`SUMPRODUCT(personas; básico)`), y ese número era el que proyectaba el semestre. El
// dueño lo rechazó entero:
//
//   *"pesimo, te pedi q del convenio sacar el 50% por categoria y eso es lo q le vamos a aumentar a
//    cada empleado sobre lo q cobran por hr hoy, rehacer"*
//
// Las dos cosas que el piso hacía mal, y que ningún test veía porque el total era plausible:
//
//   · BORRABA LO QUE CADA UNO NEGOCIÓ. Un Oficial que cobra $5.600 y otro que cobra $5.300 quedaban
//     los dos en $6.348. La empresa no paga así.
//   · PUBLICABA UNA TARIFA QUE NADIE VA A COBRAR. Con el criterio correcto ese Oficial pasa a
//     $5.600 + $3.174 = $8.774, que es $2.426 MÁS que el piso. El piso no era conservador: era otro
//     número.
//
// Lo que el convenio decide es el TAMAÑO de la suba, no el valor de la hora. No es techo ni piso.
//
// LAS MUTACIONES QUE ESTE ARCHIVO CORRE (todas verificadas en rojo):
//   1 · volver la Σ a `SUMPRODUCT($B;$F)` (el piso) → cae el total y el margen contra el mínimo legal;
//   2 · calcular el aumento sobre la TARIFA en vez de sobre el básico → deja de ser parejo por
//       categoría, que es lo único que el dueño pidió explícitamente;
//   3 · aplicar el aumento como reemplazo (`MAX(tarifa; básico + aumento)`) → vuelve el piso por otra
//       puerta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriasDelBloque, filasPlantel, personasDelBloque } from './motor-salarial.mjs'
import { sigmaConAumentoDelPlantel, formulaSigmaConAumento } from './proyeccion-convenio.mjs'
import { ESCALA_VERIFICADA, PORCENTAJE_DE_AUMENTO, tarifaConAumento } from './uocra-paritaria.mjs'

// ── EL PLANTEL SINTÉTICO ──
//
// Cinco personas, tres categorías, tarifas DISTINTAS dentro de la misma categoría: es exactamente lo
// que el piso borraba. Los códigos traen el espacio final que escribe el dueño ("OF ") para que el
// arreglo del 28/08 —la clave normalizada de los dos lados— siga probado acá.
const PLANTEL = [
  ['Aguero', 'OF ', 5600], ['Petina', 'OF ', 5300],
  ['Sosa', 'A ', 4500], ['Luna', 'A M', 4300],
  ['Castillo', 'M OF', 5600],
]
const F0 = 100
const BLOQUE = { inicio: F0, fin: F0 + PLANTEL.length - 1 }
const HOJA = '_J_OBREROS'
const ESCALON = {
  categorias: Object.fromEntries(Object.entries(ESCALA_VERIFICADA)
    .map(([c, b], i) => [c, { fila: 10 + i, basico: b, zonaA: b }])),
}
const espejo = () => {
  const g = []
  PLANTEL.forEach(([nombre, cat, jornal], i) => {
    const f = []
    f[1] = nombre; f[3] = cat; f[22] = jornal
    g[F0 - 1 + i] = f
  })
  return g
}

// ── EL EVALUADOR DE LAS FORMAS QUE EMITE EL CUADRO 1.1 ──
//
// Mismo criterio que `jornales-plantel-clave-recortada.test.mjs`: lo que hay que probar es la CUENTA
// que va a hacer Sheets, no una copia en JS de lo que uno cree que emitió. Falla ruidoso ante una
// forma que no reconoce, para que reescribir la fórmula de otra manera no pase en silencio.
const RANGO = /'[^']+'!\$([A-Z])\$(\d+):\$\1\$(\d+)/
const COL = { D: 3, W: 22 }
const TRIM = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const N = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const columna = (grid, ref) => {
  const m = RANGO.exec(ref)
  const out = []
  for (let r = Number(m[2]); r <= Number(m[3]); r++) out.push((grid[r - 1] ?? [])[COL[m[1]]] ?? '')
  return out
}

/** Evalúa el cuadro entero: cada fila con sus seis números, como los va a resolver Sheets. */
function resolver(grid, cuadro, basicoDe) {
  const filas = []
  for (let i = 0; i < cuadro.fUltima - cuadro.fPrimera + 1; i++) {
    const f = cuadro.filas[i + 1]
    const cat = String(f[0])
    const mB = /^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\)\)$/.exec(String(f[1]))
    const mC = /^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\);N\((.+?)\)\)$/.exec(String(f[2]))
    if (!mB || !mC) throw new Error(`forma desconocida en la fila «${cat}»: ${f[1]} · ${f[2]}`)
    const d = columna(grid, mB[1]); const w = columna(grid, mC[3])
    const personas = d.filter((v) => TRIM(v) === mB[2]).length
    const hoy = d.reduce((a, v, k) => a + (TRIM(v) === mC[2] ? N(w[k]) : 0), 0)
    // La columna G: `=IF(N($Fr)=0;"";$Fr*50%)`. El básico lo resuelve el INDEX/MATCH contra la
    // réplica, que acá lo pone el llamador — es la única entrada que no sale del espejo.
    const mG = /^=IF\(N\(\$F(\d+)\)=0;"";\$F\1\*(\d+)%\)$/.exec(String(f[6]))
    if (!mG) throw new Error(`la columna del aumento cambió de forma: ${f[6]}`)
    const basico = basicoDe(cat)
    const aumentoHora = basico ? basico * (Number(mG[2]) / 100) : 0
    // La columna D: `=N($Br)*N($Gr)`.
    if (!/^=N\(\$B\d+\)\*N\(\$G\d+\)$/.test(String(f[3]))) throw new Error(`la Σ del aumento cambió: ${f[3]}`)
    filas.push({ cat, personas, hoy, basico, aumentoHora, sigmaAumento: personas * aumentoHora })
  }
  return filas
}

const BASICO = { OF: 'Oficial', 'A': 'Ayudante', 'A M': 'Ayudante', 'M OF': 'Medio Oficial' }
const basicoDe = (cat) => ESCALA_VERIFICADA[BASICO[cat]] ?? null
const cuadroDe = (grid) => filasPlantel({
  hoja: HOJA, bloque: BLOQUE, categorias: categoriasDelBloque(grid, BLOQUE),
  personas: personasDelBloque(grid, BLOQUE), filaInicio: 40, escalonVigente: null,
})

test('EL CRITERIO: cada uno conserva SU tarifa y todos suman el 50% del básico de SU categoría', () => {
  const g = espejo()
  const filas = resolver(g, cuadroDe(g), basicoDe)
  const de = (c) => filas.find((f) => f.cat === c)

  // Los dos Oficiales conservan tarifas distintas —$5.600 y $5.300— y suman el MISMO aumento.
  assert.equal(de('OF').personas, 2)
  assert.equal(de('OF').hoy, 5600 + 5300, 'la Σ de hoy sale de la columna W, no de la escala')
  assert.equal(de('OF').aumentoHora, 6348 / 2)
  assert.equal(de('OF').aumentoHora, 3174)
  assert.equal(de('OF').sigmaAumento, 2 * 3174)
  // EL AUMENTO ES PAREJO DENTRO DE LA CATEGORÍA, que es la parte que el dueño pidió con todas las
  // letras: los dos Oficiales suman $3.174 aunque partan de jornales distintos. Si alguien lo
  // calculara sobre la tarifa de cada uno, Aguero subiría $2.800 y Petina $2.650.
  assert.notEqual(de('OF').aumentoHora, 5600 * PORCENTAJE_DE_AUMENTO)
  assert.notEqual(de('OF').aumentoHora, 5300 * PORCENTAJE_DE_AUMENTO)

  // Y el Medio Oficial saca su aumento de SU escalón, no del de Oficial.
  assert.equal(de('M OF').aumentoHora, 5866 / 2)
  assert.equal(de('M OF').aumentoHora, 2933)

  // EL TOTAL DEL CUADRO: Σ de hoy + Σ del aumento. Es lo que se proyecta.
  const hoy = filas.reduce((a, f) => a + f.hoy, 0)
  const aumento = filas.reduce((a, f) => a + f.sigmaAumento, 0)
  assert.equal(hoy, 5600 + 5300 + 4500 + 4300 + 5600)
  assert.equal(hoy, 25300)
  assert.equal(aumento, 2 * 3174 + 2699.5 + 2699.5 + 2933)
  assert.equal(aumento, 14680)
  assert.equal(hoy + aumento, 39980)

  // ═══ LA MUTACIÓN 1, EN NÚMEROS: EL PISO ═══
  //
  // Si alguien vuelve a `SUMPRODUCT(personas; básico)`, la Σ pasa a $29.360 — un 27% MENOS que lo que
  // se va a pagar— y sigue siendo un número perfectamente plausible. Éste es el contraste que hace
  // que la reversión se vea.
  const piso = filas.reduce((a, f) => a + f.personas * (f.basico ?? 0), 0)
  assert.equal(piso, 2 * 6348 + 5399 + 5399 + 5866)
  assert.equal(piso, 29360)
  assert.ok(hoy + aumento > piso, 'el aumento aditivo tiene que dar MÁS que revaluar al convenio')
  assert.equal(Number(((hoy + aumento) / piso).toFixed(4)), 1.3617)
})

test('EL CONTROL DE JS Y LA FÓRMULA DAN EL MISMO NÚMERO — dos caminos, una cuenta', () => {
  // `sigmaConAumentoDelPlantel` recorre PERSONA por persona; el cuadro suma POR CATEGORÍA. Que los
  // dos den lo mismo es lo único que permite creerle al log de la corrida cuando nadie puede abrir el
  // Sheet. Si se separan, uno de los dos está mal y no hay forma de saber cuál.
  const g = espejo()
  const filas = resolver(g, cuadroDe(g), basicoDe)
  const js = sigmaConAumentoDelPlantel(g, BLOQUE, ESCALON)
  assert.equal(js.hoy, filas.reduce((a, f) => a + f.hoy, 0))
  assert.equal(js.aumento, filas.reduce((a, f) => a + f.sigmaAumento, 0))
  assert.equal(js.total, 39980)
  assert.equal(js.personas, 5)
  assert.deepEqual(js.bajoConvenio, [], 'con estas tarifas nadie queda bajo el mínimo legal')

  // ═══ Y LA MISMA IGUALDAD CON ALGUIEN BAJO EL PISO — SIN ESTO EL TEST NO VIGILA NADA (29/08) ═══
  //
  // La auditoría mutó `tarifa` a `MAX(hoy + aumento; piso)` —el piso volviendo por la puerta de
  // atrás— y ESTE test quedó VERDE en las dos configuraciones del acumulador. Con las cinco tarifas
  // de arriba el MAX nunca muerde (la más baja, $4.300, más su aumento da $6.999,50 contra un piso de
  // $5.399), así que la mutación no cambiaba un peso y la igualdad se cumplía igual. Un control que
  // sólo se ejerce donde el defecto no puede aparecer es una constante disfrazada, y el comentario
  // del acumulador afirmaba que este test lo vigilaba: era `la-mutacion-declarada-no-probada`.
  //
  // Con un Oficial en $2.000 —$2.000 + $3.174 = $5.174 contra un piso de $6.348— el MAX SÍ muerde, y
  // ahí las dos cuentas se separan: la fórmula del Sheet suma `hoy` (columna W, $2.000) más
  // `personas × básico/2`, sin enterarse de ningún piso; el JS mutado devolvería $6.348 de tarifa y
  // su aumento derivado por resta sería $4.348 en vez de $3.174.
  const bajo = espejo()
  bajo[F0 - 1][22] = 2000
  const filasBajo = resolver(bajo, cuadroDe(bajo), basicoDe)
  const jsBajo = sigmaConAumentoDelPlantel(bajo, BLOQUE, ESCALON)
  assert.equal(jsBajo.hoy, filasBajo.reduce((a, f) => a + f.hoy, 0),
    'la Σ de hoy dejó de ser la columna W: alguien la está corrigiendo por el camino')
  assert.equal(jsBajo.aumento, filasBajo.reduce((a, f) => a + f.sigmaAumento, 0),
    'el aumento del JS dejó de coincidir con el de la fórmula: hay un piso escondido en la tarifa')
  assert.equal(jsBajo.total, filasBajo.reduce((a, f) => a + f.hoy + f.sigmaAumento, 0))
  assert.equal(jsBajo.total, 39980 - 5600 + 2000)
  assert.equal(jsBajo.bajoConvenio.length, 1, 'y la persona bajo el piso se sigue nombrando')
})

test('EL MÍNIMO LEGAL NO SE APLICA EN SILENCIO: se publica la decisión y se AVISA', () => {
  // Una tarifa de $2.000 para un Oficial: con el aumento queda en $2.000 + $3.174 = $5.174, que sigue
  // por debajo del básico de $6.348. La Σ publica $5.174 —es lo que la empresa decidió pagar— y el
  // control lo NOMBRA. Subirlo callado a $6.348 dejaría el cuadro prolijo y la falta invisible.
  const g = espejo()
  g[F0 - 1][22] = 2000
  const js = sigmaConAumentoDelPlantel(g, BLOQUE, ESCALON)
  assert.equal(js.bajoConvenio.length, 1, 'el control no vio a la persona que queda bajo el mínimo legal')
  assert.equal(js.bajoConvenio[0].codigo, 'OF')
  assert.equal(js.bajoConvenio[0].tarifa, 5174)
  assert.equal(js.bajoConvenio[0].piso, 6348)
  assert.equal(js.hoy, 25300 - 5600 + 2000, 'la Σ publica lo que se decidió pagar, sin corregirlo')
  // Y LO QUE SE LIQUIDA SÍ LLEVA EL PISO: las dos preguntas tienen dos respuestas y las dos existen.
  assert.equal(tarifaConAumento(2000, 6348).tarifa, 5174)
  assert.equal(tarifaConAumento(2000, 6348).bajoConvenio, true)

  // El Estado de la fila lo dice en la pestaña, mirando al que MENOS cobra de la categoría.
  const estado = String(cuadroDe(g).filas.find((f) => f[0] === 'OF')[7])
  assert.match(estado, /aun con el aumento queda bajo el convenio/)
  assert.match(estado, /MIN\(FILTER\(/, 'compara contra el promedio y esconde al que está abajo')
})

test('LA Σ QUE PROYECTA SALE DEL CUADRO, Y NO PUEDE VOLVER A SER EL PISO', () => {
  const f = formulaSigmaConAumento(41, 45, 46)
  // Σ de hoy + Σ del aumento, las dos celdas del total. Nada de personas × básico.
  assert.equal(f, 'IF(N($C$46)=0;"";N($C$46)+N($D$46))')
  assert.doesNotMatch(f, /\$F\$/, 'volvió a colgar del básico: eso es el piso')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
})
