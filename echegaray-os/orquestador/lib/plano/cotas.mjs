// ¿PUEDE LA GEOMETRÍA DECIR A QUÉ ELEMENTO PERTENECE UNA COTA? MEDIDO: NO. Esto es lo que quedó.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CAMINO, Y POR QUÉ VALÍA LA PENA PROBARLO
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// «Largo» es la magnitud que más falta en todo el cómputo: 421 huecos de 840 elementos. No la
// resuelve el modelo (los `lineal` computan al 2,0%), no la resuelve el CAD —`medicion-cad.mjs` lo
// dejó escrito: «966 cotas y ninguna dice a qué elemento pertenece»— y el emparejamiento por texto
// murió en su control negativo (88–100% de aciertos contra planos AJENOS: no discriminaba nada).
//
// La hipótesis que faltaba probar era geométrica y es razonable: una cota no es un número suelto,
// es un número escrito SOBRE una línea, y esa línea toca el elemento que mide. PyMuPDF da las dos
// cosas gratis y sin modelo. Si funcionaba, resolvía la magnitud más cara del cómputo a costo cero.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MEDIDO SOBRE LOS 12 PLANOS Y LAS 113 LECTURAS YA PAGADAS — `scripts/cotas-geometria.mjs`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La verdad de referencia son los 30 elementos `lineal` a los que el pipeline SÍ le leyó un largo.
// No es una verdad perfecta —la produjo el mismo modelo— pero es la única disponible, y es la que
// el sistema usa hoy para cotizar.
//
//   la marca del elemento está en la capa de texto de SU plano   207/321 = 64,5%
//   …y la de un plano AJENO en ese mismo texto                            8,5%   ← discrimina 7,6×
//   el largo conocido figura como token en la lámina                26/30 = 87%
//   …y figura sobre una línea (o sea: es una cota detectable)       17/30 = 57%
//   existe la cota correcta a menos de 120 pt de la marca            6/30 = 20%   ← TECHO del método
//   ACIERTO eligiendo la cota más cercana a la marca                 1/20 =  5%
//   …con la marca de OTRO elemento del mismo plano (control)         1/20 =  5%   ← EMPATA
//   ACIERTO midiendo el dibujo y multiplicando por la escala         3/20 = 15%
//   …con la marca de otro elemento (control)                         0/20 =  0%
//
// Los 30 son LECTURAS de 22 elementos distintos, y los 321 sin largo son 213 distintos: un elemento
// leído en dos vistas entra dos veces. Con n=20 un acierto es ruido, y eso también es un resultado:
// «la cota más cercana» acierta lo mismo que apuntar a cualquier otra marca del plano.
//
// ═══ LA CONCLUSIÓN, Y NO ES «FALTA AFINAR EL RANKER» ═══
//
// Detectar SÍ funciona: la marca del elemento aparece en el texto de su plano siete veces y media
// más que la de un plano ajeno, y las cotas que se detectan son cotas. Lo que no funciona es la
// ASIGNACIÓN, exactamente donde ya había fallado el CAD: la regla «la cota más cercana a la marca»
// empata con el azar (1/20 contra 1/20) y la de medir el dibujo saca 3/20 contra 0/20 —una ventaja
// que con n=20 no se puede defender—. El techo con un ranker PERFECTO es 20% a 120 pt y 30% a
// 600 pt, y a 600 pt cada marca tiene decenas de cotas al alcance: un método cuyo MEJOR CASO
// POSIBLE es 20% no resuelve 421 largos.
//
// La razón de fondo es del dibujo, no del código: la cota NO está cerca del rótulo, está cerca del
// DIBUJO del elemento, y saber qué polilínea es «la viga V1» es el mismo problema que no resolvió
// nadie. Y hay un límite duro más: un largo obtenido midiendo píxeles no tiene texto literal que lo
// respalde, así que `origenCitable` lo rechazaría igual — entraría al cómputo como supuesto oculto.
//
// SE CIERRA EL CAMINO. Lo que queda acá son las primitivas puras y el script que reproduce los
// números: si alguien vuelve a abrirlo, que arranque de la medición y no de la intuición.

/** El número que un token declara, o `null`. Un token con letras pegadas («Ø12», «V1») NO es un
 *  valor: aceptarlo metía marcas de elemento en la población de cotas. PURA. */
