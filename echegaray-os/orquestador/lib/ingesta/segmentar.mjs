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
 * SEGMENTAR UNA LÁMINA. PURA — no abre archivos, no mira nada: recibe la geometría ya extraída.
 *
 * Devuelve las regiones con su caja, su tipo y las coordenadas EN LA HOJA, que es lo que después
 * permite recortarla y —más importante— citar de dónde salió cada dato: «lámina 3, región (x0,y0)-
 * (x1,y1), corte A-A». Sin esa coordenada, la evidencia de un cómputo es «lo dice el plano», que no
 * se puede verificar.
 */
export function segmentar({ ancho = 0, alto = 0, trazos = [], textos = [] } = {}, { holgura = null, areaMinima = AREA_MINIMA } = {}) {
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
    holgura: Math.round(h * 100) / 100,
    regiones,
    descartadas: grupos.length - grandes.length,
    porQueDescartadas: grupos.length > grandes.length ? `${grupos.length - grandes.length} grupos quedaron por debajo del ${areaMinima * 100}% de la hoja: son notas, sellos o flechas sueltas, no dibujos` : null,
    cobertura: Math.round((grandes.reduce((a, g) => a + areaDe(g.caja), 0) / areaHoja) * 1000) / 1000,
  }
}
