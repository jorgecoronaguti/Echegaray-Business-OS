---
name: pr0-linea-base-echegaray
description: Estado y decisiones resueltas de PR0/PR0-A (carga de línea base al 01/07/2026) — respuestas de Jorge al checklist de extracción, qué queda abierto, y la advertencia explícita de que estos hallazgos describen la operación actual, no una especificación a preservar.
metadata:
  type: project
---

Fecha de las respuestas: 2026-07-07. PR0-A (inventario y extracción, sin cargar Supabase todavía) sigue en curso — esto es el estado de las respuestas de Jorge al checklist, no un cierre de la fase.

## Resueltas

- **Cobranzas categoría "N" en Flujo de Caja**: N = Negro, sin respaldo ni factura. **No se cargan como cobranza formal en F1** — deben quedar excluidas del cálculo de cobranzas ciertas, consistente con la regla del CLAUDE.md raíz de no institucionalizar circuito informal.
- **"Messinas"**: es **cliente**, no obra.
- **"IMOTOR" / "Javi Sánchez"**: es el **mismo cliente** (aparece con ambos nombres según la fuente).
- **Deuda "Banco" ($2.550.633)**: es **deuda financiera** (no proveedor comercial).
- **Deuda "ARCA" ($1.982.466)**: es **deuda impositiva** (no proveedor comercial).
- **SGR / carpeta "RIG SGR"**: es una gestión **en curso** con RIG para obtener una garantía de préstamos futuros — **no es deuda vigente al 01/07/2026**. No cargar como obligación en la línea base.
- **Sueldos $3.000.000 triplicado en Flujo de Caja proyectado (julio 26)**: confirmado **error** de esa planilla, no son 3 pagos reales. La fuente real de sueldos es una planilla dedicada (ver [[fuentes-drive-pr0-linea-base]]) — con la advertencia explícita de Jorge de que **`Flujo de Fondos - Cash flow` también usa datos de sueldos y no está conectado/sincronizado con esa planilla** — riesgo real de inconsistencia entre dos sistemas, sin investigar todavía.
- **Fuente de verdad de posición de caja**: `Flujo de Caja - Cash Flow`, no `CONTROL DE GASTOS.xlsx`.

## Resueltas en la segunda pasada (2026-07-07, vía descarga local + openpyxl)

Usando `download_file_content` + `openpyxl` local (método ahora validado, ver [[fuentes-drive-pr0-linea-base]] y la skill `lectura-drive-documentos-multiformato`) se pudo leer el contenido completo de los 5 archivos clave, no solo la pestaña por defecto:

- **`EJERCICIO 8.xlsx`**: confirmado por Jorge que ya no está vigente — se usan `Flujo de Caja - Cash Flow` e `Ingresos y Egresos - P&L`.
- **Fechas reales de obra**: encontradas en `Ingresos y Egresos` → pestañas `08_Control_Obra ARCOR/LA ESTRELLA/SAN FRANCISCO`. ARCOR (Cambio de Pisos RRHH) 22/06→03/07/2026; LA ESTRELLA (Galpón 9) 06/07→07/08/2026; SAN FRANCISCO (Pisos) 06/07→21/08/2026. Las tres en estado "Pausada". Sin resolver: la "Fecha Inicio" de las tres coincide sospechosamente con fechas muy cercanas a hoy — podría ser una fórmula `HOY()` no fijada, no una fecha histórica real (pendiente de confirmación de Jorge).
- **Nómina real de junio/julio**: `JORNALES` → Obreros 26 sí tiene datos hasta 04/07/2026. Semana que cierra 30/06: $9.393.250 (obreros). Pero `CONTROL DE GASTOS` → GASTOS FIJOS muestra "JORNALES OBRAS" $3.500.000 A PAGAR con vencimiento 10/07/2026 (período junio) — **conflicto sin resolver** entre ambas cifras, mismo período.
- **Vencimientos exactos de julio**: encontrados en `CONTROL DE GASTOS` → GASTOS FIJOS: Fondo de Cese/UOCRA/IERIC $2.700.000 vence 10/07/2026; Alquileres $2.000.000/mes. IIBB sigue sin fecha exacta (solo devengado mensual del P&L) — gap bloqueante que se mantiene.
- **Adicionales pendientes reales**: sí existen y tienen monto — `CONTROL DE GASTOS` → OBRAS SIN FACTURA, ítems "P/FACTURAR": Alquiler Puntales - Macro Construcciones, $38.720 y $58.080.
- **Diseño de O1 — resuelto, con matiz importante**: el archivo de avance de obra tiene **dos modelos reales conviviendo**, no uno solo. `Estrella` es checklist de materiales/tareas (como se había detectado antes). Pero `San Francisco` y `Messina` son un tracker Gantt real con % de avance diario por actividad, oficiales/ayudantes asignados y estado "Completado" — el modelo %-based sí existe y se usa, pero no en todas las obras. O1 debe soportar ambos modelos, no elegir uno solo.

