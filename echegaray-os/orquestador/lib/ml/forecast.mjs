// PRONÓSTICO. NÚCLEO PURO: las líneas de base contra las que cualquier modelo tiene que ganar.
//
// ═══ POR QUÉ LAS LÍNEAS DE BASE VAN PRIMERO Y NO SON UN TRÁMITE ═══
//
// «Mañana va a ser parecido a hoy» y «el promedio de las últimas cuatro semanas» son
// sorprendentemente difíciles de ganar en series financieras cortas, y cuestan cero. Un modelo de
// fundación que no les gane no es un avance: son 2 GB de dependencias, minutos de CPU y una
// respuesta que nadie puede explicar, para hacer peor lo que hace una resta.
//
// ═══ EL PRONÓSTICO NUNCA BORRA UN COMPROMISO CONOCIDO ═══
//
// Ésta es la regla que gobierna todo el motor de caja del OS y no se negocia: si hay un cheque
// emitido con fecha, un vencimiento de F.931 o una cobranza comprometida, ESO es el piso
// determinístico. El modelo no lo predice: se suma ENCIMA para la parte que nadie conoce todavía.
// Un modelo que reemplazara el piso convertiría una certeza en una probabilidad.

/** Error absoluto medio: en la unidad del dato. Es el que se entiende sin traducir. */
export function mae(real = [], pred = []) {
  const n = Math.min(real.length, pred.length)
  if (!n) return null
  let s = 0
  for (let i = 0; i < n; i += 1) s += Math.abs(real[i] - pred[i])
  return s / n
}

/**
 * Error porcentual ponderado. Se usa en vez de MAPE porque una serie de caja tiene días en CERO, y
 * el MAPE divide por el real: un solo día en cero lo manda a infinito y la métrica deja de existir.
 * El WAPE divide por la suma de los reales, que en una serie de plata nunca es cero.
 */
export function wape(real = [], pred = []) {
  const n = Math.min(real.length, pred.length)
  if (!n) return null
  let num = 0, den = 0
  for (let i = 0; i < n; i += 1) { num += Math.abs(real[i] - pred[i]); den += Math.abs(real[i]) }
  return den === 0 ? null : num / den
}

/** MÉTODO 1 · INGENUO: lo que vale hoy es lo que va a valer mañana. */
export const naive = (serie, h) => Array(h).fill(serie.at(-1) ?? 0)

/** MÉTODO 2 · MEDIA MÓVIL de las últimas `v` observaciones. */
export const mediaMovil = (serie, h, v = 7) => {
  const u = serie.slice(-v)
  const m = u.length ? u.reduce((a, b) => a + b, 0) / u.length : 0
  return Array(h).fill(m)
}

/** MÉTODO 3 · MEDIANA MÓVIL. Igual que la anterior pero robusta: un pago extraordinario no arrastra
 *  la proyección de todo el mes siguiente. */
export const medianaMovil = (serie, h, v = 14) => {
  const u = serie.slice(-v).slice().sort((a, b) => a - b)
  if (!u.length) return Array(h).fill(0)
  const k = Math.floor(u.length / 2)
  const m = u.length % 2 ? u[k] : (u[k - 1] + u[k]) / 2
  return Array(h).fill(m)
}

/** MÉTODO 4 · TENDENCIA lineal por mínimos cuadrados sobre las últimas `v`. */
export const tendencia = (serie, h, v = 21) => {
  const u = serie.slice(-v)
  const n = u.length
  if (n < 3) return naive(serie, h)
  const sx = (n - 1) * n / 2
  const sxx = (n - 1) * n * (2 * n - 1) / 6
  const sy = u.reduce((a, b) => a + b, 0)
  const sxy = u.reduce((a, b, i) => a + i * b, 0)
  const den = n * sxx - sx * sx
  if (den === 0) return naive(serie, h)
  const b = (n * sxy - sx * sy) / den
  const a = (sy - b * sx) / n
  return Array.from({ length: h }, (_, i) => a + b * (n + i))
}

/**
 * MÉTODO 5 · ESTACIONAL SEMANAL. Una serie de caja NO es lisa: los martes se paga y los domingos no
 * entra nada. Promediar los siete días mezcla dos poblaciones distintas y produce un número que no
 * pasa ningún día. Éste proyecta cada día de la semana con la mediana de SUS propios días.
 */
export const estacionalSemanal = (serie, h, semanas = 6) => {
  const porDia = Array.from({ length: 7 }, () => [])
  const desde = Math.max(0, serie.length - semanas * 7)
  for (let i = desde; i < serie.length; i += 1) porDia[i % 7].push(serie[i])
  const med = porDia.map((xs) => {
    if (!xs.length) return null
    const a = xs.slice().sort((x, y) => x - y)
    const k = Math.floor(a.length / 2)
    return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2
  })
  const global = medianaMovil(serie, 1, semanas * 7)[0]
  return Array.from({ length: h }, (_, i) => med[(serie.length + i) % 7] ?? global)
}

export const METODOS = Object.freeze({
  naive, mediaMovil, medianaMovil, tendencia, estacionalSemanal,
})

/**
 * BACKTEST DE ORIGEN MÓVIL. La única forma honesta de medir un pronóstico.
 *
 * Se para en un punto del pasado, predice con lo que se sabía HASTA ahí, y compara contra lo que
 * pasó después. Medir sobre datos que el método ya vio no mide pronóstico: mide memoria.
 *
 * @param {number[]} serie
 * @param {{h?:number, minimo?:number, paso?:number}} opts
 */
export function backtest(serie = [], { h = 7, minimo = 21, paso = 1 } = {}) {
  const resultados = {}
  for (const [nombre, fn] of Object.entries(METODOS)) {
    const reales = [], preds = []
    for (let corte = minimo; corte + h <= serie.length; corte += paso) {
      const pasado = serie.slice(0, corte)
      const futuro = serie.slice(corte, corte + h)
      const p = fn(pasado, h)
      reales.push(...futuro)
      preds.push(...p)
    }
    resultados[nombre] = {
      mae: mae(reales, preds), wape: wape(reales, preds),
      ventanas: Math.max(0, Math.floor((serie.length - h - minimo) / paso) + 1), n: reales.length,
    }
  }
  return resultados
}

/**
 * EL PISO DETERMINÍSTICO MÁS LA INCERTIDUMBRE. Ésta es la arquitectura, no una opción.
 *
 * `comprometido` son los movimientos que YA se conocen para cada día del horizonte —cheques con
 * fecha, vencimientos, cobranzas confirmadas—. El pronóstico se aplica SÓLO a lo que no está
 * comprometido, y el resultado es la suma. Así un cheque conocido nunca desaparece porque un modelo
 * no lo vio venir.
 */
export function combinar(comprometido = [], pronostico = []) {
  const h = Math.max(comprometido.length, pronostico.length)
  return Array.from({ length: h }, (_, i) => ({
    dia: i + 1,
    comprometido: comprometido[i] ?? 0,
    esperado: (comprometido[i] ?? 0) + (pronostico[i] ?? 0),
    incertidumbre: pronostico[i] ?? 0,
  }))
}
