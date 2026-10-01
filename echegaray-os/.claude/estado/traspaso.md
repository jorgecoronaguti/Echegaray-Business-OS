# TRASPASO — 01/10/2026 tarde (sesión 081bf46e) — LEER ESTO PRIMERO

`origin/main`, el checkout de la sesión (`echegaray-os-daily`, rama **main**) y producción en `0b8f46511`. Mandato vigente del dueño: «seguí con todo, aunque me quede sin conexión, y terminalo». Se le contesta por DM del bot (`avisar-al-dueno.mjs` desde producción).

**Permisos:** `git push origin HEAD:main` y `produccion-al-dia.mjs` andan. **`aplicar-migracion.mjs --aplicar` fue NEGADO por el clasificador a la tarde («Production Deploy»)**: no se rodea; lo aplica el dueño o lo autoriza. El MCP de Supabase declina `UPDATE` sueltos.

## BLOQUEADO — necesita al dueño
- **Dos migraciones sin aplicar (ensayadas OK, el código ya está en main):**
  `20261001T0400_efectivo_adelanto_exige_nivel.sql` y `20261001T1000_pago_efectivo_de_sueldo_exige_nivel.sql`.
  Son la segunda puerta (la base) de «sólo jefe de obra y Administración rinden». La primera puerta (el bot) está publicada y toma efecto con el reinicio nocturno del worker (2–5 h). Compatibles con el código viejo y el nuevo. Después de aplicarlas: probar en una transacción que se deshace que un perfil `campo` recibe 42501 en las dos funciones.
- **`20261001T0600_convenio_escala_septiembre_2026.sql`**: sin aplicar hasta que el dueño diga «aplicá septiembre».
- **Redondeo de Liquidación («rehacer»)**: dos rechazos. No hay tercer intento sin las cifras que el dueño espera para «Efectivo redondeado» y «Saldo redondeado» de la 2ª quincena de septiembre (hoy 3.744.000 / 7.877.000; cabecera 12.877.000). Pedidas por DM.

## Publicado hoy (tarde), verificado en producción con el usuario del dueño, sólo lectura, 1440 y 390
- `6bca70b47` Plantel sin el recorte «Cuentas» (no pedido).
- `93644d9b9` `4d7aca9cc` Liquidación: recorte «Presentismo» (Todos · Lo gana · No lo gana).
- `1bcd71860` App «no levanta»: el portero ya no rebota en bucle a quien quedó sin rol legible; «Salir» cierra sólo la sesión local; cabecera sin «Business OS», marca → Clientes. **Límite:** no pude reproducir por qué la lectura del perfil volvió vacía; validado por test y camino de código.
- `4eca80ef8` Panel de la persona: «Generar recibo» · «Ver blanco» · «Historial recibos».
- `7564f648a` Rodados: Mantenimiento muestra RTO y seguro vencidos desde los papeles (4 unidades).
- `1baaef8d1` `c43be756e` Recibos en lote: casillas + barra «Guardar e imprimir · 4 por hoja» (A4 horizontal). **Límite:** el botón no se apretó en producción (registra recibos reales); la hoja se verificó fuera de la app con el componente real.
- `6ec55d3f9` `5825b2f12` Efectivo: recibo del gasto manual firmado en pantalla (migración T0900 aplicada) y el recibo dice la obra del GASTO. **Límite:** nadie firmó uno real; el flujo del jefe por `/mi-informacion` no se vio con un gasto real.
- `0b8f46511` Bot Efectivo: quién rinde (lib única), Administración sin entrega propia, y nivel exigido también en el pago «de la caja» y el gasto sin ticket. Dos auditorías: firma con límites (ver BLOQUEADO). 1523 tests del chat, 0 fallas.
- Migraciones aplicadas hoy: T0300, T0700, T0800, T0900.

## Abierto, mío
- **Gasto manual de Efectivo (web):** el formulario no tiene obra ni categoría, y el proveedor escrito a mano viaja en el concepto (la celda E es desplegable estricto). La obra sale de la entrega: una entrega «Estructura» que paga un gasto de obra nace mal imputada (caso ER-0021 → Compras 1052, completada a mano). Arreglo: obra (por defecto la de la entrega) y proveedor del padrón en el formulario + parámetro en `rendir_gasto_manual` (`_efectivo_cargar_gasto_a_mano` ya acepta `p_extra.obra/proveedor`). Necesita migración.
- Bot Efectivo, defecto medio no corregido: una foto de quien tiene UNA sola entrega propia se imputa a ésa sin preguntar aunque el recibo sea de un tercero (`rendiciones.mjs`, ya estaba en main).
- Defectos de UI de Efectivo: cabecera «$ 0» al reconocer; importes con un decimal en teléfono; «Entregas» desborda a 390 px; «Devolver efectivo» visible a campo sin plata; enlace de confirmar abre fuera de sesión.
- QA por nivel y teléfono pendiente: legajo «Cuentas bancarias», «rendir por otro».
- Rojo preexistente en main: `features/auth/services/cableado-del-ingreso.test.ts` («cada puerta enlaza a la otra»).
- C7 de Impuestos sin releer.
- Tello: el adelanto de $1.250.000 quedó todo en Pisos SF (dueño 01/10, sale de lo pagado de la fila 806). Verificar si falta su respuesta sobre el descuento del pago del 11/09.
- 199 worktrees en `git worktree list`: correr `node scripts/higiene-worktrees.mjs` (los cuatro de esta sesión ya se quitaron).

## Abierto, depende del dueño
- FCL Castillo/Ochoa (qué carga Rodrigo en el portal); cuenta sueldo de Tello y CBU de Agüero.
- Roxana: factura por el otro 50 % de la cargadora ($1.000.000). ER-0023 en −$213.432,88.
- San Francisco: 67.160,60 «a cuenta» del 18/09 sin fila; `obras.monto_contratado` de Mampostería. (Cobranzas 70–73 y 106–110: el dueño las dio por buenas.)
- Rodados: sin datos de service cargados; faltan RTO y seguro de Ford XLS AG503PV y Hilux NMN898.

## Riesgos
- El worker de comunicación corre código viejo hasta su reinicio nocturno: un reintento manual de fajos tiene que encolar y correr `reintentar-fajos-comprobantes.mjs --ahora` en el mismo comando.
- No vaciar celdas del Sheet desde el OS (`no-borrar.mjs`): se reemplaza el texto.
