# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 ~tarde (−03) · main = producción (7ade4237)_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (qa-visual / auditor) · responder al dueño por el bot (avisar-al-dueno.mjs)
- «Respetar lo que manda app.ecsas.com.ar».

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs`.
- Adjuntos del dueño: del JSONL de la sesión.

## 4. CERRADO HOY (14/09) — EN PRODUCCIÓN

- Conciliación bancaria, cobranzas «vencido» = col Q/U, portal en la ficha, CRM docs, HH obra por asignación (ver commits de la mañana).
- **Liquidación de horas (varias subidas, última 7ade4237, QA de tercero 11/13 OK):**
  - Sueldo obrero = BLANCO (recibo: horas × $/h categoría → neto banco) + NEGRO (horas que el recibo no cubre × $/h negro editable). Sin recibo: mitad de horas × piso, neto est. por mediana neto/bruto (propia o plantel). Total = neto + negro; efectivo = total − neto − adelanto − transferido.
  - Tabla `recibo_sueldo_linea` (migración 20260914T2300 aplicada): 299 recibos 2026 leídos de PDF (`recibos-detalle-importar.mjs`), netos = nomina_recibo_neto al centavo.
  - UNA cuenta de horas (`horasDelDia`) para solapa Horas y Liquidación: presencia-defecto CUENTA, licencias pagas SUMAN (decisión dueño). Extras: coeficiente sólo en la plata.
  - Mensuales aparte en el pie; quincena cerrada: negro = total sellado − neto. «Más» = 3 secciones fijas.
  - Recibos con PDF (documentacion_legajo), efectivo redondeado sugerido a miles, Rosales convenio UOCRA (dato corregido con respaldo).
  - Migración 20260914T2100 (persona_tarifa_correccion) aplicada.
- Memoria: `liquidacion-rediseno-pedido-1409` tiene todas las decisiones del dueño.

## 5. EN CURSO

- Agente en `feat/liquidacion-blanco-negro` (worktree `.claude/worktrees/blanco-negro`): **plantel de cada quincena** (actividad en la quincena o alta vigente; bajas marcadas «ya no está»; proyección futura sigue con plantel actual) + warning de hidratación intermitente de `CeldaRedondeo` + tabla sellada de Cierre a 390 px. Al terminar: QA qa-visual → merge → deploy → bot.

## 6. PENDIENTES

**Dueño:** revisar $/h negro de cada obrero antes de cerrar 01/09 (era la tarifa total en JORNALES) · días 11/09 y 14/09 cuentan (marcar en Horas quien no fue) · González Carlos licencias 14 y 15/09 · Alaniz sin recibo Q2-08 bajo su CUIL · 4 recibos Q2-08 con CUIL sin persona (20382188153, 20245269561, 20309892756, 20449917848) · 70 h del 11/06 · Agüero 18/05 · jefes 08/08–31/08 · Mis Facilidades ARCA · Messina fila 89.
**Técnico:** HH de obra: desempate de asignaciones superpuestas (más específica/más reciente) · ~110 worktrees (`node scripts/higiene-worktrees.mjs` sin agentes corriendo) · panel: historial $/h marca negro vs básico en rojo · buscador: clic muy rápido en «Mensuales» puede arrastrar `buscar` viejo · vacaciones/SAC del recibo en días no suman horas_blanco.

## 7. ESTADO GIT

- main = origin/main = producción VM: 7ade4237 · rama abierta: `feat/liquidacion-blanco-negro` (§5).

## 8. PRÓXIMO PASO

Esperar al agente del plantel por quincena → QA → deploy → aviso por bot. Después, desempate de asignaciones en HH de obra.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
