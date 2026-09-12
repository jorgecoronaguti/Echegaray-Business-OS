# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-12 ~16:45 (hora local −03) · main = producción_

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

## 4. ESTADO ACTUAL (12/09 14:20)

- **main = producción** en 9af95a26 (Cobranzas 400 px y portal 1280 verificados en build; c67a9182 CRM costos+cinco solapas T1000; c08ecfb9 vaciar celda borra el día; 5fec4772 ELIMINADO fuera de costos_obra; 69859bef/4e3241d4 alícuotas+tarifas y costo por tramo T1300 aplicada). Sesión reiniciada dos veces (noche 11/09 y 13:3x del 12/09):
  los agentes se reanudan con SendMessage a su id; los waiters de fondo mueren.
- **INCIDENTE 12/09 13:55–14:14**: base de Supabase caída (db/rest/auth UNHEALTHY, pooler sano; 504
  a los 5 s). Reiniciada por Management API (`POST /v1/projects/<ref>/restart`); worker del bot y
  timers pausados y reanudados. Ver memoria `supabase-caido-reiniciar-por-management-api`.
- **Performance** (rama perf mergeada e0abd539): el timer del Flujo de Caja disparaba DDL en cada
  corrida → 537 recargas de esquema de PostgREST/día (gasto #1 de la base): ahora `tabla-asegurada.mjs`
  consulta el catálogo. Campanita cacheada 60 s en el navegador. `/api/salud` + timer
  `echegaray-mantener-caliente` (cada 4 min, instalado). Baseline «antes» en
  `orquestador/datos/perf/perf-web-antes-*.json`; «después» corriendo (`perf-baseline-web.mjs
  --etiqueta despues`). Hallazgo abierto: `obra_panel` agrega N+1 (`costos_obra` loops=24) →
  reescribir la vista (DDL, área clientes/obras).
- **Liquidación**: JORNALES manda salvo licencia/ausencia contra día trabajado (8d350008; Quiroga
  Alexander restaurado 08–10/09 desde `asistencia_dia`). Columna fija a 390 px corregida y regla «una
  cuenta de prueba ve personas de prueba» (T1200 aplicada). **E2E de escritura de horas VERDE en
  producción** (crea/corrige/vacía leídos en registros_hh; vaciar borra la fila, c08ecfb9).
- **Compras**: batch 1 + batch 2 (23 filas) aplicados; CFM tras 12:50: $82,8 M. Tello 6 cuotas
  cargadas (f956–961); CONFLICTO 880–883 ($6,88 M pendientes, editadas por el dueño) — decisión.
- **CRM**: TODO en prod y verificado por QA (c67a9182): Trabajo+OC · Inicio · HH · Materiales · Mano
  de obra · Contratado; cinco solapas; Cobranzas con cuenta corriente + esquema; Actividad reciente y
  Portal al costado; enlaces viejos redirigen. **Mano de obra valoriza**: 79 tramos de `persona_tarifa` desde `liquidacion_linea.valor_hora`
  (ene–ago) + 5 alícuotas derivadas de F931/UOCRA ene–ago (multiplicador 1,6713, base total, fuente en
  cada fila) → 13 obras $213,1 M, 86 % de horas. **Firma del dueño/estudio pendiente** (aportes 301/302 en
  cargas; sindical+FICS en cargas). Sin valorizar 4.135 h: Oficina neto_mensual (3.017 h, decisión A/B en
  la cabecera de T1300), 4 personas sin quincena cerrada, 109 h previas al primer tramo. Ficha
  la-estrella 1,6 s → 0,42 s caliente (T1300); piso de la ficha sin costo_obra ≈ 320 ms. Cosmético en curso
  (agente): Cobranzas a 400 px desborda la página; `?portal=1` angosto a 1280.
- **Decisiones del dueño**: Tello 880–883 (pagadas o eliminar) · Gonzalez Tobares 02 y 10/09 (dos
  filas web c/u) · Escudero Emiliano (¿proveedor CUIT 20-35853162-9?).
- **Deuda**: cronograma de obra cerrada «atrasado» (fin_real nunca se escribe); MAIL cortado en
  Contacto; `orq:test` rojos; Documentos web léxico; Santander modelo xlsx; MO por obra desde JORNALES
  (parcial: mano de obra por obra en la ficha del cliente lo cubre).

## 5. TRABAJO DE ESTA SESIÓN (12/09)

8e46ac8e batch 2 · 58b83734/0d514f9e HH+Inicio+OC en ficha · abd24003 Liquidación bloque final ·
8d350008 licencia no pisa trabajo · 887a56e9 identidad de prueba + sticky · e0abd539 performance.

## 6. PENDIENTES REALES

**P0** — cuatro agentes en paralelo (16:45): QA prod cosmético + perf «despues4» (aaf2a16…); `obra_panel`
sin N+1 → migración T1400 (ad91c5b…); suite `orq:test` verde + MAIL cortado (a717d90…); Documentos web
con motor léxico (a012d7c…). Decisiones del dueño: Tello 880–883, Gonzalez Tobares 02 y 10/09,
Escudero, multiplicador 1,6713, Oficina A/B.
**P1** — `obra_panel` sin N+1 (DDL) · `pantalla_clientes()` 509 ms · Santander · Documentos web léxico ·
sonda inbox · `proyeccion-convenio.test.mjs` rojo · higiene de worktrees viejos.
**P2** — menú lateral Liquidación · Proveedores número esperado · plan PRO HF · extractos ene–may ·
Mis Facilidades ARCA · fin_real de actividades (Obras) · Safari/iOS del sticky.

## 7. ESTADO GIT

main = origin/main = 9af95a26 · worktrees vivos: wt-panel, wt-suite, wt-docs (agentes).

## 8. PRÓXIMO PASO

Leer b1sggl5eo → reportar antes/después al dueño → cerrar wt-costos → traspaso.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
