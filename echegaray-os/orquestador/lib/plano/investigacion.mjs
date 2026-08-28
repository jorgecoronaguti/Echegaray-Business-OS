// CUANDO XSAS NO SABE ALGO, LO BUSCA — en este orden y no en otro.
//
// ═══ POR QUÉ UNA CASCADA Y NO «preguntale a internet» ═══
//
// La resistencia del hormigón de una viga puede estar en cinco lugares distintos, y NO valen lo
// mismo: si la memoria de cálculo del proyecto dice H-25, eso manda sobre cualquier página; si la
// Base Maestra tiene el análisis, manda sobre el CIRCOT; y el CIRCOT manda sobre una búsqueda. Ir
// directo a la web es caro, es lento y —lo que importa— degrada la procedencia de un dato que ya
// teníamos con mejor respaldo.
//
// Por eso la cascada está acá, en un solo lugar, y devuelve SIEMPRE el recorrido completo: qué
// paso resolvió, qué pasos se probaron antes y por qué no alcanzaron. Un dato sin ese recorrido no
// se puede defender.
//
// ═══ LO QUE LA WEB NO PUEDE HACER, POR CONSTRUCCIÓN ═══
//
// Nada de internet asciende a HECHO ECSAS, a EXPERIENCIA ECSAS ni a NORMA por el solo hecho de
// haber sido leído. Este módulo NO reimplementa esa defensa: la reusa entera de
// `web/contenido-externo.mjs`, que ya sella el bloque, quita las llaves de control y marca los
// intentos de inyección. Acá se agrega lo único que faltaba para un uso TÉCNICO: la AUTORIDAD de
// la fuente, que es lo que separa una resolución del INTI de un foro.

import { FUENTE, dato, evidencia, faltaDato } from './fuente.mjs'

/** La escala de autoridad, de la que más pesa a la que menos. El número es el ORDEN, no un puntaje:
 *  no se promedian autoridades ni se suman — se prefiere la mejor disponible. */
export const AUTORIDAD = Object.freeze({
  OFICIAL: 1,            // el Estado publicando su propia norma o su propio dato
  ORGANISMO_TECNICO: 2,  // el que fija el criterio técnico (reglamento, ensayo, índice)
  FABRICANTE: 3,         // la ficha técnica de quien fabrica la cosa
  PRIMARIA: 4,           // quien vende o provee, publicando su propio precio
  SECUNDARIA: 5,         // todo lo demás — sólo si no hay nada mejor
})

export const NOMBRE_AUTORIDAD = Object.freeze({ 1: 'OFICIAL', 2: 'ORGANISMO_TECNICO', 3: 'FABRICANTE', 4: 'PRIMARIA', 5: 'SECUNDARIA' })

/**
 * DOMINIOS QUE SABEMOS QUÉ SON. No es una lista excluyente y no puede serlo: si mañana el criterio
 * lo publica un organismo que no está acá, la fuente igual se usa — sale SECUNDARIA y con eso
 * dicho. Lo que la lista hace es RECONOCER, no autorizar.
 */
const DOMINIOS = Object.freeze([
  [AUTORIDAD.ORGANISMO_TECNICO, /(^|\.)(inti|inpres|cirsoc|indec|senasa|enargas|inta)\.gob\.ar$/i],
  [AUTORIDAD.ORGANISMO_TECNICO, /(^|\.)(iram|uocra|ieric|cpau|cpic)\.(org|org\.ar|com\.ar)$/i],
  [AUTORIDAD.ORGANISMO_TECNICO, /\.edu\.ar$/i],
  [AUTORIDAD.OFICIAL, /\.gob\.ar$|\.gov\.ar$/i],
])

