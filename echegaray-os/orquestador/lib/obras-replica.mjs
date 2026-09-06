// EL CONTRATO DE `_OBRAS_RAW` — el nombre, las columnas, el rango y la fórmula que lo cita.
//
// POR QUÉ ES UN MÓDULO PROPIO Y MINÚSCULO (05/09/2026). Tres archivos necesitan estas constantes: el
// generador de la réplica (`scripts/obras-raw-pestana.mjs`), la grilla que la cita
// (`lib/obras-grilla.mjs`) y la traducción del plan (`lib/obras-egresos-proyectados.mjs`). Si cada
// uno escribe su propia letra de columna o su propio tope de rango, el día que la réplica crezca de
// 200 a 400 filas la fórmula va a seguir sumando hasta la 200 y va a publicar un costo proyectado
// más chico SIN UN SOLO ERROR — el defecto de rango fosilizado que este repo ya pagó dos veces.
//
// SIN IMPORTS A PROPÓSITO: `obras-egresos-proyectados` cuelga de `materiales-fusion`, que cuelga de
// `obras-grilla`. Un contrato que importara cualquiera de los tres cerraría el ciclo.

/** La pestaña réplica. Guion bajo adelante = INSUMO: los auditores de pantalla no la miran. */
export const PESTANA_REPLICA = '_OBRAS_RAW'

/** El orden de las columnas ES CONTRATO: las fórmulas citan por letra. Se agrega al final, nunca en
 *  el medio — insertar una columna le cambiaría el significado a la fórmula de golpe y en silencio. */
export const REPLICA_COLUMNAS = Object.freeze([
  ['Obra (clave)', 'texto'], ['Obra', 'texto'], ['Tipo', 'texto'], ['Concepto', 'texto'],
  ['Familia', 'texto'], ['Proveedor', 'texto'], ['Fecha estimada', 'fecha'], ['Monto', 'monedaExacta'],
  ['Celda de origen', 'texto'], ['Leído el', 'texto'], ['De dónde sale', 'texto'],
])
export const REPLICA_COL = Object.freeze({ obraClave: 'A', obra: 'B', tipo: 'C', monto: 'H' })

/** Primera fila de datos: 1 título, 2 nota, 3 encabezado. */
export const REPLICA_DESDE = 4
/** Última fila que citan las fórmulas. RANGO CERRADO. El generador ROMPE si los datos no entran. */
export const REPLICA_HASTA = 200

/**
 * LA FÓRMULA DEL COSTO PROYECTADO DE UNA OBRA — SUMA LA FUENTE, NO ESTAMPA EL RESULTADO.
 *
 * ═══ QUÉ ERA ANTES Y POR QUÉ ESTABA MAL ═══
 *
 * Era `totalEgresos(o)`: un número calculado en JavaScript el día de la corrida y pegado en la
 * celda. El censo de números pegados lo contaba —con razón— como violación de la regla del dueño:
 * «nunca un número pegado: todo en celda referenciada y/o fórmula». Un número así envejece en
 * silencio: se corrige el plan de una obra y el cuadro sigue publicando el de ayer.
 *
 * ═══ POR QUÉ EL `COUNTIFS` DE ADELANTE NO SOBRA ═══
 *
 * Un `SUMIFS` sobre una obra que la réplica no tiene devuelve CERO, y el formato de moneda de la
 * pestaña dibuja el cero como «—»: el costo proyectado de una obra desaparecería sin que nada
 * grite. Con el `COUNTIFS`, la ausencia de plan sale como `#N/A`, y `celdasEnError` la levanta en la
 * relectura. Un dato que falta se ve; uno inventado, no.
 *
 * es-AR: el separador de argumentos es `;`. No hay decimales en la fórmula, así que no hay coma que
 * se pueda confundir con un separador.
 *
 * @param {string} obra el rótulo de la obra, tal como lo escribe la réplica en su columna B
 */
export function formulaCostoProyectado(obra, { pestana = PESTANA_REPLICA, desde = REPLICA_DESDE, hasta = REPLICA_HASTA } = {}) {
  const criterio = `${pestana}!$${REPLICA_COL.obra}$${desde}:$${REPLICA_COL.obra}$${hasta};"${String(obra ?? '')}"`
  return `=IF(COUNTIFS(${criterio})=0;NA();SUMIFS(${pestana}!$${REPLICA_COL.monto}$${desde}:$${REPLICA_COL.monto}$${hasta};${criterio}))`
}
