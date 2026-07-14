---
name: matriz-completa-proyecto
description: Matriz completa del Business OS verificada en vivo (2026-07-14) — 8 etapas (5 cerradas/3 pendientes), 22 dominios con nivel real 0-10, 16 agentes IA/11 especialistas, 34 skills, huecos de cobertura y lógica de ejecución. Fuente de verdad del ESTADO para trackear avance de Etapas 5-6-7.
metadata:
  type: project
---

Fecha: 2026-07-14. Armada tras una auditoría que cruzó las DOS líneas paralelas del proyecto que nadie había reconciliado: la app de dominio (Track A/B, `public.*`, scorecard 0-10, PRPs 001-015) y el Work Fabric (`orq.*`, Director + especialistas vía Anthropic API, Etapas 0-4). Ver [[programa-ejecucion-continua]] y [[arquitectura-cobertura-integral]]. Verificado contra DB de producción y filesystem, NO de memoria.

**Artifact visual (fuente de verdad viva, republicar mismo path para actualizar):** https://claude.ai/code/artifact/5e44c9bd-6905-4420-82d5-fd0381d2134e

## Las 8 etapas
0 Infraestructura · 1 Business OS Core · 2 Plataforma Web · 3 Director General IA · 4 Organización IA → **✅ cerradas**. 5 Primera Operación Real · 6 Operación Autónoma · 7 Aprendizaje Organizacional → **⏳ pendientes**. La tabla 0-7 es la línea "Work Fabric"; NO es la misma numeración que las olas del [[programa-ejecucion-continua]].

## Hallazgo central (lo que ordena todo)
**Ningún dominio supera N7 de 10. Madurez promedio 3,5/10.** El muro es IDÉNTICO en los 4 dominios más maduros (Finanzas/Tesorería/Obras/Control Económico, todos en 6): "auto-convertir detección en Acción con responsable/seguimiento" + "el dato de entrada no se refresca solo". **Ese muro ES la Etapa 5.** Romperlo una vez lo rompe para los cuatro. Mapeo madurez→etapa: N2→N7 = Etapa 5; N8 = Etapa 6; N9-N10 = Etapa 7.

## Niveles reales por dominio (public.scorecard_dominios, 22 filas)
Dirección 7 · Obras 6 · Control Económico 6 · Finanzas 6 · Tesorería 6 · Administración 5 · Software 5 · Certificación 4 · Clientes 4 · Datos 4 · Presupuestación 3 · Personas 3 · Equipos y Vehículos 3 · Post Mortem y Aprendizaje 3 · Fiscal 2 · Contabilidad 2 · Proveedores 2 · Compras 2 · Laboral 2 · Comercial 1 · Seguridad e Higiene 1 · Legal y Contractual 1.

## ACTUALIZACIÓN 2026-07-14 — organigrama completado (8 agentes nuevos, vivos)
Se crearon y desplegaron los **8 especialistas faltantes** (migración aditiva `20260715130000_orq_organizacion_completa.sql`, rollback `db/rollback/0006`, idempotente, aplicada directo por DATABASE_URL como el resto de orq.*): **Presupuestador · Calidad · Jefe de Obra · Equipos y Flota · Fiscal · Administración · Seguridad e Higiene · Continuidad de Datos** (org_order 12-19, clearance C, anthropic-api/sonnet). Ahora **orq.agents = 24, organigrama (orq_org) = 20** (Director + 19 especialistas + 4 infra fuera del organigrama). Nuevas capabilities advise.estimating/quality/site/equipment/tax/admin/safety/data (17 advise.* totales) con sus clusters en `skill-map.mjs`; `direction.mjs` (prompt del Director) y `situation.mjs` (DOMAIN_FOCUS) actualizados; worker reiniciado (PID nuevo) para cargar el código. Verificado en vivo: router resuelve las 8 → su agente; 130 tests orq verdes. **Existir ≠ profundidad**: son asesores A–C; su capacidad plena (operar sobre dato real E5→E7) es lo que sigue. **gap_skill declarado**: Equipos y Flota corre con skills interinas (costos + administracion-operativa) hasta crear `equipos-flota-construccion`. **Pendiente de commit** (cambios en working tree de la rama `infra/anthropic-api-engine`; el worker corre desde disco). Techo de autonomía de los agentes fijado por Jorge en **A–C** (observar/diagnosticar/preparar; el humano ejecuta). Ver [[preferencia-os-agentes-completo]].

