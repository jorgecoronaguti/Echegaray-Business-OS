// EL AUMENTO CIERRA LA MITAD DE LA BRECHA HASTA EL PISO DE CONVENIO, Y NUNCA LO PASA (29/08/2026).
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
//   · PUBLICABA UNA TARIFA QUE NADIE VA A COBRAR.
//
// ═══ Y DESPUÉS SE IMPLEMENTÓ DOS VECES LA REGLA EQUIVOCADA ═══
//
// Confirmada por el dueño: *"Cerrar el 50% de la brecha hasta el piso de UOCRA, sin pasar nunca el
// piso. - ahora si"*.
//
//     brecha = max(0; básico − hoy) · aumento = brecha / 2 · tarifa = hoy + aumento ≤ básico
//
// Los dos intentos anteriores y por qué son plausibles leyendo una frase suelta:
//   · `hoy + 50% × básico` → un Oficial de $5.600 terminaba en $8.774, un 38% POR ENCIMA del piso de
//     $6.348. El dueño lo frenó con la pregunta que decodifica todo: *"¿cómo puede ser q el 50% sea
//     más q el 100% del piso?"*.
//   · `1,5 × básico` ("piso + 50%") → $9.522, todavía peor.
// Las dos multiplican el costo por siete: $661.779 de aumento en la quincena contra los $4,67M que
// publicaba la primera lectura. Una regla salarial mal leída no da un número raro: da uno plausible.
//
// LAS MUTACIONES QUE ESTE ARCHIVO CORRE (todas verificadas en rojo):
//   1 · volver a `hoy + 50% × básico` (la primera lectura) → rompe la tabla canónica Y el invariante
//       duro `tarifa ≤ piso`;
//   2 · sacarle el `max(0; …)` a la brecha → la persona que ya cobra sobre el piso BAJA, y el
//       invariante `tarifa ≥ hoy` se pone rojo;
//   3 · volver la Σ a `SUMPRODUCT($B;$F)` (el piso entero) → cae la Σ que proyecta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriasDelBloque, filasPlantel, personasDelBloque } from './motor-salarial.mjs'
import { sigmaConAumentoDelPlantel, formulaSigmaConAumento } from './proyeccion-convenio.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'
import { ESCALA_VERIFICADA, jornalConAumento, tarifaConAumento } from './uocra-paritaria.mjs'

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

/**
 * EVALÚA EL CUADRO COMO LO VA A EVALUAR GOOGLE. Las columnas B y C se cuentan acá con las reglas de
 * Sheets (TRIM colapsa espacios; un texto en la columna de importes vale cero) porque el evaluador
 * compartido no cubre TRIM; la columna D —la Σ del aumento, que es la que cambió de forma— se evalúa
 * con `evaluarFormula` sobre el espejo modelado, que es la única manera de probar que la resta
 * persona por persona hace lo que dice.
 */
function resolver(grid, cuadro, basicoDe) {
  const espejoHoja = hojaDeGrilla(grid.map((f) => f ?? []))
  const hoja = {}
  const filas = []
  const n = cuadro.fUltima - cuadro.fPrimera + 1
  for (let i = 0; i < n; i++) {
    const f = cuadro.filas[i + 1]
    const cat = String(f[0])
    const r = cuadro.fPrimera + i
    const mB = /^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\)\)$/.exec(String(f[1]))
    const mC = /^=SUMPRODUCT\(--\(TRIM\((.+?)\)="(.*)"\);N\((.+?)\)\)$/.exec(String(f[2]))
    if (!mB || !mC) throw new Error(`forma desconocida en la fila «${cat}»: ${f[1]} · ${f[2]}`)
    const d = columna(grid, mB[1]); const w = columna(grid, mC[3])
    hoja[`B${r}`] = d.filter((v) => TRIM(v) === mB[2]).length
    hoja[`C${r}`] = d.reduce((a, v, k) => a + (TRIM(v) === mC[2] ? N(w[k]) : 0), 0)
    hoja[`F${r}`] = basicoDe(cat) ?? ''
  }
  for (let i = 0; i < n; i++) {
    const f = cuadro.filas[i + 1]
    const r = cuadro.fPrimera + i
    const sigmaAumento = evaluarFormula(String(f[3]), { hoja, hojas: { _J_OBREROS: espejoHoja } })
    hoja[`D${r}`] = sigmaAumento
    const conAumento = evaluarFormula(String(f[6]), { hoja })
    filas.push({
      cat: String(f[0]), personas: hoja[`B${r}`], hoy: hoja[`C${r}`], basico: basicoDe(String(f[0])),
      sigmaAumento, conAumento,
    })
  }
  return filas
}

