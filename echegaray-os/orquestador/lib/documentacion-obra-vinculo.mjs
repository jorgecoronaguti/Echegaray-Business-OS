// DE UN DOCUMENTO A LA TAREA QUE SE ESTÁ HACIENDO — y de una cantidad de plano a la cantidad
// que ya estaba planificada.
//
// ═══ EL ESLABÓN QUE FALTABA, MEDIDO EL 21/08/2026 ═══
//
// La cadena que el negocio necesita recorrer es
//   documento ↔ elemento ↔ ubicación/frente ↔ actividad ↔ análisis ↔ partida ↔ avance
// y de esa cadena la base ya tiene casi todo: `obra_actividad` (350 filas) trae `unidad`,
// `cantidad_objetivo`, `partida_codigo`, `analisis_id` y `cotizacion_partida_id`; `analisis` +
// `analisis_linea` traen 199 análisis con 1.355 líneas. Lo que NO existe es el primer eslabón:
// `obra_documento` tiene la columna `actividad_id` y CERO filas. Nadie vinculó nunca un documento
// a una tarea. Este módulo es la lógica de ese vínculo — pura, sin base y sin Drive.
//
// ═══ POR QUÉ EL VÍNCULO ES CASCADA Y LO AMBIGUO SE DECLARA ═══
//
// En San Francisco las actividades reales se llaman "Muro G 2/3 de 5m - 18 paneles" y viven en
// secciones "GALPON 2", "GALPON 3", "GALPON 4"; los documentos viven en carpetas "Entrepiso",
// "Instalacion Electrica", "Pisos Industriales", "ADICIONALES". Son dos vocabularios distintos
// escritos por dos personas distintas en dos momentos distintos. Hay tres claves:
//
//   (a) CARPETA→FRENTE — la carpeta del documento coincide con una sección o una actividad de
//       resumen de la obra. Es lo más fuerte que hay porque alguien MOVIÓ el archivo ahí.
//   (b) TOKENS         — las palabras significativas del nombre se solapan con las del nombre de
//       la actividad, por encima de un piso. Es una INFERENCIA y sale marcada como tal.
//   (c) NINGUNA        — el documento queda sin actividad. Es un hueco declarado, no un error.
//
// Empate = ambiguo, y ambiguo NO es un vínculo. Un plano colgado de la actividad equivocada es
// peor que un plano sin colgar: el segundo se busca, el primero se cree. Misma regla que ya
// gobierna `cruce-cheque-factura.mjs` y la memoria del repo ("no escribir donde el mapeo dice
// que no").

import { plano, sinExtension, tokenizar } from './drive-busqueda/normalizar.mjs'

export const CLAVE_VINCULO = Object.freeze({
  carpeta: 'carpeta del documento = frente de la obra',
  tokens: 'palabras del nombre ≈ nombre de la actividad',
  ninguna: 'ninguna — el documento no declara a qué tarea pertenece',
})

export const SIN_VINCULO = Object.freeze({
  ambiguo: 'ambiguo — más de una actividad candidata con el mismo puntaje; elegir a ojo colgaría el plano de la tarea equivocada',
  sinCandidato: 'ninguna actividad de la obra comparte carpeta ni palabras con este documento',
})

/** Cuántas palabras significativas tienen que coincidir para que (b) valga. Dos, y el número no
 *  es estético: con una sola, "Pisos Industriales/Gastos - Pisos JS.pdf" se pega a las 14
 *  actividades que dicen "piso" y el vínculo deja de significar algo. */
export const PISO_TOKENS = 2

/** Palabras que aparecen en casi todos los nombres del data room y no distinguen nada. Sin este
 *  filtro, "Presupuesto - Entrepiso y escalera.pdf" empata con toda actividad que diga "obra". */
const RUIDO = new Set(['obra', 'js', 'ecsas', 'echegaray', 'final', 'copia', 'rev', 'interna',
  'interno', 'archivos', 'viejos', 'cotizacion', 'presupuesto', 'gastos', 'total', 'totales'])

const significativos = (texto) => {
  const t = tokenizar(plano(sinExtension(String(texto || ''))))
  return new Set(t.filter((x) => x.length >= 3 && !RUIDO.has(x)))
}

const interseccion = (a, b) => {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n
}

/**
 * EL FRENTE QUE DECLARA LA RUTA. Devuelve los nombres de carpeta entre la carpeta de la obra y el
 * archivo, de la más cercana al archivo hacia afuera. Ésos son los frentes reales: "Entrepiso",
 * "Instalacion Electrica", "ADICIONALES", "CERTIFICADOS".
 *
 * `carpetaObra` es obligatoria: sin ella, "administracion" y "PRESUPUESTOS - CLIENTES" entrarían
 * como frentes de todas las obras.
 */
export function frentesDeRuta(path = '', carpetaObra = '') {
  const ruta = String(path || '')
  const base = String(carpetaObra || '')
  const resto = base && ruta.startsWith(base) ? ruta.slice(base.length) : ruta
  return resto.split('/').filter(Boolean).slice(0, -1).map((s) => s.trim()).filter(Boolean).reverse()
}

