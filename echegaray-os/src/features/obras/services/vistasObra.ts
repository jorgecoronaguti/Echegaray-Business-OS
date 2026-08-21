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
  { id: 'tareas', label: 'Tareas' },
  { id: 'personal', label: 'Personal' },
  { id: 'operacion', label: 'Operación' },
  { id: 'economia', label: 'Economía' },
  { id: 'documentos', label: 'Documentos' },
] as const
export type VistaObra = (typeof VISTAS_OBRA)[number]['id']

// ═══ EL GANTT DE TAREAS Y LA PANTALLA «CRONOGRAMA» NO SON DOS VERDADES (21/08/2026) ═══
//
// Conviven, y hay que decir por qué antes de que alguien las tome por un descuido. Las DOS leen
// `obra_actividad_control` —la misma fuente, con el mismo portero— y contestan preguntas distintas:
//
//   `?vista=tareas&sub=gantt`      → **el plan COMO ESTÁ CARGADO**. Dibuja `inicio_plan`/`fin_plan`
//                                     tal como alguien los escribió. Es el tracker de todos los días.
//   `/obras/<obra>/cronograma`     → **el plan COMO LO IMPLICA LA SECUENCIA**. Recalcula fechas desde
//                                     las dependencias y las duraciones, y de ahí salen la holgura y
//                                     el camino crítico. Con cero dependencias cargadas se niega a
//                                     publicar un fin de obra y dice «sin secuencia cargada».
//
// Las dos son pantallas del contrato (03 · Obra Tareas y 07 · Obra Cronograma). Lo que sí sería un
// defecto es que las barras difieran y nadie explique por qué: por eso el rótulo de la sub-vista
// dice «Gantt» y no «Cronograma», y por eso `CRONOGRAMA_CALCULADO` existe acá y no como una URL
// escrita a mano en un componente.

/** La pantalla 07: el cronograma calculado desde la secuencia. Vive fuera del workspace porque
 *  recalcula en vez de dibujar lo guardado, y esa diferencia tiene que ser visible en la URL. */
export const hrefCronogramaCalculado = (obraId: string) => `/obras/${obraId}/cronograma`

/** La pantalla 08, por la misma razón. */
export const hrefDotacion = (obraId: string) => `/obras/${obraId}/dotacion`

/** La pantalla 10. Cuelga de Tareas —un paquete es una porción del alcance de actividades que ya
 *  existen, no un trabajo paralelo— pero vive fuera del workspace: mira el MISMO alcance desde el
 *  lado del tercero que lo ejecuta, con su contrato, sus papeles y su gente. */
export const hrefSubcontratos = (obraId: string) => `/obras/${obraId}/subcontratos`

/** Las vistas del workspace de Tareas: el árbol nuevo y las cuatro del cronograma más el parte. */
export const SUBS_TAREAS = [
  { id: 'arbol', label: 'Tareas' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'lista', label: 'Lista' },
  { id: 'tablero', label: 'Tablero' },
  { id: 'proximos', label: 'Próximos' },
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
    return { vista: directa.id, sub: esSubTareas(subRaw) ? subRaw : 'arbol' }
  }
  const alias = vistaRaw ? ALIAS[vistaRaw] : undefined
  if (alias) return { vista: alias.vista, sub: esSubTareas(subRaw) ? subRaw : alias.sub }
  return { vista: 'resumen', sub: 'arbol' }
}
