// PARTIR UNA LÁMINA EN LAS REGIONES QUE LA COMPONEN. Puro, determinístico, sin modelo.
//
// ═══ EL BLOQUEO QUE ESTE ARCHIVO EXISTE PARA SACAR ═══
//
// Una lámina de obra no es un dibujo: son seis u ocho dibujos distintos pegados en la misma hoja
// —la planta, dos cortes, tres detalles, la planilla de columnas y la carátula—, cada uno en su
// escala. Mandarla entera al modelo tiene dos costos que se pagan juntos: la resolución por dibujo
// queda tan baja que los símbolos chicos se pierden, y la respuesta mezcla cotas de una vista con
// elementos de otra. Medido en el piloto: el usuario terminaba recortando los planos a mano.
//
// ═══ POR QUÉ CÓDIGO Y NO VISIÓN ═══
//
// Encontrar las regiones es un problema de geometría, no de comprensión: los dibujos están
// SEPARADOS POR ESPACIO EN BLANCO. Agrupar cajas que se tocan y devolver las envolventes es
// determinístico, cuesta cero y da lo mismo todas las veces. Lo que sí necesita entender —qué es
// cada región— se decide primero por el TÍTULO que el propio plano escribe al lado del dibujo, y
// sólo cuando no hay título queda `indeterminado`, que es una respuesta honesta.
//
// La clave del método es la HOLGURA: dos trazos del mismo dibujo están a milímetros; dos dibujos
// distintos están a centímetros. Ese hueco es el que separa, y es un parámetro visible y no una
// constante escondida, porque depende del tamaño de la lámina.

/** Cuánto espacio en blanco separa dos dibujos distintos, como fracción del lado menor de la hoja.
 *  Medido sobre láminas A1 y A0: por debajo de esto son partes del mismo dibujo. */
export const HOLGURA = 0.02

/** Una región más chica que esto —fracción del área de la hoja— no es un dibujo: es una nota, un
 *  sello o una flecha suelta. Se descarta del listado de regiones y NO se pierde: queda contada. */
export const AREA_MINIMA = 0.004

const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
const areaDe = (c) => Math.max(0, c[2] - c[0]) * Math.max(0, c[3] - c[1])

/** ¿Dos cajas están lo bastante cerca como para ser parte del mismo dibujo? PURA. */
export function seTocan(a, b, holgura) {
  return a[0] - holgura <= b[2] && b[0] - holgura <= a[2] && a[1] - holgura <= b[3] && b[1] - holgura <= a[3]
}

/**
 * AGRUPAR CAJAS EN REGIONES. PURA.
 *
 * Es un componente conexo con tolerancia: se arranca con cada caja como su propio grupo y se van
 * fusionando los que se tocan, hasta que una pasada completa no fusiona nada. No es el algoritmo
 * más rápido posible y sí es el más fácil de auditar, que en este circuito vale más: una lámina
 * tiene miles de trazos, no millones.
 */
export function agrupar(cajas = [], { holgura = 0 } = {}) {
  let grupos = cajas.filter(Boolean).map((c) => ({ caja: [...c], miembros: 1 }))
  let fusiono = true
  while (fusiono) {
    fusiono = false
    const siguiente = []
    for (const g of grupos) {
      const destino = siguiente.find((s) => seTocan(s.caja, g.caja, holgura))
      if (destino) { destino.caja = union(destino.caja, g.caja); destino.miembros += g.miembros; fusiono = true }
      else siguiente.push(g)
    }
    grupos = siguiente
  }
  // El orden es TOTAL —de arriba hacia abajo y de izquierda a derecha, con desempate por tamaño—
  // para que dos corridas devuelvan las regiones en el mismo orden y los recortes sean comparables.
  return grupos.sort((a, b) => b.caja[3] - a.caja[3] || a.caja[0] - b.caja[0] || areaDe(b.caja) - areaDe(a.caja))
}

/** Qué puede ser una región de una lámina. */
export const TIPO_REGION = Object.freeze({
  PLANTA: 'planta', CORTE: 'corte', DETALLE: 'detalle', VISTA: 'vista',
  CUADRO: 'cuadro', CARATULA: 'caratula', INDETERMINADO: 'indeterminado',
})

/** Los títulos con los que un plano de obra nombra cada vista. El orden importa: «planta de
 *  fundación» es una planta, y «detalle de planta» —que casi no existe— sería un detalle. */
