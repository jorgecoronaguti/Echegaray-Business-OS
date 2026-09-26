---
name: trabajo-eficiente
description: "Cómo se reparte el trabajo para gastar pocos tokens: contexto mínimo (e5), trabajo mecánico a scripts y modelos de HF, agentes con paquete de contexto y salida corta. Cargar al empezar una tarea de varios pasos o antes de lanzar un subagente."
metadata:
  type: methodology
  author: echegaray-os
---

# Trabajo eficiente — quién hace cada cosa

Cada línea que entra al contexto se relee en cada respuesta siguiente. El gasto no es el tamaño de
la tarea: es lo que se carga para hacerla. Medido el 16/09 (`orquestador/dev-router/medicion-pareto-2026-09-16.log`):
leer archivos 41 %, búsquedas 16 %, logs 10 %, editar código 0,6 %.

## La escalera

| Paso | Quién | Comando |
|---|---|---|
| 1. Contexto mínimo | e5 local + léxico, $0 | `node orquestador/scripts/contexto-minimo.mjs "<tarea>"` → punteros a memorias, skills, docs, scripts y agentes; `--tipo script` responde «¿ya hay un script del OS que lo haga?» |
| 2. Localizar código | `rg` / Grep, git | nunca leer el archivo entero: el tramo (`dev-router/contexto.mjs`) |
| 3. Trabajo mecánico | script determinístico | si se repite, se vuelve script o test |
| 4. Salida larga | HF (Qwen3-Coder-480B) | `<cmd> 2>&1 \| node orquestador/scripts/hf-digerir.mjs <tests\|typecheck\|lint\|build\|git\|codigo> "<pregunta>"` |
| 5. Edición D0–D1 | dev-router → HF | una tarea en `orquestador/dev-router/tareas/` (ejemplo: `spec-liquidacion-al-dia.mjs`) + `correr-tarea-real.mjs`; el verificador manda y si da rojo vuelve a Claude. Todavía no hay CLI general |
| 6. Razonar y decidir | Claude | lo que tiene efecto económico, contractual, fiscal, laboral o de seguridad |

## Lo que corre solo (26/09/2026)

- **Cada mensaje del dueño**: el hook `~/.echegaray-os/bin/hook-contexto.mjs` agrega hasta 6 punteros
  léxicos del índice (memorias, scripts, skills) en ~0,1 s. Al abrir sesión rehace el índice en segundo plano.
- **Cada subagente**: el portero `~/.echegaray-os/bin/hook-agente.mjs` le agrega al encargo el bloque
  `[primero-el-os]` (contexto-minimo, hf-digerir, lectura por tramos, informe ≤300 palabras). Sin `model`
  corre en Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL`); Opus sólo con `[opus-justificado]`. No hay tope de cantidad.
- **Compactación**: `autoCompactWindow: 300000` en los settings del usuario — principal y subagentes
  compactan antes de releer 400–900 k por vuelta.
- **Medir**: `node orquestador/scripts/medir-tokens.mjs [<sesión>] [--desde <ISO>]` — entrada por modelo,
  contexto medio y máximo, y los agentes más caros. Línea de base 26/09 (d50fb332): 3.371 M de entrada,
  95 % Opus, 75 % en subagentes, contexto medio 400 k en la principal.

## Límites que no se negocian

- **HF nunca ve datos de negocio.** `hf-digerir` sólo acepta salidas de desarrollo y bloquea CUIT,
  mails, CBU, secretos y montos en pesos. Salidas del Sheet, la base o el banco se filtran local
  (`grep`, `tail`) o las lee Claude.
- **HF puede inventar.** `hf-digerir` verifica cada cita «…» literal contra la salida original y marca
  `✗NO-ESTÁ-EN-LA-SALIDA` la que no está. Una cita marcada no se usa.
- **`contexto-minimo` sugiere, no reemplaza.** Medido el 18/09 sobre 71 pedidos reales: acierta al
  menos una memoria útil en 23 % de los casos con top-5 y 34 % con top-10. MEMORY.md sigue mandando.

## Encargo a un subagente

Un subagente no ve la memoria ni esta conversación. El encargo lleva:

1. **Objetivo y qué cuenta como terminado**, en dos líneas.
2. **Paquete de contexto**: las rutas que dio `contexto-minimo` y que aplican, los hechos ya
   establecidos (copiados, no referidos) y lo que ya se descartó.
3. **Restricciones**: portero `ecos` para lo pesado, nada de Sheet real ni pipeline, sin push.
4. **Contrato de salida: ≤25 líneas** — resultado, evidencia (comando + última línea), dudas.
   Salidas largas del agente pasan por `hf-digerir` antes de volver.
5. **Modelo**: sonnet para lo mecánico o de búsqueda; opus sólo si hay diseño o criterio difícil.

Nunca más de 2–3 vivos. No retomar un agente con contexto enorme: uno nuevo con encargo corto.
