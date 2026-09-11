# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-10 ~19:35 (hora local −03) · main = producción_canonica encima) · producción = main_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones. Integra
aplicación web (Next.js + Supabase), datos, automatizaciones, motores determinísticos e IA para que
Dirección y la empresa operen desde una única plataforma. XSAS es la capa de inteligencia operativa
del OS: el usuario trabaja desde la app con lenguaje natural, interfaces y archivos, sin conocer
tablas, skills ni código.

Claude Code NO es la interfaz operativa del negocio: se usa únicamente para desarrollar, corregir,
probar y evolucionar el OS y XSAS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje central · una fuente de verdad por concepto (Postgres cuando lo consumen varias caras)
- Plan vs Real vs Forecast · P&L devengado · Cash Flow percibido · nunca mezclar ventanas de tiempo
- Datos y evidencia antes que inferencia · no inventar · FALTA_DATO cuando falta evidencia · CONFLICTO cuando las fuentes se contradicen
- Preservar genealogía/provenance · edición manual del dueño = verdad definitiva
- Acciones sensibles: autorización + RBAC + auditoría + verificación (Nivel E = firma humana)
- Deterministic first · skills/capabilities/tools first · Reasoner/LLM sólo cuando aporte valor real
- Reutilizar motores/datos/capacidades existentes antes de crear otros
- Minimizar llamadas, tokens, costo y complejidad — el límite semanal de Claude Code es recurso escaso
- UX simple, compacta, operativa · less is more · minimalismo extremo en el Sheet (sin aclaraciones)
- Conocimiento y experiencia real ECSAS priman sobre generalizaciones externas
- Nadie cierra su propio trabajo · evidencia del EFECTO, no del intento
- Asistencia: presencia es un estado, nunca se deduce de horas. Ausencia sin motivo = 0 h; con motivo
  que paga = jornada (9 h L–J, 8 h V). Un día nunca suma dos veces.
- Padrón: quien no está en la quincena en curso es inactivo; NUNCA dar de alta ni de baja personas.
- Compras · Cobranzas · CAJA · Cheques Emitidos/Recibidos: el OS no las edita salvo (a) el cargador de
  comprobantes de proveedores en Compras, (b) `cheques-emitidos-sync-banco --forzar-candado`, (c) una
  orden explícita del dueño para celdas concretas (10/09: Cobranzas M32, fila 55, W99/W100).
