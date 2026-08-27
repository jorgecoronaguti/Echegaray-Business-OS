// DE QUÉ TAREA ES ESTA ACTIVIDAD — clasificar la experiencia, sin reescribir la obra.
//
// ═══ QUÉ TOCA Y QUÉ NO ═══
//
// Escribe UNA cosa: `tarea_tipo_id` y las tres columnas que dicen de dónde salió ese vínculo. No
// toca el nombre histórico, ni el avance, ni las HH, ni las cantidades, ni las fechas, ni la
// planificación. Estamos poniéndole etiqueta a una experiencia que ya ocurrió, no corrigiendo lo
// que pasó en la obra.
//
// ═══ LOS CUATRO VEREDICTOS ═══
//
//   EXACTO     la partida cotizada o el análisis lo dicen, o el nombre es el mismo. Se asigna.
//   ALTA       una sola candidata sobreviviente, fuerte, sin competencia cerca. Se asigna.
//   CANDIDATO  la zona gris que resolvió un modelo eligiendo entre candidatas concretas. Se asigna
//              MARCADA como tal: es una inferencia con nombre y apellido, y se puede deshacer.
//   AMBIGUO / SIN MATCH   no se asigna nada.
//
// ═══ LA EVIDENCIA NO ES SÓLO EL NOMBRE ═══
//
// El parecido de dos textos PROPONE candidatas y no decide nada solo. Quién queda afuera y quién
// sobrevive lo deciden las señales de `clasificar-senales.mjs`: la unidad, el rubro del cronograma,
// la partida cotizada, el análisis de precios, las actividades vecinas del mismo frente y el nombre
// de la obra. Los vetos mandan sobre el parecido; las corroboraciones sólo bajan el umbral.
//
// La regla que gobierna: **no se sacrifica calidad para subir cobertura**. Una clasificación mal
// puesta contamina el rendimiento de una tarea y después una cotización; una actividad sin
// clasificar no le hace daño a nadie, sólo espera. Por eso dos candidatas razonables dan AMBIGUO
// aunque las dos estén corroboradas: sumar señales para desempatar es cómo se contamina.

import { normalizar, tokens, vetosDe, corroboracionesDe, pruebaDirecta } from './clasificar-senales.mjs'

// `normalizar` vive en el módulo de señales —es la base de toda la comparación de nombres— y se
// re-exporta acá porque éste sigue siendo el módulo público del clasificador.
export { normalizar }

/** Umbrales. Están acá y no repartidos por el SQL para poder discutirlos en un solo lugar. */
export const UMBRAL = Object.freeze({
  // Por debajo de esto ni se mira: son dos textos que comparten alguna letra.
  MIRAR: 0.5,
  // Una sola candidata de acá para arriba, y sin competencia cerca, se asigna sola.
  ALTA: 0.75,
  // El mismo paso, pero cuando además hay evidencia INDEPENDIENTE del nombre: la unidad, el rubro
  // del cronograma, una vecina del mismo frente ya clasificada. Baja el listón del parecido porque
  // deja de ser lo único que sostiene la decisión. Nunca alcanza sola: la candidata tiene que haber
  // sobrevivido a todos los vetos y no tener competencia cerca.
  ALTA_CORROBORADA: 0.6,
  // Cuánto tiene que sacarle la primera a la segunda para que «una sola candidata» sea cierto.
  VENTAJA: 0.15,
})

/**
 * ¿LAS UNIDADES SON COMPATIBLES? Una actividad medida en m² no puede ser una tarea que se mide en
 * horas por más que los nombres se parezcan. Si la actividad no declara unidad —la mayoría de las
 * importadas del cronograma no lo hacen— no bloquea: no se puede contradecir con lo que no se dijo.
 */
export function unidadCompatible(unidadActividad, unidadTarea) {
  const a = normalizar(unidadActividad), t = normalizar(unidadTarea)
  if (!a || !t) return true
  return a === t
}

/**
 * ¿HAY UN SOLO NOMBRE IDÉNTICO? Idéntico en dos niveles, y los dos valen igual:
 *
 *   letra a letra   «REPLANTEO» = «Replanteo»
 *   palabra a palabra   «EXCAVACION» = «EXCAVACIONES», «Nivelacion de terreno» = «NIVELACION TERRENO»
 *
 * El segundo nivel es lo que agrega la normalización fuerte —sin acentos, sin conectores, sin
 * plurales— y no afloja nada: sigue exigiendo que las DOS tengan exactamente las mismas palabras.
 * Lo que la aflojaría sería aceptar que una contenga a la otra, y eso es justo lo que se veta.
 */
function unicaIdentica(vivas, nombre, comparar) {
  const k = comparar(nombre)
  const iguales = vivas.filter((c) => comparar(c.nombre) === k)
  if (iguales.length === 1) return { unica: iguales[0] }
  if (iguales.length > 1) return { ambiguas: iguales }
  return {}
}

const porLetra = (s) => normalizar(s)
const porPalabra = (s) => [...tokens(s)].sort().join(' ')

/** Cada candidata con sus vetos y sus corroboraciones. La unidad entra como un veto más para que
 *  haya UNA sola lista de razones por las que una candidata queda afuera. */
function evaluar(candidatas, contexto) {
  return candidatas.map((c) => {
    const vetos = [...vetosDe(c, contexto)]
    if (!unidadCompatible(contexto.unidad, c.unidad)) {
      vetos.push(`se mide en ${c.unidad} y la actividad en ${contexto.unidad}`)
    }
    return { ...c, vetos, corroboraciones: corroboracionesDe(c, contexto) }
  })
}

