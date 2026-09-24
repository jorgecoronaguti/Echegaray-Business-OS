// EL BORDE DEL EJERCICIO — dónde termina el año para las dos vistas, y por qué no puede terminar en
// dos lugares distintos.
//
// ═══ EL DEFECTO (medido el 13/08/2026 sobre el archivo vivo) ═══
//
// Las dos pestañas daban resultados del año DISTINTOS, y no por redondeo:
//
//     Egresos proyectados   Semanal (BC) $364.126.253   ·   Mensual (N) $351.052.936   → Δ $13.073.317
//     Resultado del año     Semanal      ($57.164.937)  ·   Mensual      ($44.091.619) → Δ $13.073.318
//
// La causa es geométrica, no de fórmula. La vista mensual son doce ventanas que cubren EXACTAMENTE
// [1/1/2026, 1/1/2027). La semanal son 53 semanas ISO que se DERRAMAN sobre el año vecino de los dos
// lados: la primera arranca el lunes 29/12/2025 y la última (28/12/2026) termina el 4/1/2027. Como
// cada columna suma `fecha >= encabezado` y `fecha < encabezado+7`, la última capturaba los dos
// movimientos que el libro tiene fechados el 01/01/2027 —"Jornales · quincena proyectada al
// 2026-12-31" $9.110.600,82 y "Oficina · 2027-01-01" $3.962.716,30— y el TOTAL, que es
// `SUM($B$35:$BB$35)`, se los llevaba al año.
//
// ═══ LO QUE DE VERDAD IMPORTABA NO ERA EL TOTAL ═══
//
// `PISO DEL PERÍODO` sale de `MIN($B$50:$BB$50)` sobre la fila de saldo final, y el mínimo caía en esa
// última columna contaminada. El dueño leía un piso ~$13,1M más alarmante que el real, y sobre el piso
// se decide si se entra al descubierto. Un número mal en el titular vale más que la misma diferencia
// escondida en un total anual.
//
// ═══ POR QUÉ SE ACOTA LA VENTANA Y NO SE REEMPLAZA EL TOTAL ═══
//
// La alternativa evaluada era dejar las columnas como están y que la celda TOTAL filtrara
// `_MOVIMIENTOS` directo por el año, como hace el Mensual. SE DESCARTÓ, por dos razones:
//
//   1. NO ARREGLA EL PISO, que es lo que más importa. El piso no sale del TOTAL: sale del MIN sobre la
//      fila de saldo final. Con el TOTAL parchado, la columna del 28/12 SEGUIRÍA mostrando egresos de
//      enero, su saldo final seguiría hundido y el hero seguiría mintiendo. Se arreglaría el número
//      que nadie mira y quedaría roto el que decide.
//   2. ROMPE LA IDENTIDAD "el total es la suma de lo que muestra la fila". Un TOTAL calculado por otra
//      vía que la suma de sus columnas es, literalmente, doble lógica sobre el mismo hecho: dos
//      fórmulas que pueden divergir sin que nadie lo note — la enfermedad que el libro canónico vino a
//      curar. Acotar la ventana corrige el dato EN SU ORIGEN, y todo lo que cuelga de la columna
//      (saldo corrido, piso, gráficos, sección por cliente) se corrige solo.
//
// ═══ SE ACOTAN LOS DOS BORDES, NO SÓLO EL DE DICIEMBRE ═══
//
// Hoy sólo duele el de arriba porque el libro no tiene movimientos del 29 al 31/12/2025. Eso es suerte
// del dato, no diseño: el importador del banco carga lo que trae el extracto y una fila de esos tres
// días entraría mañana en la primera columna sin que nadie la haya pedido. Con los dos bordes acotados,
// `particionExacta(efectivas, 1/1/anio, 1/1/anio+1)` es verdadera para las DOS vistas, que es la
// condición declarada en cash-flow-matriz para que no puedan discrepar.
//
// ═══ ENERO DEL AÑO SIGUIENTE, EN SU PROPIO BLOQUE (24/09/2026) ═══
//
// El recorte en el 1/1 dejó un costo que el dueño midió después: $45,4M de pagos de enero de 2027
// —obligaciones de diciembre que vencen en enero— no aparecían en ninguna pestaña. Pidió verlos, y
// pidió DÓNDE: *«si vas a crear el 2027 hacelo después de los totales del 2026»*. Así que el recorte
// en el 1/1 SE QUEDA —el TOTAL 2026 no suma un peso de 2027— y lo que se agrega es un segundo bloque a
// la derecha del TOTAL, hasta el 31/01 (`finDeLaVista`).
//
// La semana del 28/12 queda en los DOS bloques: a la izquierda del TOTAL suma del 28 al 31/12 y a la
// derecha, del 1 al 3/01. Es exactamente el tratamiento que ya tenía la primera columna del ejercicio
// (la del 29/12/2025, que suma desde el 1/1), aplicado del otro lado. Las dos vistas cubren el mismo
// horizonte [1/1/2026, 1/2/2027) y lo parten sin huecos ni solapamientos; lo verifica la guarda de
// cobertura antes de escribir.
//
// Qué columna se recorta lo deciden las FECHAS (`recorteDe`), no la posición: para 2026 son tres —la
// primera del ejercicio, la última del ejercicio y la primera del año siguiente—. La última del año
// siguiente (25/01/2027) termina justo el 1/2 y no lleva nada.
//
// LA COLUMNA SIGUE ROTULADA CON SU LUNES, y está bien: el encabezado dice de qué semana se habla
// (28/12) y la ventana dice qué parte de esa semana pertenece al ejercicio (28 al 31). Mover el
// encabezado al 1/1 sería peor —dos columnas arrancarían el mismo día y el filtro se solaparía—.

