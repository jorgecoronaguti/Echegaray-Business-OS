// UNIDADES FUERTES — la diferencia entre 520 metros cuadrados y 520 millones de pesos.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ═══
//
// Un parser de cantidades que trata los sufijos de magnitud («M» = millones, «K» = miles) antes de
// resolver la unidad lee «520 m²» como 520 millones, y «8,5 m» como 8,5 millones. Los dos textos
// aparecen en la misma conversación con el dueño: «la mampostería son 520 m2» y «la sanitaria
// 8,5M». El primero es una superficie y el segundo, si es plata, es cuatro órdenes de magnitud más
// grande que la superficie. Un solo error de éstos cotiza una obra entera mal.
//
// La regla que lo resuelve es de ORDEN, no de heurística:
//
//   0. ¿El sufijo COLISIONA —es unidad Y multiplicador a la vez, como `m` y `mm`—? Sin contexto
//      declarado, AMBIGUO con las dos lecturas escritas. No se resuelve por la mayúscula.
//   1. Se busca una UNIDAD conocida detrás del número. `m2`, `m²`, `ml`, `kg`, `hs`… En cuanto la
//      unidad tiene más que la letra sola no hay duda, el número es una MAGNITUD y no hay ningún
//      multiplicador que aplicar. Fin.
//   2. Si NO hay unidad y hay sufijo de magnitud, el multiplicador se aplica SÓLO en contexto
//      monetario DECLARADO —por quien llama, o por el `$` que escribió el que mandó el texto—. Sin
//      ese contexto sale AMBIGUO con las dos lecturas a la vista, que es lo que §19 pide para «la
//      sanitaria 8,5M»: una pregunta dirigida, no un supuesto de subcontrato.
//
// ═══ NORMALIZAR SIN DESTRUIR EL ORIGINAL (§7) ═══
//
// Toda salida lleva `original`: el texto tal cual lo escribieron. Cuando dentro de tres meses
// alguien pregunte «¿de dónde salieron los 520?», la respuesta es el texto, no la interpretación.
//
// ═══ NO SE CONVIERTE EN SILENCIO ═══
//
// `convertir` sólo opera DENTRO de una dimensión y con un factor declarado. m² a m³ no es una
// conversión difícil: es una conversión que no existe, y devuelve ERROR. Multiplicar m³ por un
// precio por m² da un número con formato de plata y sin significado — es el mismo filtro duro que
// `plano/partidas.mjs` ya aplica al elegir la partida, escrito acá para el resto del circuito.

import { ESTADO } from './contrato.mjs'

/** Las dimensiones físicas que un presupuesto de obra distingue. `CONTEO` y `MONEDA` no son
 *  dimensiones físicas y están igual: lo que importa es que no se mezclen con las que sí lo son. */
export const DIMENSION = Object.freeze({
  LONGITUD: 'LONGITUD',
  SUPERFICIE: 'SUPERFICIE',
  VOLUMEN: 'VOLUMEN',
  CAPACIDAD: 'CAPACIDAD',   // litros — volumen de fluido, que en obra NO se computa como m³
  MASA: 'MASA',
  CONTEO: 'CONTEO',
  TIEMPO_TRABAJO: 'TIEMPO_TRABAJO',
  MONEDA: 'MONEDA',
})

/**
 * LAS UNIDADES QUE EL COTIZADOR CONOCE, con su dimensión y su factor a la unidad base de esa
 * dimensión. Las escrituras son las que aparecen en los planos, en la Base Maestra y en los
 * mensajes del dueño — `M3` de la planilla, `m³` del plano, `m3` del chat.
 *
 * `l` (litros) tiene dimensión propia a propósito: 1000 l son 1 m³ en física, y en un presupuesto
 * de obra un tanque de 600 litros y 0,6 m³ de hormigón no son intercambiables ni por accidente.
 * Convertir entre las dos exige que alguien lo pida explícitamente, y hoy nadie lo pide.
 */
