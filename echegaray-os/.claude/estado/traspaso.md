# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-13 ~19:40 (hora local −03) · main = producción_

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
- Asistencia: presencia es un estado, nunca se deduce de horas. Padrón: NUNCA dar de alta/baja personas.
- Compras · Cobranzas · CAJA · Cheques: el OS no las edita salvo el cargador de comprobantes, el
  marcado DEBITADO con extracto (`--forzar-candado`) o una orden explícita del dueño por celda.
- Cargas sociales/gremiales (UOCRA, IERIC, FODECO, FCL) NUNCA van a Compras.
- Mandato 11/09 (memoria `mandato-optimizacion-integral-1109`): nada es PRODUCCIÓN sin consumidor
  real verificable; toda mejora = baseline → cambio → deploy → medición posterior; P0 operación
  lenta/inestable → P1 backend/DB → P2 UX → P3 herramientas HF. Nunca debilitar RLS.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar; middleware con tope 6 s y página 503
propia) · Supabase fuente única (RLS ≠ GRANT; columna nueva necesita GRANT; PostgREST corta en
1.000 filas sin error; ~800 ms de arranque por conexión → UNA RPC por pantalla: `pantalla_clientes()`,
`pantalla_cliente(p_slug, p_solapa)`, `campanita_atencion()`) · orquestador
(`orquestador/lib|scripts|comunicacion|handlers`) con timers de usuario (flujo-caja cada 2 h a las
:50, compras-sync, gmail-*, arca-sync, drive-index, asistencia-obra) · Sheet «Flujo de Caja - Cash
Flow» regenerado por pipeline (`_MOVIMIENTOS` única fuente de los Cash Flow) · bot @os en Mattermost
(worker + ws; Mattermost corre en ESTA VM, 127.0.0.1:8065) · capa ML en `orquestador/lib/ml/`
(registro + tablero `ml-tablero.mjs`).

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull
--ff-only origin main` (fuera de una corrida del pipeline) + restart de
`echegaray-comunicacion-worker/ws` si cambió el bot.** Migraciones: desde main,
`node orquestador/scripts/aplicar-migracion.mjs <archivo>` (ensayo) y `--aplicar` ANTES del push.
Código siempre en worktree (`node_modules` por symlink; `next build --webpack`). Sheet real NUNCA
desde un worktree. **VM 4 cores/7 GB compartida con Mattermost: un agente pesado a la vez, `nice -n
19`, lint/tests dirigidos, `uptime` antes de algo pesado** (con 4 agentes la carga llegó a 31 y tumbó
el chat). **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL (12/09 19:20)

- **main = producción = 0fb6e5a5.** Migraciones del 12/09 aplicadas: T1000 (costos por obra), T1200
  (identidad de prueba), T1300 (costo de la hora por tramo), T1400 (obra_panel + `security_invoker`
  repuesto), T1600 (columnas comerciales cerradas). Timers vivos: jornales :20, flujo de caja cada
  2 h, **mantener-caliente cada 4 min** (nuevo). Worker del bot y Work Fabric activos.
- **`npm run orq:test` VERDE** (0 fallos; venía con 42). 8 eran código, 20 tests que afirmaban el
  estado del mundo o chocaban por DDL sin turno, 14 reglas que el dueño cambió. Regla nueva:
  `ddl-de-un-test-pide-turno.test.mjs`.
- **CRM cliente terminado y verificado en prod**: cinco solapas; Trabajo+OC · Inicio · HH ·
  Materiales · Mano de obra · Contratado; desglose persona×día; Documentos jerárquico; Cobranzas con
  cuenta corriente y esquema; Actividad y Portal al costado; 400 px sin desborde; portal a ancho
  completo; mail del contacto entero.
- **Mano de obra valorizada**: 79 tramos de `persona_tarifa` (ene–ago, del valor hora sellado) + 5
  alícuotas derivadas de F931/UOCRA → multiplicador **1,6713**; 13 obras **$213,1 M**, 86 % de horas.
  **Falta la firma del dueño/estudio.** Sin valorizar 4.135 h (Oficina 3.017 h por `neto_mensual`:
  decisión A/B en la cabecera de T1300; 4 personas sin quincena cerrada; 109 h previas al primer tramo).
- **Liquidación**: JORNALES manda salvo licencia/ausencia contra día trabajado; E2E de escritura de
  horas VERDE en producción (crea/corrige/vacía leído en `registros_hh`); columna fija a 390 px;
  cuenta de prueba ve personas de prueba.
- **Documentos web con motor léxico del chat**: aciertos **3/30 → 18/30** (chat sigue 19/30), una sola
  definición y un solo tokenizador, resaltado del fragmento. Sin migración (el índice GIN ya existía).
- **Performance**: DDL en caliente eliminado (537 recargas de esquema/día), campanita cacheada 60 s,
  `/api/salud` + timer, `/administracion` sin meta-refresh de 1 s (3.578 → 792 ms local), compras 8→7
  viajes en una ronda y 320→79 kB de JS, personas 10→7 viajes (867 → 428 ms). **Medición en producción
  pendiente con la VM en silencio** (`perf-baseline-web.mjs --etiqueta final-limpia`). Aprendido: la
  base ejecuta en 1–7 ms; lo que cuesta es el viaje — la palanca es menos viajes por pantalla.
- **Compras**: batches 1 y 2 aplicados; Tello 6 cuotas (f956–961). Filas ELIMINADO fuera de
  `costos_obra` (4 filas, $8,35 M, que ensuciaban tres obras).
- **Incidente 13:55–14:14**: base caída (db UNHEALTHY), reiniciada por Management API. Memoria
  `supabase-caido-reiniciar-por-management-api`.

## 5. CERRADO EL 13/09 (sin esperar al dueño) Y LO QUE SIGUE ABIERTO

- **Tello 880–883**: no había conflicto: plan viejo $9,9 M + plan nuevo $5,984 M = 3.610 m² × $4.400. El
  texto de f956–961 decía «pagado $9.900.000» (error mío) → corregido a «menos el plan anterior».
- **Gonzalez Tobares Juan G. 02 y 10/09**: planilla 9 h trabajadas + `asistencia_dia` presente → las dos
  filas `licencia accidente` duplicadas se borraron (respaldo `datos/respaldos/registros-hh-gonzalez-tobares-licencias-2026-09-13.json`).
- **Escudero Emiliano**: alta en `proveedores` (CUIT 20358531629, f7505e04); importador de jorge@ corriendo.
- **Ficha del cliente lenta / «no carga»**: `pantalla_cliente` a plpgsql (20260913T1100, 35/35 md5 iguales).
  Partirla por solapa se midió PEOR en frío (7,4 s vs 3,4 s) → descartado. Sigue 2–10 s en producción
  con conexiones frías de Supavisor: próximo paso es materializar las vistas económicas pesadas.
- **Auditoría de cierre**: Mano de obra, Compras, JORNALES y Suite FIRMA CON LÍMITES. **Multiplicador
  1,6713 RECHAZADO** contra lo pagado en banco (F931 pagado 22,6 % menor; medido 1,554–1,581); probable
  causa planes de pago ARCA ($11,55 M en la ventana) → falta «Mis Facilidades». Costo de obra usa
  devengado (DDJJ), así que el número no es falso, pero NO se presenta como hecho. **Seguridad RECHAZO**:
  32 vistas sin invoker (nómina, egresos, cartera, ART) visibles a empleados + `actions.ts:77` + tabla
  `personas` con 6 `es_prueba` → agente abea02b… corrigiendo. El F931 de julio ($4,86 M, 20/07) falta en
  `_MOVIMIENTOS`.
- **Quattropani HH**: JORNALES tiene sólo Quiroga Sebastián (191 h) y Reta Ramón (187 h) desde el bloque
  17/08; la app sumó 114 h `web:*` sin planilla (Maldonado 80 h). Regla nueva del dueño: HH de obra en el
  CRM = sólo `sheet:jornales`; web aparte → agente ac6801d… (migración T1400, incluye Oficina).
- **Órdenes de compra y pago**: el dueño la rechazó («tirar documentos sin sentido») → rehacer como
  registro con estado y saldo, OC unificada en tres caras → agente a54b228….
- **Proveedores (Sheet)**: no hay pagos huérfanos; la deuda «de más» era el plan de Tello (resuelto) y que
  «Se le debe» incluye cuotas no vencidas. Conciliador de pagos en main (f2ec8fe6), sólo ensayo.
- **Santander Ochoa/Castillo**: teléfono, mail y estado civil de ambos y DNI de Castillo NO existen en
  ninguna fuente (IERIC, legajo, ARCA, F931, Postgres, Mattermost). El modelo del banco no se descarga
  (Akamai corta desde la VM y desde WebFetch). Hay que pedírselos a los dos trabajadores.
- **`contrato_monto`**: queda abierto: lo leen `xsas_obra`/`xsas_actividad` con invoker; cerrarlo rompe XSAS.

- **APLICADO 13/09 tarde**: T1400 (HH de obra en el CRM sólo `sheet:jornales`; web aparte en
  `sin_respaldo`; Quattropani 378 h · 2 personas · inicio 17/08 verificado en la RPC como Dirección; SF
  Pisos, Playón dilución e Instalación eléctrica quedan sin horas de planilla). T1200 (portero en 6 vistas
  económicas + 6 tablas de origen + CBU de ART + `personas` sin `es_prueba` para cuentas reales;
  empleado 10/880/12 → 0; Dirección y md5 de la ficha idénticos). Escudero: comprobante 17105298
  cargado desde el adjunto del chat. En curso: caché de la ficha en la base (agente a891d3f…),
  Órdenes como registro (agente a54b228…), auditor bloque 5 en producción.

- **APLICADO 13/09 noche**: Órdenes de compra y pago como registro (002cc797: OC con monto/facturado/
  cobrado/saldo/estado, PDF como evidencia, OC unificada en Documentos). **Caché de la ficha del
  cliente** (T1500, 51ba3d44): `pantalla_cliente`/`hh_de_obra` sirven desde `ficha_cliente_cache` a
  Dirección real; cálculo en `*_en_vivo`; pg_cron job 39 cada minuto; medido como Jorge en conexión
  nueva 61–280 ms, md5 igual al vivo. Toda migración de la ficha redefine `pantalla_cliente_en_vivo` y
  vacía la caché. Auditor firmó con límites bloques 4 (seguridad re-verificada) y 5 (CRM en prod).
  En curso: atribución de Compras a cada obra + columnas «a la fecha» + presupuesto dentro de la obra
  (agente ae98994…, T1600 sobre `_en_vivo`).

**13/09 ~20:30 — costo a la fecha en PRODUCCIÓN (b0e67a84).** T1550 (`compra_obra_asignada`,
`costo_de_obras_a_la_fecha`, `compras_sin_obra_de_clientes`) y T1600 (`pantalla_cliente_en_vivo`)
aplicadas. `sync-compras` escribe la asignación por la K (fix 6e365a9c: pasaba el cliente de la tx
como `query` → ROLLBACK). Identidad obras + sin obra = Compras por J: OK en los 5 clientes
(`verificar-costo-a-la-fecha-como-direccion.mjs`). Cartera /clientes también a la fecha. QA visual de
tercero lanzado. **Decisión del dueño:** 657/880 filas sin obra (Galpon 7, Mamposteria, Alumetal,
Planta de BSA, Bases de Tanque…) → cargar `obra_alias` según diga. `obra_costo_real` (ficha de obra)
sigue por J: difiere del CRM.

**13/09 ~21:00 — la base cayó 19:40 y 20:36 (0 reinicios en 4 días antes).** Instancia de 406 MB
RAM en swap; el refresco de la caché (T1500, 19:34) trabajaba 40 s/min. T2100 aplicada (7610bee8):
12 s/min, cede con >3 activas. QA de tercero: cartera OK; ficha en vivo con timeouts durante la caída.
Pendiente: re-QA de la ficha con la base estable · **subir cómputo (Nivel E, dueño)** · a 390 px la
cartera oculta Materiales/MO · `obra_costo_real` por K.
**21:04 tercera caída.** Cron 39 (refresco caché) **PAUSADO** (`cron.alter_job(39, active := false)`) hasta
subir cómputo; reactivar después con `active := true, schedule := '* * * * *'`. Re-QA: montos OK en 5
clientes, primera carga falla en 3/5. Dueño en Vercel: plan Free; variables Supabase del proyecto son
manuales → NO usar «Connect to Project». Pasar a Pro + Small (US$30/mes) = Nivel E del dueño.
**21:17 RESUELTO:** el dueño pasó a Pro; cómputo subido a **Small 2 GB** por Management API (~60 s de
corte). Swap 0, ficha en vivo 0,23–0,33 s (antes 5–13 s). Cron 39 **reactivado** cada minuto. Flujo de
Caja falló 21:10 por la caída (vuelve solo 06:50, no correr a mano). QA de tercero post-resize: FIRMA (1,3–2,5 s).
**~22:30:** Personal→Liquidación→Horas sin techo de 1120 px (ce6e1901, QA en curso). Desglose HH por obra
(T2200 aplicada, e95160ea): abre en «Toda la obra», períodos = bloques de JORNALES, `sin_respaldo` al pie.
Quattropani 378 h / 2 personas / 17/08–31/08 226 + 01/09–15/09 152 — datos ya estaban bien, era la
pantalla. QA desglose en curso. **Decisión del dueño:** Maldonado (jefe de obra, neto mensual) 80 h
web en Quattropani 01–11/09: ¿cuentan como HH? · bloques de Oficina que se pisan antes de junio en La
Estrella (¿priorizar Obreros?).
**~21:50 — decisiones del dueño:** jefe de obra cuenta HH en su obra (agente en wt-jefe, migración
T2300 SIN aplicar: fuente única de HH para pantalla_cliente_en_vivo, hh_de_obra_en_vivo,
costo_de_obras_a_la_fecha; esperado Quattropani 458 h / 3 personas) · quincenas = tal cual JORNALES.
**Caída 21:39** (recuperó 21:44, restart 21:46) con 2 GB y memoria sobrada; coincidió con T2200 + QA.
Timer `echegaray-mantener-caliente` queda APAGADO (daba permission denied). Jefes sin horas 08/08–31/08
en ningún lado (FALTA_DATO, avisado). JORNALES 01/06 celda 11/06 = 70 h (Alaniz/Agüero/Rosales) →
descartada por >24 h; avisado al dueño para que la reparta. Resto de JORNALES vs base desde junio: OK.
**~22:20 — T2300 APLICADA (eb8ddef6):** vista `hh_que_cuentan_en_obra` = JORNALES + web de jefes de obra
en días sin JORNALES; la leen las 3 funciones. Verificado como Jorge: Quattropani 458 h / 3 personas
(MO $7,08 M), Pisos Industriales 80 h / Nievas, La Estrella 9.311 sin cambio; ficha en vivo 0,36–0,44 s.
`hh-por-obra.pg.test.mjs` corregido (miraba el envoltorio de caché; 73dcf610) → 6/6 verde contra prod.
QA visual de tercero en curso (qa-jefe).
**~22:50 — CERRADO con firma de tercero:** HH jefe de obra + desglose (qa-jefe FIRMA, escritorio) y
columna persona fija en celular (49d24dd6, qa-movil FIRMA, 390 px). Personal→Horas FIRMA. Rendimiento
post-resize FIRMA. Abierto sólo del lado del dueño: horas de jefes 08/08–31/08 · celda 11/06 = 70 h.
Límites: no probado con rol Jefe de Obra/Campo; `obra_costo_real` (ficha de obra) sigue por J; cartera
/clientes a 390 px oculta Materiales/MO.

## 6. PENDIENTES REALES

**P0** — medición de performance en producción con la VM en silencio · auditoría de tercero sobre lo
desplegado hoy (nadie ajeno firmó CRM, alícuotas ni suite).
**P1** — `pantalla_cliente`/`pantalla_clientes` siguen siendo el techo (`obra_panel` se deriva 3 veces
por llamada) · búsqueda: mes en palabras vs número (9 de 30 fallan en las dos caras) · Santander modelo
xlsx · sonda de antigüedad de `comunicacion.inbox` · `vinculacion-estandar` reaplica migraciones (124 s).
**P2** — menú lateral de Liquidación · Proveedores número esperado · plan PRO HF · extractos ene–may ·
Mis Facilidades ARCA · `fin_real` de actividades (cronograma de obra cerrada sigue «atrasado») ·
sticky en Safari/iOS.

## 7. ESTADO GIT

main = origin/main = b0e67a84 · wt-costo y wt-cartera eliminados.

## 8. PRÓXIMO PASO

Medición limpia → reportar al dueño → esperar sus seis decisiones → auditoría de tercero.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
