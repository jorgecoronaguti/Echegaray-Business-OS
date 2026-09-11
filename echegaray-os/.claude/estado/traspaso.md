# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-11 ~17:25 (hora local −03) · main = producción_

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

## 4. ESTADO ACTUAL (11/09 17:25)

- **main = producción** en fd209523+ (Vercel Ready 16:44 con Liquidación; checkout prod fd209523; bot
  worker/ws/gateway reiniciados 17:14 con el arreglo de conexión, `latido_ms` visible).
- **HF §6/§7 cerrados** (396e9c07; doc + evidencia + candado). Plan PRO de HF: decisión del dueño.
- **Compras**: batch 1 aplicado (39 filas nómina, $126,8 M a 0). **Hito libro fuentes propias
  MERGEADO (fd209523)**, auditor FIRMA CON LÍMITES: de las 78 filas del batch 2
  (`datos/respaldos/compras-batch2-2026-09-11.json`) sólo 23 se pueden vaciar hoy; excluir 41 con fecha
  < 01/06 (extracto empieza 28/05), gremiales jun–ago f434 f437 f438 f445 f457 f460 f463 f465 f471,
  SAC junio f452–f455, f836 Colegio. f481/f482 (SAC dic) sí. **Pendiente: aplicar batch 2 (23 filas)
  con `compras-marcar-eliminado.mjs --lista` DESPUÉS de que la corrida 18:50 corra con fd209523 y
  CFM/CFS no bajen.** Simulación reproducible: `scripts/libro-simular-sin-compras.mjs --lista … [--desde]`.
- **Cash Flow Mensual**: tarjeta de cierre recuperada (16:50: $89.069.952; «Valores en cartera» sep
  $38.572.526 = e-cheq retenidos, 0a11cb09). Corrida 16:50 salió exit 1 por aviso del libro «Oficina
  renglón 8 PAGADO 814.500 y PROYECTADO 2.792.300 a la vez» (dato correcto, vale el pagado): revisar
  en la 18:50.
- **Liquidación de horas**: 7 arreglos en prod (f26638f2: Pagos editable real, horas sin $, doble
  conteo, presencia-defecto, JORNALES 0 h, costo a la obra, cierre). Índice único
  `registros_hh_persona_unico_v2` aplicado (sin CONCURRENTLY) y registrado. **JORNALES → registros_hh
  corre cada hora** (`echegaray-jornales-registros.timer`, :20); importado 17:05 y corregido el alias
  genérico «mamposteria» (borrado de obra_alias): «LA ESTRELLA · MAMPOSTERIA» vuelve a la-estrella.
  50 días en conflicto planilla vs app (no se tocan; decisión del dueño: ¿JORNALES manda?).
  **En curso**: vista «Quincena» espejo editable de JORNALES (agente, rama feat/liquidacion-espejo-jornales)
  y QA visual de las 6 solapas en producción (agente).
- **CRM Clientes**: Cobranzas/cartera en prod. **En curso** (rama feat/obras-adicionales): obras
  «adicional» como subnivel de su obra mayor + bloque «Papeles» por obra (cotizaciones, contrato, OC,
  planos, HyS) con tabla `obra_carpeta_drive`; migraciones 20260911T2000/2100 a aplicar desde main.
- **Santander Ochoa/Castillo**: datos cargados al legajo, borrador `r3486391276892624298` en Gmail de
  jorge@ listo para enviar; falta el modelo `archivo_modelo_alfa_74a1cd27d2.xlsx` (VM no llega a
  santander.com.ar: pedirlo adjunto en el chat). Faltan tel/mail/estado civil de ambos y DNI de
  Castillo: no existen en Drive ni Supabase.
- **HyS**: 14 reportes MASS (22 archivos) en Drive `Reportes de gestión HyS/` (id 1ECkqlSV30-FNSYecdEp-A-0zV4Y8MSaT).
- **Transferencias a proveedores**: importador diario 07:15 sólo jorge@ (6 comprobantes/4 prov.).
  Corrida sobre rodrigo@ con `--aplicar` en curso (Monitor); si vuelve a fallar por cuota Gmail, repetir
  con `ORQ_GMAIL_CUENTA=rodrigo@ecsas.com.ar` cuando no haya otro agente usando Gmail.
- **Bot / comprobantes**: worker colgado 23 h (10/09 17:59 → 11/09 16:42); arreglado en 8f0b6df2.
  Fajo 438fcb2a cargado (6 comprobantes, Compras f949–954).
- **Baseline HF-web** (scratchpad `baseline-hf-web/`): Documentos web acierta 2/30 (ilike de la frase);
  motor léxico del chat 19/30 → portarlo a la web es la ganancia; e5 cubre 12 % del data room.
  XSAS web: 0 pedidos desde 03/09; gateway vivo y túnel coincide.
- **Proveedores (Sheet)**: «Se le debe» = Compras!AL exacto ($15,33 M). Falta que el dueño diga
  proveedor y número esperado.
- **Deuda**: `orq:test` rojos en main (+ `proyeccion-convenio.test.mjs`); tc canario; `obra_costo_real`
  MO por obra debe salir de JORNALES; sonda de antigüedad de `comunicacion.inbox`.

## 5. TRABAJO DE ESTA SESIÓN (11/09 tarde)

396e9c07 HF · d3cb3c71/338b799d/337aa54c/d4ee0d23 bisturí+batch 1 · 0a11cb09 e-cheq retenidos ·
c9446cf3/14d61774 HM=libreta IERIC · 94ceed37+f26638f2 Liquidación · 8f0b6df2 worker · fd209523 hito
libro fuentes propias · timer jornales-registros · alias «mamposteria» borrado · migración T1800 aplicada.

## 6. PENDIENTES REALES

**P0** — corrida 18:50 con fd209523: CFM!M50 y CFS!BB50 no bajan; libro sin aviso nuevo → aplicar batch 2
(23 filas) → corrida 20:50 confirma. Cerrar agentes en curso: QA visual Liq → corregir bloqueantes;
vista Quincena; CRM adicionales+papeles (aplicar migraciones desde main, correr script de carpetas).
**P1** — Rodrigo transferencias; Santander modelo del banco; libro aviso Oficina; MO por obra desde
JORNALES; Documentos web con motor léxico; `pantalla_obra()`; Cargas Sociales/Impuestos verificar en el
Sheet escrito (límite 4 del auditor); sonda inbox; `proyeccion-convenio.test.mjs` rojo.
**P2** — decisiones del dueño: ¿JORNALES manda sobre la app en días en conflicto? · menú lateral de
Liquidación · Proveedores número esperado · plan PRO HF · extractos ene–may · Mis Facilidades ARCA.

## 7. ESTADO GIT

main = origin/main ≥ fd209523 · worktrees vivos: wt-compras (feat/libro-fuentes-propias, mergeada),
wt-adic (feat/obras-adicionales, agente), wt-jornales (feat/liquidacion-espejo-jornales, agente).

## 8. PRÓXIMO PASO

Esperar 18:50 → verificar → batch 2 (23 filas) → 20:50 verificar. Desplegar lo que los agentes cierren
con tests, bloque por bloque.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