export const UNIDADES = Object.freeze({
  m:   { dimension: DIMENSION.LONGITUD, factor: 1, base: 'm' },
  ml:  { dimension: DIMENSION.LONGITUD, factor: 1, base: 'm' },
  cm:  { dimension: DIMENSION.LONGITUD, factor: 0.01, base: 'm' },
  mm:  { dimension: DIMENSION.LONGITUD, factor: 0.001, base: 'm' },
  km:  { dimension: DIMENSION.LONGITUD, factor: 1000, base: 'm' },
  m2:  { dimension: DIMENSION.SUPERFICIE, factor: 1, base: 'm2' },
  ha:  { dimension: DIMENSION.SUPERFICIE, factor: 10000, base: 'm2' },
  m3:  { dimension: DIMENSION.VOLUMEN, factor: 1, base: 'm3' },
  l:   { dimension: DIMENSION.CAPACIDAD, factor: 1, base: 'l' },
  kg:  { dimension: DIMENSION.MASA, factor: 1, base: 'kg' },
  t:   { dimension: DIMENSION.MASA, factor: 1000, base: 'kg' },
  g:   { dimension: DIMENSION.MASA, factor: 0.001, base: 'kg' },
  un:  { dimension: DIMENSION.CONTEO, factor: 1, base: 'un' },
  hs:  { dimension: DIMENSION.TIEMPO_TRABAJO, factor: 1, base: 'hs' },
  dia: { dimension: DIMENSION.TIEMPO_TRABAJO, factor: null, base: 'hs' },
  ARS: { dimension: DIMENSION.MONEDA, factor: 1, base: 'ARS' },
  USD: { dimension: DIMENSION.MONEDA, factor: null, base: 'USD' },
})

/**
 * CÓMO SE ESCRIBE CADA UNIDAD EN EL MUNDO REAL → cuál es su forma canónica.
 *
 * `dia` NO tiene factor a horas y eso es a propósito: un día de obra son 8,8 h o 9 h según la
 * jornada, y ese número lo decide `jornada-config`, no una tabla de unidades. Poner un 8 acá sería
 * meter una decisión de negocio en un diccionario.
 */
const ESCRITURAS = Object.freeze({
  m: 'm', mts: 'm', mt: 'm', metro: 'm', metros: 'm',
  ml: 'ml', mlineal: 'ml', 'm.l.': 'ml', mlineales: 'ml',
  cm: 'cm', mm: 'mm', km: 'km',
  m2: 'm2', 'm²': 'm2', mts2: 'm2', m_2: 'm2', metrocuadrado: 'm2', metroscuadrados: 'm2',
  ha: 'ha', hectarea: 'ha', hectareas: 'ha',
  m3: 'm3', 'm³': 'm3', mts3: 'm3', metrocubico: 'm3', metroscubicos: 'm3',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  t: 't', tn: 't', ton: 't', tonelada: 't', toneladas: 't',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  un: 'un', u: 'un', uni: 'un', unidad: 'un', unidades: 'un', gl: 'un', c: 'un',
  hs: 'hs', h: 'hs', hr: 'hs', hrs: 'hs', hora: 'hs', horas: 'hs', hh: 'hs',
  dia: 'dia', dias: 'dia', jornada: 'dia', jornadas: 'dia',
  ars: 'ARS', $: 'ARS', peso: 'ARS', pesos: 'ARS',
  usd: 'USD', u$s: 'USD', dolar: 'USD', dolares: 'USD',
})

