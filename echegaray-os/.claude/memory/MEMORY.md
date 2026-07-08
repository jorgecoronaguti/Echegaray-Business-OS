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
- [Arquitectura de Fuentes de Información](project/arquitectura-fuentes-informacion.md) — principio permanente aprobado: Drive/Supabase/OS/skills/Internet, jerarquía de verdad por dato, gaps confirmados (Libro de Sueldos, IVA neto, adicionales sin obra)
- [PR1-B — CF_COB y Cheques](project/pr1-b-cf-cob-cheques.md) — lectura completa (49+848 filas reales), clasificación A-E, cuotas de echeq reales vs. duplicados, carga con trazabilidad
- [PRP-015 Capital de Trabajo (F2)](project/prp-015-capital-trabajo-f2.md) — elegido sobre O1 por concentración real de cliente/proveedor detectada en PR1-B; primer incremento, exposición por obra queda pendiente
- [O1-A Obra Piloto y Base Operacional](project/o1-a-obra-piloto-base-operacional.md) — Galpones (cadena retrospectiva real) + Pisos (presupuesto para ciclo hacia adelante); pausado antes de O1-B por requerir tabla nueva
- [PR5 Login y Roles](project/pr5-login-roles.md) — Supabase Auth real + perfiles/roles + RLS diferenciada, auditoría con get_advisors, pruebas autenticadas reales (lectura/escritura permitida/denegada por rol)
- [Scorecard de Madurez (SUPERSEDED)](project/scorecard-madurez.md) — snapshot histórico 0-5; reemplazado por la tabla real `scorecard_dominios` (0-10) y `/scorecard`
- [Arquitectura de Cobertura Integral](project/arquitectura-cobertura-integral.md) — escala 0-10 (11 niveles) + 22 dominios críticos, baseline permanente aprobado
- [Programa de Ejecución Continua](project/programa-ejecucion-continua.md) — Track A + Track B en paralelo por olas; OLA 0/1/2 completadas (backup/PITR, HH real Pisos, scorecard vivo, catálogo de preguntas, Motor de Confianza/Observación, Backlog Autónomo, Motor de Decisiones, Rutinas on-demand)
- [Continuidad Operacional de Datos](project/continuidad-operacional-datos.md) — descubrimiento exhaustivo de Drive (23 fuentes reales), `fuentes_datos` con frescura/cobertura conectado al Motor de Decisiones, primer dato real de Equipos y Vehículos y Fiscal
- [Tracks A-D: Personas, Rutinas, Integridad](project/tracks-abcd-personas-rutinas-integridad.md) — marco permanente de 4 tracks paralelos; primer ciclo: 30 legajos reales (Personas/Laboral/Seguridad e Higiene), primera rutina de negocio autónoma real (pg_cron), auditoría de integridad de datos de test
- [Obra Piloto Pisos: Verdad Financiera](project/obra-piloto-pisos-verdad-financiera.md) — costo real de mano de obra vinculado a HH (JORNALES), forecast ETC/EAC/VAC/CPI con cobertura declarada, auditoría honesta de F1
- [Corrección de Producto UX-1 a 5](project/correccion-producto-ux-1-a-5.md) — navegación por trabajo real (8 grupos), home de Dirección accionable, tablero de Obras, alertas humanizadas, Operador Digital consolidado, badges de confianza
- [Ficha Integral de Obra — Pisos](project/ficha-integral-obra-pisos.md) — circuito completo contrato→caja en una sola ficha, costo real de materiales y cobranza real cargados desde Drive con cobertura declarada, detección autónoma de deterioro de margen/exceso HH por obra
- [Operabilidad Real](project/operabilidad-real.md) — cola de clasificación de costo por obra, bloqueo/evidencia en Acciones, cobranzas/pagos como trabajo autónomo, rituales diario/semanal, Operador Digital en 7 bloques, solo 1 cuenta real existente

## feedback/ — Correcciones y preferencias
- [Construir capacidades, no pantallas aisladas](feedback/construir-capacidades-no-pantallas-aisladas.md) — cada incremento debe resolver una decisión real y ser base reutilizable; justificar toda entidad nueva o evitarla
- [No bloquear por conflictos legacy](feedback/no-bloquear-por-conflictos-legacy.md) — ante datos legacy inconsistentes, proponer resolución con criterio y seguir; escalar solo lo genuinamente irreducible, sin frenar todo el flujo
- [Tests autenticados deben autolimpiarse](feedback/tests-autenticados-deben-autolimpiarse.md) — nunca operar sobre "la fila real que aparezca primero"; crear fixture propio y borrarlo en el mismo test
- [RLS sin policy falla en silencio](feedback/rls-sin-policy-falla-en-silencio.md) — un DELETE/UPDATE sin policy no da error, afecta 0 filas; verificar pg_policy antes de asumir un bug de lógica

## reference/ — Donde encontrar cosas
- [Validar SQL sin Supabase live](reference/validar-sql-sin-supabase-live.md) — procedimiento con Postgres local (Homebrew) cuando no hay Docker ni proyecto real conectado
- [Fuentes Drive PR0 Línea Base](reference/fuentes-drive-pr0-linea-base.md) — URLs/gid exactos confirmados por Jorge para nómina, fechas de obra, caja, vencimientos, adicionales, avance de obra
