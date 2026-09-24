# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: **2026-09-24 mediodía (−03)** · `origin/main` = ver `git log -1` (código en aef02369)._
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

**Decidido por el dueño 24/09:** estructura de TODAS las obras desde cero (no restaurar las 5 archivadas de QP ni
reconvertir la v3) · HH quedan en la obra sin actividad hasta armar la imputación por actividad · borrados y
verificados: 17 activos PRUEBA E2E (+33 mov.), obras `prueba-e2e` y `zz-e2e-celda…`, 7 retiros de asistencia de
prueba, cuenta `…direccion-test…` · confirmación de firma de efectivo: YA va al DM del dueño (verificado ER-0016/17/18,
Rodrigo no la recibió) — no se tocó.
**Sin respuesta:** presencia por defecto ¿cuenta como HH? · filtrar `es_prueba` en efectivo-raw/avisos.

**24/09 tarde (main 293cbc99):** Clientes sólo Administración (fef20635) · asistencia de jefes rota por
redirect fijo a /clientes y arreglada (bfa6dd14, verificada con sesión de Emiliano, avisados por DM) · portal
confinado (293cbc99) · «Campo» se dice «Trabajo», operario sin raíz /campo (a48f4800) · revisión 1440 y 390
contra diseño con arreglos (f2604814, a48f4800) · borrados de prueba hechos.

**24/09 noche (main 0f48af08):** jefe = sólo Personal sin Liquidación (Clientes/Compras/Proveedores/Impuestos/
Presupuestos/gestión de Efectivo → /obras), verificado con sesión de Emiliano · guardado de asistencia probado con
su sesión (fila de mañana creada y borrada, 0 restos) — si él sigue fallando es página vieja: se le pidió recargar y
captura (DM n8tkk56q) · Personal: 3 plegables rediseñados, «Asignar persona» en el lugar, «Quitar» horas discreto
con confirmación · panel de la tarea (avance, dependencias, rendimiento, notas) en lenguaje nuevo · un solo avance
masivo (/campo/parte → /obra/avance-masivo) · puedeVerRuta compara sin query.

**Pendiente:**
1. React #418 en C02: descartados cabecera, fechas, números; el diff SSR/cliente con JS apagado no sirve (streaming).
   Sin impacto visible. Para ubicarlo: build sin minificar local.
2. C04/MC3/C10 cuando QP tenga estructura real (el dueño decidió estructura desde cero).
3. e2e tocados por el agente de Personal (obras-ejecucion, personal-hh, hh-fuente-canonica) sin correr.
4. «Plan, recursos y edición» (plegable compartido) y BloqueNotas del cronograma: estilo viejo, compartidos fuera de Obras.
Regla: antes de cerrar/mover una ruta, recorrido real con sesión del usuario real (enlace mágico, lectura).

## 2. OTROS ABIERTOS

**24/09 mediodía (publicado y verificado salvo lo marcado):**
- Teléfono: jefe con UNA barra (J01) en todo el teléfono + «Cargar asistencia» en Gente; Administración opción B
  (Obras · Personal · Compras · Datos · Más, `/mas`, entra por Obras); barra de áreas nivel 2 oculta bajo `md`.
  **Falta:** adaptar a 390 Personal y Compras de escritorio (usables, cargadas).
- Efectivo: gestión sólo Administración en la base (20260924T1900); pruebas borradas (ER-0004/12/14/16/17/18) y
  `borrar_entrega_de_prueba` arrastra avisos/rendiciones (T1910); avisos excluyen `es_prueba`. ER-0005 queda anulada.
- Proveedores: tocar un proveedor abre la ficha. Neumagom: eCheq 382/383 atados a Compras f981 (ficha «+2») y
  «FA 0002-00004213» en Cheques Emitidos f142/f143 (snapshot 4a4d390b). Otro eCheq Neumagom $317.000 (03/10) sin factura.
- Gantt de Obras: banda de cliente de borde a borde y «…» en nombres largos.
- Nómina: publicados los 3 arreglos de la rama `cargas-sociales-y-nomina` (aef02369) → entran al Sheet en la
  corrida de las 12:50: **verificar después**. Conectar Nómina al Cash Flow espera la decisión A/B y 50% vs 38,6%
  (memoria `nomina-dos-proyecciones-2409`).

- Corralón Progreso: facturas 3862 ($13.195,02) y 3428 ($56.220) pagadas y SIN CARGAR (las trae Ariel en mano);
  saldo del proveedor $2.568,20 DESCONOCIDO.
- Herramientas: «Enviar a reparación externa» debe preguntar a qué servicio técnico va.

## 3. REGLA

Leer esto → `git status --short --branch` → `git fetch && git log -1 origin/main` → tarea → mínimo necesario →
test dirigido → publicar → verificar en producción → actualizar este archivo (corto: reemplazar, no apilar).
El handoff es contexto, no verdad: **si el repo lo contradice, el repo manda.**