export function numeroDe(texto) {
  const t = String(texto ?? '').trim().replace(/^[±~]/, '').replace(/[.,;:()]+$/, '')
  if (!/^\d{1,4}([.,]\d{1,3})?$/.test(t)) return null
  const v = Number(t.replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** El ángulo de un segmento en grados, plegado a [0,180): una línea no tiene sentido, tiene
 *  dirección. PURA. */
export const anguloDe = (x0, y0, x1, y1) => ((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI + 180) % 180

/** Cuánto se aparta un ángulo de otro, sin importar por qué lado. PURA. */
export const desvio = (a, b) => Math.min(Math.abs(a - b), 180 - Math.abs(a - b))

/** La distancia de un punto al segmento y DÓNDE cae sobre él (`t`: 0 en un extremo, 1 en el otro).
 *  El `t` es lo que distingue un texto centrado sobre la línea —una cota— de uno apoyado en su
 *  punta, que es un rótulo. PURA. */
export function distanciaAlSegmento(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0
  const dy = y1 - y0
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return { d: Math.hypot(px - x0, py - y0), t: 0 }
  const t = ((px - x0) * dx + (py - y0) * dy) / l2
  const tc = Math.max(0, Math.min(1, t))
  return { d: Math.hypot(px - (x0 + tc * dx), py - (y0 + tc * dy)), t }
}

/**
 * LAS LÍNEAS DE COTA VIENEN PARTIDAS EN DOS: el texto va en el hueco del medio. Sin volver a
 * pegarlas, la longitud que se mide es la mitad y la escala sale al doble. PURA.
 *
 * Se agrupan por (ángulo, distancia perpendicular al origen) —que es la identidad de una recta— y
 * dentro de cada recta se unen los tramos que se solapan o quedan a menos de `gap`.
 */
export function fusionarColineales(segmentos = [], { tolAngulo = 1, tolPerp = 0.6, gap = 60, minimo = 8 } = {}) {
  const grupos = new Map()
  for (const [x0, y0, x1, y1] of segmentos) {
    const l = Math.hypot(x1 - x0, y1 - y0)
    if (!(l > 0)) continue
    const ang = anguloDe(x0, y0, x1, y1)
    const c = (-(y1 - y0) / l) * x0 + ((x1 - x0) / l) * y0
    const k = `${Math.round(ang / tolAngulo)}|${Math.round(c / tolPerp)}`
    const g = grupos.get(k) ?? { origen: [x0, y0], u: [(x1 - x0) / l, (y1 - y0) / l], tramos: [] }
    const [ox, oy] = g.origen
    const [ux, uy] = g.u
    const ta = (x0 - ox) * ux + (y0 - oy) * uy
    const tb = (x1 - ox) * ux + (y1 - oy) * uy
    g.tramos.push([Math.min(ta, tb), Math.max(ta, tb)])
    grupos.set(k, g)
  }
  const cadenas = []
  for (const g of grupos.values()) {
    const [ox, oy] = g.origen
    const [ux, uy] = g.u
    g.tramos.sort((a, b) => a[0] - b[0])
    let act = [...g.tramos[0]]
    const cerrar = () => {
      const largo = act[1] - act[0]
      if (largo >= minimo) cadenas.push({ x0: ox + act[0] * ux, y0: oy + act[0] * uy, x1: ox + act[1] * ux, y1: oy + act[1] * uy, largo })
    }
    for (const [a, b] of g.tramos.slice(1)) {
      if (a <= act[1] + gap) act[1] = Math.max(act[1], b)
      else { cerrar(); act = [a, b] }
    }
    cerrar()
  }
  return cadenas
}

/**
 * LAS COTAS: un número escrito SOBRE una línea, paralelo a ella y no en su punta. PURA.
 *
 * Las tres condiciones son las que separan una cota de los otros centenares de números de una
 * lámina —niveles, códigos, casilleros del cuadro, escalas—. Sin la de paralelismo, cualquier
 * número que cae cerca de un muro dibujado entra como cota.
 */
export function cotasDe(palabras = [], cadenas = [], { tolAngulo = 8, tMin = 0.15, tMax = 0.85 } = {}) {
  const out = []
  for (const p of palabras) {
    const v = numeroDe(p.t)
    if (v === null) continue
    const cx = (p.x0 + p.x1) / 2
    const cy = (p.y0 + p.y1) / 2
    const dmax = Math.max(6, (p.y1 - p.y0) * 1.4)
    const angTexto = anguloDe(0, 0, p.dir?.[0] ?? 1, p.dir?.[1] ?? 0)
    let mejor = null
    for (const c of cadenas) {
      const { d, t } = distanciaAlSegmento(cx, cy, c.x0, c.y0, c.x1, c.y1)
      if (d > dmax || t < tMin || t > tMax) continue
      if (desvio(anguloDe(c.x0, c.y0, c.x1, c.y1), angTexto) > tolAngulo) continue
      if (!mejor || c.largo > mejor.largo) mejor = c
    }
    if (mejor) out.push({ valor: v, texto: p.t, cx, cy, largoPt: mejor.largo })
  }
  return out
}

/** La escala del plano por CONSENSO de sus propias cotas: la que pone de acuerdo a más pares
 *  (valor ÷ largo en puntos). Devuelve también cuántas votaron, porque una escala con tres votos
 *  sobre doscientas cotas no es una escala, es una coincidencia. PURA. */
export function escalaPorConsenso(cotas = [], { tol = 0.02 } = {}) {
  const rs = cotas.filter((c) => c.largoPt > 0).map((c) => c.valor / c.largoPt)
  let escala = null
  let votos = 0
  for (const r of rs) {
    const n = rs.filter((x) => Math.abs(x - r) <= tol * r).length
    if (n > votos) { votos = n; escala = r }
  }
  return { escala, votos, pares: rs.length }
}

/** La cota más cercana a alguna de las apariciones de una marca. PURA — y es exactamente la regla
 *  que se midió al 5%: queda porque el número que la descarta se calcula con ella. */
export function cotaMasCercana(cotas = [], apariciones = [], { radio = 120 } = {}) {
  let mejor = null
  for (const a of apariciones) {
    for (const c of cotas) {
      const d = Math.hypot(c.cx - (a.cx ?? (a.x0 + a.x1) / 2), c.cy - (a.cy ?? (a.y0 + a.y1) / 2))
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { d, cota: c }
    }
  }
  return mejor
}

/** La marca de un elemento, normalizada para poder buscarla en la capa de texto: sin acentos, sin
 *  separadores y en mayúsculas. «V-1» en el JSON y «V1» en el plano son la misma viga. PURA. */
export const normalizarMarca = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Dos largos son el mismo aunque estén en unidades distintas: el plano escribe 350 donde el
 *  cómputo guarda 3,50. Sin esto, el 100% de los aciertos se contaría como error. PURA. */
export const FACTORES_DE_UNIDAD = Object.freeze([1, 0.01, 0.001, 100, 1000])
export function mismoLargo(valor, referencia, { tol = 0.02 } = {}) {
  if (!(referencia > 0) || !(valor > 0)) return false
  return FACTORES_DE_UNIDAD.some((f) => Math.abs(valor * f - referencia) <= tol * referencia)
}
