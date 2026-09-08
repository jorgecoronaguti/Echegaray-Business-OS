# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-08 19:20 · main `93e78aa4` = checkout de producción; Vercel al día_

## 00. TARDE-NOCHE 08/09 — PUBLICADO (main 1c51a7f3) y LO QUE SIGUE ABIERTO

**Publicado y verificado en producción con navegador (capturas `qa-shots/verif-*`)**
- Presencia móvil = Está / No vino / Licencia (tabla `asistencia_dia`, migración T1900 aplicada; los jefes marcan a los
  demás, no a sí mismos; contador por obra deduplicado). «Cargar horas del día →» aparte.
- Regla E: PRESENCIA NUNCA se deduce de horas (`clasificar()` → `presencia` + `horas` separados). Plantel HOY dice sólo
  presencia; Asistencia grilla: número al eje, ancho 100 %, A/L centradas, hoy sin punteado, totales sin rojo.
- Ausencia/licencia SIN OBRA (migraciones T2000 + T2100 aplicadas: CHECK + policies con `marca_ausencia_de`; el jefe sólo
  a quien tenga asignación vigente a la fecha). Panel «corregir»: «Horas que corresponden» (se reconocen a la persona,
  suman a su total, a ninguna obra); celda A/L con horas debajo, fija. `guardarJornada` también escribe sin obra.
- Plan de obra a futuro: «programar cambio» bajo el desplegable → panel lateral (tramos, Mañana/Lunes/fecha, Hasta,
  cancelar); `obra_asignacion` con `desde` futuro; ficha «Programado»; un solo «está acá», «cierra hoy».
- Anotaciones en ficha (`persona_nota`, T1700 aplicada). Clientes: Contratado · Costo MO · Costo mat. · Margen desde OBRAS
  (`obra_economia_sheet` T1800 + `obras-economia-sync.mjs` en el pipeline). Compras app: columna «A pagar» (= col. Q Sheet).
- Navegación sin recarga (9 anclas crudas → Link; invariante). Compras NO tarda 120 s (instrumento; prod 2,1 s doc).
- Comprobantes: 83 archivos/14 días conciliados; vínculo perdido (`do nothing`) corregido + 10 revinculados; claves c:/p:
  conciliadas por número; espejo `compra_sheet` INMEDIATO tras cada carga (worker → `systemctl start compras-sync`), timer
  10 min, sync 100 s → 3 s con lock; «ya_cargados» no reabre fajo; ilegibles se preguntan una vez. sync-compras en
  transacción real (`withTx`). Accesos: rodrigo/hys/ingenieria con clave `test123` (pedido del dueño, por bot).
- Persona de prueba REAL: `e2e00000-0000-4000-8000-000000000001` («[PRUEBA E2E] QA Campo»), obra `prueba-e2e`,
  `obra_asignacion.obra_id`. Los ids `…e2e1/e2e2` NO existen.

**Publicado después de las 17:25 (main hasta df1b3c55)**
- Licencia/ausencia por TRAMO («Hasta»: sólo este día / resto de la semana / fecha; sin domingos; futuro incluido; cada día
  con `jornadaPorDefecto`). Panel recalcula «Horas que corresponden» al cambiar de día; chips = `SegmentedControl`.
- `jornadaPorDefecto(fecha)`: 9 h L–J, 8 h V, null S/D (única definición). Presente desde el celular CARGA la jornada
  (`fuente_legacy='web:presencia-defecto'`; «No vino» la retira; una carga a mano no se pisa). Cabecera del día la anuncia.
- Grilla angosta: Persona sticky + sombra de scroll. Compras: orden por CARGA (`fila` desc), chip «Recién cargados 30»,
  aviso «mostrando 200 de N · ver todas» arriba.
- Datos: obra por persona/día asentada según pestaña `ASISTENCIA` (gid 1770179062) → 152 filas `registros_hh` corregidas
  (sólo obra), asignaciones recalculadas; importador `asistencia-obra-por-dia.mjs` + timer `echegaray-asistencia-obra`
  cada 6 h + invariante `invariantes-asignaciones.mjs` (1 rojo: GONZALEZ TOBARES vigente en la-estrella → decisión dueño).
  Ex empleados Aguirre/Ahumada/Bronia Jofre cerrados al egreso. JORNALES rotula la QUINCENA, ASISTENCIA el DÍA.
