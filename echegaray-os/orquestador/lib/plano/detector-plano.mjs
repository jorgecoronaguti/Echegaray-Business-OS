// UN PLANO ADJUNTO ARRANCA EL COTIZADOR — SIN FRASE MÁGICA.
//
// El defecto que esto revierte (dueño, 02/09/2026, log vivo): «procesá esto» + «Estructura San
// Francisco del Monte Entrepiso.pdf» terminó en la ingesta genérica, que le devolvió la extracción
// cruda del PDF. El arranque dependía de que la FRASE tuviera afinidad con el cotizador; si lo
// adjuntado ES un plano de obra, el destino natural es el cotizador diga lo que diga la frase.
//
// La clasificación es del ARCHIVO como tipo de documento (nombre + señales de plano en el texto
// extraído) — no de instrucciones de adentro: el contenido sigue siendo DATO y no rutea a ninguna
// otra capacidad. Y la frase sigue mandando: si nombró otra capacidad con afinidad real, esa gana
// antes de llegar acá. PURO: sin red, sin base.

/** Lo que un plano NO es, gane lo que gane el resto del nombre: papeles administrativos. */
// «costos» y «cómputo» entran acá y no en las señales de plano: «Estructura de costos.pdf» tiene
// la palabra ESTRUCTURA y se elevaba a plano_general — un papel de plata saliendo a visión paga.
const RE_NO_PLANO = /factura|recibo|extracto|resumen\s+de|presupuesto|cotizaci[oó]n|c[oó]mputos?|costos?|contrato|pliego|remito|orden\s+de\s+(compra|pago)|liquidaci|n[oó]mina|sueldo|constancia|comprobante/i

/** Señales de plano en el NOMBRE del archivo. */
const RE_NOMBRE_PLANO = /plano|estructur|arquitect[oó]nic|arquitectura|fundaci|cimient|entrepiso|l[aá]mina|replanteo|municipal/i

/** Señales de plano en el TEXTO extraído: vocabulario de lámina, no de carta. */
const SENALES_TEXTO = [
  /escala\s*1\s*:\s*\d/i,
  /\bcotas?\b/i,
  /hormig[oó]n|h-?\s*(17|21|25|30)/i,
  /\bplanta\s+(alta|baja|de|estructural)/i,
  /\bcorte\s+[a-z]\b/i,
  /\bviga|columna|zapata|platea|encadenad/i,
  /\bh\s*=\s*\d/i,
  /an[aá]lisis\s+de\s+cargas|sobrecarga/i,
  /\bejes?\s+\d|\beje\s+[a-z]\b/i,
]

/** ¿Este adjunto es un plano de obra? Nombre manda; el texto corrobora cuando el nombre calla. */
export function esPlanoAdjunto({ nombre = '', texto = '' } = {}) {
  const n = String(nombre ?? '')
  if (RE_NO_PLANO.test(n)) return false
  if (RE_NOMBRE_PLANO.test(n)) return true
  const t = String(texto ?? '').slice(0, 20_000)
  return SENALES_TEXTO.filter((re) => re.test(t)).length >= 3
}

/** Palabras del rubro que NO son la obra: se quitan y lo que queda es el candidato. */
const RE_RUIDO = /^(planos?|estructuras?|estructural(es)?|arquitectura|arquitect[oó]nic[oa]s?|fundaci[oó]n(es)?|cimientos?|entrepisos?|plantas?|alta|baja|techos?|cortes?|municipal(es)?|replanteo|instalaci[oó]n(es)?|el[eé]ctrica|sanitaria|obra|l[aá]minas?|hoja|detalle s?|rev\w*|v\d+|versi[oó]n|final|copia|nuevo|nueva|\d+([.,]\d+)?)$/i

// Preposiciones que se recortan en los BORDES («Plano de …»). Los artículos NO: «La Estrella»,
// «El Molino» son el nombre — recortarles el artículo es mutilar la obra.
const RE_BORDE = /^(de|del|y|para|en)$/i
const RE_CONECTOR = /^(de|del|la|el|los|las|y|para|en)$/i

/**
 * La obra que el NOMBRE del archivo declara: «Estructura San Francisco del Monte Entrepiso.pdf»
 * → «San Francisco del Monte». Es una INFERENCIA y quien la use debe declararla como tal; cuando
 * no queda nada con sustancia («Plano de Estructura.pdf») se devuelve null — se pregunta, no se
 * adivina.
 */
export function obraDeNombreDeArchivo(nombre = '') {
  const base = String(nombre ?? '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_·.,()[\]]+/g, ' ')
  const tokens = base.split(/\s+/).filter(Boolean).filter((t) => !RE_RUIDO.test(t))
  while (tokens.length && RE_BORDE.test(tokens[0])) tokens.shift()
  while (tokens.length && RE_BORDE.test(tokens[tokens.length - 1])) tokens.pop()
  const conSustancia = tokens.filter((t) => !RE_CONECTOR.test(t))
  const candidato = tokens.join(' ').trim()
  return conSustancia.length && candidato.length >= 3 ? candidato : null
}
