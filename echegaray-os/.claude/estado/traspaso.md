# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-10 ~14:30 (hora local −03) · main `ee260d8b`+ · producción = main (pull tras cada merge)_

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

## 4. ESTADO ACTUAL (10/09 tarde)

- **Publicado hoy en main y producción**: Personal uniforme (Plantel/Asistencia/Liquidación: jefes
  primero, alfabético, `RotuloDeGrupo` compartido) · filtro por obra en Asistencia (chips = filtro, pie
  «Total · obra») · Liquidación: proyección de masa salarial («Cobra est.», bloque Proyección,
  bolsillo) + acuerdo 50/50 (`liquidacionAcuerdo.ts`; Oficina y subcontratistas sin reparto) · Clientes
  rediseñado (`docs/engineering/DISENO-FICHA-CLIENTE-v3.md`: sin «Últ. mov.», barra de cobrado
  percibido, columna OC·OP, OC legibles por obra, Documentos por tipo, cerradas siempre) · portal del
  cliente sin obras fusionadas, cuenta corriente y esquema con fuente única · bot de comprobantes
  (PDF sin modelo) corregido y desplegado · importador OC/OP rediseñado (2 casillas, paginación,
  cuota 403, `retencion`, fecha por certificado; migraciones aplicadas; carga real: 330 nuevos, 374
  filas en `cliente_orden`) · Puente Drive H1 (`drive_index` no borra, md5, papelera;
  `docs/engineering/PRP-PUENTE-DRIVE-APP.md`) · generador mensual FCL «PAGO SIMPLE AFON» +
  skill `fondo-de-cese-pago-simple-afon` · test E2E de Clientes actualizado.
- **Datos**: A.C.SAT = RSV vinculado (alias) · OC de Messina cargadas y colgadas por obra (2256 →
  ADICIONAL TERCER MURO; obra nueva `messina-bases-tanque-so2`) · dos certificados duplicados dados de
  baja lógica · Cobranzas corregida por orden del dueño (M32 fórmula, fila 55 eCheq/retención,
  W99/W100 nota) · `certificado_cliente` sincronizado (33 cobradas) · extracto 10/09 importado (38
  nuevos) · Cheques Emitidos K122 DEBITADO.
- **Boletas 08/2026**: IERIC/FODECO/UOCRA/FCL identificadas y archivadas en Drive
  (`archivo-fiscal/2026/IERIC`, `UOCRA/Boletas de depósito`, FONDO DE CESE). Pago UOCRA 08 confirmado
  en extracto (DEBIN $994.941,26 el 10/09); FCL 08 acreditado (15 × «fondo desempleo 082026» =
  $1.160.400). Nada de eso está registrado en el Sheet (ver §6).
- **Suite `orq:test` roja en main por 8–17 tests preexistentes** (generadores de Sheet: rótulos de
  frescura, recurrentes, cargas-sociales; vistas RLS/security-invoker; regla-cero) — ajenos a lo de
  hoy; nadie los tocó.

## 5. TRABAJO DE ESTA SESIÓN (10/09 09:30 → ~14:30)

Sesión larga, muchos agentes en paralelo. Lo de arriba. Reversión de una carga indebida en Compras
(filas 946-948 y placeholders 475/477 restaurados al respaldo, diff 0). Análisis de cobros de Messina
entregado por bot (posts v1 `kwjukrckpf8i7pneiroyg76fdy`, v2 `wgoc97h1npd1dxog73z19ix8mo`); FCL por
bot (`3ydox7krsbgy3pxdys7sc556za`). Memoria nueva: `cargas-sociales-no-van-a-compras`.

## 6. PENDIENTES REALES

