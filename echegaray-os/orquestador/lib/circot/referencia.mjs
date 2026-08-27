// EL CIRCOT COMO CONTROL ADVERSARIAL, NUNCA COMO RESPUESTA. Puro.
//
// ═══ QUÉ PUEDE Y QUÉ NO PUEDE HACER ESTA REFERENCIA ═══
//
// PUEDE: decir que a un presupuesto le falta una partida que en San Juan siempre está; decir que
// una mano de obra quedó fuera de la banda orientadora del mes; proponer una PARTIDA_CANDIDATA con
// nombre y unidad; dar un piso y un techo cuando ECSAS no tiene el dato.
//
// NO PUEDE: escribir un precio, tocar la Base Maestra, cambiar un rendimiento, ni entrar sola a una
// cotización. Todo lo que propone sale como PROPUESTA con estado, y alguien la confirma. Un ítem
// que aparece en el CIRCOT y se agrega en silencio al presupuesto es una partida inventada con
// aspecto de dato.
//
// ═══ POR QUÉ EL MATCHEO NO ES POR TEXTO ═══
//
// «Mampost. Lad. Común 0,30 a revocar» y «Mampost. Lad. Común 0,30 visto» comparten todas las
// palabras menos una y difieren en $ 15.292 por m³ de mano de obra. «HºAº p/vigas de fundación» y
// «HºAº p/vigas de arriostramiento» comparten cinco de seis. Un puntaje de vocabulario los confunde
// siempre. Lo que los separa —terminación, ubicación, espesor, material, método— son ATRIBUTOS, y
// por eso el matcheo pasa primero por `comparar` y sólo después mira las palabras.

import { atributosDe, comparar } from '../plano/atributos.mjs'

/** Las unidades que son la misma cosa escritas distinto. Fuera de esta tabla, dos unidades
 *  distintas no se comparan: contrastar un m³ contra un precio por m² no da un aviso, da ruido. */
const EQUIVALENTES = Object.freeze({ m3: ['m3'], m2: ['m2'], m: ['m', 'ml'], un: ['un', 'u'], kg: ['kg'], gl: ['gl'] })
const mismaUnidad = (a, b) => (EQUIVALENTES[String(a ?? '').toLowerCase()] ?? []).includes(String(b ?? '').toLowerCase())

const RUIDO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'en', 'a', 'por', 'gral', 'general', 'completo'])

/** La raíz de una palabra: sólo se le saca la «s» final. Es la diferencia entre que «HºAº p/bases»
 *  matchee con «base de hormigón armado» y que no matchee con nada — medido sobre la tabla real.
 *  No se hace nada más agresivo a propósito: un stemmer que corta de más junta «revoque» con
 *  «revestimiento» y ahí el control empieza a mentir. PURA. */
export const raiz = (w) => (w.length >= 5 && w.endsWith('s') ? w.slice(0, -1) : w)

/** Palabras significativas, sin tildes ni signos, reducidas a su raíz. PURA. */
export function palabras(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !RUIDO.has(w)).map(raiz)
}

/** Cuánto se solapan dos vocabularios, de 0 a 1 (Jaccard). PURA. */
export function solapamiento(a, b) {
  const A = new Set(palabras(a))
  const B = new Set(palabras(b))
  if (!A.size || !B.size) return 0
  let comunes = 0
  for (const w of A) if (B.has(w)) comunes++
  return Math.round((comunes / (A.size + B.size - comunes)) * 1000) / 1000
}

/** Mínimo de solapamiento para considerar que dos descripciones hablan de lo mismo, una vez que los
 *  atributos ya dijeron que no se contradicen. */
export const MINIMO_SOLAPE = 0.25

/**
 * LOS ÍTEMS DEL CIRCOT QUE PODRÍAN SER ESTA PARTIDA. PURA.
 *
 * Tres filtros en este orden y no en otro: unidad (si no coincide no hay nada que comparar),
 * atributos (si se contradicen NO es lo mismo por más que el texto se parezca), y recién entonces
 * vocabulario. El orden importa: hacerlo al revés es el matcheo por texto con un chequeo decorativo
 * adelante.
 */
export function buscar({ nombre, descripcion, unidad, material, especificacion } = {}, referencia = {}) {
  const texto = [nombre, descripcion, material, especificacion].filter(Boolean).join(' · ')
  const attr = atributosDe(texto)
  const salida = []
  for (const it of referencia?.items ?? []) {
    if (unidad && !mismaUnidad(unidad, it.unidad)) continue
    const cmp = comparar(attr, atributosDe(it.descripcion))
    if (cmp.conflictos.length) continue
    const solape = solapamiento(texto, it.descripcion)
    if (solape < MINIMO_SOLAPE) continue
    salida.push({
      codigo: it.codigo, rubro: it.rubro, descripcion: it.descripcion, unidad: it.unidad,
      mo_min: it.mo_min, mo_max: it.mo_max, periodo: it.periodo,
      solape, coincidencias: cmp.coincidencias.length, sinRespaldo: cmp.sinRespaldo,
      puntaje: Math.round((solape + cmp.coincidencias.length * 0.2) * 1000) / 1000,
    })
  }
  salida.sort((a, b) => b.puntaje - a.puntaje || String(a.codigo).localeCompare(String(b.codigo)))
  return salida
}

