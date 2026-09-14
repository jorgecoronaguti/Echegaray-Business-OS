// LA CASILLA «ASIGNAR» DE LA CORRECCIÓN DE JORNADA ASIGNA ESE DÍA, NO DE ESE DÍA EN ADELANTE.
//
// Hasta el 14/09/2026 abría una asignación SIN FIN desde una fecha pasada y sin cerrar la de su obra:
// corregir el martes dejaba a la persona guardada en dos obras desde el martes para siempre. Corregir un
// día es un día suelto, y el día suelto no parte el tramo largo ni cierra nada
// (`orquestador/lib/cronologia-asignaciones.mjs`): la lectura le da ese día a la asignación más corta.
//
// Vive fuera de `jornadaPorObraActions.ts` porque aquélla es una server action y no se puede probar sin
// Next: acá la forma de la fila se prueba con `node --test`.

export interface AltaDeLaCasilla {
  obra_id: string
  persona_id: string
  rol: 'integrante'
  desde: string
  hasta: string
}

export function altaDeLaCasilla(
  { obraId, personaId, fecha }: { obraId: string; personaId: string; fecha: string },
): AltaDeLaCasilla {
  return { obra_id: obraId, persona_id: personaId, rol: 'integrante', desde: fecha, hasta: fecha }
}
