// EL RECORTE POR OBRA DEL PLANTEL — dueño, 16/09/2026: *«necesito filtros por obra en la sección de
// plantel donde marco asistencias, tardanzas etc., en vista computadora»*.
//
// ═══ QUÉ DECIDE ESTE ARCHIVO Y QUÉ NO ═══
//
// Decide QUIÉN entra en el recorte y CUÁNTAS personas anuncia cada chip. No dibuja nada y no sabe de
// URLs: la pantalla arma los enlaces con `enlaceDeVista.ts` y los pinta con `FiltrosSuaves`.
//
// ═══ EL NÚMERO Y LA LISTA SALEN DE LA MISMA LECTURA ═══
//
// Los chips se cuentan sobre las filas de `getConteosDeFiltro` —el padrón entero, una sola consulta—
// y la tabla se recorta con `filtrarPorObra` sobre la lista del directorio. La regla de pertenencia
// es UNA (`esDeLaObra`): si contar y filtrar usaran criterios distintos, el chip diría 5 y abajo
// habría 4, que es la clase de defecto que nadie reporta y todos dejan de creerle a la pantalla.
//
// ═══ LOS CHIPS CUENTAN LA POBLACIÓN DEL CORTE, NO LA PÁGINA ═══
//
// Misma regla que las cuatro pastillas de arriba (`getConteosDeFiltro`): el número no se mueve al
// escribir en el buscador ni al elegir otra obra. Un chip que al activarse pone a los demás en cero
// deja de ser un filtro y se vuelve un informe de sí mismo.

import { perteneceAlCorte, type FilaDeConteo, type FiltroPersonal } from './personasService.ts'

/** Un chip del recorte por obra. La clave es el id de la obra —que además es el slug de la URL—. */
export interface ChipDeObra {
  clave: string
  etiqueta: string
  cuenta: number
}

/** Lo mínimo para saber si una fila del directorio cae en el recorte. */
export interface FilaConObra {
  obra_actual_id: string | null
}

/** ¿Esta persona está en la obra elegida? El `null` de la URL es «todas», no «ninguna». */
export function esDeLaObra(fila: FilaConObra, elegida: string): boolean {
  return fila.obra_actual_id === elegida
}

/**
 * LA TABLA RECORTADA. Sin obra elegida devuelve todo: un parámetro vacío no es un filtro.
 *
 * Se recorta EN MEMORIA y no con un `eq()` más en la consulta a propósito: así el recorte usa la
 * misma regla que cuenta los chips y se puede probar sin base. Son 74 filas —el padrón entero—, no
 * una tabla que crezca con las obras.
 */
export function filtrarPorObra<T extends FilaConObra>(personas: readonly T[], elegida?: string): T[] {
  const clave = elegida?.trim()
  if (!clave) return [...personas]
  return personas.filter((p) => esDeLaObra(p, clave))
}

/**
 * LOS CHIPS: una obra por cada una que tenga gente EN EL CORTE, de la más numerosa a la menos.
 *
 * ═══ UNA OBRA SIN NOMBRE NO SE DIBUJA ═══
 *
 * `obra_actual_id` es un slug (`messina-playon-dilucion-acido`) y el dueño pidió explícitamente no
 * ver slugs en pantalla. Si la lectura no trajo el nombre, la obra no tiene chip — su gente se sigue
 * viendo en «Todas», que es lo honesto: perder una puerta es más barato que publicar un identificador
 * interno como si fuera el nombre de la obra.
 *
 * ═══ LA ELEGIDA SIEMPRE TIENE SU CHIP, AUNQUE HOY NO ALCANCE A NADIE ═══
 *
 * Es la lección del 11/09/2026 en la grilla de Horas: *«le pongo el filtro a obra y no se puede sacar
 * después»*. Al cambiar de corte —de «Plantel» a «Inactivos»— la obra elegida puede quedarse sin
 * gente; si además desaparece su chip, el recorte queda puesto sin nada que apretar para apagarlo y
 * la tabla se ve vacía sin ninguna señal de qué la está recortando. El nombre para ese chip se busca
 * en el padrón ENTERO, no en el corte, que es donde todavía existe.
 */
