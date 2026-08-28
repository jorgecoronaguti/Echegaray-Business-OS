// DE UN ELEMENTO LEÍDO A UNA CANTIDAD COMPUTADA. Puro: entran números, salen números.
//
// El modelo ya hizo lo suyo —miró el plano y dijo «C1 mide 0,30 × 0,50 × 3,50 y hay 8»—. Acá no se
// vuelve a consultar a nadie: multiplicar es de la computadora. Es la misma frontera que ya declara
// `computo-constructivo.mjs`, y por eso las fórmulas geométricas se toman de ahí en vez de
// reescribirse: `volumenPrisma` ya sabe qué hacer cuando falta una arista.
//
// ═══ LO QUE ESTE ARCHIVO AGREGA SOBRE `computo-constructivo` ═══
//
// Aquel módulo computa UN elemento cuando ya sabés qué es (una excavación, una viga). Éste recibe
// una lista heterogénea salida de un plano —columnas, correas, paneles, portones— y tiene que
// decidir, por la FORMA declarada, qué fórmula le toca a cada uno y en qué unidad sale. Nada más.
//
// ═══ POR QUÉ LA CANTIDAD MULTIPLICA Y EL VOLUMEN UNITARIO SE CONSERVA ═══
//
// Ocho columnas de 0,525 m³ son 4,20 m³, y la partida se cotiza sobre los 4,20. Pero el que revisa
// el cómputo necesita ver el 0,525 para poder decir «esa columna está mal medida»: el total no se
// puede auditar, el unitario sí. Por eso salen los dos, y el total dice explícitamente de qué
// unitario × qué cantidad viene.

import { CLASE, RESPALDO, magnitud, volumenPrisma } from '../computo-constructivo.mjs'
import { FORMA, MODO } from './interpretar.mjs'
import { FUENTE, faltaDato } from './fuente.mjs'

const val = (d) => (d && typeof d === 'object' && 'valor' in d ? d.valor : d ?? null)

/** Las aristas que cada forma necesita. Un elemento al que le falta una NO se computa: sale con el
 *  hueco declarado y el nombre de la arista que falta. */
const REQUIERE = Object.freeze({
  [FORMA.PRISMA]: ['ancho', 'alto', 'largo'],
  [FORMA.LINEAL]: ['largo'],
  [FORMA.SUPERFICIE]: [],   // acepta `area`, o `largo`+`ancho`
  [FORMA.CONTEO]: [],
})

const UNIDAD = Object.freeze({
  [FORMA.PRISMA]: 'm3', [FORMA.LINEAL]: 'm', [FORMA.SUPERFICIE]: 'm2', [FORMA.CONTEO]: 'un',
})

/** La superficie unitaria: `area` si el plano la trae, si no `largo × ancho`. `null` si no hay
 *  forma de sostenerla — no se asume que un elemento sin ancho sea de un metro. */
function superficieUnitaria(dim) {
  const area = val(dim.area)
  if (area !== null) {
    return magnitud({ valor: area, unidad: 'm2', clase: CLASE.EXTRAIDO, respaldo: RESPALDO.NORMA, formula: 'superficie acotada en el plano', entradas: { area } })
  }
  const l = val(dim.largo), a = val(dim.ancho)
  if (l === null || a === null) return null
  return magnitud({ valor: l * a, unidad: 'm2', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA, formula: 'largo × ancho', entradas: { largo: l, ancho: a } })
}

/** La magnitud UNITARIA de un elemento según su forma. `null` cuando no se puede sostener. */
function unitaria(forma, dim) {
  if (forma === FORMA.PRISMA) return volumenPrisma(val(dim.ancho), val(dim.alto), val(dim.largo), { nombres: ['ancho', 'alto', 'largo'] }).volumen
  if (forma === FORMA.LINEAL) {
    const l = val(dim.largo)
    return l === null ? null : magnitud({ valor: l, unidad: 'm', clase: CLASE.EXTRAIDO, respaldo: RESPALDO.NORMA, formula: 'longitud acotada en el plano', entradas: { largo: l } })
  }
  if (forma === FORMA.SUPERFICIE) return superficieUnitaria(dim)
  if (forma === FORMA.CONTEO) return magnitud({ valor: 1, unidad: 'un', clase: CLASE.EXTRAIDO, respaldo: RESPALDO.NORMA, formula: 'la unidad es el elemento', entradas: {} })
  return null
}

/** Qué aristas le faltan a este elemento para su forma. PURA. */
export function aristasFaltantes(elemento) {
  const req = REQUIERE[elemento?.forma] ?? []
  const faltan = req.filter((k) => val(elemento?.dimensiones?.[k]) === null)
  if (elemento?.forma === FORMA.SUPERFICIE) {
    const d = elemento.dimensiones ?? {}
    if (val(d.area) === null && (val(d.largo) === null || val(d.ancho) === null)) faltan.push('área (o largo y ancho)')
  }
  return faltan
}

/**
 * CUÁNTOS HAY — la división que el modelo tiene prohibido hacer.
 *
 * ═══ POR QUÉ ESTA FUNCIÓN EXISTE ═══
 *
 * Medido en la primera corrida sobre Quattropani: de 47 elementos leídos correctamente del plano,
 * 42 salieron sin cómputo, y en 40 de esos 42 el motivo era el mismo — «cantidad: no se puede
 * contar con certeza». No era una falla de la lectura: un plano de obra NO tabula «hay 12 correas».
 * Lo dice con la grilla, y la grilla estaba a la vista («1.63 1.63 1.63 1.63 1.63 1.63» sobre un
 * total de 18.30). Lo que faltaba era pedir la separación en vez del resultado.
 *
 * `n = longitud / separación + 1` cuando los dos extremos llevan elemento, `n = longitud /
 * separación` cuando no. El `+1` es el error clásico del poste y la cerca, y por eso el plano tiene
 * que declarar `incluyeExtremos` en vez de que el código lo decida: en un techo las dos correas de
 * borde existen, en una junta de dilatación no.
 *
 * Se redondea hacia arriba porque un tramo sobrante también lleva su elemento. PURA.
 */
