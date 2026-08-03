// SKILL 5 · NORMALIZAR INSTRUMENTOS FINANCIEROS — que dos números sean comparables antes de compararlos.
//
// ═══ EL ERROR QUE ESTA SKILL EXISTE PARA IMPEDIR ═══
//
// El error caro de tesorería no es leer mal un número: es comparar una TNA contra una TEA contra un
// "rendimiento del último mes" como si fueran la misma cosa. Una TNA del 40% y una TEA del 40% se
// escriben igual y no valen igual; un rendimiento mensual histórico del 3% no es 36% anual ni es una
// promesa de nada.
//
// Por eso acá NINGUNA tasa entra sin declarar QUÉ es (`tipo`), sobre qué base, en qué moneda y de qué
// naturaleza (contractual, indicativa, histórica o estimada). Una tasa sin tipo no se normaliza: se
// devuelve como campo faltante. Es preferible un instrumento sin tasa —que queda fuera del ranking—
// a un instrumento con una tasa que nadie sabe qué mide.
//
// ═══ LÍMITE DECLARADO DEL EXTRACTOR ═══
//
// El extractor de texto de abajo NO fue validado contra el DOM real de Balanz: sin sesión abierta no
// hay pantalla que mirar. Está escrito para ser tolerante y para declarar todo lo que no encuentra,
// y su salida sale marcada con evidencia `estimacion` hasta que una corrida real la confirme. Lo que
// SÍ está probado es la normalización de tasas, que es la parte donde se pierde plata.

import { EVIDENCIA, TIPO_TASA, NATURALEZA_TASA, Instrumento, validarContra } from './contratos.mjs'

/**
 * ¿ES UN NÚMERO DE VERDAD? `Number.isFinite(Number(null))` es **true** porque `Number(null)` es 0.
 *
 * Es el defecto que `politicas.mjs` fue escrito para eliminar, y estaba reproducido acá: un
 * instrumento sin plazo de rescate publicado entraba como `plazo_rescate_dias: 0`, o sea **liquidez
 * inmediata garantizada**. Pasaba el filtro duro de liquidez, pasaba el bloqueante de riesgo, y
 * `campos_faltantes` salía vacío, así que tampoco bajaba la confianza. Exactamente el escenario "el
 * día 5 no se pagan sueldos", con la propuesta marcada confianza media.
 */
export function esNumero(x) {
  if (x == null) return false
  if (typeof x === 'string' && x.trim() === '') return false
  if (typeof x === 'boolean' || Array.isArray(x)) return false
  return Number.isFinite(Number(x))
}

/** Categorías de instrumento que Balanz expone. `apta_tesoreria` es criterio de ESTA empresa. */
export const CATEGORIAS = {
  money_market: { titulo: 'Money Market', apta_tesoreria: true, liquidez_tipica: 0 },
  fci_renta_fija: { titulo: 'FCI Renta Fija', apta_tesoreria: true, liquidez_tipica: 1 },
  fci_renta_mixta: { titulo: 'FCI Renta Mixta', apta_tesoreria: false, liquidez_tipica: 2 },
  fci_renta_variable: { titulo: 'FCI Renta Variable', apta_tesoreria: false, liquidez_tipica: 2 },
  lecap: { titulo: 'Lecap / Letra', apta_tesoreria: true, liquidez_tipica: 1 },
  bono: { titulo: 'Bono', apta_tesoreria: false, liquidez_tipica: 1 },
  on: { titulo: 'Obligación Negociable', apta_tesoreria: false, liquidez_tipica: 1 },
  caucion: { titulo: 'Caución', apta_tesoreria: true, liquidez_tipica: 1 },
  plazo_fijo: { titulo: 'Plazo Fijo', apta_tesoreria: true, liquidez_tipica: null },
  accion: { titulo: 'Acción', apta_tesoreria: false, liquidez_tipica: 2 },
  cedear: { titulo: 'CEDEAR', apta_tesoreria: false, liquidez_tipica: 2 },
  dolar_linked: { titulo: 'Dólar Linked', apta_tesoreria: false, liquidez_tipica: 2 },
  hard_dollar: { titulo: 'Hard Dollar', apta_tesoreria: false, liquidez_tipica: 2 },
  otro: { titulo: 'Otro', apta_tesoreria: false, liquidez_tipica: null },
}

/**
 * NO TODO INSTRUMENTO ES APTO PARA TESORERÍA, y esto no es una opinión de riesgo personal: la caja
 * operativa de una constructora paga sueldos el día 5. Un CEDEAR puede ser una gran inversión y una
 * pésima decisión de tesorería el mismo día.
 */
export const esAptoTesoreria = (categoria) => Boolean(CATEGORIAS[categoria]?.apta_tesoreria)

/** Convierte TNA (nominal anual, capitalización `m` por año) a TEA. Aritmética pura. */
export const tnaATea = (tna, m = 12) => (1 + Number(tna) / m) ** m - 1

/** Convierte un rendimiento de `dias` días a TEA. Aritmética pura. */
export const periodoATea = (r, dias) => (1 + Number(r)) ** (365 / Number(dias)) - 1

