// QUÉ CELDA DE LA GRILLA DE «LIQUIDACIÓN → HORAS» SE PUEDE CORREGIR EN LÍNEA.
//
// ═══ POR QUÉ ESTO NO VIVE EN EL COMPONENTE ═══
//
// Vivía adentro de `HorasConPersona.tsx`, y ahí `node --test` no lo alcanza: la auditoría del
// 11/09/2026 lo dijo con todas las letras — si alguien cambiaba `=== 1` por `>= 1`, la corrección
// pasaría a imputarse a un registro elegido en silencio y NINGÚN test se pondría rojo. Una regla que
// decide sobre qué fila de la base se escribe no puede ser una condición suelta adentro de un JSX.
//
// ═══ LAS DOS RAZONES POR LAS QUE UNA CELDA NO OFRECE CAMPO ═══
//
//  · LA QUINCENA ESTÁ CERRADA. Las horas quedaron selladas. La acción lo vuelve a comprobar contra
//    la base (`corregirHorasDelDia` → `quincenaCerrada`): esto sólo evita ofrecer algo que rebota.
//  · EL DÍA TIENE MÁS DE UN REGISTRO. Un solo campo tendría que elegir en silencio a cuál se le
//    imputa la corrección. No es «dos obras»: los dos casos reales medidos en la grilla son
//    `licencia + normal` de la MISMA obra. Es que hay más de una fila candidata, y quien corrige
//    tiene que ver cuál elige — eso lo muestra el panel de la persona, una celda por registro.
//
// Un día SIN registros no aparece acá y tampoco ofrece campo: no hay nada que corregir, y crear un
// registro exige decir a qué obra se imputa, que es mover costo de mano de obra.

/** Lo mínimo que hace falta de un registro para decidir. Es un subconjunto de `RegistroDelPanel`. */
export interface RegistroDeUnDia {
  id: string
  fecha: string
}

/** El registro al que se le imputa la corrección de esa celda, o `null` si no hay uno solo. */
export interface EdicionDeCelda {
  registroId: string
}

/**
 * El índice `personaId|fecha → edición`, armado de los MISMOS registros que dibuja el panel.
 *
 * Se arma de `personas` y no de una lectura nueva a propósito: si el panel deja de dejar editar un
 * día, la celda de la grilla deja de dejarlo en el mismo momento y por la misma razón. Dos fuentes
 * serían dos respuestas a «¿este día se puede tocar?».
 */
export function indiceDeEdicion(
  personas: Record<string, { registrosDeLaQuincena: readonly RegistroDeUnDia[] }>,
  opciones: { cerrada: boolean },
): Map<string, EdicionDeCelda> {
  const indice = new Map<string, EdicionDeCelda>()
  if (opciones.cerrada) return indice
  for (const [personaId, datos] of Object.entries(personas)) {
    const porFecha = new Map<string, string[]>()
    for (const r of datos.registrosDeLaQuincena) {
      const suyos = porFecha.get(r.fecha)
      if (suyos) suyos.push(r.id)
      else porFecha.set(r.fecha, [r.id])
    }
    for (const [fecha, suyos] of porFecha) {
      // MÁS DE UNO NO SE OFRECE. Ni el primero ni «el que tenga horas»: elegir por el código es
      // exactamente lo que esta regla existe para no hacer.
      if (suyos.length === 1) indice.set(claveDeCelda(personaId, fecha), { registroId: suyos[0] })
    }
  }
  return indice
}

/** La clave del índice. Una sola función para que armar y consultar no puedan separarse. */
export function claveDeCelda(personaId: string, fecha: string): string {
  return `${personaId}|${fecha}`
}
