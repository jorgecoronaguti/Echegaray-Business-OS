// LA BASE MAESTRA TIENE QUE PODER CRECER — pero no sola.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// De 248 actividades históricas sin clasificar, 218 no tienen NINGUNA candidata en el catálogo por
// encima del piso de similitud. Eso no es un defecto del clasificador: es el catálogo diciendo que
// le faltan tareas. «Encofrado» aparece 8 veces en 2 obras y no existe en la Base Maestra; mientras
// no exista, esos 8 hechos de duración medidos no se pueden reutilizar en la próxima cotización.
//
// ═══ POR QUÉ PROPONE Y NO CREA ═══
//
// Una tarea maestra es DATO MAESTRO: define una unidad de medición, se le van a colgar rendimientos
// y con esos rendimientos se va a cotizar. Crearla automáticamente porque un nombre se repite es
// exactamente «fabricar estructura de datos sin evidencia». La propuesta lleva su evidencia —en
// cuántas obras, cuántas veces, con qué unidades, cuántos hechos ya medidos desbloquea— y la firma
// una persona.
//
// ═══ DÓNDE VIVE LA PROPUESTA ═══
//
// En `backlog_autonomo`, que ya es el lugar donde el OS deja lo que detectó y no puede resolver
// solo, con su tipo, su impacto y su nivel de autonomía. No hace falta una tabla nueva: una segunda
// bandeja de pendientes sería una segunda cola que nadie mira.

import { tokens, normalizar } from './clasificar-senales.mjs'

/** Cuántas actividades distintas tiene que tener un grupo para que valga una propuesta. Una sola es
 *  una observación aislada (clase A del CLAUDE.md), y una observación aislada no funda una regla. */
export const MINIMO_PARA_PROPONER = 2

/** Cuántas hacen falta si TODAS son de la misma obra. La empresa puede repetir un ítem seis veces
 *  dentro de un galpón sin que eso sea una tarea de su catálogo: puede ser el ítem de esa obra. */
export const MINIMO_EN_UNA_OBRA = 4

/** La clave de agrupación: el conjunto de palabras, ordenado. «Hormigonado», «HORMIGONADO» y
 *  «hormigonados» caen en el mismo grupo; «Piso de hormigón 15cm» y «Piso de hormigón 20cm» no. */
export function claveDe(nombre) {
  return [...tokens(nombre)].sort().join(' ')
}

/** Distancia de edición, acotada. Sirve para que un typo no abra un grupo propio: «Compactacion» y
 *  «Compactasion» son la misma tarea mal escrita, y proponer dos tareas maestras por eso sería
 *  meter el error de tipeo dentro del dato maestro. */
export function distancia(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 99
  let previa = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const fila = [i]
    for (let j = 1; j <= n; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previa = fila
  }
  return previa[n]
}

/** ¿Dos claves son la misma escrita distinto? Hasta 2 caracteres de diferencia en claves largas,
 *  1 en las cortas. En una clave de 5 letras, 2 cambios ya son otra palabra. */
export function mismaEscritura(a, b) {
  const largo = Math.min(a.length, b.length)
  if (largo < 5) return a === b
  return distancia(a, b) <= (largo >= 9 ? 2 : 1)
}

/**
 * AGRUPA LAS ACTIVIDADES EQUIVALENTES. Puro.
 *
 * `actividades`: [{ actividadId, obraId, nombre, unidad, seccion, hechosDeDuracion }]
 *
 * Devuelve un grupo por tarea distinta, con el nombre más repetido como rótulo y todo lo que la
 * propuesta necesita para justificarse. El desempate del rótulo es alfabético a propósito: la misma
 * evidencia tiene que producir siempre el mismo título, o cada corrida abriría una propuesta nueva.
 */
export function agrupar(actividades = []) {
  const grupos = new Map()
  // SÓLO EL TRABAJO AGRUPA. Las filas que no son una tarea —un `resumen` que agrupa a otras, un
  // hito— quedan afuera antes de contar. Sin este filtro, «GALPÓN 1» aparecía siete veces y salía
  // propuesta como tarea maestra: es el lugar donde se trabaja, no el trabajo.
  for (const a of actividades.filter((x) => x.esTarea !== false)) {
    const k = claveDe(a.nombre)
    if (!k) continue
    const existente = [...grupos.keys()].find((x) => mismaEscritura(x, k))
    const clave = existente ?? k
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(a)
  }
  return [...grupos.entries()].map(([clave, filas]) => resumirGrupo(clave, filas))
    .sort((a, b) => b.obras.length - a.obras.length || b.actividades - a.actividades
      || a.clave.localeCompare(b.clave))
}

