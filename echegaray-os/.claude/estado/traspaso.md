# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-09 · main `9e30ba55` = origin = checkout de producción_

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
- Asistencia: **presencia es un estado, nunca se deduce de horas**; horas es una cantidad aparte.
  Ausencia/licencia son de la PERSONA (sin obra). Ausencia sin motivo = 0 h; con motivo que paga =
  jornada (`jornadaPorDefecto`: 9 h L–J, 8 h V). Un día nunca suma dos veces.

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones
→ datos y conocimiento ECSAS → ejecución → verificación → respuesta/acción. El Reasoner interviene
sólo cuando lo determinístico no alcanza.

Piezas: web por Vercel desde `main` (app.ecsas.com.ar) · Supabase fuente única (RLS; toda columna
nueva necesita GRANT) · orquestador (`orquestador/lib|scripts|comunicacion`) con timers de usuario
(flujo-caja 2 h, compras-sync 10 min, asistencia-obra 6 h, espejo-legajos, cobranzas-sync) · Sheet
«Flujo de Caja - Cash Flow» regenerado por pipeline · bot @os en Mattermost (worker + ws) · gateway XSAS.

**Deploy backend = push a origin main + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only
origin main` + `systemctl --user restart echegaray-comunicacion-worker echegaray-comunicacion-ws` si
cambió el bot.** Producción es OTRO checkout: pushear NO lo actualiza, y los timers corren desde ahí.
Código siempre en worktree con ruta ABSOLUTA desde `~/echegaray-os/app`; **mergear desde el checkout
principal, nunca desde adentro del worktree** (la trampa mordió 3 veces). Sheet real NUNCA desde un
worktree. **Antes de buscar nada: `.claude/MAPA.md`.**

## 4. ESTADO ACTUAL

- **Módulo Asistencia publicado y verificado en producción** (grilla quincena, presencia móvil,
  ausencia/licencia por tramo sin obra, «Horas que corresponden», plan de obra a futuro con
  «programar cambio», cargar horas declara presencia, jefes no se marcan a sí mismos). Migraciones
  T1700–T2400 aplicadas. Tablas clave: `registros_hh`, `asistencia_dia` (origen declarada|horas),
  `obra_asignacion` (desde/hasta), `obra_canonica` (estado, fecha_fin).
- **Compras app**: columna «A pagar» (= col. Q del Sheet), orden por carga, espejo `compra_sheet`
  inmediato tras cada carga + timer 10 min. Canal único de comprobantes: `comprobantes-gastos`.
- **CAJA**: gráficos a 68 filas, verificado en la hoja viva después de la corrida de las 08:50 del 09/09
  (`caja-graficos-verificar.mjs` ✓). El verificador va al FINAL del pipeline.
- **Navegación sin recarga** entre secciones (Link en vez de `<a>`; invariante).
- **Regla «no asignar a obra cerrada» por fecha** (publicada 09/09): `obra_canonica.fecha_fin_real`
  manda; día ≤ cierre arma historial, el tramo se recorta al cierre; invariante
  `asignacion_termina_despues_del_cierre_de_la_obra`. Historial reconstruido con `--aplicar` desde
  producción (4 borradas / 4 insertadas, 257 filas, 2 rojos que son decisión del dueño).
- **Vercel Function Storage**: bundle serverless 85,6 → 43,8 MB (`outputFileTracingExcludes`) y
  `ignoreCommand` (1 de 4 commits no despliega) en main desde `9e30ba55`. Efecto real en el dashboard
  aún no medido; causa raíz viva: `orquestador/lib/config.mjs` deriva `APP_DIR` y el trazador arrastra
  el directorio entero. Vercel no tiene token en la VM.
- Persona de prueba: `e2e00000-0000-4000-8000-000000000001` (es_prueba), obra `prueba-e2e`.
  Accesos reales rodrigo/hys/ingenieria: `test123`. QA jefe `qa.jefe.obra@ecsas.com.ar`/`TestJefe123!`.
- Protecciones: firma por pestaña (ORQ_AUTOCANDADO) apagada a propósito; pestañas Compras/Cobranzas/
  CAJA/Cheques intocables por generadores salvo gráficos de CAJA; AC/AD/AE/AF/AJ de Compras nunca se escriben.

## 5. TRABAJO DE ESTA SESIÓN (08/09 tarde → 09/09 mañana)

- Asistencia: presencia ≠ horas en todas las pantallas; ausencia/licencia sin obra y por tramo;
  liquidación por motivo (`liquidacionDeAusencias.ts`); presente carga jornada; horas declaran
  presencia; plan de obra a futuro; diseño de la grilla (ancho 100 %, A/L al eje, Persona sticky).
- Datos: obra por persona/día según pestaña ASISTENCIA del Sheet (152 filas corregidas); importador
  `asistencia-obra-por-dia.mjs` + timer + invariante `invariantes-asignaciones.mjs`.
- Compras: «A pagar», orden por carga, espejo inmediato, vínculos de adjuntos recuperados, filas
  863/924 vinculadas (mismo CAE; MASS CUIT cargado). Messina OP 5146/5156: PDFs en Drive, eCHEQ en
  Cobranzas/Cheques Recibidos, retención repartida.
- Infra: symlink `node_modules` retirado del repo (rompía Vercel); CAJA 59→68 filas; Tailwind con
  `<alpha-value>`; tests de cortes por ancho.
- Último commit en main: `f27a7195` (Merge fix/caja-59-filas-culpable). Producción igual.

## 6. PENDIENTES REALES

**P0 — verificar en producción (efecto, no intento)**
- Después del deploy de `9e30ba55`: bajar un recibo real desde el portal (`/portal/recibo/[id]` es la
  única ruta que las exclusiones de traza pueden romper) y leer Function Storage en el dashboard.
- Dueño: borrar deploys viejos en Vercel (pasos en `docs/engineering/DEPLOY.md`) y revisar que
  Settings → Git → Ignored Build Step no pise el `ignoreCommand`.
- Dueño: Pastrán y Zogbe asignados a le-galpon-9 hasta 07/09 con cierre 03/09 (cargados por la web):
  corregir la imputación o mover la fecha de cierre.

**P1 — decisiones del dueño abiertas**
- Messina: aceptar 6 eCHEQ en Santander; fila propia para $38.462,45 «a cuenta».
- Quiroga 28–31/07 (ausencia 8,8 h vs enfermedad 0) y 08/09 (web 9 h normal vs planilla enfermedad).
- Dupec 912/913 sin pago probado; IVA base col. P vs C; deuda sin acreedor $14,3M (Tello/Fredes/
  Sersolin/RSV); DDJJ IVA agosto. (Arrastrados del 07/09, no revisados hoy.)

**P2**
- `jornales-a-registros-hh.mjs` aún escribe jornada en ausencias importadas (la regla de lectura la
  valoriza a 0; no rompe, pero es dato sucio). `/clientes` a 390 px estrangula la columna nombre.
  Plantel/Proveedores/Cartera caen a 2 columnas ya en 1024. Cotizador: cotizar plano nuevo desde el
  navegador sin probar. Limpiar los ~100 worktrees viejos (`node scripts/higiene-worktrees.mjs`).

## 7. ESTADO GIT

- Rama `main` · HEAD `9e30ba55` (+ este traspaso) · igual a `origin/main`.
- Árbol: limpio salvo capturas `qa-shots/verif-opacidad*` y `tests/verif-opacidad2.spec.ts` sin
  seguimiento (descartables).
- Producción (`~/echegaray-os/produccion/echegaray-os`): `9e30ba55`, igual a main. Sin ramas pendientes.

## 8. PRÓXIMO PASO

Verificar el efecto del deploy `9e30ba55` en Vercel: descargar un recibo real desde el portal y leer
Function Storage en el dashboard. Si falla el recibo, el sospechoso es `outputFileTracingExcludes` en
`next.config.ts`.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
