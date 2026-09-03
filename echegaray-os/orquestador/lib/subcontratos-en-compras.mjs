// EL SUBCONTRATO YA ENTRA — disfrazado de compra. Acá se lo reconoce, y no se lo cuenta dos veces.
//
// ═══ POR QUÉ EXISTE (03/09/2026) ═══
//
// Las tablas de subcontratos (`subcontrato`, `subcontrato_alcance`, `subcontrato_aporte`,
// `persona_externa`, `subcontrato_documento`) están vacías y la pantalla 10 que las escribe existe,
// está desplegada y funciona: la sonda recorrió el circuito entero —alta, alcance, precio por RPC,
// aportes, papeles, gente— y todo dio verde. No falta captura. Falta que alguien la use, y falta
// sobre todo lo que esa pantalla NO puede adivinar: que la plata del subcontratista **ya viene
// entrando por Compras** desde enero, mezclada con los materiales.
//
// Medido sobre `compra_sheet` el 03/09/2026: $ 35,3 M de trabajo de terceros repartidos en 24
// comprobantes, y las dos cuentas más grandes —PEDRO TELLO y Gerson Castro, $ 28,5 M entre las
// dos— sin CUIT y sin número de comprobante en ninguna de sus 19 filas.
//
// ═══ LA CLASIFICACIÓN NO LA DECIDE UN NOMBRE, LA DECIDE LA EVIDENCIA ═══
//
// Una lista de «proveedores subcontratistas» sería estructura de datos fabricada: el mismo Corralón
// Progreso vende cal y aparece rotulado «Subcontratos y mano de obra» en el Sheet, y el mismo Ángel
// Fernández monta correas una semana y alquila una grúa la otra. Lo que decide es el COMPROBANTE,
// una fila por vez, contra señales que se pueden citar. Cuando las señales no alcanzan, la clase es
// `indeterminado` y va al dueño — no se completa con lo que parezca razonable.
//
// ═══ LA CONTRASEÑAL LE GANA A LA MARCA ═══
//
// «Cal Magical x 25 kg, tanza de albañil y rafia» está rotulado a mano en el Sheet como
// «Subcontratos y mano de obra». Si la marca del Sheet ganara siempre, ese comprobante entraría de
// subcontrato y el costo del paquete arrancaría con $ 47.462 de cal adentro. Por eso el orden es:
// primero se pregunta si el texto describe MATERIAL, y recién si no, se miran las marcas.
//
// ═══ EL DOBLE CONTEO ═══
//
// La plata del subcontratista ya está en `costos_obra` (que es 100 % espejo de Compras: 939/939
// filas con `origen = 'compras_sheet'`). Si además se carga `subcontrato.precio_contratado` y
// alguien suma las dos cosas, la obra se infla por el monto entero del paquete. Hoy no pasa —
// `obra_costo_real` lee `costos_obra` y nada más—, y `costoDeObraSinDobleConteo` es la regla escrita
// para que siga sin pasar cuando el paquete y sus comprobantes queden vinculados: lo contratado
// aporta SÓLO su remanente sin facturar.

/** Verbos y sustantivos de EJECUCIÓN: describen un trabajo hecho, no una cosa entregada. */
// «cloaca», «agua potable» y «desagüe» NO entran solos: son sustantivos de rubro y aparecen igual
// en «art de agua potable» y «curva para desague», que son caños y artefactos. Entran acompañados
// del verbo —«conexión de cloaca», «pozo para aguas blancas»— o por la marca de administración.
const EJECUCION = /hormigonado|montaje|colocaci[oó]n|mano de obra|replanteo|excavaci[oó]n|perforaci[oó]n|demolici[oó]n|nivelaci[oó]n|compactaci[oó]n|pintura de|servicio de limpieza|limpieza de lote|clasificaci[oó]n de escombros|pozo para|conexi[oó]n de|instalaci[oó]n de|terciarizad/i

/** El texto habla de COSAS entregadas: «materiales para…», bultos, kilos, metros cúbicos de x. */
const MATERIAL = /^materiales\b|\bmateriales para\b|\bx\s?\d+\s?(kg|kgs|lts?|l)\b|\b\d+\s?(kg|tn|m3|lts?)\b|^art(?:[íi]culos?)?\.?\s+de\b|artefactos?|corral[oó]n|ferreter[ií]a/i

/** Alquilar un equipo no es subcontratar un alcance: no hay paquete, hay una máquina por hora. */
const ALQUILER = /alquiler|arriendo/i

/** La marca que administración ya escribe a mano en la columna de sub-obra del Sheet. */
const MARCA_ADMIN = /sub\s?contrat/i

/** La familia del Sheet que ya nombra el concepto. Señal, no veredicto. */
const FAMILIA_SUBCONTRATO = 'Subcontratos y mano de obra'

/**
 * Clasifica UN comprobante de Compras. Devuelve la clase, la confianza y las señales que la
 * sostienen —el motivo se puede leer al lado del número, que es la única forma de discutirlo.
 *
 * @param {{concepto?:string|null, familia_material?:string|null, detalle_obra?:string|null,
 *          cuit?:string|null, comprobante?:string|null, proveedor?:string|null}} fila
 * @returns {{clase:'subcontrato'|'material'|'alquiler'|'indeterminado', confianza:'alta'|'media'|'ninguna',
 *           senales:string[], sinRespaldo:boolean}}
 */
