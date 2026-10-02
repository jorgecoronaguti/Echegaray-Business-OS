// EL DISEÑO TAMBIÉN ES SUYO — la huella del FORMATO, por rango y no por pestaña.
//
// ═══ POR QUÉ (03/09) ═══
//
// El dueño precisó qué quiere decir "respetar mis ediciones": *"todo lo que escribo, borro, modifico,
// agrego, saco, edito de diseño, cambio de lugar, copio y pego"*. **Edito de diseño** es esta mitad.
//
// La firma de formato existía desde el 01/08 (`firma-formato.mjs`) y es POR PESTAÑA: si el dueño
// pintaba una celda, la pestaña entera quedaba protegida y el OS no le podía volver a aplicar NINGÚN
// formato. Es el mismo "todo o nada" que el candado, y por eso `formatoGuardia` nunca se enchufó al
// portón: enchufarlo habría congelado el mantenimiento visual de las catorce pestañas.
//
// Acá la unidad es el RANGO del request: el OS recuerda qué formato dejó en cada rango que formatea, y
// antes de re-aplicarlo compara. Si el rango cambió, ese request no entra; los demás sí. La pestaña
// sigue manteniéndose sola salvo exactamente en lo que él tocó. Desde el 01/10 el rango que no
// coincide se mira CELDA POR CELDA y un `repeatCell` se parte alrededor de las suyas: ver
// `huella-formato-celda.mjs` (la huella por coordenada congelaba la pestaña cuando el layout crecía).
//
// ═══ `userEnteredFormat`, NO `effectiveFormat` (heredado de firma-formato, 01/08) ═══
//
// `effectiveFormat` es lo que se VE e incluye el formato condicional y el que Google deduce de una
// fórmula: cambia cuando cambia un VALOR, sin que nadie haya tocado un formato. Hashear eso daría un
// falso positivo en cada recálculo, y un falso positivo acá congela el diseño.
//
// ═══ UNA LECTURA POR PESTAÑA, NO UNA POR REQUEST ═══
//
// Un solo paso del pipeline manda decenas de `repeatCell`. Leer el formato vivo por request costaría
// decenas de llamadas y rozaría la cuota. Se lee `A1:BZ{TECHO}` UNA vez por pestaña y por corrida, y
// la firma de cada rango se recorta de esa lectura. El techo de filas es el mismo de `firma-formato`
// y por el mismo motivo: costo, no criterio. Un formato aplicado por debajo de esa fila no lleva
// huella y por lo tanto no se protege — declarado, no escondido.
//
// ═══ LO QUE ESTA GUARDA NO PROTEGE (02/10/2026, auditoría — declarado, no corregido) ═══
//
// · Un formato del dueño IDÉNTICO al que el OS selló (o dejó pendiente) en esa misma celda es
//   indistinguible del del OS: mirando el formato no hay forma de saber quién lo puso.
// · Debajo de la fila TECHO_FILAS_FORMATO (2000) o a la derecha de BZ no se lee nada: ahí todo cuenta
//   como virgen y un formato del dueño se pisa.
// · Rotación, márgenes internos, link y SUBRAYADO no entran al hash (`normalizarFormatoCelda` no los
//   proyecta; agregarlos cambiaría todas las huellas sembradas): un cambio sólo de eso no se ve, y
//   un `repeatCell` con la máscara entera lo borra.
// · La decisión usa la lectura PREVIA al lote (y cacheada por proceso): lo que el dueño edite entre
//   esa lectura y el `batchUpdate` no se ve.
// · La primera pasada sobre una pestaña sin ninguna huella aplica todo y siembra, aunque ya tenga
//   formato puesto: es la regla del 04/09 y sigue vigente.
// · `guarda-por-celda.mjs` (`filtrarPorCelda`) FALLA ABIERTO: si este módulo lanza, el lote sigue
//   como venía, con un aviso. Esta guarda es fail-closed sólo mientras corre.

import { letraCol } from './preservar-anotaciones.mjs'
import { normalizarFormatoCelda } from './firma-formato.mjs'
import { TIPO_CELDA1P, MARCA_RESEMBRAR, hash, a1DeCelda, celdasAjenas, recortarRango, sellosPorCelda, huellasDeRangos } from './huella-formato-celda.mjs'
import { leerHuellasFormato, leerFormatoDePestana } from './huella-formato-base.mjs'
import { nuevoLote, respetar, anotarAplicado, depurarRespetadas, registrarPendientes, consumirMarcasDeResembrado, sellarAplicados } from './huella-formato-sello.mjs'

