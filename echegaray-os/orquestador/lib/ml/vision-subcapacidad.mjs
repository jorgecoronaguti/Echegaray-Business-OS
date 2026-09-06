// DESCOMPONER LA VISIÓN EN LAS SUBCAPACIDADES QUE DE VERDAD SON.
//
// ═══ EL ERROR QUE ESTE ARCHIVO EXISTE PARA NO REPETIR ═══
//
// Se midió SigLIP contra «visión» y dio 31,8%. Ese número no prueba que la visión local no sirva:
// prueba que se midió un modelo contra una tarea que no existe. `interpretar-region` —169 llamadas
// y $17,69 en una sola semana, el 42% de todo lo que se le paga a Claude— no es UNA tarea. Es el
// cotizador mirando el recorte de UNA vista de un plano, y una vista puede ser cinco cosas
// distintas con techos y costos distintos:
//
//   PLANTA   geometría 2D con ejes y luces      leer cotas y contar elementos repetidos
//   CORTE    alturas y niveles                  leer cotas verticales
//   DETALLE  una unión, un despiece             reconocer perfiles y soldaduras
//   CUADRO   una planilla de columnas o losas   TEXTO TABULADO — no es visión, es lectura
//   VISTA    una fachada                        casi no aporta cómputo
//
// Medir un modelo contra el agregado de esas cinco da un promedio que no describe a ninguna.
//
// ═══ POR QUÉ EL TIPO NO SE VUELVE A INVENTAR ACÁ ═══
//
// `clasificarPorTitulo` de `ingesta/segmentar.mjs` YA decide qué es cada región, y es la misma
// función que corrió en producción cuando se pagaron esas llamadas. Escribir un segundo criterio
// acá haría que la descomposición describa una segmentación que nunca existió — el clásico control
// validado contra información que él mismo produce.

import { clasificarPorTitulo, TIPO_REGION } from '../ingesta/segmentar.mjs'
import { validarLamina } from '../plano/interpretar.mjs'
import { computarElementos } from '../plano/computo.mjs'

/** Los campos que devuelve `interpretar-region`, partidos por DE DÓNDE SALE cada uno.
 *
 *  Esta partición es la que decide si hace falta un modelo de visión o alcanza con la capa de texto
 *  del PDF, y por eso está acá y no adentro de un `if`: es una afirmación sobre el trabajo, y tiene
 *  que poder discutirse y probarse por separado. */
export const ORIGEN_CAMPO = Object.freeze({
  // Está ESCRITO en el plano. PyMuPDF lo extrae con coordenadas y no necesita ningún modelo.
  TEXTO: ['proyecto', 'lamina', 'faltan_datos', 'referencias_a_otras_laminas'],
  // Requiere mirar el DIBUJO: contar símbolos, seguir una línea de cota, entender una unión.
  DIBUJO: ['elementos', 'grilla'],
})

/** De qué origen es un campo de la respuesta. PURA. */
export function origenDeCampo(campo) {
  if (ORIGEN_CAMPO.TEXTO.includes(campo)) return 'TEXTO'
  if (ORIGEN_CAMPO.DIBUJO.includes(campo)) return 'DIBUJO'
  return 'DESCONOCIDO'
}

/**
 * LA SUBCAPACIDAD DE UNA LECTURA CACHEADA. PURA.
 *
 * Una entrada sin título NO se adivina: queda `indeterminado` igual que en producción. Inventarle
 * un tipo por el contenido de la respuesta sería clasificar la pregunta con la respuesta.
 */
export function subcapacidadDeLectura(entrada) {
  const titulo = entrada?.region ?? null
  if (titulo == null) return { tipo: TIPO_REGION.INDETERMINADO, titulo: null, porQue: 'la lectura se cacheó sin título de región' }
  const c = clasificarPorTitulo(titulo)
  return { tipo: c.tipo, titulo, porQue: c.porQue }
}

/**
 * CUÁNTO PESA CADA CAMPO DE UNA RESPUESTA, EN CARACTERES DE JSON.
 *
 * El costo de Opus lo domina la SALIDA (se paga ~5× la entrada), así que el peso en caracteres de
 * cada campo es el mejor proxy disponible de en qué se fue la plata dentro de una llamada. Es una
 * ESTIMACIÓN y se declara: `chat_cost` guarda tokens_out por llamada pero no por campo, y no hay
 * forma de repartirlos sin este supuesto.
 */