- Comprobantes: espejo inmediato instalado (timer 10 min); fajo Movistar descartado; ilegibles se preguntan una vez.
  Los 14 de 07–08/09 están en la app (verificado); el «faltan» era el orden por fecha.
- Messina OP 5146/5156: PDFs en Drive, 8 eCHEQ en `public.cheques` → `_CHEQUES_RAW` regenerada, Cobranzas!N68/O68/Q68/Y68.
  Pendiente dueño: aceptar 6 eCHEQ en Santander; certificado ret. OP 5146 ($248.878,26); $38.462,45 «a cuenta».
- Accesos: rodrigo/hys/ingenieria → `test123` (pedido del dueño).

- 19:20 · Cargar horas desde la app DECLARA presencia (`asistencia_dia.origen` horas/declarada, migración T2300
  aplicada; backfill de hoy hecho). Liquidación: ausencia sin motivo = 0 h, con motivo que paga = jornada, un día
  nunca suma dos veces (`liquidacionDeAusencias.ts`; migración T2400 aplicada). Ejes de fila 1440/2000 verdes;
  `<alpha-value>` en tailwind (18 componentes cambian de aspecto: pendiente barrido visual). Un deploy de Vercel
  falló por un symlink `node_modules` commiteado en la raíz → retirado e ignorado (c1e86005). Memoria:
  `liquidacion-ausencias-y-jornada-por-defecto`.

**Agentes en curso al cortar**: `fix/compras-390-scroll-propio` (tabla de Compras con scroll propio en el celular) · barrido visual qa tras opacidad (cargar horas desde la app declara presencia; migración
`20260908T2300_asistencia_dia_origen.sql` a aplicar con GRANT de columna) · `fix/ejes-fila-y-opacidad` (2 rojos de
`_ux-grilla-asistencia` 1440/2000 + `<alpha-value>` en tailwind).

**Agentes en curso al cortar (ramas sin mergear → mergear desde el checkout principal, typecheck, tests, push, ff prod)**
- `feat/ausencia-por-tramo` (licencia/ausencia varios días con «Hasta», sin domingos, futuro incluido).
- `feat/jornada-por-defecto` (9 h L–J, 8 h V al dar presente; `jornadaPorDefecto.ts` idéntico en ambas ramas).
- Datos: asentar obra por persona según planilla del dueño (Sheet asistencia gid 1770179062): los días 01–07/09 de 7
  personas están en `la-estrella` por rótulo JORNALES ambiguo; corrige `registros_hh.obra_canonica_id` (no horas),
  asignaciones y alias.

**Decisiones del dueño pendientes**: Quiroga Alexander licencias 2026 sin horas (¿9 h?); jornada legal por categoría
(hoy 9/8 por día); canal Oficina (¿carga comprobantes o avisa?); filas 863/924 nombre distinto (Egger / MASS);
2 filas Movistar 03/09 descartadas; Pastrán 2 vigentes; Maldonado 37 días sin registro. UX menor: grilla en 390 px
sin columna Persona fija ni indicio de scroll.

## 0. LO QUE PASÓ HOY (08/09) — PUBLICADO (main = 9ce5c721 o posterior)

- **Asistencia (app)**: grilla por QUINCENA, una fila por persona, «Obra actual» (obra activa o cliente, nunca
  slug), panel lateral (Drawer) que queda abierto tras guardar; carga MÓVIL desde Administración (decisión
  servidor por `sec-ch-ua-mobile`/UA, `?modo=dia|quincena`; `FormAsistencia` MOVIDO a
  `features/administracion/components/asistencia/`); atajo «Cargar asistencia» en menú del avatar. Ficha de la
  persona: Resumen por quincena (franja de días + 4 cifras + últimas 6 quincenas), bloque «Obras en las que
  trabajó» (cerradas incluidas, fuente `registros_hh`), Horas por quincena. Todo auditado (firmas con límites:
  sin iPhone real; `getHHDePersona` sin paginar → techo 1.000 filas; `page.tsx` personas 557 líneas).
