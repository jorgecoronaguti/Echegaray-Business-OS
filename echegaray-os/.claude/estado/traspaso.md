# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: **2026-09-23 ~20:15 (−03)** · `origin/main` = **0e53c2ca**, producción al día._

**PUBLICADO HOY (ERP Obras, todo verificado por captura salvo lo marcado):** H1–H3 · cartera Tabla/Gantt
agrupada por cliente como el CRM, sin columna Cliente, sin pie, Tabla↔Gantt sin refresco · cabecera/Resumen/
Ítems/Z01 · Parte diario literal 06/M08 · Planilla 04c · Cronograma 05/C06 · Subcontratos, Personal, Dotación ·
Crear la estructura C01–C10/MC1–MC11 (migración 20260923T2630 aplicada; SIN captura revisada) · Operación
09/10/11/12 y Documentos 14 (SIN captura revisada) · menú de la cuenta: Entrar como (sesión real, auditada),
Seguridad 2FA TOTP, Notificaciones, Sesiones, enlace de acceso en Usuarios (migraciones T2600/2610/2620
aplicadas) · Ver como arreglado (POST + orden del middleware) · Herramientas: servicio técnico = proveedor.

**ABIERTO**
- Agente «fotos del parte diario» (tabla `obra_parte_adjunto` + bucket `partes-adjuntos`): cuando entregue,
  aplicar su migración, publicar, capturar `?vista=tareas&sub=parte` a 1440/390.
- Agente Documentos: 3 fallos de `geometria-obras.test.ts` (grilla de IndiceDocumentos en teléfono, marco de
  TabDocumentos, `group` del details de Vincular). Publicar cuando dé verde.
- Capturas pendientes de MIRAR (ya tomadas): `scratchpad/qa-ola2a/` (C01–C09 + menú) y `scratchpad/qa-op/`
  (Operación/Documentos). Mirarlas sin agente revisor.
- Decisión del dueño: obra «terminada» vs «archivada» (hoy `cerrada` hace las dos).
- Corralón: 3862 y 3428 sin cargar; saldo $2.568,20 desconocido.

