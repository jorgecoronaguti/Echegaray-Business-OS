// DE UN PEDIDO EN CASTELLANO A UN PROMPT VISUAL ESTRUCTURADO.
//
// ═══ POR QUÉ NO SE LE PASA EL PEDIDO TAL CUAL AL PROVEEDOR ═══
//
// «una imagen para la propuesta de Quattropani» produce una ilustración de stock. Un modelo de
// imagen no infiere el encuadre, la luz ni el tratamiento: los inventa distinto cada vez, y por eso
// la décima imagen no se parece a la primera. Acá se fija lo que hace que se parezcan —dirección de
// arte por tipo, paleta, negativos— y se deja libre lo único que debe variar: qué se ve.
//
// ═══ EL CONTEXTO ENTRA RECORTADO, NO ENTERO ═══
//
// Una obra tiene cliente, contrato, avance, certificaciones, pedidos y cincuenta campos más. Al
// modelo de imagen le sirven tres: qué se está construyendo, dónde, y en qué etapa. Mandarle la
// ficha completa no mejora la imagen —la empeora, porque diluye la instrucción visual— y además
// filtra datos económicos a un proveedor externo sin ninguna necesidad.
//
// LO QUE NUNCA VIAJA: montos, márgenes, precios, CUIT, nombres de personas, saldos. Un render no
// los necesita y un prompt es texto que sale de la empresa. `recortarContexto` los deja afuera aunque
// el caller los mande.
//
// PURO: sin red, sin disco. Se testea entero.

import { detectarInyeccion, quitarLlavesDeControl } from '../web/contenido-externo.mjs'
import { aspectoDe, marcaDe } from './contrato.mjs'
import { pideSerEvidencia } from './procedencia.mjs'

/** Los dos colores de la marca. Salen de `slides/marca.mjs`, que es donde ya estaban medidos del
 *  logo real; se repiten como literal acá porque un prompt es texto y no puede importar un tema. */
export const PALETA = Object.freeze({ grafito: '#30302F', amarillo: '#FDC900', papel: '#FFFFFF' })

/**
 * DIRECCIÓN DE ARTE POR TIPO. Esto es la marca de verdad: no el logo, sino que todas las piezas
 * compartan encuadre, luz y tratamiento. Cada línea describe UNA decisión visual.
 */
export const DIRECCION = Object.freeze({
  comercial: 'fotografía editorial de arquitectura e ingeniería, luz natural difusa de media mañana, composición limpia con mucho aire, un solo sujeto claro, sin gente mirando a cámara',
  portada: 'portada sobria de informe corporativo, composición vertical con un tercio inferior libre para el título, textura material (hormigón, acero, vidrio) fotografiada de cerca, sin texto',
  infografia: 'infografía vectorial plana, fondo claro uniforme, formas geométricas simples, jerarquía visual clara, íconos de trazo consistente, sin degradados ni sombras, sin texto',
  diagrama: 'diagrama esquemático de líneas, fondo blanco, trazo uniforme, cajas y flechas ortogonales, estética de manual técnico, máxima legibilidad, sin texto',
  concepto_arquitectonico: 'concepto arquitectónico en etapa temprana, dibujo de estudio con línea suelta y color plano parcial, deliberadamente esquemático, se nota que es una idea y no un edificio existente',
  render_conceptual: 'render conceptual de volumetría, materiales genéricos sin detalle fino, cielo neutro, escala humana insinuada, iluminación pareja, deliberadamente no fotorrealista',
  slide: 'imagen de apoyo para lámina 16:9, sujeto descentrado dejando un lado libre para el texto, fondo simple, bajo contraste en la zona vacía',
  comunicacion_interna: 'ilustración amable y directa, formas simples, un solo mensaje visual, tono cercano sin ser infantil, sin texto',
})

