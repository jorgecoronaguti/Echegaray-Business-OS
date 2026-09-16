/**
 * LA MARCA QUE DEJA `asistencia-obra-por-dia` EN `notas` CUANDO PONE LA OBRA DEL DÍA.
 *
 * Medido el 16/09/2026: 150 filas `sheet:jornales` cambiaban de obra cuatro veces por día. El ledger
 * diario de ASISTENCIA las ponía en la obra específica (le-galpon-9, le-comedor…) y una hora después
 * el importador de JORNALES —que resuelve la obra por el rótulo de la quincena— las devolvía a la
 * general del cliente (la-estrella). La cronología de cada empleado cambiaba según la hora en que se
 * mirara. Con esta marca, el importador sabe que la obra de esa fila la decidió un ledger diario y
 * no la vuelve a mover; sigue actualizando horas y tipo, que son de la planilla.
 */
export const ANCLA_ASISTENCIA = 'obra del día según ASISTENCIA'
export const tieneAncla = (notas) => typeof notas === 'string' && notas.includes(ANCLA_ASISTENCIA)