- **JORNALES 2026 → `registros_hh`** (`fuente_legacy='sheet:jornales'`, 3.440 filas, 36 personas; importador
  en main; sólo fechas ≤ hoy; alias con cliente). FALTA_DATO: Pablo Ramos, Alex Videla, J.L. Balmaceda, Hugo
  Barrera (sin legajo ni carpeta en Drive); 3 conflictos app vs planilla (Aguero 19/08, 21/08; Alaniz 20/08).
- **Login unificado**: `inicioDeRol` = `destinoDeLaHome` (jefe → /administracion); `volver` blindado; cliente intacto.
- **Sheet**: F931 ago REAL 07/09 $8.331.697,69 (era $6,5M tipeado); Compras: 28 filas Cancelado (salen por
  Jornales/Cargas), f483 Pagado; extracto 08/09 y 18 echeq cargados (Machuca/Femenia/Dupec 366 cruzados);
  banco cierra de punta a punta ($4.362.486 al 08/09). JORNALES K = SUM(AB) (costo real, no efectivo): nómina
  obrera real $15–17M/mes, quincena proyectada ~$7,5M (era $3,3M) → cierre CF Mensual $104,1M (era $122,3M).
  Doble conteo jornales: NO (verificado 4 quincenas); A7 «efectivo sin explicar» corregido (−22,6M doble) →
  −$123M = FALTA_DATO del dueño (efectivo sin fuente). Botones mes/semana actual con hyperlink; CAJA 68 filas
  + verificador en pipeline.
- **Asistencia — tarde 08/09, TODO PUBLICADO** (main ≥ b5022fac; smoke prod 15/15 lecturas): sin domingos (13
  columnas; `diasDeLaQuincenaSinDomingos`; la ventana a la base sigue siendo la quincena entera), personas con sólo
  licencia visibles («L», no editable inline), «Obra actual» con `<select>` sólo direccion/administracion
  (`planDeObraActual.ts` + `obraActualActions.ts`: cierra hasta=ayer, abre desde=hoy; jefe_obra NO aunque la RLS lo
  permita — la puerta es la acción; test del núcleo en curso rama `test/puerta-obra-actual`), corrección inline en
  obra cerrada permitida para registros existentes, «categoría · oficio» bajo el nombre (`notaDe` + test), 7
  categorías actualizadas desde recibos 2ª Q 08/2026 (rastro en `personas.notas`; 4 bajan vs planilla del dueño;
  Castillo Benítez sin recibo). Diagnóstico de asignación: `docs/engineering/UX_ASIGNACION_DE_PERSONAL.md`.
  Límites firmados: E2E 09 se saltea si Quiroga deja de tener licencias; `asignacion-390.png` es esqueleto (08b sin
  aserción); `getHHDePersona` sin paginar (techo 1.000); `page.tsx` personas 557 líneas.
- **Tarde 08/09, publicado (main ≥ 0ade7fe0)**: Plantel con Legajo y Alta (sin «Papeles»; GRANT legajo);
  categorías/altas según planilla del dueño (8 UPDATE; regla: planilla > recibo); historial de obras desde JORNALES
  (106 asignaciones; Oficina 26 imputa jefes a «JAVIER SANCHEZ» → FALTA_DATO del dueño: Maldonado/Nievas/Galván;
  rótulos ambiguos al nivel cliente); jefe_obra puede mover gente (`puedeCambiarObraActual`); horas de un día NO
  exigen asignación ese día; cambiar de obra cierra TODAS las abiertas y lee sólo `hasta is null` (causa del «0
  vigentes»); obra cerrada en desplegable como opción deshabilitada; jefes separados de obreros (criterio
  `personas.puesto='JEFE DE OBRA'`, migración `es_jefe_de_obra` escrita NO aplicada); «Lo que pide trabajo»
  retirado (queda campanita); Compras app sólo obra/taller (`esCompraDeObra`, 927→803); espejo de documentos de
  legajo recursivo + timer `echegaray-espejo-legajos` cada 6 h (963 archivos/74 carpetas); Sheet Compras: 28 filas
  retiradas a `_COMPRAS_RETIRADAS` (libro/CF idénticos); Pisos 120+Rampa con costo desde Análisis del xlsm.
  E2E de ESCRITURA no se corren mientras el dueño trabaja; fixtures con persona `es_prueba` (`e2e0000…e2e1/e2e2`).
