# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-12 ~19:20 (hora local −03) · main = producción_

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

## 5. DECISIONES DEL DUEÑO PENDIENTES (bloquean cierres)

1. **Tello filas 880–883** ($6,88 M pendientes del plan viejo, editadas a mano): ¿pagadas o eliminar?
2. **Gonzalez Tobares 02 y 10/09**: dos filas web cada día contra una de la planilla; 17,8 h de diferencia.
3. **Escudero Emiliano** ($108.900, CUIT 20-35853162-9): ¿alta como proveedor?
4. **Multiplicador 1,6713** y su reparto de conceptos: firma del dueño o del estudio contable.
5. **Oficina**: A) derivar $/h = neto mensual ÷ horas del mes · B) no cargar sus horas a la obra.
6. **`contrato_monto`/`contrato_moneda`** de obras: ¿se cierran como `monto_contratado`?

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

main = origin/main = 0fb6e5a5 · sin worktrees de agentes vivos.

## 8. PRÓXIMO PASO

Medición limpia → reportar al dueño → esperar sus seis decisiones → auditoría de tercero.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