/**
 * TODA TASA A UNA SOLA VARA: la TEA. Es el único terreno donde dos instrumentos de plazos distintos
 * se pueden mirar juntos sin mentir.
 *
 * Devuelve `null` cuando la conversión no es legítima —no cuando es difícil—. Una variación de precio
 * pasada no se anualiza: anualizar el pasado y presentarlo como rendimiento esperado es la forma más
 * común de inventar precisión en finanzas.
 */
export function aTea(tasa) {
  if (!tasa || !Number.isFinite(Number(tasa.valor))) return null
  const v = Number(tasa.valor)
  switch (tasa.tipo) {
    case TIPO_TASA.TEA: return v
    case TIPO_TASA.TNA: return tnaATea(v, 12)
    case TIPO_TASA.TIR: return v // la TIR ya es efectiva anual
    case TIPO_TASA.RENDIMIENTO_PERIODO:
      return Number(tasa.periodo_dias) > 0 ? periodoATea(v, tasa.periodo_dias) : null
    case TIPO_TASA.RENDIMIENTO_HISTORICO:
    case TIPO_TASA.VARIACION_PRECIO:
      return null // pasado ≠ esperado: no se anualiza para comparar contra una tasa contractual
    default: return null
  }
}

/**
 * ═══ TECHO DE CORDURA DE UNA TASA ═══
 *
 * En la pantalla real de Balanz existe, hoy, una ON de Plaza Logística en UVA con una TIR publicada de
 * **95.739.511.996%**. No es un error de este código: la pantalla lo dice. Sale de calcular una TIR
 * sobre un precio que no corresponde a la moneda del flujo, y le puede pasar a cualquier especie
 * ilíquida cualquier día.
 *
 * Ninguna validación del módulo le ponía techo a una tasa. Todos los filtros miran otra cosa —moneda,
 * categoría, liquidez, frescura— y el orden del ranking es por rendimiento: el día que una letra apta
 * publique un disparate parecido, gana sola y con cara de oportunidad.
 *
 * El techo es ABSOLUTO y deliberadamente alto: 1000% efectivo anual. Argentina tuvo tasas de tres
 * cifras y este módulo no puede declararlas imposibles sin conocimiento que no tiene. Lo que sí puede
 * afirmar es que un instrumento de TESORERÍA que promete más de diez veces el capital en un año no es
 * una oportunidad: es un dato roto. Y lo que supera el techo no se descarta en silencio — se declara
 * SOSPECHOSO, con el número, para que alguien pueda mirarlo.
 */
export const TEA_MAXIMA_CREIBLE = 10

/** ¿La tasa está dentro de lo que un instrumento de tesorería puede pagar de verdad? */
export function tasaCreible(tea) {
  const t = Number(tea)
  if (!Number.isFinite(t)) return { creible: false, motivo: 'la tasa no es un número' }
  if (t > TEA_MAXIMA_CREIBLE) {
    return {
      creible: false,
      sospechosa: true,
      motivo: `la tasa publicada equivale a ${(t * 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}% efectivo anual y el techo de cordura es ${TEA_MAXIMA_CREIBLE * 100}%: `
        + 'es un dato roto de la pantalla, no una oportunidad. No se recomienda y no entra al ranking.',
    }
  }
  return { creible: true }
}

/**
 * DECIMAL DE UN NÚMERO SUELTO — el punto no siempre es separador de miles.
 *
 * ═══ LO QUE ENCONTRÓ LA PANTALLA REAL ═══
 *
 * Balanz no escribe todo en es-AR. En la misma sesión del 02/08/2026 conviven:
 *
 *   1.250,00   precio de un bono      → miles con punto, decimal con coma  (es-AR)
 *   23,16%     TNA de una Lecap       → decimal con coma
 *   9.3%       TIR de un bono         → decimal con PUNTO
 *   2.11       TNA de caución en USD  → decimal con PUNTO, y sin signo %
 *
 * Tratar el punto como separador de miles siempre —que es lo que hacía— convertía la TIR real de
 * 9,3% del AE38 en 3%, y la TNA de 2,11% de la caución en dólares en 211. Ninguno de los dos avisaba:
 * salían como números válidos. Un bono que rinde 9,3% mostrado como 3% se descarta solo; una caución
 * al 211% se elige sola. Los dos errores son caros y ninguno hace ruido.
 *
 * ═══ LA REGLA, Y DÓNDE SE NIEGA A ADIVINAR ═══
 *
 * · Hay coma  → la coma es el decimal y los puntos son miles. Es es-AR, sin ambigüedad.
 * · Sólo punto, seguido de EXACTAMENTE 3 dígitos y sin más dígitos detrás (`1.250`) → miles.
 * · Sólo punto en cualquier otra forma (`9.3`, `2.11`, `0.792`) → decimal.
 * · Más de un punto sin coma (`1.234.567`) → miles.
 *
 * El único caso que queda ambiguo de verdad es `9.300`: en es-AR es nueve mil trescientos y en
 * en-US es 9,3. Se resuelve como miles —la convención del sitio para precios— y se declara acá.
 * No hay una tercera opción honesta: el número no trae la información que haría falta.
 */