- **Cargas sociales / gremiales (UOCRA, IERIC, FODECO, FCL) NUNCA van a Compras** (dueño 10/09; se
  revirtió una carga). Dónde se registra su pago fuera de Compras está pendiente de decisión.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar) · Supabase fuente única (RLS ≠ GRANT; toda
columna nueva necesita GRANT; PostgREST corta en 1.000 filas sin error → leer paginado) · orquestador
(`orquestador/lib|scripts|comunicacion|handlers`) con timers de usuario (flujo-caja cada 2 h a las
:50, compras-sync, gmail-ordenes cada 6 h —dos casillas—, gmail-transferencias, arca-sync,
drive-index cada 6 h, asistencia-obra) · Sheet «Flujo de Caja - Cash Flow» regenerado por pipeline
(`_MOVIMIENTOS` única fuente de los Cash Flow) · bot @os en Mattermost (worker + ws) · gateway XSAS.

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only
origin main` (fuera de una corrida del pipeline) + restart de `echegaray-comunicacion-worker/ws` si
cambió el bot.** Código siempre en worktree bajo `~/echegaray-os/worktrees/` (symlink de
`node_modules`; `next dev/build` con `--webpack`: turbopack rechaza el symlink). Sheet real NUNCA
desde un worktree; migraciones sólo desde la sesión principal (`aplicar-migracion.mjs <archivo>`
ensayo, `--aplicar`). Playwright anda sin root con las libs del scratchpad (`libs/lp.txt` →
`LD_LIBRARY_PATH`) y `NODE_PATH=<proyecto>/node_modules`; login de prueba en memoria
`qa-visual-sin-root`. **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL (10/09 17:05)

- **Publicado hoy** (todo en main y producción; migraciones aplicadas): RU H1 (`cliente_economia`, `es_cobrada()`,
  registro `definiciones.json` + test canónico) · solapa «Horas» · Clientes v4 (sin Margen, cobro neto, OC listadas
  bajo cada obra con PDF, barra por obra TODO O NADA leyendo `obra_cobranza.imputacion`, sin párrafos, una tipografía)
  · **cobro por obra** (`20260910T2330`: vista `cobranza_imputacion` + `obra_cobranza.imputacion` 'oc'|'alias'|'cliente',
  alias nuevos en `obra_alias` con `en_texto_libre`; `20260910T2350` GRANT SELECT obra_canonica → authenticated: sin él
  PostgREST daba 42501 y la columna Cobrado se apagaba) · OC en la ficha de obra (`OrdenesDeLaObra`) · portal 5 clientes
  (`vivo.ts` lee `cobranzas` en vivo por `cobranza_fila`; «obra terminada» = `obra_canonica.estado`; Terminadas rehabilitada;
  saludo; datos.sql aplicado; sync-esquema encadenado al servicio cobranzas-sync — nunca tuvo timer) · puente Drive H2
  (`ArchivosDeDrive` en 4 fichas, `entidad_documento` + subida al bucket con cola a Drive `drive_estado`, `20260910T2210/2320`)
  · clasificador OC (`20260910T2300` drive_file_id; ARCOR 148→40 OC; 107 `otro` sin importe) · cargas gremiales pagadas
  desde el banco (`cargas-pagos-banco.mjs`) · perf tramo 1 (ficha cliente en una ola; `20260910T2340` RLS drive_index OR→CASE).
- **Datos**: Cobranzas escrita por orden del dueño (Messina efectivo N 34/69/102; Quattropani 78/101 FA 230 + IVA; ARCOR 17 filas
  H uniforme, I conceptos de OC, E facturas, O/Q 51/52/59 Pendiente 24/11, W refs; W51/52/59 OC 53376178) · Quattropani portal:
  esquema fila 78 vinculada, IVA 101 publicada, FA 230 visible en Facturas · Drive: FC 230 Quattropani, nota Rodrigo Messina
  (`14-oxfzzm6EHyObGysr8xjNJfDtBHyx2Z`), OC 2097 Messina, 40 OC ARCOR, comprobante UOCRA · `clientes.drive_carpeta_id` ARCOR y
  San Francisco; `messina-bsa`/`messina-pisos-120-rampa` heredaron carpeta · `esquema_pago` Quattropani 61/63 ocultas, SF 94/95 obra.
- **Rendimiento (medido 16:30–16:55, sesión real)**: /clientes ~10 s, /clientes/messina 10,6 s, /obras/<slug> 8–12 s, Personal 1 s.
  Causa medida: arranque en frío del catálogo por CONEXIÓN (~800 ms planning), multiplicado por consultas paralelas y funciones
  Vercel nuevas; Supabase con incidente «Unresponsive Projects» todo el día (fix global 19:41Z). Solución de fondo pendiente:
  UNA consulta/RPC por pantalla; `getNovedades` dispara 7 consultas post-hidratación en toda ruta.
- Pipeline Flujo de Caja en rojo por 3 auditores de presentación (preexistente). `orq:test` 19–21 rojos preexistentes
  (incluye `obra_panel` sin security_invoker → mirar).

## 5. TRABAJO DE ESTA SESIÓN

Ver §4. Reclamos del dueño resueltos con evidencia: Clientes (fuente única, OC por obra, barra por obra), portal, ARCOR, UOCRA,
Quattropani FC 230, Messina nota/cuadre (sin duplicaciones; +$8,95 M en negro de Bases tanque SO2 sin papel), cash flow cierre.

## 6. PENDIENTES REALES

**Publicado además desde las 17:05**: lector OBRAS/Cobranzas por obra (`20260910T2355/2356`: `obra_economia_cartera.origen
'oc-cliente'`+`referencia`+`nota`+`oc_civa_ventana/historico`, TC vivo en `public.tipo_cambio`, vista `public.obra_cuenta` =
columnas de OBRAS por obra: cobrado_total/neto, por_cobrar, vencido, próximo cobro) · Clientes CRM v1 (d436d522) · RPC una
consulta por pantalla (`20260911T0010/0020/0030/0040`: `pantalla_clientes()`, `campanita_atencion()`, `pantalla_cliente()`;
/clientes 16→3 viajes, ficha 24→3) · OC en ficha de obra · portal 5 clientes · cargas gremiales desde banco · Drive H2.
**Decisión del dueño 17:15**: Administración = CRM (clientes/personal/proveedores/compras), Obras = ERP descuidado; nada de
costos/ERP en Clientes; columnas pedidas para /clientes: Cliente+trabajos con OC · Obras · OC · OP · Contratado · Cobrado (total
c/IVA, barra admin). 18:20: sección «Cobranzas» por cliente en la ficha con toda la pestaña organizada por trabajo y OC.
18:25: «prohibido dejar de trabajar» → ciclo ScheduleWakeup activo.

**Publicado 18:40–19:35**: Clientes CRM final (73f950b0: 6 columnas — Cliente+trabajos con OC · Obras · OC · OP · Contratado ·
Cobrado total c/IVA con barra —, sección «Cobranzas» por cliente agrupada por trabajo, vista `cliente_cobranza` `20260910T2359`,
Quattropani U$S, sin ERP; la solapa Cobranzas es la única lectura fuera de la RPC `pantalla_cliente()`) · RLS obra_panel
(`20260911T0100/0110`: `security_invoker` recuperado — rol campo veía 24 obras —, porteros como initplan, costos_obra 698→67 ms) ·
campanita (`20260911T0120/0130`: `comprobante_cumple_filtro()` predicado compartido SQL≡TS, RPC devuelve conteos: 559 ms/76 KB →
98 ms/0,25 KB) · solapa Horas de Liquidación payload 903→211 KB · fixes del pipeline (E74 vs BA39, impuesto al cheque, candado
cheques ⏸, Proveedores firma, Compras colapsos, Parámetros inflación mm/dd → dd/mm, CAJA!H15, CAJA!C3, f136) · VENCIDO en la
columna ancla (`condicionAncla`, CFM!M50 == CFS!BB50 esperado en la corrida de las 20:50). Tiempos 18:53 (sesión real):
/clientes 1,5 s · ficha Messina 2,8 s · obra dilución 1,7 s · obra BSA 6,3 s · Personal 1,6 s.
**P0 — agentes en curso**: Liquidación (adb93720f5af09744: edición rota, panel derecho, ZZ-E2E, 27 s) · captura de Clientes/Cobranzas
en producción tras el deploy (background) y descripción por subagente (mis lecturas de PNG están bloqueadas en este contexto).
**Verificar en la corrida de las 20:50**: `_CAJA_ANEXO!E74` = 0 (y «Efectivo sin explicar» +$10 M) · CFM «· Impuestos» + impuesto al
cheque · `Parámetros!A74:A77` = 46266/46296/46327/46357 · Proveedores firma · `CAJA!H15` mismo veredicto · CFM!M50 == CFS!BB50 ·
log: ⏸ Cheques Emitidos, colapsos con plata.
**P1 — del dueño**: Bases tanque SO2 fila 31 $6.700.000 sin respaldo · OC 53239036 50 % sin facturar ($3.977.130 c/IVA) · OC
53376178 +$893.210 vs Sheet (facturar por la OC: FCE 201, vale en ECUP, vto 20/11) · F68 Q 08/09→12/09 · OP 5146 $38.462 · OC
2135 pedir a Isabel Villanueva · nov/dic sin materiales proyectados (−$54,6 M) · dic cobros 43 % de nómina · 9 «Pagado» de
Compras que son cheques sin debitar · 4 Compras sin fecha de caja · accesos al portal Messina/La Estrella/ARCOR · SF 17 filas N en
portal vs `apto_para_portal` · Terminadas rehabilitada · obras ARCOR a dar de alta · `force-dynamic` en Clientes/Obras (frescura
vs velocidad) · repartir «Saldo obras San Francisco» $47,6 M.
**P2**: `/obras/[obra]` 15 viajes y `obra_panel select *` 17 s · `campanita_atencion` 520 ms/76 KB · OBRAS pierde la fila 46 de
BSA (SUMIFS por needle) · `getPerfilActual` en layout · consumidor cola app→Drive (H3) · `certificado_cliente.estado` (H4) ·
`estadoDePago()` vs `es_cobrada()` · sync-esquema `orden` · `cliente-cartera.test.mjs` rojo desde 648691cb · `obra_panel` sin
security_invoker · pipeline auditores de presentación.

## 7. ESTADO GIT

- `main` = origin/main = producción. Worktrees vivos: `wt-crm`, `wt-liq`, `wt-fc-audit` (agentes activos); `wt-clientes-v4`,
  `wt-drive-h2` (mergeados, eliminar).
- Migraciones: todas las de main aplicadas (última `20260911T0040`).

## 8. PRÓXIMO PASO

Publicar CRM 6 columnas + sección Cobranzas → captura → dueño. Publicar Liquidación. Aplicar/mergear fixes del pipeline y
verificar en la corrida siguiente. Medir tiempos tras cada deploy.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
