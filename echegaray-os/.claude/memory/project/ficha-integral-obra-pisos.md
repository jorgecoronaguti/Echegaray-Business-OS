---
name: ficha-integral-obra-pisos
description: Ciclo "centro de comando económico-productivo" -- Ficha Integral de Obra construida sobre Pisos, conectando contrato→presupuesto→plan→avance→HH→costo real→ETC/EAC→caja→riesgos→acciones en una sola pantalla, con costo real y cobranza real nuevos cargados desde Drive con evidencia y cobertura declarada.
metadata:
  type: project
---

Fecha: 2026-07-08. Jorge aprobó UX-1 a UX-5 y pidió el siguiente ciclo vertical: convertir una obra real en el primer caso completo de operación del OS, con la Ficha Integral de Obra como centro de comando, no una página que "reúna datos".

## Auditoría previa (obligatoria antes de programar)

Se inspeccionó Supabase (todas las tablas relevantes) y Drive (Flujo de Caja - Cash Flow, Sheet real, antes de esta sesión ya trackeado en `fuentes_datos`) antes de escribir código. Hallazgo crítico: **ninguna obra tenía certificados, adicionales ni compras reales cargadas** — Pisos tenía presupuesto+HH+costo de mano de obra pero cero cobranza/certificación; Galpones (cerrada) tenía costo real agregado pero cero HH/actividades; Cambio de Pisos-RRHH y Galpón 9 solo tenían movimientos de caja proyectados. Ninguna obra por sí sola cerraba el circuito completo con los datos ya cargados en Supabase — hubo que ir a buscar la evidencia real faltante de Pisos a Drive, no inventarla.

## Costo real ampliado (Sección 3 — prioridad crítica)

Se descargó y parseó localmente (Python/openpyxl, mismo método que JORNALES en el ciclo anterior) el Sheet real "Flujo de Caja - Cash Flow" > pestañas `Compras` y `02_Cobranzas`. Cliente de Pisos ("San Francisco/IMOTOR/Javier Sánchez") es **compartido con Galpones** — la columna real "Detalles / Obra" del Sheet no tagea por obra, tagea por período de pago o rubro. Se filtró por ventana temporal (jun-jul 2026, coincide con las semanas reales de HH ya cargadas de Pisos) y se excluyeron 3 líneas cuyo Proveedor era literalmente "Sueldos" (para no duplicar el costo de mano de obra ya cargado desde JORNALES). Resultado: **16 líneas reales de materiales/subcontratos/combustible/HyS, $7.056.140**, cargadas en `costos_reales` con `notas` declarando explícitamente que la atribución es **inferida** (ventana temporal + plausibilidad de concepto, no tag de obra confirmado por la fuente) — nunca presentado como confirmado.

Costo real acumulado de Pisos pasó de $3.105.500 (solo mano de obra) a **$10.161.640** (mano de obra + materiales/subcontratos).

Gasto Jan-May 2026 del mismo cliente (~$50M) **no se cargó** a ninguna obra por la misma ambigüedad — señal correcta de "no forzar asignaciones" (CLAUDE.md raíz). Cargado como backlog `gap_proceso`, no resuelto silenciosamente.

## Cobranza real (antes inexistente para Pisos)

`02_Cobranzas` (ledger real, no el pivot de RESUMEN) tiene 7 filas para el cliente de Pisos: 5 ya cobradas Dic2025-Jun2026 ($65M, atribuidas a Galpones por imposibilidad temporal — Pisos recién tuvo presupuesto aprobado el 2026-07-06) y **2 pendientes reales ($5.000.000 + $6.215.646 = $11.215.646)**, fechadas 24-25/7/2026, coincidentes con la ventana activa de Pisos. Cargadas como `movimientos_caja` (tipo cobro, estado proyectado, mismo mecanismo ya usado por Galpón 9/Cambio de Pisos-RRHH — cero tabla nueva).

## ETC/EAC recalculado con costo real ampliado

