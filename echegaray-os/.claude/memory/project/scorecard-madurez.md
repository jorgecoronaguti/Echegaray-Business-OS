---
name: scorecard-madurez
description: Scorecard de madurez del Business OS, baseline de la auditoría de cobertura integral, actualizado solo en las dimensiones realmente afectadas después de cada incremento (O1-B/C/D, Centro de Acción 2.0, Login+Roles).
metadata:
  type: project
---

Escala 0-5: 0 inexistente · 1 documental/disperso · 2 dato estructurado parcial · 3 visibilidad · 4 diagnóstico y recomendación · 5 ciclo cerrado (detección→decisión→acción→seguimiento→aprendizaje).

## Baseline (auditoría de cobertura integral, 2026-07-08)

| Dimensión | Nivel |
|---|---|
| Financiero | 4 |
| Obra | 2 |
| Dirección | 3 |
| Comercial | 1 |
| Administrativo | 2 |
| Contable/Fiscal | 1 |
| Legal/Contractual | 0 |
| Personas | 1 |
| Seguridad | 0 |
| Compras | 1 |
| Datos | 4 |
| Software | 3 |

## Actualización tras O1-B→O1-C→O1-D→Centro de Acción 2.0→Login (2026-07-08)

| Dimensión | Nivel nuevo | Evidencia | Bloqueante para el próximo nivel |
|---|---|---|---|
| **Obra** | 2 → **4** | Ciclo semanal real (2 semanas cerradas con desvío real detectado: 75%/75%/25% vs. 100% objetivo, Pisos), conexión físico-económica (`ResumenProduccionEconomica`, con trazabilidad observado/calculado/estimado) y advertencias operación→finanzas (`AdvertenciaOperacionFinanciera`) construidas y probadas con datos reales | Falta medir si una recomendación generada realmente cambió un resultado (nivel 5 = ciclo cerrado con seguimiento) |
| **Dirección** | 3 → **4** | Vista de Dirección (Decidir hoy / Riesgo abierto / Acciones vencidas / Seguimiento / Aprendizaje pendiente) + escalamiento automático de severidad por días de atraso | Falta que el pipeline comercial y la exposición por obra alimenten esta vista (siguen en 0-1) |
| **Software** | 3 → **4** | Login real + roles + RLS diferenciada por rol, auditada con `get_advisors` (encontró y corrigió un hallazgo real), probada con pruebas autenticadas reales (no solo "sin sesión no crashea") | Backup/recuperación real sigue sin validar (crítico, no bajó de prioridad); 10 tablas sin RLS diferenciada por rol; jefe_obra no está acotado a su propia obra |

## Sin cambios en este ciclo (fuera del alcance de O1-B/C/D/Centro de Acción/Login)

Financiero (4), Comercial (1), Administrativo (2), Contable/Fiscal (1), Legal/Contractual (0), Personas (1), Seguridad (0), Compras (1), Datos (4) — sin evidencia nueva, se mantienen en el nivel de la auditoría original hasta que se trabaje explícitamente sobre esos dominios (roadmap: Pipeline Comercial, Compras, Personas, Seguridad, Legal, Contable/Fiscal, evaluados por impacto/dependencia después de este ciclo, según lo acordado).
