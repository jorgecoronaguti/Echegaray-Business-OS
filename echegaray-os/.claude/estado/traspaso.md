# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-10 ~15:45 (hora local −03) · main `b427ade7` · producción = main_

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

## 4. ESTADO ACTUAL (10/09 15:45)

- **Publicado hoy en main y producción** (todo mergeado, worktrees eliminados): Personal uniforme +
  filtro por obra + Liquidación (proyección, 50/50) · solapa «Asistencia» → «Horas» (`b427ade7`) ·
  Clientes v3 · portal (fusionadas, cuenta corriente, esquema) · bot de comprobantes · importador OC/OP
  (2 casillas) · Puente Drive H1 · FCL «PAGO SIMPLE AFON» + skill · fix banco (saldo declarado, eCheq
  48 h; `95fee905`) · fix OBRAS (contratado U$S×TC, moneda; `9f795036`) · **Realidad única H1**
  (`deffba9f`): vista `public.cliente_economia` + `es_cobrada()` (migraciones 20260910T2100/2110
  APLICADAS), registro `orquestador/datos/definiciones.json` + `docs/engineering/DEFINICIONES.md` +
  test canónico `src/shared/definiciones/canonico-definiciones.test.ts` (prohíbe leer
  `monto_contratado` fuera de la fuente). `/clientes` ya lee la vista: Quattropani $95.270.932 (antes
  $1.504), barra de cobro del cliente viva.
- **Datos**: A.C.SAT = RSV · OC Messina por obra · Cobranzas corregida por orden del dueño (M32, fila
  55, W notas, W refs OP) · extracto 10/09 importado y cadena rehecha · UOCRA 08/2026 pagado por DEBIN
  $994.941,26 (comprobante en Drive `archivo-fiscal/2026/UOCRA/`, id `1EjfU-AyBiuRrgEViQW60rgzb-V1FiVKI`;
  débito en `banco_movimientos`) · ARCOR: 40 OC reales subidas a Drive (`PRESUPUESTOS - CLIENTES/ARCOR -
  SAN JUAN/<obra>` y `ORDENES DE COMPRA`), 8 filas nuevas en `cliente_orden`; informe en
  `/tmp/claude-1001/arcor/`.
- **Pipeline Flujo de Caja en rojo (exit 1) desde las 11:12, igual a 13:13 y 15:13**: tres auditores
  de presentación (`auditar-pantalla` 1 defecto en Cash Flow Mensual, `auditar-diseno-unificado`,
  `auditar-cobertura-cash-flow`), «datos OK». Preexistente, no lo causó ningún despliegue de hoy.
- `orq:test` rojo por 8–17 tests preexistentes (generadores Sheet, RLS/security_invoker, regla-cero).

## 5. TRABAJO DE ESTA SESIÓN (10/09 09:30 → en curso)

Sesión larga con muchos agentes en paralelo. QA independiente del portal de los 5 clientes
(hallazgos en `/tmp/claude-1001/qa-portal/`, 9 puntos) → en corrección. El dueño reclamó varias veces
por Clientes (datos falsos, UX) y por Cobranzas (nota Rodrigo 10/09 sin cruzar).

## 6. PENDIENTES REALES

**P0 — agentes en curso al cerrar** (si la sesión corta, sus ramas quedan sin mergear; retomar):
- `fix/clientes-v4-datos-y-ux` (wt-clientes-v4): quitar columna Margen (orden 15:33), barra de cobro
  POR OBRA (hoy «—»), sacar «Datos faltantes» y el «5» suelto, «11 obras» vs 5 listadas, OC c/IVA vs
  contratado neto, chips monoespaciados, ARCOR triple «sin obra». Skill `diseno-ui-ux-producto-os`.
- `fix/portal-5-clientes` (wt-portal-fix): Quattropani pagos duplicados (espejo ARS visible filas 61/63),
  Messina `esquema_pago` desactualizado vs `cobranzas` (encadenar sync o leer vivo), «RECLAMAR OC!»
  publicado a ARCOR, dos definiciones de «obra terminada», SF Pisos Industriales duplicado huérfano,
  /portal/terminadas «0 obras», saludo con alias. Puede dejar SQL de datos en
  `/tmp/claude-1001/portal-fix/datos.sql` (aplicar desde main).