const limpiar = (t) => String(t ?? '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '')

/**
 * DE UN TEXTO DE UNIDAD A LA UNIDAD CANÓNICA. PURA.
 *
 * Devuelve `null` cuando no la conoce — y `null` NO es «sin unidad»: es «no sé qué unidad es esa»,
 * que es un dato distinto y el llamador tiene que tratarlo como tal.
 */
export function normalizarUnidad(texto) {
  const t = limpiar(texto)
  if (!t) return null
  const canonica = ESCRITURAS[t] ?? (UNIDADES[t] ? t : null)
  if (!canonica) return null
  return Object.freeze({ canonica, original: String(texto).trim(), ...UNIDADES[canonica] })
}

/** ¿Dos unidades miden lo mismo? PURA. `ml` y `m` sí; `m2` y `m3` no; `l` y `m3` tampoco (ver el
 *  comentario de `UNIDADES`). */
export function mismaDimension(a, b) {
  const ua = normalizarUnidad(a)
  const ub = normalizarUnidad(b)
  if (!ua || !ub) return false
  return ua.dimension === ub.dimension
}

/**
 * CONVERTIR — sólo dentro de una dimensión y sólo con factor declarado. PURA.
 *
 * Devuelve un resultado con estado: `CALCULADO` si convirtió, `ERROR` si las dimensiones no se
 * tocan, `FALTA_DATO` si la unidad existe pero su factor lo decide otra cosa (`dia`, `USD`). Lo que
 * NO hace, nunca, es devolver un número sin decir que no pudo.
 */
export function convertir(valor, de, a) {
  const ud = normalizarUnidad(de)
  const ua = normalizarUnidad(a)
  if (!ud || !ua) return { valor: null, estado: ESTADO.ERROR, porQue: `no conozco la unidad «${!ud ? de : a}»` }
  if (ud.dimension !== ua.dimension) {
    return {
      valor: null, estado: ESTADO.ERROR,
      porQue: `«${ud.canonica}» mide ${ud.dimension} y «${ua.canonica}» mide ${ua.dimension}: no hay conversión, hay un error de cómputo`,
    }
  }
  if (ud.factor === null || ua.factor === null) {
    return {
      valor: null, estado: ESTADO.FALTA_DATO,
      porQue: ud.dimension === DIMENSION.MONEDA
        ? `pasar de ${ud.canonica} a ${ua.canonica} exige un tipo de cambio con fecha: no es una conversión de unidades`
        : `cuántas horas tiene un día lo decide la jornada de la obra, no una tabla de unidades`,
    }
  }
  if (!Number.isFinite(Number(valor))) return { valor: null, estado: ESTADO.FALTA_DATO, porQue: 'no hay número que convertir' }
  return {
    valor: (Number(valor) * ud.factor) / ua.factor,
    estado: ESTADO.CALCULADO,
    formula: `${valor} ${ud.canonica} × ${ud.factor} ÷ ${ua.factor}`,
  }
}

/**
 * EL FACTOR PARA PASAR UN PRECIO POR UNIDAD DE UNA UNIDAD A OTRA. PURA.
 *
 * ═══ NO ES EL MISMO FACTOR QUE EL DE UNA CANTIDAD, Y CONFUNDIRLOS ES UN ERROR DE ×10⁶ ═══
 *
 * Una tonelada son 1.000 kg, así que una CANTIDAD de 1 t se convierte multiplicando por 1.000. Un
 * PRECIO de $1.615.000 **por tonelada** son $1.615 **por kilo**: se DIVIDE por 1.000. La unidad
 * está en el denominador, y por eso el factor de un precio es el inverso del de una cantidad.
 *
 * Medido acá mismo: usar `convertir()` para un precio por tonelada devolvió $1.615.000.000 el kilo
 * —un millón de veces el valor real— y el número tenía formato de plata, así que a simple vista
 * pasaba. Esta función existe para que esa conversión tenga un solo nombre y un solo lugar.
 *
 * Devuelve `{factor, estado, porQue}` con la misma disciplina de `convertir`: no hay número sin
 * decir que se pudo.
 */
export function factorDePrecio(de, a) {
  // El truco es exacto y no es un truco: cuántas unidades `de` entran en una unidad `a` ES el
  // factor por el que hay que multiplicar el precio. Por eso los argumentos van al revés.
  const c = convertir(1, a, de)
  if (c.estado !== ESTADO.CALCULADO) return { factor: null, estado: c.estado, porQue: c.porQue }
  return { factor: c.valor, estado: ESTADO.CALCULADO, porQue: `1 ${normalizarUnidad(a).canonica} = ${c.valor} ${normalizarUnidad(de).canonica}, así que el precio por ${normalizarUnidad(de).canonica} se multiplica por ${c.valor}` }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL PARSER — donde vive la regla de orden
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Los sufijos de magnitud que la gente escribe hablando de plata. NO se aplican fuera de contexto
 *  monetario: ver el encabezado. */
const MULTIPLICADOR = Object.freeze({ k: 1e3, m: 1e6, mm: 1e6, mill: 1e6, millon: 1e6, millones: 1e6 })

/**
 * LOS DOS TOKENS QUE COLISIONAN, Y POR QUÉ NO SE RESUELVEN CON UNA REGLA DE MAYÚSCULAS.
 *
 * `m` es metros Y es millones. `mm` es milímetros Y es millones. Las dos colisiones son reales y
 * aparecen en la misma conversación: «la viga mide 8,5 m» y «la sanitaria 8,5M».
 *
 * La tentación es resolverlo por la caja de la letra —`M` mayúscula = millones, `m` minúscula =
 * metros— y es exactamente la clase de regla que funciona en el test y falla en el chat: el dueño
 * escribe sin acentos, con typos y con el teclado en mayúsculas cuando le conviene. Una regla que
 * depende de eso convierte un error de tipeo en un error de cuatro órdenes de magnitud.
 *
 * Lo que se hace en cambio: la colisión se DECLARA. Con contexto, se resuelve por el contexto; sin
 * contexto, sale AMBIGUO con las dos lecturas escritas y alguien pregunta. Es más molesto y es la
 * única versión que no puede equivocarse sola.
 */
const COLISIONAN = Object.freeze(['m', 'mm'])

/**
 * UN NÚMERO ESCRITO A LA ARGENTINA → un número. PURA.
 *
 * `8,5` es ocho y medio. `8.500.000` son ocho millones y medio. `1.234,56` es mil doscientos treinta
 * y cuatro con cincuenta y seis. La regla: si hay coma, la coma es el decimal y los puntos son
 * miles; si no hay coma, un punto seguido de exactamente tres dígitos y nada más es separador de
 * miles, y en cualquier otro caso es decimal. Devuelve `null` si no es un número.
 */
export function numeroAR(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '')
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  if (t.includes(',')) {
    const n = Number(t.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const n = /^-?\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * EL NÚMERO PRIMERO, LO DEMÁS DESPUÉS.
 *
 * Un patrón que capturara el sufijo con `[^\s\d]*` partía «520 m2» en unidad `m` y resto `2` —el
 * `2` es un dígito y quedaba afuera del sufijo—, o sea leía METROS donde dice metros cuadrados, que
 * es el error de unidad más caro que puede cometer un cómputo. Acá el número se recorta y TODO lo
 * que sigue es candidato a unidad, dígitos incluidos.
 */
const PATRON = /^\s*(-?[\d.,]*\d)\s*(.*)$/

/**
 * LEER UNA CANTIDAD DE UN TEXTO, con la regla de orden del encabezado. PURA.
 *
 * `contexto` es lo que quien llama SABE del campo, no lo que adivina:
 *   · `'MAGNITUD'`  — es una cantidad de obra; un sufijo de magnitud sin unidad es AMBIGUO.
 *   · `'MONETARIO'` — es plata declarada (el campo es un precio, o el texto trae `$`); ahí y sólo
 *                     ahí «8,5M» son 8.500.000.
 *   · `null`        — no se sabe. Es el default, y el más honesto: sin contexto, un sufijo de
 *                     magnitud sale AMBIGUO con las dos lecturas escritas.
 *
 * Devuelve SIEMPRE `{valor, unidad, dimension, estado, original, porQue, lecturas?}`.
 */
export function leerCantidad(texto, { contexto = null } = {}) {
  const original = String(texto ?? '').trim()
  const salida = (x) => Object.freeze({ valor: null, unidad: null, dimension: null, original, lecturas: null, ...x })
  if (!original) return salida({ estado: ESTADO.FALTA_DATO, porQue: 'no vino ningún texto' })

  // El `$` adelante es contexto monetario DECLARADO por quien escribió, no inferido por nosotros.
  const conSigno = /^(\$|u\$s|us\$)\s*/i.test(original)
  const cuerpo = original.replace(/^(\$|u\$s|us\$)\s*/i, '')
  const monedaDelSigno = /^u\$s|^us\$/i.test(original) ? 'USD' : (conSigno ? 'ARS' : null)
  // Un `$` adelante ES la declaración de contexto monetario, y vale igual que si la hubiera pasado
  // el llamador: quien escribió el texto ya dijo de qué está hablando.
  const ctx = monedaDelSigno ? 'MONETARIO' : contexto

  const m = PATRON.exec(cuerpo)
  if (!m) return salida({ estado: ESTADO.FALTA_DATO, porQue: `«${original}» no empieza con un número` })
  const n = numeroAR(m[1])
  if (n === null) return salida({ estado: ESTADO.FALTA_DATO, porQue: `«${m[1]}» no es un número` })

  // «520 metros cuadrados» son DOS palabras y una sola unidad. Se prueba primero la forma de dos
  // palabras pegadas —`metroscuadrados` está en el diccionario— y después la de una.
  const palabras = (m[2] ?? '').trim().split(/\s+/).filter(Boolean)
  const dos = palabras.slice(0, 2).join('')
  const sufijo = (normalizarUnidad(dos) ? dos : palabras[0]) ?? ''

  // ═══ PASO 0: LA COLISIÓN DECLARADA ═══
  // `m` y `mm` son unidad Y multiplicador. Con contexto se resuelve; sin contexto se pregunta.
  if (COLISIONAN.includes(limpiar(sufijo)) && ctx === null) {
    const mult = MULTIPLICADOR[limpiar(sufijo)]
    const uni = normalizarUnidad(sufijo)
    return salida({
      valor: null, estado: ESTADO.AMBIGUO,
      porQue: `«${original}» puede ser ${n.toLocaleString('es-AR')} ${uni.canonica} o ${(n * mult).toLocaleString('es-AR')} en plata: «${sufijo}» es unidad y es sufijo de magnitud. No se elige por la mayúscula`,
      lecturas: Object.freeze([
        { valor: n, unidad: uni.canonica, dimension: uni.dimension, comoSeLee: `${sufijo} = ${uni.canonica}` },
        { valor: n * mult, unidad: 'ARS', dimension: DIMENSION.MONEDA, comoSeLee: `${sufijo} = millones de pesos` },
      ]),
    })
  }

  // ═══ PASO 1: ¿HAY UNIDAD? Si la hay, no hay multiplicador que aplicar y se termina acá ═══
  // Éste es el paso que impide que «520 m2» sean 520 millones. `m2`, `m3`, `kg`, `hs` no colisionan
  // con ningún multiplicador: en cuanto la unidad tiene más que la letra sola, no hay duda.
  const u = ctx === 'MONETARIO' && COLISIONAN.includes(limpiar(sufijo)) ? null : normalizarUnidad(sufijo)
  if (u) {
    if (monedaDelSigno && u.dimension !== DIMENSION.MONEDA) {
      return salida({
        estado: ESTADO.ERROR, unidad: u.canonica, dimension: u.dimension,
        porQue: `«${original}» viene con signo de moneda y con la unidad «${u.canonica}», que mide ${u.dimension}: una de las dos cosas está mal y no se elige en silencio`,
      })
    }
    return salida({ valor: n, unidad: u.canonica, dimension: u.dimension, estado: ESTADO.EXTRAIDO, porQue: null })
  }

  // ═══ PASO 2: no hay unidad. ¿Hay sufijo de magnitud? ═══
  const mult = MULTIPLICADOR[limpiar(sufijo)] ?? null
  if (mult === null) {
    if (sufijo) {
      return salida({ valor: n, estado: ESTADO.AMBIGUO, porQue: `«${sufijo}» no es una unidad que conozca ni un sufijo de magnitud: no sé qué mide «${original}»` })
    }
    if (monedaDelSigno) return salida({ valor: n, unidad: monedaDelSigno, dimension: DIMENSION.MONEDA, estado: ESTADO.EXTRAIDO })
    return salida({ valor: n, estado: ESTADO.AMBIGUO, porQue: `«${original}» es un número sin unidad: falta decir de qué` })
  }

  if (ctx === 'MONETARIO') {
    return salida({
      valor: n * mult, unidad: monedaDelSigno ?? 'ARS', dimension: DIMENSION.MONEDA, estado: ESTADO.EXTRAIDO,
      porQue: `«${sufijo}» leído como ×${mult.toLocaleString('es-AR')} porque el contexto es monetario`,
    })
  }

  // ═══ SIN CONTEXTO NO SE ELIGE: SE PREGUNTA (§19, el caso «la sanitaria 8,5M») ═══
  return salida({
    valor: null, estado: ESTADO.AMBIGUO,
    porQue: `«${original}» puede ser ${(n * mult).toLocaleString('es-AR')} en plata o ${n.toLocaleString('es-AR')} de alguna unidad que no se dijo. No se elige: se pregunta`,
    lecturas: Object.freeze([
      { valor: n * mult, unidad: 'ARS', dimension: DIMENSION.MONEDA, comoSeLee: `${sufijo} = millones de pesos` },
      { valor: n, unidad: null, dimension: null, comoSeLee: `${n} de una unidad no declarada` },
    ]),
  })
}

/**
 * ¿ESTA CANTIDAD SIRVE PARA ESTA PARTIDA? PURA.
 *
 * Es el filtro duro del §7 aplicado a la mutación: alguien dice «la mampostería son 520 m3» sobre
 * una partida que se cotiza en m². No se convierte, no se acepta, no se ignora: sale ERROR con las
 * dos unidades escritas, porque multiplicar m³ por un precio por m² produce un número que parece
 * plata y no significa nada.
 */
export function compatibleConPartida({ unidad, unidadPartida } = {}) {
  const uc = normalizarUnidad(unidad)
  const up = normalizarUnidad(unidadPartida)
  if (!up) return { ok: false, estado: ESTADO.ERROR, porQue: `la partida declara la unidad «${unidadPartida}», que no está en el catálogo de unidades` }
  if (!uc) return { ok: false, estado: ESTADO.AMBIGUO, porQue: `no se declaró en qué unidad viene la cantidad; la partida se cotiza en ${up.canonica}` }
  if (uc.dimension !== up.dimension) {
    return {
      ok: false, estado: ESTADO.ERROR,
      porQue: `la cantidad viene en ${uc.canonica} (${uc.dimension}) y la partida se cotiza en ${up.canonica} (${up.dimension}): multiplicar una por el precio de la otra da un número sin significado`,
    }
  }
  if (uc.canonica === up.canonica) return { ok: true, estado: ESTADO.EXTRAIDO, factor: 1 }
  const c = convertir(1, uc.canonica, up.canonica)
  if (c.estado !== ESTADO.CALCULADO) return { ok: false, estado: c.estado, porQue: c.porQue }
  return { ok: true, estado: ESTADO.CALCULADO, factor: c.valor, porQue: `${uc.canonica} → ${up.canonica}, factor ${c.valor}` }
}