const TITULOS = Object.freeze([
  [TIPO_REGION.DETALLE, /\bdetalle|\bdet\.\s|\bdespiece/i],
  [TIPO_REGION.CORTE, /\bcorte\b|\bsecci[oó]n\b|\bs-?\d|\bcorte\s+[a-z]-[a-z]/i],
  [TIPO_REGION.PLANTA, /\bplanta\b|\bplanimetr|\bfundaci[oó]n\b|\bestructura\b|\bimplantaci/i],
  [TIPO_REGION.VISTA, /\bvista\b|\bfachada\b|\bfrente\b|\blateral\b|\belevaci[oó]n\b/i],
  [TIPO_REGION.CUADRO, /\bplanilla\b|\bcuadro\b|\btabla\b|\breferencias?\b|\bc[oó]mputo\b/i],
  [TIPO_REGION.CARATULA, /\bescala\b|\bl[aá]mina\b|\bproyecto\s*:|\bpropietario\b|\bubicaci[oó]n\b|\bplano\s*n|\brel[eé]v/i],
])

/** ¿Este texto cae dentro de la región? PURA. */
const dentro = (caja, t) => t.x >= caja[0] && t.x <= caja[2] && t.y >= caja[1] && t.y <= caja[3]

/**
 * QUÉ ES CADA REGIÓN, según lo que el propio plano escribe adentro. PURA.
 *
 * No se adivina por forma ni por posición salvo en un caso: la carátula, que en TODA lámina de obra
 * está en la esquina inferior derecha y suele no tener una palabra que la delate. Fuera de eso, si
 * el plano no escribió un título, la región queda `indeterminado` con confianza baja — y eso es lo
 * que después decide si vale la pena gastar una mirada del modelo en ella.
 */
export function clasificarRegion(caja, textos = [], { ancho = 1, alto = 1 } = {}) {
  const adentro = textos.filter((t) => dentro(caja, t))
  for (const [tipo, re] of TITULOS) {
    const t = adentro.find((x) => re.test(String(x.texto ?? '')))
    if (t) return { tipo, confianza: 'alta', porQue: `el plano lo titula «${String(t.texto).slice(0, 60)}»`, textoLiteral: String(t.texto).slice(0, 120) }
  }
  const esquinaInferiorDerecha = caja[0] > ancho * 0.55 && caja[3] < alto * 0.45
  if (esquinaInferiorDerecha && adentro.length >= 3) {
    return { tipo: TIPO_REGION.CARATULA, confianza: 'media', porQue: 'está en la esquina inferior derecha y tiene texto: es donde va la carátula en toda lámina de obra', textoLiteral: null }
  }
  return { tipo: TIPO_REGION.INDETERMINADO, confianza: 'baja', porQue: 'la región no tiene ningún título que diga qué es', textoLiteral: null }
}

/**
 * ═══ POR QUÉ LA CONECTIVIDAD SOLA NO ALCANZA, MEDIDO ═══
 *
 * Sobre los dos planos reales de Quattropani, agrupar por espacio en blanco devuelve UNA región que
 * tapa el 95% de la hoja, con holgura 16 y con holgura 0 por igual. No es un umbral mal elegido: en
 * un PDF exportado de CAD, el marco de la lámina, las líneas de cota y los llamados CONECTAN todos
 * los dibujos entre sí. No hay espacio en blanco que los separe.
 *
 * Pero el plano SÍ dice dónde empieza cada dibujo: lo escribe. «PLANTA BAJA», «CORTE A-A»,
 * «ESTRUCTURA FUNDACION», «DETALLE ESCALERA METALICA» son los textos MÁS GRANDES de la lámina y
 * están al pie de su vista. Anclar en ellos y repartir la geometría por cercanía usa la semántica
 * que el proyectista ya puso, en vez de pelearle a la geometría.
 *
 * En esos dos planos: 7 vistas en el de arquitectura y 5 en el de estructura, contra 1 y 1.
 */

/** Un título de vista tiene que decir QUÉ VISTA ES. Sin este filtro, «H=6.10m» y «Zona: C3» —que
 *  están en el mismo cuerpo de letra que los títulos— se vuelven anclas y parten la lámina por la
 *  mitad en lugares donde no empieza ningún dibujo. */
const VOCABULARIO_TITULO = /\b(planta|corte|secci[oó]n|vista|fachada|elevaci[oó]n|detalle|planimetr|implantaci|estructura|fundaci|entre\s?piso|cubierta|techo|escalera|croquis|planilla|cuadro|referencias?)\b/i

/** La mediana de una lista de números. PURA. */
const mediana = (xs) => {
  const o = [...xs].filter(Number.isFinite).sort((a, b) => a - b)
  return o.length ? o[Math.floor(o.length / 2)] : 0
}

