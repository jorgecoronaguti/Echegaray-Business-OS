// QUÉ SE APRENDE DE UN DEFECTO — y sobre todo qué NO.
//
// ═══ EL EJEMPLO QUE DEFINE TODO ESTE ARCHIVO ═══
//
// «Librería aparece rotulada 0,15 % pero se aplica 1 % en 55 casos.» Lo que NO se aprende de eso es
// «librería = 1 %». Aprender el número convertiría un defecto repetido en la regla de la casa, y la
// próxima cotización lo aplicaría con confianza porque «lo dice la base».
//
// Lo que SÍ se aprende es la forma del defecto: «existe inconsistencia histórica frecuente entre el
// rótulo y la fórmula de librería». Eso no es un número que se usa: es un CONTROL que se corre. Por
// eso todo candidato de este archivo sale con `valor: null` y con el id del control que lo detecta.
//
// ═══ SIETE ETIQUETAS QUE SON CINCO CLASES Y DOS ESTADOS ═══
//
// El pedido nombra ERROR_HISTORICO · PRACTICA_HISTORICA · DECISION_COMERCIAL ·
// CONOCIMIENTO_TECNICO · EXPERIENCIA_ECSAS · CANDIDATO_APRENDIZAJE · VALIDADO en una sola lista.
// No son una sola lista, y aplastarlas fue el problema que `biblioteca.mjs` ya había resuelto
// separando tres ejes: las cinco primeras contestan QUÉ TIPO DE SABER ES y las dos últimas
// contestan EN QUÉ PUNTO DEL CICLO ESTÁ. Un mismo aprendizaje es ERROR_HISTORICO (clase) y
// CANDIDATO (estado) a la vez, y eso es exactamente lo que hay que poder decir.
//
// Se deja dicho acá en vez de inventar un eje nuevo: `ESTADO` ya existe y ya lo gobierna `validar()`,
// que exige firmante y que el firmante no sea quien lo extrajo.
//
// ═══ UNA VEZ NO ES UN PATRÓN ═══
//
// La escala del repo —A observación aislada · B recurrencia · C patrón probable · D conocimiento
// interno validado · E regla operativa— la calcula `promocion.mjs` y se reusa entera. Un hallazgo
// suelto sale marcado A y no genera candidato: ya está en el dataset, que es su lugar.
import { ESTADO, PROCEDENCIA, conocimiento } from './biblioteca.mjs'
import { madurezDe } from './promocion.mjs'
import { controlDe } from './controles-cotizacion.mjs'
import { TIPO, cotizacionDeLaClave } from './hallazgo.mjs'

/** QUÉ TIPO DE SABER ES. No dice en qué punto del ciclo está: eso es `ESTADO`. */
export const CLASE = Object.freeze({
  ERROR_HISTORICO: 'ERROR_HISTORICO',           // se hizo y estuvo mal
  PRACTICA_HISTORICA: 'PRACTICA_HISTORICA',     // se venía haciendo así; no dice si está bien
  DECISION_COMERCIAL: 'DECISION_COMERCIAL',     // alguien decidió cobrar/ceder algo
  CONOCIMIENTO_TECNICO: 'CONOCIMIENTO_TECNICO', // cómo se construye o se mide
  EXPERIENCIA_ECSAS: 'EXPERIENCIA_ECSAS',       // lo medimos ejecutando
})

/**
 * LAS DOS ETIQUETAS DEL PEDIDO QUE NO SON CLASES.
 *
 * Están mapeadas al eje que ya existe para que nadie tenga que elegir entre «es un error histórico»
 * y «es un candidato»: es las dos cosas, en ejes distintos.
 */
export const ESTADO_DE_APRENDIZAJE = Object.freeze({
  CANDIDATO_APRENDIZAJE: ESTADO.CANDIDATO,
  VALIDADO: ESTADO.VALIDADO,
})

/** Qué clase de saber produce cada tipo de hallazgo. Todos son ERROR_HISTORICO: un hallazgo dice
 *  que algo salió mal. La costumbre —sin juicio— la produce `practica-historica.mjs`. */
export const CLASE_POR_TIPO = Object.freeze(
  Object.fromEntries(Object.values(TIPO).map((t) => [t, CLASE.ERROR_HISTORICO])),
)

/** Cuántos casos hacen falta para que un defecto sea un patrón y no una anécdota. */
export const MINIMO_PARA_PATRON = 2

/** El área con la que estos candidatos se consultan en la biblioteca. */
export const AREA_APRENDIZAJE = 'aprendizaje-de-cotizacion'

/**
 * POR QUÉ DE UN HALLAZGO NUNCA SE APRENDE SU VALOR. PURA.
 *
 * Está como función y no como comentario porque `aCandidato()` la llama y su resultado viaja dentro
 * del conocimiento: quien lea la biblioteca dentro de un año se encuentra el motivo al lado del
 * `valor: null`, y no tiene que deducir si el null es una decisión o un olvido.
 */
export const porQueNoSeAprendeElValor = (tipo) =>
  `${tipo} describe un DEFECTO. Aprender el número que aparece en el defecto (por ejemplo «librería = 1 %» porque se aplicó 1 % en 55 casos) convertiría un error repetido en la norma de la casa y lo aplicaría con confianza en la próxima cotización. Lo que se aprende es la FORMA del defecto, y eso se usa como control, no como valor.`

/** De dónde sale el «concepto» que agrupa un patrón, por tipo de hallazgo. Sin esto, los 227
 *  hallazgos de rótulo contra coeficiente serían UN patrón en vez de uno por concepto, y el
 *  aprendizaje diría «los rótulos no coinciden» en vez de decir cuál. */
