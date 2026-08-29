// EL INCIDENTE: LA COLUMNA DEL DUEÑO AMANECIÓ CON BASURA Y LA Σ TENÍA QUE SOBREVIVIR.
//
// ═══ QUÉ PASÓ ═══
//
// «Convenio (tuya)» es la columna E del cuadro 1.1 y es del dueño: el generador la escribe vacía y
// preserva lo que él haya puesto. Cuando el layout de la pestaña se movió, esas celdas quedaron con
// lo que el layout ANTERIOR tenía en esa posición — el propio encabezado («Convenio (tuya)»), un
// serial de fecha, un número suelto. Ninguna de esas cosas es una categoría del convenio.
//
// Con la regla vieja —`IF($E="";equivalencia;$E)`— cualquier cosa distinta de vacío GANABA: el
// `MATCH` contra la réplica no encontraba nada, el `IFERROR` devolvía "", la columna «Básico
// convenio» quedaba en blanco y esas categorías entraban al total valuadas en cero. Sin un error,
// sin una celda roja, con el total más chico y perfectamente plausible.
//
// ═══ POR QUÉ ESTE ARCHIVO EVALÚA EL `INDEX/MATCH` DE VERDAD ═══
//
// El test que ya existía del cuadro (`jornales-aumento-por-categoria`) resuelve el básico con un mapa
// escrito a mano —`{OF: 'Oficial', …}`— o sea que prueba el cuadro ENTERO salvo la única celda por la
// que entró el incidente. Acá la columna F se evalúa como la va a evaluar Google: la fórmula real,
// contra una réplica `_UOCRA_RAW` modelada, con la basura puesta en la E. `evaluar-formula-sheet.mjs`
// soporta exactamente ese subconjunto y revienta ruidoso con cualquier otra función.
//
// LAS DOS MUTACIONES, CORRIDAS Y VISTAS EN ROJO:
//   (a) sacarle el fallback a `expresionClaveConvenio` (la clave pasa a ser `$E` pelada);
//   (b) restaurar la guarda vieja `IF($E="";equivalencia;$E)`.
// Con cualquiera de las dos, tres de las cuatro categorías pierden el básico, `sinEscala` deja de ser
// cero y la Σ del aumento se desploma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriasDelBloque, filasPlantel, personasDelBloque } from './motor-salarial.mjs'
import { expresionSinEscala } from './jornales-piso-uocra.mjs'
import { evaluarFormula, hojaDeGrilla } from './evaluar-formula-sheet.mjs'
import { ESCALA_VERIFICADA } from './uocra-paritaria.mjs'

// ── LA RÉPLICA `_UOCRA_RAW`, MODELADA COMO LA LEE LA FÓRMULA ──
//
// Columna B la categoría, columna D el básico (`COL` de uocra-acuerdos). Las cuatro que se cotizan
// POR HORA van juntas en 10..13; el Sereno queda afuera a propósito —cobra por mes— y por eso el
// escalón no lo declara: si entrara al rango, un «Sereno» escrito en la E devolvería $980.858 a una
// columna de $/hora.
const FILA = { 'Oficial Especializado': 10, Oficial: 11, 'Medio Oficial': 12, Ayudante: 13 }
const ESCALON = {
  categorias: Object.fromEntries(Object.entries(FILA)
    .map(([c, f]) => [c, { fila: f, basico: ESCALA_VERIFICADA[c], zonaA: ESCALA_VERIFICADA[c] }])),
}
const REPLICA = {}
for (const [cat, f] of Object.entries(FILA)) {
  REPLICA[`B${f}`] = cat
  REPLICA[`D${f}`] = ESCALA_VERIFICADA[cat]
}

// ── EL ESPEJO Y LA BASURA ──
//
// Cuatro categorías, cinco personas con tarifas distintas dentro de la misma categoría. Los códigos
// traen el espacio final que escribe la planilla, para que la clave normalizada siga ejercitada.
const PLANTEL = [
  ['Aguero', 'OF ', 5600], ['Petina', 'OF ', 5300],
  ['Sosa', 'A ', 4500], ['Luna', 'A M', 4300], ['Navarro', 'OF M', 5200],
]
const F0 = 200
const BLOQUE = { inicio: F0, fin: F0 + PLANTEL.length - 1 }
const FILA_INICIO = 40