// La base y el caché viven en `huella-formato-base.mjs` desde el 02/10; se re-exportan para que ningún
// llamador cambie.
export {
  leerHuellasFormato, guardarHuellaFormato, guardarHuellasDeCeldas, borrarHuellasPorTipo,
  olvidarTablaFormatoVerificada, invalidarFormato, olvidarCacheFormato, leerFormatoDePestana,
} from './huella-formato-base.mjs'

export const TIPO = { CELDA: 'celda', MERGE: 'merge', ANCHO: 'ancho', ALTO: 'alto', PESTANA: 'pestana' }

/** A1 de un GridRange (fin exclusivo, como lo manda la API). Puro. */
export function a1DeGridRange(r) {
  if (!r) return null
  const f0 = (r.startRowIndex ?? 0) + 1
  const c0 = r.startColumnIndex ?? 0
  const f1 = Number.isInteger(r.endRowIndex) ? r.endRowIndex : null
  const c1 = Number.isInteger(r.endColumnIndex) ? r.endColumnIndex - 1 : null
  return `${letraCol(c0)}${f0}:${c1 === null ? '' : letraCol(c1)}${f1 ?? ''}`
}

/** Los únicos campos de `updateSheetProperties` que son TAMAÑO y no diseño. */
const CAMPOS_DE_TAMANO = new Set(['gridProperties.rowCount', 'gridProperties.columnCount'])

/**
 * ¿Este request sólo cambia cuántas filas o columnas tiene la hoja? PURA.
 *
 * Sin `fields` no se puede afirmar nada y se responde `false`: la guarda protege por defecto. Ojo
 * con el sentido de la respuesta — esto NO dice que el cambio sea seguro, dice que no es formato.
 * Que no se pueda ENCOGER la grilla es harina de otro costal y lo decide `clasificarRequest`
 * (un `rowCount` menor al vivo es un `deleteDimension` con otro nombre).
 */
export function soloCambiaElTamanoDeLaGrilla(req) {
  const campos = String(req?.updateSheetProperties?.fields ?? '').split(',').map((c) => c.trim()).filter(Boolean)
  if (!campos.length) return false
  return campos.every((c) => CAMPOS_DE_TAMANO.has(c))
}

/** ¿La máscara de un `updateCells` es EXACTAMENTE la validación y nada más? PURA. */
function esSoloValidacion(fields) {
  const campos = String(fields ?? '').split(',').map((c) => c.trim()).filter(Boolean)
  return campos.length > 0 && campos.every((c) => c === 'dataValidation')
}

/**
 * Qué formatea un request, si formatea algo. Puro.
 * @returns {{tipo:string, sheetId:number, rango:string, gr:object|null}|null}
 */
