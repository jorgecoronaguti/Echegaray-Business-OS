# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-16 ~14:15 (−03) · main = producción (cd01ef5a, Vercel Ready)_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones: app web (Next.js + Supabase),
datos, automatizaciones, motores determinísticos e IA para que Dirección y la empresa operen desde una única
plataforma. XSAS es la capa de inteligencia operativa. Claude Code NO es la interfaz operativa: desarrolla,
corrige, prueba y evoluciona el OS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado, Cash Flow percibido
- UX simple y compacta; nada se da por bueno sin mirarlo en navegador (1440 y 390)
- **Lo que el dueño pidió no se quita** · edición manual del dueño = verdad
- Nivel E (efecto externo) = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- **PROHIBIDO `orq:test`/suites completas mientras el dueño trabaja**: tumban Postgres. Tests por archivo, typecheck, eslint.
- Nadie cierra su propio trabajo · responder al dueño por el bot (`avisar-al-dueno.mjs`)
- **El bot: nunca backticks en el texto** — bash los ejecuta y se come el contenido (pasó hoy)

## 3. ESTADO ACTUAL

**En producción y verificado hoy (16/09):**
- **Saldo red.** en Liquidación de horas: el saldo total al $1.000, como si todo saliera en billetes. Sólo lectura,
  no entra en ninguna cuenta. QA en vivo: 14 filas, total $4.232.000 = pie.
- **Presentismo UOCRA** (cd01ef5a): la falta injustificada también lo hace perder, no sólo tardanza/retiro. Qué es
  injustificada sale del catálogo único (`asistencia-motivos.mjs`): pierden SÓLO `falta` y `falta_con_aviso`. No
  pierden licencias ni lo que no depende del trabajador (lluvia, obra parada, paro, franco). Ausencia sin motivo o
  «Otro» → estado `a_revisar`: NO descuenta, la pantalla dice qué día falta clasificar. Base = básico quincenal ×
  50 % (la fórmula ya era ésa; ahora se muestra). UX: panel con Base · % 20 · Presentismo · Estado · motivo.
- **@shadcn/lint** (3d9a9fea): guardarraíl del sistema de diseño. `npm run lint` = 563 warnings, 0 errores.
  Instalado en el árbol principal Y en `produccion/` (el lockfile está en .gitignore a propósito: la dep vive en
  package.json). Reglas: `require-static-classes` error · `no-raw-colors` y `no-restyle` warn ·
  `no-arbitrary-values` warn acotada a color · **`no-inline-styles` y `no-unknown-classes` APAGADAS con medición**
  (los 15.188 inline son el patrón `style={{...V}}` del OS; los 217 unknown eran 217 falsos positivos porque el
  linter es para Tailwind v4 y el repo usa v3). Regla de uso en `.claude/rules/web.md`.

## 4. MESSINA — OP 5241 (16/09), cerrado salvo lo que depende del banco

La OP paga las 3 facturas que se iban a reclamar: A 0001-00000226 ($4.298.124,31) + A 0001-00000224 ($1.089.000)
+ A 0001-00000222 ($7.228.782) = **$12.615.906,31**. El mail de reclamo quedó **como borrador sin enviar** en
jorge@ (draft `r6214468967970232403`): ya pagaron, no se manda.

Hecho y verificado:
- **Drive**: `O_P_0000000005241.pdf` y `_G00002401.pdf` en `MESSINA/BSA…/OC - FACTURAS/Orden de Pago` y en
  `MESSINA/Relevamiento topografico con drone/Orden de Pago` (subcarpeta creada). Indexados en `drive_index`.
- **Cobranzas** (filas 46, 47, 65), celda por celda con respaldo y relectura: Notas con la OP · Q 18/08→**21/08**
  (manda ARCA, es el CAE) · R 17/09→**20/09** (vto real) · M con la retención prorrateada (71.043,37 / 119.484 /
  18.000) + los $38.462,45 del saldo a cuenta de la OP 5146 en la 226 · N recalculado. **Cuadra al peso**: las
  retenciones suman $208.527,37 (= comprobante) y los netos $12.407.378,94 (= eCheqs + transferencia).