/** El dominio de una URL, en minúsculas y sin `www.`. PURA. */
export function dominioDe(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

/**
 * QUÉ AUTORIDAD TIENE ESTA FUENTE. PURA.
 *
 * `pistasFabricante` son los nombres que el propio pedido menciona —«Acindar», «Ternium»,
 * «Ferrum»—: si el dominio contiene uno de ellos, es la ficha del fabricante y no una reventa. Sin
 * la pista no se adivina: un `.com.ar` cualquiera es SECUNDARIA, y decirlo así es más útil que
 * inventarle jerarquía.
 */
export function autoridadDe(url, { pistasFabricante = [] } = {}) {
  const d = dominioDe(url)
  if (!d) return { autoridad: AUTORIDAD.SECUNDARIA, dominio: null, porQue: 'la URL no se puede interpretar' }
  for (const [nivel, re] of DOMINIOS) {
    if (re.test(d)) return { autoridad: nivel, dominio: d, porQue: `el dominio «${d}» es ${NOMBRE_AUTORIDAD[nivel].toLowerCase().replace('_', ' ')}` }
  }
  const marca = pistasFabricante
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .find((p) => p.length > 2 && d.replace(/[^a-z0-9]/g, '').includes(p))
  if (marca) return { autoridad: AUTORIDAD.FABRICANTE, dominio: d, porQue: `el dominio contiene «${marca}», que es el fabricante que menciona la consulta` }
  return { autoridad: AUTORIDAD.SECUNDARIA, dominio: d, porQue: `«${d}» no se reconoce como oficial, organismo técnico ni fabricante: se usa sólo si no hay nada mejor` }
}

/** Las fuentes ordenadas por autoridad, y a igual autoridad por frescura. PURA y TOTAL: el
 *  desempate final es por URL, para que dos corridas devuelvan el mismo orden. */
export function ordenarPorAutoridad(fuentes = [], { pistasFabricante = [] } = {}) {
  return [...fuentes]
    .map((f) => ({ ...f, ...autoridadDe(f.url, { pistasFabricante }) }))
    .sort((a, b) => a.autoridad - b.autoridad
      || (a.frescura?.dias ?? 9e9) - (b.frescura?.dias ?? 9e9)
      || String(a.url).localeCompare(String(b.url)))
}

/** Los pasos de la cascada, en orden. Cambiar este orden cambia qué respaldo tiene cada número del
 *  presupuesto, así que está acá y no repartido entre los que llaman. */
export const PASOS = Object.freeze([
  { id: 'DOCUMENTACION_PROYECTO', que: 'lo que dice la propia documentación del cliente (plano, CAD, pliego, memoria, planilla)', fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: 'BASE_MAESTRA', que: 'el análisis de precios vigente de ECSAS', fuente: FUENTE.BASE_MAESTRA },
  { id: 'EXPERIENCIA_ECSAS', que: 'lo medido en obras de ECSAS', fuente: FUENTE.EXPERIENCIA_ECSAS },
  { id: 'CONOCIMIENTO_XSAS', que: 'las reglas y los métodos que el OS ya tiene escritos', fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: 'REFERENCIA_LOCAL', que: 'los documentos técnicos incorporados (CIRCOT, paper de cuadrillas)', fuente: FUENTE.DOCUMENTO_TECNICO },
  { id: 'WEB', que: 'internet, con su fuente, su fecha y su autoridad', fuente: FUENTE.WEB },
])

/**
 * INVESTIGAR UNA PREGUNTA TÉCNICA. Recorre la cascada y se detiene en el PRIMER paso que resuelve.
 *
 * `resolvedores` es un objeto `{ ID_DE_PASO: async () => ({ resuelto, valor, unidad, evidencia }) }`.
 * Los que no estén se saltan y quedan anotados como «no había con qué probar este paso», que no es
 * lo mismo que «se probó y no estaba»: la diferencia es la que distingue un hueco de una ausencia.
 *
 * Devuelve SIEMPRE el recorrido completo, incluso cuando resuelve en el primer paso.
 */
export async function investigar({ pregunta, resolvedores = {}, pasos = PASOS } = {}) {
  const recorrido = []
  for (const paso of pasos) {
    const r = resolvedores[paso.id]
    if (typeof r !== 'function') {
      recorrido.push({ paso: paso.id, estado: 'SIN_RESOLVEDOR', porQue: `no hay con qué consultar ${paso.que}` })
      continue
    }
    let salida
    try {
      salida = await r({ pregunta })
    } catch (e) {
      recorrido.push({ paso: paso.id, estado: 'ERROR', porQue: String(e?.message ?? e).slice(0, 200) })
      continue
    }
    if (!salida?.resuelto) {
      recorrido.push({ paso: paso.id, estado: 'NO_RESUELVE', porQue: salida?.porQue ?? `${paso.que} no tiene este dato` })
      continue
    }
    recorrido.push({ paso: paso.id, estado: 'RESUELVE', porQue: salida.porQue ?? null })
    return {
      pregunta,
      resueltoEn: paso.id,
      dato: dato({ valor: salida.valor, unidad: salida.unidad ?? null, fuente: salida.fuente ?? paso.fuente, evidencia: salida.evidencia ?? null, nota: salida.nota ?? null }),
      extra: salida.extra ?? null,
      recorrido,
    }
  }
  return {
    pregunta,
    resueltoEn: null,
    dato: faltaDato({ que: pregunta, porque: 'se recorrió la cascada entera —documentación, Base Maestra, experiencia, conocimiento del OS, referencias locales e internet— y ninguna fuente lo tiene', quienLoTiene: 'proyecto / dirección técnica' }),
    recorrido,
  }
}

/**
 * UN RESULTADO DE LA WEB CONVERTIDO EN DATO CITABLE. PURA.
 *
 * `envuelto` es lo que devuelve `aplicarPoliticaContenidoExterno` —no se toca, no se desarma y no
 * se reetiqueta—. Lo único que se agrega es la autoridad y la evidencia con la que después se
 * puede volver a la página. Si no hay contenido citable no hay evidencia, y sin evidencia el dato
 * sale degradado por la propia regla de `fuente.mjs`: una referencia sin dirección no es una
 * referencia.
 */
export function datoDeWeb(envuelto, { valor = null, unidad = null, pistasFabricante = [] } = {}) {
  const a = autoridadDe(envuelto?.url, { pistasFabricante })
  const ev = evidencia({
    archivo: envuelto?.fuente ?? a.dominio ?? 'web',
    textoLiteral: String(envuelto?.contenido_externo ?? '').slice(0, 280) || null,
    ubicacion: envuelto?.url ?? null,
  })
  return {
    ...dato({ valor, unidad, fuente: FUENTE.WEB, evidencia: ev, nota: `${NOMBRE_AUTORIDAD[a.autoridad]} · ${a.porQue}` }),
    url: envuelto?.url ?? null,
    titulo: envuelto?.fuente ?? null,
    publicadoEn: envuelto?.publicado_en ?? null,
    consultadoEn: envuelto?.obtenido_en ?? null,
    frescura: envuelto?.frescura ?? null,
    autoridad: NOMBRE_AUTORIDAD[a.autoridad],
    // Se repite acá a propósito: quien lea SÓLO este objeto tiene que ver el límite sin ir a buscarlo.
    esHechoEcsas: false,
    noAsciende: ['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA'],
    inyeccion: envuelto?.inyeccion ?? null,
  }
}

/**
 * EL RESOLVEDOR WEB LISTO PARA ENCHUFAR EN LA CASCADA.
 *
 * `buscar` y `leer` se inyectan —en producción son `web-search.mjs` y `web/web-lectura.mjs`, y en
 * los tests son funciones— porque este módulo no debe abrir sockets para poder probarse. Primero
 * busca; si la búsqueda propone URLs, LEE la de mayor autoridad, porque el resumen de una búsqueda
 * no se puede citar con fecha y una página sí.
 */
export function resolvedorWeb({ buscar, leer = null, politica, pistasFabricante = [] } = {}) {
  return async ({ pregunta }) => {
    // SE PIDE LA URL EXPLÍCITAMENTE. Medido: el resumen de la búsqueda nombra la fuente («CIRSOC»,
    // «INTI») pero casi nunca escribe su dirección, y sin dirección no hay nada que releer — el dato
    // queda como orientación y no como evidencia. Se pide acá y no en `web-search.mjs` porque esa
    // es infraestructura compartida y este requisito es del uso TÉCNICO.
    const r = await buscar(`${pregunta}. Incluí la URL COMPLETA (https://…) de cada fuente que cites, en su propio renglón.`)
    const texto = String(r?.text ?? r?.resultado ?? '')
    if (!texto.trim()) return { resuelto: false, porQue: 'la búsqueda no devolvió nada' }
    const urls = [...new Set(String(texto).match(/https?:\/\/[^\s)\]"'<>]+/g) ?? [])]
    const mejor = ordenarPorAutoridad(urls.map((u) => ({ url: u })), { pistasFabricante })[0] ?? null
    let envuelto = politica({ texto, origen: 'busqueda_web', consulta: pregunta, url: mejor?.url ?? null })
    let leida = null
    if (leer && mejor?.url) {
      try {
        leida = await leer(mejor.url, { consulta: pregunta })
        if (leida?.contenido_externo) envuelto = leida
      } catch { /* si la página no abre, queda el resumen de la búsqueda, dicho como tal */ }
    }
    return {
      resuelto: true,
      valor: null,
      fuente: FUENTE.WEB,
      porQue: mejor ? `resuelto en internet con ${NOMBRE_AUTORIDAD[mejor.autoridad]}: ${mejor.dominio}` : 'resuelto en internet sin una URL citable — es orientación, no evidencia',
      evidencia: evidencia({ archivo: envuelto?.fuente ?? mejor?.dominio ?? 'web', textoLiteral: String(envuelto?.contenido_externo ?? texto).slice(0, 280), ubicacion: envuelto?.url ?? mejor?.url ?? null }),
      extra: {
        ...datoDeWeb(envuelto, { pistasFabricante }),
        candidatas: ordenarPorAutoridad(urls.map((u) => ({ url: u })), { pistasFabricante }).slice(0, 6).map((x) => ({ url: x.url, autoridad: NOMBRE_AUTORIDAD[x.autoridad], porQue: x.porQue })),
        leidaLaPagina: Boolean(leida),
      },
    }
  }
}
