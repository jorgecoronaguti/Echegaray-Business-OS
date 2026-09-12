# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-12 ~12:45 (hora local −03) · main = producción_

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

## 4. ESTADO ACTUAL (12/09 12:45)

- **main = producción** en 8e46ac8e (Vercel despliega solo; checkout prod se actualiza con
  `produccion-al-dia.mjs` en cada timer). Sesión 11/09 se reinició a la noche: los agentes y los
  waiters de fondo murieron; se reanudaron el 12/09 por SendMessage.
- **Compras**: batch 1 (39 filas) y **batch 2 (23 filas seguras, $54,67 M) aplicados** con respaldo en
  `datos/respaldos/compras-eliminadas-2026-09-12-batch2.json`. Los 55 restantes del batch 2 siguen
  excluidos (fecha < 01/06, gremiales jun–ago, SAC junio, Colegio). Tarjeta de cierre CFM: 18:50 $88,9 M ·
  20:50 $84,6 M · 12/09 10:50 $85,66 M. **Verificar corrida 12:50** (waiter) tras el batch 2.
- **Tello / SF pisos**: 6 cuotas semanales pendientes cargadas (f956–961, 18/09→23/10, $5.984.000,
  Cuenta Corriente, Q literal, X fórmula). CONFLICTO abierto: filas 880–883 (plan viejo $9,9 M, editadas
  por el dueño, pendiente $6,88 M) NO tocadas — el dueño decide (a) marcar pagadas o (b) eliminar.
- **Liquidación**: desplegado JORNALES manda sobre web:* (48 filas pisadas), Nievas +696 h, cotejo
  sólo sobre días cargados, TOTAL SEMANA en el bot, espejo `jornales_bloque_persona` (T2200 aplicada,
  ExecStartPost del timer :20), panel por persona remontado (key), filtro de obra con chip siempre.
  Abierto: Gonzalez Tobares 02 y 10/09 (2 filas web c/u) — decisión del dueño; bloque 4 del agente
  (E2E escritura de horas, QA-1 tres totales, QA-3 sticky/Retribución) en curso en wt-jornales.
- **CRM**: Documentos rediseñado y desplegado (jerarquía obra→adicional→categoría→archivo; n_documentos
  real; `obra_papel` materializada, T2200/T2300 aplicadas; 22 carpetas vinculadas, 226 papeles).
  **En curso wt-hh** (feat/hh-por-obra-en-cliente, 1e46dcc2): columna Inicio + HH junto a Trabajo
  con OC pegada al nombre, sin OC/OP en tablas, desglose persona×día (`hh_de_obra`), inicio real en la
  cronología; migración `hh_obra` a aplicar UNA vez desde main; `hh_de_obra` medía 3 s media/36 s máx →
  exigido < 300 ms con explain analyze.
- **Rendimiento**: instancia chica; 148 recargas de esquema el 11/09 por DDL de tests .pg (ahora
  `ORQ_PG_DDL=1` para correrlos). RPC ficha 60 ms caliente / 2,5 s fría. `campanita_atencion` (1,1 s media)
  y `getNovedades()` (21 s en una muestra) son los próximos sospechosos.
- **Transferencias**: importador renueva token ante 401 (f761ed4e). rodrigo@ corrida 11/09 19:48:
  3 nuevos (MASS, DATA 2000, Robles), 5 ya estaban, 5 sin proveedor. Escudero Emiliano ($108.900,
  CUIT 20-35853162-9) no existe como proveedor: decisión del dueño.
- **Santander Ochoa/Castillo**: sin cambios (falta el modelo xlsx adjunto; faltan tel/mail/estado civil).
- **Deuda**: cronograma de obra cerrada sigue «atrasado» (obra_actividad.fin_real nunca se escribe) —
  módulo Obras, el dueño pidió no tocarlo ahora; MAIL cortado en panel Contacto; `orq:test` rojos;
  Documentos web con motor léxico; MO por obra desde JORNALES.

## 5. TRABAJO DE ESTA SESIÓN (11/09 tarde → 12/09)

e8dd4695 espejo JORNALES + key panel · 42fe4025 filtro obra · 2dde4968/b157a277 JORNALES manda, Nievas,
cotejo, TOTAL_COL · 18b5c782 Documentos CRM (T2200/T2300) · f761ed4e gmail token · 8e46ac8e batch 2.

## 6. PENDIENTES REALES

**P0** — corrida 12:50: CFM/CFS no bajan tras batch 2 · cerrar wt-hh (aplicar migración hh_obra, medir,
desplegar) · cerrar bloque 4 Liquidación · decisiones del dueño: Tello 880–883, Gonzalez Tobares, Escudero.
**P1** — campanita/getNovedades lentos · Santander modelo · MO por obra desde JORNALES · Documentos web
léxico · sonda inbox · `proyeccion-convenio.test.mjs` rojo · limpiar worktrees viejos (`higiene-worktrees`).
**P2** — menú lateral Liquidación · Proveedores número esperado · plan PRO HF · extractos ene–may ·
Mis Facilidades ARCA · fin_real de actividades (Obras).

## 7. ESTADO GIT

main = origin/main = 8e46ac8e · worktrees vivos: wt-hh (agente), wt-jornales (agente), wt-adic y
wt-compras (mergeadas: borrar), wt-db2 (mergeada: borrar).

## 8. PRÓXIMO PASO

Verificar 12:50 → recibir reportes de wt-hh y wt-jornales → aplicar migración hh_obra desde main → merge
+ push → capturas → reportar al dueño con las tres decisiones pendientes.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
