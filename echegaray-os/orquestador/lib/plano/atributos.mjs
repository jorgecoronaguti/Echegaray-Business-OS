// LOS ATRIBUTOS TÉCNICOS QUE CAMBIAN EL PRECIO. Puro, determinístico, sin modelo.
//
// ═══ LA GENERALIZACIÓN DE LA PLATEA DE 50 CM ═══
//
// `partidas.espesorSinRespaldo` resolvió UN caso: la partida decía «PLATEA DE HORMIGON - 50CM», el
// plano decía «Platea s/Calculo», y la diferencia entre las dos afirmaciones eran $ 29,6 M de
// hormigón que nadie había pedido. Se arregló mirando si el nombre de la partida traía un número.
//
// Pero el espesor no es el único atributo que hace eso. «H°A° p/vigas resistentes» y «H°A° p/vigas
// de encadenado» comparten cada palabra que un puntaje de vocabulario sabe medir y tienen precios
// distintos porque son elementos distintos. «Mampostería 0,30 visto» y «Mampostería 0,30 a revocar»
// se separan sólo por la terminación. «Excavación a mano» y «excavación con máquina» se separan por
// el método. Un revoque interior y uno exterior no cuestan lo mismo. Ninguna de esas distinciones
// la ve el texto: las ve la ingeniería.
//
// Por eso acá el atributo se EXTRAE del texto con reglas legibles y después se COMPARA. Y la regla
// dura es una sola, la misma que salvó la platea:
//
//   **SI LA PARTIDA EXIGE UN ATRIBUTO QUE EL ELEMENTO NO DEMUESTRA, NO SE CONFIRMA.**
//
// No se elige el más probable, no se toma el más barato, no se promedia: se pregunta.

/** Un atributo leído, con el texto literal que lo sostiene. `null` cuando no está — y `null` no es
 *  cero, es una pregunta abierta. */
const leido = (valor, literal) => (valor === null || valor === undefined ? null : Object.freeze({ valor, literal: String(literal) }))

