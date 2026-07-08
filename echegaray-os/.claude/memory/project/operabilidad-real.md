---
name: operabilidad-real
description: Ciclo "primera versión operativa del Business OS" -- readiness real por capacidad, ritual diario/semanal, Centro de Acción con bloqueo/evidencia, cola de clasificación de costo por obra, cobranzas/pagos convertidos en trabajo autónomo, Operador Digital en 7 bloques.
metadata:
  type: project
---

Fecha: 2026-07-09. Jorge aprobó el ciclo de Pisos y pidió pasar de "tiene capacidades" a "la empresa puede empezar a trabajar con él" -- operabilidad real, no otro ciclo de investigación/arquitectura.

## Principio aplicado

No se construyó ningún dominio nuevo. Todo lo hecho este ciclo conecta o expone capacidades que ya existían (Control Económico, HH, Ejecución Financiera, Motor de Observación, posición de caja 8 semanas ya existente) en forma de trabajo real, con dos excepciones genuinamente nuevas: la cola de clasificación de costo por obra (`clasificaciones_costo_obra`) y el campo de bloqueo/evidencia en `acciones`.

## Cola de clasificación de costo por obra (Sección 10)

Nace del gap real encontrado en el ciclo de Pisos: un cliente con más de una obra concurrente genera gasto que la fuente de origen no tagea por obra. Regla (`sugerirObraParaGasto`, `src/features/clasificacion-costos/types/index.ts`):
1. Cliente con una sola obra → sugerencia `calculado`.
2. Aprendizaje: mismo proveedor ya confirmado antes para la misma obra → `calculado`.
3. Ventana de fechas declaradas (`fecha_inicio`/`fecha_fin_objetivo` ± 30 días) con una sola obra candidata → `estimado`.
4. Ninguna o más de una candidata → sin sugerencia (`sin_dato`), pide elegir manualmente.

Sembrada con 40 gastos reales agregados (proveedor × mes, Flujo de Caja - Cash Flow > Compras, Jan-May 2026, cliente San Francisco, $24.076.175 total, excluyendo líneas "Sueldos" para no duplicar mano de obra ya cargada) -- 19 con sugerencia real, 21 sin sugerencia (la regla correctamente NO fuerza una elección para Galpones-cerrada/Pisos-sin-empezar-todavía en marzo-abril 2026, el hueco real entre ambas obras). UI en `/administracion` (`ColaClasificacionCostos`): confirmar materializa un `costos_reales` real vinculado; "no corresponde a ninguna obra" descarta sin fabricar nada.

**Hallazgo real durante el testing:** una tabla nueva con RLS `using (true)` sigue devolviendo "permission denied" sin el `GRANT` explícito a `authenticated` -- Supabase revoca privilegios por defecto. Ver [[rls-sin-policy-falla-en-silencio]] (ahora documenta también este caso).

## Centro de Acción — bloqueo y evidencia (Sección 4)

`acciones.bloqueada`/`motivo_bloqueo`/`evidencia` (no un estado nuevo -- una acción bloqueada sigue pendiente/en_curso). Nuevo badge "Sin responsable" y "⛔ Bloqueada" en `AccionesList`. El flujo completo observación→decisión→acción→responsable→fecha→estado→bloqueo→seguimiento→escalamiento→cierre→resultado ya existía casi entero (severidad escalada por antigüedad, `VistaDireccion` con 5 buckets) -- solo faltaban bloqueo y evidencia.

## Cobranzas y pagos como trabajo (Sección 11)

Dos rutinas SQL nuevas (`detectar_cobranza_vencida`, `detectar_pago_critico`), sumadas a `detectar_senales_criticas_transversales()` (mismo cron diario). Materialidad: $500.000 mínimo, para no generar ruido. Al correrlas detectaron de inmediato 3 casos reales: un echeq vencido de $15M (Cambio de Pisos-RRHH), un pago crítico de alquileres de junio y uno de cargas sociales UOCRA/IERIC -- ninguno visible antes salvo que alguien abriera Caja u Obligaciones.

## Deterioro de margen y exceso de HH por obra (extensión de rutinas ya iniciadas en el ciclo de Pisos)