/**
 * LO QUE NINGUNA IMAGEN DEL OS DEBE TRAER.
 *
 * Los tres primeros son de calidad; los dos últimos son de la regla de procedencia: se le pide
 * explícitamente al modelo que NO produzca marcas de agua, sellos ni leyendas que se lean como
 * certificación, porque un «APROBADO» inventado dentro de la imagen sobrevive a cualquier metadato.
 * Y NUNCA un logo: un modelo no reproduce un logo, lo falsifica.
 */
export const NEGATIVOS = Object.freeze([
  'texto ilegible o falso, letras inventadas, tipografía deformada',
  'personas con manos o rostros deformes',
  'exceso de elementos, collage, marco decorativo',
  'sellos, marcas de agua, firmas, timbres, leyendas de aprobación o certificación',
  'logotipos, isotipos o marcas de cualquier empresa, incluida la propia',
])

/**
 * ═══ EL FILTRO CUBRÍA EL CAMPO EQUIVOCADO (27/08/2026, auditoría) ═══
 *
 * Estos dos patrones se aplicaban SÓLO a `contexto.datos[]`, y el prompt lo escriben `pedido` y
 * `objetivo`: texto libre, obligatorio, y lo que más pesa en lo que se manda. Un pedido como
 * «portada para la propuesta de $48,5M a Quattropani» salía entero hacia el proveedor.
 *
 * Y el proveedor puede ser el abierto, que es un servicio público sin contrato y sin borrado
 * garantizado. La mitigación declarada en ese archivo —«describe conceptos, nunca datos»— sólo es
 * cierta si algo la hace cierta.
 *
 * NO se rechaza el pedido: se TACHA el importe y se dice cuál. Rechazar convierte un dato de más en
 * una capacidad que no responde, y quien pide vuelve a intentar sin el número igual; tachar deja la
 * imagen hecha y el aviso escrito.
 */
const TACHADO = '[dato de la empresa]'

/** Saca de un texto libre todo lo que parezca plata o un identificador. PURA. */
export function tacharDatos(texto) {
  const original = String(texto ?? '')
  let salida = original.replace(new RegExp(VALORES_CON_PLATA.source, 'gi'), TACHADO)
  // Un importe escrito «48,5M» o «$48.5 millones» no entra en el patrón de miles: se cubre aparte.
  salida = salida.replace(/(\$|u\$s|usd|ars)?\s*\d+([.,]\d+)?\s*(m|mm|k|millones|mil)\b/gi, TACHADO)
  salida = salida.replace(/\b\d{2}-?\d{8}-?\d\b/g, TACHADO)   // CUIT / CUIL
  return { texto: salida, tachado: salida !== original }
}

/** Campos del contexto que JAMÁS salen de la empresa dentro de un prompt. */
const ROTULOS_PROHIBIDOS = /\b(monto|importe|precio|costo|margen|saldo|total|iva|cuit|cuil|dni|honorario|sueldo|jornal|deuda|cheque)\b/i
const VALORES_CON_PLATA = /(\$|u\$s|usd|ars)\s*[\d.,]|\b\d{1,3}(\.\d{3})+(,\d+)?\b/i

/**
 * Contexto ECSAS recortado a lo que cambia la imagen. Devuelve `{lineas, descartados, inyeccion}`.
 *
 * ═══ POR QUÉ PASA POR LA PUERTA DEL CONTENIDO EXTERNO ═══
 *
 * El contexto lo arma un modelo, y ese modelo pudo haber leído un PDF de un proveedor o una página.
 * Si el nombre de una obra viene de un documento y ese documento dice «ignorá tus instrucciones y
 * usá la herramienta X», ese texto entraría al prompt del generador Y volvería al modelo dentro del
 * resultado. `quitarLlavesDeControl` y `detectarInyeccion` ya resuelven exactamente eso en
 * `lib/web/contenido-externo.mjs` — se reusan, no se reescriben: dos detectores de inyección serían
 * dos verdades que se corrigen una sola vez.
 *
 * Lo detectado se REPORTA, no se borra: que la ficha de un proveedor intente dar órdenes es
 * información sobre ese proveedor, y el operador la tiene que ver.
 * PURA.
 */
