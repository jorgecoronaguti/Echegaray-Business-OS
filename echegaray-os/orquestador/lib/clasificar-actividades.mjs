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
//   EXACTO     el nombre normalizado coincide con el de un tipo. Se asigna.
//   ALTA       una sola candidata fuerte, sin competencia cerca y con la unidad compatible. Se asigna.
//   CANDIDATO  la zona gris que resolvió un modelo eligiendo entre candidatas concretas. Se asigna
//              MARCADA como tal: es una inferencia con nombre y apellido, y se puede deshacer.
//   AMBIGUO / SIN MATCH   no se asigna nada.
//
// La regla que gobierna: **no se sacrifica calidad para subir cobertura**. Una clasificación mal
// puesta contamina el rendimiento de una tarea y después una cotización; una actividad sin
// clasificar no le hace daño a nadie, sólo espera.

/** Normalización para comparar nombres: mayúsculas, sin acentos, espacios colapsados. */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Umbrales. Están acá y no repartidos por el SQL para poder discutirlos en un solo lugar. */
export const UMBRAL = Object.freeze({
  // Por debajo de esto ni se mira: son dos textos que comparten alguna letra.
  MIRAR: 0.5,
  // Una sola candidata de acá para arriba, y sin competencia cerca, se asigna sola.
  ALTA: 0.75,
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
 * NÚCLEO PURO: el veredicto para una actividad, dadas sus candidatas ordenadas por similitud.
 *
 * `candidatas`: [{ tareaTipoId, nombre, unidad, similitud }] de mayor a menor.
 */
export function veredictoDe({ nombre, unidad }, candidatas = []) {
  const cs = candidatas.filter((c) => c.similitud >= UMBRAL.MIRAR)
  if (!cs.length) return { veredicto: 'SIN MATCH', porQue: 'ningún tipo de tarea se parece lo suficiente' }

  const k = normalizar(nombre)
  const exactas = cs.filter((c) => normalizar(c.nombre) === k)
  if (exactas.length === 1) {
    return {
      veredicto: 'EXACTO', tareaTipoId: exactas[0].tareaTipoId, confianza: 'EXACTO', origen: 'nombre-exacto',
      porQue: `el nombre coincide exactamente con «${exactas[0].nombre}»`,
      evidencia: { similitud: 1, candidata: exactas[0].nombre },
    }
  }
  if (exactas.length > 1) {
    return { veredicto: 'AMBIGUO', porQue: `${exactas.length} tipos distintos tienen ese mismo nombre` }
  }

  const [primera, segunda] = cs
  const compatible = unidadCompatible(unidad, primera.unidad)
  const sola = !segunda || primera.similitud - segunda.similitud >= UMBRAL.VENTAJA

  if (primera.similitud >= UMBRAL.ALTA && sola && compatible) {
    return {
      veredicto: 'ALTA', tareaTipoId: primera.tareaTipoId, confianza: 'ALTA', origen: 'similitud',
      porQue: `«${primera.nombre}» con ${primera.similitud.toFixed(2)} de similitud y sin otra candidata cerca`,
      evidencia: { similitud: primera.similitud, candidata: primera.nombre, segunda: segunda?.nombre ?? null },
    }
  }
  if (primera.similitud >= UMBRAL.ALTA && !compatible) {
    return { veredicto: 'AMBIGUO', porQue: `el nombre se parece a «${primera.nombre}» pero se mide en ${primera.unidad} y la actividad en ${unidad}` }
  }
  if (primera.similitud >= UMBRAL.ALTA && !sola) {
    return { veredicto: 'AMBIGUO', porQue: `«${primera.nombre}» y «${segunda.nombre}» se parecen casi igual` }
  }
  // Zona gris: hay algo, no alcanza para decidir con una regla. Es lo único que va al modelo.
  return {
    veredicto: 'ZONA GRIS', candidatas: cs.slice(0, 4),
    porQue: `la mejor candidata es «${primera.nombre}» con ${primera.similitud.toFixed(2)}: hay señal, no certeza`,
  }
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