`detectar_deterioro_margen_obra()`/`detectar_exceso_hh_obra()` (mismos umbrales que TypeScript, duplicados a propósito porque pg_cron no ejecuta TS) detectaron autónomamente el margen crítico real de Galpones (23,20%) sin que nadie abriera su ficha -- usado como caso real del recorrido de aceptación (Sección 15): se convirtió en una Acción real desde la Ficha de Galpones, quedó en el bucket "Decidir hoy" del Centro de Acción con badge "Sin responsable" -- **se dejó así a propósito, es una acción real y útil, no un fixture de test**.

## Rituales (Secciones 3, 6, 7, 8)

- **Diario** (home `/dashboard`): nueva sección "Qué cambió (últimas 24 horas)" -- aproximación honesta por ventana de tiempo (no existe todavía un "última revisión" por usuario), declarada explícitamente como tal. "Acciones" se expandió a "Trabajo" con Vencidas/Próximas/Sin responsable/Bloqueadas. Tabla de Obras ahora incluye HH y pendiente de cobrar por obra, más el principal riesgo.
- **Semanal de Obras** (`/operacion`): nueva sección "Síntesis semanal por obra" -- por cada obra activa/pausada/contratada, avance/HH/costo/pendiente de cobrar/restricciones/riesgos/acciones en un solo bloque, reutilizando el mismo tablero y el mismo Motor de Observación filtrado por obra.
- **Semanal de Dirección** (`/sintesis-semanal`, página nueva): caja 8 semanas (ya existía en F1, `CANTIDAD_SEMANAS_FORECAST=8`, nunca se mostraba completo), capital de trabajo y concentración, estado de obras, principales riesgos/decisiones, acciones, qué hizo el OS. Declara explícitamente dos gaps reales sin fabricarlos: P&L propio (no existe como capacidad, se remite al Sheet real mientras tanto) y versionado de margen semana a semana (no existe, no se inventa un "cambio" sin historial real).

## Operador Digital — 7 bloques (Sección 12)

Reestructurado de 5 secciones a los 7 bloques pedidos (Observando/Detectado/Investigando/Recomendando/Trabajo creado/Bloqueado/Mejorando el OS), mismo dato subyacente. "Detectado" usa la misma ventana de 24hs que la home. "Bloqueado" cruza acciones bloqueadas + backlog sin confianza + clasificaciones de costo sin sugerencia -- primera vez que "lo que el OS no puede resolver solo" queda visible en un solo lugar.

## Responsables y roles (Sección 5)

Solo existe **una** cuenta real (`perfiles`, rol `direccion`, la cuenta de prueba de Jorge). El modelo de roles (`direccion`/`administracion`/`jefe_obra`) ya está preparado y no requiere cambios para 2 Dirección + 2 Gestión/Obras + Administración. `responsable` en `acciones` sigue siendo texto libre a propósito: no hay cuentas institucionales todavía para forzar un FK a `auth.users`. **No se fabricó ningún usuario ni email** -- gap real, requiere que Jorge cree las cuentas institucionales.

## Frescura de datos críticos (Sección 9, hallazgo honesto)

Ninguna fuente crítica (Flujo de Caja, JORNALES, Control de Gastos) tiene un pipeline automático real -- `mecanismo_integracion` como "lectura_periodica"/"extraccion_documental" en `fuentes_datos` describe la cadencia esperada, no un cron corriendo solo: hoy depende de que alguien (Claude Code, en sesión) lea Drive y cargue Supabase. La única automatización real y verificada corriendo sola es `recalcular_frescura_fuentes_diario` y `detectar_senales_criticas_diario` (pg_cron, dentro de Supabase). Esto es un gap estructural de continuidad, no se resuelve en este ciclo (requeriría una integración real Drive→Supabase fuera del alcance de "no reescritura tecnológica" de la Sección 14).

## Próximo paso natural

Resolver el tag de obra en el Sheet real de Compras (bloqueante de proceso para que la cola de clasificación deje de necesitar sugerencia manual en la mayoría de los casos). Confirmar con Jorge las cuentas institucionales reales para reemplazar la cuenta de prueba única. Evaluar una integración real (no manual) para Flujo de Caja/JORNALES si el volumen de carga lo justifica.