export function claveDeFormato(req) {
  if (!req || typeof req !== 'object') return null
  const deRango = (tipo, r) => (r && r.sheetId !== undefined ? { tipo, sheetId: r.sheetId, rango: a1DeGridRange(r), gr: r } : null)
  if (req.repeatCell) return deRango(TIPO.CELDA, req.repeatCell.range)
  if (req.updateBorders) return deRango(TIPO.CELDA, req.updateBorders.range)
  // Un updateCells que NO escribe valor es una pasada de formato como cualquier otra...
  // ...SALVO el que lleva la máscara `dataValidation` sola. Una regla de validación no es diseño: no
  // pinta, no mide ni ocupa: sólo dice qué se puede tipear. El propio clasificador ya declara inocuo a
  // `setDataValidation` («no reescriben lo que ya está cargado»), y `updateCells` con esa máscara hace
  // exactamente lo mismo — es la forma de la API que SÍ alcanza a las filas que un filtro esconde. Si
  // acá contara como formato, el desplegable de una columna nueva quedaría a merced de la huella de
  // diseño de la pestaña y podría no escribirse jamás en el tramo que el dueño formateó a mano.
  if (req.updateCells && !esSoloValidacion(req.updateCells.fields) && !/userEnteredValue/.test(String(req.updateCells.fields ?? '*'))) {
    return deRango(TIPO.CELDA, req.updateCells.range ?? null)
  }
  if (req.mergeCells) return deRango(TIPO.MERGE, req.mergeCells.range)
  if (req.unmergeCells) return deRango(TIPO.MERGE, req.unmergeCells.range)
  if (req.updateDimensionProperties) {
    const r = req.updateDimensionProperties.range
    if (!r || r.sheetId === undefined) return null
    const tipo = r.dimension === 'COLUMNS' ? TIPO.ANCHO : TIPO.ALTO
    return { tipo, sheetId: r.sheetId, rango: `${r.dimension}:${r.startIndex}-${r.endIndex}`, gr: r }
  }
  if (req.updateSheetProperties) {
    const p = req.updateSheetProperties.properties
    if (!p || p.sheetId === undefined) return null
    // AGRANDAR LA GRILLA NO ES FORMATEAR. `rowCount`/`columnCount` son la CAPACIDAD de la hoja:
    // agregan filas o columnas vacías al final y no tocan una sola celda. Tratarlas como diseño
    // frenaba el request que el propio generador de CAJA emite para que entre el último bloque de
    // gráficos (`requestDeAltoMinimo`), y el editor vivo terminaba dibujándolo encima del anterior
    // — el defecto que el dueño reportó tres veces. `frozenRowCount`, `hideGridlines`, el color de
    // la pestaña y cualquier otra propiedad SÍ son decisiones suyas y se siguen protegiendo: por
    // eso la excepción mira `fields`, y un request que ADEMÁS toca el diseño se protege entero.
    if (soloCambiaElTamanoDeLaGrilla(req)) return null
    return { tipo: TIPO.PESTANA, sheetId: p.sheetId, rango: '*', gr: null }
  }
  return null
}

/**
 * NÚCLEO PURO: la huella del formato vivo de un rango, recortada de la lectura de la pestaña.
 * Devuelve null cuando no hay con qué juzgar (lectura ausente).
 */
export function huellaDeRango(tipo, lectura, gr) {
  if (!lectura) return null
  if (tipo === TIPO.CELDA) {
    const f0 = gr?.startRowIndex ?? 0
    const c0 = gr?.startColumnIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : (lectura.filas?.length ?? 0)
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    const trozo = (lectura.filas ?? []).slice(f0, f1).map((f) => (f || []).slice(c0, c1 === Infinity ? undefined : c1)
      .map((c) => normalizarFormatoCelda(c?.formato)))
    return hash(trozo)
  }
  if (tipo === TIPO.ANCHO) return hash((lectura.anchos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined))
  if (tipo === TIPO.ALTO) return hash((lectura.altos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined))
  if (tipo === TIPO.MERGE) {
    const f0 = gr?.startRowIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : Infinity
    const c0 = gr?.startColumnIndex ?? 0
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    const dentro = (lectura.merges ?? []).filter((m) => m.fila < f1 && m.filaFin > f0 && m.col < c1 && m.colFin > c0)
    return hash(dentro.map((m) => [m.fila, m.filaFin, m.col, m.colFin]).sort())
  }
  // LA HUELLA DE PESTAÑA TIENE QUE ABARCAR LO QUE LA CLAVE DE PESTAÑA DECIDE. Hasta el 03/09
  // hasheaba SÓLO las filas y columnas congeladas, pero `claveDeFormato` manda a este tipo también
  // los `hideGridlines`, `tabColor` y `title`: la decisión sobre el color de una pestaña se tomaba
  // comparando cuántas filas estaban congeladas. Un control validado contra información que no es
  // la que protege siempre dice que sí. `?? null` y no `?? false`: una lectura vieja que no trae el
  // campo NO puede parecerse a una que lo trae en falso.
  if (tipo === TIPO.PESTANA) {
    return hash([
      lectura.congeladas?.filas ?? 0,
      lectura.congeladas?.columnas ?? 0,
      lectura.hideGridlines ?? null,
      lectura.tabColor ?? null,
      lectura.titulo ?? null,
    ])
  }
  return null
}

