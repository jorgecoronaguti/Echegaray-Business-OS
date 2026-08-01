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

/** Números en formato es-AR dentro de un texto ("12,34%" → 0.1234). */
export function porcentajeArg(s) {
  const m = /(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*%/.exec(String(s ?? ''))
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n / 100 : null
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
    id: crudo.id || `bz_${(crudo.ticker || nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    nombre: nombre || '(sin nombre)',
    ticker: crudo.ticker ?? null,
    categoria,
    subcategoria: crudo.subcategoria ?? null,
    emisor: crudo.emisor ?? null,
    moneda: crudo.moneda === 'USD' ? 'USD' : 'ARS',
    precio: Number.isFinite(Number(crudo.precio)) ? Number(crudo.precio) : null,
    tasa,
    plazo_rescate_dias: Number.isFinite(Number(crudo.plazo_rescate_dias)) ? Number(crudo.plazo_rescate_dias) : null,
    liquidacion_dias: Number.isFinite(Number(crudo.liquidacion_dias)) ? Number(crudo.liquidacion_dias) : null,
    vencimiento: crudo.vencimiento ?? null,
    duration: Number.isFinite(Number(crudo.duration)) ? Number(crudo.duration) : null,
    riesgo_declarado: crudo.riesgo_declarado ?? null,
    costos: {
      comision: crudo.costos?.comision ?? null,
      honorarios: crudo.costos?.honorarios ?? null,
      spread: crudo.costos?.spread ?? null,
      salida_anticipada: crudo.costos?.salida_anticipada ?? null,
    },
    url: crudo.url ?? null,
    observado_en: observadoEn,
    evidencia: crudo.evidencia || EVIDENCIA.ESTIMACION,
    campos_faltantes: [...new Set([...faltantes, ...(crudo.campos_faltantes || [])])],
  }
  if (inst.plazo_rescate_dias == null) inst.campos_faltantes.push('plazo_rescate_dias')
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
      campos_faltantes: esTna || esTea ? [] : ['tipo_de_tasa_no_declarado_en_pantalla'],
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

/** Número en formato es-AR dentro de una celda ("1.234,56" → 1234.56). Devuelve null si no hay. */
export function numeroArg(s) {
  const t = String(s ?? '').replace(/[^\d.,-]/g, '').trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
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
    out.push(normalizarInstrumento({
      nombre,
      ticker: idx.ticker != null ? String(f[idx.ticker] ?? '').trim() || null : null,
      categoria: categoria || categorizar(nombre),
      moneda: /u\$s|usd|d[oó]lar/i.test(String(f[idx.moneda] ?? '')) ? 'USD' : 'ARS',
      precio: idx.precio != null ? numeroArg(f[idx.precio]) : null,
      tasa,
      plazo_rescate_dias: plazoLiquidacion(celdaLiq) ?? (/inmediat|t\s*\+\s*0/i.test(celdaLiq) ? 0 : null),
      liquidacion_dias: idx.liquidacion != null ? plazoLiquidacion(String(f[idx.liquidacion] ?? '')) : null,
      vencimiento: idx.vencimiento != null ? String(f[idx.vencimiento] ?? '').trim() || null : null,
      duration: idx.duration != null ? numeroArg(f[idx.duration]) : null,
      url,
      evidencia: EVIDENCIA.DATO, // salió de una tabla estructurada, no de un renglón adivinado
      campos_faltantes: faltan.filter((c) => ['plazo_rescate', 'liquidacion'].includes(c)),
    }, { observadoEn }))
  }
  return { instrumentos: out, columnas: idx, columnas_faltantes: faltan }
}

export const VERSION_SKILL = '1.1.0'