/**
 * LOS TÍTULOS DE VISTA DE UNA LÁMINA. PURA.
 *
 * Dos condiciones a la vez: cuerpo de letra por encima de la mediana —un título se escribe más
 * grande que una cota— y vocabulario de vista. Una sola de las dos produce falsos: la altura sola
 * agarra el número de plano y el vocabulario solo agarra cada «ver detalle» del dibujo.
 */
export function titulosDe(textos = [], { factorAltura = 1.35, largoMinimo = 4 } = {}) {
  const alturas = textos.map((t) => t.alto).filter((h) => Number.isFinite(h) && h > 0)
  const base = mediana(alturas)
  if (!base) return []
  return textos
    .filter((t) => String(t.texto ?? '').trim().length >= largoMinimo)
    .filter((t) => Number(t.alto) >= base * factorAltura)
    .filter((t) => VOCABULARIO_TITULO.test(String(t.texto)))
    .map((t) => ({ x: t.x, y: t.y, alto: t.alto, texto: String(t.texto).trim() }))
    .sort((a, b) => b.y - a.y || a.x - b.x || a.texto.localeCompare(b.texto))
}

const centro = (c) => [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]

/** Un trazo que tapa media hoja NO es un dibujo: es el marco de la lámina, la grilla o un rayado que
 *  cruza todo. Repartido por cercanía se le cuelga a alguna vista y le infla la caja hasta la hoja
 *  entera — medido: la región «ENTRE PISO» salía ocupando el 93% del plano. Se cuentan y se dicen. */
export const FRACCION_MARCO = 0.5

/** Una caja recortada a los límites de la hoja. Una región no puede ser más grande que el papel, y
 *  cuando lo es el recorte falla sin explicación. PURA. */
export const dentroDeLaHoja = (c, ancho, alto) => [
  Math.max(0, Math.min(c[0], ancho)), Math.max(0, Math.min(c[1], alto)),
  Math.max(0, Math.min(c[2], ancho)), Math.max(0, Math.min(c[3], alto)),
]

/**
 * SEGMENTAR ANCLANDO EN LOS TÍTULOS. PURA.
 *
 * Cada caja —trazo o texto— va al título MÁS CERCANO, dentro de un radio. El radio existe para que
 * un sello en la otra punta de la hoja no se cuelgue de la planta: lo que queda afuera de todo radio
 * se cuenta como `sueltas` y se dice, no se reparte a la fuerza.
 */
export function segmentarPorTitulos({ ancho = 0, alto = 0, trazos = [], textos = [] } = {}, { radio = null, areaMinima = AREA_MINIMA } = {}) {
  const titulos = titulosDe(textos)
  if (titulos.length < 2) return null
  const diagonal = Math.hypot(ancho, alto) || 1
  const r = radio ?? diagonal * 0.45
  const areaPapel = (ancho * alto) || 1
  const marco = trazos.filter((c) => areaDe(c) >= areaPapel * FRACCION_MARCO)
  const cajas = [
    ...trazos.filter((c) => areaDe(c) < areaPapel * FRACCION_MARCO).map((c) => ({ caja: c, texto: null })),
    ...textos.map((t) => ({ caja: [t.x, t.y, t.x + (t.ancho ?? 0), t.y + (t.alto ?? 8)], texto: t.texto })),
  ]
  const grupos = titulos.map((t) => ({ titulo: t, caja: null, miembros: 0 }))
  let sueltas = 0
  for (const c of cajas) {
    const [cx, cy] = centro(c.caja)
    let mejor = -1
    let mejorD = Infinity
    for (let i = 0; i < titulos.length; i++) {
      const d = Math.hypot(cx - titulos[i].x, cy - titulos[i].y)
      // El desempate por índice mantiene el reparto igual entre corridas cuando dos títulos quedan
      // exactamente a la misma distancia.
      if (d < mejorD) { mejorD = d; mejor = i }
    }
    if (mejor < 0 || mejorD > r) { sueltas++; continue }
    const g = grupos[mejor]
    g.caja = g.caja ? union(g.caja, c.caja) : [...c.caja]
    g.miembros++
  }
  const areaHoja = areaPapel
  for (const g of grupos) if (g.caja) g.caja = dentroDeLaHoja(g.caja, ancho, alto)
  const conGeometria = grupos.filter((g) => g.caja && areaDe(g.caja) >= areaHoja * areaMinima)
  const regiones = conGeometria.map((g, i) => ({
    n: i + 1,
    caja: g.caja.map((v) => Math.round(v * 100) / 100),
    ancho: Math.round((g.caja[2] - g.caja[0]) * 100) / 100,
    alto: Math.round((g.caja[3] - g.caja[1]) * 100) / 100,
    fraccionDeHoja: Math.round((areaDe(g.caja) / areaHoja) * 1000) / 1000,
    elementos: g.miembros,
    ...clasificarPorTitulo(g.titulo.texto),
    titulo: g.titulo.texto,
    anclaje: { x: Math.round(g.titulo.x * 100) / 100, y: Math.round(g.titulo.y * 100) / 100 },
  }))
  return {
    metodo: 'TITULOS',
    radio: Math.round(r * 100) / 100,
    regiones,
    descartadas: grupos.length - conGeometria.length,
    porQueDescartadas: grupos.length > conGeometria.length ? `${grupos.length - conGeometria.length} título(s) no juntaron geometría suficiente: son referencias dentro de otro dibujo, no vistas propias` : null,
    sueltas,
    marco: marco.length,
    porQueMarco: marco.length ? `${marco.length} trazo(s) tapan más del ${FRACCION_MARCO * 100}% de la hoja: son el marco y la carátula de la lámina, no dibujos, y se dejan afuera del reparto` : null,
    cobertura: Math.round((conGeometria.reduce((a, g) => a + areaDe(g.caja), 0) / areaHoja) * 1000) / 1000,
  }
}

