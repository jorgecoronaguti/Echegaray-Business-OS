---
name: prp-011-dashboard-direccion
description: Capacidad 11 — Dashboard de Dirección, 100% síntesis TypeScript sobre las alertas ya calculadas por cada capacidad (sin SQL nuevo, sin tabla de alertas), variantes "todas las obras" agregadas a los servicios existentes
metadata:
  type: project
---

# PRP-011 — Dashboard de Dirección

Fecha: 2026-07-07

## Estado

**Capacidad 11 (Dashboard de Dirección): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-011-dashboard-direccion.md` para el análisis de arquitectura completo.

## Qué se construyó

Página `/dashboard` (reemplazó el stub original) que cruza [[prp-005-control-economico-basico-obra]], [[prp-006-gestion-integral-adicionales]], [[prp-007-ejecucion-financiera-obra]], [[prp-008-hh-productividad-obra]], [[prp-009-compras-abastecimiento-obra]] y [[prp-010-obligaciones-medios-pago]]. Cero tablas, cero vistas SQL nuevas.

## Decisión de arquitectura más importante

Cada capacidad anterior ya calculaba sus propias alertas como función TypeScript pura sobre su propia vista (`calcularAlertasAdicional`, `calcularAlertasCompra`, `calcularAlertasObligacion`, etc.) — confirmado al revisar las 10 capacidades previas antes de escribir código. El Dashboard **reutiliza esas funciones tal cual** en vez de reimplementar la lógica en SQL o duplicarla — se agregaron solo variantes `getXTodasLasObras()` (mismo query existente, sin el filtro `.eq('obra_id', ...)`) a los servicios de control-económico, adicionales, ejecución-financiera, HH y compras. `obligaciones` ya tenía esas variantes desde PRP-010.

Se normalizó todo a un tipo único `AlertaDashboard` (título, severidad, obra, contraparte, monto, fecha crítica, causa, decisión sugerida, link) mediante `construirAlertasDashboard()` en `features/dashboard/types/index.ts`, con tablas explícitas de severidad/decisión por tipo de alerta (sin fabricar umbrales nuevos, reutilizando los que cada capacidad ya declaró como propuesta abierta).

**Alerta nueva de esta capacidad**: "obra activa sin movimiento reciente relevante" (más amplia que la de HH — cruza adicionales/certificados/compras/HH), usando los mismos arreglos ya cargados, sin queries nuevas.

## Verificación

Sin migraciones (no hay esquema nuevo). Verificado con datos reales que abarcan 3 capacidades sobre la misma obra (adicional sin cotizar, compra retrasada, obligación vencida) — las tablas/vistas subyacentes responden correctamente en conjunto. `tsc`/`build`/`lint`/23 tests de Playwright en verde.

## Próxima capacidad sugerida

Según la secuencia acordada: **12. Post Mortem** es la siguiente etapa (Compras→Obligaciones→Dashboard→Post Mortem→adaptación de la empresa actual). El Dashboard ya deja construido el catálogo completo de "qué salió mal y dónde" por obra — el Post Mortem debería consumir el historial acumulado de cada capacidad (desvíos de Control Económico, adicionales perdidos, HH fuera de estimado, compras retrasadas, obligaciones mal gestionadas) como insumo de aprendizaje para la próxima cotización.