/** Qué se puede decir de una mano de obra contra la banda orientadora del mes. */
export const CONTRASTE = Object.freeze({
  DENTRO: 'DENTRO', BAJO: 'BAJO_LA_BANDA', ALTO: 'SOBRE_LA_BANDA', SIN_REFERENCIA: 'SIN_REFERENCIA', AMBIGUO: 'AMBIGUO',
})

/**
 * CONTRASTAR LA MANO DE OBRA DE UNA PARTIDA CONTRA EL CIRCOT. PURA.
 *
 * No corrige nada y no propone un precio: dice dónde cae el nuestro. Y cuando hay dos ítems del
 * CIRCOT igual de parecidos devuelve AMBIGUO en vez de tomar el primero — dos bandas distintas dan
 * dos veredictos distintos, y elegir una al azar convierte un control en una moneda al aire.
 */
export function contrastarManoDeObra(partida, referencia, { distancia = 0.15 } = {}) {
  const costo = Number(partida?.moUnitaria)
  const candidatos = buscar(partida, referencia)
  if (!candidatos.length) return { estado: CONTRASTE.SIN_REFERENCIA, porQue: `el CIRCOT ${referencia?.periodo ?? ''} no tiene un ítem comparable en ${partida?.unidad ?? 'esa unidad'}`.trim(), candidatos: [] }
  const [top, segundo] = candidatos
  if (segundo && top.puntaje - segundo.puntaje < distancia) {
    return { estado: CONTRASTE.AMBIGUO, candidatos: candidatos.slice(0, 4), porQue: `«${top.descripcion}» y «${segundo.descripcion}» son igual de parecidos y tienen bandas distintas: la referencia la elige una persona` }
  }
  if (!Number.isFinite(costo)) return { estado: CONTRASTE.SIN_REFERENCIA, referencia: top, candidatos: candidatos.slice(0, 4), porQue: 'la partida no trae mano de obra unitaria: no hay qué contrastar' }
  const estado = costo < top.mo_min ? CONTRASTE.BAJO : costo > top.mo_max ? CONTRASTE.ALTO : CONTRASTE.DENTRO
  return {
    estado, referencia: top, candidatos: candidatos.slice(0, 4),
    desvio: estado === CONTRASTE.DENTRO ? 0 : Math.round(((costo < top.mo_min ? costo / top.mo_min : costo / top.mo_max) - 1) * 1000) / 10,
    porQue: `nuestra MO es ${costo} ${partida?.unidad ?? ''} y la banda CIRCOT ${top.periodo} para «${top.descripcion}» va de ${top.mo_min} a ${top.mo_max}`,
    clasificacion: 'REFERENCIA_EXTERNA_LOCAL',
  }
}

/**
 * LAS OMISIONES POTENCIALES. PURA — y el resultado NUNCA entra solo al presupuesto.
 *
 * La lógica es deliberadamente conservadora: sólo mira los rubros que el presupuesto YA TIENE. Si
 * hay fundaciones cotizadas y el CIRCOT lista nueve ítems de fundaciones de los que nosotros
 * pusimos cuatro, los otros cinco son preguntas legítimas. En cambio, avisar de rubros que el
 * proyecto ni siquiera toca —«te falta la demolición»— es ruido que entrena a ignorar el aviso.
 */
export function omisionesPotenciales(partidas = [], referencia = {}, { minimoPorRubro = 1 } = {}) {
  const cubiertos = new Map()
  for (const p of partidas) {
    for (const c of buscar(p, referencia).slice(0, 3)) {
      cubiertos.set(c.codigo, (cubiertos.get(c.codigo) ?? 0) + 1)
      const r = `rubro:${c.rubro}`
      cubiertos.set(r, (cubiertos.get(r) ?? 0) + 1)
    }
  }
  const salida = []
  for (const it of referencia?.items ?? []) {
    if (cubiertos.has(it.codigo)) continue
    if ((cubiertos.get(`rubro:${it.rubro}`) ?? 0) < minimoPorRubro) continue
    salida.push({
      estado: 'PENDIENTE_CONFIRMACION',
      codigo: it.codigo, rubro: it.rubro, descripcion: it.descripcion, unidad: it.unidad,
      pregunta: `El presupuesto tiene partidas de ${it.rubro} pero ninguna que se parezca a «${it.descripcion}» (${it.unidad}). ¿Corresponde a esta obra?`,
      fuente: `CIRCOT ${it.periodo ?? ''}`.trim(),
      clasificacion: 'REFERENCIA_EXTERNA_LOCAL',
      advertencia: 'propuesta para confirmar — el CIRCOT sugiere y controla, no inserta',
    })
  }
  return salida
}