/** Qué vista es, según lo que dice su propio título. PURA. */
export function clasificarPorTitulo(texto) {
  for (const [tipo, re] of TITULOS) {
    if (re.test(String(texto ?? ''))) return { tipo, confianza: 'alta', porQue: `el plano titula esta vista «${String(texto).slice(0, 60)}»`, textoLiteral: String(texto).slice(0, 120) }
  }
  return { tipo: TIPO_REGION.INDETERMINADO, confianza: 'media', porQue: `«${String(texto).slice(0, 40)}» es un título pero no dice qué tipo de vista es`, textoLiteral: String(texto).slice(0, 120) }
}

/**
 * SEGMENTAR UNA LÁMINA. PURA — no abre archivos, no mira nada: recibe la geometría ya extraída.
 *
 * Devuelve las regiones con su caja, su tipo y las coordenadas EN LA HOJA, que es lo que después
 * permite recortarla y —más importante— citar de dónde salió cada dato: «lámina 3, región (x0,y0)-
 * (x1,y1), corte A-A». Sin esa coordenada, la evidencia de un cómputo es «lo dice el plano», que no
 * se puede verificar.
 */
export function segmentar({ ancho = 0, alto = 0, trazos = [], textos = [] } = {}, { holgura = null, areaMinima = AREA_MINIMA, porTitulos = true } = {}) {
  // PRIMERO LOS TÍTULOS. La conectividad queda de respaldo para las láminas que no titulan sus
  // vistas —un croquis, una foto vectorizada, un detalle suelto—, donde el espacio en blanco sí
  // separa porque no hay marco ni cadena de cotas que una todo.
  if (porTitulos) {
    const porTitulo = segmentarPorTitulos({ ancho, alto, trazos, textos }, { areaMinima })
    if (porTitulo && porTitulo.regiones.length >= 2) return porTitulo
  }
  const lado = Math.min(ancho, alto) || 1
  const h = holgura ?? lado * HOLGURA
  const cajasTexto = textos.map((t) => [t.x, t.y, t.x + (t.ancho ?? 0), t.y + (t.alto ?? 8)])
  const grupos = agrupar([...trazos, ...cajasTexto], { holgura: h })
  const areaHoja = (ancho * alto) || 1
  const grandes = grupos.filter((g) => areaDe(g.caja) >= areaHoja * areaMinima)
  const regiones = grandes.map((g, i) => ({
    n: i + 1,
    caja: g.caja.map((v) => Math.round(v * 100) / 100),
    ancho: Math.round((g.caja[2] - g.caja[0]) * 100) / 100,
    alto: Math.round((g.caja[3] - g.caja[1]) * 100) / 100,
    fraccionDeHoja: Math.round((areaDe(g.caja) / areaHoja) * 1000) / 1000,
    elementos: g.miembros,
    ...clasificarRegion(g.caja, textos, { ancho, alto }),
  }))
  return {
    metodo: 'CONECTIVIDAD',
    holgura: Math.round(h * 100) / 100,
    regiones,
    descartadas: grupos.length - grandes.length,
    porQueDescartadas: grupos.length > grandes.length ? `${grupos.length - grandes.length} grupos quedaron por debajo del ${areaMinima * 100}% de la hoja: son notas, sellos o flechas sueltas, no dibujos` : null,
    cobertura: Math.round((grandes.reduce((a, g) => a + areaDe(g.caja), 0) / areaHoja) * 1000) / 1000,
  }
}