const limpio = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Un número argentino («0,30», «12.5», «0.10») a Number. PURA. */
export function numeroAr(t) {
  const s = String(t ?? '').trim().replace(/\./g, '#').replace(/,/g, '.').replace(/#/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * EL ESPESOR EN METROS. Acepta las cuatro formas en que se escribe en este rubro:
 * «e = 0,10 m» · «e=0.05m» · «12,5 mm» · «- 50CM» · «esp.=18 cm». PURA.
 */
export function espesorDe(texto) {
  const t = limpio(texto)
  const conE = t.match(/\b(?:e|esp\.?|espesor)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(m|cm|mm)?\b/)
  if (conE) return leido(aMetros(numeroAr(conE[1]), conE[2] ?? 'm'), conE[0].trim())
  const suelto = t.match(/(?:^|[^\dx.,])(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/)
  if (suelto) return leido(aMetros(numeroAr(suelto[1]), suelto[2]), suelto[0].trim())
  return null
}

/** Un valor + su unidad → metros. PURA. */
export function aMetros(valor, unidad) {
  if (valor === null) return null
  const u = String(unidad ?? 'm').toLowerCase()
  if (u === 'mm') return Math.round(valor) / 1000
  if (u === 'cm') return valor / 100
  return valor
}

/** La resistencia del hormigón: H8, H13, H17, H21, H25, H30. PURA. */
export function resistenciaDe(texto) {
  const m = limpio(texto).match(/\bh\s?-?\s?(8|13|17|21|25|30|35|40)\b/)
  return m ? leido(`H${m[1]}` , m[0].trim()) : null
}

/** La sección o el formato: «30-50», «30x50», «20x20x40», «8x18x30». PURA. */
export function seccionDe(texto) {
  const m = limpio(texto).match(/\b(\d+(?:[.,]\d+)?)\s*[x\-]\s*(\d+(?:[.,]\d+)?)(?:\s*[x\-]\s*(\d+(?:[.,]\d+)?))?\b/)
  if (!m) return null
  const partes = [m[1], m[2], m[3]].filter(Boolean).map(numeroAr)
  return leido(partes.join('x'), m[0].trim())
}

/** Familias de material. El orden importa: la primera que aparece manda, y las más específicas van
 *  antes que las genéricas para que «hormigón ciclópeo» no salga como «hormigón armado». */
const MATERIALES = Object.freeze([
  ['hormigon_ciclopeo', /\bh(?:ormigon)?\s?°?\s?c(?:iclopeo)?°?\b|ciclopeo/],
  ['hormigon_pobre', /\bh(?:ormigon)?\s?°?\s?de\s+limpieza|hormigon\s+pobre/],
  ['hormigon_armado', /\bh\s?°?\s?a\s?°?\b|hormigon\s+armado|\bh(?:17|21|25|30)\b/],
  ['hormigon_simple', /hormigon\s+simple|\bh\s?°?\s?s\s?°?\b/],
  ['acero', /\bacero\b|\bhierro\b|adn\s?420|\bmalla\b/],
  ['metalico', /metalic[ao]|\bchapa\b|perfil|cercha|correa|reticulad[ao]|\bcano\b|tubo\s+estructural/],
  ['ladrillo_ceramico', /ladrillo\s+ceramico|ceramico\s+portante|\bceramico\s+\d/],
  ['ladrillon', /ladrillon/],
  ['ladrillo_comun', /ladrillo\s+comun/],
  ['bloque_hormigon', /bloque[s]?\s+de\s+h|bloque\s+\d+[x,]/],
  ['placa_yeso', /durlock|placa\s+de\s+yeso|yeso\s+12|roca\s+de\s+yeso/],
  ['yeso', /\byeso\b/],
  ['cal', /\ba\s+la\s+cal\b|\bcal\b/],
  ['cemento', /\bcemento\b/],
  ['ceramico', /\bceramic[ao]s?\b|calcareo/],
  ['madera', /\bmadera\b|tiranteria/],
  ['aluminio', /\baluminio\b/],
  ['pvc', /\bpvc\b/],
])

/** La familia de material. PURA. */
export function materialDe(texto) {
  const t = limpio(texto)
  for (const [nombre, re] of MATERIALES) {
    const m = t.match(re)
    if (m) return leido(nombre, m[0].trim())
  }
  return null
}

/** El método de ejecución, que cambia el rendimiento y la cuadrilla entera. PURA. */
export function metodoDe(texto) {
  const t = limpio(texto)
  const m = t.match(/\ba\s+mano\b|\bmanual\b|c(?:on)?\/?\s*maquina|mecanic[ao]|c\/molinete|premoldead[ao]|pretensad[ao]|in\s?situ/)
  if (!m) return null
  const v = m[0]
  if (/mano|manual|molinete/.test(v)) return leido('manual', v)
  if (/maquina|mecanic/.test(v)) return leido('mecanico', v)
  if (/premoldead/.test(v)) return leido('premoldeado', v)
  if (/pretensad/.test(v)) return leido('pretensado', v)
  return leido('in_situ', v)
}

/** Interior o exterior: cambia andamios, terminación y rendimiento. PURA. */
export function ubicacionDe(texto) {
  const m = limpio(texto).match(/\bexterior(?:es)?\b|\binterior(?:es)?\b|\bbajo\s+muro\b|\benterrad[ao]\b/)
  if (!m) return null
  if (/exterior/.test(m[0])) return leido('exterior', m[0])
  if (/enterrad|bajo\s+muro/.test(m[0])) return leido('enterrado', m[0])
  return leido('interior', m[0])
}

/** La terminación pedida: separa «visto» de «a revocar» y «grueso» de «enlucido». PURA. */
export function terminacionDe(texto) {
  const m = limpio(texto).match(/\bvist[ao]\b|a\s+revocar|revocad[ao]|\benlucido\b|\bgrueso\b|\bjaharro\b|azotado|fratasad[ao]|alisad[ao]|\bbolseado\b|estucad[ao]|junta\s+sellada/)
  if (!m) return null
  const v = m[0]
  if (/vist/.test(v)) return leido('visto', v)
  if (/a\s+revocar/.test(v)) return leido('a_revocar', v)
  return leido(v.replace(/\s+/g, '_'), v)
}

/** ¿Lleva armadura declarada? Una mampostería armada y una sin armar no cuestan lo mismo. PURA. */
export function armaduraDe(texto) {
  const m = limpio(texto).match(/\barmad[ao]\b|#\s?\d|\bmalla\b|estribos?|adn\s?420|[\u00f8\u00d8\u2300]\s?\d+/)
  return m ? leido(true, m[0].trim()) : null
}

/** Los ocho atributos de un texto técnico, cada uno con su literal. PURA. */
export function atributosDe(...textos) {
  const t = textos.filter(Boolean).join(' · ')
  return Object.freeze({
    material: materialDe(t),
    espesor_m: espesorDe(t),
    resistencia: resistenciaDe(t),
    seccion: seccionDe(t),
    metodo: metodoDe(t),
    ubicacion: ubicacionDe(t),
    terminacion: terminacionDe(t),
    armadura: armaduraDe(t),
  })
}

/** Materiales que NO se contradicen aunque tengan nombre distinto: son el mismo hecho constructivo
 *  descrito con distinta precisión. Fuera de estos pares, dos materiales distintos son un conflicto. */
const COMPATIBLES = Object.freeze([
  ['hormigon_armado', 'acero'], ['hormigon_armado', 'hormigon_simple'], ['hormigon_armado', 'cemento'],
  ['metalico', 'acero'], ['ceramico', 'ladrillo_ceramico'], ['cal', 'cemento'], ['yeso', 'placa_yeso'],
])

const mismoMaterial = (a, b) => a === b || COMPATIBLES.some(([x, y]) => (a === x && b === y) || (a === y && b === x))

/** ¿Dos espesores son el mismo? Tolerancia de 5 mm: un «e=0,10» y un «10 cm» son lo mismo, un
 *  «0,10» y un «0,50» no. PURA. */
const mismoEspesor = (a, b) => Math.abs(a - b) <= 0.005

/**
 * COMPARAR LOS ATRIBUTOS DE UN ELEMENTO CONTRA LOS DE UNA PARTIDA. PURA.
 *
 * Devuelve tres cosas distintas que NO hay que confundir:
 *  · `conflictos`  — los dos lo declaran y no coinciden. La partida no es ésta: se descarta.
 *  · `sinRespaldo` — la partida lo exige y el elemento no lo demuestra. NO se descarta la partida:
 *                    se bloquea la confirmación, porque la respuesta correcta es una pregunta.
 *  · `coincidencias` — los dos lo declaran y coinciden. Es lo único que suma puntaje.
 */
export function comparar(delElemento, deLaPartida) {
  const conflictos = []
  const sinRespaldo = []
  const coincidencias = []
  for (const clave of Object.keys(deLaPartida ?? {})) {
    const p = deLaPartida[clave]
    const e = delElemento?.[clave]
    if (!p) continue
    if (!e) { sinRespaldo.push({ atributo: clave, exige: p.valor, literal: p.literal }); continue }
    const igual = clave === 'espesor_m' ? mismoEspesor(e.valor, p.valor)
      : clave === 'material' ? mismoMaterial(e.valor, p.valor)
        : String(e.valor) === String(p.valor)
    if (igual) coincidencias.push({ atributo: clave, valor: p.valor })
    else conflictos.push({ atributo: clave, elemento: e.valor, partida: p.valor, literalElemento: e.literal, literalPartida: p.literal })
  }
  return { conflictos, sinRespaldo, coincidencias }
}
