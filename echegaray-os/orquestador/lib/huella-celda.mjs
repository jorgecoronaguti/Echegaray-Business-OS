// LA HUELLA POR CELDA — evidencia POSITIVA de la propia escritura, celda por celda.
//
// POR QUÉ EXISTE (05/08). El dueño: *"no podés volver a escribir algo si yo ya lo borré, pasó en los
// dos cash flows"*. Le propuse guardar un snapshot para restaurar después del daño y me corrigió:
// **"mal hecho entonces, tiene que tener una mejor práctica"**. Tenía razón: un snapshot es una red
// debajo del precipicio. Lo que hace falta es que el generador sea ESTRUCTURALMENTE INCAPAZ de
// re-crear lo que él borró.
//
// ═══ LA DISTINCIÓN QUE HOY NO SE PUEDE HACER ═══
//
// `respetar-ediciones.mjs` guarda una lista de RÓTULOS (texto → reemplazo). Con esa lista, "el texto
// que yo escribía no está en la pestaña" tiene tres causas indistinguibles:
//
//     · el dueño lo borró          → no lo vuelvo a escribir
//     · nunca existió ahí          → no hay nada que respetar
//     · cambió porque lleva la fecha de hoy adentro → falso positivo diario
//
// Medido sobre el Cash Flow Semanal: de 92 "borrados" registrados, 53 eran rótulos que el dueño nunca
// borró —entre ellos "ACTIVIDADES OPERATIVAS" y "AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO"—, vivos en
// la pestaña. Una lista de textos no puede probar de quién es una celda.
//
// La huella sí, porque guarda la evidencia positiva: **esta celda la escribí yo, con esta FORMA.**
//
//     huella propia  +  celda VACÍA hoy      →  la vaciaste vos      →  NO la vuelvo a escribir
//     SIN huella     +  celda CON contenido  →  nunca fue mía        →  NO la piso, jamás
//     el resto                               →  se escribe normal
//
// ═══ POR QUÉ ES INMUNE AL CONTENIDO VARIABLE ═══
//
// No se guarda el texto: se guarda la FORMA —el contenido con cada parte variable enmascarada—.
// "Conciliación del OS al 2026-08-04 — 3 diferencias" y la de mañana tienen la MISMA forma
// (`conciliación del os al <F> — <N> diferencias`), y "$ 1.234,56" y "$ 9.870,00" son las dos `<$>`.
// Un rótulo con fecha, un importe que cambia y un contador dejaron de ser eventos.
//
// ═══ POR QUÉ LA POSICIÓN, SI LA REGLA DEL REPO DICE "ANCLAR AL TEXTO" ═══
//
// Porque acá la pregunta es otra. Anclar al texto sirve para "¿qué rótulo cambiaste?"; NO sirve para
// "¿esta celda está vacía porque la vaciaste vos?", que es una pregunta sobre una celda, no sobre un
// texto. La primera versión de `respetar-ediciones` ya se quemó anclando a la posición SOLA: una fila
// de subtítulo corrió todo un renglón y la regla "respetó" un importe pegado donde iba un título.
//
// La cura no es abandonar la posición: es **exigir posición Y forma para reclamar propiedad**, y
// medir la alineación antes de creerle al mapa. Si las formas ya no caen donde el mapa dice, se busca
// el desplazamiento de filas que las devuelve a su lugar (una pestaña que crece o se achorta se corre
// EN BLOQUE); y si ningún desplazamiento alinea, la huella NO DECIDE esa corrida y se resiembra.
//
// ═══ CONTRA QUÉ LECTURA SE COMPARA ═══
//
// Contra la lectura FORMULA, no contra el texto visible. Una fórmula `=SI(...;"";...)` se VE vacía y
// tiene contenido: comparar contra lo visible daría "el dueño la borró" y el generador dejaría de
// escribir la fórmula para siempre. La pregunta de la huella es "¿hay algo en esta celda?", y eso lo
// contesta la fórmula. (La Regla 0 usa la otra lectura porque su pregunta es "¿qué dice la pestaña?".)

import { createHash } from 'node:crypto'
import { query } from './db.mjs'
import { VACIO, letraCol, limpiarCentinela } from './preservar-anotaciones.mjs'
import { MIA_PROBADA } from './no-borrar.mjs'
import {
  claveCelda, formaComparable, formaDe, formulasPropiasPorColumna, hayContenido, LARGO_FORMA,
  MARCAS_TIPOGRAFICAS, noReponerAusentes, normalizarFormula, quiereEscribir,
} from './huella-forma.mjs'
import { marcarAbandonadas, partirPorFootprint, veredictoDeFootprint } from './huella-footprint.mjs'

// EL VOCABULARIO DE LA FORMA SE MUDÓ a `huella-forma.mjs` y se re-exporta desde acá para no romper a
// quien ya lo importaba. Tuvo que mudarse porque ahora hay DOS veredictos que necesitan la misma
// noción de "la misma celda": el de acá —posición Y forma, el más fuerte— y el que decide cuando la
// posición ya no se puede usar. Dos definiciones de "forma" en el archivo que decide qué se puede
// reescribir del trabajo del dueño es exactamente la duplicación que hay que evitar.
export { claveCelda, formaComparable, formaDe, formulasPropiasPorColumna, hayContenido, normalizarFormula, quiereEscribir }

/** Cuántas celdas comparables hacen falta para que la alineación sea un juicio y no una casualidad. */
export const MIN_COMPARABLES = 8
/** Qué fracción de las formas tiene que caer donde el mapa dice para creerle al mapa. */
export const UMBRAL_ALINEACION = 0.6
/** Desplazamientos de fila que se prueban, del más probable al menos. Una pestaña se corre en bloque. */
export const DESPLAZAMIENTOS = [0, -1, 1, -2, 2, -3, 3, -5, 5]