- **CRM**: 4 vínculos en `cliente_documento` con el rol **con la obra ADELANTE** (el QA vio que el rol se trunca y
  las dos retenciones se leían idénticas). `cliente_orden` ya tenía la OP por el timer de Gmail pero **sin obra**;
  se le asignó `messina-bsa` (91 % del importe) con nota de que también paga la 224 del relevamiento. OB-0019
  pasó de 19 a 21 documentos.

**Pendiente, depende del banco:** marcar «Cobrado» cuando acrediten · cargar los 2 eCheqs (6526 Supervielle S.G.
$2.896.036,13 · 8767 Río de la Plata S.A. $9.426.000) **cuando aparezcan en el espejo del Santander**: cargarlos a
mano hoy los DUPLICA (no están en `_CHEQUES_RAW`, que llega al 10/09). El portal no publica órdenes de pago por
diseño: `documentos-espejo.mjs` las marca «no se reconoce como papel del cliente» (pasa con 5146, 2983 y 4807).

## 5. PENDIENTES REALES

- **P0 — `feat/dev-router` SIN MERGEAR y es decisión del dueño.** Development Router + modo `CLAUDE_UNAVAILABLE`.
  Probado: con Claude apagado, `moonshotai/Kimi-K2.7-Code` corrigió `tests/liquidacion-fidelidad.spec.ts` en
  1.409 ms y US$ 0,0023. Pareto medido sobre 1.151 transcripts: **editar código es 7,7 % de las llamadas y 1,1 %
  del contexto**; el 92 % es moverse por el repo y verificar. **Tres reparos**: (a) nunca corrió typecheck/lint/
  build —el sandbox le bloqueó provisionar `node_modules`—, así que su verificador está a medias; (b) abre una
  SEGUNDA puerta a HF que no pasa por `hf-inferencia.mjs`, contra la regla del incidente de la captura; (c)
  **`ORQ_HF_TOKEN` está VACÍO** en `~/.config/echegaray/orquestador.env` (el token sólo vive en
  `~/.cache/huggingface/token`) → hoy toda llamada del OS a HF muere antes de salir. Esto último aplica esté o no
  mergeado.
- P1 — Presentismo: **confirmar con el dueño** si la SUSPENSIÓN y el PERMISO deben hacer perder el presentismo.
  Hoy no lo hacen (suspensión figura como licencia; permiso sigue marcado `revisar` desde el 08/09).
- P1 — Sin commitear en el árbol principal: `.agents/`, `.claude/skills/ai-sdk`,
  `.claude/skills/migrate-ai-sdk-v6-to-v7`, `skills-lock.json` (de `npx skills add vercel/ai`). **El OS no usa el
  AI SDK de Vercel**: decidir si se commitean o se sacan.
- P2 — `npm run lint` tarda **2 min 24 s**, no 33 s (medido; no es por el plugin). El número de `CLAUDE.md` está
  viejo. Mientras se itera: `npx eslint <archivo>`.
- P2 — Deuda del sistema visual que el linter mide y **sólo puede bajar**: 202 `no-raw-colors` (20 archivos) ·
  111 `no-restyle` (90 son `<Num>` y `<Td>`) · 160 `no-arbitrary-values`. Tocarlos cambia píxeles: no se hace sin
  mirar la pantalla.
- P2 — console.error de WebSocket realtime tras revalidate · sin timer `_UOCRA_RAW`→`uocra_escala`.

## 6. ESTADO GIT

- Rama `main` = origin/main · HEAD **cd01ef5a** · Vercel Ready · `produccion/` con pull + `npm install` hechos.
- Worktrees de hoy eliminados salvo **`wt-dev-router`** (rama `feat/dev-router`, 5 commits, sin mergear).
- Sin commitear: lo de las skills de Vercel (ver P1) y `scratchpad/`.

## 7. PRÓXIMO PASO

Decidir sobre `feat/dev-router` (mergear con los tres reparos resueltos, o dejarlo). Antes que eso, arreglar
`ORQ_HF_TOKEN`, que rompe HF en producción hoy y es independiente de esa decisión.

## 8. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
