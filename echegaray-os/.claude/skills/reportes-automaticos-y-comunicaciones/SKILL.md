---
name: reportes-automaticos-y-comunicaciones
description: "Generación y entrega de reportes automáticos configurables sobre cualquier dominio de Echegaray (dirección, obras, finanzas, cobranzas, pagos, acciones, riesgos, HH, proveedores, documentación) y su comunicación por el canal adecuado. Activar al crear/modificar un reporte, decidir su canal de entrega, agregar un tipo de reporte nuevo, o cuando se detecte una revisión manual recurrente que un reporte podría reemplazar. NO ejecuta envíos externos (email/WhatsApp/Telegram) sin configuración y autorización explícita — primero publicación dentro del OS."
allowed-tools: Read, Bash, Grep, Glob
metadata:
  author: echegaray-os
  type: technical
  jurisdiccion-principal: "San Juan, Argentina"
---

# Reportes Automáticos y Comunicaciones

## Propósito

Que el Business OS genere reportes configurables sobre cualquier dominio y los publique/envíe por el canal adecuado, sin fabricar precisión: cada reporte declara qué es confirmado, qué es calculado, qué es estimado y qué falta.

**Contribución a la MISIÓN**: mejora decisiones y anticipa problemas (Dirección ve caja/obras/acciones sin pedirlo), reduce carga manual (nadie arma el reporte a mano) y aumenta trazabilidad (historial con fuentes y confianza declaradas).

## Alcance

Cubre: definición de reportes (modelo `reportes_definiciones`), generación (on-demand, programada, por condición, por alerta), contenido estándar, historial (`reportes_generados`), canales y su progresión, scheduling, confianza y detección autónoma de necesidades de reporte.

No cubre: el criterio de negocio del contenido (lo aporta la skill de dominio dueña del dato — un reporte financiero se arma con `finanzas-tesoreria-construccion`, uno de obras con `planificacion-produccion`/`direccion-obra`), ni la decisión sobre el dato (los reportes leen, nunca escriben datos de negocio).

## Tipos de reportes

Diario de Dirección · semanal de Obras · semanal Financiero · mensual Económico/P&L · Cobranzas · Pagos · Acciones vencidas · Riesgos · Productividad/HH · Proveedores · Documentación · personalizados a pedido de Jorge. Todos comparten el mismo modelo — un tipo nuevo es una fila en `reportes_definiciones` más un generador, nunca una feature paralela.

## Configuración (modelo `reportes_definiciones`)

Cada reporte define: `clave`, `nombre`, `objetivo`, `audiencia` (rol), `dominio`, `frecuencia` (diario/semanal/mensual/bajo_demanda/por_condicion), `dia_hora`, `periodo_cubierto`, `fuentes` (tablas del OS, snapshot del Sheet, fuentes_datos), `nivel_detalle`, `formato`, `canal`, `responsable`, `condicion_envio` (null = siempre), `confianza_minima`, `si_faltan_datos` (default: publicar con gaps declarados, nunca inventar), `activo`.

## Contenido estándar (jsonb en `reportes_generados.contenido`)

Resumen ejecutivo · principales cambios vs. período anterior · números clave · riesgos · decisiones requeridas · acciones vencidas · recomendaciones · datos con baja confianza · gaps · links al OS · fuentes usadas · timestamp. Un reporte sin decisiones asociadas posibles es decorativo — regla de dashboards del CLAUDE.md raíz aplicada a reportes.

## Canales (progresión aprobada por Jorge 2026-07-10)

| Etapa | Canal | Estado |
|---|---|---|
| Ahora | Publicación dentro del OS (`/reportes`) | **Implementado** |
| Ahora | PDF (vista imprimible del reporte) | **Implementado** (imprimir/guardar como PDF) |
| Ahora→ | Google Doc generado (cuenta de servicio ya autenticada) | Preparado, siguiente incremento |
| Después | Email institucional @ecsas.com.ar | Cuando exista configuración SMTP/API segura — nunca hardcodear credenciales |
| Después | WhatsApp Business API | Solo si vale la pena (evaluar costo/uso real) |
| Después | Telegram bot | Solo si se quiere algo rápido |
| Después | Slack | Solo si realmente lo usan |

**Prohibido enviar a un canal externo sin configuración y autorización explícita.** La transición a email requiere: credencial en variable de entorno (nunca en código ni en tabla), lista de destinatarios en la definición del reporte, y aprobación de Jorge por tipo de reporte.

## Scheduling

Distingue: programado (frecuencia+dia_hora) · bajo demanda (botón en `/reportes`) · por condición (`condicion_envio`) · por alerta crítica. Implementación por etapas: hoy on-demand; el programado se engancha a la infraestructura existente (pg_cron ya corre rutinas reales en Supabase; un job puede invocar la generación vía función/route handler) — no crear un scheduler paralelo. La `frecuencia` vive en la definición desde el día uno para que activar el scheduling no requiera migrar datos.

## Confianza (obligatoria en cada generación)

`reportes_generados.confianza` declara: datos confirmados · calculados · estimados · parciales · fuentes atrasadas (cruzar contra `fuentes_datos.frescura`) · gaps que afectan la conclusión. Un reporte con fuentes vencidas lo dice arriba, no en la letra chica. Nunca enviar un reporte falsamente preciso: si falta el dato, el reporte muestra "sin dato" y el gap, jamás un número inventado.

## Autonomía

El OS propone reportes nuevos cuando detecta necesidad recurrente (ej.: si Dirección revisa cada semana caja + obras + acciones, proponer "Reporte semanal de Dirección" vía `backlog_autonomo` tipo `mejora_potencial`). La propuesta es autónoma; la activación de un reporte nuevo y su canal los decide una persona.

## Interacción con otras skills

El contenido lo dictan las skills de dominio dueñas del dato (`finanzas-tesoreria-construccion`, `planificacion-produccion`, `direccion-obra`, `contabilidad-constructoras`…). `arquitectura-integracion-finanzas-obras` arbitra qué fuente usa cada número (ej.: lo financiero sale del snapshot del Sheet — fuente de verdad de caja — no de una recomputación paralela). `web-ux-deploy-operacion-producto` decide cómo se ve `/reportes`. `orquestador-de-razonamiento-y-skills` gobierna cuándo activar esta skill.

## Límites de certeza

Esta skill no valida la verdad del dato de origen — hereda la confianza de la fuente y la declara. No puede garantizar entrega en canales externos que aún no existen.

## Prohibido

Enviar a canales externos sin configuración y autorización. Hardcodear credenciales. Publicar números sin declarar su nivel de confianza. Crear un tipo de reporte como feature paralela en vez de una definición + generador. Reportes sin decisión posible asociada.