/** ¿El formato vivo de ese rango es el que trae una pestaña sin formatear? Entonces no es de nadie. */
export function esFormatoVirgen(tipo, lectura, gr) {
  if (tipo === TIPO.CELDA) {
    const f0 = gr?.startRowIndex ?? 0
    const f1 = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : (lectura?.filas?.length ?? 0)
    const c0 = gr?.startColumnIndex ?? 0
    const c1 = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : Infinity
    return (lectura?.filas ?? []).slice(f0, f1).every((f) => (f || []).slice(c0, c1 === Infinity ? undefined : c1).every((c) => !c?.formato))
  }
  if (tipo === TIPO.ANCHO) return (lectura?.anchos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined).every((a) => a == null)
  if (tipo === TIPO.ALTO) return (lectura?.altos ?? []).slice(gr?.startIndex ?? 0, gr?.endIndex ?? undefined).every((a) => a == null)
  if (tipo === TIPO.MERGE) return huellaDeRango(TIPO.MERGE, lectura, gr) === huellaDeRango(TIPO.MERGE, { merges: [] }, gr)
  if (tipo === TIPO.PESTANA) return (lectura?.congeladas?.filas ?? 0) === 0 && (lectura?.congeladas?.columnas ?? 0) === 0
  return false
}

// ═══ EL BLOQUE QUE SE CORRIÓ DE FILA (04/09/2026) ═══
//
// La huella se indexa por COORDENADA. Cuando un bloque cambia de alto —se agrega un renglón al
// titular, un cuadro pasa de 101 a 105 filas— el rango pasa de `B52:N57` a `B53:N58`: coordenada
// nueva, sin huella, y con el formato que el layout anterior dejó ahí. Cae en este último caso y
// queda bloqueado PARA SIEMPRE, aunque ese formato lo haya puesto el propio OS media hora antes.
//
// La consecuencia medida en «Impuestos y Financieros»: cualquier cambio de diseño desalineaba los
// formatos de forma permanente —25 defectos de pantalla con un solo renglón agregado— y la pestaña
// quedaba congelada en su layout. Un control que impide corregir un defecto lo vuelve eterno.
//
// El reconocimiento se ensancha SÓLO a lo que el OS probó haber puesto: si el formato vivo coincide
// con alguna huella que este mismo Sheet selló en esta misma pestaña, es formato propio mudado de
// lugar, no diseño del dueño. Nunca admite un formato que el OS no haya sellado antes.
//
// CON SELLOS POR CELDA EL ATAJO YA NO DECIDE (02/10/2026, auditoría). Compara el DIBUJO del rango,
// no la autoría de cada celda: el auditor selló fecha en B10:B18, pegó ese mismo formato a mano en
// D10:D18, y la capa del OS en D10:D18 entró por acá, pisó las nueve celdas y las selló como
// propias. Donde hay sellos por celda la evidencia es más fina y la decide ella. El atajo queda SÓLO
// para una pestaña sin ningún sello por celda —las de antes del 01/10—, porque ahí es la única
// evidencia que existe y quitarlo congelaría las que hoy se mantienen gracias a él («sin cambio de
// conducta hasta resembrar»). La primera corrida que siembra sellos por celda lo apaga para siempre.

/**
 * LA DECISIÓN, PURA. Es el corazón de (h) y por eso vive sola, sin base ni red al lado.
 *
 * `celdas` sólo viene para los requests de tipo CELDA: cuántas celdas del rango no se puede probar que
 * sean del OS (`ajenas`) y si el request se puede partir alrededor de ellas (`recortable`). Sin ese
 * dato la decisión es la de siempre, por rango.
 *
 * @param {{huellaViva:string|null, huellaGuardada:string|null, pestanaSinHuellas:boolean, virgen:boolean,
 *   huellasDeLaPestana?:Set<string>|null, celdas?:{ajenas:number, recortable:boolean}|null,
 *   conSellosPorCelda?:boolean}} x
 * @returns {{aplica:boolean, sellar:boolean, motivo:string, recortar?:boolean}}
 */
