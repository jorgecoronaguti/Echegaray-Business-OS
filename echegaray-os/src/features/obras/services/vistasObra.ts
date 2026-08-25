// LAS SOLAPAS DE LA OBRA Y LAS VISTAS DE TAREAS. Módulo NEUTRAL —sin `'use client'`— porque lo
// necesitan las dos orillas: la página (Server Component) para resolver la query, y el workspace
// (cliente) para dibujar los enlaces. Un dato exportado desde un archivo `'use client'` cruza la
// frontera como una REFERENCIA al módulo, no como el valor: `SUBVISTAS.some is not a function` en
// producción, con el typecheck y el build en verde. Ya pasó acá; ver `subvistas.ts`.
//
// ═══ EJECUCIÓN DEJA DE EXISTIR COMO PESTAÑA (21/08/2026) ═══
//
// `design/screens/gestion-obras-v5.md` §3. Hasta hoy las MISMAS actividades se miraban de dos
// maneras —`?vista=planificacion` y `?vista=ejecucion`— y había que decidir en cuál de las dos se
// carga cada cosa. El nivel 2 pasa a seis solapas y **Tareas es el workspace único**.
//
// ═══ LO QUE ERAN SOLAPAS PASAN A SER VISTAS DE TAREAS, NO DESAPARECEN ═══
//
// El Gantt, la Lista, el Tablero, Próximos y el Parte diario siguen existiendo: son las MISMAS
// actividades miradas de otra manera, que es exactamente la definición de una vista. Convertirlas
// en un redirect a la tabla nueva habría borrado el único Gantt del OS y el parte diario —con sus
// horas por persona y sus equipos—, que ninguna de las pantallas 03 a 06 reemplaza. Las URLs
// viejas siguen abriendo donde abrían.

export const VISTAS_OBRA = [
  { id: 'resumen', label: 'Resumen' },
  // «Trabajo», no «Tareas» (22/08/2026 · overhaul UX): la solapa contiene tres maneras de operar
  // el trabajo —la lista de tareas, el cronograma y el parte diario— y nombrarla por una de las
  // tres hacía buscar el cronograma en el nivel de arriba. El id sigue siendo `tareas`: está en
  // marcadores, en links de chat y en los tests, y una URL no se rompe por un rótulo.
  { id: 'tareas', label: 'Trabajo' },
  { id: 'personal', label: 'Personal' },
  { id: 'operacion', label: 'Operación' },
  { id: 'economia', label: 'Economía' },
  { id: 'documentos', label: 'Documentos' },
] as const
export type VistaObra = (typeof VISTAS_OBRA)[number]['id']

// ═══ HAY UN SOLO CRONOGRAMA DE OBRA (24/08/2026) ═══
//
// Hubo dos, y convivían con el porqué escrito: `?vista=tareas&sub=gantt` dibujaba el plan COMO ESTÁ
// CARGADO y `/obras/<obra>/cronograma` el plan COMO LO IMPLICA LA SECUENCIA, recalculado desde las
// dependencias. La convivencia no resistió el dato: las obras tienen CERO dependencias cargadas, y
// sin dependencias el motor arranca TODAS las actividades el mismo día — la segunda pantalla
// dibujaba treinta y cinco barras apiladas sobre la primera semana y lo rotulaba «cronograma».
//
// Queda la primera, portada del canónico 07, y la URL vieja redirige a ella. El motor sigue vivo y
// probado (`cronogramaMotor.ts`): lo usa la 08 · Dotación. Lo que se retiró es la VISTA que
// publicaba su resultado como si fuera el plan de la obra.

/** La pantalla 07, dentro del workspace. La ruta `/obras/<obra>/cronograma` redirige acá. */
export const hrefCronograma = (obraId: string) => `/obras/${obraId}?vista=tareas&sub=gantt`

/** La pantalla 08, por la misma razón. */
export const hrefDotacion = (obraId: string) => `/obras/${obraId}/dotacion`

/** La pantalla 10. Cuelga de Tareas —un paquete es una porción del alcance de actividades que ya
 *  existen, no un trabajo paralelo— pero vive fuera del workspace: mira el MISMO alcance desde el
 *  lado del tercero que lo ejecuta, con su contrato, sus papeles y su gente. */
export const hrefSubcontratos = (obraId: string) => `/obras/${obraId}/subcontratos`

/** Las vistas del workspace de Trabajo: la lista de tareas, el cronograma y el parte diario.
 *  Lista, Tablero y Próximos se retiraron el 22/08/2026 (overhaul UX): eran representaciones del
 *  mismo dataset y sus URLs caen en el Cronograma vía `SUB_ALIAS`. */
export const SUBS_TAREAS = [
  { id: 'arbol', label: 'Tareas' },
  { id: 'gantt', label: 'Cronograma' },
  { id: 'parte', label: 'Parte diario' },
] as const
export type SubTareas = (typeof SUBS_TAREAS)[number]['id']

export const esSubTareas = (v: string | undefined): v is SubTareas =>
  SUBS_TAREAS.some((s) => s.id === v)

/** Lo que llega por link viejo, por marcador o por un test: adónde va, y con qué vista adentro. */
const ALIAS: Record<string, { vista: VistaObra; sub: SubTareas }> = {
  planificacion: { vista: 'tareas', sub: 'arbol' },
  cronograma: { vista: 'tareas', sub: 'gantt' },
  gantt: { vista: 'tareas', sub: 'gantt' },
  ejecucion: { vista: 'tareas', sub: 'parte' },
}

/** Las sub-vistas retiradas: sus URLs viejas abren el Cronograma, que es donde vive lo que
 *  mostraban, en vez de caer en silencio en el árbol. */
const SUB_ALIAS: Record<string, SubTareas> = {
  lista: 'gantt',
  tablero: 'gantt',
  proximos: 'gantt',
}

const resolverSub = (subRaw: string | undefined, porDefecto: SubTareas): SubTareas =>
  esSubTareas(subRaw) ? subRaw : (subRaw && SUB_ALIAS[subRaw]) || porDefecto

/**
 * Resuelve `?vista=` y `?sub=` juntos. Van juntos a propósito: el alias de una vista vieja decide
 * también con qué sub-vista abre, y resolverlos por separado dejaba `?vista=ejecucion` cayendo en
 * el árbol —que no tiene el formulario del parte— sin un solo error.
 */
export function resolverVistaObra(
  vistaRaw: string | undefined, subRaw: string | undefined,
): { vista: VistaObra; sub: SubTareas } {
  const directa = VISTAS_OBRA.find((v) => v.id === vistaRaw)
  if (directa) {
    return { vista: directa.id, sub: resolverSub(subRaw, 'arbol') }
  }
  const alias = vistaRaw ? ALIAS[vistaRaw] : undefined
  if (alias) return { vista: alias.vista, sub: resolverSub(subRaw, alias.sub) }
  return { vista: 'resumen', sub: 'arbol' }
}
