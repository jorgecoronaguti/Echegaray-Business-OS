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

// El ordinal masculino «º» (U+00BA) y el grado «°» (U+00B0) se ven igual y se escriben distinto: el
// CIRCOT usa el primero («HºAº p/bases») y los planos el segundo («H°A°»). Sin unificarlos, la misma
// abreviatura de hormigón armado se reconoce en un documento y no en el otro — medido: «HºAº
// p/bases» salía SIN material y por eso no matcheaba contra «base de hormigón armado».
const limpio = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u00ba/g, '\u00b0')

/** La raíz de una palabra: sólo se le saca la «s» final. Es la diferencia entre que «BASES
 *  AISLADAS» matchee con «base de hormigón armado» y que no matchee con NADA — medido sobre el
 *  catálogo real, donde la Base Maestra escribe los rubros en plural y los planos en singular.
 *  No se hace nada más agresivo a propósito: un stemmer que corta de más junta «revoque» con
 *  «revestimiento», y ahí el control empieza a mentir. PURA. */
export const raiz = (w) => (String(w).length >= 5 && String(w).endsWith('s') ? String(w).slice(0, -1) : String(w))

/**
 * UN NÚMERO DE PLANO A Number. PURA.
 *
 * ═══ EL DEFECTO QUE ESTA FUNCIÓN TUVO Y QUE COSTABA DIMENSIONES ═══
 *
 * Tratar el punto SIEMPRE como separador de miles —que es la convención argentina para dinero—
 * convertía «0.40» en 40 y «3.2» en 32. Medido sobre Quattropani: la columna C1, cuya sección real
 * es 0,40 × 0,20 m, salía con sección «40x20», y el caño de 3,2 mm salía con 32 mm de espesor. Un
 * plano no escribe plata: escribe medidas, y en una medida el punto es decimal.
 *
 * La coma sigue siendo decimal —«0,30» es 0,30— y cuando hay coma los puntos SÍ son miles, que es
 * el único caso en que las dos convenciones conviven sin ambigüedad.
 */