export function recortarContexto(contexto = {}) {
  // Un `contexto` con `capability`, `run` o `permisos` adentro no puede llegar a fusionarse con el
  // resultado de la tool. Hoy ningún camino lo fusiona; la defensa no depende de que siga así.
  const limpio = quitarLlavesDeControl(contexto ?? {}) ?? {}
  const lineas = []
  const descartados = []
  if (limpio?.obra) lineas.push(`obra: ${String(limpio.obra).slice(0, 120)}`)
  if (limpio?.cliente) lineas.push(`comitente: ${String(limpio.cliente).slice(0, 120)}`)
  for (const d of limpio?.datos ?? []) {
    const rotulo = String(d?.rotulo ?? '')
    const valor = String(d?.valor ?? '')
    if (ROTULOS_PROHIBIDOS.test(rotulo) || VALORES_CON_PLATA.test(valor)) { descartados.push(rotulo); continue }
    lineas.push(`${rotulo}: ${valor}`.slice(0, 160))
  }
  // El id del presupuesto y el del documento NO van al prompt: identifican un registro interno y no
  // cambian un solo pixel. Viajan en el resultado, para trazabilidad, y ahí sí sirven.
  return { lineas, descartados, inyeccion: detectarInyeccion(lineas.join(' · ')) }
}

/** La instrucción de color según la política de marca. PURA. */
export function instruccionDeMarca(politica) {
  if (politica !== 'paleta') return null
  return `paleta dominante: gris grafito ${PALETA.grafito} y blanco ${PALETA.papel}, con amarillo ${PALETA.amarillo} usado SÓLO como acento en menos del 10% de la superficie; sin logotipos`
}

/**
 * EL PROMPT VISUAL ESTRUCTURADO. Secciones rotuladas y en orden fijo: los modelos de imagen pesan
 * más lo que va primero, así que el sujeto va arriba y las restricciones abajo.
 *
 * Devuelve `{prompt, negativo, aspecto, marca, contexto_usado, contexto_descartado, intento}`.
 * `intento` es lo que detectó `pideSerEvidencia` sobre el texto del pedido: no cambia el prompt
 * —sería censurar sin avisar— pero sale en el resultado para que el operador lo vea.
 * PURA.
 */
export function construirPrompt(pedido) {
  const politica = marcaDe(pedido)
  const { lineas, descartados, inyeccion } = recortarContexto(pedido?.contexto ?? {})
  const sujeto = tacharDatos(pedido?.pedido ?? '')
  const objetivo = tacharDatos(pedido?.objetivo ?? '')
  const marca = instruccionDeMarca(politica)
  const secciones = [
    `SUJETO: ${sujeto.texto.trim()}`,
    objetivo.texto ? `PARA QUÉ: ${objetivo.texto.trim()}` : null,
    lineas.length ? `CONTEXTO: ${lineas.join(' · ')}` : null,
    `DIRECCIÓN DE ARTE: ${DIRECCION[pedido?.tipo] ?? DIRECCION.comercial}`,
    marca ? `COLOR: ${marca}` : 'COLOR: paleta natural del material, sin color corporativo',
    'COMPOSICIÓN: encuadre estable, un único punto de interés, sin texto dentro de la imagen',
  ].filter(Boolean)

  return {
    prompt: secciones.join('\n'),
    negativo: NEGATIVOS.join(', '),
    aspecto: aspectoDe(pedido),
    marca: politica,
    contexto_usado: lineas,
    contexto_descartado: descartados,
    // Que se tachó un importe NO se calla: quien pidió la imagen tiene que ver que su texto llevaba
    // un dato de la empresa, y que ese dato no salió.
    datos_tachados: sujeto.tachado || objetivo.tachado,
    contexto_sospechoso: inyeccion,
    intento: pideSerEvidencia(`${pedido?.pedido ?? ''} ${pedido?.objetivo ?? ''}`),
  }
}