**P0 — en curso al cerrar** (dos agentes; sus ramas quedan sin mergear si la sesión corta):
- `fix/banco-saldo-declarado-echeq-48hs` (wt-banco): el importador descarta el pie «Saldo al» y suma
  como disponibles los depósitos de eCheq con retención 48 h → CAJA habría publicado $42,16 M en vez
  de $3.584.941,27. **Hasta mergearlo NO regenerar `_BANCO_RAW`/CAJA** (el mantenedor paró ahí; CAJA
  quedó al 08/09, vieja pero correcta). Después: `importar-banco.mjs` de nuevo sobre
  `/tmp/claude-1001/extracto-santander-2026-09-10.csv` → pipeline (`mantenedor-flujo-de-fondos`).
- `fix/obras-contratado-usd-y-moneda` (wt-obras-usd): Quattropani contratado $1.504 porque
  `MARCADOR_CONTRATO` toma «($1503,6*USD3500)» de H78 como contrato en pesos; `sync-cobranzas` no lee
  Moneda (U$S 15.400 → $15.400); ME - BSA excluye la fila 46. Mergear + próxima corrida de OBRAS.

**P1 — del dueño** (no avanzar sin su respuesta): dónde registrar pagos gremiales fuera de Compras
(bloque de entrada en Cargas Sociales o réplica desde Drive) · Oficina en la proyección (neto entero
por quincena; ¿50/50?) · masa de bolsillo vs costo · carpeta de proveedores en Drive y destino de los
194 comprobantes (H2/H3 del puente) · vincular `drive_carpeta_id` a Adicional tercer muro, Playón
azufre y Playón dilución · abrir la cartera de ARCOR por obra y cargar su CUIT · alta de Saint-Gobain
(303 docs) y Orica (46) como clientes · OC 351/1923/1984/1985/2135 de Messina: pedirlas a Isabel
Villanueva · nota de Rodrigo 10/09 ($24.489.076) sin registrar en Cobranzas (F69 −590.359, F34
−4.177, tanque N $2.829.000 sin fila) · H78 anotación → Notas, I46 «BSA», contratado real de ME - BSA
(H93) · fusionar `bsa-adicional` → `messina-bsa` · las 5 personas del FCL fuera del padrón · pedir a
Santander el nro de acuerdo FUR (producto 012) si se quiere el txt · las 3 filas de Compras con caja
doble (Robles, Hormisuelo, Rodriguez) y $3,5 M «Efectivo» que salieron por banco (auditor).

**P2**: `libro-sueldos` fuera de las raíces del índice de Drive · `Retención · OP 42773` sin OP ·
`cliente_orden.cita` NULL en las 12 OP (qué facturas paga) · dos tablas de papeles del cliente
(`cliente_documento` 113 vs `documento_cliente` 41) → H2 del puente · 17 `esquema_pago` huérfanos ·
verificar tras la corrida de las 14:50 que Cash Flow refleje M32 (may −6,7 M), fila 55 (jul −4,3 M /
ago +4,23 M) y los eCheq 29169042/514 en Cheques Recibidos · auditor de cierre para Clientes v3 y
portal (construidos y probados, sin tercero) · `rotulos-de-frescura` y demás rojos preexistentes.

## 7. ESTADO GIT

- `main` = origin/main; producción en el mismo commit (último pull tras el merge de Clientes).
- Worktrees vivos: `wt-banco` (`fix/banco-saldo-declarado-echeq-48hs`), `wt-obras-usd`
  (`fix/obras-contratado-usd-y-moneda`). El resto se eliminó al mergear.
- Migraciones: todas las del repo aplicadas (últimas `20260910T1930_drive_index_ausente_md5`,
  `20260910T2010…retencion…`, `20260910T2020…cobranzas_sin_pdf`); las de wt-banco/wt-obras-usd, si
  las hay, están SIN aplicar.

## 8. PRÓXIMO PASO

Mergear `fix/banco-saldo-declarado-echeq-48hs` (aplicar su migración si la trae) → re-importar el CSV
del 10/09 → `mantenedor-flujo-de-fondos` regenera `_BANCO_RAW` → `_MOVIMIENTOS` → CAJA (saldo 10/09 =
$3.584.941,27) → Cash Flows; verificar las cifras de §6-P2. Luego mergear el fix de OBRAS y mirar
Quattropani/BSA en la corrida siguiente.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