/**
 * LA BASURA, VERBATIM. Los tres primeros son los que la auditoría encontró en el archivo vivo: el
 * ENCABEZADO de la propia columna, un `1` y un `5601` —un jornal de otra columna, corrido un lugar—.
 * El cuarto, «Se paga el», es del incidente del 14/08 y se conserva porque es el caso más engañoso:
 * un texto que parece un rótulo legítimo.
 */
const BASURA = { OF: 'Convenio (tuya)', A: 1, 'A M': 5601, 'OF M': 'Se paga el' }

const espejo = () => {
  const g = []
  PLANTEL.forEach(([nombre, cat, jornal], i) => {
    const f = []
    f[1] = nombre; f[3] = cat; f[22] = jornal
    g[F0 - 1 + i] = f
  })
  return g
}
const cuadro = (grid) => filasPlantel({
  hoja: '_J_OBREROS', bloque: BLOQUE, categorias: categoriasDelBloque(grid, BLOQUE),
  personas: personasDelBloque(grid, BLOQUE), filaInicio: FILA_INICIO, escalonVigente: ESCALON,
})

/**
 * RESUELVE EL CUADRO COMO LO VA A RESOLVER GOOGLE: la F por `INDEX/MATCH` contra la réplica, con lo
 * que haya en la E; después la G (`$F*50%`) y la D (`personas × aumento`) sobre la F ya resuelta.
 *
 * `escrito` mapea categoría → lo que hay en su celda E. Sin entrada, la celda va vacía.
 */
function resolverCuadro(grid, escrito = {}) {
  const c = cuadro(grid)
  const hoja = {}
  const filas = []
  const n = c.fUltima - c.fPrimera + 1
  // Las columnas B y C las arma el mismo generador con SUMPRODUCT/TRIM, que este evaluador no cubre:
  // se cuentan acá con las reglas de Sheets (TRIM colapsa espacios; un texto en la columna de
  // importes vale cero) y su forma ya la vigila `jornales-plantel-clave-recortada.test.mjs`.
  const TRIM = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < n; i++) {
    const r = c.fPrimera + i
    const cat = String(c.filas[i + 1][0])
    let personas = 0
    let hoy = 0
    for (let f = BLOQUE.inicio; f <= BLOQUE.fin; f++) {
      if (TRIM((grid[f - 1] ?? [])[3]) !== cat) continue
      personas++
      const w = (grid[f - 1] ?? [])[22]
      hoy += typeof w === 'number' && Number.isFinite(w) ? w : 0
    }
    hoja[`B${r}`] = personas
    hoja[`C${r}`] = hoy
    hoja[`E${r}`] = Object.prototype.hasOwnProperty.call(escrito, cat) ? escrito[cat] : ''
  }
  for (let i = 0; i < n; i++) {
    const r = c.fPrimera + i
    const cat = String(c.filas[i + 1][0])
    const basico = evaluarFormula(String(c.filas[i + 1][5]), { hoja, hojas: { _UOCRA_RAW: REPLICA } })
    hoja[`F${r}`] = basico
    const sigmaAumento = evaluarFormula(String(c.filas[i + 1][3]),
      { hoja, hojas: { _UOCRA_RAW: REPLICA, _J_OBREROS: hojaDeGrilla(grid.map((f) => f ?? [])) } })
    hoja[`D${r}`] = sigmaAumento
    const conAumento = evaluarFormula(String(c.filas[i + 1][6]), { hoja })
    hoja[`G${r}`] = conAumento
    filas.push({
      cat, personas: hoja[`B${r}`], hoy: hoja[`C${r}`], basico, sigmaAumento,
      estadoFormula: String(c.filas[i + 1][7]), hoja,
    })
  }
  const rango = (col) => `$${col}$${c.fPrimera}:$${col}$${c.fUltima}`
  return {
    cuadro: c,
    filas,
    hoy: filas.reduce((a, f) => a + f.hoy, 0),
    aumento: filas.reduce((a, f) => a + f.sigmaAumento, 0),
    sinEscala: evaluarFormula(expresionSinEscala(rango('B'), rango('F')), { hoja }),
  }
}