export function obrasDelCorte(
  filas: FilaDeConteo[],
  filtro: FiltroPersonal,
  elegida?: string,
): ChipDeObra[] {
  const nombres = new Map<string, string>()
  for (const f of filas) {
    const nombre = f.obra_actual?.trim()
    if (f.obra_actual_id && nombre) nombres.set(f.obra_actual_id, nombre)
  }
  const cuentas = new Map<string, number>()
  for (const f of filas) {
    if (!f.obra_actual_id || !perteneceAlCorte(f, filtro)) continue
    cuentas.set(f.obra_actual_id, (cuentas.get(f.obra_actual_id) ?? 0) + 1)
  }
  const chips = [...cuentas.entries()]
    .filter(([clave]) => nombres.has(clave))
    .map(([clave, cuenta]) => ({ clave, etiqueta: nombres.get(clave) as string, cuenta }))
    .sort((a, b) => b.cuenta - a.cuenta || a.etiqueta.localeCompare(b.etiqueta, 'es'))
  const puesta = elegida?.trim()
  if (puesta && !cuentas.has(puesta) && nombres.has(puesta)) {
    chips.push({ clave: puesta, etiqueta: nombres.get(puesta) as string, cuenta: 0 })
  }
  return chips
}

/**
 * «SIN OBRA» — Y POR QUÉ NO ES UN RECORTE NUEVO.
 *
 * La pantalla YA tiene esa población en una pastilla que se llama «Sin asignar». Agregar un segundo
 * control con el mismo significado y otro nombre sería dos verdades para un solo hecho: el día que
 * una cambie de criterio, la pantalla se contradice a sí misma. Por eso el chip «Sin obra» existe
 * donde el usuario lo busca —entre las obras— pero su enlace es el recorte que ya existe, y su número
 * se calcula con el corte `sin_asignar`, no con una cuenta propia.
 *
 * DÓNDE APARECE. En «Plantel», que es de donde se sale a buscarlo, y en «Sin asignar», donde además
 * queda ACTIVO: el chip que se acaba de apretar no puede desaparecer al aplicarse — eso se lee como
 * que el clic no hizo nada. En «En obra» es vacío por definición, y en «Inactivos» nadie tiene obra
 * vigente (57 de 57 el 16/09/2026), así que sería una puerta al corte entero con otro nombre.
 *
 * `null` = no se dibuja. Nunca un cero: un chip que promete cero filas es una puerta a una pieza vacía.
 */
export function sinObraDelCorte(filas: FilaDeConteo[], filtro: FiltroPersonal): number | null {
  if (filtro !== 'plantel' && filtro !== 'sin_asignar') return null
  const cuenta = filas.filter((f) => perteneceAlCorte(f, 'sin_asignar')).length
  return cuenta > 0 ? cuenta : null
}

/**
 * ¿EL RECORTE POR OBRA SOBREVIVE A UN CAMBIO DE PASTILLA?
 *
 * Sí, salvo hacia «Sin asignar»: «esta persona no tiene obra» y «esta persona está en la obra X» no
 * pueden ser ciertas a la vez, así que arrastrar la obra ahí promete un recorte que SIEMPRE devuelve
 * cero filas. Es la misma decisión por la que el enlace a la solapa Horas no arrastra `f=sin_asignar`:
 * un filtro que no puede alcanzar a nadie no se ofrece.
 *
 * Hacia «Inactivos» sí viaja: un legajo cerrado con obra vigente es raro, pero el modelo lo admite y
 * hoy es una afirmación sobre los datos, no sobre las definiciones.
 */
export function obraSobreviveAlCorte(filtro: FiltroPersonal): boolean {
  return filtro !== 'sin_asignar'
}