**REGLAS APRENDIDAS HOY:** diseño dibujado manda sobre el texto del prompt · nada viejo en Obras, lo no dibujado
con la skill UI/UX · la página del servidor nunca llama funciones de un módulo `'use client'` (React #441) ·
antes de publicar la ficha de obra, capturar esa ruta · estado del layout se cambia por POST + router.refresh ·
ahorro: sin agentes nuevos, sin revisores de capturas, `/clear` entre frentes.

---

_Lo anterior:_

_actualizado: **2026-09-23 ~17:40 (−03)** · `origin/main` = **aadc86e8**, checkout de producción en aadc86e8 (daemons
reiniciados por `produccion-al-dia.mjs`). Rama `efectivo-a-rendir` rebasada sobre origin/main (sin commits pendientes)._

**ERP OBRAS · OLA 1 PUBLICADA (aadc86e8), capturas en curso.** Diseño partido por pantalla en
`/home/jorge/echegaray-design/erp-obras/<LABEL>.html` (1440) y `M<n>.html` (390). Tres agentes hicieron: A cabecera
+ nivel 3 + Resumen 03/M04 + Ítems 04/04b/M05 + Z01/MZ1 (f5463312, fc47fb0a, efd25ce3) · B Parte 06/M08 + Planilla 04c
+ Cronograma 05/M07/C06/MC7 (186631ee, f9bb7b7a, ea2b24d7; pg test erp-obras-parte-diario 4/4) · C Cartera 01/02 +
Nueva obra 02b + Subcontratos 07 + Personal 08 + Dotación 08b (5697ca34, bc94afbe, ec483600, d88c4832, ddba71e1).
Validado en el árbol completo: tsc 0 errores, eslint 0, node --test obras 740/740. **Sin evidencia visual todavía**:
capturas a 1440 y 390 contra producción con `scratchpad/cap-ola1.sh` (14 rutas, obra `quattropani`) → leerlas con un
agente contra los .html del diseño y corregir. **Desvíos declarados por los agentes (revisar con el dueño):** 06.html
trae el layout viejo y B implementó la especificación del prompt; rótulo de obra con código (regla 14/09); umbral de
atraso >10 d rojo (diseño incoherente); Z01 «terminada» vs «cerrada» (hoy `cerrada` ya archiva; separar exige tocar
actions/CamposObra); Sellar/Guardar fechas en la banda del cronograma y no en la cabecera; «Editar la obra» plegado en
el aside; Ítems sin Gantt lateral ni 6 KPI; gutter 30 px en A vs 20 px en B. **Ola 2 pendiente:** 09/M12 Impedimentos,
10/M13 Pedidos, 12/M15 Compras, 14/M17 Documentos, 11/11b/11c/M14 Equipos sobre features/herramientas, C01–C10 /
MC1–MC11 (C06/MC7 ya), H11 teléfono, H12 auditor de cierre (H2, H5, H8), traspaso final.

**HERRAMIENTAS · servicio técnico = proveedor (a360d67a, publicado):** migración 20260923T2400 aplicada (rubro
«Servicio técnico», `ubicacion.proveedor_id`, `ubicacion_de_proveedor`, `crear_ubicacion` sólo terceros, semilla «sin
identificar» archivada); elector compartido en Ubicaciones → Nueva y Mover → «Servicio técnico…»; «Planilla» sólo en
obra/taller/rodado. Pendiente: que «Enviar a reparación externa» (Ficha) pregunte a qué servicio técnico va; captura
de Ubicaciones a 1440 en la misma tanda.

**CORRALÓN PROGRESO:** recibo 0010-78 (23/09) cuadra 5/6 con Compras; 3862 ($13.195,02) y 3428 ($56.220) pagadas
pero SIN CARGAR (Ariel las entrega en mano); saldo que informa el proveedor $2.568,20 DESCONOCIDO. Recibos 10-78 y
10-46 guardados en la carpeta del proveedor (proveedor_documento). Avisado por bot.

---

_Lo anterior (14:10):_

_actualizado: **2026-09-23 ~14:10 (−03)** · `origin/main` = **f554f3ac** (+ este traspaso), checkout de producción en f554f3ac
(daemons reiniciados por `produccion-al-dia.mjs`)._

**MOBILE POR NIVEL (dueño 13:00: «hace todas las vistas mobile · por nivel de usuario»), publicado:** barra de
abajo por rol en `(main)` y `/campo` (`barraTelefono.ts` + test, `BarraTelefono.tsx`), header sin solapas bajo `md`,
`CTRL` 48 px, solapas de ficha corribles (`v2/BarraCorrible`); tres agentes dejaron a 390 Administración,
Clientes/Presupuestos/Base maestra, Obras/Herramientas (sus informes: rutas y qué se ve, en el transcript). Mapa
sección f. **QA visual: `next dev` NO respondió en la VM (25 min compilando)**; se apagó y las capturas van
contra producción con `zzz-qa390.mjs` (sesión del dueño por enlace mágico, sólo lectura) — HECHO: 22 capturas contra producción
(qa-390 del scratchpad), ninguna se corre de costado; corregidos presupuesto/ficha persona/Pendientes/filtros de Compras
(f554f3ac, recapturado OK). «QA PRUEBA — no usar» (COT-2026-003) BORRADO entero con permiso del dueño (triggers de cotizaciones/cotizacion_partida apagados sólo en la transacción; verificados activos). Material: «Borrar» en las dos caras (borrado lógico `borrado_en`, RPC `borrar_pedido_material`, policy de lectura lo excluye, migración 20260923T2200 aplicada y probada con rollback). Clientes en el teléfono: sin línea Mat./Sub./MO ni OC por obra, una cifra por fila, nombre entero, sin subtítulo (dueño: «infinitos números»; 4 capturas leídas por agente porque esta sesión ya no admite imágenes). Cheques físicos 329/330 de Corralón CONFIRMADOS por foto (330 ya no es inferido), foto atada a las 7 filas del recibo, registro = base.

**ERP OBRAS (dueño 15:30: «implementar el diseño completo, fidelidad 100 % UX/UI»)**: el prompt está en el transcript; los CINCO .dc.html («ERP Obras · Todas las pantallas / Mobile / Crear la estructura / De cero al final» y «Herramientas · el módulo entero») NO están en disco ni en el chat: pedidos al dueño por bot (dejar en /home/jorge/echegaray-design/). Hecho sin ellos: **H1** navegación (63ad4644: Clima fuera de Operación con alias a Impedimentos, árbol «Ítems», Economía ya estaba fuera) y **H2** modelo de datos (cfb8ea3e: migraciones 20260923T2300/T2310/T2320/T2330 APLICADAS — costo_mo por historia + obra_historia_peso/obra_avance_ponderado, obra_ejecucion.fraccion/declarada + obra_ejecucion_persona + activo_id en equipo + vistas parte_tarea/actividad_partes_resumen + función planilla_obra + vista obra_dias_habiles, insumos con activo_id/pedido_id; test orquestador/lib/erp-obras-h2.pg.test.mjs 5/5). Desvíos declarados: no se creó `parte_tarea` como tabla (obra_ejecucion ya lo es); días hábiles en vista aparte, no dentro de obra_panel; `?vista=economia` sigue yendo a /administracion/obras (la ficha del cliente no tiene vista economía). H3 en adelante esperan los .dc.html. Corralón cerrado en Compras (7 filas Pagado, pendiente $0,
cheque 330 número INFERIDO). Material sin columna Origen.

**HECHO 23/09 (mañana), todo publicado:** el canal #efectivo lee la entrega como se escribe (53 frases
medidas) y entiende la respuesta a su pregunta · anular/borrar/descartar desde la app encola «Estado =
Cancelado» en la fila de Compras (migración 20260923T1400 aplicada; el worker de la cola la escribe) ·
los daemons se reinician solos al publicar (`produccion-al-dia.mjs`; chequeo `servicios-al-dia.mjs`) ·
Economía salió de Obras → `/administracion/obras/<obra>` · migración de GRANT para el 30/10 escrita, SIN
aplicar (el dueño pidió no correr migraciones remotas en esa tarea) · extracto Santander al 23/09 cargado
(saldo $36.505.852) y echeqs emitidos sincronizados (385 nuevo, 375/376 debitados) · personas y usuarios
de prueba BORRADOS de la base viva (regla nueva: nunca datos de prueba en app.ecsas.com.ar).

