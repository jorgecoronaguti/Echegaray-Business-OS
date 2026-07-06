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

## feedback/ — Correcciones y preferencias
- [Construir capacidades, no pantallas aisladas](feedback/construir-capacidades-no-pantallas-aisladas.md) — cada incremento debe resolver una decisión real y ser base reutilizable; justificar toda entidad nueva o evitarla

## reference/ — Donde encontrar cosas
- [Validar SQL sin Supabase live](reference/validar-sql-sin-supabase-live.md) — procedimiento con Postgres local (Homebrew) cuando no hay Docker ni proyecto real conectado