export function decidirFormato({ huellaViva, huellaGuardada, pestanaSinHuellas, virgen, huellasDeLaPestana = null, celdas = null, conSellosPorCelda = false }) {
  if (!huellaViva) return { aplica: false, sellar: false, motivo: 'no pude leer el formato vivo del rango (fail-closed)' }
  const rangoIgual = Boolean(huellaGuardada) && huellaGuardada === huellaViva
  // Con veredicto por celda, que el rango coincida no alcanza: puede coincidir con un sello VIEJO y el
  // dueño haber repuesto en una celda un formato que el OS ya había cambiado (re-auditoría 02/10, H1c).
  if (rangoIgual && !celdas?.ajenas) return { aplica: true, sellar: true, motivo: 'el formato es el que dejé' }
  // ═══ POR CELDA (01/10/2026) ═══ La huella del rango no coincide —o el rango es nuevo porque el
  // layout cambió de alto—, pero cada celda está virgen o tiene el formato que el OS selló en ELLA: no
  // hay nada del dueño adentro. Ver `huella-formato-celda.mjs`.
  if (celdas && celdas.ajenas === 0) return { aplica: true, sellar: true, motivo: 'cada celda está virgen o tiene el formato que yo sellé en ella' }
  // Algunas celdas son suyas y el request se puede partir: se aplica alrededor de ellas, no se pierde
  // el rango entero por una celda. Las suyas quedan como están y se informan.
  const recortar = Boolean(celdas?.recortable)
  if (rangoIgual) {
    return recortar
      ? { aplica: true, sellar: true, recortar, motivo: 'el rango coincide con un sello viejo pero esas celdas no tienen el que sellé en ellas: las respeto y aplico alrededor' }
      : { aplica: false, sellar: false, motivo: 'el rango coincide con un sello viejo pero hay celdas que no tienen el formato que sellé en ellas: lo respeto' }
  }
  if (huellaGuardada) {
    return recortar
      ? { aplica: true, sellar: true, recortar, motivo: 'lo cambiaste vos en algunas celdas: las respeto y aplico alrededor' }
      : { aplica: false, sellar: false, motivo: 'el formato de ese rango difiere del que dejé: lo cambiaste vos' }
  }
  // SIN HUELLA PREVIA. La primera corrida después del deploy no puede quedarse sin poder formatear
  // nada: si la pestaña todavía no tiene NINGUNA huella de formato, se aplica y se siembra. A partir
  // de ahí, un rango sin huella con formato ya puesto es del dueño (o de un layout que el OS abandonó,
  // y en la duda manda él).
  if (pestanaSinHuellas) return { aplica: true, sellar: true, motivo: 'primera pasada de formato sobre esta pestaña: aplico y siembro la huella' }
  if (virgen) return { aplica: true, sellar: true, motivo: 'ese rango no tiene formato puesto: no hay diseño tuyo que respetar' }
  // El bloque que se corrió de fila: ver el comentario sobre `decidirFormato`.
  const atajoPermitido = !(celdas && conSellosPorCelda)
  if (atajoPermitido && huellasDeLaPestana?.size && huellasDeLaPestana.has(huellaViva)) {
    return { aplica: true, sellar: true, motivo: 'ese formato lo puse yo en otro rango de esta pestaña: el bloque se corrió de fila' }
  }
  if (recortar) return { aplica: true, sellar: true, recortar, motivo: 'esas celdas ya tienen un formato que yo no puse: las respeto y aplico alrededor' }
  return { aplica: false, sellar: false, motivo: 'ese rango ya tiene un formato que yo no puse: lo respeto' }
}

/**
 * LA GUARDA DE DISEÑO para un lote de `spreadsheetBatchUpdate`. Impura (lee el Sheet y la base).
 *
 * Devuelve los requests que se pueden aplicar y un `sellar()` para DESPUÉS de aplicarlos: la huella
 * nueva sale de RELEER el formato que quedó, nunca del request que se mandó. Hashear lo que se mandó
 * sería validar el control contra la misma información que lo produce.
 *
 * FAIL-CLOSED: sin base, o sin poder leer el formato vivo, no se aplica ningún formato. Un Sheet con
 * el formato de ayer se arregla en la corrida siguiente; el diseño que el dueño hizo, no.
 */
// ═══ «PRIMERA PASADA» ES DE LA CORRIDA, NO DE LA LLAMADA (04/09/2026) ═══
//
// `decidirFormato` tiene un camino explícito: si la pestaña no tiene NINGUNA huella de formato,
// aplica y siembra. Pero `filtrarFormato` se llama VARIAS VECES por corrida —una por tanda de
// requests— y relee la base en cada una. La primera tanda encuentra la pestaña vacía, aplica y
// SELLA; a partir de ahí las tandas siguientes ya la ven con huellas, dejan de ser primera pasada y
// caen en «ya tiene un formato que yo no puse». **El generador se envenena a sí mismo dentro de su
// propia corrida.**
//
// MEDIDO en «Impuestos y Financieros»: con la pestaña en 0 huellas, una corrida aplicó formato a 2
// rangos y bloqueó los otros 419 — el cuadro de IVA quedó con los números crudos, sin `$` ni
// separador de miles, mientras el resto de la pestaña sí tenía formato.
//
// La respuesta se recuerda por proceso: si al empezar estaba virgen, lo sigue estando para toda la
// corrida. Se limpia con `olvidarVirgenes()`, que usan los tests.
const virgenAlEmpezar = new Map()