## ETAPA 6 ARRANCADA — Operación autónoma (MVP), 2026-07-14
**El OS dejó de esperar que un humano abra /direccion.** Timer systemd `echegaray-orq-vigilancia.timer` (cada 6h: 00/06/12/18 -03, `Persistent`) → `scripts/vigilancia-autonoma.mjs` encola un objetivo de Dirección de VIGILANCIA (dedupe por franja `YYYY-MM-DD-HH`, idempotente) → el worker 24×7 lo procesa solo: Director arma DAG mínimo, especialistas analizan sobre dato real, Nivel E cae en aprobaciones. Commit `8eb0200`. Units versionadas en `orquestador/systemd/` + `install.sh` actualizado. **Verificado EN VIVO**: el service disparó y encoló solo (objetivo `d857cf27`); el Director lo planificó (`direction:succeeded`) y asignó a Ingeniería/CFO/Seguridad/Continuidad/Fiscal sin intervención humana. Es el **primer eslabón real de autonomía de arranque** (Etapa 6). Falta para autonomía plena: (a) detector por umbral/evento (hoy es cadencia fija, no reacciona a un cambio material puntual); (b) auto-acción Nivel D (romper muro N6→N7); (c) continuidad de dato para que opere sobre verdad fresca. Techo A–C/D confirmado: NO ejecuta Nivel E. Cadencia/foco tuneables (arrancó en 6h; subir/bajar según valor vs. costo ~$2-4/corrida). Ver [[preferencia-os-agentes-completo]].

## SMOKE E2E de los agentes nuevos — 2026-07-14 (objetivo 092d7ca8)
Objetivo de Dirección real disparado para probar profundidad. **4 agentes nuevos cerraron `succeeded` leyendo sus fuentes reales de Drive** (declararon file_id/rango/fecha, clasificaron HECHO/INFERENCIA/DESCONOCIDO, escalaron Nivel E a approval sin ejecutar). Costo ~$1.88 (5 especialistas), engine anthropic-api/sonnet. Hallazgos reales producidos (valor de negocio, verificar antes de accionar):
- **Continuidad de Datos** (conf. alta): CONFLICTO de saldo bancario entre Flujo de Caja (−$9.170.957, vigente jul-2026) y CONTROL DE GASTOS (BANCO $3.473.742, último dato jul-2024); IVA junio-2026 ausente; `Reporte Economico ...xlsm` da 404; COMPROBANTES con 442 días de atraso. Recomendó fijar Flujo de Caja como única fuente de caja.
- **Equipos y Flota** (conf. media): 6 unidades (F100 AXH205, Ford XLS AG503PV, Mercedes 608D, 3 Hilux); RTO probablemente vencida en F100 y Mercedes 608D (últimas de marzo-2026); NO existe planilla de asignación unidad↔obra; sólo 1 de 6 con seguro archivado.
- **Fiscal** (conf. media): IVA junio-2026 ausente; "Noviembre 2025.pdf" mal archivado en carpeta "IVA 2026"; 2 obligaciones vencidas por $37.706.775 de naturaleza no identificable desde las fuentes; IVA no modelado en ningún sheet.
- **Seguridad e Higiene** (conf. media): PLANILLA DE EPP vacía (sin entregas registradas); ARCOR activa (visita 09/07, inicio 22/06 con Aguero/Alaniz/Rosales) con personal sin constancia EPP verificable; ART sin registro estructurado; subcontratista Morales Paez sin SSMA.

**Hallazgos de robustez del motor (Nivel D, no bloqueantes — mejoras futuras):**
- El tope de **8 iteraciones de tool-use** (`anthropic-api`) es corto para dominios con muchas fuentes: Equipos y Continuidad excedieron y **reintentaron→cerraron OK** (durabilidad funcionó). Evaluar subir el tope o dar más presupuesto de iteraciones a `advise.data`/`advise.equipment`.
- Un request de anthropic-api tardó **666s y timeouteó** antes de reintentar. Latencia alta con tool-use intensivo.
- El modelo a veces alucina/tipea mal un file_id (404) o pide un rango fuera de grilla (400); la tool devuelve error y el modelo **degrada sin romper** (correcto). CFO quedó lento (~13 min) por esto.
- **gap_skill de Equipos CERRADO**: se creó `equipos-flota-construccion` (skill expert-domain, 35 skills totales) y skill-map advise.equipment = [equipos-flota-construccion, costos-presupuestacion]. Requiere reinicio del worker para activarse en proceso (pendiente, sin urgencia).
Commits: `d36071d` (8 agentes) + `7744b76` (skill equipos). Rama `infra/anthropic-api-engine`.