/**
 * A QUÉ ACTIVIDAD PERTENECE ESTE DOCUMENTO.
 *
 * `actividades` son filas de `obra_actividad` (se usan `id`, `nombre`, `seccion`). Devuelve el
 * vínculo con la clave que lo produjo, o el motivo por el que no hubo vínculo. Nunca elige entre
 * empatadas.
 */
export function vincularDocumentoAActividad(documento = {}, actividades = [], { carpetaObra = '' } = {}) {
  const frentes = frentesDeRuta(documento.path, carpetaObra)
  const doc = { documento: documento.name ?? null }

  // (a) CARPETA → FRENTE. Se compara contra `seccion` y contra `nombre` porque en el Sheet real
  // el frente vive en las dos: "GALPON 2" es a la vez el nombre de una fila de resumen y la
  // sección de las filas que cuelgan de ella.
  for (const frente of frentes) {
    const f = plano(frente)
    // Se toma la UNIÓN de las dos formas en que el frente vive en el Sheet real: como nombre de
    // una fila de resumen ("GALPON 2") y como sección de las filas que cuelgan de ella. Preferir
    // una sobre la otra devolvería la fila de resumen como si fuera una tarea, y el jefe de obra
    // leería "actividad: GALPON 2" — que no es una actividad, es un galpón entero.
    const candidatas = []
    for (const a of actividades) {
      if (plano(a.nombre ?? '') === f || plano(a.seccion ?? '') === f) candidatas.push(a)
    }
    if (candidatas.length === 1) {
      return { ...doc, actividad_id: candidatas[0].id, actividad: candidatas[0].nombre, frente, clave: CLAVE_VINCULO.carpeta, confianza: 'alta' }
    }
    if (candidatas.length > 1) {
      // Varias actividades comparten el frente: eso no es ambigüedad del vínculo, es que el
      // documento pertenece al FRENTE entero. Se devuelve el frente, sin actividad.
      return { ...doc, actividad_id: null, actividad: null, frente, clave: CLAVE_VINCULO.carpeta, confianza: 'alta', nota: `el documento pertenece al frente "${frente}" (${candidatas.length} actividades), no a una tarea puntual`, actividades_del_frente: candidatas.map((a) => a.nombre) }
    }
  }

  // (b) TOKENS.
  const tokensDoc = significativos(documento.name)
  let mejor = 0
  let empatadas = []
  for (const a of actividades) {
    const n = interseccion(tokensDoc, significativos(a.nombre))
    if (n < PISO_TOKENS || n < mejor) continue
    if (n > mejor) { mejor = n; empatadas = [a] } else empatadas.push(a)
  }
  if (empatadas.length === 1) {
    return { ...doc, actividad_id: empatadas[0].id, actividad: empatadas[0].nombre, frente: frentes[0] ?? null, clave: CLAVE_VINCULO.tokens, confianza: 'media', palabras_en_comun: mejor }
  }
  if (empatadas.length > 1) {
    return { ...doc, actividad_id: null, actividad: null, frente: frentes[0] ?? null, clave: CLAVE_VINCULO.ninguna, confianza: 'ninguna', motivo: SIN_VINCULO.ambiguo, candidatas: empatadas.slice(0, 5).map((a) => a.nombre) }
  }
  return { ...doc, actividad_id: null, actividad: null, frente: frentes[0] ?? null, clave: CLAVE_VINCULO.ninguna, confianza: 'ninguna', motivo: SIN_VINCULO.sinCandidato }
}

export const ESTADO_CANTIDAD = Object.freeze({
  coincide: 'coincide',
  difiere: 'difiere',
  sinPlan: 'sin_plan',            // la actividad existe pero nadie cargó cantidad_objetivo
  unidadDistinta: 'unidad_distinta', // NO se convierte: m² y m³ no son el mismo hecho
  sinActividad: 'sin_actividad',  // el elemento del cómputo no está en el plan de la obra
})

/** Cuánto puede diferir una cantidad sin que sea una diferencia. 1%: por debajo de eso la
 *  diferencia es redondeo de la planilla, no una decisión de nadie. */
export const TOLERANCIA = 0.01

const normalizarUnidad = (u) => plano(String(u ?? '')).replace(/[\s.]/g, '').replace(/2$/, '2').replace(/3$/, '3')

/**
 * EL CÓMPUTO CONTRA EL PLAN.
 *
 * `elementos` = lo leído de una planilla de cómputo: `{ descripcion, cantidad, unidad, fila }`.
 * `actividades` = filas de `obra_actividad` con `unidad` y `cantidad_objetivo`.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN:
 *
 *  1. `cantidad_objetivo` en NULL es SIN PLAN, no cero. Tratar el NULL como 0 haría que todo
 *     cómputo aparezca como "diferencia del 100%" y el listado entero se vuelva ruido — que es
 *     exactamente cómo un control deja de mirarse. Hoy en la base 349 de 350 actividades tienen
 *     `cantidad_objetivo` en NULL: sin esta regla, el informe serían 349 falsas alarmas.
 *  2. Unidades distintas NO se convierten. m² y m³ de la misma pared son dos hechos distintos y
 *     el factor de conversión es el espesor, que no está en ninguna de las dos filas. Se declara.
 */
