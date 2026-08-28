// LA PRÁCTICA DE COTIZACIÓN EN EL FORMATO DEL CLIENTE. PURO.
//
// ═══ QUÉ SE APRENDE ACÁ QUE NO SE APRENDE DE LA PLANTILLA INTERNA ═══
//
// La cotización interna de ECSAS enseña cómo se arma el precio por dentro. La planilla que se le
// ENTREGA a ARCOR enseña otra cosa, y es la que faltaba: con qué gastos generales, qué beneficio y
// qué costo financiero se cerró cada obra, qué rubros se usaron y en qué orden, qué unidad se le
// pone a cada tipo de tarea, y qué se declaró por escrito sobre alcance, plazo y forma de pago.
//
// ═══ MISMA MAQUINARIA, NO UNA SEGUNDA ═══
//
// Las prácticas se construyen con `practica()` de `practica-cotizacion.mjs` —misma estadística,
// misma escala de madurez A/B/C/D/E, misma advertencia— y salen a la biblioteca por el ÚNICO camino
// que existe: `registroHistorico()` → `aConocimientoHistorico()`, con procedencia
// PRACTICA_HISTORICA_ECSAS. Duplicar la estadística acá habría producido dos definiciones de
// «cuántos casos hacen falta para que algo sea una práctica»; darle una procedencia propia habría
// producido un segundo camino a la biblioteca, que es justo lo que main prohibió por escrito.
//
// ═══ UN PORCENTAJE NO ES UN IMPORTE ═══
//
// La fila de cierre trae los dos: `gg | 15% | 900.000`. El coeficiente es el que enseña algo —el
// importe depende del tamaño de la obra— y confundirlos publica un «gasto general del 900.000%».
// Por eso el coeficiente se toma sólo cuando hay un valor entre 0 y 1, y cuando no hay se dice.
import { practica } from './practica-cotizacion.mjs'
// La advertencia y la procedencia salen de `practica-historica.mjs`, no de acá: «así se lo
// cotizamos a este cliente» tiene EXACTAMENTE el mismo estatus epistémico que «así lo cotizábamos
// por dentro» —los dos son un número TIPEADO en una planilla, no medido ejecutando—, y main creó
// PRACTICA_HISTORICA_ECSAS justo para eso. Una procedencia propia sería un tercer vocabulario para
// la misma cosa; lo que separa a las dos familias es el CORPUS, y eso vive en la clave.
import { ADVERTENCIA } from './practica-historica.mjs'

/** La misma advertencia, con el corpus correcto. La de `practica-historica.mjs` dice «cotizaciones
 *  internas de ECSAS» y esta familia sale de la planilla que se ENTREGA al cliente: reusarla tal
 *  cual publicaba 97 conocimientos citando un corpus que no era el suyo. */
export const ADVERTENCIA_CLIENTE = ADVERTENCIA.replace('cotizaciones internas de ECSAS', 'las planillas de cotización que ECSAS entrega al cliente')

const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

/**
 * UN CASO CON LOS NOMBRES QUE LA BIBLIOTECA LEE. PURA.
 *
 * ═══ NO ES COSMÉTICA: ERA LA CITA QUE SE TIRABA ═══
 *
 * Este módulo escribía `textoLiteral` y `celda`; `aConocimientoHistorico()` y el constructor de la
 * biblioteca leen `cita` y `ubicacion`. Resultado medido: 458 citas guardadas y las 458 vacías, con
 * la celda —que este módulo SÍ había calculado— tirada. Una afirmación cuya cita es `{}` no se
 * puede contrastar contra el papel, que es exactamente lo que la procedencia exige.
 *
 * `cotizacion` es el ID de Drive y no el nombre, porque es la llave con la que
 * `indiceDeCotizaciones()` encuentra el archivo, el cliente y la fecha de modificación.
 */
const caso = (c, { valor, cita, hoja, fila }) => ({
  cotizacion: c.id ?? c.driveId ?? c.nombre,
  obra: c.obra,
  valor,
  cita: String(cita ?? '').slice(0, 240),
  ubicacion: `${c.nombre} · hoja ${hoja} · fila ${fila}`,
})

/**
 * EL COEFICIENTE DE UNA FILA DE CIERRE, O `null` CON EL MOTIVO. PURA.
 *
 * Un porcentaje formateado en Excel llega como número entre 0 y 1. Un importe llega como miles o
 * millones. Cuando hay más de un candidato entre 0 y 1 no se elige: se declara ambiguo, porque
 * elegir el primero es exactamente la selección arbitraria que este repo prohíbe.
 */
export const NUNCA_SON_COEFICIENTE = Object.freeze(['SUBTOTAL', 'TOTAL', 'PLAZO'])