export function pesoDeCampos(crudo = {}) {
  const pesos = {}
  let total = 0
  for (const [k, v] of Object.entries(crudo ?? {})) {
    const n = JSON.stringify(v ?? null).length
    pesos[k] = n
    total += n
  }
  return { pesos, total }
}

/**
 * ¿ESTE ELEMENTO SIRVE PARA COMPUTAR UNA OBRA? — LA PREGUNTA SE LE HACE AL PIPELINE, NO ACÁ.
 *
 * ═══ ESTA FUNCIÓN TUVO DOS VERSIONES Y LAS DOS MINTIERON ═══
 *
 * La primera aceptaba cualquier campo no nulo y devolvía `true` para los 840 elementos medidos.
 * La segunda —«tiene alguna dimensión O alguna cantidad»— devolvía 630 de 840: 75,0%. El pipeline
 * de producción, corrido el 05/09/2026 sobre las MISMAS 113 lecturas, computa 152: 18,1%. Cuatro
 * veces menos.
 *
 * La diferencia no es un matiz de criterio: un perfil `lineal` con su sección leída y sin largo
 * tiene «alguna dimensión» y no se puede multiplicar por un precio. `computarElemento` lo sabe
 * porque exige las aristas que la FORMA pide, y además que la cantidad se pueda sostener. Tener el
 * criterio dos veces garantiza que la medición y el sistema se contradigan, y la copia siempre
 * resulta ser la optimista.
 *
 * Por eso acá no hay criterio propio: hay una llamada a `computarElementos` sobre lo que
 * `validarLamina` produce, que son literalmente las funciones que corrieron cuando se pagó.
 */
export function elementosComputados(crudo, archivo = 'desconocido') {
  const lam = validarLamina(crudo, { archivo, archivoId: null })
  const c = computarElementos(lam.elementos)
  return { detectados: c.detectados, computados: c.computados }
}

/**
 * LA DESCOMPOSICIÓN COMPLETA sobre un conjunto de lecturas ya pagadas.
 *
 * @param lecturas  `[{ region, crudo }]` tal como quedaron en el caché
 * @param usdTotal  lo que `chat_cost` dice que se pagó por TODAS las llamadas de la ventana
 */
