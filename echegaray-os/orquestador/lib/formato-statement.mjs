// LOS FORMATOS DE NÚMERO DE UN ESTADO FINANCIERO — una definición, no una por generador.
//
// POR QUÉ EXISTE (04/08). El dueño, sobre Recurrentes, Estructura y Materiales: "ninguna de esas
// pestañas respeta mi regla de oro: minimalista y de clase mundial". `estilo-statement.mjs` ya
// resolvía la PIEL (sin reja, sin barras rellenas, totales rulados) pero no el NÚMERO, y cada
// generador escribía su propio patrón de moneda copiándolo del de al lado. El resultado era el
// esperable: tres patrones distintos en tres pestañas del mismo archivo, el "$" repetido en cada
// celda del cuerpo, y contadores vestidos de plata ("Meses con gasto" mostrando "$5").
//
// LAS TRES REGLAS QUE CODIFICA, y por qué son ésas (convención de estado financiero, no gusto):
//
//   1. EL "$" ES DEL TOTAL. Un símbolo repetido ochenta veces deja de informar y sólo ensucia la
//      columna. La unidad se declara una vez, donde se cierra la cuenta.
//   2. EL CERO SE ESCRIBE "—". Un "$0" y un "no hubo movimiento" se leen distinto: la raya dice
//      "nada que informar acá" sin obligar al ojo a comparar dígitos.
//   3. EL ROJO NO ES DEL NÚMERO, ES DEL CONTROL. Un patrón con [Red] pinta cualquier negativo —una
//      nota de crédito legítima, una diferencia de medio centavo que el formato dibuja "-$0"— y
//      cuando todo puede ponerse rojo, el rojo no avisa de nada. Acá el negativo va con su signo, y
//      el único rojo de la pestaña lo pone una regla condicional sobre la celda del control.
//
// Los tres patrones llevan un tercer tramo (el del cero) y ninguno lleva decimales: en esta empresa
// no hay decisión que dependa de los centavos, y los centavos son ruido en una columna de importes.

/** Cuerpo de tabla: sin "$", negativo con signo, cero en raya. */
export const MONEDA_CUERPO = { type: 'CURRENCY', pattern: '#,##0;-#,##0;"—"' }

/** Fila de total y cifras de cierre: la única que declara la unidad. */
export const MONEDA_TOTAL = { type: 'CURRENCY', pattern: '"$"#,##0;-"$"#,##0;"—"' }

/** Un contador es un contador: ni "$", ni miles, ni decimales. */
export const CONTADOR = { type: 'NUMBER', pattern: '0;-0;"—"' }

/** Una proporción: un decimal alcanza para decidir. */
export const PORCENTAJE = { type: 'PERCENT', pattern: '0,0%' }

/**
 * EL ÚNICO COLOR DE LA PESTAÑA: una celda de control que no cierra.
 *
 * Va en el FORMATO DE NÚMERO y no en una regla condicional, a propósito. Una regla condicional hay
 * que borrarla antes de volver a ponerla, y para borrarla hay que saber cuántas hay: un
 * `deleteConditionalFormatRule` sobre un índice que no existe tumba el lote entero, y no borrar
 * apila una regla muerta por corrida — con el worker cada 2 horas, cincuenta reglas en una semana
 * apuntando a filas que ya no son las del control. El patrón de número no tiene ninguno de esos dos
 * problemas y dice exactamente lo mismo.
 *
 * Cero → raya gris (cierra, no hay nada que mirar). Cualquier otra cosa → rojo, positiva o negativa:
 * en un control lo que importa es que NO da cero, no de qué lado quedó.
 *
 * Se usa SÓLO en celdas de control. La celda lleva `ROUND(…;0)` en su fórmula, así que una diferencia
 * de fracciones de centavo vale cero exacto y no enciende el rojo — el falso positivo ("-$0" en rojo
 * con los datos perfectos) que hacía que el control se dejara de mirar.
 */
export const MONEDA_CONTROL = { type: 'CURRENCY', pattern: '[Red]"$"#,##0;[Red]-"$"#,##0;"—"' }
