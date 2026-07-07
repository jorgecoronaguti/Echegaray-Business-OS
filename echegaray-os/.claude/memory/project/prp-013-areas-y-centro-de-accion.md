---
name: prp-013-areas-y-centro-de-accion
description: Fase II — arquitectura operativa por 6 áreas + tabla acciones (Centro de Acción), sin duplicar ninguna alerta ni cálculo de las 12 capacidades anteriores; abre la fase posterior a las capacidades del negocio (Etapa 4)
metadata:
  type: project
---

# PRP-013 — Arquitectura Operativa por Áreas + Centro de Acción

Fecha: 2026-07-07

## Estado

**Fase II, primera versión usable: CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-013-areas-y-centro-de-accion.md` para el detalle completo. Esta fase abre después de que [[prp-012-post-mortem-obra]] cerró la Etapa 4 (capacidades del negocio).

## Qué se construyó

**6 áreas de gestión** (Dirección, Obras/Producción, Administración y Finanzas, Compras y Abastecimiento, Personas y Productividad, Comercial/Presupuestación), cada una mapeada 1:1 a capacidades ya existentes — ninguna requirió tabla o vista nueva. Navegación real agregada en `(main)/layout.tsx` (antes era un comentario vacío).

**Centro de Acción**: una tabla nueva y mínima, `acciones`, para dar seguimiento de estado/responsable/resolución a las alertas ya calculadas por [[prp-011-dashboard-direccion]] — algo que ningún dato derivado puede sostener por sí solo (una alerta recalculada no "recuerda" una decisión tomada sobre ella).

## Decisión de arquitectura más importante

**No duplicar el cálculo de la alerta, sí copiar su contenido una vez al convertirla en acción** — mismo patrón de snapshot congelado que [[prp-012-post-mortem-obra]]. El `id` estable de `AlertaDashboard` (ya existía desde PRP-011) se usa como `alerta_origen_id` solo para trazabilidad y deduplicación (índice único parcial). La lógica que decide si algo es una alerta sigue viviendo exclusivamente en cada capacidad de origen.

**Áreas futuras** (Seguridad/Higiene/ART, Calidad, Contratos, Equipos, Subcontratistas, Fiscal) quedaron **solo documentadas en el PRP**, sin ningún ítem de navegación ni placeholder — un menú sin capacidad real detrás es exactamente el "menú vacío" que esta fase prohibía construir.

**Límite documentado**: `responsable` es texto libre, no FK — no existe tabla de usuarios/roles internos todavía (`add-login` sigue latente desde PRP-001).

## Verificación

Dedupe de alerta convertida dos veces rechazado por índice único; `CHECK` de resolución exige `fecha_resolucion` en resuelta/descartada; `CHECK` obliga `alerta_origen_id` en acciones de origen sistema; RLS/GRANT verificado. `tsc`/`build`/`lint`/30 tests de Playwright en verde (24 previos + 6 nuevos).

## Próximo paso sugerido

Con el Centro de Acción operativo, el siguiente incremento natural de esta fase es decidir qué alertas de alto impacto deberían generar una acción automáticamente al aparecer (hoy la conversión es siempre manual, un clic del usuario) — evaluar esto solo después de observar uso real, no antes.
