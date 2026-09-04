// DETECCIÓN DE ANOMALÍAS. NÚCLEO PURO: estadística que se puede explicar, no un modelo que no.
//
// ═══ POR QUÉ NO HAY UN MODELO ACÁ (TODAVÍA) ═══
//
// Una alerta que no puede decir POR QUÉ existe no se puede accionar: quien la recibe no sabe si
// mirar el precio, el proveedor o su propia carga. «El modelo dice que es raro» obliga a
// re-investigar desde cero cada vez, y a los tres días se ignoran todas.
//
// Un z-score robusto sí lo dice: «$18.400 el metro cuando la mediana de las últimas doce compras
// de este material fue $9.200, y la desviación típica $700». Eso es accionable sin saber qué es un
// z-score. Un modelo entra el día que encuentre algo que esto no encuentra, y va a tener que
// demostrarlo contra estas mismas alertas.
//
// ═══ MEDIANA Y MAD, NO PROMEDIO Y DESVÍO ═══
//
// El promedio y el desvío estándar los arruina justamente lo que se está buscando: un outlier
// mueve el promedio hacia sí mismo y agranda el desvío, así que se esconde detrás de su propio
// efecto. La mediana y la desviación absoluta mediana (MAD) no se mueven — hace falta corromper la
// mitad de los datos para engañarlas. Es la diferencia entre un detector que encuentra el precio
// disparado y uno que lo declara normal porque ese precio ya ensanchó la banda.

/** El factor que convierte la MAD en algo comparable con una desviación estándar cuando los datos
 *  son normales. Sin él, los umbrales de z no significan lo mismo que en la literatura. */
const K_MAD = 1.4826

/** Cuántas observaciones hacen falta para que una mediana signifique algo. Con tres compras, la
 *  «mediana histórica» es una de las tres, y cualquier cosa parece anómala contra ella. */
export const MINIMO_MUESTRAS = 6

export const SEVERIDAD = Object.freeze({ ALTA: 'alta', MEDIA: 'media', BAJA: 'baja' })