/** Olvida qué pestañas estaban vírgenes. Para los tests: sin esto, una corrida contamina la siguiente. */
export function olvidarVirgenes() { virgenAlEmpezar.clear() }

/**
 * Primera pasada, por familia. La pestaña es virgen si no tiene ninguna huella (sin contar la marca de
 * resembrado); las CELDAS lo son también si `formato-resembrar` dejó su marca: una persona borró a
 * sabiendas sólo las huellas de celdas y conservó las de anchos, merges o pestaña. PURA.
 */
export function primeraPasada(mapa) {
  const marca = mapa.has(MARCA_RESEMBRAR)
  const virgen = mapa.size - (marca ? 1 : 0) === 0
  return { pestana: virgen, celdas: virgen || marca }
}

/** Qué hay que leer de cada pestaña: los altos y los merges cuestan una llamada más y no siempre hacen falta. */
function necesidadesPorTab(conFormato, id2tab) {
  const porTab = new Map()
  for (const { c } of conFormato) {
    const tab = id2tab.get(c.sheetId)
    if (!porTab.has(tab)) porTab.set(tab, { conAltos: false, conMerges: false })
    if (c.tipo === TIPO.ALTO) porTab.get(tab).conAltos = true
    if (c.tipo === TIPO.MERGE) porTab.get(tab).conMerges = true
  }
  return porTab
}

/**
 * La decisión de UN request, con el veredicto por celda cuando el rango no basta. Impura sólo por el
 * memo de huellas vivas, que es de la llamada.
 */
function decidirRequest(req, c, ctx) {
  const vivo = ctx.vivo
  const huellaViva = huellaDeRango(c.tipo, vivo, c.gr)
  const huellaGuardada = ctx.mapa.get(`${c.tipo}|${c.rango}`) ?? null
  // El veredicto por celda se paga cuando la huella del rango no alcanza, y SIEMPRE en una pestaña con
  // sellos por celda: ahí un rango igual al sellado puede ser un sello viejo (re-auditoría 02/10, H1c).
  // Una celda sin sello propio ni pendiente, dentro de un rango que coincide, la prueba ese rango: es
  // la evidencia de antes del 01/10 y quitarla congelaría lo que hoy se mantiene.
  const rangoIgual = Boolean(huellaViva) && huellaViva === huellaGuardada
  const porCelda = c.tipo === TIPO.CELDA && vivo && huellaViva && (!rangoIgual || ctx.conSellosPorCelda)
  const ajenas = porCelda ? celdasAjenas(vivo, c.gr, ctx.sellos, ctx.memo, ctx.pendientes, { sinSelloEsMia: rangoIgual }) : []
  // Sólo `repeatCell` se parte: aplica lo mismo a cada celda. Un `updateBorders` o un `updateCells`
  // partido no hace lo mismo que entero, así que si toca una celda del dueño se retiene completo.
  const partes = porCelda && ajenas.length && req.repeatCell ? recortarRango(c.gr, ajenas) : []
  const d = decidirFormato({
    huellaViva,
    huellaGuardada,
    pestanaSinHuellas: c.tipo === TIPO.CELDA ? ctx.celdasSinHuellas : ctx.pestanaSinHuellas,
    virgen: esFormatoVirgen(c.tipo, vivo, c.gr),
    huellasDeLaPestana: ctx.huellasDeLaPestana,
    celdas: porCelda ? { ajenas: ajenas.length, recortable: partes.length > 0 } : null,
    conSellosPorCelda: ctx.conSellosPorCelda,
  })
  return { d, ajenas, partes }
}

