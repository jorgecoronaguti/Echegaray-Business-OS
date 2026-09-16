# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-16 ~14:40 (−03) · main = producción (2b8f288a) · **nada quedó abierto de esta sesión**_

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

## 5. PENDIENTES

**De la sesión del 16/09 no quedó nada abierto.** Lo que estaba en la lista se cerró así:

- **Development Router: MERGEADO** (3738222b). Se le corrieron las verificaciones que su agente no
  pudo: typecheck limpio, 205 tests verdes y **`npm run build` en verde** (el build fallaba sólo por
  el symlink de `node_modules` del worktree, no por el código). Y se resolvió la divergencia: el
  ejecutor **ya no tiene `fetch` propio a HF**, pasa por `lib/ml/hf-inferencia.mjs`. Para eso se
  clasificó el dominio `'codigo'` como INTERNAL en `politica.mjs` y el adapter aceptó `opciones`
  (`temperature`, `max_tokens`), mezcladas de modo que no puedan pisar `model` ni `messages`. El
  escaneo por fragmento de `revisarEgreso()` sigue corriendo ANTES: son dos controles que se suman.
  Test con mutación: devolver el `fetch` suelto → rojo.
- **`ORQ_HF_TOKEN` NO estaba vacío.** El informe del agente era falso y se repitió sin verificar.
  Probado contra la API: HTTP 200, usuario `jorgecoronaguti`, PRO activo, y el adapter lo lee por sus
  dos vías. **Lección: una afirmación de un subagente no es evidencia hasta que se mide el efecto.**
- **Presentismo, suspensión y permiso: las dos DESCUENTAN** (2b8f288a, decisión del dueño). Ojo con
  la suspensión: se guarda con estado `licencia` y igual pierde el premio — el motivo se evalúa ANTES
  que el estado, y hay un test con mutación que lo fija.
- **Skills de Vercel commiteadas** (cb3c53a2) a pedido del dueño. Corren con permisos completos del
  agente y hoy no tienen consumidor: el OS no usa el AI SDK.
- **Messina, los eCheqs: convertido en vigía automático** (c13c4945). `vigilar-echeqs-op.mjs` +
  `echegaray-vigilar-echeqs.timer` cada 30 min, **probado corriendo en producción**. Mira
  `_CHEQUES_RAW` y avisa por el bot cuando los cheques 6526 y 8767 aparezcan, con los dos pasos que
  siguen. Se calla cuando no hay novedad. La lista de esperados ES el pendiente: cuando se confirman,
  se borran de ahí.

**Lo único que sigue esperando un hecho externo:** que el Santander muestre los 2 eCheqs de la OP
5241. Cuando pase, el vigía avisa → regenerar «Cheques Recibidos» y pasar a Cobrado las filas 46, 47
y 65 de Cobranzas con la fecha de acreditación real. **No hay que acordarse de nada.**

**Deuda vieja, no de esta sesión:** 202 `no-raw-colors` (20 archivos) · 111 `no-restyle` (90 son
`<Num>` y `<Td>`) · 160 `no-arbitrary-values` — el linter las mide y **sólo pueden bajar**; tocarlas
cambia píxeles y no se hace sin mirar la pantalla. `npm run lint` tarda **2 min 24 s**, no 33 s
(medido; no es por el plugin): mientras se itera, `npx eslint <archivo>`. Sigue sin timer
`_UOCRA_RAW`→`uocra_escala` y el console.error de WebSocket realtime tras revalidate.

## 6. ESTADO GIT

- Rama `main` = origin/main · HEAD **cd01ef5a** · Vercel Ready · `produccion/` con pull + `npm install` hechos.
- Worktrees de hoy eliminados salvo **`wt-dev-router`** (rama `feat/dev-router`, 5 commits, sin mergear).
- Sin commitear: lo de las skills de Vercel (ver P1) y `scratchpad/`.

## 7. PRÓXIMO PASO

No hay uno heredado: la sesión cerró sin pendientes propios. Lo que sigue lo define el dueño.
Si se quiere seguir con el Development Router, el cuello de botella medido **no es el modelo** —Kimi
resolvió una tarea real en 1,4 s por US$ 0,0023— sino **provisionar `node_modules` en los worktrees**:
sin eso el verificador no puede correr typecheck, lint ni E2E, y el router sólo acepta tareas cuyo
contrato se verifique leyendo texto. Destrabar eso multiplica las categorías elegibles.

## 8. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
