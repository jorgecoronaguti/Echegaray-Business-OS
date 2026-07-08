# Memoria del Proyecto — Indice

> Archivos organizados por carpeta (tipo). Max 200 lineas.
> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.

## user/ — Sobre el usuario/equipo
(vacio)

## project/ — Proyectos y decisiones activas
- [PRP-001 Fundación + Flujo de Caja](project/prp-001-fundacion-flujo-caja.md) — estado, decisiones de RLS, bloqueante de Supabase live, próximo incremento
- [PRP-002 Obra como Unidad Económica](project/prp-002-obra-unidad-economica.md) — extensión de `obras` (no tabla nueva), refactor a `features/obras/`, entidades descartadas y por qué
- [PRP-003 Presupuesto Base de Obra](project/prp-003-presupuesto-base-obra.md) — `presupuestos`/`partidas_presupuesto`, versionado (único aprobado por obra), verificación puntual de costo directo/indirecto/margen en Planilla para Cotizar
- [PRP-004 Costos Reales de Obra](project/prp-004-costos-reales-obra.md) — `costos_reales` (comprometido/pendiente/pagado), vínculo opcional a `movimientos_caja` validado por trigger, verificación puntual de CONTROL DE GASTOS.xlsx
- [PRP-005 Control Económico Básico de Obra](project/prp-005-control-economico-basico-obra.md) — vista `obra_resumen_economico` (presupuesto aprobado vs costo real), `security_invoker` obligatorio, umbrales sano/atención/crítico abiertos
- [PRP-006 Gestión Integral de Adicionales](project/prp-006-gestion-integral-adicionales.md) — `adicionales` con fecha/monto por etapa (no enum lineal, permite detectar secuencias fuera de orden), alertas en TypeScript puro
- [PRP-007 Ejecución Financiera de la Obra](project/prp-007-ejecucion-financiera-obra.md) — `certificados` (contrato base, no se mezcla con adicionales) + vista `obra_ejecucion_financiera` (contratado/certificado/facturado/cobrado)
- [PRP-008 HH y Productividad de Obra](project/prp-008-hh-productividad-obra.md) — `registros_hh` semanal (texto libre, sin legajo/cuadrilla/tarea), `hh_estimada` en `presupuestos`, HH y costo de mano de obra deliberadamente separados
- [PRP-009 Compras y Abastecimiento de Obra](project/prp-009-compras-abastecimiento-obra.md) — `compras` (obra/proveedor nullable para poder alertar), FK invertida (`costos_reales.compra_id`, `movimientos_caja.compra_id`) para soportar N costos y N pagos por compra
- [PRP-010 Obligaciones y Medios de Pago](project/prp-010-obligaciones-medios-pago.md) — `obligaciones` (sirve como cuota/vencimiento), `aplicaciones_pago` (única relación N:M real, trigger anti-sobreaplicación), `medio_pago` en `movimientos_caja` (sin tabla instrumentos_pago)
- [PRP-011 Dashboard de Dirección](project/prp-011-dashboard-direccion.md) — 100% síntesis TypeScript reutilizando las alertas ya calculadas por cada capacidad, sin SQL nuevo ni tabla de alertas
- [PRP-012 Post Mortem de Obra](project/prp-012-post-mortem-obra.md) — `post_mortems` (borrador/cerrado, snapshot jsonb solo al cerrar), reutiliza todo lo existente sin duplicar; cierra la Etapa 4 del roadmap
- [PRP-013 Áreas y Centro de Acción](project/prp-013-areas-y-centro-de-accion.md) — 6 áreas mapeadas a capacidades existentes + tabla `acciones` (seguimiento de estado/responsable, no duplica alertas); Fase II
- [Arquitectura de Conocimiento Experto](project/arquitectura-conocimiento-experto.md) — 15 skills expertas (13 de dominio + 2 técnicas: integraciones, lectura de Drive/multiformato) + matriz multidisciplinaria en CLAUDE.md raíz; usar en toda decisión real de la empresa, no solo al construir features
- [PR0 Línea Base Echegaray](project/pr0-linea-base-echegaray.md) — respuestas resueltas del checklist PR0-A (N=negro, Messinas=cliente, SGR no vigente, etc.), qué queda abierto, advertencia de no confundir "cómo se hace hoy" con especificación futura
- [PRP-014 Posición de Caja Consolidada (F1)](project/prp-014-posicion-caja-consolidada-f1.md) — forecast semanal/mensual, reemplaza cálculo duplicado del Dashboard, saldo actual real da negativo (cobertura parcial declarada)

## feedback/ — Correcciones y preferencias
- [Construir capacidades, no pantallas aisladas](feedback/construir-capacidades-no-pantallas-aisladas.md) — cada incremento debe resolver una decisión real y ser base reutilizable; justificar toda entidad nueva o evitarla
- [No bloquear por conflictos legacy](feedback/no-bloquear-por-conflictos-legacy.md) — ante datos legacy inconsistentes, proponer resolución con criterio y seguir; escalar solo lo genuinamente irreducible, sin frenar todo el flujo

## reference/ — Donde encontrar cosas
- [Validar SQL sin Supabase live](reference/validar-sql-sin-supabase-live.md) — procedimiento con Postgres local (Homebrew) cuando no hay Docker ni proyecto real conectado
- [Fuentes Drive PR0 Línea Base](reference/fuentes-drive-pr0-linea-base.md) — URLs/gid exactos confirmados por Jorge para nómina, fechas de obra, caja, vencimientos, adicionales, avance de obra