function rotuloDe(filas) {
  const veces = new Map()
  for (const f of filas) veces.set(f.nombre, (veces.get(f.nombre) ?? 0) + 1)
  return [...veces.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

function resumirGrupo(clave, filas) {
  const unidades = [...new Set(filas.map((f) => f.unidad).filter(Boolean).map(normalizar))]
  return {
    clave,
    nombre: rotuloDe(filas),
    actividades: filas.length,
    obras: [...new Set(filas.map((f) => f.obraId).filter(Boolean))].sort(),
    unidades,
    // Qué se desbloquea si el dueño la aprueba. Es el número que convierte la propuesta en una
    // decisión económica y no en una tarea administrativa: son hechos YA medidos que hoy no se
    // pueden reutilizar sólo porque la tarea no existe en el catálogo.
    hechosDeDuracion: filas.reduce((s, f) => s + (f.hechosDeDuracion ?? 0), 0),
    secciones: [...new Set(filas.map((f) => f.seccion).filter(Boolean))].sort().slice(0, 6),
    ejemplos: filas.slice(0, 3).map((f) => f.actividadId),
  }
}

/** ¿Este grupo amerita una propuesta, y con qué impacto? `null` = no amerita. */
export function impactoDe(grupo) {
  if (grupo.actividades < MINIMO_PARA_PROPONER) return null
  // DOS OBRAS ES LA LÍNEA. Es la misma que usa el aprendizaje para decir que algo es reutilizable:
  // con una obra hay un dato, con dos hay una tarea que la empresa repite. Y es la misma escalera
  // del CLAUDE.md: una obra es una observación aislada, dos es recurrencia.
  if (grupo.obras.length >= 2) return 'alta'
  // Dentro de una sola obra hace falta que se repita bastante para descartar que sea un ítem de esa
  // obra y no una tarea de la empresa. Sale como `media` y la decide una persona igual.
  return grupo.actividades >= MINIMO_EN_UNA_OBRA ? 'media' : null
}

/** El texto de la propuesta. Separado de la escritura para poder probarlo sin base. */
export function propuestaDe(grupo) {
  const impacto = impactoDe(grupo)
  if (!impacto) return null
  const unidad = grupo.unidades.length === 1
    ? `Se midió en ${grupo.unidades[0]}.`
    : grupo.unidades.length
      ? `Aparece con unidades distintas (${grupo.unidades.join(', ')}): definir cuál corresponde.`
      : 'Ninguna de las actividades declara unidad: hay que definirla al crearla.'
  const desbloquea = grupo.hechosDeDuracion
    ? ` Aprobarla convierte ${grupo.hechosDeDuracion} hecho(s) de duración YA medidos en experiencia reutilizable.`
    : ' Todavía no hay hechos medidos colgando de estas actividades.'
  return {
    // La clave estable de la propuesta. No es el título —el título puede cambiar de rótulo si
    // aparece otra escritura más frecuente— y sin ella cada corrida abriría una propuesta nueva.
    fuente: `xsas:tarea-maestra:${grupo.clave}`,
    titulo: `Falta una tarea maestra: «${grupo.nombre}»`,
    impacto,
    evidencia: `«${grupo.nombre}» aparece en ${grupo.actividades} actividades de ${grupo.obras.length} obra(s) `
      + `(${grupo.obras.join(', ')}) y no existe en la Base Maestra: ninguna tarea del catálogo se le `
      + `parece lo suficiente ni sobrevive a los vetos. ${unidad}${desbloquea}`
      + (grupo.secciones.length ? ` Frentes: ${grupo.secciones.join(' · ')}.` : ''),
    recomendacion: `Crear la tarea maestra «${grupo.nombre}» con su unidad y su método de medición, o `
      + 'decidir a qué tarea existente corresponde. Mientras no exista, la experiencia de esas '
      + 'actividades queda pegada a la obra que la produjo.',
  }
}

/**
 * ESCRIBE LAS PROPUESTAS. Idempotente por `fuente`: correr esto cuatro veces al día no abre cuatro
 * propuestas de la misma tarea — refresca la evidencia de la que ya está abierta, que es lo que
 * cambia cuando aparece otra obra con la misma actividad.
 *
 * Una propuesta que el dueño ya descartó NO se vuelve a abrir. Descartar es una decisión, y un
 * proceso automático que la revierte cada seis horas convierte la bandeja en ruido.
 */
export async function proponerTareasMaestras({ query }, grupos, { dry = false } = {}) {
  const salida = []
  for (const g of grupos) {
    const p = propuestaDe(g)
    if (!p) continue
    const { rows } = await query(
      `select id, estado from public.backlog_autonomo where tipo = 'gap_dato' and fuente = $1`, [p.fuente])
    const abierta = rows.find((r) => r.estado === 'abierto' || r.estado === 'en_curso')
    const cerrada = rows.find((r) => r.estado === 'resuelto' || r.estado === 'descartado')
    if (cerrada && !abierta) { salida.push({ ...p, accion: 'ya decidida' }); continue }
    salida.push({ ...p, accion: abierta ? 'refrescada' : 'nueva' })
    if (dry) continue
    if (abierta) {
      await query(
        `update public.backlog_autonomo set titulo = $2, evidencia = $3, impacto = $4,
                recomendacion = $5, updated_at = now(), actualizado_en = now() where id = $1`,
        [abierta.id, p.titulo, p.evidencia, p.impacto, p.recomendacion])
    } else {
      await query(
        `insert into public.backlog_autonomo
           (tipo, area, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
            recomendacion, nivel_autonomia_permitido, estado)
         values ('gap_dato', 'obras', $1, $2, $3, 'confirmado', $4, 'media', 'bajo', $5, 'C', 'abierto')`,
        [p.titulo, p.evidencia, p.fuente, p.impacto, p.recomendacion])
    }
  }
  return {
    grupos: grupos.length,
    propuestas: salida.filter((s) => s.accion !== 'ya decidida').length,
    nuevas: salida.filter((s) => s.accion === 'nueva').length,
    yaDecididas: salida.filter((s) => s.accion === 'ya decidida').length,
    filas: salida,
  }
}