export function descomponer(lecturas = [], { usdTotal = 0, llamadasReales = 0 } = {}) {
  const porTipo = new Map()
  const porCampo = new Map()
  let pesoTotal = 0

  for (const l of lecturas) {
    const { tipo } = subcapacidadDeLectura(l)
    const { pesos, total } = pesoDeCampos(l?.crudo)
    pesoTotal += total
    const t = porTipo.get(tipo) ?? { tipo, n: 0, peso: 0, pesoTexto: 0, pesoDibujo: 0, elementos: 0, elementosComputados: 0 }
    t.n += 1
    t.peso += total
    for (const [campo, p] of Object.entries(pesos)) {
      porCampo.set(campo, (porCampo.get(campo) ?? 0) + p)
      if (origenDeCampo(campo) === 'TEXTO') t.pesoTexto += p
      if (origenDeCampo(campo) === 'DIBUJO') t.pesoDibujo += p
    }
    const c = elementosComputados(l?.crudo, l?.archivo ?? 'desconocido')
    t.elementos += c.detectados
    t.elementosComputados += c.computados
    porTipo.set(tipo, t)
  }

  // El costo se reparte por peso de salida, NO por cantidad de llamadas: una planta con 40
  // elementos y un detalle con 2 no cuestan lo mismo, y repartir por cabeza los igualaría.
  const conCosto = [...porTipo.values()].map((t) => ({
    ...t,
    usd: pesoTotal ? Math.round((usdTotal * t.peso / pesoTotal) * 100) / 100 : 0,
    fraccionTexto: t.peso ? Math.round((t.pesoTexto / t.peso) * 1000) / 10 : null,
  })).sort((a, b) => b.usd - a.usd || b.n - a.n)

  return {
    muestra: lecturas.length,
    llamadasReales: llamadasReales || lecturas.length,
    // Si la muestra no cubre todas las llamadas hay que decirlo: el reparto describe la muestra,
    // no la población, y presentarlo como la población sería exactamente fabricar un dato.
    cobertura: llamadasReales ? Math.round((lecturas.length / llamadasReales) * 1000) / 10 : 100,
    porTipo: conCosto,
    porCampo: [...porCampo.entries()]
      .map(([campo, peso]) => ({ campo, peso, origen: origenDeCampo(campo), pct: pesoTotal ? Math.round((peso / pesoTotal) * 1000) / 10 : 0 }))
      .sort((a, b) => b.peso - a.peso),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ¿HACE FALTA UN MODELO DE VISIÓN PARA ESTO? — LA VERIFICACIÓN CONTRA UNA FUENTE INDEPENDIENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El modelo declara, por elemento, el `evidencia.texto_literal` del que lo sacó. Creerle a eso
// sería validar el control con la información que el propio control produce — el error explícito
// del `CLAUDE.md`. La verificación cruza ese texto contra la CAPA DE TEXTO del PDF, que el modelo
// nunca vio: recibió un PNG rasterizado. Son dos fuentes independientes.
//
// ═══ POR QUÉ HAY UN CONTROL NEGATIVO Y NO ES OPCIONAL ═══
//
// Un plano de obra repite tokens («160», «e», «C1») en todas sus vistas: un emparejamiento laxo da
// «coincide» contra CUALQUIER plano y el número sale alto sin medir nada. Por eso `respaldo` se
// corre siempre también contra un plano AJENO. Medido sobre 3 planos reales: 69–100% contra el
// propio, 0–25% contra el ajeno. Si esa brecha se cierra, la medición dejó de medir — y el test
// que la fija es el que se pone rojo.

/** Texto comparable: sin acentos, sin puntuación, en minúsculas. PURA. */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * QUÉ FRACCIÓN DEL TEXTO DECLARADO APARECE EN LA CAPA DE TEXTO. PURA.
 *
 * `minimoToken` descarta los tokens de una letra: aparecen en cualquier plano y sólo suben el
 * número. Devuelve `null` —no 0— cuando no hay nada que verificar: «no se pudo medir» y «no
 * coincide» son cosas distintas, y confundirlas inventa un dato.
 */
export function respaldo(textoLiteral, capaDeTexto, { minimoToken = 3 } = {}) {
  const objetivo = normalizarTexto(capaDeTexto)
  const toks = normalizarTexto(textoLiteral).split(' ').filter((t) => t.length >= minimoToken)
  if (!toks.length || !objetivo) return null
  return toks.filter((t) => objetivo.includes(t)).length / toks.length
}

/**
 * EL VEREDICTO SOBRE UNA LECTURA ENTERA, con su control negativo al lado.
 *
 * @param lectura     `{ crudo: { elementos: [...] } }`
 * @param capaPropia  la capa de texto del plano del que salió la lectura
 * @param capaAjena   la de OTRO plano. Sin esto el resultado no se puede interpretar.
 */
export function verificarLectura(lectura, capaPropia, capaAjena = null, { umbral = 0.99 } = {}) {
  const els = Array.isArray(lectura?.crudo?.elementos) ? lectura.crudo.elementos : []
  let verificables = 0; let propio = 0; let ajeno = 0
  for (const e of els) {
    const tl = e?.evidencia?.texto_literal
    const r = respaldo(tl, capaPropia)
    if (r == null) continue
    verificables += 1
    if (r >= umbral) propio += 1
    if (capaAjena != null && (respaldo(tl, capaAjena) ?? 0) >= umbral) ajeno += 1
  }
  const tasaPropio = verificables ? propio / verificables : null
  const tasaAjeno = (capaAjena != null && verificables) ? ajeno / verificables : null
  return {
    elementos: els.length,
    verificables,
    tasaPropio,
    tasaAjeno,
    // La brecha es el único número que se puede interpretar solo. Sin control negativo queda
    // `null`: un `tasaPropio` suelto no distingue «el texto está en el plano» de «el emparejamiento
    // le da verde a todo».
    brecha: (tasaPropio != null && tasaAjeno != null) ? tasaPropio - tasaAjeno : null,
  }
}