export function separadorDecimal(t) {
  if (t.includes(',')) return 'coma'
  const puntos = (t.match(/\./g) || []).length
  if (puntos === 0) return 'ninguno'
  if (puntos > 1) return 'miles'
  // Un grupo de miles nunca arranca con cero a la izquierda: "0.792" es cero coma setecientos noventa
  // y dos, no setecientos noventa y dos. Sin esta condición, el precio 0.792 del AE38C —que Balanz
  // escribe con coma pero cualquier pantalla puede escribir con punto— se multiplicaba por mil.
  return /^-?[1-9]\d{0,2}\.\d{3}$/.test(t) ? 'miles' : 'punto'
}

/** Aplica la regla de `separadorDecimal` y devuelve el número, o null si no hay número. */
function aNumero(t) {
  if (!t) return null
  const modo = separadorDecimal(t)
  const limpio = modo === 'coma' ? t.replace(/\./g, '').replace(',', '.')
    : modo === 'miles' ? t.replace(/\./g, '')
      : t
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Porcentaje dentro de un texto ("12,34%" → 0.1234, "9.3%" → 0.093).
 *
 * La regex vieja exigía que los grupos de miles fueran de 3 dígitos, así que sobre "9.3%" no
 * matcheaba el "9" y terminaba capturando el "3" suelto: devolvía 0.03 en vez de 0.093. Ahora se
 * captura el número COMPLETO pegado al signo y se decide el separador con la regla de arriba.
 */
export function porcentajeArg(s) {
  const m = /(-?[\d.,]*\d)\s*%/.exec(String(s ?? ''))
  if (!m) return null
  const n = aNumero(m[1])
  return n == null ? null : n / 100
}

/** T+0 / T+1 / T+2 dentro de un texto. */
export function plazoLiquidacion(s) {
  const m = /\bT\s*\+\s*(\d)\b/i.exec(String(s ?? ''))
  return m ? Number(m[1]) : null
}

/** Clasifica por nombre. Heurística declarada: si no reconoce, devuelve 'otro', nunca adivina. */
export function categorizar(nombre = '') {
  const n = String(nombre).toLowerCase()
  if (/money\s*market|mercado\s*de\s*dinero|liquidez/.test(n)) return 'money_market'
  if (/renta\s*fija/.test(n)) return 'fci_renta_fija'
  if (/renta\s*mixta|balanceado/.test(n)) return 'fci_renta_mixta'
  if (/renta\s*variable|acciones/.test(n)) return 'fci_renta_variable'
  if (/lecap|letra/.test(n)) return 'lecap'
  if (/cauci[oó]n/.test(n)) return 'caucion'
  if (/plazo\s*fijo/.test(n)) return 'plazo_fijo'
  if (/\bon\b|obligaci[oó]n\s*negociable/.test(n)) return 'on'
  if (/cedear/.test(n)) return 'cedear'
  if (/bono|bonar|global|boncer/.test(n)) return 'bono'
  if (/d[oó]lar\s*linked/.test(n)) return 'dolar_linked'
  if (/hard\s*dollar/.test(n)) return 'hard_dollar'
  return 'otro'
}

/**
 * EL IDENTIFICADOR DE UN INSTRUMENTO — el ticker NO alcanza para identificarlo.
 *
 * ═══ LO QUE ENCONTRÓ EL RELEVAMIENTO COMPLETO (02/08/2026) ═══
 *
 * La pantalla de cauciones devuelve 164 filas y todas se llaman igual: el "ticker" es PESOS o DOLAR,
 * y lo que las distingue es el PLAZO. Con el id armado sólo desde el ticker, 82 cauciones de pesos
 * —de 3 a 90 días, del 10% al 17% TNA— colapsaban en un único `bz_pesos`:
 *
 *   id "bz_pesos" → 82 instrumentos DISTINTOS
 *      plazo=3d tasa=10,00%   plazo=4d tasa=14,50%   plazo=5d tasa=15,10%   plazo=6d tasa=17,00%
 *
 * Y el id no es cosmético: es la clave con la que el ledger guarda las observaciones de mercado y
 * con la que se arma la clave estable de una recomendación (bloque, día, instrumento). Ochenta y dos
 * tasas distintas escribiéndose sobre la misma fila, y una propuesta aprobada "a la caución en
 * pesos" sin poder decir a qué plazo. Este repo ya aprendió exactamente esto con los cheques —el
 * número no identifica un cheque, la clave es (instrumento, número)— y la lección no había llegado
 * acá.
 *
 * El plazo entra al id sólo cuando existe: para una Lecap o un FCI el ticker ya es único y el id no
 * cambia respecto de antes.
 */
export function idDeInstrumento(crudo = {}, nombre = '') {
  const base = String(crudo.ticker || nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  // EL PLAZO QUE DISTINGUE ES EL DE RESCATE, no el de liquidación. Se aprendió arreglando el conteo
  // doble de la caución: al poner su liquidación en 0 —porque el plazo ya estaba contado como
  // rescate— un id armado desde la liquidación devolvía `bz_pesos-0d` para las 82, o sea la misma
  // colisión que este id existe para impedir, reintroducida por un arreglo de otra cosa. Van los dos
  // cuando existen, y el de rescate primero.
  const partes = [
    esNumero(crudo.plazo_rescate_dias) ? `r${Number(crudo.plazo_rescate_dias)}d` : null,
    esNumero(crudo.liquidacion_dias) ? `l${Number(crudo.liquidacion_dias)}d` : null,
  ].filter(Boolean)
  return `bz_${base}${partes.length ? `-${partes.join('-')}` : ''}`
}

/**
 * SKILL 5. Normaliza un instrumento crudo al contrato. Todo campo ausente se declara en
 * `campos_faltantes` — que después la SKILL 6 usa para excluirlo del ranking en vez de completarlo.
 */
export function normalizarInstrumento(crudo = {}, { observadoEn = new Date().toISOString(), fuente = 'Balanz' } = {}) {
  const faltantes = []
  const nombre = String(crudo.nombre ?? '').trim()
  if (!nombre) faltantes.push('nombre')
  const categoria = crudo.categoria || categorizar(nombre)
  if (categoria === 'otro') faltantes.push('categoria')

  let tasa = null
  if (crudo.tasa && crudo.tasa.tipo && Number.isFinite(Number(crudo.tasa.valor))) {
    tasa = {
      tipo: crudo.tasa.tipo,
      valor: Number(crudo.tasa.valor),
      base_dias: crudo.tasa.base_dias ?? 365,
      periodo_dias: crudo.tasa.periodo_dias ?? null,
      moneda: crudo.moneda || 'ARS',
      naturaleza: crudo.tasa.naturaleza || NATURALEZA_TASA.INDICATIVA,
      fuente,
      observado_en: observadoEn,
    }
  } else faltantes.push('tasa')

  const inst = {
    id: crudo.id || idDeInstrumento(crudo, nombre),
    nombre: nombre || '(sin nombre)',
    ticker: crudo.ticker ?? null,
    categoria,
    subcategoria: crudo.subcategoria ?? null,
    emisor: crudo.emisor ?? null,
    moneda: crudo.moneda === 'USD' ? 'USD' : 'ARS',
    precio: esNumero(crudo.precio) ? Number(crudo.precio) : null,
    tasa,
    plazo_rescate_dias: esNumero(crudo.plazo_rescate_dias) ? Number(crudo.plazo_rescate_dias) : null,
    liquidacion_dias: esNumero(crudo.liquidacion_dias) ? Number(crudo.liquidacion_dias) : null,
    vencimiento: crudo.vencimiento ?? null,
    duration: esNumero(crudo.duration) ? Number(crudo.duration) : null,
    riesgo_declarado: crudo.riesgo_declarado ?? null,
    costos: {
      comision: crudo.costos?.comision ?? null,
      honorarios: crudo.costos?.honorarios ?? null,
      spread: crudo.costos?.spread ?? null,
      salida_anticipada: crudo.costos?.salida_anticipada ?? null,
    },
    url: crudo.url ?? null,
    observado_en: observadoEn,
    // Cuándo cotizó el mercado, no cuándo miramos nosotros. Null es "la pantalla no lo dijo".
    cotizado_en: crudo.cotizado_en ?? null,
    // 'minuto' | 'dia' | null — la pantalla real publica sólo FECHA, y la vara de frescura tiene que
    // saberlo: medir "menos de 6 horas" contra una fecha parseada a medianoche da falso desde las
    // 06:00, o sea siempre a la hora en que corre el timer.
    cotizado_precision: crudo.cotizado_precision ?? null,
    evidencia: crudo.evidencia || EVIDENCIA.ESTIMACION,
    campos_faltantes: [...new Set([...faltantes, ...(crudo.campos_faltantes || [])])],
  }
  if (inst.plazo_rescate_dias == null) inst.campos_faltantes.push('plazo_rescate_dias')
  if (inst.liquidacion_dias == null) inst.campos_faltantes.push('liquidacion_dias')
  if (inst.costos.comision == null && inst.costos.honorarios == null) inst.campos_faltantes.push('costos')

  const v = validarContra(Instrumento, inst)
  return v.ok ? v.valor : { ...inst, campos_faltantes: [...inst.campos_faltantes, ...v.errores] }
}

/**
 * EXTRACTOR DE TEXTO — tolerante y honesto. Toma el texto plano de una pantalla informativa y devuelve
 * candidatos con lo que pudo leer. NO valida contra el DOM real (ver el límite declarado arriba):
 * todo lo que produce sale con evidencia `estimacion` y requiere confirmación humana antes de que una
 * recomendación se apoye en ello.
 */
export function extraerDeTexto(texto = '', { url = null, observadoEn = new Date().toISOString() } = {}) {
  const lineas = String(texto).split('\n').map((l) => l.trim()).filter(Boolean)
  const out = []
  for (const l of lineas) {
    const pct = porcentajeArg(l)
    if (pct == null) continue
    const nombre = l.replace(/(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*%.*/, '').trim()
    if (nombre.length < 3) continue
    const esTna = /\btna\b/i.test(l)
    const esTea = /\btea\b/i.test(l)
    out.push(normalizarInstrumento({
      nombre,
      // Mismo criterio que en tablas y tarjetas: si el renglón no dice la moneda, no se asume una.
      // Este es el camino de RESPALDO —el que corre si Balanz cambia el DOM—, o sea justo donde la
      // moneda es menos legible: era el único de los tres extractores que seguía afirmando ARS.
      moneda: /u\$s|usd|d[oó]lar/i.test(l) ? 'USD' : 'ARS',
      liquidacion_dias: plazoLiquidacion(l),
      tasa: {
        // SIN ETIQUETA NO HAY TIPO. Si la pantalla no dice TNA ni TEA, el número queda como
        // rendimiento histórico —que `aTea` se niega a anualizar— y el instrumento no entra al ranking.
        tipo: esTna ? TIPO_TASA.TNA : esTea ? TIPO_TASA.TEA : TIPO_TASA.RENDIMIENTO_HISTORICO,
        valor: pct,
        naturaleza: esTna || esTea ? NATURALEZA_TASA.INDICATIVA : NATURALEZA_TASA.HISTORICA,
      },
      url,
      evidencia: EVIDENCIA.ESTIMACION,
      campos_faltantes: [
        ...(esTna || esTea ? [] : ['tipo_de_tasa_no_declarado_en_pantalla']),
        ...(/u\$s|usd|d[oó]lar|\bars\b|pesos?/i.test(l) ? [] : ['moneda_no_declarada_en_pantalla']),
      ],
    }, { observadoEn }))
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN POR TABLA — por ENCABEZADO, nunca por posición
// ════════════════════════════════════════════════════════════════════════════

/**
 * Sinónimos de cada campo tal como los escriben los brókers argentinos. Se busca por CONTENIDO del
 * encabezado, no por índice: es la misma regla que este repo aplica a las columnas de Compras, y por
 * el mismo motivo — el orden de las columnas cambia sin avisar, los nombres casi nunca.
 */
export const COLUMNAS = {
  nombre: [/^(nombre|fondo|especie|instrumento|denominaci)/i],
  ticker: [/^(ticker|s[ií]mbolo|simbolo|c[oó]digo)/i],
  moneda: [/^(moneda|divisa)/i],
  precio: [/^(precio|valor cuotaparte|valor cuota|[uú]ltimo)/i],
  tna: [/\btna\b/i],
  tea: [/\btea\b/i],
  rendimiento: [/^(rendimiento|variaci|retorno|performance)/i],
  tir: [/\btir\b|rendimiento al vencimiento|yield/i],
  plazo_rescate: [/rescate|liquidez|disponibilidad/i],
  liquidacion: [/liquidaci/i],
  vencimiento: [/vencimiento|maturity/i],
  duration: [/duration|duraci[oó]n modificada/i],
  plazo: [/^(plazo|d[ií]as)/i],
  // La ÚLTIMA COTIZACIÓN de la fila. La pantalla la trae y se estaba tirando: sin ella, la frescura
  // del mercado se mide contra el reloj del propio proceso y da siempre 0 horas (ver `cotizadoEn`).
  hora: [/^(hora|[uú]lt(ima)?\.?\s*cotiz|fecha)/i],
}

/**
 * CUÁNDO COTIZÓ ESTE INSTRUMENTO POR ÚLTIMA VEZ — distinto de cuándo lo miramos nosotros.
 *
 * ═══ POR QUÉ SON DOS CAMPOS Y NO UNO ═══
 *
 * `observado_en` es cuándo el agente leyó la pantalla; `cotizado_en` es cuándo el mercado puso ese
 * precio. Confundirlos convertía el control de frescura en un espejo: los tres extractores estampaban
 * `observado_en = ahora` y `frescuraDeMercado` medía la antigüedad contra el mismo `ahora`, con lo
 * cual devolvía 0,0 h SIEMPRE. La compuerta quedaba abierta de forma permanente y el bloqueante de
 * 24 h de `riesgo.mjs` no podía dispararse nunca.
 *
 * Y el dato estaba en la pantalla. Medido sobre las 164 cauciones reales del 02/08/2026: 114 tenían
 * su última cotización en otra fecha, una de ellas del 05/05/2026 — tres meses vieja, informada como
 * "de hace 0,0 horas".
 *
 * Devuelve null si la celda no es una fecha legible. Null NO es "hoy": el que consume decide, y
 * `frescuraDeMercado` cuenta esos casos aparte en vez de darlos por frescos.
 */
export function cotizadoEn(celda, { ahora = new Date() } = {}) {
  return cotizacionDe(celda, { ahora }).iso
}

/**
 * Igual que `cotizadoEn` pero devuelve también la PRECISIÓN de lo que dijo la pantalla.
 *
 * ═══ POR QUÉ HACE FALTA SABERLO ═══
 *
 * Las seis tablas reales de Balanz publican en la columna "Hora" una FECHA sin hora del día
 * ("31/07/2026"). Parsearla a medianoche y después medir "¿tiene menos de 6 horas?" da falso a
 * partir de las 06:00 de la mañana — con lo cual, para un timer que corre 09:15 y 15:30, la
 * respuesta es NO SIEMPRE, incluso con datos cotizados hoy. Así se convierte un control que decía
 * siempre que sí en uno que dice siempre que no: el mismo defecto de diseño, del otro lado.
 *
 * Con la precisión declarada, la vara puede ser la correcta para cada caso: horas cuando la pantalla
 * da hora, días hábiles cuando sólo da fecha.
 */
export function cotizacionDe(celda, { ahora = new Date() } = {}) {
  const iso = parsearCotizacion(celda, ahora)
  if (!iso) return { iso: null, precision: null }
  const t = String(celda ?? '').trim()
  return { iso, precision: /\d{1,2}:\d{2}/.test(t) ? 'minuto' : 'dia' }
}

function parsearCotizacion(celda, ahora) {
  const t = String(celda ?? '').trim()
  if (!t) return null
  // dd/mm/yyyy [hh:mm[:ss]] — el formato de la pantalla, en locale es-AR.
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t)
  if (m) {
    const [, d, mes, a, hh, mm, ss] = m
    const anio = Number(a) < 100 ? 2000 + Number(a) : Number(a)
    const f = new Date(anio, Number(mes) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0))
    return Number.isFinite(f.getTime()) ? f.toISOString() : null
  }
  // Sólo hora ("17:32"): es de HOY según el reloj del que mira, que es lo único que se puede afirmar.
  const h = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t)
  if (h) {
    const f = new Date(ahora)
    f.setHours(Number(h[1]), Number(h[2]), Number(h[3] ?? 0), 0)
    return Number.isFinite(f.getTime()) ? f.toISOString() : null
  }
  return null
}

/** Índice de cada campo dentro de la cabecera. Devuelve también los que no encontró. */
export function mapearColumnas(cabecera = []) {
  const idx = {}
  const faltan = []
  for (const [campo, patrones] of Object.entries(COLUMNAS)) {
    const i = cabecera.findIndex((h) => patrones.some((re) => re.test(String(h ?? ''))))
    if (i >= 0) idx[campo] = i
    else faltan.push(campo)
  }
  return { idx, faltan }
}

/**
 * Número dentro de una celda ("1.234,56" → 1234.56, "9.3" → 9.3). Devuelve null si no hay número.
 *
 * Usa la misma regla de separador que `porcentajeArg` (ver `separadorDecimal`): tratar el punto como
 * miles siempre convertía la TNA de caución en dólares de 2,11 en 211.
 *
 * Un guion —la forma en que Balanz escribe "este instrumento no tiene este dato"— devuelve **null**,
 * nunca 0. Antes `"-"` sobrevivía al filtro de caracteres y `Number('-')` daba `NaN`, que caía en el
 * mismo `null` por casualidad y no por diseño; ahora es explícito y hay un test que lo fija.
 */
export function numeroArg(s) {
  const crudo = String(s ?? '').trim()
  if (!crudo || /^[-–—]$/.test(crudo)) return null
  const t = crudo.replace(/[^\d.,-]/g, '').trim()
  if (!t || !/\d/.test(t)) return null
  return aNumero(t)
}

/**
 * SKILL 5 (tabla). Convierte una tabla ya extraída del DOM en instrumentos normalizados.
 *
 * El tipo de tasa sale de la COLUMNA, que es donde el bróker lo declara: si la columna dice "TNA", la
 * tasa es una TNA. Si sólo hay una columna genérica de "Rendimiento", entra como histórico —y por lo
 * tanto queda fuera del ranking, en vez de colarse disfrazada de expectativa.
 */
export function extraerDeTabla({ cabecera = [], filas = [] } = {}, { url = null, observadoEn = new Date().toISOString(), categoria = null } = {}) {
  const { idx, faltan } = mapearColumnas(cabecera)
  if (idx.nombre == null) return { instrumentos: [], motivo: 'la tabla no tiene una columna de nombre reconocible', cabecera }
  const out = []
  for (const f of filas) {
    const nombre = String(f?.[idx.nombre] ?? '').trim()
    if (!nombre) continue
    let tasa = null
    if (idx.tea != null && numeroArg(f[idx.tea]) != null) {
      tasa = { tipo: TIPO_TASA.TEA, valor: numeroArg(f[idx.tea]) / 100, naturaleza: NATURALEZA_TASA.INDICATIVA }
    } else if (idx.tna != null && numeroArg(f[idx.tna]) != null) {
      tasa = { tipo: TIPO_TASA.TNA, valor: numeroArg(f[idx.tna]) / 100, naturaleza: NATURALEZA_TASA.INDICATIVA }
    } else if (idx.tir != null && numeroArg(f[idx.tir]) != null) {
      tasa = { tipo: TIPO_TASA.TIR, valor: numeroArg(f[idx.tir]) / 100, naturaleza: NATURALEZA_TASA.INDICATIVA }
    } else if (idx.rendimiento != null && numeroArg(f[idx.rendimiento]) != null) {
      // SIN ETIQUETA NO HAY EXPECTATIVA: una columna que sólo dice "Rendimiento" es historia.
      tasa = { tipo: TIPO_TASA.RENDIMIENTO_HISTORICO, valor: numeroArg(f[idx.rendimiento]) / 100, naturaleza: NATURALEZA_TASA.HISTORICA }
    }
    const celdaLiq = idx.plazo_rescate != null ? String(f[idx.plazo_rescate] ?? '') : ''
    const cat = categoria || categorizar(nombre)
    // ═══ EN UNA CAUCIÓN, "PLAZO" ES EL PLAZO DE LA OPERACIÓN ═══
    //
    // Y por lo tanto es cuándo vuelve la plata, que es justo lo que el evaluador necesita. Sin esto,
    // las 82 cauciones en pesos del relevamiento real quedaban excluidas por "no se conoce el plazo
    // de rescate" — el instrumento de corto plazo más usado del mercado local, descartado entero por
    // un campo que la pantalla sí declara.
    //
    // NO se hace lo mismo con letras ni bonos: ahí "Plazo" es la LIQUIDACIÓN (24hs) y la plata vuelve
    // al VENCIMIENTO, que esta tabla no trae como columna. Inferirlo del nombre ("VTO. 14/08/2026")
    // sería adivinar una fecha que decide una inversión: se deja en null, se declara, y el evaluador
    // los excluye con su motivo. Un excluido con causa es información; un plazo inventado es un
    // error con formato de dato.
    const plazoOperacion = cat === 'caucion' && idx.plazo != null
      ? plazoRescateDias(String(f[idx.plazo] ?? '')) : null
    // ═══ LA MONEDA, CUANDO NO HAY COLUMNA DE MONEDA ═══
    //
    // Las tablas de cotizaciones no tienen columna "Moneda", así que `f[idx.moneda]` era `undefined`
    // y el ternario caía en ARS. Contra la pantalla real eso etiquetaba en pesos al "BONO REP.
    // ARGENTINA **USD** STEP UP 2038" y a la caución "DOLARES". Comparar un rendimiento en dólares
    // contra uno en pesos como si fueran la misma cosa es el error más caro que puede cometer un
    // comparador de tesorería, y el default silencioso lo garantizaba.
    //
    // Ahora se mira la celda si existe, y si no el nombre. Si ninguna de las dos lo dice, la moneda
    // NO se afirma: se declara faltante y el instrumento queda fuera del ranking.
    const textoMoneda = idx.moneda != null ? String(f[idx.moneda] ?? '') : ''
    const hayMarcaUSD = /u\$s|usd|d[oó]lar/i.test(textoMoneda) || /\busd\b|u\$s|d[oó]lar/i.test(nombre)
    const hayMarcaARS = /\bars\b|pesos?\b/i.test(textoMoneda) || /\bpesos?\b/i.test(nombre)
    const faltaMoneda = !hayMarcaUSD && !hayMarcaARS && idx.moneda == null
    out.push(normalizarInstrumento({
      nombre,
      ticker: idx.ticker != null ? String(f[idx.ticker] ?? '').trim() || null : null,
      categoria: cat,
      moneda: hayMarcaUSD ? 'USD' : 'ARS',
      precio: idx.precio != null ? numeroArg(f[idx.precio]) : null,
      tasa,
      plazo_rescate_dias: plazoLiquidacion(celdaLiq)
        ?? (/inmediat|t\s*\+\s*0/i.test(celdaLiq) ? 0 : null)
        ?? plazoOperacion,
      // La columna "Plazo" de las cotizaciones ("24hs", "72hs") es el plazo de LIQUIDACIÓN, que es
      // justo lo que decide cuándo vuelve la plata. Se leía sólo si existía una columna llamada
      // "Liquidación", que en esta app no existe: quedaba siempre en null.
      // OJO CON CONTAR EL PLAZO DOS VECES. `liquidezCompatible` SUMA rescate + liquidación, así que
      // para una caución —donde la columna "Plazo" ya se usó como plazo de rescate— volver a
      // escribirla acá duplicaba el tiempo: una caución a 20 días se informaba como "vuelve en 40" y
      // quedaba excluida de una ventana de 30 en la que entra, con un motivo que además era falso.
      liquidacion_dias: idx.liquidacion != null
        ? plazoLiquidacion(String(f[idx.liquidacion] ?? ''))
        : (plazoOperacion != null ? 0 : (idx.plazo != null ? plazoRescateDias(String(f[idx.plazo] ?? '')) : null)),
      vencimiento: idx.vencimiento != null ? String(f[idx.vencimiento] ?? '').trim() || null : null,
      duration: idx.duration != null ? numeroArg(f[idx.duration]) : null,
      url,
      cotizado_en: idx.hora != null ? cotizacionDe(f[idx.hora], { ahora: new Date(observadoEn) }).iso : null,
      cotizado_precision: idx.hora != null ? cotizacionDe(f[idx.hora], { ahora: new Date(observadoEn) }).precision : null,
      evidencia: EVIDENCIA.DATO, // salió de una tabla estructurada, no de un renglón adivinado
      campos_faltantes: [
        ...faltan.filter((c) => ['plazo_rescate', 'liquidacion'].includes(c)),
        ...(faltaMoneda ? ['moneda_no_declarada_en_pantalla'] : []),
      ],
    }, { observadoEn }))
  }
  return { instrumentos: out, columnas: idx, columnas_faltantes: faltan }
}

/**
 * PLAZO DE RESCATE tal como lo escribe la pantalla de fondos: "Inmediato", "T+0", "24hs", "48hs".
 * Devuelve días, o `null` — nunca 0 por defecto. Un fondo sin plazo declarado ya rompió este módulo
 * una vez colándose como liquidez inmediata garantizada.
 */
export function plazoRescateDias(s) {
  const t = String(s ?? '').trim().toLowerCase()
  if (!t) return null
  if (/inmediat/.test(t)) return 0
  const tmas = plazoLiquidacion(t)
  if (tmas != null) return tmas
  const hs = /(\d+)\s*h/.exec(t)
  if (hs) return Math.round(Number(hs[1]) / 24)
  const d = /(\d+)\s*d/.exec(t)
  if (d) return Number(d[1])
  return null
}

/**
 * SKILL 5 (tarjetas). La pantalla de fondos de Balanz no es una tabla — ver `leerTarjetasDeFondos`.
 *
 * ═══ LA REGLA QUE MANDA ACÁ ═══
 *
 * La tarjeta trae cinco números y sólo uno es una tasa. "Diaria 0,05% · Semanal 0,32% · Mensual
 * 1,40% · Anual 28,17%" son variaciones YA OCURRIDAS del valor de la cuotaparte. La TNA aparece
 * suelta, con su rótulo, y sólo en algunos fondos: en la pantalla del 02/08/2026, en 2 de 10.
 *
 * Anualizar el 44,21% de "Anual" y llamarlo tasa sería fabricar una expectativa a partir de un
 * histórico — el error más caro que puede cometer este módulo, porque el número resultante es
 * plausible, entra al ranking y gana. Las variaciones se conservan como evidencia y el instrumento
 * queda SIN tasa, que es lo que lo mantiene fuera del ranking.
 */
export function extraerDeTarjetas(tarjetas = [], { url = null, observadoEn = new Date().toISOString() } = {}) {
  const out = []
  for (const t of tarjetas || []) {
    const nombre = String(t?.nombre ?? '').trim()
    if (!nombre) continue
    // La tasa SÓLO si la tarjeta la rotuló. `porcentajeArg` devuelve null si no hay número.
    const tna = t.tna_texto && /\btna\b/i.test(t.tna_texto) ? porcentajeArg(t.tna_texto) : null
    const faltantes = []
    if (tna == null) faltantes.push('tasa_no_declarada_en_pantalla')
    const rescate = plazoRescateDias(t.plazo_rescate_texto)
    if (rescate == null) faltantes.push('plazo_rescate_no_legible')
    // Mismo criterio que en las tablas: si la tarjeta no dice la moneda, no se asume una.
    if (!/usd|u\$s|d[oó]lar|ars|pesos?/i.test(String(t.moneda_texto ?? ''))) {
      faltantes.push('moneda_no_declarada_en_pantalla')
    }
    out.push({
      ...normalizarInstrumento({
        nombre,
        categoria: categorizarFondo(t.tipo, nombre),
        subcategoria: t.tipo || null,
        moneda: /usd|u\$s|d[oó]lar/i.test(String(t.moneda_texto ?? '')) ? 'USD' : 'ARS',
        tasa: tna == null ? null : {
          tipo: TIPO_TASA.TNA, valor: tna, naturaleza: NATURALEZA_TASA.INDICATIVA,
        },
        plazo_rescate_dias: rescate,
        riesgo_declarado: t.perfil || null,
        url,
        evidencia: EVIDENCIA.DATO,
        campos_faltantes: faltantes,
      }, { observadoEn }),
      // Las variaciones viajan como evidencia, NUNCA como tasa. Se guardan crudas: convertirlas
      // sería darles un estatus que la pantalla no les dio.
      variaciones_historicas: t.variaciones ?? null,
      horizonte_declarado: t.horizonte ?? null,
    })
  }
  return out
}

/**
 * La categoría de un fondo sale del campo "Tipo" que la propia tarjeta declara ("Mercado de Dinero",
 * "Renta Fija"), y sólo se cae al nombre si ese campo no está. Es mejor fuente: `categorizar('Lecaps')`
 * daba `lecap` para un fondo que es de renta fija, y `Ahorro corto plazo` no daba nada.
 */
export function categorizarFondo(tipo, nombre = '') {
  const t = String(tipo ?? '').toLowerCase()
  if (/mercado\s*de\s*dinero|money\s*market/.test(t)) return 'money_market'
  if (/renta\s*fija/.test(t)) return 'fci_renta_fija'
  if (/renta\s*mixta|balancead/.test(t)) return 'fci_renta_mixta'
  if (/renta\s*variable/.test(t)) return 'fci_renta_variable'
  return categorizar(nombre)
}

export const VERSION_SKILL = '1.2.0'
