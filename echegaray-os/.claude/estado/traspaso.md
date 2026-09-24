# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: **2026-09-24 (−03)** · `origin/main` = **c5d99d90** (código en b43babb9, deploy Vercel OK)._
_Historia anterior: `git show c5d99d90:echegaray-os/.claude/estado/traspaso.md` — NO leerla salvo que haga falta._

## 0. CÓMO ARRANCAR LA SESIÓN (leer primero)

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

**Publicado y verificado en producción (23/09):** cabecera y solapas fijas (RotuloEstable) · «cerrada» se lee
«Archivada» · Resumen con HH (931, 72 esta semana en QP) y Asignados · Personal «Costo de esas horas» desde
`costo_de_obras_a_la_fecha` ($6,3 M QP) · fotos del parte (migración T2700 aplicada) · Compras en pesos < $100k ·
Documentos sin roles crudos · C02/convertir toman la versión ADJUDICADA (`versionQueVale`) · produccion-al-dia no
reinicia daemons que atienden personas fuera de 2–5 h (9bb8b375).
Revisado contra diseño: 03, 04, 06, 09, 11, 12, 14, C01, C02, C04, Operación, Documentos (1440 y 390).

**Espera al dueño:**
1. Borrar 17 activos «PRUEBA E2E» (+30 movimientos, tablas activo_*): ensayo hecho, sin referencias reales;
   el clasificador de permisos frenó el borrado masivo → hace falta su «sí» explícito.
2. QP: congelar la v3 (COT-2026-001, adjudicada) — hoy C02 dice «no está congelado».
3. QP: las 26 partidas no tienen HH ni costo → el plan saldría sin HH planificadas.
4. ¿La presencia por defecto cuenta como HH de la obra? (QP 931 h vs 789 valorizadas; ≈125 h presuntas).

**Pendiente propio (siguiente paso, en este orden):**
1. Capturas contra diseño sin revisar: C03, C05–C10, menú de la cuenta, 10 Pedidos a 1440.
2. Probar escrituras reales con el dueño (no con datos de prueba): foto del parte, guardar parte, impedimento,
   asignar persona, crear estructura y sellar, archivar → leer el efecto en la base.
3. Ninguna de las 3.822 filas de `registros_hh` tiene `actividad_id`: Ítems/frentes siempre «sin HH». Definir cómo
   se imputa HH a la actividad (decisión de producto antes que código).
4. `escrituraCondicional.test` (RLS) falla por falta de cuenta de campo; no se crean usuarios de prueba → hace falta
   fixture que cree y borre dentro de la transacción.

## 2. OTROS ABIERTOS

- Corralón Progreso: facturas 3862 ($13.195,02) y 3428 ($56.220) pagadas y SIN CARGAR (las trae Ariel en mano);
  saldo del proveedor $2.568,20 DESCONOCIDO.
- 8 specs e2e dependen de `qa.campo@` (borrada): sin fixture.
- Herramientas: «Enviar a reparación externa» debe preguntar a qué servicio técnico va.

## 3. REGLA

Leer esto → `git status --short --branch` → `git fetch && git log -1 origin/main` → tarea → mínimo necesario →
test dirigido → publicar → verificar en producción → actualizar este archivo (corto: reemplazar, no apilar).
El handoff es contexto, no verdad: **si el repo lo contradice, el repo manda.**