/** Hash corto de la forma. Es la clave que se compara; la forma se guarda al lado como evidencia. */
export function huellaDe(v) {
  const f = formaComparable(formaDe(v))
  return f ? createHash('sha1').update(f).digest('hex').slice(0, 16) : null
}

/**
 * LAS FORMAS DE TEXTO QUE EL GENERADOR ESCRIBE HOY, EN CUALQUIER PARTE DE SU GRILLA.
 *
 * ═══ EL RESIDUO INMORTAL (06/08) ═══
 *
 * "Impuestos y Financieros" quedó con cinco celdas "⚠ PROYECCIÓN" en I20:M20, colgando a la derecha de
 * una fila del calendario de vencimientos. Ese texto lo escribe la fila "DDJJ presentada", que en el
 * layout anterior vivía en la fila 20 y hoy vive en la 57. El generador SÍ manda el centinela VACIO en
 * I20:M20 —la grilla rellena su ancho entero— así que la limpieza estaba pedida y no ocurría.
 *
 * La causa es de acá: `huellasDeEscritura` no deja huella de una celda VACIO (correcto: no hay
 * contenido que registrar) y el barrido borra las huellas viejas de la ventana escrita. Entonces la
 * celda queda OCUPADA (con el resto del layout viejo) y SIN huella propia, que es exactamente la
 * firma de "nunca fue mía y tiene algo tuyo" → se preservaba. Para siempre, y en cada corrida.
 *
 * La regla de propiedad no se afloja: se le agrega la única evidencia que faltaba. Si el generador
 * manda VACIO —una orden explícita de limpiar SU celda— y lo que hay ahí es un TEXTO que él mismo
 * sigue escribiendo en otra parte de esta misma grilla, esa celda es suya: la escribió él en un layout
 * anterior. El dueño tendría que haber tipeado, letra por letra, uno de los textos del generador.
 *
 * SÓLO TEXTO, Y CON LETRAS. Un importe o una fecha residual comparten forma (`<$>`, `<f>`) con
 * cualquier importe o fecha que el generador escriba hoy: bastaría eso para borrar un número del
 * dueño. Una fórmula tampoco cuenta —el dueño copia fórmulas—. Queda el texto con al menos tres
 * letras, que es lo que produce un rótulo y no produce un dato.
 */
export function formasDeTextoPropio(generado = []) {
  const out = new Set()
  for (const f of generado || []) {
    for (const c of f || []) {
      const forma = formaDe(c)
      if (!forma || forma.startsWith('=')) continue
      if ((forma.match(/[a-záéíóúüñ]/g) || []).length < 3) continue
      // SÓLO TEXTO INCONFUNDIBLE DE GENERADOR (rechazo del auditor de cierre, 06/08, probado en
      // frío): la versión anterior reclamaba TODA palabra de la grilla — 129 formas en Impuestos,
      // entre ellas "total", "iva", "importe", "disponible" — y una nota del dueño que coincidiera
      // se borraba. La propiedad exige una marca tipográfica que ningún humano tipea al anotar
      // (▲ ⚠ ⇒ ‖ § · —) o un rótulo largo: "Total" nunca vuelve a ser evidencia de que lo escribí yo.
      // La lista es UNA (`MARCAS_TIPOGRAFICAS`, en huella-forma): era una copia, y una copia de un
      // criterio de propiedad se queda atrás el día que cambia un glifo — que es hoy.
      if (!MARCAS_TIPOGRAFICAS.test(forma) && forma.length < 23) continue
      out.add(forma)
    }
  }
  return out
}

/**
 * LOS TEXTOS QUE EL GENERADOR ESCRIBE EN ESTA MISMA GRILLA — el segundo testigo, más angosto.
 *
 * ═══ POR QUÉ NO ALCANZA `formasDeTextoPropio` (14/08) ═══
 *
 * Aquélla exige una marca tipográfica o 23 caracteres, y con razón: se la usa para reclamar celdas
 * donde el generador pide limpiar en cualquier parte de su huella, y ahí un "Total" suelto haría que
 * una nota del dueño desapareciera. Pero los residuos que un REDISEÑO deja son justamente rótulos
 * cortos y sin marca —medidos en "Jornales por Quincena": "Banco" (F80), "Se paga el" (E78),
 * "Dirección" (F40), "Pagado el" (N110)— así que ese filtro los dejaba inmortales.
 *
 * Este conjunto es el texto EXACTO (no la forma enmascarada) que el generador escribe hoy en algún
 * lugar de esta misma grilla. No se usa solo: sólo decide junto con `filaProbadaMia`, o sea dentro de
 * una fila donde la huella ya probó que el generador es el autor. Que el dueño haya tipeado, letra
 * por letra, uno de mis encabezados, ADENTRO de una fila mía y JUSTO en la celda donde yo escribo, es
 * la coincidencia que este par de condiciones descarta.
 *
 * Sólo texto con letras: un serial o un importe residual se parece a cualquier número del cuadro y
 * eso ya alcanzó una vez para borrar un dato del dueño. Los residuos numéricos siguen saliendo por la
 * vía declarada (scripts/limpiar-residuo-*.mjs), donde una persona nombra la celda. La FÓRMULA fósil
 * —que tampoco es texto— sí tiene su propio camino desde el 14/08: ver `formulasPropiasPorColumna`,
 * que la reclama por el contenido exacto y por la columna, nunca por el parecido de un número.
 */