- **EN CURSO al cerrar**: «Traer a alguien a esta obra» en móvil (rama `feat/jefe-mueve-gente`); «En obra ahora»
  fichaje ≠ horas (rama `fix/en-obra-fichaje-vs-horas`). Decisiones del dueño pendientes: FCL julio $800k pagado?;
  índice «una persona una abierta» (Pastrán 2 vigentes); obras de jefes y rótulos JORNALES; Colegio de Ingenieros
  rubro; 3 conflictos app vs planilla. (rama `fix/correccion-obra-cerrada`); materiales de
  OBRAS repartidos en el plazo y netos de compras, SIN emitir MO (ya en jornales); costos MA/MO faltantes
  desde Drive (`obras-datos.mjs`). Los 17 ítems de `obra_egreso_proyectado` con fecha 01/10 NO van como bulto.

- **Compras — retiro de las 28 Canceladas (08/09 tarde, orden del dueño)**: archivadas en `_COMPRAS_RETIRADAS`
  (oculta; fila completa + Fila original · Motivo · Cubierta por · Retirada el; 28 filas, $87.300.000 nominales) y
  BORRADAS de Compras (955 → 927; IDs corridos, `ID = ROW()-4`). Script `scripts/compras-retirar-canceladas.mjs`
  (dry por defecto, `--aplicar`; salta la guarda con `yaGuardado` sólo ahí). Verificado: libro 1.232 / $30.345.779
  idéntico fila por fila; Mensual/Semanal/CAJA idénticos celda a celda; 0 pares fecha+importe en dos orígenes desde
  01/08; `compra_sheet` 927 filas y `compra_adjunto.fila_compras` realineado por clave (110). Quedan en Compras y
  POR QUÉ: préstamo camioneta cuotas 24–26 (ningún generador proyecta el préstamo → FALTA_DATO/rediseño), SAC dic
  (hueco declarado del libro: sólo entra por Compras), plan W303094 c2/c3 (el extractor de Cargas lee el plan DESDE
  Compras), FCL jul/ago + SINDICATOS ago (la cadena de Cargas arranca en el mes de caja 10/2026), todo lo Pagado
  histórico de Cargas/Gremiales/Impuestos/Financiero/SAC/Planes (única fuente de la historia en el libro), y las
  ~45 filas Pagado de Jornales/Sueldos admin (el libro ya no las cuenta, pero `direccion-retiros` lee 807–809 por
  nombre y el efectivo de CAJA lee Pagado+Efectivo sin `factorSinPlanilla`): segunda tanda sólo después de mover esas
  dos fuentes. FCL Julio f468→440: vencido 10/08 y sigue «Vigente» — el dueño confirma si se pagó.

## 0.1 ABIERTO / DECISIONES DEL DUEÑO PENDIENTES

- **Dupec** (Compras 912/913, $412.600, 26–27/08): no hay cheque a DUBOS/DUPEC posterior al 372 en
  Cheques Emitidos ni débito en el banco al 07/09. El dueño insiste en que se pagó con un eCheq a
  Dubos: falta que lo cargue o diga nro/importe (o aplicar contra el 302 de $3,5M).
- **Tensión OBRAS vs plantel**: OBRAS pide ~$32M/mes de MO, el plantel paga $7–9M/mes.
- Portal: duplicados de Quattropani / La Estrella / Messina (15 líneas congeladas) — decisión del dueño.
- Pasos del pipeline en rojo desde antes de hoy: `proveedores-que-sale-cada-dia.mjs` ($171.314 sin
  columna de medio), `cheques-cobertura-sheet.mjs`, `formato-pestanas.mjs` (9 pestañas fuera de estándar).
