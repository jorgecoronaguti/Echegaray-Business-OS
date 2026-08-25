// LOS SEIS MOTIVOS DE M07 — categorías cerradas, no un campo libre.
//
// ═══ POR QUÉ SEIS Y POR QUÉ CERRADOS ═══
//
// La nota del mockup: «Seis categorías fijas: se puede contar y comparar entre obras». Un campo de
// texto libre produce «faltan bloques», «no llegó el material», «bloque 18x18 no está» — tres filas
// que son el mismo problema y que ninguna consulta puede agrupar. El texto libre sigue existiendo,
// pero DEBAJO del motivo: el motivo clasifica, la descripción explica.
//
// ═══ LA CLAVE ES LA DE LA BASE, NO LA DEL DIBUJO ═══
//
// Cada motivo viaja con la clave que `obra_restriccion_tipo_check` ya acepta. Inventar una clave
// nueva desde la pantalla —«plano», «gente»— hace rebotar el insert con un 23514 y el operario ve
// un error rojo por haber tocado bien. Por eso el mapeo vive acá, se prueba, y `esMotivo()` es la
// única puerta: lo que no está en la lista no se manda.

export interface Motivo {
  /** Lo que el operario toca. */
  id: string
  label: string
  /** Lo que entra en `obra_restriccion.tipo`. */
  tipo: string
  /** La ayuda de una línea que se abre con el motivo elegido: qué se espera que escriba. */
  pista: string
}

export const MOTIVOS: Motivo[] = [
  { id: 'material', label: 'Falta material', tipo: 'material', pista: 'Qué material y cuánto falta.' },
  { id: 'equipo', label: 'Equipo o herramienta', tipo: 'equipo', pista: 'Qué equipo, y si está roto o no está.' },
  { id: 'gente', label: 'Falta gente', tipo: 'mano_de_obra', pista: 'Cuántos faltan y para qué tarea.' },
  { id: 'clima', label: 'Clima', tipo: 'clima', pista: 'Qué no se puede hacer con este clima.' },
  { id: 'plano', label: 'Plano o medida', tipo: 'informacion', pista: 'Qué dato falta o no cierra.' },
  { id: 'seguridad', label: 'Seguridad', tipo: 'seguridad', pista: 'Qué condición insegura hay.' },
]

/** El motivo por su id de pantalla, o `null`. Nunca un motivo por defecto: elegir por el operario
 *  es exactamente lo que estas seis categorías vinieron a evitar. */
export function motivoDe(id: string | null | undefined): Motivo | null {
  if (!id) return null
  return MOTIVOS.find((m) => m.id === id) ?? null
}

/** La clave que va a la base, o `sin_clasificar` cuando no se eligió ninguna. `sin_clasificar` y no
 *  `otro`: `otro` AFIRMA que alguien miró la lista y no encajaba en ninguna. */
export function tipoDeMotivo(id: string | null | undefined): string {
  return motivoDe(id)?.tipo ?? 'sin_clasificar'
}
