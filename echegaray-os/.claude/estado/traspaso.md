# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: **2026-09-24 (−03)** · `origin/main` = **c5d99d90** (código en b43babb9, deploy Vercel OK)._
_Historia anterior: `git show c5d99d90:echegaray-os/.claude/estado/traspaso.md` — NO leerla salvo que haga falta._

## 0. CÓMO ARRANCAR LA SESIÓN (leer primero)

**MANDATO DEL DUEÑO: terminar TODO lo pendiente de las secciones 1 y 2, sin frenar.** No se cierra la sesión
con pendientes propios abiertos: cada ítem termina publicado y verificado en producción. Lo que espera al dueño
se le pide UNA vez por el bot con la pregunta lista para contestar, y mientras tanto se sigue con lo demás.

**Modelo: Opus** (`claude --model opus` o `/model opus` → claude-opus-5-5). No usar Fast ni Haiku para este módulo:
toca plata, RLS y producción.

**Ahorro de tokens (pedido del dueño):**
- Leer SÓLO esta sección 0 y la 1. No abrir archivos enteros grandes (`page.tsx` de la obra): `grep -n` y `sed -n`.
- Subagentes: 1–2 como máximo y sólo para trabajo paralelo real; cada uno se come ~5–10× una lectura directa.
- Skills de dominio: sólo si la tarea decide algo económico/laboral/legal. No para UI ni código.
- Capturas: mirar 1 imagen por pantalla, no lotes. Comparar contra el diseño sólo lo que se cambió.
- Tests por archivo (`ecos validacion -- node --test <archivo>`), nunca la suite completa.
- Respuestas al dueño cortas. `/compact` al cerrar cada bloque de trabajo.

**Herramientas ya armadas (en `echegaray-os/`, sin commitear):** `zzz-db.mjs "<sql>"` (base viva) ·
`zzz-qa390.mjs` (capturas contra producción con enlace mágico) · `zzz-dis.mjs` (renderiza el diseño).
Navegador: `ecos browser -- …` con `LD_LIBRARY_PATH=$(cat <scratchpad>/deps/libpath.txt)` (si no existe, Chromium sale 127).
Tipos: `npm run typecheck` y **mirar el exit code** (sin memoria sale 134 y parece verde). Después de cada push:
`gh api repos/:owner/:repo/deployments` → statuses = success antes de capturar.
Publicar: rama = origin/main + commits nuevos → `git push origin HEAD:main`. Migraciones:
`node orquestador/scripts/aplicar-migracion.mjs <archivo>` (ensayo) y luego `--aplicar`, verificar en la base.
Diseños: `/home/jorge/echegaray-design/erp-obras/<LABEL>.html` (1440) y `M<n>.html` (390).

**Reglas que no se negocian:** nunca tirar el chat (publicar no reinicia chat/bot; sólo 2–5 h) · nunca datos ni
usuarios de prueba en la app viva · Nivel E y Sheet real = autorización del dueño · cabecera de obra idéntica en
todas las solapas · evidencia del efecto en producción antes de decir «listo».

## 1. ESTADO — ERP OBRAS

**24/09 publicado y verificado en producción:** C03, C05–C10 y 10 Pedidos revisados contra diseño (1440) ·
chips/botones a 16 px por `font: 'inherit'` después de `fontSize` (28 sitios) · «Se puede porque» decía «por cantidad»
en actividades manuales · cabecera «Archivada» · Resumen: partes de actividades archivadas con nombre, inicio real
de respaldo («20/08/26 · primer parte» en QP) · tests: cuentas efímeras campo/jefe/dirección por corrida
(globalSetup `tests/util/cuentas-de-la-corrida.ts`), `escrituraCondicional.test` verde, 0 cuentas vivas al terminar.

**HALLAZGO que manda:** ninguna de las 7 obras activas tiene estructura viva. Las 5 actividades de QP (conversión
del 22/08, con 3 partes cargados) están ARCHIVADAS; no hay registro de quién/cuándo. El módulo no se usa en obra en
curso hasta que QP tenga estructura → decisiones 2 y 3 del dueño bloquean. Pedidos: 17 en total, último 28/07.

**Espera al dueño:** 1) borrar 17 activos «PRUEBA E2E» + obras `prueba-e2e` y `zz-e2e-celda…` · 2) QP: congelar v3 y
reconvertir (o restaurar las 5 archivadas) · 3) QP: 26 partidas sin HH ni costo · 4) presencia por defecto ¿cuenta como
HH? · 5) HH → actividad (3.822 filas sin `actividad_id`) · 6) cuenta `jorge.o.corona+direccion-test…` está BANEADA:
¿se borra? · 7) `efectivo-raw-pestana` y avisos no filtran `es_prueba` (por eso efectivo-rls mide sólo la mitad).

**Pendiente propio:** Plazo del Resumen dice «sin inicio real» cuando el aside ya muestra el respaldo (unificar) ·
escrituras reales con el dueño (foto, parte, impedimento, asignar, crear/sellar, archivar) cuando QP tenga estructura ·
C10 sólo se ve en etapa Previo: revisar con la primera obra nueva.

## 2. OTROS ABIERTOS

- Corralón Progreso: facturas 3862 ($13.195,02) y 3428 ($56.220) pagadas y SIN CARGAR (las trae Ariel en mano);
  saldo del proveedor $2.568,20 DESCONOCIDO.
- Herramientas: «Enviar a reparación externa» debe preguntar a qué servicio técnico va.

## 3. REGLA

Leer esto → `git status --short --branch` → `git fetch && git log -1 origin/main` → tarea → mínimo necesario →
test dirigido → publicar → verificar en producción → actualizar este archivo (corto: reemplazar, no apilar).
El handoff es contexto, no verdad: **si el repo lo contradice, el repo manda.**