- **Asistencia por obra — PUBLICADA 08/09** (`adddadde` en main y origin; Vercel desplegó). v1 revertida
  (e067fcbd) por 8 hallazgos; v2 firmada por auditor-de-cierre tras 2 vueltas. 7/7 E2E con escritura sobre
  obra propia `zz-e2e-asistencia` (la causa del fallo previo era el escenario: elegía una persona ficticia
  `e2e00000-…` sin legajo); smoke en producción 4/4 lectura. Motivos en `registros_hh.notas` (16 de
  `asistencia-motivos.mjs`). Declarado y NO bloqueante: escritura no atómica (sin RPC), RLS `registros_hh`
  using(true) preexistente, aviso «otra obra» suma ausencias. Falta E2E de «Sacar lo cargado» con filas
  protegidas contra Postgres (evidencia de regla sí, de efecto no). Capturas en `qa-shots/asistencia-*`.
  Dato residual en la base: persona ficticia `e2e00000-0000-4000-8000-000000000001` con asignación abierta
  — resto de otro E2E, no borrado (verificar de quién es antes de tocar).
- Cobranzas: calendario SF movido a viernes alternos con Quattropani (18/09, 02/10, 16/10, 30/10, 13/11);
  portal SF sincronizado. Quattropani ve 9 líneas USD congeladas (cobranza_fila NULL); las de pesos
  78–86 siguen OCULTAS — decisión del dueño.
- **Trampa que mordió dos veces hoy**: el checkout de producción atrasado PISA el Sheet. Después de
  cada cambio de generador: `git merge --ff-only origin/main` en `~/echegaray-os/produccion/echegaray-os`.

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS. Prueba definitiva: Jorge puede cerrar Claude Code, entrar a
/xsas y hacer su trabajo diario.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · **minimalismo extremo en el Sheet: sin aclaraciones
  ni explicaciones de nada** (deroga «la nota al lado»)
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- **Un control que impide corregir un defecto lo vuelve eterno**
- **Ningún hallazgo se reporta sin mirar la celda real** — cuatro falsos ya costaron caro

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: gateway XSAS (`servidor-entrante.mjs`, unit `echegaray-xsas-gateway`, sirve
app.ecsas.com.ar/xsas) · orquestador (`orquestador/lib|scripts|comunicacion`) · Sheet «Flujo de
Caja - Cash Flow» regenerado por pipeline (`flujo-caja-rehacer-todo.mjs`, timer cada 2 h) ·
Supabase como fuente única · web por Vercel desde `main` · bot @os en Mattermost.

**Deploy backend = push a origin main + `git merge --ff-only origin/main` en
`~/echegaray-os/produccion/echegaray-os` + `systemctl --user restart` de los 3 units.** Producción
es OTRO checkout: pushear actualiza Vercel pero NO ese árbol, y el timer corre desde ahí.
**Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **El contrato de minimalismo del Sheet se aplica en el CAMINO DE ESCRITURA, no a mano.**
  `lib/podar-prosa.mjs` poda la grilla GENERADA (nunca la fusionada) en los dos cuellos que comparten
  los generadores: `escribirPreservando` y `conEdicionesRespetadas`. Un canario
  (`podar-prosa-cobertura.test.mjs`) impide que un generador nuevo escriba una pestaña del contrato
  por un camino sin podar. Tres reglas que los tests fijan: se poda lo generado · se poda al
  CENTINELA (`''` significa «no es mi celda», dejaría la prosa intacta) · el encabezado sólo se toca
  cuando la grilla es la pestaña entera.
- **Para lo escrito ANTES de que existiera la huella**: `scripts/reclamar-parrafos-huerfanos.mjs` usa
  `lib/autoria-por-historial.mjs` (`git log -S`) como prueba de autoría, y escribe con `MIA_PROBADA`
  —no con `VACIO`, que la huella sólo obedece si puede probar la propiedad—. Lo que no se puede
  probar queda intacto.
