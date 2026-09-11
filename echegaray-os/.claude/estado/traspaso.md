# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-11 ~15:55 (hora local −03) · main = producción_

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

## 4. ESTADO ACTUAL

- **Producción**: web responde; pipeline 14:50 success (23 min); prod checkout = main (d4ee0d23+).
- **HF CERRADO (§6/§7 del mandato)**: `docs/engineering/HF-INCORPORADO-VS-RECHAZADO-2026-09-11.md` +
  evidencia cruda en `docs/engineering/evidencia/hf-2026-09-11/`. Tres herramientas del Hub medidas
  contra problemas reales y RECHAZADAS (Qwen3-Coder calidad · GLM-4.7-Flash operación 504 · Qwen3-VL
  fabricación); candado `lib/ml/registro.test.mjs`. Local confirmado por medición (e5 8 ms vs 5 s
  remoto; router 404 para embeddings). Incidente declarado: captura con clientes reales fue a novita
  sin adapter. Decisión del dueño pendiente: plan PRO de HF sin consumidor.
- **Compras · limpieza por concepto (orden 11/09)**: análisis en `docs/engineering/COMPRAS-LIMPIEZA-2026-09-11.md`.
  No hay doble conteo; cinco grupos ($94,1 M REAL + $17,3 M FUTURO) entran al Cash Flow SOLO por
  Compras. **Batch 1 APLICADO** (39 filas nómina + f475/f477, $126,8 M a cero, X=ELIMINADO) con
  `scripts/compras-marcar-eliminado.mjs` (huella por fila, idempotente, escribe 0 y no vacío porque la
  guarda anti-borrado conserva la celda vaciada); respaldos en `orquestador/datos/respaldos/`.
  Efecto colateral medido: `obra_costo_real.costo_mano_de_obra` pierde $8,3 M (La Estrella 3,3 ·
  Galpones 4,0 · Messina 1,0) porque el sync espeja Compras a `costos_obra` área personas — la MO por
  obra debe salir de JORNALES, no de Compras (gap previo, ahora visible).
- **Hito 2 EN CURSO** (agente en `/home/jorge/echegaray-os/worktrees/wt-compras`, rama
  `feat/libro-fuentes-propias`): extractores propios del libro — `deBancoObligaciones` (REAL desde
  `_BANCO_RAW`: prendario, gremiales, AFIP apareado F931/plan, DGR; dedupe contra Compras por
  `usados`), `dePrendario` FUTURO (`datos/prestamo-prendario.json`), `deSac` (proyectado jun/dic +
  real por ventana), planes ARCA sólo apareo REAL (`datos/planes-arca.json`, sin cronograma), y
  `scripts/libro-simular-sin-compras.mjs` (prueba ejecutable: diff rubro×mes ≤ $1 al anular Compras).
  **Batch 2** (74 filas Impuestos/Financiero + 6 SAC) se aplica SOLO cuando la simulación dé ≤ $1 y
  una corrida del pipeline lo confirme; los planes pendientes f698/f699 quedan hasta tener Mis
  Facilidades.
- **Tarjeta L2/L23**: siguen con el sello viejo tras la corrida 14:50. `tarjeta-pestana` corrió y NO
  imprimió «se vacían» → `textosDeSellosViejos` no detectó los fósiles (fe197722 no dispara). P1.
- **Deuda conocida**: `orq:test` 11 archivos rojos en main; `tc_vigente()` sin canario; ~100
  worktrees viejos en `.claude/worktrees` (higiene); `pgrep -f` se encuentra a sí mismo (usar `pgrep -x`
  o `systemctl is-active`).

## 5. TRABAJO DE ESTA SESIÓN (11/09 tarde)

396e9c07 HF §6/§7 cerrados · d3cb3c71/338b799d/337aa54c bisturí ELIMINADO (3 correcciones medidas
contra el Sheet real) · d4ee0d23 respaldos batch 1 · hito 2 en rama.

## 6. PENDIENTES REALES

**P0** — cerrar hito 2: revisar diff del agente, tests dirigidos, simulación ≤ $1, merge, deploy
(pull prod fuera de corrida), esperar corrida :50, verificar libro/CFM/CFS, aplicar batch 2 con el
bisturí (lista = grupo A + SAC del JSON de candidatas, menos f698/f699), verificar en la corrida
siguiente que CFM!M50 y CFS!BB50 no bajan por rubro.

**P1**
- Pedido del dueño 11/09 ~15:50: «usar todas las skills de HF para optimizar app.ecsas.com.ar».
  Posición dada: sólo lo que ganó midiendo tiene consumidor real en la web — buscador de Documentos
  (e5 + reranker), ruteo/clasificación de XSAS en `/xsas` sin Claude (latencia y tokens), selección
  de contexto para Claude. Baseline primero (latencia XSAS web, p50/p95; búsqueda documentos).
- MO por obra desde JORNALES → `costos_obra` (origen propio), para que `obra_costo_real` no dependa
  de Compras.
- `pantalla_obra()` RPC; Personal/Horas 25 consultas; Cargas Sociales «2 · PAGADO» lee Compras;
  Tarjeta fósiles; `orq:test` rojos; canario `tipo_cambio`.

**P2** — UX por flujo/mobile/XSAS en contexto; decisiones del dueño a listar por bot (ver versión
anterior del traspaso en git: cb013e20).

## 7. ESTADO GIT

- rama: `main` = `origin/main` · HEAD d4ee0d23 · working tree: limpio salvo este handoff.
- rama abierta: `feat/libro-fuentes-propias` (worktree `/home/jorge/echegaray-os/worktrees/wt-compras`).
- producción: main desplegado; migraciones hasta 20260911T1200.

## 8. PRÓXIMO PASO

Cerrar el hito 2 y aplicar el batch 2 (P0 de arriba). Después, baseline de XSAS web para el pedido HF.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
