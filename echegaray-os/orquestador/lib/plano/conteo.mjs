// LA SEGUNDA MIRADA — sólo sobre lo que la primera dejó sin resolver.
//
// ═══ POR QUÉ HACE FALTA UNA SEGUNDA PASADA, MEDIDO ═══
//
// Primera corrida sobre Quattropani: 47 elementos leídos bien, 5 computables. Segunda, ya con la
// grilla en el contrato: 46 leídos, 7 computables. El cuello no era el contrato — era la ATENCIÓN.
// Una lámina de obra trae nueve vistas, tres planillas y cincuenta referencias en una sola hoja, y
// se le está pidiendo al modelo que en una pasada haga las dos cosas más distintas del trabajo:
// INVENTARIAR (qué elementos hay, qué son, cómo se especifican) y MEDIR (cuántos hay de cada uno,
// qué largo tiene cada uno). Inventariar es recorrer la hoja entera; medir es clavar la vista en un
// dibujo y contar. Pedidas juntas, la segunda pierde.
//
// Es exactamente el patrón que `comprobantes/vision.mjs` ya pagó y documentó: una lectura barata y
// general, y un segundo par de ojos SÓLO donde la primera dudó. Acá el disparador es
// determinístico igual que allá —`sinResolver` mira si falta la cantidad o una arista, no le
// pregunta a nadie— y el resultado se FUSIONA campo por campo: la segunda pasada sólo puede
// AGREGAR lo que faltaba, nunca pisar lo que la primera ya sostuvo con evidencia.
//
// ═══ LO QUE ESTA PASADA TIENE PROHIBIDO ═══
//
// Cambiar la especificación, el material, el sistema o la forma de un elemento. Si la primera dijo
// que C1 es 0,30 × 0,50 citando «C1(30-50)», eso queda. Esta pasada contesta dos preguntas y sólo
// dos: cuántos hay y qué largo tienen.

import { CAPACIDAD } from '../ia/cliente.mjs'
import { extraerJson, MODO } from './interpretar.mjs'
import { aristasFaltantes } from './computo.mjs'
import { cantidadDeElementos } from './computo.mjs'

/** Los elementos de una lámina que quedaron sin cómputo posible, con QUÉ les falta. Determinístico:
 *  no consulta a nadie para decidir a quién hay que volver a mirar. PURA. */
export function sinResolver(elementos = []) {
  return elementos
    .filter((e) => e.computable)
    .map((e) => ({ elemento: e, faltanAristas: aristasFaltantes(e), faltaCantidad: cantidadDeElementos(e.repeticion).valor === null }))
    .filter((x) => x.faltanAristas.length > 0 || x.faltaCantidad)
}

/** El pedido de la segunda pasada: la lista corta y concreta de lo que falta, con lo que la primera
 *  YA sabe de cada elemento para que el modelo sepa qué buscar en el dibujo. PURA. */