test('EL INCIDENTE: con la columna del dueño llena de basura, NADIE pierde su aumento', () => {
  const g = espejo()
  const sucio = resolverCuadro(g, BASURA)
  const limpio = resolverCuadro(g, {})

  // 1 · LAS CUATRO CATEGORÍAS SIGUEN TENIENDO BÁSICO. Es lo que la guarda vieja perdía.
  assert.deepEqual(sucio.filas.map((f) => f.basico), [6348, 5399, 5399, 6348],
    'alguna categoría se quedó sin básico: la basura de la E volvió a gobernar el MATCH')
  assert.equal(sucio.sinEscala, 0, 'el control de «sin escala» cuenta personas que sí tienen escala')

  // 2 · Y CON EL MISMO NÚMERO QUE CON LA COLUMNA LIMPIA. Ésta es la afirmación que importa: la basura
  //     NO cuesta plata. Es una igualdad y no un valor pegado, porque lo que se prueba no es cuánto
  //     da esta grilla sino que dé LO MISMO.
  assert.equal(sucio.aumento, limpio.aumento, 'la basura en la E le costó el aumento a alguien')
  assert.equal(sucio.hoy, limpio.hoy, 'la tarifa de hoy no puede depender de lo que diga la columna E')

  // 3 · Y EL NÚMERO DE ESTA GRILLA, FIJADO. Tarifas: 2 Oficiales ($5.600 + $5.300) + 1 Ayudante
  //     ($4.500) + 1 «A M» ($4.300) + 1 «OF M» ($5.200) = $24.900. Aumentos, media brecha contra el
  //     piso de cada categoría: $374 + $524 + $449,50 + $549,50 + $574 = $2.471.
  assert.equal(sucio.hoy, 24900)
  assert.equal(sucio.aumento, 374 + 524 + 449.5 + 549.5 + 574)
  assert.equal(sucio.aumento, 2471)
  assert.equal(sucio.hoy + sucio.aumento, 27371)
})

test('LAS CUATRO FILAS DICEN QUE SE IGNORÓ LA CELDA DEL DUEÑO, Y CONTRA QUÉ MIDIERON', () => {
  // Corregir el número y dejar al dueño creyendo que su categoría gobierna es media corrección: la
  // próxima vez que mire, va a leer el básico de Oficial en una fila donde él escribió otra cosa.
  const equivalentes = { OF: 'Oficial', A: 'Ayudante', 'A M': 'Ayudante', 'OF M': 'Oficial' }
  const r = resolverCuadro(espejo(), BASURA)
  for (const f of r.filas) {
    // SE EVALÚA LA CELDA, NO SE LE BUSCA EL TEXTO. El `IF` de este evaluador es perezoso igual que el
    // de Sheets: con la condición en TRUE ni toca la rama del `FILTER`, que es la que no soporta.
    const dice = evaluarFormula(f.estadoFormula, { hoja: f.hoja, hojas: { _UOCRA_RAW: REPLICA } })
    assert.match(String(dice), /^▲ «Convenio» no está en la escala — uso /,
      `la fila «${f.cat}» usó la equivalencia declarada y no lo dice: ${dice}`)
    assert.equal(String(dice), `▲ «Convenio» no está en la escala — uso ${equivalentes[f.cat]}`,
      `la fila «${f.cat}» no nombra la categoría con la que midió`)
  }
  // ═══ Y EL AVISO SE APAGA CON LA COLUMNA LIMPIA — EVALUANDO LA CONDICIÓN REAL, NO UNA COPIA ═══
  //
  // Un aviso que se dibuja siempre no es un aviso. La condición se EXTRAE de la fórmula que el
  // generador emitió —no se vuelve a escribir a mano acá— porque una copia hecha por el test es la
  // misma trampa que el mapa de básicos que este archivo vino a reemplazar: probaría que el test
  // sabe la regla, no que la celda la aplica.
  const c = cuadro(espejo())
  const estadoOF = String(c.filas.find((f) => String(f[0]) === 'OF')[7])
  const cond = /^=IF\((.+?);"▲/.exec(estadoOF)
  assert.ok(cond, `no pude extraer la condición del Estado emitido: ${estadoOF.slice(0, 80)}`)
  const enciende = (celda) => evaluarFormula(`IF(${cond[1].replace(/\$E\d+/g, '$E$1')};1;0)`,
    { hoja: { E1: celda }, hojas: { _UOCRA_RAW: REPLICA } })
  assert.equal(enciende('Convenio (tuya)'), 1, 'la basura tiene que encender el aviso')
  assert.equal(enciende(5601), 1, 'un número suelto tampoco es una categoría')
  assert.equal(enciende(''), 0, 'la celda vacía NO es un error del dueño: no hay nada que avisar')
  assert.equal(enciende('Oficial'), 0, 'lo que el dueño escribe bien gana y no se avisa nada')
})