export function compararComputoContraPlan(elementos = [], actividades = [], { carpetaObra = '', tolerancia = TOLERANCIA } = {}) {
  return elementos.map((e) => {
    const v = vincularDocumentoAActividad({ name: e.descripcion, path: e.path ?? '' }, actividades, { carpetaObra })
    const act = v.actividad_id ? actividades.find((a) => a.id === v.actividad_id) : null
    const base = { elemento: e.descripcion, fila: e.fila ?? null, cantidad_computo: e.cantidad ?? null, unidad_computo: e.unidad ?? null, actividad: act?.nombre ?? null, actividad_id: act?.id ?? null, clave: v.clave }
    if (!act) return { ...base, estado: ESTADO_CANTIDAD.sinActividad, detalle: v.motivo ?? 'el cómputo trae un elemento que el plan de la obra no tiene' }
    if (act.cantidad_objetivo == null) return { ...base, estado: ESTADO_CANTIDAD.sinPlan, detalle: 'la actividad existe pero nadie cargó cantidad planificada — no hay contra qué comparar' }
    const uc = normalizarUnidad(e.unidad)
    const ua = normalizarUnidad(act.unidad)
    if (uc && ua && uc !== ua) return { ...base, cantidad_plan: Number(act.cantidad_objetivo), unidad_plan: act.unidad, estado: ESTADO_CANTIDAD.unidadDistinta, detalle: `el cómputo dice ${e.unidad} y el plan dice ${act.unidad} — no se convierte` }
    const plan = Number(act.cantidad_objetivo)
    const comp = Number(e.cantidad)
    if (!Number.isFinite(comp)) return { ...base, cantidad_plan: plan, unidad_plan: act.unidad, estado: ESTADO_CANTIDAD.sinPlan, detalle: 'el cómputo no trae una cantidad numérica en esta fila' }
    const delta = comp - plan
    const relativa = plan === 0 ? (comp === 0 ? 0 : Infinity) : Math.abs(delta) / Math.abs(plan)
    return {
      ...base,
      cantidad_plan: plan,
      unidad_plan: act.unidad,
      delta,
      delta_relativo: relativa,
      estado: relativa <= tolerancia ? ESTADO_CANTIDAD.coincide : ESTADO_CANTIDAD.difiere,
      detalle: relativa <= tolerancia ? null : `el cómputo dice ${comp} y el plan dice ${plan} (${delta > 0 ? '+' : ''}${delta})`,
    }
  })
}

/**
 * ¿HAY UN PLANO MÁS NUEVO QUE LA CANTIDAD QUE SE ESTÁ USANDO?
 *
 * El caso real que esto detecta está en el data room y es de ARCOR — Nivelación de Cocheras:
 *   · "ARSJ Nivelacion de cocheras - Legajo de Planos Rev C.pdf"        → 29/04/2025
 *   · "ARSJ Planilla de Cotizacion - Nivelacion de cocheras Rev B.xls"  → 23/04/2025
 * La cotización con la que se cotizó es SEIS DÍAS ANTERIOR al legajo de planos que rige. Nadie
 * miró eso nunca, y no hay ningún error de fórmula en el medio: es un hecho de fechas que hasta
 * hoy no tenía quién lo mirara.
 *
 * Sólo compara fechas y devuelve el hecho. NO afirma que la cantidad cambió — eso lo dice el
 * plano, y el plano hay que abrirlo. La distinción es la regla: un plano posterior es un MOTIVO
 * PARA REVISAR, no una diferencia demostrada.
 */
export function planosPosterioresAlPlan(documentos = [], { fechaPlan = null, nombrePlan = null } = {}) {
  if (!fechaPlan) return { revisar: [], motivo: 'no se sabe con qué fecha se planificó la cantidad — sin eso no se puede decir si un plano es posterior' }
  const corte = new Date(fechaPlan).getTime()
  if (!Number.isFinite(corte)) return { revisar: [], motivo: `la fecha del plan no es una fecha: ${fechaPlan}` }
  const revisar = documentos
    .filter((d) => d.modified_time && new Date(d.modified_time).getTime() > corte)
    .map((d) => ({
      documento: d.name,
      drive_file_id: d.drive_file_id ?? null,
      modificado: d.modified_time,
      plan: nombrePlan,
      fecha_plan: fechaPlan,
      afirmacion: 'documento POSTERIOR a la cantidad planificada — motivo para revisar, no diferencia demostrada',
    }))
  return { revisar, motivo: null }
}
