# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 ~17:00 (−03) · main = producción (1dcb8053)_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (qa-visual / auditor) · responder al dueño por el bot (avisar-al-dueno.mjs)

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs`. Sheet: `makeGoogleClient({config: loadConfig(), scopes: READONLY_SCOPES}).readSheetGrid(ID, rango)` → `.filas`.
- Adjuntos del dueño: del JSONL de la sesión (buscar `media_type` recursivo, también en registros `attachment`).

## 4. CERRADO HOY (14/09) — EN PRODUCCIÓN

- **Liquidación (varias subidas; última 4988137e):** blanco+negro (recibo real / estimado por mediana), horas únicas Horas=Liquidación (presencia-defecto y licencias cuentan), plantel por quincena, orden de JORNALES, Cobra total fija, TODAS las celdas editables (manuales en `liquidacion_linea`: `*_manual`, `negro_manual`, `horas_manual`, `horas_recibo_manual`, `valor_hora_recibo_manual`), Escape/Enter/Tab, sin spinners, Efect. red. guarda con clave de servicio (antes 42501), Cmd/Ctrl+Z en la plataforma (`src/shared/components/deshacer`). Migraciones 2100, 2300, 0100, 0300, 0400, 0510 aplicadas.
- **Recibos 2026** en `recibo_sueldo_linea` (299; costo empleador jul–ago en 82, invariante al centavo).
- **HH de obra CRM** = todas las horas trabajadas (`hh_que_cuentan_en_obra`, 0200). Desempate de asignaciones (`asignacion-del-dia.mjs`). Espejo JORNALES poda bloques corridos.
- **Proveedores → Comprobantes** (vista `proveedor_compra`, 0500) — 1dcb8053.
- **Candados:** Nómina, Cargas Sociales, Jornales por Quincena, Cheques Emitidos.
- Obras renombradas «CÓDIGO - NOMBRE» (14 filas, respaldo en scratchpad `respaldo-obras-renombre-20260914.json`).

## 5. EN CURSO (agentes, worktrees)

- `feat/liquidacion-blanco-negro`: aviso «sin recalc.» → recálculo si estimado / ícono si real; quitar toast «Nada para deshacer».
- `fix/obras-codificadas`: importador HH pierde resolución por nombre tras el renombre (8 filas A MOVER) — objetivo 0 diferencias fila por fila; + código interno `OB-0001` inmutable visible en toda la app; + lista de obras faltantes (no crear).
- `feat/costo-mo-por-obra-unico`: fórmula única de costo MO (costo empleador recibo + negro; jefes medio sueldo/quincena; licencias a obra asignada; sellado por quincena) + columna **Subcontratos** en CRM + cotizado único y compras de obras cerradas vs obra general.
- `fix/cronologia-asignaciones` (6ade0a5e): auditor RECHAZA sólo por falta de prueba RLS como usuario de la migración 0310 (recrea vistas/funciones/policy sobre `obra_asignacion_vigente`). Correr `scratchpad/rls.mjs` FUERA DE HORARIO (locks sobre personas), aplicar 0310 ANTES del deploy.

## 6. TIMERS DETENIDOS (reactivar con criterio)

- `echegaray-flujo-caja.timer` — detenido 15:12 (el dueño se quejó de barridas); preguntar si se reactiva (sus pestañas están candadas).
- `echegaray-jornales-registros.timer` — detenido 16:06 hasta que `fix/obras-codificadas` dé 0 diferencias en el ensayo.

## 7. PENDIENTES DEL DUEÑO

Reactivar flujo-caja · Tello y Ochoa con recibo Q2-08 sin transferencia · Oficina 26 dos bloques en febrero · probar guardar un Efect. red. en 01/09 y verificar en base · Castro/Moreno/Quiroz baja 12/08 con recibo Q2-08 · Ochoa alta 26/08 con horas en marzo · SF $152 M y LE $30 M de Cobranzas sin obra · U$S 15.400 Quattropani sumado como pesos.

## 8. PRÓXIMO PASO

Integrar lo que terminen los tres agentes (QA → merge → migraciones → deploy → bot). Reactivar el timer de JORNALES tras el ensayo en 0. RLS de cronología fuera de horario.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
