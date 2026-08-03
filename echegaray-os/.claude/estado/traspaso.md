fecha: 2026-08-03

## OBJETIVO

Cargar todo lo del 03/08 al Flujo de Fondos (comprobantes, extracto, cheques), poner agosto como
mes real, arreglar Jornales, sacar el plan previsional duplicado de Impuestos, y darle al dueño la
recomendación de instrumento en Balanz.

El dueño autorizó levantar el freno de Sheets **para esto**, y fijó la regla: *"no tenés permiso de
correr el mantenedor de sheet nunca, yo si te digo q hagas algo en el sheet lo haces y listo"*. El
freno se levanta por comando (`ORQ_SHEETS_DESCONGELAR`), NO borrando la marca: los timers y agentes
siguen apagados.

## DÓNDE QUEDÓ

**HECHO Y VERIFICADO EN EL DESTINO:**
- Snapshot completo previo en `/home/jorge/echegaray-os/snapshots/flujo-2026-08-03T12-56-42/`
  (25 pestañas, 74.630 celdas, 16.094 fórmulas). Es la marcha atrás.
- **Compras filas 800-806**: los 7 comprobantes cargados y leídos de vuelta uno por uno. Incluye la
  nota de crédito en NEGATIVO (−406,06). Proveedor nuevo "Ductos San Juan SRL" agregado al
  desplegable estricto. Obras: MESSINA ×3, LA ESTRELLA ×1, San Francisco ×3 (las de Ductos, decidido
  por el dueño).
- Piso de reserva calculado: **$41.004.461**. Caja restringida: **$48.148.311** (de Cheques
  Emitidos, su control cierra). Excedente: **$40.119.900**.

**FRENADO A PROPÓSITO — NO CARGAR HASTA QUE ESTÉ EL ARREGLO:**
- El extracto (239 movimientos, `scratchpad/banco/extracto-03-08.csv`) **no se cargó**: el dedup dio
  "239 nuevos · 0 ya estaban" con 170 ya en la base y ventanas superpuestas. Habría metido ~170
  duplicados. Causa localizada: `clave()` en `banco-importar.mjs:252` incluye el SALDO, que cambia
  entre descargas; y la consulta de `importar-banco.mjs:134` ni siquiera selecciona `referencia`.

## DECISIONES

- **El auto-candado es levantable, el candado del dueño no.** Un append a filas confirmadas vacías
  no puede destruir nada. El dueño lo confirmó explícitamente.
- **Las de Ductos van a San Francisco** (decisión del dueño, no inferencia mía; yo había propuesto
  LA ESTRELLA por el rubro sanitario).
- **No sacar el plan previsional de Impuestos todavía**: verifiqué que NO se duplica en los cash
  flows — ambos leen de `Compras` col AC "Deuda previsional (planes de pago)". Sacarlo es
  presentación, no corrige ningún número.

## VERIFICADO / NO VERIFICADO

- VERIFICADO: las 7 filas de Compras leídas del destino con valores exactos y fórmulas por fila
  bajadas (A D O Q R T U X Z AG AH AI). Y/AA vacías igual que en 798-799.
- VERIFICADO: `npm run orq:test` 2.384 / 0 fallas · typecheck limpio.
- VERIFICADO: el cheque FÍSICO N°223 Corralón $200.000 marcado "vencido sin debitar" SÍ salió — el
  20/07 como "Canje interno recibido 24 hs" ref 000000223. La conciliación sólo reconoce "Cheque
  debitado" y se pierde "Canje interno recibido" (hay 5 movimientos así en el extracto).
- NO VERIFICADO: nada del extracto ni de los cheques está cargado. Agosto sigue como proyección.
  Jornales sin tocar.

## BLOQUEOS

- **Tesorero**: NO_ACCIONABLE hasta que el dueño corra los dos comandos de aprobación
  (`tesoreria-politica.mjs aprobar reserva_minima` y `declarar caja_restringida --monto 48148311`),
  y hasta que el barrido de Balanz deje de truncar (worktree `fix/barrido-balanz-completo`,
  vueltas 15→45 y TOPE_CONTROLES 400→2000, sin terminar).

## PRÓXIMO PASO

Mergear `fix/dedup-banco-por-referencia` cuando termine, correr
`node orquestador/scripts/importar-banco.mjs <csv> --dry` y confirmar que dedupea los ~170
solapados. Recién ahí cargar con `--igual-cargalo` (el corte de la cadena de saldos del 16/06 es
legítimo: el banco lista un depósito de la sucursal 770 fuera de secuencia).

Después, en orden: agosto como mes real · Jornales (filas 5-19, sueldos 3M ×3 a Jorge/Rodrigo/Jorge
con inflación, verificar vínculo UOCRA) · sacar el plan de Impuestos y Financieros.

Worktrees en vuelo: `feat/comprobantes-por-mattermost`, `fix/dedup-banco-por-referencia`,
`fix/barrido-balanz-completo`.
