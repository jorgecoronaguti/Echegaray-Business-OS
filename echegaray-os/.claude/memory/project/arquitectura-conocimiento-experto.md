---
name: arquitectura-conocimiento-experto
description: Sistema de razonamiento multidisciplinario — 15 skills expertas (13 de dominio + 2 técnicas: integraciones y lectura de Drive/documentos) + matriz de activación en CLAUDE.md raíz. Existe desde 2026-07-07, debe usarse en toda decisión compleja de la empresa, no solo en construcción de features del OS.
metadata:
  type: project
---

# Arquitectura de Conocimiento Experto

Fecha: 2026-07-07

## Qué existe

15 skills expertas en `.claude/skills/` (nivel `echegaray-os/`): 13 de dominio profesional de una empresa constructora (`ingenieria-civil-construccion`, `direccion-obra`, `planificacion-produccion`, `costos-presupuestacion`, `derecho-construccion-contratos`, `contabilidad-constructoras`, `impuestos-construccion`, `finanzas-tesoreria-construccion`, `derecho-laboral-construccion` (incluye UOCRA/IERIC/Fondo de Cese), `seguridad-higiene-art`, `calidad-obra`, `compras-abastecimiento-subcontratacion`, `gestion-empresarial-riesgos`) + 2 técnicas agregadas después (2026-07-07): `integraciones-apis-sistemas-externos` (arquitectura de integraciones: APIs/webhooks/sincronización/reconciliación/migración de Sheets legacy) y `lectura-drive-documentos-multiformato` (metodología de inspección/lectura/extracción/validación de Google Drive y documentos multiformato — Sheets, Docs, PDF, Excel, Word, CSV, imágenes/OCR). Ninguna de las dos es "profesional de constructora" — deciden el *cómo* técnico (conectar el OS con un sistema externo, o leer/extraer un dato de una fuente legacy), nunca el *qué* dato capturar ni cuál fuente gana en un conflicto (eso lo sigue decidiendo la skill de dominio dueña del dato: `finanzas-tesoreria-construccion`, `impuestos-construccion`, etc.). Ninguna integración real está construida todavía — parte de cero, sin inventar historial. `lectura-drive-documentos-multiformato` nace directamente de los hallazgos reales de PR0-A: en particular, la limitación confirmada de que las herramientas de Drive disponibles no permiten seleccionar una pestaña específica de un Sheet por `gid` (devuelven la primera/pestaña activa por defecto) — documentada ahí como gap abierto, con un método candidato no validado todavía (descarga + parseo local del XML de la hoja).

El `CLAUDE.md` raíz ganó una sección nueva al final ("SISTEMA DE RAZONAMIENTO MULTIDISCIPLINARIO") — **contenido preexistente intacto, solo adición** (confirmado: `git diff --stat` mostró 66 inserciones, 0 eliminaciones). Esa sección tiene la matriz de activación cruzada por tipo de decisión (cotizar, aceptar contrato, cambio de solución constructiva, adicional, comprar vs. alquilar, subcontratar, planificación, capital de trabajo, reclamo, desvinculación, incidente de seguridad, cierre de obra).

## Decisión de arquitectura central

Tres capas con regla de cambio distinta: **CLAUDE.md** (constitución, invariante) → **skills expertas** (conocimiento de dominio, declaran fuente/vigencia/jurisdicción) → **memoria de proyecto** (aprendizaje específico de Echegaray). Nunca se infla CLAUDE.md con contenido técnico-normativo porque se carga en cada mensaje y cambia con el tiempo.

## Regla de uso obligatoria hacia adelante

Esta arquitectura no es solo para construir features del OS — **debe activarse en cualquier decisión real de la empresa que se converse con Claude**, no solo en sesiones de desarrollo. Antes de responder una decisión compleja (cotizar, contratar, cambiar una solución técnica, etc.), identificar los dominios relevantes y cruzar las skills correspondientes según la matriz del CLAUDE.md raíz.

## Límite explícito, no fabricado

Ninguna skill tiene hoy una tasa, alícuota, convenio, norma o rendimiento técnico cargado como "vigente" — es intencional (primera versión, cero invención). Cada skill documenta su propio gap y protocolo de verificación (WebSearch/WebFetch antes de citar algo normativo como vigente). El dominio de mayor riesgo si esto se ignora es `impuestos-construccion` y `derecho-laboral-construccion`.

## Aprendizaje continuo — corrección explícita del usuario

Post Mortem **no es la única entrada de aprendizaje** (corrección del usuario a una propuesta anterior que sí lo asumía así) — el ciclo `OPERACIÓN→EVENTO→RESULTADO→DESVÍO→CAUSA→EVIDENCIA→PATRÓN→PROPUESTA→VALIDACIÓN→INCORPORACIÓN→APLICACIÓN→MEDICIÓN` puede iniciarse desde cualquier punto de la operación (alertas, acciones, compras, incidentes, etc.), documentado igual en cada skill. Clasificación obligatoria antes de incorporar algo como conocimiento validado: A (observación aislada) → B (recurrencia) → C (patrón probable) → D (conocimiento validado) → E (regla aprobada). Nunca A pasa directo a E.

## Qué NO se tocó en este incremento

Sin cambios en Supabase, sin tablas nuevas, sin cambios en Centro de Acción ni navegación — exclusivamente arquitectura de conocimiento y razonamiento, por instrucción explícita del usuario.

## Próximo paso sugerido

No construir las 13 skills en profundidad enciclopédica desde el día uno — usarlas en decisiones reales, y dejar que el mecanismo de aprendizaje (Post Mortem y el resto de fuentes) las vaya engrosando con validación explícita. El primer gap real a cerrar con evidencia externa (no inventada) es `impuestos-construccion`, dado que hoy no tiene ninguna alícuota verificada cargada.