- **Contrato de diseño medido contra el archivo: 104 → 17 desvíos · 7 de 15 pestañas conformes**
  (Tarjeta, Cargas Sociales, Impuestos y Financieros, Recurrentes, Cash Flow Semanal, Calendario de
  Cobros, SUBCONTRATISTAS, Plantel). `node orquestador/scripts/auditar-diseno-unificado.mjs`.
- **Pestañas INTOCABLES por decisión del dueño**: Compras · Cobranzas · CAJA · Cheques Emitidos ·
  Cheques Recibidos. Declaradas en `EXCLUIDAS` de `lib/diseno-unificado.mjs` con su motivo textual.
  Excepción vigente: los GRÁFICOS de CAJA sí se tocan (pedido explícito del 06/09).
- **CAJA y Proveedores quedaron reparadas hoy y verificadas leyendo la hoja viva.** Gráficos en las
  filas 23/38/53 (`caja-graficos-verificar.mjs` da ✓) y `Proveedores ✓ en estándar`.
- **Trampa nueva y cara: las huellas de FORMATO de un layout que ya no existe frenan la piel para
  siempre.** `scripts/olvidar-huella-de-formato.mjs <pestaña> [--todas] --aplicar` las borra. **El
  orden importa**: olvidar → `formato-pestanas.mjs` (ve la pestaña virgen, aplica y siembra) → el
  generador de la pestaña. Al revés el generador siembra primero y el formateador ya no la ve virgen.
- **HF en producción, no en shadow**: Qwen3-4B es el proveedor #1 por volumen (28/28 ok en 4 días,
  contra 21 de Haiku) en `rutear` y `completar-argumentos`. La decisión del dueño sobre visión
  —dejar de mandar `detalle` e `indeterminado` a Opus— está aplicada, reversible entera con
  `XSAS_MIRAR_TODAS_LAS_REGIONES=1`.
- CRM admin: 155 tests canónicos contra `crmadmin.zip` en verde. Papeles del proveedor en el panel.
- Firma por pestaña (ORQ_AUTOCANDADO) sigue APAGADA a propósito. Timer activo — verificarlo, no asumirlo.

## 5. TRABAJO DE ESTA SESIÓN (07/09 tarde)

Siete pedidos del dueño en ráfaga. Lo que quedó:

1. **Extracto bancario cargado** (`importar-banco.mjs --sheet`). 3 movimientos nuevos; `_BANCO_RAW`
   en 556, corte 07/09, saldo **$14.066.088,84** = el declarado por el banco, leído del destino. La
   cadena completa mejoró: el agujero bajó de $455.082,14 a **$45.080,00**.
2. **El botón «ir al día» volvió a A3 de las dos vistas del Cash Flow** (`cc8ee0b8`). Lo había
   borrado `podarProsa`, que vaciaba la fila 3 ENTERA para el aire que pide `sin-respiro`. La
   excepción se define UNA vez —`esAtajoDelPeriodo` en `diseno-unificado.mjs`— y la usan el podador
   y el auditor. Reconoce las dos formas: `=HYPERLINK(…)` del generador y el rótulo ya resuelto al
   medir el archivo. Los dos tests gemelos esperaban '3 · sin-respiro' como desvío; ahora esperan
   CERO y exigen el HYPERLINK, para que un cero conseguido borrando el botón no pase.