export function mediana(xs) {
  const a = xs.filter(Number.isFinite).slice().sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Desviación absoluta mediana, escalada. Es el reemplazo robusto del desvío estándar. */
export function mad(xs) {
  const med = mediana(xs)
  if (med === null) return null
  const d = xs.filter(Number.isFinite).map((x) => Math.abs(x - med))
  const m = mediana(d)
  return m === null ? null : m * K_MAD
}

/**
 * ¿Este valor es anómalo contra su propio historial? Devuelve la explicación, no sólo el veredicto.
 *
 * @param {number} valor
 * @param {number[]} historial los valores comparables ANTERIORES; el valor no va incluido
 * @param {{umbralAlta?:number, umbralMedia?:number, minimo?:number}} opts
 */
export function anomaliaPorZ(valor, historial = [], { umbralAlta = 3.5, umbralMedia = 2.5, minimo = MINIMO_MUESTRAS } = {}) {
  const h = historial.filter(Number.isFinite)
  if (!Number.isFinite(valor)) return { anomala: false, porQue: 'el valor no es un número' }
  if (h.length < minimo) {
    return { anomala: false, muestras: h.length,
      porQue: `sólo ${h.length} comparables: con menos de ${minimo} la mediana no significa nada todavía` }
  }
  const med = mediana(h)
  const s = mad(h)
  // MAD CERO NO ES «SIN VARIACIÓN INFINITAMENTE SIGNIFICATIVA». Pasa cuando más de la mitad del
  // historial es idéntico —un servicio que siempre cuesta lo mismo—, y ahí dividir da infinito y
  // cualquier centavo de diferencia sale como anomalía extrema. Se cae a una comparación relativa.
  // UNA VARIACIÓN DESPRECIABLE ES CERO, aunque no lo sea exactamente.
  //
  // Medido el 04/09: seis compras de combustible de $20.000 y una de $10.000 daban «89.932 veces la
  // variación típica», porque la MAD era de once centavos. El número es aritméticamente correcto y
  // completamente inútil: nadie puede decidir con «89.932 veces». Por debajo del uno por mil de la
  // mediana, la dispersión es ruido de redondeo y corresponde comparar en porcentaje.
  const DESPRECIABLE = Math.abs(med) * 0.001
  if (!s || s <= DESPRECIABLE) {
    const dif = med === 0 ? 0 : Math.abs(valor - med) / Math.abs(med)
    // CUANDO NO HAY VARIACIÓN HISTÓRICA, UN CUARTO DE DIFERENCIA YA ES MUCHO.
    //
    // El umbral estaba en «más del 50%» y dejaba pasar justo el caso que lo motivó: seis cargas de
    // $20.000 y una de $10.000 son exactamente 50%, y `> 0.5` es falso. El umbral tiene que ser más
    // exigente que en una serie dispersa, no menos: si las últimas doce compras valieron todas lo
    // mismo, que ésta valga un cuarto menos no lo explica el ruido — lo explica algo.
    const RELATIVO_MEDIA = 0.25
    const RELATIVO_ALTA = 0.75
    return {
      anomala: dif >= RELATIVO_MEDIA, z: null, mediana: med, mad: 0, muestras: h.length,
      severidad: dif >= RELATIVO_ALTA ? SEVERIDAD.ALTA : SEVERIDAD.MEDIA,
      porQue: `las ${h.length} comparables valen todas ${fmt(med)} y ésta ${fmt(valor)} (${(dif * 100).toFixed(0)}% de diferencia)`,
    }
  }
  const z = (valor - med) / s
  const az = Math.abs(z)
  const severidad = az >= umbralAlta ? SEVERIDAD.ALTA : az >= umbralMedia ? SEVERIDAD.MEDIA : SEVERIDAD.BAJA
  return {
    anomala: az >= umbralMedia,
    z: Number(z.toFixed(2)), mediana: med, mad: Number(s.toFixed(2)), muestras: h.length, severidad,
    // La explicación no menciona la palabra «z»: quien la lee tiene que poder decidir sin saber
    // qué es. El número queda en el objeto para quien lo quiera auditar.
    porQue: `${fmt(valor)} contra una mediana de ${fmt(med)} en ${h.length} comparables (variación típica ${fmt(s)}): ${az.toFixed(1)} veces esa variación`,
  }
}

const fmt = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * DUPLICADO PROBABLE. Dos filas con el mismo proveedor y el mismo importe, muy cerca en el tiempo.
 *
 * No afirma que sea un duplicado: afirma que se parecen lo suficiente como para que alguien mire.
 * La diferencia importa — un proveedor puede facturar dos veces lo mismo el mismo día de verdad, y
 * borrar uno de los dos por sospecha es peor que revisarlos.
 */
export function duplicadosProbables(filas = [], { dias = 7, tolerancia = 0.005 } = {}) {
  const out = []
  const orden = filas.filter((f) => Number.isFinite(f.importe) && f.importe > 0)
    .slice().sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')))
  for (let i = 0; i < orden.length; i += 1) {
    for (let j = i + 1; j < orden.length; j += 1) {
      const a = orden[i], b = orden[j]
      if (a.entidad !== b.entidad) continue
      const dt = Math.abs(fecha(b.fecha) - fecha(a.fecha)) / 86400000
      if (!Number.isFinite(dt) || dt > dias) break
      const rel = Math.abs(b.importe - a.importe) / Math.max(1, Math.abs(a.importe))
      if (rel > tolerancia) continue
      // Un comprobante distinto es la mejor prueba de que NO son el mismo gasto. Si los dos traen
      // número y son distintos, no se avisa: son dos facturas reales del mismo importe.
      if (a.comprobante && b.comprobante && a.comprobante !== b.comprobante) continue
      out.push({
        a: a.id, b: b.id, entidad: a.entidad, importe: a.importe, dias: Math.round(dt),
        severidad: a.comprobante === b.comprobante && a.comprobante ? SEVERIDAD.ALTA : SEVERIDAD.MEDIA,
        porQue: a.comprobante && a.comprobante === b.comprobante
          ? `mismo proveedor, mismo importe y EL MISMO comprobante (${a.comprobante}) con ${Math.round(dt)} día(s) de diferencia`
          : `mismo proveedor y mismo importe (${fmt(a.importe)}) con ${Math.round(dt)} día(s) de diferencia, y al menos uno sin número de comprobante`,
      })
    }
  }
  return out
}

const fecha = (v) => (v instanceof Date ? +v : Date.parse(String(v ?? '')) || NaN)

/**
 * LA PUERTA ÚNICA. Un módulo pide «buscá anomalías acá» y recibe una lista explicada.
 *
 * @param {Array<{id:*, clave:string, valor:number, fecha?:*, entidad?:string, comprobante?:string, etiqueta?:string}>} observaciones
 *   `clave` es contra qué se compara cada una: el material, el concepto, la cuenta. Comparar un
 *   precio de cemento contra el historial de todos los materiales no detecta nada.
 */
export function detectarAnomalias(observaciones = [], { tipo = 'valor', ...opts } = {}) {
  const porClave = new Map()
  for (const o of observaciones) {
    if (!porClave.has(o.clave)) porClave.set(o.clave, [])
    porClave.get(o.clave).push(o)
  }
  const hallazgos = []
  for (const [clave, grupo] of porClave) {
    const orden = grupo.slice().sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')))
    orden.forEach((o, i) => {
      // El historial son las ANTERIORES, no todas: comparar una observación contra un conjunto que
      // la incluye la esconde, y comparar contra el futuro no se puede hacer cuando la alerta tiene
      // que salir el día que el dato entra.
      const previas = orden.slice(0, i).map((x) => x.valor)
      const r = anomaliaPorZ(o.valor, previas, opts)
      if (r.anomala) hallazgos.push({ tipo, clave, id: o.id, etiqueta: o.etiqueta ?? null, valor: o.valor, ...r })
    })
  }
  return hallazgos.sort((a, b) => Math.abs(b.z ?? 99) - Math.abs(a.z ?? 99))
}
