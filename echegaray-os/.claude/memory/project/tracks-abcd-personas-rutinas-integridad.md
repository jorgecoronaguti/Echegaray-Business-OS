---
name: tracks-abcd-personas-rutinas-integridad
description: Marco definitivo de producto (Tracks A-D permanentes) aprobado 2026-07-08 + primer ciclo bajo ese marco: Línea A (Personas/Laboral/Seguridad e Higiene desde ALTAS-BAJAS-HM-EPP-DNI), Línea B (primera rutina de negocio autónoma real, detección de acciones vencidas y fuentes críticas), Línea C (auditoría e integridad de datos de test).
metadata:
  type: project
---

Fecha: 2026-07-08. Jorge aprobó el ciclo de continuidad real de fuentes (pg_cron) pero marcó que faltaba, y fijó un marco permanente de 4 tracks paralelos (A cobertura, B confiabilidad, C autonomía, D experiencia organizacional) que reemplaza definitivamente cualquier framing de "elegir un dominio". Ver [[programa-ejecucion-continua]] y [[continuidad-operacional-datos]] para el historial previo -- este archivo documenta el primer ciclo bajo el marco nuevo, no repite el marco completo (es extenso, vive en el mensaje original del usuario).

## Línea A — Personas / Laboral / Seguridad e Higiene

Descubierta y explorada en profundidad la carpeta Drive "ALTAS - BAJAS - HM - EPP - DNI" (antes solo catalogada como fuente, sin relevar). Estructura real: 30 subcarpetas, una por trabajador (activo o histórico), cada una con documentación variable.

**Tablas nuevas**: `personas` (identidad + relación laboral -- evidencia real confirma 1 persona = 1 legajo en esta empresa, no se separan sin evidencia) + `documentacion_legajo` (checklist real de qué documento existe por persona, concepto distinto de "quién es esta persona"). Asistencia/HH/costo laboral NO se duplican -- siguen en `registros_hh`/JORNALES.

**30 legajos reales cargados** (nombre real de carpeta, sin inventar el resto): 3 relevados en profundidad leyendo su documentación real:
- **GONZALEZ EMILIANO** (DNI 50.945.547, categoría 6E60, AYUDANTE/MONTADOR ESTR.METALI, ingreso 2026-04-20, obra San Francisco/Pisos) -- solo se encontró el alta; **Fondo de Cese, DNI escaneado y EPP faltantes reales**.
- **ALANIZ EMANUEL ARIEL** (DNI 38.218.815, categoría 004212, AYUDANTE/ALBAÑIL, convenio UOCRA 0076/75, ART Prevención, retribución $3910/hora) -- alta + Fondo de Cese + probable DNI escaneado; **EPP faltante**.
- **SOSA NESTOR RAUL** (DNI 33.836.450, categoría 1591, OFICIAL/SOLDADOR, ART Prevención) -- alta + Fondo de Cese; **DNI escaneado y EPP faltantes**. Incluye un **hallazgo real de riesgo**: multa IERIC de $41.880 pagada 2026-06-02 por "presentación fuera de término", junto con JOFRE (mismo pago) -- cargado en `backlog_autonomo` como patrón de riesgo de cumplimiento laboral, no un juicio legal categórico.

**Página**: sección "Legajos" agregada a `/personas` (ya existía como área de Productividad/HH -- se extendió, no se creó una pantalla paralela). Muestra activos/total, documentación relevada vs. no, y documentos faltantes por persona.

**Confirmado con evidencia real, no supuesto**: ningún legajo leído tiene entrega de EPP registrada -- consistente con `PLANILLA DE EPP.xlsx` ya marcada `fuente_no_disponible` en `fuentes_datos`. El gap de Seguridad e Higiene no es de ingesta, es que el dato de origen no existe verificado en ningún lado todavía.

**Scorecard**: Personas 1→2, Laboral 1→2, Seguridad e Higiene 0→1 (evidencia real de que el dato no existe, no un salto a "estructurado").

## Línea B — Primera rutina de negocio autónoma real

Antes de esta ola, `pg_cron` solo mantenía frescura de `fuentes_datos` (continuidad de datos, no negocio). Ahora existe la primera rutina que llega hasta OBSERVACIÓN → BACKLOG real sin abrir ninguna página:

- **`detectar_acciones_vencidas()`**: `acciones` con `fecha_limite` pasada y `estado` pendiente/en_curso → backlog real.
- **`detectar_fuentes_criticas_atrasadas()`**: `fuentes_datos` criticidad alta + atrasado/error → backlog real. Ya generó 2 ítems reales (IVA 2026, TELEGRAMAS).
- **`detectar_senales_criticas_transversales()`**: agenda ambas, `pg_cron` diario 11:10 UTC (10 min después del recálculo de frescura).
- **Idempotencia real**: `backlog_autonomo.origen_tabla`/`origen_id` (mismo patrón polimórfico que `acciones.alerta_origen_id`) evita duplicar el mismo hallazgo en corridas sucesivas -- verificado corriendo la función dos veces seguidas.
- **Por qué no caja/HH todavía**: esa lógica vive en TypeScript (forecast, no comparación simple) -- portarla a SQL duplicaría reglas de negocio en dos lugares. Registrado como ítem de backlog explícito: esperar hosting (pg_net → misma API route TS, cero duplicación) vs. duplicar a SQL ahora (no recomendado).

## Línea C — Integridad de datos de test (hallazgo grave, corregido)

La auditoría pedida por Jorge encontró contaminación real, no solo el caso ya conocido:
- 7 filas de basura acumuladas en `actividades_semanales` de la obra real Pisos (sin limpieza automática en corridas anteriores de `auth-roles.spec.ts`).
- 2 movimientos de caja reales falsos en `movimientos_caja` (mismo test, rama de denegación que ya no denegaba).
- **El más serio**: `backlog-autonomo-conversion.spec.ts` operaba sobre "la primera fila real" de `backlog_autonomo` -- convirtió **3 ítems reales de backlog en 3 `acciones` reales** como efecto secundario de correr la suite, no como decisión deliberada.

Todo limpiado (filas borradas, verificado con conteos en 0). Corregido estructuralmente: `backlog-autonomo-conversion.spec.ts` ahora crea su propio fixture sintético y lo borra en el mismo test (nunca opera sobre datos reales); `auth-roles.spec.ts` limpia su propio insert real al final. Regla nueva documentada en [[tests-autenticados-deben-autolimpiarse]] (memoria de tipo feedback).

## Próximo paso natural

Seguir relevando los 27 legajos restantes de Personas (mismo mecanismo). Decidir si duplicar lógica de caja a SQL o esperar hosting para Línea B. Comercial sigue esperando la palabra de Jorge -- no se toca todavía, por instrucción explícita.