/** Lo que hace falta para decidir sobre cada pestaña: formato vivo, huellas y sellos. Una lectura de cada uno. */
async function contextoPorTab(cliente, fileId, porTab) {
  const ctxPorTab = new Map()
  for (const [tab, necesita] of porTab) {
    const vivo = await leerFormatoDePestana(cliente, fileId, tab, necesita).catch(() => null)
    const mapa = await leerHuellasFormato({}, fileId, tab).catch(() => null)
    const k = `${fileId}|${tab}`
    if (mapa && !virgenAlEmpezar.has(k)) virgenAlEmpezar.set(k, primeraPasada(mapa))
    const sellos = sellosPorCelda(mapa)
    const pendientes = sellosPorCelda(mapa, TIPO_CELDA1P)
    ctxPorTab.set(tab, {
      vivo, mapa, sellos, pendientes, memo: new Map(), huellasDeLaPestana: huellasDeRangos(mapa),
      conSellosPorCelda: sellos.size > 0 || pendientes.size > 0,
      pestanaSinHuellas: virgenAlEmpezar.get(k)?.pestana ?? false,
      celdasSinHuellas: virgenAlEmpezar.get(k)?.celdas ?? false,
      marcaResembrar: mapa?.has(MARCA_RESEMBRAR) ?? false,
    })
  }
  return ctxPorTab
}

/** Decide un request y lo anota en el lote: retenido, recortado o entero. */
function decidirYAnotar(lote, req, c, i, tab, ctx) {
  if (ctx.mapa === null) {
    lote.salida[i] = []
    respetar(lote, tab, c.rango, 'sin base no puedo saber qué formato dejé: no lo re-aplico (fail-closed)')
    return
  }
  const { d, ajenas, partes } = decidirRequest(req, c, ctx)
  if (!d.aplica) {
    lote.salida[i] = []
    respetar(lote, tab, c.rango, `diseño: ${d.motivo}`)
    console.log(`  🎨 "${tab}"!${c.rango}: no re-aplico el formato — ${d.motivo}.`)
    return
  }
  const deCeldas = c.tipo === TIPO.CELDA
  if (d.recortar) {
    lote.salida[i] = partes.map((gr) => ({ repeatCell: { ...req.repeatCell, range: gr } }))
    const suyas = ajenas.map((x) => ({ ...x, a1: a1DeCelda(x.fila, x.col) }))
    for (const x of suyas) respetar(lote, tab, x.a1, `diseño: ${d.motivo}`, x)
    console.log(`  🎨 "${tab}"!${c.rango}: aplico alrededor de ${suyas.length} celda(s) tuya(s) — ${suyas.slice(0, 8).map((x) => x.a1).join(', ')}${suyas.length > 8 ? '…' : ''}.`)
    anotarAplicado(lote, tab, lote.salida[i].map((r) => ({ req: r, gr: r.repeatCell.range, i, rango: c.rango })))
    // La huella del RANGO no se sella: incluiría las celdas del dueño, y la corrida siguiente la
    // encontraría igual y aplicaría el request ENTERO por encima de ellas.
    lote.aSellar.push({ tab, tipo: c.tipo, rango: c.rango, gr: c.gr, partes, sellarRango: false, deCeldas })
    return
  }
  if (deCeldas) anotarAplicado(lote, tab, [{ req, gr: c.gr, i, rango: c.rango }])
  lote.aSellar.push({ tab, tipo: c.tipo, rango: c.rango, gr: c.gr, partes: deCeldas ? [c.gr] : [], sellarRango: true, deCeldas })
}

export async function filtrarFormato(cliente, fileId, requests = [], id2tab = new Map(), { esProtegible = (t) => Boolean(t) && !String(t).startsWith('_') } = {}) {
  const claves = requests.map((r) => claveDeFormato(r))
  const conFormato = claves.map((c, i) => ({ c, i })).filter((x) => x.c && esProtegible(id2tab.get(x.c.sheetId)))
  if (!conFormato.length) return { requests, respetadas: [], sellar: async () => ({ fallas: [] }) }
  const porTab = necesidadesPorTab(conFormato, id2tab)
  const ctxPorTab = await contextoPorTab(cliente, fileId, porTab)
  const lote = nuevoLote(requests)
  for (const { c, i } of conFormato) decidirYAnotar(lote, requests[i], c, i, id2tab.get(c.sheetId), ctxPorTab.get(id2tab.get(c.sheetId)))
  await registrarPendientes(fileId, ctxPorTab, lote)
  await consumirMarcasDeResembrado(fileId, ctxPorTab, lote)
  depurarRespetadas(lote)
  return {
    requests: lote.salida.flat(),
    respetadas: lote.respetadas,
    sellar: () => sellarAplicados(cliente, fileId, lote.aSellar, porTab, ctxPorTab, huellaDeRango),
  }
}