**Auditoría externa (hitos):** 1 descartado por el dueño y luego ejecutado a su pedido como «saca economía
de las obras» · 2, 3, 6 hechos · 4 y 5 son planes en `docs/engineering/PLAN-*.md`.

**Herramientas (publicado b64192a3, migraciones 20260923T1500/T1510 aplicadas):** foto desde el celular
arreglada (subía dentro de la Server Action), paridad celular/PC, códigos por unidad y ficha de revisión
técnica en Mantenimiento. Sin QA en navegador ni foto real subida: lo prueba el dueño.

**Tarde del 23/09, también publicado:** reorganización de la navegación según el mapa (sección e de
`docs/engineering/MAPA-DE-PANTALLAS.md`; dudas resueltas por mí con el «hacelo» del dueño; SIN QA en
navegador; 6 specs de Playwright siguen el redirect de /campo/asistencia) · chat #efectivo registra sin
«para qué» · aviso de firma por mensaje directo · registro de cheques deduce el N° de comprobante (385 →
0006-00008111 + 0006-00008199) · cheque 329 agregado como físico sin beneficiario · GRANT 20260923T2000
aplicada · direccion-test bloqueada (no borrable: tiene comprobantes) · Arcor e-Cup: FCE 0001-00000054 ENVIADA por el dueño, vence 20/11/2026; falta el N° de transacción y
falta la fila en Cobranzas (esperando su «cargala») · Herramientas: paridad teléfono↔PC publicada (845956e2); en el teléfono
Herramientas redirige a /campo/herramientas (c71f4713, `?pc=1` para la de escritorio); recuento físico del
lugar en construcción (agente, migración 20260923T1700 sin aplicar) · firmas visibles en la ficha de la
entrega (e2467168) · Corralón: eCheq 386/387 cargados (base + registro con N° comprobante), 5 filas de Compras Pagado y PDF
atados; quedan 7 filas del recibo ($636.461,86) hasta decidir el cheque del 21/10; borrador a Ariel como
respuesta en el hilo (r-6669080881674116612) · Sersolin: eCheq 388 → fila 922 Pagado, PDF atado · Robles: 859 y 926 Pagado con echeq 385 (leído de
vuelta) · Arcor: FCE 54 cargada en Cobranzas (ID 99) · avisos: anulación→persona, firma→dueño (T1800/T1810
aplicadas) · admin en teléfono entra por /campo · Documentos y Fuentes fuera de la barra · Material dentro
de Herramientas PUBLICADO (9aac89ea, migración T1900 aplicada; sin QA en navegador; 3 specs e2e
apuntan a la URL vieja de Pedidos) · bucket herramientas sigue con 0 fotos.

**ROTO a sabiendas:** los e2e que usaban `qa.campo@` / `[PRUEBA E2E] QA Campo` (8 specs) no tienen
fixture; hay que hacerlos crear y borrar sus datos, no sembrar producción.

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