3. **Dos facturas de honorarios del mail → Compras** (filas 951–952, verificadas sin #ERROR):
   Robles Jose Maria FC 00001-00000211 $696.502,61 y MASS CONSULTORA FC 00001-00000067 $250.000.
   Fecha prevista de pago **11/09/2026** escrita con bisturí en Q951:R952 (Q es VALOR en esta
   pestaña, no fórmula: el copyPaste del cargador les deja el texto «Pendiente»).
   D'Amico NO era proveedor nuevo: ya existía como MASS CONSULTORA, su razón social.
4. **Filtros de admin** (`61bb1a6b`). Compras: 10 criterios combinables en `comprasFiltros.ts` (puro,
   12 tests) que conviven con los chips —el chip decide la población, los criterios la recortan—.
   Proveedores: rubro (con `rubroDe`, porque ninguno tiene rubro DECLARADO y 18 lo tienen deducido)
   y deuda, que ahora es un concepto del OS: vista `proveedor_deuda`, aplicada y verificada.
5. **`compra_sheet` sincronizada** (949 filas). El timer `echegaray-compras-sync` ya corre cada hora.

## 5.b LO QUE PASÓ DESPUÉS (07/09, segunda tanda)

6. **ARCA descongelado.** No hacía falta un token nuevo: `scripts/arca/credentials/afipsdk-token.txt`
   existía en el árbol de desarrollo y NUNCA se copió a producción, que es de donde corre el
   servicio (los credenciales no viajan por git, y está bien). Copiado + corrida con
   `ORQ_AFIPSDK_RESERVA=0` porque el plan free tenía 8 de 10 usadas y las 2 últimas están reservadas
   para el dueño — él pidió correrlo. **Compras 653 → 737, hasta el 04/09** (venía del 21/08).
   **Queda SIN CUOTA hasta el 10/09.**
7. **Jornales por Quincena reparada.** La columna «Obreros» (D) del calendario estaba vacía en 6 de 8
   quincenas: por eso Cargas Sociales proyectaba $31.746 para octubre con 25 empleados. Repuesta con
   las fórmulas del generador (volcadas con `ORQ_VOLCAR_GRILLA`, no de la huella — que trunca a 300
   caracteres y en el primer intento dejó 6 celdas en #ERROR!). Las fechas de las filas 45-46 eran un
   problema de FORMATO, no de dato: seriales con formato de moneda. **Obreros proyectado
   $4.770.955 → $19.400.639; costo laboral del año $64,9M → $80.487.869.**
8. **`nomina-pestana.mjs` fuera del pipeline** (`PASOS_RETIRADOS`) y **timer del Flujo de Caja
   DETENIDO**. Corría cada 2 h desde el 01/09 pisando la columna «EFECTIVO redondeado» del dueño.
9. **El F931 de agosto entró** ($8.331.698, 25 empleados) y **su pago también** (referencia 49815776,
   $8.331.697,69 del 07/09, leído del comprobante en Drive).
10. **Comprobantes: 52 → 101 compras con foto.** El backfill del canal encontró 62 archivos nunca
    bajados; 54 vincularon por registro. Quedan 168 archivos para 707 compras — **lo que falta no
    existe**: julio (100) y junio (102) son los meses más vacíos.

## 6. PENDIENTES REALES

**P0 — decisión del dueño, no arranca solo**
- **EL TIMER DEL FLUJO DE CAJA ESTÁ DETENIDO.** Se paró el 07/09 porque el pipeline corría
  `nomina-pestana.mjs`, prohibido desde el 01/09. Ese paso ya salió (`PASOS_RETIRADOS`), pero
  **producción todavía no tiene ese commit**: encender el timer antes de desplegar es volver a
  pisar la columna del dueño. Orden: desplegar → verificar → `systemctl --user start
  echegaray-flujo-caja.timer`.
- **Los 3 «EFECTIVO redondeado» perdidos** (Aguero, Castillo, Alaniz en «Nómina»). No están en
  ninguna revisión recuperable — la única que Drive conserva ya los tenía rotos. Sólo el dueño
  los tiene.
- **AfipSDK sin cuota hasta el 10/09** (plan free, 10 automatizaciones por ventana).
- **El cheque ECHEQ 277 a «DUBOS UGARTE PEDRO LUIS RAUL» ($1.002.330,73, FA 03-000242, emitido
  4/12/2025, vence 22/01/2026).** El dueño pidió darle tratamiento en Compras. NO se cargó, y el
  motivo es dato, no pereza: DUBOS = DUPEC está PROBADO (mismo CUIT 20-28773782-4 en las 4 filas de
  Cheques Emitidos), pero ese CUIT sólo emite desde los puntos de venta **11 y 9** en ARCA — nunca 03
  —, no hay ninguna compra de ese importe en la pestaña, y la factura sería de 2025, fuera del
  ejercicio que cubren Compras y el Libro IVA. Falta la factura o el número correcto.
- **$14.294.688,31 de deuda SIN ACREEDOR en el maestro.** La pestaña declara $19.164.815,70 de saldo
  vivo; `proveedor_deuda` llega a $4.870.127,39. La diferencia son cuatro textos no vinculados:
  PEDRO TELLO $8,65M (4) · Pedro Fredes $5,2M (5) · Sersolin SAS $376.890,80 · RSV $67.797,51. Se
  arregla vinculándolos en la cola de resolución de nombres.
- **¿La base del IVA va por «Fecha de Factura» (col P) o «Fecha de Venta» (col C)?** La base
  declarada de las DDJJ de marzo ($78.349.586,76) y mayo ($20.000.000) coincide AL CENTAVO con la
  columna C, no con la P. Hoy se usa P. Si la respuesta es C, cambia una sola constante
  (`VENTA.fecha` en `lib/impuestos-base-libro.mjs`).
- **DDJJ de IVA de agosto SIN PRESENTAR**, vencía el 20/08.
- Los 31 párrafos que el bisturí dejó intactos (no se pudo probar autoría): si alguno es residuo mío
  y no del dueño, hay que señalarlo para sacarlo.

**P1 — técnicos**
- **Push pendiente: 6 commits sin subir** (hasta `61bb1a6b`). Pushear + `git merge --ff-only
  origin/main` en `~/echegaray-os/produccion/echegaray-os` + reiniciar los 3 units. NO en rojo.
- Las dos pantallas de admin NO se miraron con un navegador: typecheck, eslint y los tests puros
  están en verde, pero nadie vio los filtros dibujados. `qa-visual` sobre /administracion/compras y
  /administracion/proveedores, autenticado.
- 17 desvíos del contrato: Proveedores 9 (arriba de la fila 157, territorio de las dinámicas, que ese
  generador no escribe) · Jornales 2 · Nómina 2 · Estructura 1 · Materiales 1 · OBRAS 1 · CF Mensual 1.
- El pipeline `echegaray-flujo-caja` termina en FAILED desde el 3/09 por `▲ $171.314 salen por un
  medio de pago que no tiene columna` (21 filas de Compras sin fecha de caja — se arregla llenando
  celdas, decisión del dueño).
- 13 filas con comprobante repetido ($6.502.878): pago en tramos vs carga duplicada — criterio del dueño.
- La cadena de saldos del banco no cierra por $455.082,14 (`scripts/auditar-saldo-banco.mjs`).
- `E45:E61` de OBRAS (17 celdas) bloqueado: el guard que lo destraba, fallando cerrado, borraría un
  plan de $145M. Necesita firma del dueño.
- HF: el volante junta 0 ejemplos (820 filas esperando, 0 correcciones humanas en toda su historia);
  `elegir-herramienta` habilitada pero sin tráfico — el bucle de especialistas corre sobre
  `engines/anthropic-api.mjs`, fuera del gateway.

**P2**
- Cotizador: cotizar un plano NUEVO desde el navegador (único circuito sin probar).
- La Estrella: que Rodrigo confirme si los pagos en efectivo de `CONTROL DE GASTOS` ya están
  facturados — traba decidir si esos $25.141.687 suman o duplican.

## 7. ESTADO GIT

- Rama: `main` · HEAD `61bb1a6b` · **ahead 6 de `origin/main`** · árbol limpio.
- Producción sigue en `55b8c421`: nada de esto está desplegado.

## 8. PRÓXIMO PASO

Mirar las dos pantallas de admin con `qa-visual` (autenticado), y si están bien: pushear los 6
commits, actualizar producción y reiniciar `echegaray-comunicacion-ws`, `echegaray-xsas-gateway`,
`echegaray-asistencia-http`. En paralelo, el dueño tiene que reponer el token de AfipSDK.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