- Cobranzas (agente de datos, desde main): nota Rodrigo 10/09 (Platea Azufre 50 % 18.159.641 ·
  Cancelación Pilón 3.484.558 · Cancelación TK 23 bases 2.844.877 = 24.489.076) → cruces; FC A
  0001-00000230 Quattropani (neto 5.262.600 cobrado, IVA 1.105.146 adeudado → fila nueva ligada al
  próximo pago; PDF a Drive + `documento_cliente` visible en portal); conceptos ARCOR I5/I6/I8/I9/I10.
  Respaldo en `/tmp/claude-1001/cobranzas-1009/`. Al terminar corre sync-cobranzas + sync-esquema.
- `fix/ordenes-cliente-clasificador` (wt-ordenes-clasif): 108 filas ARCOR que no son OC → `otro`;
  número leído del PDF; baja `ORDEN DE COMPRA ECSAS.pdf`; migración `drive_file_id` en `cliente_orden`
  (APLICAR desde main) + backfill desde `notas`; `clientes.drive_carpeta_id` ARCOR (hoy apunta a SECONDI).
- `feat/cargas-pagadas-desde-banco` (wt-cargas-banco): «gremial pagada» = débito en `banco_movimientos`
  al CUIT del organismo (UOCRA 30-50304909-7; IERIC; FCL «fondo desempleo»), precedencia banco >
  Compras > declarado > proyección; registro en definiciones.json.
- `feat/puente-drive-h2` (wt-drive-h2): archivos de `drive_index` en cada ficha (obra/cliente/proveedor/
  persona) + copia app→Drive en cola idempotente + resolución de carpeta por entidad. Migraciones a aplicar.

**P1 — del dueño**: invitar a alguien al portal de Messina, La Estrella y ARCOR (0 accesos) · ME - BSA:
5 OC $49.886.583 vs Cobranzas $14.120.243 y sin precio en OBRAS · ARCOR: qué obras dar de alta para
las 17 OC sin carpeta; OC 53239036 facturada al 50 % ($3.286.884,46 sin facturar); 30 OC
anteriores a 12/2025 ($317 M) sin fila en Cobranzas (no cargar como pendientes) · Oficina en la
proyección · `drive_carpeta_id` de Adicional tercer muro / Playón azufre / Playón dilución · alta
CICON, Saint-Gobain, Orica · OC 2135 sin PDF · 5 personas del FCL fuera del padrón · nro de acuerdo
FUR (producto 012) · 3 filas de Compras con caja doble (Robles, Hormisuelo, Rodriguez).

**P2**: pipeline Flujo de Caja: los 3 auditores de presentación en rojo · `orq:test` rojos preexistentes
· `certificado_cliente.estado` → vista derivada (H4 en DEFINICIONES.md) · `estadoDePago()` en
`cobranzas-a-cliente.mjs` contradice `es_cobrada()` (fecha futura) · D1/D2 del PRP realidad única ·
pie de Pagos del portal en moneda del contrato (excepción declarada) · auditor de cierre para
Clientes v4, portal y RU H1 (sin tercero) · `libro-sueldos` fuera de las raíces del índice · 17
`esquema_pago` huérfanos.

## 7. ESTADO GIT

- `main` = origin/main = producción (`b427ade7`).
- Worktrees vivos en `/home/jorge/echegaray-os/worktrees/`: `wt-ru-h1` (mergeado, eliminar),
  `wt-clientes-v4`, `wt-portal-fix`, `wt-ordenes-clasif`, `wt-cargas-banco`, `wt-drive-h2`.
- Migraciones: todas las de main aplicadas (últimas 20260910T2100, 20260910T2110). Las de los worktrees
  en curso, SIN aplicar hasta mergear (`aplicar-migracion.mjs <archivo>` ensayo → `--aplicar`, desde main).

## 8. PRÓXIMO PASO

Recibir cada agente de §6-P0 → aplicar su migración si trae → mergear → `git push origin main` → pull
en `~/echegaray-os/produccion/echegaray-os` (fuera de una corrida del pipeline; reiniciar worker/ws si
tocó el bot) → capturas de verificación → avisar al dueño con celdas/ids. Después: auditor de cierre
sobre Clientes v4 + portal; los 3 auditores del pipeline.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