export function textosPropiosDeLaGrilla(generado = []) {
  const out = new Set()
  for (const f of generado || []) {
    for (const c of f || []) {
      const t = String(c ?? '').replace(/^'/, '').trim()
      if (!t || t.startsWith('=') || t === VACIO.trim() || t === VACIO) continue
      if ((t.match(/[a-záéíóúüñ]/gi) || []).length < 3) continue
      out.add(t.toLowerCase())
    }
  }
  return out
}

/** Cuántas celdas de mi grilla del margen derecho hacen falta para creer que la FILA es mía. */
export const MIN_ANCLAS_DE_FILA = 2

/**
 * ¿ESTA FILA ES DEL GENERADOR? — la primera de las dos preguntas de `residuo-propio.mjs`, contestada
 * con la evidencia más fuerte que hay acá: la huella sellada de la corrida anterior.
 *
 * Cuenta cuántas OTRAS celdas de la misma fila tienen huella propia Y siguen teniendo hoy la forma
 * que quedó sellada. Dos o más es una fila que el generador escribe de punta a punta; una sola puede
 * ser un número que coincide por casualidad.
 *
 * La celda que se está juzgando queda EXCLUIDA a propósito: es la que no tiene huella, y contarla
 * volvería circular el veredicto.
 */
export function filaProbadaMia(actual = [], huellas = new Map(), i = 0, colJuzgada = -1, { fila0 = 1, col0 = 0, off = 0 } = {}) {
  const hoy = actual[i] || []
  let anclas = 0
  for (let j = 0; j < hoy.length; j++) {
    if (col0 + j === colJuzgada) continue
    const mia = huellas.get(claveCelda(fila0 + i - off, col0 + j))
    // Una celda ABANDONADA no ancla una fila: lo que sigue ahí es residuo de un layout que dejé
    // atrás, y una fila hecha de residuos no prueba que la fila de HOY sea mía.
    if (!mia || mia.borrada || mia.abandonada) continue
    if (formaComparable(formaDe(hoy[j])) === formaComparable(mia.forma)) anclas++
  }
  return anclas >= MIN_ANCLAS_DE_FILA
}

/**
 * Cuántas de mis huellas caen sobre una celda con la MISMA forma, probando un desplazamiento de filas.
 * Las celdas vacías no se cuentan: son justo lo que se está juzgando, e incluirlas sesgaría el
 * veredicto hacia "desalineada" cada vez que el dueño borra algo.
 */
export function coincidencias(actual = [], huellas = new Map(), off = 0, { fila0 = 1, col0 = 0 } = {}) {
  let comparables = 0; let coinciden = 0
  for (const [k, h] of huellas) {
    const [fila, col] = k.split(':').map(Number)
    const i = fila - fila0 + off
    const j = col - col0
    if (i < 0 || i >= actual.length || j < 0) continue
    const f = formaDe((actual[i] || [])[j])
    if (!f) continue
    comparables++
    // Los DOS lados normalizados: la huella guardada puede ser anterior a `formaComparable`.
    if (formaComparable(f) === formaComparable(h.forma)) coinciden++
  }
  return { comparables, coinciden }
}

/**
 * El desplazamiento de filas que mejor alinea el mapa con la pestaña de hoy, y si alcanza para
 * creerle. Sin huellas, con pocas comparables o con una coincidencia baja, la huella NO decide: se
 * escribe como siempre y se resiembra. Ese es el lado tímido — se nota y se arregla.
 */
export function mejorDesplazamiento(actual = [], huellas = new Map(), opts = {}) {
  if (!huellas.size) return { off: 0, alineada: false, fraccion: 0, comparables: 0, motivo: 'sin huella previa: primera corrida' }
  // Se ARRANCA de `off: 0` en vez de un mejor vacío: si NINGÚN desplazamiento acierta una sola celda,
  // el veredicto tiene que ser "mi mapa ya no cae donde dice" —que es la verdad— y no "no hay nada
  // comparable", que suena a pestaña vacía y esconde justo el caso peligroso.
  let mejor = { off: 0, ...coincidencias(actual, huellas, 0, opts) }
  for (const off of DESPLAZAMIENTOS) {
    const r = coincidencias(actual, huellas, off, opts)
    if (r.coinciden > mejor.coinciden) mejor = { off, ...r }
  }
  const { comparables, coinciden, off } = mejor
  const fraccion = comparables ? coinciden / comparables : 0
  if (comparables < MIN_COMPARABLES) {
    return { off, alineada: false, fraccion, comparables, motivo: `sólo ${comparables} celdas comparables: no alcanza para juzgar` }
  }
  if (fraccion < UMBRAL_ALINEACION) {
    return { off, alineada: false, fraccion, comparables, motivo: `mi mapa ya no cae donde dice (${coinciden}/${comparables}): la pestaña cambió de forma` }
  }
  return { off, alineada: true, fraccion, comparables, motivo: `${coinciden} de ${comparables} celdas caen donde mi huella dice${off ? ` (corrida ${off > 0 ? '+' : ''}${off} fila${Math.abs(off) === 1 ? '' : 's'})` : ''}` }
}

/**
 * NÚCLEO PURO: aplica la huella sobre la grilla que el generador quiere escribir.
 *
 * Devolver `''` en una celda NO la borra: `fusionar()` lee la cadena vacía como "no es mi celda,
 * preservá lo que hay". Por eso suprimir es exactamente escribir `''` — la celda queda como el dueño
 * la dejó, vacía si él la vació, con su contenido si es suya.
 *
 * ═══ Y DEVOLVER `MIA_PROBADA` SÍ LA BORRA — ES EL TERCER ESTADO (13/08) ═══
 *
 * Hasta hoy, cuando el generador pedía limpiar SU celda (centinela `VACIO`) y la celda tenía algo, la
 * grilla salía con `''` o con el centinela, y `no-borrar.mjs` —que no puede saber de quién es— la
 * reponía. El log decía "🧹 la limpio" y la celda seguía ahí en cada corrida: el mensaje mentía. La
 * limpieza ahora ocurre de verdad, y **sólo con evidencia positiva**:
 *
 *   · huella propia en la coordenada Y la forma de hoy IGUAL a la que dejé escrita  → `limpiadas`
 *   · sin huella, pero el texto de hoy es uno que sigo escribiendo en esta grilla   → `residuos`
 *   · sin huella, pero la FÓRMULA de hoy es la que escribo en esta misma columna    → `residuos`
 *
 * Si la forma cambió, la celda es mía por posición y el contenido NO: alguien la editó encima. Eso
 * va a `editadas` y se preserva. Es el caso que separa "limpio lo mío" de "borro lo que escribiste
 * arriba de lo mío", y es la única razón por la que este tercer estado no es un bypass.
 *
 * ═══ SIN MAPA NO SE ESCRIBE A CIEGAS: SE DECIDE POR FORMA (13/08) ═══
 *
 * Hasta hoy, cuando la alineación no alcanzaba el umbral esta función devolvía la grilla INTACTA y el
 * generador reponía todo — incluido lo que el dueño había vaciado. Falla ABIERTO, y no era un caso de
 * borde: medido contra el archivo vivo, cuatro pestañas viven por debajo del umbral (Cash Flow
 * Semanal 0,47, Mensual 0,52, Recurrentes 0,59, _PRESUPUESTO_MENSUAL 0,37) y entre las cuatro tienen
 * CERO marcas de borrado sobre 5.858 huellas. No es que el dueño no borrara ahí: es que este camino
 * no podía registrarlo, y por eso su reclamo se repite.
 *
 * El veredicto de reemplazo no usa la posición —que es justo lo que no se puede creer— sino la
 * ausencia de la forma en TODA la pestaña. Vive en `huella-forma.mjs` con sus tres frenos.
 *
 * ═══ Y LA CUARTA EVIDENCIA: EL FOOTPRINT DE LA CORRIDA ANTERIOR (14/08) ═══
 *
 * Las tres de arriba prueban que una celda es MÍA HOY. La cuarta prueba que ESTUVO adentro de mi
 * footprint y que este layout ya no la ocupa — el residuo que deja un cuadro cuando cambia de alto.
 * Vive en `huella-footprint.mjs` con el porqué entero; acá se usa donde antes el veredicto era
 * `ajena` sin remedio: celda ocupada, sin huella viva, y yo pidiendo limpiarla.
 *
 * @returns {{grid:any[][], suprimidas:Array, ajenas:Array, residuos:Array, limpiadas:Array,
 *            editadas:Array, reescritos:Array, desocupadas:Array, alineacion:object}}
 */
export function aplicarHuella(generado = [], actual = [], huellas = new Map(), opts = {}) {
  const { fila0 = 1, col0 = 0 } = opts
  const alineacion = mejorDesplazamiento(actual, huellas, opts)
  // La alineación se mide contra el mapa ENTERO —un residuo mío todavía publicado cae donde mi
  // registro dice, y eso es información—, pero la propiedad de hoy la decide sólo lo que ocupo hoy.
  const { activas, footprint } = partirPorFootprint(huellas)
  const suprimidas = []; const ajenas = []; const residuos = []; const limpiadas = []; const editadas = []
  // Las celdas que ocupé en un layout anterior y hoy ya no ocupo. Se cuentan aparte de `limpiadas`
  // porque se prueban con otra evidencia, y el log tiene que poder decir con cuál.
  const desocupadas = []
  // Los residuos de rediseño se cuentan aparte de `residuos`: aquéllos se VACÍAN y éstos se PISAN con
  // el contenido de hoy. Mezclarlos haría que el log dijera "la limpio" sobre una celda que quedó con
  // una fórmula — y el log es la única forma que tiene el dueño de auditar qué decidí sobre su celda.
  const reescritos = []
  const vacio = { grid: generado, suprimidas, ajenas, residuos, limpiadas, editadas, reescritos, desocupadas, alineacion }
  if (!alineacion.alineada) {
    const porForma = noReponerAusentes(generado, actual, huellas, { fila0, col0 })
    suprimidas.push(...porForma.suprimidas)
    return { ...vacio, grid: porForma.grid, alineacion: { ...alineacion, porForma: porForma.motivo } }
  }
  const mias = formasDeTextoPropio(generado)
  // El segundo testigo, para los residuos que un rediseño deja en celdas donde HOY escribo contenido.
  const textosMios = textosPropiosDeLaGrilla(generado)
  // El tercero, para el residuo que no es texto: la fórmula fósil, indexada por columna.
  const formulasMias = formulasPropiasPorColumna(generado, { col0 })
  const norm = (v) => String(v ?? '').replace(/^'/, '').trim().toLowerCase()
  const grid = generado.map((f, i) => (f || []).map((c, j) => {
    if (!quiereEscribir(c)) return c
    const fila = fila0 + i - alineacion.off
    const col = col0 + j
    const mia = activas.get(claveCelda(fila, col))
    const hoy = (actual[i] || [])[j]
    const ocupada = hayContenido(hoy)
    // LA VACIASTE VOS. Tengo huella propia de esta celda y hoy no hay nada: no la resucito.
    // La marca viaja con DOS coordenadas: dónde estaba la huella (`fila`) y dónde vive la celda hoy
    // (`filaHoy`). Si la pestaña se corrió, la marca tiene que quedar donde la celda está AHORA — si
    // no, la corrida siguiente la buscaría en la fila vieja y el borrado se olvidaría.
    if (mia && !ocupada) {
      suprimidas.push({ fila, col, filaHoy: fila0 + i, colHoy: col, forma: mia.forma, huella: mia.huella, mio: String(c).slice(0, 60) })
      return ''
    }
    // PIDO LIMPIAR MI PROPIA CELDA Y TODAVÍA TIENE LO QUE YO ESCRIBÍ. La forma se compara truncada a
    // 300 porque así se guardó: comparar contra la entera daría falso negativo en un texto largo.
    if (mia && ocupada && c === VACIO) {
      // El truncado ya vive en `formaComparable` —era la causa raíz de que las fórmulas largas no
      // coincidieran ni consigo mismas— así que acá no se vuelve a cortar a mano. Este camino era el
      // ÚNICO de los tres que lo tenía; los otros dos comparaban la forma entera contra la sellada.
      if (formaComparable(formaDe(hoy)) === formaComparable(mia.forma)) {
        // `forma` y `filaMapa` viajan para que la limpieza quede REGISTRADA como footprint: es la
        // única forma de volver a probar que esta celda es mía si la escritura de hoy no llega al
        // Sheet (un 429 parte la pestaña al medio) o si el residuo reaparece más adelante.
        limpiadas.push({ fila: fila0 + i, col, mio: String(hoy).slice(0, 60), forma: mia.forma, huella: mia.huella, filaMapa: fila })
        return MIA_PROBADA
      }
      editadas.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), forma: mia.forma })
      return ''
    }
    if (!mia && ocupada) {
      // LA CUARTA EVIDENCIA — el porqué entero está en `huella-footprint.mjs`. Pedí limpiar esta
      // celda, no tengo huella viva, pero SÍ registro de haberla ocupado en un layout anterior con
      // la forma que dejé. Va PRIMERO entre los caminos de `VACIO` porque es la más fuerte que queda
      // —coordenada exacta más forma sellada— y por eso mismo un registro que NO coincide corta acá:
      // probé que la celda fue mía y que lo que hay hoy no lo es. Ninguna evidencia de las que
      // siguen, que se apoyan en el parecido del texto, puede revertir eso.
      if (c === VACIO) {
        const v = veredictoDeFootprint(footprint, fila, col, hoy)
        if (v?.veredicto === 'residuo') {
          desocupadas.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), forma: v.forma, filaMapa: fila })
          return MIA_PROBADA
        }
        if (v?.veredicto === 'editada') {
          editadas.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), forma: v.forma })
          return ''
        }
      }
      // MI RESIDUO DE UN LAYOUT ANTERIOR. Pedí limpiar esta celda y lo que hay es un texto que yo
      // mismo sigo escribiendo en otra parte de la grilla: la escribí yo cuando esa fila era otra
      // cosa. Sin esto el residuo es inmortal — no dejé huella (era VACIO) y por eso parece tuyo.
      if (c === VACIO && mias.has(formaDe(hoy))) {
        residuos.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), por: 'un texto que sigo escribiendo' })
        return MIA_PROBADA
      }
      // ═══ Y EL RESIDUO QUE NO ES TEXTO: LA FÓRMULA FÓSIL (14/08) ═══
      //
      // El porqué entero, con las cuatro celdas reales medidas, está en `formulasPropiasPorColumna`.
      // Acá sólo se cobra: pido limpiar esta celda, no tengo huella ni registro de abandono, y lo que
      // hay adentro es —carácter por carácter— una fórmula que YO escribo HOY en ESTA MISMA COLUMNA.
      //
      // Va DESPUÉS del footprint y del texto a propósito: aquéllas prueban la propiedad por un
      // registro que yo sellé; ésta la prueba por coincidencia, que es más débil, y entre dos pruebas
      // manda siempre la más fuerte. Un veredicto de footprint que dice "editada" ya cortó arriba.
      //
      // NO SE REGISTRA COMO FOOTPRINT, por la misma razón por la que no se registran `residuos` ni
      // `reescritos`: convertir una prueba por coincidencia en un registro permanente sería ensanchar
      // en silencio la evidencia más fuerte que tiene el mecanismo.
      if (c === VACIO) {
        const formula = normalizarFormula(hoy)
        if (formula && formulasMias.get(col)?.has(formula)) {
          residuos.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), por: 'una fórmula que sigo escribiendo en esta columna' })
          return MIA_PROBADA
        }
      }
      // ═══ EL RESIDUO DE REDISEÑO, QUE ERA INMORTAL POR CONSTRUCCIÓN (14/08) ═══
      //
      // Cuando una pestaña se REDISEÑA las filas se corren, y en las coordenadas nuevas queda lo que
      // el layout viejo tenía ahí. Esa celda no tiene huella (nunca escribí en ESA coordenada) y sí
      // tiene contenido → caía derecho en `ajenas` → devolvía `''` → `fusionar` preservaba el residuo
      // → no se sellaba huella → la corrida siguiente repetía el veredicto. Para siempre.
      //
      // Medido en "Jornales por Quincena" el 14/08, con la pestaña rediseñada el 13: `F80` quedó con
      // el texto "Banco" en vez del `INDEX/MATCH` del básico de convenio, y por eso la Σ del plantel
      // publicó $46.988 —la mitad del plantel afuera— sin un solo error. `E78` quedó con "Se paga el"
      // donde va «Convenio (tuya)», y `F40` con "Dirección" donde va el lookup del banco de mayo.
      //
      // Se abre con DOS evidencias positivas y las dos son necesarias, que son las mismas dos
      // preguntas de `residuo-propio.mjs` ("¿la fila es mía?" y "¿la celda es mía?"):
      //
      //   1. la FILA está probada mía por huella —≥2 celdas selladas que hoy siguen con su forma—;
      //   2. lo que hay HOY es, letra por letra, un texto que YO escribo en esta misma grilla.
      //
      // Y una tercera por construcción: acá el generador quiere escribir CONTENIDO en esa celda, o
      // sea que la celda está adentro de su cuadro, no al costado. Un `''` (la columna del dueño) no
      // llega hasta acá: `quiereEscribir` lo filtra arriba y la celda se preserva como siempre.
      //
      // Lo que este camino NO toca, y es deliberado: un residuo NUMÉRICO (un serial, un importe).
      // Comparte apariencia con cualquier dato del dueño y ninguna de las dos evidencias lo separa —
      // ésos se limpian por la vía declarada, celda por celda, con una persona nombrándolas. (La
      // fórmula fósil salió de esta bolsa el 14/08 y tiene camino propio abajo: una fórmula no se
      // parece a un dato, se compara carácter por carácter.)
      if (c !== VACIO && textosMios.has(norm(hoy)) && filaProbadaMia(actual, activas, i, col, { fila0, col0, off: alineacion.off })) {
        reescritos.push({ fila: fila0 + i, col, suyo: String(hoy).slice(0, 60), mio: String(c).slice(0, 60) })
        return c
      }
      // NUNCA FUE MÍA Y TIENE ALGO TUYO. Sin evidencia de que la escribí yo, no se pisa.
      ajenas.push({ fila, col, suyo: String(hoy).slice(0, 60) }); return ''
    }
    return c
  }))
  return { ...vacio, grid }
}