export function cantidadDeElementos(rep) {
  if (!rep || rep.modo === MODO.INDETERMINABLE) {
    return { valor: null, porQue: rep?.textoLiteral ?? 'el plano no declara cuántos hay ni con qué separación' }
  }
  if (rep.modo === MODO.CONTEO || rep.modo === MODO.EJES) {
    if (rep.cantidad === null) return { valor: null, porQue: `se declaró ${rep.modo} sin decir cuántos` }
    return {
      valor: rep.cantidad,
      magnitud: magnitud({
        valor: rep.cantidad, unidad: 'un', clase: CLASE.EXTRAIDO, respaldo: RESPALDO.NORMA,
        formula: rep.modo === MODO.CONTEO ? 'contados en el dibujo' : 'uno por eje/pórtico que lo lleva',
        entradas: { cantidad: rep.cantidad }, fuente: FUENTE.EXTRAIDO_PLANO,
      }),
    }
  }
  const L = rep.longitudTramo, s = rep.separacion
  if (L === null || s === null || s <= 0) return { valor: null, porQue: 'se declaró por separación pero falta la longitud del tramo o la separación' }
  // EL «+1» NO LO DECIDE EL CÓDIGO. Es la diferencia entre 12 correas y 13 —+8,3% sobre la partida
  // en la correa real de Quattropani— y depende de si los dos extremos del tramo llevan elemento,
  // que lo sabe el plano y no el motor. Sin declarar, la cantidad no existe: existe la pregunta.
  if (rep.incluyeExtremos === null || rep.incluyeExtremos === undefined) {
    return { valor: null, porQue: 'se declaró por separación pero el plano no dice si los DOS EXTREMOS del tramo llevan elemento: es la diferencia entre n y n+1, y la decide el plano, no el código' }
  }
  const n = Math.ceil(L / s) + (rep.incluyeExtremos ? 1 : 0)
  return {
    valor: n,
    magnitud: magnitud({
      valor: n, unidad: 'un', clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: `techo(longitud del tramo ÷ separación)${rep.incluyeExtremos ? ' + 1 (los dos extremos llevan elemento)' : ''}`,
      entradas: { longitudTramo: L, separacion: s, incluyeExtremos: rep.incluyeExtremos }, fuente: FUENTE.CALCULADO,
    }),
  }
}

/**
 * EL CÓMPUTO DE UN ELEMENTO. Devuelve siempre un objeto: el que no se pudo computar sale con
 * `cantidad: null` y con el motivo — un elemento que desaparece del resultado porque le faltaba una
 * medida es exactamente cómo se cotiza de menos sin enterarse.
 */
export function computarElemento(elemento) {
  const base = {
    id: elemento?.id ?? null,
    nombre: elemento?.nombre ?? null,
    sistema: elemento?.sistema ?? null,
    forma: elemento?.forma ?? null,
    lamina: elemento?.lamina ?? null,
    archivo: elemento?.archivo ?? null,
    material: val(elemento?.material),
    especificacion: elemento?.especificacion ?? null,
    evidencia: elemento?.evidencia ?? null,
    dimensiones: elemento?.dimensiones ?? {},
  }
  if (!elemento?.computable) {
    return { ...base, unitaria: null, cantidadElementos: null, cantidad: null, unidad: null, faltan: [elemento?.porQueNoComputable ?? 'no computable'] }
  }
  const faltan = aristasFaltantes(elemento)
  const u = faltan.length ? null : unitaria(elemento.forma, elemento.dimensiones)
  const rep = cantidadDeElementos(elemento.repeticion)
  const n = rep.valor
  if (!u || n === null) {
    return {
      ...base, unitaria: u, cantidadElementos: n, cantidad: null, unidad: UNIDAD[elemento.forma] ?? null,
      faltan: [...faltan, ...(n === null ? [`cantidad de elementos: ${rep.porQue}`] : [])],
      hueco: faltaDato({
        que: `cómputo de ${base.nombre}`,
        porque: faltan.length ? `falta ${faltan.join(', ')} en la documentación disponible` : rep.porQue,
        unidad: UNIDAD[elemento.forma] ?? null,
      }),
    }
  }
  return {
    ...base,
    unitaria: u,
    cantidadElementos: n,
    comoSeContaron: rep.magnitud ?? null,
    unidad: u.unidad,
    cantidad: magnitud({
      valor: u.valor * n, unidad: u.unidad, clase: CLASE.CALCULADO, respaldo: RESPALDO.NORMA,
      formula: `${u.formula} × cantidad de elementos`,
      entradas: { unitaria: u.valor, cantidadElementos: n },
      fuente: FUENTE.CALCULADO,
    }),
    faltan: [],
  }
}

/** El cómputo de una lista de elementos, con el recuento que después va al resumen ejecutivo. */
export function computarElementos(elementos = []) {
  const items = elementos.map(computarElemento)
  return {
    items,
    detectados: elementos.length,
    computados: items.filter((i) => i.cantidad !== null).length,
    conHueco: items.filter((i) => i.cantidad === null).length,
  }
}