Con el costo real ya en $10.161.640 (antes solo $3.105.500), el CPI pasó de ≈6,88 (no representativo, implicaba terminar gastando ~$5,3M) a **CPI≈2,10, ETC $7.258.314, EAC $17.419.955, VAC $19.187.946** — mucho más razonable, aunque la cobertura de avance físico sigue siendo parcial (3 de 15 actividades cerradas, 20%) y se sigue declarando `inferido`, no un forecast sólido. Cero cambios en la fórmula (`produccionEconomica.ts`) — el resultado mejoró porque mejoró el dato de entrada, no el método.

## Ficha Integral de Obra (`src/features/obras/types/fichaObra.ts` + `FichaObraView.tsx`)

Compone (no recalcula) lo que ya existe: Control Económico, Producción Económica (ETC/EAC), Ejecución Financiera, HH, y — clave — el Motor de Observación completo (`construirAlertasDashboard()`, reutilizado tal cual, filtrado por `obraId`) para el bloque "Riesgos y decisiones", en vez de fabricar una segunda lógica de alertas para la ficha. `AlertaCard` (ya existente, con "Convertir en acción") se reutiliza sin cambios. Único cálculo nuevo: `margenForecast = contratado - EAC`.

Insertada en `/obras/[id]/page.tsx` arriba de todo; el resto de las 13 secciones crudas preexistentes (formularios de carga por capacidad) quedaron colapsadas detrás de `<details data-testid="obra-detalle-operativo">` — siguen existiendo (Operación/Administración las necesitan para cargar datos), pero dejaron de ser la experiencia principal.

## Autonomía nueva (Sección 9)

Las alertas de margen/HH (`mapControlEconomico`/`mapHH` en TypeScript) antes solo se veían si alguien abría el Dashboard o la Ficha. Nueva migración `20260708193000_deteccion_riesgos_economicos_obra.sql`: `detectar_deterioro_margen_obra()` y `detectar_exceso_hh_obra()` (SQL puro, mismos umbrales que TS —`UMBRAL_DESVIO_ATENCION/CRITICO`, `UMBRAL_DESVIO_HH_PORCENTAJE`— duplicados a propósito porque pg_cron no ejecuta TS), sumadas a `detectar_senales_criticas_transversales()` (mismo cron diario ya existente). Al correrla manualmente detectó **autónomamente** un desvío de margen crítico real en Galpones (23,20%, ya conocido pero nunca antes promovido a backlog sin que alguien abriera esa ficha) — primera prueba real de que el OS "trabaja por su cuenta" en el dominio económico de obra, no solo en continuidad de datos.

## Mejoras del propio OS registradas (Sección 10)

Dos hallazgos reales cargados a `backlog_autonomo` (no implementados este ciclo, por ser cambios de proceso humano o de modelo de datos, no reversibles/bajo riesgo):
- `gap_proceso`: Flujo de Caja - Cash Flow > Compras no tagea por obra cuando un cliente tiene más de una obra concurrente.
- `deuda_tecnica`: `obra_ejecucion_financiera` asume cadena certificado→facturado→cobrado; no representa clientes que cobran directo sin certificación formal (caso real de Pisos).

## Scorecard actualizado

Obras y Control Económico subieron de 5 a **6/10** ("recomienda decisiones multidisciplinarias") — justificado por el bloque Riesgos y decisiones (cruza capacidades, recomendación concreta por riesgo) + la promoción autónoma a backlog sin intervención humana. Certificación se mantuvo en 4/10, con el gap de modelo de datos documentado como bloqueante nuevo.

## Próximo paso natural

Cargar el resto de las actividades cerradas de Pisos para subir la cobertura de avance físico más allá del 20%. Resolver el tag de obra en el Sheet real (bloqueante de proceso, no técnico) para que el costo de materiales deje de ser inferido. Evaluar si `obra_ejecucion_financiera` necesita una vía alternativa para clientes sin certificación formal.