const CONCEPTO = Object.freeze({
  [TIPO.ROTULO_CONTRADICE_COEFICIENTE]: (h) => h.evidencia?.[0]?.cita ?? null,
  [TIPO.COEFICIENTE_INESTABLE]: (h) => String(h.clave ?? '').replace(/^gg\./, '') || null,
  [TIPO.UNIDAD_CONTRADICTORIA]: (h) => String(h.clave ?? '').split('.')[1] ?? null,
})

const conceptoDe = (h) => CONCEPTO[h.tipo]?.(h) ?? null

/**
 * LOS PATRONES QUE HAY ADENTRO DE UNA LISTA DE HALLAZGOS. PURA.
 *
 * Agrupa por tipo y por concepto, cuenta en cuántas cotizaciones distintas aparece y calcula la
 * madurez con la misma escala que el resto del repo. Un grupo de un solo caso no sale: una
 * observación aislada no se convierte sola en patrón, y ya está guardada en el dataset.
 */
export function patrones(hallazgos = [], { minimo = MINIMO_PARA_PATRON } = {}) {
  const por = new Map()
  for (const h of hallazgos) {
    const concepto = conceptoDe(h)
    const k = `${h.tipo}|${concepto ?? ''}`
    if (!por.has(k)) por.set(k, { tipo: h.tipo, concepto, casos: [] })
    por.get(k).casos.push(h)
  }
  const salida = []
  for (const g of por.values()) {
    const cotizaciones = [...new Set(g.casos.map((h) => cotizacionDeLaClave(h.clave)).filter(Boolean))]
    if (g.casos.length < minimo) continue
    salida.push({
      clase: CLASE_POR_TIPO[g.tipo] ?? CLASE.ERROR_HISTORICO,
      tipo: g.tipo,
      concepto: g.concepto,
      casos: g.casos.length,
      cotizaciones: cotizaciones.length,
      madurez: madurezDe({ n: g.casos.length, obrasDistintas: cotizaciones.length || 1, dispersion: null }),
      controlSugerido: controlDe(g.tipo),
      // El valor NO se aprende. El campo existe para que el null sea explícito y esté explicado.
      valorAprendido: null,
      porQueNoSeAprendeElValor: porQueNoSeAprendeElValor(g.tipo),
      evidencia: g.casos.slice(0, 8).flatMap((h) => h.evidencia ?? []).slice(0, 8),
    })
  }
  return salida.sort((a, b) => b.casos - a.casos || String(a.concepto).localeCompare(String(b.concepto)))
}

/** La clave con la que un patrón vive en la biblioteca. El concepto va normalizado para que el
 *  mismo rótulo con otra capitalización no abra una segunda entrada. PURA. */
export const claveDelPatron = (p) => [
  'cotizacion.inconsistencia',
  String(p.tipo).toLowerCase(),
  String(p.concepto ?? 'general').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60),
].join('.')

/**
 * EL CANDIDATO DE APRENDIZAJE. PURA.
 *
 * `INFERIDO` y no `EXPERIENCIA_ECSAS`: es una deducción sobre N observaciones, no algo que se midió.
 * `CANDIDATO` y no validado: lo firma alguien que no lo extrajo, y este archivo no firma nada.
 *
 * La afirmación describe la INCONSISTENCIA, nunca el número. «Existe inconsistencia histórica
 * frecuente entre el rótulo y la fórmula de librería» se puede convertir en control; «librería =
 * 1 %» se puede convertir en la próxima cotización mal hecha.
 */
export function aCandidato(patron, { fecha = null } = {}) {
  const donde = patron.concepto ? ` de «${patron.concepto}»` : ''
  return conocimiento({
    clave: claveDelPatron(patron),
    afirmacion: `existe inconsistencia histórica${patron.casos >= 10 ? ' frecuente' : ''} del tipo ${patron.tipo}${donde}: aparece en ${patron.casos} caso(s) sobre ${patron.cotizaciones || 'varias'} cotización(es). Lo que se aprende es que hay que CONTROLARLO, no cuánto vale`,
    procedencia: PROCEDENCIA.INFERIDO,
    estado: ESTADO.CANDIDATO,
    valor: null,
    unidad: null,
    condicion: patron.porQueNoSeAprendeElValor,
    confianza: patron.madurez === 'A' ? 'BAJA' : patron.madurez === 'B' ? 'BAJA' : 'MEDIA',
    area: AREA_APRENDIZAJE,
    fecha,
    evidencia: {
      clase: patron.clase,
      tipoDeHallazgo: patron.tipo,
      casos: patron.casos,
      cotizaciones: patron.cotizaciones,
      madurez: patron.madurez,
      controlQueLoDetecta: patron.controlSugerido,
      citas: patron.evidencia,
    },
  })
}

/** Los candidatos de aprendizaje de una tanda de hallazgos. PURA. */
export const aprendizajes = (hallazgos = [], opciones = {}) =>
  patrones(hallazgos, opciones).map((p) => aCandidato(p, opciones))

/**
 * EL RECUENTO DEL CICLO. PURA.
 *
 * `pendientes` no es una resta cosmética: es la respuesta a «¿cuánto de esto se puede usar?», y la
 * respuesta honesta mientras nadie firme es «nada». Un tablero que muestre 40 candidatos sin decir
 * que los 40 están pendientes invita a usarlos.
 */
export function resumenDeAprendizaje(conocimientos = []) {
  const de = (e) => conocimientos.filter((k) => k.estado === e).length
  return {
    generados: conocimientos.length,
    validados: de(ESTADO.VALIDADO),
    rechazados: de(ESTADO.RECHAZADO),
    pendientes: de(ESTADO.CANDIDATO),
  }
}