const BASICO = { OF: 'Oficial', 'A': 'Ayudante', 'A M': 'Ayudante', 'M OF': 'Medio Oficial' }
const basicoDe = (cat) => ESCALA_VERIFICADA[BASICO[cat]] ?? null
const cuadroDe = (grid) => filasPlantel({
  hoja: HOJA, bloque: BLOQUE, categorias: categoriasDelBloque(grid, BLOQUE),
  personas: personasDelBloque(grid, BLOQUE), filaInicio: 40, escalonVigente: null,
})

test('LA TABLA CANÓNICA DEL DUEÑO, AL CENTAVO — y los dos invariantes duros', () => {
  // Cada fila es la que se le mostró al dueño y él aprobó. Si alguna se mueve, la regla cambió.
  const CANONICA = [
    { quien: 'Aguero', cat: 'OF', basico: 6348, hoy: 5600, brecha: 748, aumento: 374, tarifa: 5974 },
    { quien: 'Jofre/Sosa', cat: 'OF', basico: 6348, hoy: 5700, brecha: 648, aumento: 324, tarifa: 6024 },
    { quien: 'Petina', cat: 'OF', basico: 6348, hoy: 5300, brecha: 1048, aumento: 524, tarifa: 5824 },
    { quien: 'Rosales', cat: 'OF', basico: 6348, hoy: 5400, brecha: 948, aumento: 474, tarifa: 5874 },
    { quien: 'GonzJ/Reta/Tello/Zogber', cat: 'OF', basico: 6348, hoy: 5500, brecha: 848, aumento: 424, tarifa: 5924 },
    { quien: 'los 4 Ayudantes', cat: 'A', basico: 5399, hoy: 4500, brecha: 899, aumento: 449.5, tarifa: 4949.5 },
    { quien: 'Pastran/QuirogaS', cat: 'OF E', basico: 7420, hoy: 6200, brecha: 1220, aumento: 610, tarifa: 6810 },
    { quien: 'Castillo', cat: 'M OF', basico: 5866, hoy: 5600, brecha: 266, aumento: 133, tarifa: 5733 },
    // LA SINTÉTICA: nadie cobra esto hoy, y por eso está. La regla tiene que decir qué hace con quien
    // ya está por encima del piso ANTES de que aparezca, no cuando aparezca.
    { quien: 'sintética sobre el piso', cat: 'OF', basico: 6348, hoy: 12000, brecha: 0, aumento: 0, tarifa: 12000 },
  ]
  for (const c of CANONICA) {
    const t = tarifaConAumento(c.hoy, c.basico)
    assert.equal(t.brecha, c.brecha, `${c.quien}: la brecha contra su piso`)
    assert.equal(t.aumento, c.aumento, `${c.quien}: el aumento es la MITAD de la brecha`)
    assert.equal(t.tarifa, c.tarifa, `${c.quien}: la tarifa nueva`)
  }

  // ═══ INVARIANTE 1 · EL RESULTADO NUNCA PASA EL PISO ═══
  // *"no puede dar mas el resultado por hora q el 100% del piso de uocra"*. Es la restricción que
  // decodificó las otras cuatro frases, y la que mata las dos lecturas anteriores.
  for (const c of CANONICA) {
    const t = tarifaConAumento(c.hoy, c.basico)
    if (c.hoy <= c.basico) {
      assert.ok(t.tarifa <= c.basico,
        `${c.quien}: la tarifa ($${t.tarifa}) pasó el piso ($${c.basico}) — es la regla que el dueño frenó`)
    }
  }
  // Y sobre un barrido, no sólo sobre la tabla: con cualquier jornal por debajo del piso, el
  // resultado tiene que quedar entre lo de hoy y el piso. Sin extremos elegidos a mano.
  for (let hoy = 100; hoy <= 6348; hoy += 137) {
    const t = tarifaConAumento(hoy, 6348)
    assert.ok(t.tarifa <= 6348, `con hoy=${hoy} la tarifa ${t.tarifa} pasó el piso`)
    assert.ok(t.tarifa >= hoy, `con hoy=${hoy} la tarifa ${t.tarifa} BAJÓ`)
    assert.equal(t.tarifa, hoy + (6348 - hoy) / 2)
  }

  // ═══ INVARIANTE 2 · NADIE BAJA ═══
  // Con hoy POR ENCIMA del piso la brecha es cero y la hora no se toca. Sin el `max(0; …)` la brecha
  // sería negativa y el "aumento" le recortaría el jornal a quien mejor cobra.
  for (const hoy of [6349, 8000, 12000, 99999]) {
    const t = tarifaConAumento(hoy, 6348)
    assert.equal(t.brecha, 0)
    assert.equal(t.aumento, 0)
    assert.equal(t.tarifa, hoy, `con hoy=${hoy} la tarifa cambió: alguien bajó`)
    assert.equal(t.sobreElPiso, true)
  }

  // ═══ LO QUE ESTA REGLA DEJA ABIERTO, MEDIDO ═══
  // Cerrar media brecha deja la otra media: el plantel sigue POR DEBAJO de la escala. No es un
  // defecto, es la decisión — pero es exposición laboral y el número tiene que existir.
  const bajoElPiso = CANONICA.filter((c) => c.hoy < c.basico)
  assert.equal(bajoElPiso.length, 8, 'ocho de las nueve filas están hoy bajo su piso')
  for (const c of bajoElPiso) {
    const t = tarifaConAumento(c.hoy, c.basico)
    assert.equal(t.bajoConvenio, true, `${c.quien}: tras el aumento tiene que SEGUIR bajo el piso`)
  }
})

