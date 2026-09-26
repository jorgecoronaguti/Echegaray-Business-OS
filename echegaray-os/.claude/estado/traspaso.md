# TRASPASO — 26/09/2026 noche (sesión 2eaa7060)

**Primero:** `node orquestador/scripts/medir-tokens.mjs` sobre la sesión anterior; la base es d50fb332 = 3.371 M (95 % Opus, 400 k de contexto medio).

**Publicado y verificado hoy**
- Configuración raíz `.claude/`: las skills, los agentes y las reglas de `echegaray-os/.claude` + hooks. Antes, con la sesión abierta en la raíz, no cargaba NADA (ni las prohibiciones del Sheet). Probado con `claude -p`: skills=SI agentes=SI.
- Hook de cierre (Stop) APAGADO: sobre el daily sucio corrió >4 min sin terminar. Hace falta que valide sólo lo que cambió EN la sesión.
- Tokens: Sonnet por defecto en agentes, `autoCompactWindow` 300 k, portero v2 sin tope por hora, índice del OS en cada mensaje, `contexto-minimo --tipo script`, `medir-tokens.mjs`.
- Compras en la app: papeles de las cargas web, CHECK de la repesca, SRL/SA, 409 dentro de un 400 (filas 946, 951, 1009, 1010 y 1011 verificadas).
- DESPEGAR en la fila 1011.

**Pendiente**
1. Dueño: ¿cargar en Compras las 18 facturas web del 21/09 sin fila (Alumetal, Starlink, MB, Federación, Telefónica)?
2. Bot: el chequeo aritmético no suma lo «no gravado/exento» (causa del «no cierran» de DESPEGAR).
3. Gantt: dependencias propuestas en wt-gantt-dep (migración aplicada, 46 en quattropani, interfaz sin commitear).
4. Hook de cierre: validar sólo lo que cambió en la sesión.
5. Medir el buscador con pedidos reales del dueño.
6. 71 % del contexto de ayer fueron lecturas grep/sed/cat: leer por tramos y usar el índice antes de abrir archivos.