## Conflictos legacy — resueltos con criterio profesional (no bloquean, ver [[no-bloquear-por-conflictos-legacy]])

Jorge corrigió el enfoque: no escalar cada conflicto, resolverlo con criterio y seguir. Aplicado:

- **Cheques a cubrir/cobrar**: se usan las tablas dinámicas (construidas sobre el detalle transaccional de 997 cheques), no las celdas de header manuales. Cheques a cubrir = $21.269.220,23; cheques a cobrar = $23.449.800. "Monto a Cobrar S/F" ($76.309.940,59) es un concepto distinto (sin factura) y no se suma.
- **Nómina**: la línea "JORNALES OBRAS" de GASTOS FIJOS mostraba el mismo $3.500.000 dos meses seguidos (mayo y junio) mientras la nómina real fluctúa cada semana — señal de valor no actualizado. Fuente de verdad = planilla `JORNALES` real (semana que cierra 30/06 = $9.393.250).
- **Fecha de inicio de obra**: San Francisco se resolvió cruzando con el tracker Gantt real (`avance_obra.xlsx` → San Francisco), que muestra tareas "Completado" desde 22/06/2026 — se cargó esa fecha, no la de la ficha de control. La Estrella y ARCOR no tienen una segunda fuente para cruzar — quedaron cargadas igual, con una `acción` de verificación pendiente en vez de bloquear la carga.
- **Adicionales pendientes**: se usan los 2 ítems `P/FACTURAR` reales encontrados (Alquiler Puntales, $38.720 y $58.080) como línea base, marcados como posiblemente no exhaustivos.

## PR0-B ejecutado (2026-07-07) — carga real en Supabase

Cargado (ver script de auditoría [[pr0-b-carga-ejecutada]]): 4 clientes, 6 proveedores, 2 cuentas_financieras (Banco $3.473.742,75 / Caja $2.739.600), 3 obras (ARCOR/La Estrella/San Francisco, total contratado $106.727.980,49), 10 obligaciones (total $37.706.775,50 — coincide exacto con el total de deudas de RESUMEN + Fondo de Cese + Alquileres), 2 acciones de verificación de fecha.

**Gap de esquema real descubierto, no fabricado**: `movimientos_caja_contraparte_check` exige `obra_id` NOT NULL en todo `tipo='cobro'` y `proveedor_id` NOT NULL en todo `tipo='pago'`. Esto bloqueó cargar: (1) los adicionales P/FACTURAR (ingreso por alquiler de equipos a un tercero, no ligado a ninguna obra de construcción), (2) la nómina real ($9.393.250, semana 30/06) como movimiento de caja (no existe un "proveedor" que represente personal/nómina). **F1 necesita nómina como componente de la proyección** — este gap debe resolverse (¿modelar "Personal" como proveedor especial? ¿tabla propia?) antes de que F1 pueda proyectar nómina con datos reales en vez de solo el devengado del P&L.

## Advertencia explícita del usuario — no confundir descripción con prescripción

Jorge fue explícito: **"todas estas responden a la actualidad, no significan que quiero conservar que se hagan las cosas de esta manera."** Estas respuestas sirven para calibrar la extracción de línea base y el diseño de O1/F1 contra la realidad operativa actual — no son una aprobación de que el OS deba replicar el proceso informal existente (ej. el circuito de cobros "N", o un control de avance basado en checklist en vez de %). Cualquier diseño futuro debe seguir evaluándose contra el objetivo estratégico del CLAUDE.md raíz, no contra "cómo se hace hoy".

## Por qué recordar esto

Jorge lo marcó explícitamente: **"vas a tener que mejorarlo"** — espera que esta línea base y el proceso subyacente se sigan refinando, no que se traten como definitivos. Antes de retomar PR0-A, releer este archivo y [[fuentes-drive-pr0-linea-base]] en vez de re-preguntar lo ya resuelto.
