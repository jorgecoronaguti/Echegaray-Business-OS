// DOS UNIVERSOS QUE SE ESTABAN REPORTANDO COMO SI FUERAN UNO.
//
// ═══ EL NÚMERO QUE ENGAÑA ═══
//
// Las dos corridas del 31/08/2026 sobre la MISMA base dieron:
//
//     catálogo entero        406 recursos · 15 resueltos ·  3,7%
//     una cotización real    107 recursos · 49 resueltos · 45,8%
//
// Los dos son ciertos y ninguno contesta la pregunta del otro. El 3,7% mide un inventario donde
// nadie pesa nada: el TORNILLO AUTOPERFORANTE y el PANEL DE CHAPA valen lo mismo porque no hay
// cantidades. El 45,8% mide una oferta concreta, donde el peso existe. Poner los dos en el mismo
// informe sin decir cuál es cuál hace que «mejoramos del 3,7% al 45,8%» parezca un avance cuando es
// un cambio de universo.
//
// ═══ QUÉ RELACIONA A LOS DOS ═══
//
//   CATÁLOGO   — todos los recursos que la empresa definió alguna vez. Es el inventario de lo que
//                SE PUEDE cotizar. Ahí la métrica honesta es de COBERTURA: cuántos tienen precio
//                usable. No admite ponderación por plata porque no hay plata.
//   COTIZACIÓN — los recursos que una oferta concreta USA, con sus cantidades. Ahí la métrica
//                honesta es de RIESGO ECONÓMICO: cuánta plata está apoyada en un precio que no se
//                puede defender. Es la que decide si la oferta se firma.
//   RELACIÓN   — la cotización es un SUBCONJUNTO del catálogo. Un recurso que la oferta usa y el
//                catálogo no tiene es un hueco de datos, y hay que verlo aparte de los dos.
//
// El consolidado NO es la suma ni el promedio de los dos porcentajes: es la lista de las tres
// preguntas contestadas por separado, con su universo dicho al lado de cada número.

/** Los universos que existen. No hay un tercero, y mezclar dos de éstos produce un número que no
 *  responde ninguna pregunta. */
export const UNIVERSO = Object.freeze({
  CATALOGO: 'CATALOGO',
  COTIZACION: 'COTIZACION',
  FUERA_DEL_CATALOGO: 'FUERA_DEL_CATALOGO',
})

const pct = (a, b) => (b > 0 ? a / b : null)

/**
 * LA COBERTURA DEL CATÁLOGO: CUÁNTOS RECURSOS TIENEN UN PRECIO USABLE. PURA.
 *
 * Es un CONTEO y se dice que lo es. No se pondera por plata porque acá no hay plata: ponderar un
 * inventario con pesos inventados es la manera más rápida de fabricar un indicador que sube solo.
 */
export function coberturaDeCatalogo(resoluciones = []) {
  const n = resoluciones.length
  const cuenta = { VIGENTE: 0, ACTUALIZADO: 0, NECESITA_HUMANO: 0, SIN_PRECIO: 0 }
  for (const r of resoluciones) cuenta[r.resultado] = (cuenta[r.resultado] ?? 0) + 1
  const usables = cuenta.VIGENTE + cuenta.ACTUALIZADO
  return Object.freeze({
    universo: UNIVERSO.CATALOGO,
    recursos: n,
    usables,
    cobertura: pct(usables, n),
    porResultado: Object.freeze(cuenta),
    medida: 'CONTEO',
    porQue: `${usables} de ${n} recursos del catálogo tienen un precio usable (${((pct(usables, n) ?? 0) * 100).toFixed(1)}%). Es un CONTEO: en el catálogo no hay cantidades, así que ningún recurso pesa más que otro y este número NO dice cuánta plata está en riesgo`,
  })
}

/**
 * EL RIESGO ECONÓMICO DE UNA COTIZACIÓN: CUÁNTA PLATA SE APOYA EN UN PRECIO INDEFENDIBLE. PURA.
 *
 * Acá sí hay plata, así que la métrica se pondera. El conteo de recursos se devuelve igual porque
 * sirve para otra cosa —cuántas interrupciones recibe una persona— pero NO es el número que decide.
 *
 * `riesgos` viene de `precio-materialidad.mjs`. Los de riesgo `null` van aparte y NO al denominador:
 * NO_MEDIDO nunca es 0%.
 */