test('EL CUADRO SUMA PERSONA POR PERSONA, no personas × una constante', () => {
  const g = espejo()
  const filas = resolver(g, cuadroDe(g), basicoDe)
  const de = (c) => filas.find((f) => f.cat === c)

  // Los dos Oficiales cobran distinto y por eso reciben distinto — $374 y $524 contra el mismo piso.
  // Una columna «aumento de la hora» multiplicada por la cantidad de gente publicaría el promedio
  // ($449) como si fuera el dato de los dos.
  assert.equal(de('OF').personas, 2)
  assert.equal(de('OF').hoy, 5600 + 5300)
  assert.equal(de('OF').sigmaAumento, 374 + 524)
  assert.equal(de('OF').sigmaAumento, 898)
  // «El promedio por la cantidad da lo mismo» es una identidad aritmética, así que compararla no
  // prueba nada. Lo que sí lo prueba es que los DOS aumentos individuales son distintos —una columna
  // con una constante por categoría no puede expresar eso— y que la fórmula emitida resta contra la
  // columna de tarifas del espejo en vez de multiplicar por la cantidad de gente.
  assert.notEqual(tarifaConAumento(5600, 6348).aumento, tarifaConAumento(5300, 6348).aumento)
  const formulaD = String(cuadroDe(g).filas[1][3])
  assert.match(formulaD, /\(N\(\$F\d+\)-N\('_J_OBREROS'!\$W/, 'la Σ dejó de restar contra el espejo')
  assert.doesNotMatch(formulaD, /^=N\(\$B\d+\)\*/, 'volvió a ser personas × una constante')

  // Y cada categoría contra SU piso: el Medio Oficial no saca su brecha del escalón de Oficial.
  assert.equal(de('M OF').sigmaAumento, (5866 - 5600) / 2)
  assert.equal(de('M OF').sigmaAumento, 133)

  const hoy = filas.reduce((a, f) => a + f.hoy, 0)
  const aumento = filas.reduce((a, f) => a + f.sigmaAumento, 0)
  assert.equal(hoy, 25300)
  assert.equal(aumento, 898 + 449.5 + 549.5 + 133)
  assert.equal(aumento, 2030)
  assert.equal(hoy + aumento, 27330)

  // EL CONTRASTE CON LAS DOS LECTURAS QUE SE DESCARTARON, en números: la primera daba $14.680 de
  // aumento sobre esta misma grilla y la segunda $18.740 — siete y nueve veces esto. Si alguno de
  // esos números reaparece, alguien volvió atrás.
  assert.notEqual(aumento, 14680, 'volvió `hoy + 50% × básico`')
  assert.notEqual(aumento, 18740, 'volvió `1,5 × básico`')
  // Y el total NO puede superar el piso del plantel: es el invariante, a nivel de la Σ.
  const piso = filas.reduce((a, f) => a + f.personas * (f.basico ?? 0), 0)
  assert.equal(piso, 29360)
  assert.ok(hoy + aumento < piso, 'la Σ con aumento pasó el piso del plantel')
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
  assert.equal(js.total, 27330)
  assert.equal(js.personas, 5)
  assert.equal(js.bajoConvenio.length, 5,
    'los cinco tienen que seguir bajo el piso: se cerró media brecha, no la brecha')

  // ═══ Y LA MISMA IGUALDAD CON ALGUIEN BAJO EL PISO — SIN ESTO EL TEST NO VIGILA NADA (29/08) ═══
  //
  // La auditoría mutó `tarifa` a `MAX(hoy + aumento; piso)` —el piso volviendo por la puerta de
  // atrás— y ESTE test quedó VERDE en las dos configuraciones del acumulador. Con las cinco tarifas
  // de arriba el MAX nunca muerde (la más baja, $4.300, más su aumento da $6.999,50 contra un piso de
  // $5.399), así que la mutación no cambiaba un peso y la igualdad se cumplía igual. Un control que
  // sólo se ejerce donde el defecto no puede aparecer es una constante disfrazada, y el comentario
  // del acumulador afirmaba que este test lo vigilaba: era `la-mutacion-declarada-no-probada`.
  //
  // Con un Oficial en $2.000 la brecha es $4.348 y el aumento $2.174 — la tarifa queda en $4.174,
  // MUY por debajo del piso—. Es donde cualquier variante que meta un piso escondido en la tarifa se
  // separa de la fórmula del Sheet, que resta contra la columna W y no sabe de pisos.
  const bajo = espejo()
  bajo[F0 - 1][22] = 2000
  const filasBajo = resolver(bajo, cuadroDe(bajo), basicoDe)
  const jsBajo = sigmaConAumentoDelPlantel(bajo, BLOQUE, ESCALON)
  assert.equal(jsBajo.hoy, filasBajo.reduce((a, f) => a + f.hoy, 0),
    'la Σ de hoy dejó de ser la columna W: alguien la está corrigiendo por el camino')
  assert.equal(jsBajo.aumento, filasBajo.reduce((a, f) => a + f.sigmaAumento, 0),
    'el aumento del JS dejó de coincidir con el de la fórmula: hay un piso escondido en la tarifa')
  assert.equal(jsBajo.total, filasBajo.reduce((a, f) => a + f.hoy + f.sigmaAumento, 0))
  // Con Aguero en $2.000 su brecha pasa de $748 a $4.348 y su aumento de $374 a $2.174: la Σ baja
  // $3.600 de tarifa y sube $1.800 de aumento.
  assert.equal(jsBajo.total, 27330 - 5600 + 2000 - 374 + 2174)
  assert.equal(jsBajo.total, 25530)
  assert.equal(jsBajo.bajoConvenio.length, 5, 'los cinco siguen bajo el piso, incluido el de $2.000')
})

test('TRAS EL AUMENTO EL PLANTEL SIGUE BAJO EL PISO — y eso se cuenta, no se tapa', () => {
  // ═══ ESTE TEST CAMBIÓ DE PREGUNTA CON LA REGLA DEFINITIVA ═══
  //
  // Con las lecturas anteriores el resultado quedaba POR ENCIMA del piso y `bajoConvenio` era una
  // alarma: si alguien caía debajo, había una falta. Con la regla del dueño quedan TODOS debajo por
  // construcción —se cierra media brecha— así que dejó de ser una alarma y pasó a ser una MEDICIÓN:
  // cuánta exposición laboral queda abierta después de pagar el aumento.
  //
  // Lo que NO puede pasar es que desaparezca. Un número incómodo que el sistema deja de contar es la
  // forma más barata de que nadie lo vea.
  const g = espejo()
  const js = sigmaConAumentoDelPlantel(g, BLOQUE, ESCALON)
  assert.equal(js.bajoConvenio.length, 5, 'dejó de contar a los que quedan bajo el piso')
  const aguero = js.bajoConvenio.find((b) => b.codigo === 'OF')
  assert.equal(aguero.tarifa, 5974, 'la tarifa publicada es la decisión: hoy + media brecha')
  assert.equal(aguero.piso, 6348)
  // Y la Σ del plantel queda por debajo de su piso: es la mitad de la brecha que no se cerró.
  const piso = 2 * 6348 + 5399 + 5399 + 5866
  assert.equal(piso, 29360)
  assert.ok(js.total < piso)
  assert.equal(piso - js.total, 2030, 'la brecha que queda abierta es exactamente la que se cerró')

  // NO SE CORRIGE EN SILENCIO: `jornalConAumento` —lo que se liquida— devuelve la tarifa decidida, no
  // el piso. Un `Math.max` acá publicaría en la pestaña del pago un número que nadie decidió.
  assert.equal(jornalConAumento(5600, 6348), 5974)
  assert.notEqual(jornalConAumento(5600, 6348), 6348, 'volvió el max contra el piso: pisa la decisión')
})

test('LA Σ QUE PROYECTA SALE DEL CUADRO, Y NO PUEDE VOLVER A SER EL PISO', () => {
  const f = formulaSigmaConAumento(41, 45, 46)
  // Σ de hoy + Σ del aumento, las dos celdas del total. Nada de personas × básico.
  assert.equal(f, 'IF(N($C$46)=0;"";N($C$46)+N($D$46))')
  assert.doesNotMatch(f, /\$F\$/, 'volvió a colgar del básico: eso es el piso')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
})

// ═══ LA QUINCENA 17–31/08 COMPLETA: CUÁNTO CUESTA EL AUMENTO, EN PESOS ═══
//
// Es el número que el dueño está esperando. Se arma con el plantel de la tabla canónica y las horas
// por categoría de esa quincena.
//
// LÍMITE DECLARADO, Y NO ES MENOR: las horas que tengo son POR CATEGORÍA (OF 857 · OF E 210 ·
// M OF 53 · A 376), no por persona, y dentro de «OF» conviven cinco jornales distintos con aumentos
// de $324 a $524. Con horas por persona el total se movería: acá se usa el aumento PROMEDIO de cada
// categoría, ponderado por sus horas. Es una aproximación declarada, no el número exacto — el exacto
// exige leer las horas de cada persona del espejo, y eso no se puede hacer desde un worktree.
const QUINCENA = {
  // [jornal de hoy, cuántas personas] por categoría, de la tabla que aprobó el dueño.
  OF: { basico: 6348, horas: 857, gente: [[5600, 1], [5700, 2], [5300, 1], [5400, 1], [5500, 4]] },
  A: { basico: 5399, horas: 376, gente: [[4500, 4]] },
  'OF E': { basico: 7420, horas: 210, gente: [[6200, 2]] },
  'M OF': { basico: 5866, horas: 53, gente: [[5600, 1]] },
}

test('LA QUINCENA 17–31/08: el aumento cuesta $658.007 sobre una masa de $8,0M', () => {
  let personas = 0
  let costo = 0
  const porCategoria = {}
  for (const [cat, d] of Object.entries(QUINCENA)) {
    const n = d.gente.reduce((a, [, c]) => a + c, 0)
    const sumaAumentos = d.gente.reduce((a, [hoy, c]) => a + c * tarifaConAumento(hoy, d.basico).aumento, 0)
    porCategoria[cat] = { n, sumaAumentos, promedio: sumaAumentos / n, costo: (sumaAumentos / n) * d.horas }
    personas += n
    costo += porCategoria[cat].costo
  }
  // El plantel de la tabla canónica: 16 de las 17 personas de la nómina. La que falta no está en la
  // tabla que se aprobó, y no se inventa una tarifa para completarla.
  assert.equal(personas, 16)

  // Σ de aumentos por hora, categoría por categoría — el detalle que hace auditable el total.
  assert.equal(porCategoria.OF.sumaAumentos, 374 + 324 * 2 + 524 + 474 + 424 * 4)
  assert.equal(porCategoria.OF.sumaAumentos, 3716)
  assert.equal(porCategoria.A.sumaAumentos, 449.5 * 4)
  assert.equal(porCategoria['OF E'].sumaAumentos, 610 * 2)
  assert.equal(porCategoria['M OF'].sumaAumentos, 133)

  // EL TOTAL DE LA QUINCENA.
  assert.equal(Math.round(costo), 658007)
  // Y el orden de magnitud es el que hace que la regla sea la correcta: las dos lecturas descartadas
  // costaban $4,67M y $6,3M en la misma quincena — siete y nueve veces esto. El dueño insistió tres
  // veces justamente porque el número no le cerraba.
  assert.ok(costo < 1_000_000, `el aumento volvió a costar ${Math.round(costo).toLocaleString('es-AR')}: es una lectura descartada`)
  assert.ok(costo > 600_000, 'el aumento se achicó: alguien recortó la brecha por debajo de la mitad')
})