/** La decisión entre las candidatas que ningún veto tumbó. */
function decidirEntreVivas(vivas) {
  const [primera, segunda] = vivas
  const corroborada = primera.corroboraciones.length > 0
  const umbral = corroborada ? UMBRAL.ALTA_CORROBORADA : UMBRAL.ALTA
  const sola = !segunda || primera.similitud - segunda.similitud >= UMBRAL.VENTAJA

  if (primera.similitud >= umbral && sola) {
    const respaldo = primera.corroboraciones.map((x) => x.porQue).join(' · ')
    return {
      veredicto: 'ALTA', tareaTipoId: primera.tareaTipoId, confianza: 'ALTA', origen: 'similitud',
      porQue: `«${primera.nombre}» con ${primera.similitud.toFixed(2)} de similitud, sin otra candidata cerca`
        + (corroborada ? ` y con evidencia independiente: ${respaldo}` : ''),
      evidencia: {
        similitud: primera.similitud, candidata: primera.nombre, segunda: segunda?.nombre ?? null,
        corroboraciones: primera.corroboraciones,
      },
    }
  }
  if (!sola && segunda.similitud >= UMBRAL.ALTA_CORROBORADA) {
    return {
      veredicto: 'AMBIGUO',
      porQue: `«${primera.nombre}» y «${segunda.nombre}» se parecen casi igual`,
      candidatas: vivas.slice(0, 4),
    }
  }
  return {
    veredicto: 'ZONA GRIS', candidatas: vivas.slice(0, 4),
    porQue: `la mejor candidata es «${primera.nombre}» con ${primera.similitud.toFixed(2)}: hay señal, no certeza`,
  }
}

/**
 * NÚCLEO PURO: el veredicto para una actividad, dadas sus candidatas ordenadas por similitud.
 *
 * `contexto`: { nombre, unidad, seccion, obra, hermanas, partidaTareaTipoId, analisisTareaTipoId }
 * `candidatas`: [{ tareaTipoId, nombre, unidad, similitud }] de mayor a menor.
 *
 * El orden no es cosmético. Primero lo que NO es una inferencia —la partida cotizada, el análisis—;
 * después la identidad de nombre; recién después el parecido, y sólo entre las candidatas que
 * ningún veto tumbó. Una candidata vetada no vuelve por más corroboraciones que junte.
 */
export function veredictoDe(contexto, candidatas = []) {
  const directa = pruebaDirecta(contexto)
  if (directa) return directa

  const cs = evaluar(candidatas.filter((c) => c.similitud >= UMBRAL.MIRAR), contexto)
  if (!cs.length) return { veredicto: 'SIN MATCH', porQue: 'ningún tipo de tarea se parece lo suficiente' }

  const vivas = cs.filter((c) => !c.vetos.length).sort((a, b) => b.similitud - a.similitud)
  if (!vivas.length) {
    const mejor = cs[0]
    return {
      veredicto: 'AMBIGUO', vetadas: cs.map((c) => ({ nombre: c.nombre, vetos: c.vetos })),
      porQue: `la única parecida era «${mejor.nombre}» y no corresponde: ${mejor.vetos[0]}`,
    }
  }

  for (const [comparar, origen, como] of [[porLetra, 'nombre-exacto', 'exactamente'],
    [porPalabra, 'nombre-exacto', 'palabra por palabra']]) {
    const { unica, ambiguas } = unicaIdentica(vivas, contexto.nombre, comparar)
    if (ambiguas) return { veredicto: 'AMBIGUO', porQue: `${ambiguas.length} tipos distintos se llaman igual` }
    if (unica) {
      return {
        veredicto: 'EXACTO', tareaTipoId: unica.tareaTipoId, confianza: 'EXACTO', origen,
        porQue: `el nombre coincide ${como} con «${unica.nombre}»`,
        evidencia: { similitud: unica.similitud, candidata: unica.nombre, corroboraciones: unica.corroboraciones },
      }
    }
  }

  return decidirEntreVivas(vivas)
}

/** El veredicto del modelo, convertido en decisión. Sólo puede elegir entre las candidatas que se
 *  le dieron, y su «ninguna» es una respuesta válida — de hecho es la que más se espera. */
export function decisionDelModelo(respuesta, candidatas) {
  const id = respuesta?.tarea_tipo_id
  if (!id || id === 'ninguna') return { veredicto: 'SIN MATCH', porQue: respuesta?.motivo ?? 'el modelo no encontró una equivalencia clara' }
  // «SE PARECE» NO ES «ES». El modelo tiene que declarar que la actividad ES esa tarea; si dice que
  // se parece, que es una parte de ella o que es más amplia, no se clasifica. «Compactación» dentro
  // de «RELLENO Y COMPACTACIÓN» es media tarea, y aprenderla como la tarea entera deja el
  // rendimiento de esa tarea contaminado para siempre.
  if (respuesta?.certeza && respuesta.certeza !== 'misma_tarea') {
    return { veredicto: 'AMBIGUO', porQue: `el modelo dice que sólo se parece: ${respuesta?.motivo ?? 'sin motivo'}` }
  }
  const elegida = candidatas.find((c) => c.tareaTipoId === id)
  if (!elegida) return { veredicto: 'SIN MATCH', porQue: 'el modelo eligió un tipo que no estaba entre las candidatas' }
  return {
    veredicto: 'CANDIDATO', tareaTipoId: elegida.tareaTipoId, confianza: 'CANDIDATO', origen: 'modelo',
    porQue: respuesta?.motivo ?? 'lo resolvió el modelo entre las candidatas',
    evidencia: { similitud: elegida.similitud, candidata: elegida.nombre, motivo: respuesta?.motivo ?? null,
      candidatas: candidatas.map((c) => c.nombre) },
  }
}
