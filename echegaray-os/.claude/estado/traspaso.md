# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-10 09:25 (hora local −03) · main `bde88c0c` = origin · producción `ecd69cd8` (sólo docs de diferencia)_

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
- Compras · Cobranzas · CAJA · Cheques Emitidos/Recibidos: el OS no las edita (única excepción: el
  flujo del bot que carga comprobantes en Compras; nunca escribe AC/AD/AE/AF/AJ).

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar) · Supabase fuente única (RLS ≠ GRANT; toda
columna nueva necesita GRANT; PostgREST corta en 1.000 filas sin error → leer paginado) · orquestador
(`orquestador/lib|scripts|comunicacion|handlers`) con timers de usuario (flujo-caja cada 2 h a las
:50, compras-sync, gmail-ordenes, gmail-transferencias, arca-sync, asistencia-obra) · Sheet «Flujo de
Caja - Cash Flow» regenerado por pipeline (`_MOVIMIENTOS` única fuente de los Cash Flow; snapshots
por corrida en `orq.sheet_snapshots`) · bot @os en Mattermost (worker + ws) · gateway XSAS.

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only
origin main` (fuera de una corrida del pipeline) + restart de `echegaray-comunicacion-worker/ws` si
cambió el bot.** Producción es OTRO checkout. Código siempre en worktree (ruta absoluta bajo
`~/echegaray-os/worktrees/` para UI; el scratchpad rompe `next dev`); mergear desde el checkout
principal. Sheet real NUNCA desde un worktree; migraciones sólo desde la sesión principal
(`aplicar-migracion.mjs <archivo>` ensayo, `--aplicar`). **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **Operativo en producción (web + Sheet)**: Sheet con Estructura · Materiales · Proveedores · Jornales
  · Cargas Sociales · Impuestos · Nómina en el layout unificado (auditor de diseño en 0); Cash Flow
  Mensual = Semanal, cierre dic-26 ≈ $62,0M explicado al peso (memoria `cash-flow-cierre-120-a-62-puente`);
  Liquidación de horas v2 completa en la web, SÓLO administrador (`liquidaSueldos()` + RLS), 12
  pantallas del handoff `/home/jorge/liqhs/`; Asistencia editable en el casillero (horas, estado,
  quitar presente, «sin novedad»); Compras web con adjuntos del canal (177/196 con papel; cruce por
  clave exacta c:/p:); Clientes en una pantalla `/clientes` con OC/OP por obra; Proveedores con
  contador «Comprobantes · histórico» y transferencias del Gmail; obras BSA - Planta y Pisos 120m2
  fusionadas (`fusionada_en`, alias).
- **Decisiones del dueño del 10/09 aplicadas** (memoria `decisiones-1009-obras-cheques-compras`):
  las 30 filas viejas de Compras se desestiman; sin contadores en la barra de nivel 2; cheques
  proyectados sólo si están en «Cheques Emitidos».
- **Sin aplicar todavía**: fix de cheques (§6 P1). Migraciones: todas las del repo están aplicadas
  (última `20260910T1900_obra_canonica_fusionada_en`).
- **Protecciones activas**: huella por celda y de formato en el Sheet (`sheet_huella_celda`; reponer con
  `yaGuardado`; `olvidar-huella-de-formato --todas` + regenerar cuando cambia el layout); generadores
  sin `--dry` ESCRIBEN el real; verificar en copia con `sheet-copia-prueba.mjs` (ORQ_CASHFLOW_ID).
- **Ruido conocido**: el timer del pipeline termina «failed» por auditores rojos preexistentes
  (`cheques-cobertura-sheet`, formato-pestanas); ~100 worktrees viejos (`scripts/higiene-worktrees.mjs`).

## 5. TRABAJO DE ESTA SESIÓN (09/09 → 10/09 09:25)

Sesión larga y autónoma. Entró a main y a producción (`ecd69cd8`): rediseño de las tres pestañas;
Liquidación v2 (solapas horas/pagos/costo/convenios/cierre/recibos, cierre que sella, tarifas de la
quincena anterior, carga de JORNALES 2026); Asistencia editable y «quitar presente» (T1200/T1830);
Liquidación Horas y Asistencia leen `registros_hh` por la misma función paginada; comprobantes por chat
(fusible por tarea, foto pesada se achica, respaldo 25 MB) y los 196 adjuntos del canal reconciliados;
Gmail → OC/OP de clientes y transferencias de proveedores; Clientes unificado; obras fusionadas
(T1900); altas de proveedores con CUIT validado; Barceló 0103-00003797 cargado en Compras fila 945.
Cash Flow: puente $120,4M → $62,0M cerrado; auditoría de doble conteo y proyección sin cambios de
fórmula (la nómina «mal proyectada» era un tramo de 5 días). Último commit de código `ecd69cd8`;
docs `bde88c0c`. Este cierre: agente de verificación de cheques detenido sin veredicto.

## 6. PENDIENTES REALES

**P0** — ninguno bloqueante del lado del OS.

**P1 — cheques proyectados sólo indicados**: rama `fix/cheques-proyectados-solo-indicados` (`c969e131`,
main ya mergeado adentro; mueve $2,56M de Machuca de Materiales Civil a su línea). La verificación en
copia quedó a medio hacer (línea base con código viejo no terminó). Mergear SÓLO si en la copia el
cierre dic-26 no cambia más que el residuo conocido ($184/$330) y Mensual = Semanal; luego push,
pull en producción y borrar rama + worktree `wt-cheq` del scratchpad.

**P1 — del dueño** (no avanzar sin su respuesta): NC Alumetal 0031-00002661 (−$1.095.076, obra
ambigua) y 0011-00014272 (sin importe fiable); obra/unidad de la fila 945; fila 932 Lliteras (CUIT);
8 ausencias sin motivo + 16 días sin cargar traban el cierre de la 1ª quincena de septiembre;
Oficina mensual contada en dos quincenas; botones «Copiar día anterior»/«Jornada completa».

**P2**: chips «sin medir/sin jefe» recortados en filas de obra con dos órdenes; `nomina-quincena.test.mjs`
rojo en main; limpiar worktrees y ramas `feat/*` mergeadas; confirmar corrida AfipSDK del 11/09 03:00
(`journalctl --user -u echegaray-arca-sync`).

## 7. ESTADO GIT

- rama `main`, HEAD `bde88c0c` = origin/main, working tree limpio.
- producción `~/echegaray-os/produccion/echegaray-os` en `ecd69cd8` (difiere de main sólo por el traspaso).
- rama pendiente: `fix/cheques-proyectados-solo-indicados` (`c969e131`), sin mergear.

## 8. PRÓXIMO PASO

Terminar la verificación en copia de `fix/cheques-proyectados-solo-indicados` (pipeline viejo vs nuevo
sobre la misma copia, comparar Cash Flow Mensual dic-26 y Semanal) y mergear o descartar con el
porqué escrito; después, pull en producción.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