## Organización IA (base Etapa 4 — orq.agents, 16 agentes originales, todos enabled)
1 Director General IA + 9 especialistas de negocio (CFO, Contador, Compras, Comercial, Ingeniería, Arquitecto, Ingeniero Civil, Abogado, RRHH) + 2 técnicos (Software Architect, Developer — únicos en `claude-cli`) = **11 en el organigrama**. + 4 de infra F3 (Planner, Reviewer-QA, DevOps, Knowledge-Manager). Cada especialista carga su cluster de skills vía `orquestador/lib/skill-map.mjs` (capability advise.* → skills), no un `context_ref` fijo.

## Skills (34 en .claude/skills/)
19 expert-domain · 7 methodology · 6 technical · 1 reference · 1 meta-orchestration.

## Huecos de cobertura (inferencia fuerte del cruce scorecard × skill-map, NO decisión de negocio tomada)
- **Dominios sin especialista IA primario** (hoy solo secundario): Fiscal, Seguridad e Higiene (ARCOR exige pliego SSMA), Presupuestación, Equipos y Vehículos, y Administración a evaluar. "Construir para todo" implica crearlos.
- **5 skills expertas técnicas sin consumidor de negocio** (las usa el builder): `arquitectura-integracion-finanzas-obras` (la guardiana de coherencia), `google-sheets-business-systems`, `lectura-drive-documentos-multiformato`, `integraciones-apis-sistemas-externos`, `web-ux-deploy-operacion-producto` — son justo el motor de continuidad de dato que la Etapa 5 necesita cablear.

## Lógica de ejecución (corregida 2026-07-14 por Jorge — ver [[preferencia-os-agentes-completo]])
La visión NO es un vertical financiero: es un **sistema operativo COMPLETO de agentes para llevar una constructora**. Objetivo = la matriz entera (todos los especialistas × 3 etapas × 22 dominios), con la COMPLETITUD como principio organizador, no las finanzas.
El "construir una sola vez" correcto es el **substrato HORIZONTAL del OS** que sirve a TODOS los agentes: (1) continuidad de dato por dominio, (2) detector/trigger autónomo, (3) Decision/Outcome Ledger, (4) roster completo de especialistas (incl. crear los faltantes). Eso es lo que lo hace un OS y no 22 features sueltas.
Tensión real a respetar: 16 de 22 dominios están en N1-3 (sin dato confiable) → encender autonomía sobre dato ausente = ruido autónomo a escala (prohibido por la misión). Por eso el mecanismo se construye horizontal y general, pero se **ACTIVA por dominio a medida que cada uno alcanza confianza de dato** — ni finanzas-solo, ni los-22-a-ciegas. El orden de activación lo fija impacto × confianza-de-dato, no la comodidad.

## Infra relevante ya viva (verificada, no de memoria)
- Worker durable `echegaray-orq-worker.service` active 24×7, procesa tareas vía anthropic-api — pero **solo reclama tareas existentes, NO tiene detector** (falta el trigger de Etapa 6). Ver [[el-os-es-el-lugar-de-trabajo]].
- Continuidad de dato Drive→OS **existe pero parcial**: `echegaray-sync.timer` cada 4h lee el Flujo de Caja real → snapshot `calendario-snapshot.json` (git) y escribe saldos de vuelta al Sheet (`flush-saldos`). Todo lo demás (HH/JORNALES, costos, P&L, avance) sigue siendo carga manual en sesión — el gap estructural que la Etapa 5 debe cerrar. Ver [[continuidad-operacional-datos]] y [[operabilidad-real]].

**Decisión abierta al 2026-07-14:** con la visión corregida (OS completo de agentes), definir el arranque entre — (a) construir el substrato horizontal (continuidad + trigger + ledger) como capacidad general y activarlo por dominio según confianza de dato; (b) completar primero el roster (crear Fiscal/SySO/Presupuestador/Equipos + revisar si faltan roles para una constructora); (c) un primer dominio como prueba del mecanismo, elegido por impacto × confianza, no necesariamente finanzas.