export function coeficienteDe(valores = [], concepto = null) {
  // ═══ HAY CONCEPTOS QUE NO PUEDEN SER UN COEFICIENTE, MIRE LO QUE MIRE LA FILA ═══
  // Un SUBTOTAL es la suma del costo directo: un importe, por definición. La regla «único número
  // entre 0 y 1» le encontró un 0,994 —una celda de redondeo de la propia planilla— y publicó
  // «SUBTOTAL se cotiza como coeficiente, valor 0,994». No era un caso escaso: era un caso FALSO.
  // El PLAZO es días o meses, y el TOTAL es plata. Ninguno se lee como fracción.
  if (concepto && NUNCA_SON_COEFICIENTE.includes(concepto)) {
    return { valor: null, porQue: `«${concepto}» es un importe o una cantidad por definición, no una fracción: cualquier número entre 0 y 1 en su fila es un redondeo, no un coeficiente` }
  }
  const candidatos = valores.filter((v) => typeof v === 'number' && v > 0 && v < 1)
  if (!candidatos.length) return { valor: null, porQue: `la fila no trae ningún valor entre 0 y 1: ${valores.length ? `sólo ${valores.map((v) => v).join(', ')}, que son importes` : 'no trae números'}` }
  if (candidatos.length > 1) return { valor: null, porQue: `la fila trae ${candidatos.length} valores entre 0 y 1 (${candidatos.join(', ')}) y no se sabe cuál es el coeficiente: elegir uno sería arbitrario` }
  return { valor: candidatos[0] }
}

/** Las unidades que cuentan como unidad de cómputo. Las demás son texto suelto de una celda. */
export const UNIDADES_CONOCIDAS = Object.freeze(['m2', 'm3', 'ml', 'm', 'kg', 'tn', 'un', 'gl', 'hs', 'h', 'lt', 'l', 'dia', 'mes', 'global'])

/** La unidad normalizada de un ítem, o `null` si la celda no dice una unidad reconocible. PURA. */
export function unidadNormal(u) {
  const k = String(u ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!k) return null
  const m = { m2: 'm2', mts2: 'm2', metros2: 'm2', m3: 'm3', mts3: 'm3', ml: 'ml', mlineal: 'ml', kg: 'kg', kilos: 'kg', tn: 'tn', un: 'un', unidad: 'un', u: 'un', gl: 'gl', global: 'gl', hs: 'hs', h: 'hs', horas: 'hs' }
  return m[k] ?? (UNIDADES_CONOCIDAS.includes(k) ? k : null)
}

/**
 * CON QUÉ COEFICIENTES SE CERRÓ EL PRECIO, CONCEPTO POR CONCEPTO. PURA.
 *
 * Es la respuesta a «¿con qué gastos generales y qué beneficio venimos cotizando?» sin abrir un solo
 * archivo. Cada concepto sale con sus casos, su dispersión y su madurez: un beneficio que va de 10%
 * a 30% entre obras no tiene media útil, y eso lo dice la dispersión.
 */
export function practicasDeCierre(cotizaciones = []) {
  const porConcepto = new Map()
  const sinCoeficiente = []
  for (const c of cotizaciones) {
    for (const l of c.cierre ?? []) {
      const { valor, porQue } = coeficienteDe(l.valores, l.concepto)
      if (valor === null) { sinCoeficiente.push({ cotizacion: c.nombre, concepto: l.concepto, porQue }); continue }
      porConcepto.set(l.concepto, [...(porConcepto.get(l.concepto) ?? []), caso(c, { valor, cita: l.literal, hoja: l.hoja, fila: l.fila })])
    }
  }
  const salida = []
  for (const [concepto, casos] of [...porConcepto.entries()].sort()) {
    // ═══ EL RANGO VA EN LA AFIRMACIÓN, NO SÓLO EN LA EVIDENCIA ═══
    // «IVA · coeficiente 0,147» con n=5 y madurez A es una media sin sentido de dos costumbres
    // distintas, y leída sin abrir la evidencia dice «el IVA se cotiza al 14,7%», que es falso.
    // Con el rango adelante, la afirmación no se puede confundir con una regla.
    const v = casos.map((c) => c.valor).filter((x) => typeof x === 'number')
    const rango = v.length > 1 && Math.min(...v) !== Math.max(...v)
      ? `entre ${Math.min(...v)} y ${Math.max(...v)} según la obra (${v.length} caso(s))`
      : `${v[0]} en ${v.length} caso(s)`
    salida.push(practica({
      clave: `cotizacion_cliente.cierre.${slug(concepto)}`,
      afirmacion: `en la planilla que se entrega al cliente, «${concepto}» se cotizó ${rango} — ${ADVERTENCIA_CLIENTE}`,
      casos,
    }))
  }
  return { practicas: salida, sinCoeficiente }
}