/**
 * NÚCLEO PURO: las celdas propias de esta escritura, listas para persistir. Sólo las que llevan
 * contenido real: el centinela VACIO limpia una celda y no deja huella (si mañana aparece algo ahí,
 * la celda estará ocupada sin huella mía → ajena → se preserva, que es el lado correcto).
 */
export function huellasDeEscritura(grid = [], { fila0 = 1, col0 = 0 } = {}) {
  const out = []
  grid.forEach((f, i) => (f || []).forEach((c, j) => {
    const forma = formaDe(c)
    if (!forma) return
    // El largo del guardado es una CONSTANTE compartida con la comparación, no un 300 suelto. Cuando
    // el sellado corta en un largo y la comparación en otro, una fórmula larga deja de coincidir
    // consigo misma y la huella no decide nunca — es lo que pasó en los dos Cash Flow.
    out.push({ fila: fila0 + i, col: col0 + j, forma: forma.slice(0, LARGO_FORMA), huella: huellaDe(c) })
  }))
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

async function asegurarTabla() {
  await query(`
    create table if not exists public.sheet_huella_celda (
      file_id    text not null,
      pestana    text not null,
      fila       int  not null,
      col        int  not null,
      forma        text not null,
      huella       text not null,
      borrada_en   timestamptz,
      abandonada_en timestamptz,
      escrito_en   timestamptz not null default now(),
      primary key (file_id, pestana, fila, col)
    )`)
  // La tabla ya existe en la base viva desde el 05/08: el `create` de arriba no la toca y la columna
  // nueva tiene que llegar por acá. Sin esto la cuarta evidencia queda muerta hasta que alguien corra
  // la migración a mano, que es exactamente la trampa de "migración en el repo ≠ migración aplicada".
  await query('alter table public.sheet_huella_celda add column if not exists abandonada_en timestamptz')
}

/**
 * El mapa de lo que escribí la última vez en esta pestaña: "fila:col" → {forma, borrada}.
 *
 * Se acota a la VENTANA de este bloque (con holgura para detectar un corrimiento de filas). Sin
 * acotar, las huellas de OTRO bloque de la misma pestaña —CAJA escribe dos veces, Proveedores tiene
 * dos cuadros— caerían sobre celdas que no les corresponden y ensuciarían la medición de alineación
 * hasta hacerla fallar. La huella dejaría de decidir justo en las pestañas más pobladas.
 */
export async function leerHuellas(fileId, pestana, ventana = null) {
  await asegurarTabla()
  const cond = ventana ? ' and fila between $3 and $4 and col between $5 and $6' : ''
  const holgura = Math.max(...DESPLAZAMIENTOS.map(Math.abs))
  const args = ventana
    ? [ventana.fila0 - holgura, ventana.fila0 + ventana.alto - 1 + holgura, ventana.col0, ventana.col0 + ventana.ancho - 1]
    : []
  const r = await query(
    `select fila, col, forma, huella, borrada_en, abandonada_en from public.sheet_huella_celda
      where file_id = $1 and pestana = $2${cond}`,
    [fileId, pestana, ...args],
  )
  return new Map(r.rows.map((x) => [claveCelda(x.fila, x.col), {
    forma: x.forma, huella: x.huella, borrada: Boolean(x.borrada_en), abandonada: Boolean(x.abandonada_en),
  }]))
}

/** Inserta/actualiza en tandas: una pestaña grande son miles de celdas y un solo INSERT no entra. */
async function upsertHuellas(fileId, pestana, filas, sello) {
  for (let i = 0; i < filas.length; i += 400) {
    const tanda = filas.slice(i, i + 400)
    const vals = tanda.map((_, k) => `($1,$2,$${k * 4 + 4},$${k * 4 + 5},$${k * 4 + 6},$${k * 4 + 7},$3)`).join(',')
    await query(
      `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, escrito_en) values ${vals}
       on conflict (file_id, pestana, fila, col)
       do update set forma = excluded.forma, huella = excluded.huella, escrito_en = excluded.escrito_en,
                     borrada_en = null, abandonada_en = null`,
      [fileId, pestana, sello, ...tanda.flatMap((f) => [f.fila, f.col, f.forma, f.huella])],
    )
  }
}

/**
 * Guarda la huella de lo que quedó escrito, y MARCA como borradas por el dueño las celdas que se
 * suprimieron en esta corrida.
 *
 * LA MARCA DE BORRADO SOBREVIVE. Las filas de celdas que ya no escribo se limpian con el sello de
 * corrida —son historia de un layout que dejé atrás— pero las que llevan `borrada_en` NO: son la
 * decisión del dueño, y si se borraran con el resto la celda volvería a la corrida siguiente. Se sale
 * de esa marca de una sola forma legítima: que la celda vuelva a tener algo (la escribe él, o la
 * escribo yo porque volvió a haber contenido), y entonces el upsert la limpia.
 *
 * LA MARCA DE ABANDONO TAMBIÉN, Y POR EL MISMO MOTIVO INVERTIDO. `abandonadas` son las celdas que
 * ocupé y hoy dejé de ocupar. Antes esas celdas perdían su registro en el barrido —una celda escrita
 * con el centinela `VACIO` no sella huella nueva— y con él se perdía la única prueba de que el
 * residuo que quedara ahí era mío. Ver `huella-footprint.mjs`.
 */
export async function guardarHuellas(fileId, pestana, grid, { fila0 = 1, col0 = 0, suprimidas = [], abandonadas = [] } = {}) {
  await asegurarTabla()
  const sello = new Date()
  const filas = huellasDeEscritura(grid, { fila0, col0 })
  if (filas.length) await upsertHuellas(fileId, pestana, filas, sello)
  // ANTES del barrido: la marca nace con el sello de esta corrida y no se la lleva su propia limpieza.
  await marcarAbandonadas(fileId, pestana, abandonadas, sello)
  for (const s of suprimidas) {
    const fila = s.filaHoy ?? s.fila
    const col = s.colHoy ?? s.col
    await query(
      `insert into public.sheet_huella_celda (file_id, pestana, fila, col, forma, huella, borrada_en, escrito_en)
       values ($1,$2,$3,$4,$5,$6,now(),$7)
       on conflict (file_id, pestana, fila, col)
       do update set borrada_en = coalesce(public.sheet_huella_celda.borrada_en, now()), escrito_en = excluded.escrito_en`,
      [fileId, pestana, fila, col, s.forma, s.huella ?? '', sello],
    )
    // La pestaña se corrió: la huella vieja quedaría marcando una celda que ya no es ésa.
    if (fila !== s.fila || col !== s.col) {
      await query('delete from public.sheet_huella_celda where file_id = $1 and pestana = $2 and fila = $3 and col = $4',
        [fileId, pestana, s.fila, s.col])
    }
  }
  // ═══ EL BARRIDO SE LIMITA A LA VENTANA QUE SE ESCRIBIÓ ═══
  //
  // Una pestaña la escriben VARIOS bloques (CAJA hace una segunda pasada sobre la columna de
  // orígenes; Proveedores escribe dos cuadros). Barrer por pestaña entera haría que el segundo
  // escritor borrara la huella del primero, y a la corrida siguiente las celdas del primero
  // aparecerían "sin huella" → ajenas → dejaría de mantenerlas. Es la misma forma del candado falso
  // por dos escritores. Sólo se limpia lo que estaba DENTRO del rectángulo que esta corrida escribió.
  //
  // Y LAS ABANDONADAS TAMPOCO SE BARREN, aunque esta corrida no las haya vuelto a confirmar. El caso
  // que lo exige es real: si la alineación no alcanza el umbral, `aplicarHuella` no decide nada y no
  // devuelve ninguna celda desocupada — el barrido se llevaría el footprint justo la corrida en que la
  // huella no pudo usarlo, y el residuo volvería a quedar sin dueño demostrable. Se sale de esta marca
  // igual que de la de borrado: cuando la celda vuelve a llevar contenido mío.
  const ancho = Math.max(...grid.map((f) => (f || []).length), 1)
  await query(
    `delete from public.sheet_huella_celda
      where file_id = $1 and pestana = $2 and borrada_en is null and abandonada_en is null and escrito_en < $3
        and fila between $4 and $5 and col between $6 and $7`,
    [fileId, pestana, sello, fila0, fila0 + grid.length - 1, col0, col0 + ancho - 1],
  )
  return { escritas: filas.length, borradas: suprimidas.length, abandonadas: abandonadas.length }
}

/**
 * El ciclo completo para el portón de escritura. Sin base, la huella no decide y se avisa: es el mismo
 * lado que ya toman el candado y la firma, y quedarse sin escribir por una base caída no protege nada
 * que las otras dos guardas no protejan ya.
 */
export async function conHuellaDeCelda(fileId, pestana, generado, actual, opts = {}) {
  const ventana = {
    fila0: opts.fila0 ?? 1,
    col0: opts.col0 ?? 0,
    alto: generado.length,
    ancho: Math.max(...generado.map((f) => (f || []).length), 1),
  }
  const huellas = await leerHuellas(fileId, pestana, ventana).catch(() => new Map())
  const r = aplicarHuella(generado, actual, huellas, opts)
  return {
    ...r,
    // Las dos listas que se registran como footprint son las celdas que PROBÉ mías y dejé de ocupar:
    // las que limpié con huella viva y las que ya venían del footprint. Los otros dos caminos
    // (`residuos`, `reescritos`) se prueban por parecido de texto, no por una forma que yo sellé, y
    // convertir esa evidencia más débil en un registro permanente sería ensancharla en silencio.
    guardar: (escrito) => guardarHuellas(fileId, pestana, escrito, {
      ...opts, suprimidas: r.suprimidas, abandonadas: [...r.limpiadas, ...r.desocupadas],
    }).catch((e) => console.warn(`  ⚠ no pude guardar la huella por celda: ${e.message}`)),
  }
}

/**
 * EL VOCABULARIO DE LA HUELLA, EN UN SOLO LUGAR.
 *
 *   🚫 no repongo lo que vaciaste · ✋ conservo lo tuyo · 🧹 limpio lo mío · ℹ no puedo decidir
 *
 * Vive acá y no en el portón porque ahora lo usan los dos: el portón y los generadores que escriben
 * fuera de él. Dos copias del mismo mensaje se desincronizan, y el mensaje ES la única forma que
 * tiene el dueño de enterarse de qué decidió el OS sobre una celda suya.
 */
export function explicarHuella(pestana, h, log = console.log) {
  for (const s of h.suprimidas.slice(0, 12)) log(`  🚫 vos vaciaste la celda ${letraCol(s.col)}${s.filaHoy ?? s.fila}: no vuelvo a escribir "${s.mio}"`)
  if (h.suprimidas.length > 12) log(`      … y ${h.suprimidas.length - 12} celdas más que vaciaste`)
  for (const a of h.ajenas.slice(0, 6)) log(`  ✋ ${letraCol(a.col)}${a.fila} nunca fue mía y tiene algo tuyo ("${a.suyo}"): no la piso`)
  for (const e of (h.editadas ?? []).slice(0, 6)) log(`  ✋ ${letraCol(e.col)}${e.fila} la escribí yo y hoy dice otra cosa ("${e.suyo}"): la editaste vos, la respeto`)
  // El residuo se limpia por DOS pruebas distintas (un texto mío, o una fórmula mía en la misma
  // columna) y el log tiene que decir por cuál: es la única forma que tiene el dueño de auditar con
  // qué evidencia el OS decidió vaciarle una celda.
  for (const r of (h.residuos ?? []).slice(0, 6)) log(`  🧹 ${letraCol(r.col)}${r.fila} es un residuo mío de un layout anterior — ${r.por ?? 'algo que sigo escribiendo'} ("${r.suyo}"): la limpio`)
  if ((h.residuos?.length ?? 0) > 6) log(`      … y ${h.residuos.length - 6} residuos más`)
  for (const r of (h.reescritos ?? []).slice(0, 6)) log(`  🧹 ${letraCol(r.col)}${r.fila} tenía mi rótulo "${r.suyo}" de un layout anterior en una fila mía: escribo lo que va ("${r.mio}")`)
  if ((h.reescritos?.length ?? 0) > 6) log(`      … y ${h.reescritos.length - 6} residuos de rediseño más`)
  for (const d of (h.desocupadas ?? []).slice(0, 6)) log(`  🧹 ${letraCol(d.col)}${d.fila} la ocupé en un layout anterior y hoy ya no ("${d.suyo}"): la limpio`)
  if ((h.desocupadas?.length ?? 0) > 6) log(`      … y ${h.desocupadas.length - 6} celdas más que ocupé y ya no ocupo`)
  for (const l of (h.limpiadas ?? []).slice(0, 6)) log(`  🧹 ${letraCol(l.col)}${l.fila} la escribí yo y ya no va ("${l.mio}"): la limpio`)
  if ((h.limpiadas?.length ?? 0) > 6) log(`      … y ${h.limpiadas.length - 6} celdas mías más que limpio`)
  // SIN MAPA DE POSICIÓN YA NO SE ESCRIBE A CIEGAS, y el mensaje tiene que decir qué se hizo en su
  // lugar. El `ℹ` a secas se leyó durante meses como "no pasa nada" cuando significaba lo contrario:
  // que en esa pestaña ningún borrado del dueño se estaba respetando.
  if (!h.alineacion.alineada) {
    log(`  ℹ sin mapa de posición en "${pestana}": ${h.alineacion.motivo}`)
    if (h.alineacion.porForma) log(`     decido por forma (lo que ya no está en ninguna parte): ${h.alineacion.porForma}`)
  }
}

/**
 * LA HUELLA PARA UN GENERADOR QUE NO PASA POR `escribirPreservando`.
 *
 * ═══ POR QUÉ EXISTE (13/08) ═══
 *
 * Seis generadores escriben fuera del portón, cada uno por una razón propia y documentada (rangos
 * sueltos, `updateCells` por `sheetId`, fusión propia). Para ellos la única defensa era la guarda
 * CIEGA de `no-borrar.mjs`, que conserva todo lo que tiene contenido sin poder saber de quién es. El
 * resultado medido: un borrado del dueño en esas pestañas volvía en la corrida siguiente, y un
 * artefacto del propio OS quedaba blindado para siempre. Las dos caras del mismo agujero.
 *
 * No se los obliga a entrar al portón —varios no pueden— sino a hacer las dos cosas que la huella
 * necesita: pasarle lo que quieren escribir contra una lectura FORMULA del mismo rectángulo, y
 * sellar después de escribir. Todo lo demás (leer el mapa, medir la alineación, decidir celda por
 * celda, explicar en voz alta) pasa acá adentro.
 *
 * DEVUELVE LA GRILLA SIN CENTINELA `VACIO`. Fuera del portón no hay `fusionar()` que lo traduzca, y
 * un centinela que llega crudo a la API se escribe LITERAL — así aparecieron 61 celdas "::VACIO::"
 * en CAJA. `MIA_PROBADA` sí sobrevive: lo traduce `no-borrar.mjs`, que es su único lector.
 *
 * ═══ SALVO CUANDO EL GENERADOR TIENE SU PROPIA FUSIÓN (15/08/2026) ═══
 *
 * "Proveedores y Materiales" escribe fuera del portón pero SÍ llama a `fusionar()` con su lectura
 * previa —tiene que hacerlo: escribe desde una frontera y fusiona contra el bloque que hay debajo—.
 * Ahí el centinela no sobra, es imprescindible: `fusionar` lo traduce a "" (limpiar) y sin él la
 * celda que el generador declara vacía se lee como "no es mía" y se conserva el residuo. Con
 * `centinelas: true` la grilla vuelve tal cual y la traducción la hace quien corresponde.
 *
 * @param {string} fileId
 * @param {string} pestana
 * @param {any[][]} generado  lo que el generador quiere escribir (con centinelas `VACIO`)
 * @param {any[][]} actual    el MISMO rectángulo leído con render FORMULA
 * @param {{fila0?:number, col0?:number, centinelas?:boolean}} opts
 */
export async function conHuellaFueraDelPorton(fileId, pestana, generado, actual, opts = {}) {
  const devolver = (grid) => (opts.centinelas ? grid : limpiarCentinela(grid))
  try {
    const h = await conHuellaDeCelda(fileId, pestana, generado, actual, opts)
    explicarHuella(pestana, h)
    return { ...h, grid: devolver(h.grid) }
  } catch (e) {
    // Ni la base ni la huella pueden tumbar una escritura: sin veredicto, se escribe como siempre.
    // Se dice fuerte porque el costo de esta corrida es real — un borrado del dueño puede volver.
    console.warn(`  ⚠ huella por celda inactiva en "${pestana}" (${e.message}) — un borrado tuyo podría volver`)
    return { grid: devolver(generado), suprimidas: [], ajenas: [], residuos: [], limpiadas: [], editadas: [], reescritos: [], desocupadas: [], alineacion: { alineada: false, motivo: e.message }, guardar: async () => {} }
  }
}