import { finDeLaVista } from './cash-flow-matriz.mjs'

/** El ejercicio como intervalo semi-abierto [1/1/anio, 1/1/anio+1). PURA. */
export function bordeDelEjercicio(anio) {
  return { inicio: new Date(Date.UTC(anio, 0, 1)), fin: new Date(Date.UTC(anio + 1, 0, 1)) }
}

/**
 * LO QUE LAS VISTAS CUBREN: [1/1/anio, finDeLaVista) — el ejercicio más su asomo al año siguiente
 * (24/09/2026). Es el intervalo que las dos pestañas tienen que cubrir igual. PURA.
 */
export function horizonteDeLaVista(anio) {
  return { inicio: new Date(Date.UTC(anio, 0, 1)), fin: finDeLaVista(anio) }
}

/**
 * EL RECORTE DE UNA COLUMNA: qué borde de su ventana de calendario NO suma. PURA.
 *
 * `desde`/`hasta` son las fechas del recorte (o null si ese lado no se recorta). Recibe una columna de
 * `columnasDeLaVista` —que ya trae su ventana de calendario y lo que suma— y compara las dos.
 */
export function recorteDe(columna) {
  const t = (d) => new Date(d).getTime()
  return {
    desde: t(columna.desde) > t(columna.ventana.desde) ? new Date(columna.desde) : null,
    hasta: t(columna.hasta) < t(columna.ventana.hasta) ? new Date(columna.hasta) : null,
  }
}

/**
 * LA EXPRESIÓN DE VENTANA, RECORTADA DONDE LA COLUMNA LO PIDE. PURA.
 *
 * Sólo toca los bordes: pedirle el recorte a las columnas del medio alargaría decenas de fórmulas
 * para envolver una comparación que ya es verdadera. Las de los meses no lo necesitan NUNCA —un mes
 * arranca el 1° y termina el 1° del siguiente por construcción— y por eso el mensual no llama a esto.
 *
 * `DATE(a;m;d)` y no un serial tipeado: un número mágico en una fórmula no se puede leer en la celda.
 * El separador `;` es el del archivo (locale es_AR), como todo argumento de fórmula del repo.
 *
 * @param {{desde:string, hasta:string}} exp la de `expresionVentana`
 * @param {{desde?:Date|null, hasta?:Date|null}} recorte el de `recorteDe`
 */
export function expresionAcotada(exp, { desde = null, hasta = null } = {}) {
  const fecha = (d) => `DATE(${d.getUTCFullYear()};${d.getUTCMonth() + 1};${d.getUTCDate()})`
  return {
    desde: desde ? `MAX(${exp.desde};${fecha(desde)})` : exp.desde,
    hasta: hasta ? `MIN(${exp.hasta};${fecha(hasta)})` : exp.hasta,
  }
}