export function pedido(pendientes = []) {
  const filas = pendientes.map(({ elemento: e, faltanAristas, faltaCantidad }) => {
    const falta = [...(faltaCantidad ? ['CUÁNTOS HAY'] : []), ...faltanAristas.map((a) => a.toUpperCase())]
    return `- ${e.id} · ${e.nombre} · lo veo en «${e.evidencia?.vista ?? 's/vista'}» porque dice «${e.evidencia?.textoLiteral ?? '—'}» · ME FALTA: ${falta.join(', ')}`
  })
  return [
    'Ya inventarié esta lámina. Ahora te pido UNA sola cosa: MEDIR. No vuelvas a describir los',
    'elementos, no cambies materiales ni especificaciones, no agregues elementos nuevos.',
    '',
    'De cada uno de estos elementos necesito lo que me falta, y NADA MÁS:',
    ...filas,
    '',
    'Buscá cada uno EN EL DIBUJO, no en la planilla: contá los símbolos en la planta, seguí la',
    'cadena de cotas, mirá dónde arranca y dónde termina cada pieza, usá los ejes.',
    '',
    'Devolvés SÓLO este JSON:',
    '{"mediciones":[{"id":"C1",',
    '  "cantidad":{"modo":"conteo_directo","valor":14,"texto_literal":"conté 14 símbolos C1 en ESTRUCTURA FUNDACION, 7 por cada eje longitudinal"},',
    '  "largo_m":{"valor":3.50,"texto_literal":"C1 H=3.50m"},',
    '  "ancho_m":null, "alto_m":null, "area_m2":null}]}',
    '',
    'REGLAS:',
    '· "modo" es "conteo_directo" (los contaste), "por_separacion" (entonces mandá',
    '  {"modo":"por_separacion","longitud_tramo_m":18.30,"separacion_m":1.63,"incluye_extremos":true}',
    '  y NO dividas: divide el sistema), "por_ejes", o "indeterminable".',
    '· TODO valor lleva "texto_literal" con la cota o el rótulo del plano que lo sostiene. Sin cita,',
    '  el valor va null: prefiero un hueco declarado a un número plausible.',
    '· Si un elemento sigue sin poder medirse en ESTA lámina, devolvelo con todo en null y el',
    '  "texto_literal" explicando por qué. Es una respuesta correcta.',
  ].join('\n')
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const CLAVES = Object.freeze([['largo_m', 'largo'], ['ancho_m', 'ancho'], ['alto_m', 'alto'], ['area_m2', 'area']])

/**
 * FUSIONAR LA MEDICIÓN CON EL INVENTARIO. La segunda pasada sólo LLENA huecos.
 *
 * Un valor que la primera pasada ya sostuvo con evidencia NO se pisa: si las dos leyeron el ancho y
 * difieren, gana la primera y la discrepancia queda anotada. Reemplazar una lectura con evidencia
 * por otra lectura con evidencia sería cambiar un defecto por otro sin saber cuál — el mismo
 * razonamiento por el que la lectura de comprobantes fusiona campo por campo en vez de quedarse con
 * la segunda. PURA.
 */
export function fusionar(elemento, medicion) {
  if (!medicion) return { elemento, cambios: [] }
  const cambios = []
  const dimensiones = { ...elemento.dimensiones }
  for (const [clave, nombre] of CLAVES) {
    const m = medicion[clave]
    const v = num(m?.valor ?? m)
    if (v === null || !m?.texto_literal) continue
    if (dimensiones[nombre]?.valor != null) {
      if (dimensiones[nombre].valor !== v) cambios.push(`${nombre}: la medición dice ${v} y el inventario ${dimensiones[nombre].valor} — se conserva el inventario`)
      continue
    }
    dimensiones[nombre] = {
      valor: v, unidad: clave.endsWith('m2') ? 'm2' : 'm', fuente: elemento.dimensiones[nombre]?.fuente ?? 'EXTRAIDO_PLANO',
      evidencia: { ...elemento.evidencia, textoLiteral: String(m.texto_literal).slice(0, 300) },
      formula: null, entradas: null, nota: 'medido en la segunda pasada',
    }
    cambios.push(`${nombre} = ${v} (segunda pasada)`)
  }

  let repeticion = elemento.repeticion
  const c = medicion.cantidad
  const yaTenia = cantidadDeElementos(repeticion).valor !== null
  if (c && !yaTenia && c.modo && c.modo !== MODO.INDETERMINABLE) {
    repeticion = {
      modo: c.modo,
      cantidad: num(c.valor ?? c.cantidad),
      longitudTramo: num(c.longitud_tramo_m),
      separacion: num(c.separacion_m),
      incluyeExtremos: c.incluye_extremos === undefined || c.incluye_extremos === null ? true : Boolean(c.incluye_extremos),
      textoLiteral: c.texto_literal ? String(c.texto_literal).slice(0, 300) : null,
      evidencia: elemento.evidencia,
    }
    if (cantidadDeElementos(repeticion).valor !== null) cambios.push(`cantidad por ${c.modo} (segunda pasada)`)
    else repeticion = elemento.repeticion
  }
  return { elemento: { ...elemento, dimensiones, repeticion }, cambios }
}

/**
 * LA SEGUNDA PASADA SOBRE UNA LÁMINA. Una llamada, o ninguna si no quedó nada sin resolver.
 * Devuelve los elementos fusionados y qué cambió — «no cambió nada» también es un resultado.
 */
export async function medir({ pedir, bloque, elementos = [], logger = null } = {}) {
  const pendientes = sinResolver(elementos)
  if (!pendientes.length) return { elementos, pendientes: 0, resueltos: 0, cambios: [], uso: null }

  const r = await pedir({
    capacidad: CAPACIDAD.COMPLEX,
    sistema: 'Sos un ingeniero civil midiendo un plano ya inventariado. Devolvés SÓLO JSON válido.',
    mensajes: [{ role: 'user', content: [bloque, { type: 'text', text: pedido(pendientes) }] }],
    maxTokens: 12000,
    agente: 'xsas-ingenieria',
    funcion: 'medir-plano',
    logger,
  })
  const crudo = extraerJson(r.texto)
  const porId = new Map((crudo?.mediciones ?? []).map((m) => [String(m.id), m]))
  const cambios = []
  const fusionados = elementos.map((e) => {
    const f = fusionar(e, porId.get(e.id))
    if (f.cambios.length) cambios.push({ id: e.id, cambios: f.cambios })
    return f.elemento
  })
  const antes = pendientes.length
  const despues = sinResolver(fusionados).length
  return { elementos: fusionados, pendientes: antes, resueltos: antes - despues, cambios, uso: r }
}