export function numeroAr(t) {
  const s = String(t ?? '').trim()
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

/** Lo que precede a una medida y la convierte en OTRA COSA: un espaciado de armadura, no un
 *  espesor. «Estr. Ø8c/15cm» dice que los estribos van cada 15 cm — leerlo como espesor le puso
 *  0,15 m de espesor a la columna C1 de Quattropani, que mide 0,40 × 0,20. Medido. */
const ES_ESPACIADO = /(?:c\s*[/\\]|@|cada)\s*$/

/**
 * EL ESPESOR EN METROS. Acepta las formas en que se escribe en este rubro:
 * «e = 0,10 m» · «e=0.05m» · «12,5 mm» · «- 50CM» · «esp.=18 cm». PURA.
 */
export function espesorDe(texto) {
  const t = limpio(texto)
  const conE = t.match(/\b(?:e|esp\.?|espesor)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(m|cm|mm)?\b/)
  if (conE) return leido(aMetros(numeroAr(conE[1]), conE[2] ?? 'm'), conE[0].trim())
  const suelto = /(?:^|[^\dx.,])(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/g
  for (const m of t.matchAll(suelto)) {
    if (ES_ESPACIADO.test(t.slice(0, m.index + m[0].indexOf(m[1])))) continue
    return leido(aMetros(numeroAr(m[1]), m[2]), m[0].trim())
  }
  return null
}

/** Un valor + su unidad → metros. PURA. */
export function aMetros(valor, unidad) {
  if (valor === null) return null
  const u = String(unidad ?? 'm').toLowerCase()
  // Sin redondear: un caño de 3,2 mm son 0,0032 m, y redondear el milímetro lo vuelve 0,003 —
  // que es otro caño.
  if (u === 'mm') return Math.round(valor * 1000) / 1e6
  if (u === 'cm') return Math.round(valor * 1000) / 100000
  return valor
}

/** La resistencia del hormigón: H8, H13, H17, H21, H25, H30. PURA. */
export function resistenciaDe(texto) {
  const m = limpio(texto).match(/\bh\s?-?\s?(8|13|17|21|25|30|35|40)\b/)
  return m ? leido(`H${m[1]}` , m[0].trim()) : null
}

/** La sección o el formato: «30-50», «30x50», «20x20x40», «8x18x30». PURA. */
export function seccionDe(texto) {
  // El cierre es `(?!\d)` y no `\b`: «120x50x50cm» lleva la unidad pegada, y con `\b` la expresión
  // no cierra en ninguna combinación y la sección se pierde entera.
  const m = limpio(texto).match(/\b(\d+(?:[.,]\d+)?)\s*[x\-]\s*(\d+(?:[.,]\d+)?)(?:\s*[x\-]\s*(\d+(?:[.,]\d+)?))?(?!\d)/)
  if (!m) return null
  const partes = [m[1], m[2], m[3]].filter(Boolean).map(numeroAr)
  return leido(partes.join('x'), m[0].trim())
}

/** Familias de material. El orden importa: la primera que aparece manda, y las más específicas van
 *  antes que las genéricas para que «hormigón ciclópeo» no salga como «hormigón armado». */
const MATERIALES = Object.freeze([
  // El límite final NO puede ser `\b`: después de «°» no hay transición de palabra y la abreviatura
  // queda sin reconocer. Va un lookahead negativo de letra, que es lo que se quiere decir.
  ['hormigon_ciclopeo', /(?<![a-z])h\s?°?\s?c\s?°?(?![a-z])|ciclopeo/],
  ['hormigon_pobre', /(?:hormigon|h\s?°?)\s*de\s+limpieza|hormigon\s+pobre/],
  ['hormigon_armado', /(?<![a-z])h\s?°?\s?a\s?°?(?![a-z])|hormigon\s+armado|\bh(?:17|21|25|30)\b/],
  ['hormigon_simple', /hormigon\s+simple|(?<![a-z])h\s?°?\s?s\s?°?(?![a-z])/],
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
  // El genérico va ÚLTIMO: «PLATEA DE HORMIGON» no dice armado, simple ni ciclópeo, y forzarlo a
  // una de las tres sería afirmar algo que el nombre no dice. Pero decir «hormigón» ya alcanza para
  // que una correa metálica no entre ahí, que es lo que este atributo tiene que impedir.
  ['hormigon', /hormigon/],
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

/**
 * EL TIPO DE PIEZA. Es el atributo que impide el error más caro medido en este circuito.
 *
 * ═══ POR QUÉ EXISTE ═══
 *
 * Sin él, la corrida sobre Quattropani manda SIETE piezas metálicas distintas —la cercha, la viga
 * 2C200, las correas C140, las correas KL, el perfil 2K1, el cordón CM1 y la columna CMe— a una
 * sola partida: «T1110 CERCHA P/TECHO METALICO», 300,82 ml, $ 22,9 M. Todas comparten el vocabulario
 * del acero, todas son `metalico`, ninguna contradice a otra en espesor ni en método… y ninguna más
 * es una cercha. Lo mismo con las columnas C1 y C2, que caían en «LOSA DE HORMIGON ARMADO».
 *
 * El material dice DE QUÉ está hecha la pieza; la pieza dice QUÉ ES. Son dos preguntas distintas y
 * la segunda es la que separa las partidas.
 *
 * ═══ EL ORDEN ES LA REGLA ═══
 *
 * El tipo de pieza es el SUSTANTIVO, no el lugar donde está. «Base de escalera» es una base y
 * «losa de escalera» es una losa: por eso los sustantivos estructurales van ANTES que las palabras
 * de ubicación, y con el orden al revés las dos serían «escalera» y se confundirían entre sí.
 */
const PIEZAS = Object.freeze([
  ['cercha', /cercha|cabriada|reticulad/],
  ['correa', /\bcorrea/],
  ['tensor', /tensor|riostra|cruces?\s+de\s+san\s+andres|arriostr/],
  ['cimiento', /cimiento/],
  ['platea', /platea/],
  ['base', /\bbase|zapata|cabezal|pilote|muerto/],
  ['losa', /\blosa/],
  ['columna', /columna|pilar\b/],
  ['viga', /\bviga|dintel|encadenado/],
  ['tabique', /tabique/],
  ['muro', /\bmuro|mamposter|medianera|panderete/],
  ['contrapiso', /contrapiso/],
  ['piso', /\bpiso\b|solado|carpeta|pavimento/],
  ['entrepiso', /entrepiso/],
  ['techo', /techo|cubierta/],
  ['panel', /panel/],
  ['canaleta', /canaleta|cenefa|babeta|desague/],
  ['escalera', /escalera|peldano/],
  ['tanque', /\btanque/],
  ['persiana', /persiana|cortina\s+metalica/],
  ['abertura', /porton|puerta|ventana|banderola|carpinteria/],
  ['revoque', /revoque|revestimiento|enlucido|jaharro|azotado/],
  ['cielorraso', /cielorraso/],
  ['instalacion', /instalacion|electrica|sanitaria|incendio|\bgas\b/],
  ['movimiento_suelo', /excavacion|desmonte|terraplen|\brelleno\b|compactacion/],
])

/** Qué pieza es. PURA. */
export function piezaDe(texto) {
  const t = limpio(texto)
  for (const [nombre, re] of PIEZAS) {
    const m = t.match(re)
    if (m) return leido(nombre, m[0].trim())
  }
  return null
}

/** Los nueve atributos de un texto técnico, cada uno con su literal. PURA. */
export function atributosDe(...textos) {
  const t = textos.filter(Boolean).join(' · ')
  return Object.freeze({
    pieza: piezaDe(t),
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
  // El genérico nunca contradice a su específico: «hormigón» y «hormigón armado» son el mismo hecho
  // constructivo dicho con distinta precisión, y tratarlos como conflicto descarta la partida buena.
  ['hormigon', 'hormigon_armado'], ['hormigon', 'hormigon_simple'], ['hormigon', 'hormigon_ciclopeo'],
  ['hormigon', 'hormigon_pobre'], ['hormigon', 'cemento'],
])

/** Piezas que no se contradicen: son la misma cosa nombrada por el conjunto o por su componente.
 *  Un «techo metálico con panel autoportante» y un «panel térmico de cubierta» son el mismo cierre. */
const PIEZAS_COMPATIBLES = Object.freeze([['techo', 'panel'], ['muro', 'tabique'], ['piso', 'contrapiso']])

const mismoPar = (tabla, a, b) => a === b || tabla.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
const mismoMaterial = (a, b) => mismoPar(COMPATIBLES, a, b)

/** ¿Dos espesores son el mismo? Tolerancia de 5 mm: un «e=0,10» y un «10 cm» son lo mismo, un
 *  «0,10» y un «0,50» no. PURA. */
const mismoEspesor = (a, b) => Math.abs(a - b) <= 0.005

/**
 * LOS ATRIBUTOS QUE BLOQUEAN UNA CONFIRMACIÓN cuando la partida los exige y el elemento no los
 * demuestra. Son los que afirman un HECHO CONSTRUCTIVO MEDIBLE que tiene que estar en el proyecto:
 * cuánto mide, de qué resistencia, con qué método, con qué terminación, dónde y con qué armadura.
 * Ante cualquiera de ésos, la respuesta correcta es la pregunta.
 *
 * `material`, `resistencia` y `armadura` quedan AFUERA, y la razón es de ingeniería y está medida.
 * El nombre de una partida de la Base Maestra lleva la especificación de NUESTRO análisis —«COLUMNA
 * DE CARGA H17 - FE 190 KG/M3», «BASES AISLADAS con #8 c/15»—, no un requisito que el proyecto tenga
 * que declarar. Exigir que el plano diga «H17» para poder usar nuestra propia columna estándar dejó
 * a TODAS las columnas y TODAS las bases de Quattropani sin partida. Si el plano SÍ dice H21, eso
 * es un conflicto y la partida se cae: discriminan, no bloquean.
 *
 * Lo que sí bloquea es lo que la partida AFIRMA sobre la obra y el proyecto no respalda: una
 * dimensión, una sección, un método, una terminación o una ubicación. Ahí la respuesta correcta es
 * la pregunta —y ése es exactamente el caso de la platea de 50 cm—.
 */
export const BLOQUEAN = Object.freeze(['pieza', 'espesor_m', 'seccion', 'metodo', 'terminacion', 'ubicacion'])

/**
 * COMPARAR LOS ATRIBUTOS DE UN ELEMENTO CONTRA LOS DE UNA PARTIDA. PURA.
 *
 * Devuelve tres cosas distintas que NO hay que confundir:
 *  · `conflictos`  — los dos lo declaran y no coinciden. La partida no es ésta: se descarta.
 *  · `sinRespaldo` — la partida exige un atributo de `BLOQUEAN` que el elemento no demuestra. NO se
 *                    descarta la partida: se bloquea la confirmación, porque la respuesta correcta
 *                    es una pregunta.
 *  · `noDeclarados` — la partida lo dice y el elemento no, pero no bloquea (hoy, sólo el material).
 *  · `coincidencias` — los dos lo declaran y coinciden. Es lo único que suma puntaje.
 */
export function comparar(delElemento, deLaPartida) {
  const conflictos = []
  const sinRespaldo = []
  const noDeclarados = []
  const coincidencias = []
  for (const clave of Object.keys(deLaPartida ?? {})) {
    const p = deLaPartida[clave]
    const e = delElemento?.[clave]
    if (!p) continue
    if (!e) {
      if (BLOQUEAN.includes(clave)) sinRespaldo.push({ atributo: clave, exige: p.valor, literal: p.literal })
      else noDeclarados.push({ atributo: clave, exige: p.valor, literal: p.literal })
      continue
    }
    const igual = clave === 'espesor_m' ? mismoEspesor(e.valor, p.valor)
      : clave === 'material' ? mismoMaterial(e.valor, p.valor)
        : clave === 'pieza' ? mismoPar(PIEZAS_COMPATIBLES, e.valor, p.valor)
          : String(e.valor) === String(p.valor)
    if (igual) coincidencias.push({ atributo: clave, valor: p.valor })
    else conflictos.push({ atributo: clave, elemento: e.valor, partida: p.valor, literalElemento: e.literal, literalPartida: p.literal })
  }
  return { conflictos, sinRespaldo, noDeclarados, coincidencias }
}