export function clasificarComprobante(fila) {
  const concepto = String(fila?.concepto ?? '')
  const detalle = String(fila?.detalle_obra ?? '')
  const familia = String(fila?.familia_material ?? '')
  const senales = []
  const sinRespaldo = !fila?.cuit && !fila?.comprobante

  // 1 · las contraseñales primero: describen la cosa, no el trabajo.
  if (MATERIAL.test(concepto)) {
    senales.push('el concepto describe materiales entregados')
    return { clase: 'material', confianza: 'alta', senales, sinRespaldo }
  }
  if (ALQUILER.test(concepto)) {
    senales.push('es alquiler de equipo, no un alcance contratado')
    return { clase: 'alquiler', confianza: 'alta', senales, sinRespaldo }
  }

  // 2 · las marcas que ya escribió una persona valen más que cualquier heurística sobre el texto.
  if (MARCA_ADMIN.test(detalle)) senales.push('administración lo marcó «Sub contratista» en el Sheet')
  if (familia === FAMILIA_SUBCONTRATO) senales.push(`familia del Sheet «${FAMILIA_SUBCONTRATO}»`)
  if (senales.length > 0) return { clase: 'subcontrato', confianza: 'alta', senales, sinRespaldo }

  // 3 · el texto describe un trabajo ejecutado por un tercero.
  if (EJECUCION.test(concepto)) {
    senales.push('el concepto describe un trabajo ejecutado, no una cosa entregada')
    return { clase: 'subcontrato', confianza: 'media', senales, sinRespaldo }
  }

  return { clase: 'indeterminado', confianza: 'ninguna', senales, sinRespaldo }
}

/**
 * Agrupa los comprobantes ya clasificados por proveedor. `sinRespaldo` del grupo es la cuenta de
 * filas sin CUIT ni comprobante: es el número que decide si hay exposición fiscal y solidaria,
 * porque un paquete de $ 16 M sin una sola factura no es un problema de clasificación.
 */
export function agruparPorProveedor(filasClasificadas) {
  const m = new Map()
  for (const f of filasClasificadas) {
    if (f.clase !== 'subcontrato') continue
    const k = f.proveedor ?? '(sin proveedor)'
    const g = m.get(k) ?? { proveedor: k, n: 0, monto: 0, sinRespaldo: 0, obras: new Set(), confianzaMinima: 'alta' }
    g.n += 1
    g.monto += Number(f.total ?? 0)
    if (f.sinRespaldo) g.sinRespaldo += 1
    if (f.obra_texto) g.obras.add(f.obra_texto)
    if (f.confianza === 'media') g.confianzaMinima = 'media'
    m.set(k, g)
  }
  return [...m.values()]
    .map((g) => ({ ...g, obras: [...g.obras].sort() }))
    .sort((a, b) => b.monto - a.monto)
}

/**
 * LA ECONOMÍA DE UN PAQUETE, sin sumar dos veces la misma plata.
 *
 * `precioContratado` es un COMPROMISO (lo que se acordó). Los comprobantes son la plata que YA
 * entró por Compras y que ya está en `costos_obra`. El costo comprometido de la obra por este
 * paquete es el mayor de los dos, nunca la suma: facturar no agrega costo, consume compromiso.
 */
export function economiaDelPaquete({ precioContratado = null, comprobantes = [] } = {}) {
  const ejecutado = comprobantes.reduce((s, c) => s + Number(c?.total ?? 0), 0)
  const comprometido = precioContratado == null ? null : Number(precioContratado)
  const pendiente = comprometido == null ? null : Math.max(0, comprometido - ejecutado)
  const excedido = comprometido == null ? null : Math.max(0, ejecutado - comprometido)
  return {
    comprometido,
    ejecutado,
    pendiente,
    excedido,
    // NUNCA `comprometido + ejecutado`. Es la línea que vuelve a inflar la obra.
    costoParaLaObra: comprometido == null ? ejecutado : ejecutado + pendiente,
  }
}

/**
 * El costo de la obra contando cada peso UNA vez: todo lo que entró por Compras, más el remanente
 * sin facturar de los paquetes contratados. Un paquete cuyos comprobantes ya entraron enteros no
 * suma nada — que es exactamente lo que hay que probar antes de cargar el primer precio.
 *
 * @param {{comprobantes:Array<{clave:string,total:number}>,
 *          paquetes:Array<{id:string,precioContratado:number|null,comprobantes:string[]}>}} entrada
 */
export function costoDeObraSinDobleConteo({ comprobantes = [], paquetes = [] } = {}) {
  const porClave = new Map(comprobantes.map((c) => [c.clave, Number(c.total ?? 0)]))
  const enCompras = [...porClave.values()].reduce((s, v) => s + v, 0)
  let contratadoSinFacturar = 0
  const detalle = []
  for (const p of paquetes) {
    const suyos = (p.comprobantes ?? []).map((k) => porClave.get(k) ?? 0)
    const eco = economiaDelPaquete({ precioContratado: p.precioContratado, comprobantes: suyos.map((total) => ({ total })) })
    contratadoSinFacturar += eco.pendiente ?? 0
    detalle.push({ id: p.id, ...eco, dobleConteoEvitado: eco.ejecutado })
  }
  return { enCompras, contratadoSinFacturar, costoReal: enCompras + contratadoSinFacturar, detalle }
}