/** Los RUBROS con los que se arma una cotización y cuántas veces aparece cada uno. PURA. */
export function practicasDeRubros(cotizaciones = []) {
  const porRubro = new Map()
  for (const c of cotizaciones) {
    for (const [i, r] of (c.rubros ?? []).entries()) {
      const k = slug(r.titulo)
      if (!k) continue
      porRubro.set(k, [...(porRubro.get(k) ?? []), caso(c, { valor: i + 1, cita: r.titulo, hoja: r.hoja, fila: r.fila })])
    }
  }
  return [...porRubro.entries()]
    .filter(([, casos]) => casos.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, casos]) => practica({
      clave: `cotizacion_cliente.rubro.${k}`,
      afirmacion: `el rubro «${casos[0].cita}» aparece en ${casos.length} cotización(es) al cliente, en la posición ${casos.map((x) => x.valor).join('/')} — ${ADVERTENCIA_CLIENTE}`,
      casos,
      valorTextual: casos[0].cita,
    }))
}

/** QUÉ UNIDAD SE LE PONE A CADA TIPO DE TAREA. PURA.
 *
 *  Se agrupa por la primera palabra significativa de la descripción —«provisión», «demolición»,
 *  «excavación»— porque la descripción entera nunca se repite dos veces igual y agruparla produciría
 *  una práctica por ítem, que no es una práctica: es una lista. */
export function practicasDeUnidad(cotizaciones = [], { minimoCasos = 3 } = {}) {
  const porTarea = new Map()
  for (const c of cotizaciones) {
    for (const it of c.items ?? []) {
      const u = unidadNormal(it.unidad)
      const verbo = slug(String(it.descripcion ?? '').split(/\s+/)[0])
      if (!u || verbo.length < 4) continue
      const k = `${verbo}|${u}`
      porTarea.set(k, [...(porTarea.get(k) ?? []), caso(c, { valor: it.cantidad ?? null, cita: `${it.descripcion} — ${it.unidad}`, hoja: it.hoja, fila: it.fila })])
    }
  }
  return [...porTarea.entries()]
    .filter(([, casos]) => casos.length >= minimoCasos)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, casos]) => {
      const [verbo, u] = k.split('|')
      return practica({
        clave: `cotizacion_cliente.unidad.${verbo}`,
        afirmacion: `las partidas que empiezan con «${verbo}» se cotizan en ${u} en ${casos.length} caso(s) — ${ADVERTENCIA_CLIENTE}`,
        casos, unidad: u, valorTextual: u,
      })
    })
}

/** Los rótulos de alcance que se declaran POR ESCRITO en la planilla entregada. PURA. */
export const ROTULOS_DE_ALCANCE = Object.freeze([
  ['no_incluye_iva', /no\s+incluye\s+iva/i],
  ['condicion_de_pago', /condici[oó]n\s+de\s+pago|forma\s+de\s+pago|anticipo\s+financiero/i],
  ['plazo_de_obra', /plazo\s+de\s+obra|tiempo\s+de\s+obra|d[ií]as?\s+h[aá]biles/i],
  ['validez_de_la_oferta', /validez\s+de\s+la\s+oferta|validez\s*:/i],
  ['taller_propio', /taller\s+propio|se\s+armar[aá]\s+toda\s+la\s+estructura/i],
  ['computo_informativo', /c[oó]mputos?\s+m[eé]tricos?\s+son\s+a\s+t[ií]tulo\s+informativo/i],
])

/** Qué se declara por escrito, y en cuántas cotizaciones. PURA. */
export function practicasDeAlcance(cotizaciones = []) {
  const por = new Map()
  for (const c of cotizaciones) {
    for (const n of c.notas ?? []) {
      for (const [k, re] of ROTULOS_DE_ALCANCE) {
        if (!re.test(n.texto)) continue
        por.set(k, [...(por.get(k) ?? []), caso(c, { valor: null, cita: n.texto, hoja: n.hoja, fila: n.fila })])
      }
    }
  }
  return [...por.entries()].sort().map(([k, casos]) => practica({
    clave: `cotizacion_cliente.alcance.${k}`,
    afirmacion: `«${k.replace(/_/g, ' ')}» se declara por escrito en ${casos.length} cotización(es) al cliente — ${ADVERTENCIA_CLIENTE}`,
    casos,
    valorTextual: casos[0].cita.slice(0, 200),
  }))
}

/** TODA la práctica de las cotizaciones en formato del cliente. PURA. */
export function practicasCliente(cotizaciones = []) {
  const cierre = practicasDeCierre(cotizaciones)
  const practicas = [...cierre.practicas, ...practicasDeRubros(cotizaciones), ...practicasDeUnidad(cotizaciones), ...practicasDeAlcance(cotizaciones)]
  return {
    practicas,
    sinCoeficiente: cierre.sinCoeficiente,
    resumen: `${practicas.length} práctica(s) sobre ${cotizaciones.length} cotización(es) en formato del cliente · ${cierre.sinCoeficiente.length} línea(s) de cierre sin coeficiente legible`,
  }
}