export function riesgoDeCotizacion({ riesgos = [], recursos = 0, resueltos = 0 } = {}) {
  // ═══ `Number(null)` ES 0, Y ESO ES LA TRAMPA ═══
  //
  // `Number.isFinite(Number(r.riesgo))` da `true` para un riesgo `null`, así que el bucket de NO
  // MEDIDO salía vacío y los desconocidos se contaban como riesgo cero — exactamente lo que este
  // módulo existe para impedir. Lo atrapó el test antes que una corrida. El chequeo tiene que ser
  // sobre el valor, no sobre su conversión.
  const esMedido = (r) => r?.riesgo !== null && r?.riesgo !== undefined && Number.isFinite(Number(r.riesgo))
  const medidos = riesgos.filter(esMedido)
  const noMedidos = riesgos.filter((r) => !esMedido(r))
  const riesgoTotal = medidos.reduce((a, r) => a + r.riesgo, 0)
  const impactoTotal = medidos.reduce((a, r) => a + (Number(r.impacto) || 0), 0)
  return Object.freeze({
    universo: UNIVERSO.COTIZACION,
    recursos,
    resueltos,
    cobertura: pct(resueltos, recursos),
    riesgoTotal,
    impactoEnDuda: impactoTotal,
    noMedidos: noMedidos.length,
    medida: 'PONDERADA_POR_PLATA',
    porQue: `${resueltos} de ${recursos} recursos de la oferta tienen precio usable; los que no dejan $${Math.round(riesgoTotal).toLocaleString('es-AR')} de riesgo económico sobre $${Math.round(impactoTotal).toLocaleString('es-AR')} apoyados en precios que no se pueden defender`
      + (noMedidos.length ? ` · ${noMedidos.length} con riesgo NO MEDIDO, que no entran a ningún porcentaje` : ''),
  })
}

/**
 * LA RELACIÓN ENTRE LOS DOS. PURA.
 *
 * Un recurso que la oferta usa y el catálogo no tiene NO es un precio vencido ni un SIN_PRECIO: es
 * un recurso que no existe como definición. Se cuenta aparte porque se arregla en otro lado —hay que
 * darlo de alta— y meterlo en cualquiera de los dos porcentajes lo esconde.
 */
export function relacionar({ codigosDelCatalogo = [], codigosDeLaCotizacion = [] } = {}) {
  const enCatalogo = new Set(codigosDelCatalogo.map(String))
  const usados = [...new Set(codigosDeLaCotizacion.map(String))]
  const dentro = usados.filter((c) => enCatalogo.has(c))
  const fuera = usados.filter((c) => !enCatalogo.has(c))
  const nuncaUsados = [...enCatalogo].filter((c) => !usados.includes(c))
  return Object.freeze({
    usadosPorLaOferta: usados.length,
    enElCatalogo: dentro.length,
    fueraDelCatalogo: Object.freeze(fuera),
    delCatalogoSinUsar: nuncaUsados.length,
    porQue: fuera.length
      ? `${fuera.length} recurso(s) que la oferta usa NO están definidos en el catálogo (${fuera.slice(0, 6).join(', ')}): eso no es un precio vencido, es una definición que falta y se arregla en otro lado`
      : `los ${usados.length} recursos de la oferta están todos definidos en el catálogo; quedan ${nuncaUsados.length} recursos definidos que esta oferta no usa`,
  })
}

/**
 * EL INFORME CONSOLIDADO. PURA.
 *
 * «Consolidado» acá NO significa un número único: significa las tres preguntas juntas, cada una con
 * su universo declarado. Un porcentaje sin universo al lado es la manera de mentir sin decir nada
 * falso, y este módulo existe para que no se pueda escribir.
 */
export function consolidar({ catalogo = null, cotizacion = null, relacion = null } = {}) {
  return Object.freeze({
    catalogo, cotizacion, relacion,
    // Explícito y feo a propósito: no hay un KPI que resuma los dos.
    numeroUnico: null,
    porQue: 'NO hay un porcentaje único: el catálogo se mide por cobertura de recursos y la cotización por plata en riesgo. '
      + 'Son dos preguntas distintas —«¿qué puedo cotizar?» y «¿puedo firmar ESTA oferta?»— y un promedio de las dos no contesta ninguna. '
      + 'Cada número de este informe lleva su universo al lado.',
  })
}
