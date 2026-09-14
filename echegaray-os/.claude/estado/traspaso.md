# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 ~11:30 (−03) · main = producción_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño (mails a clientes, lo que ve un cliente) · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (auditor-de-cierre / qa-visual) · responder al dueño por el bot (avisar-al-dueno.mjs)
- **El dueño: «respetar lo que manda app.ecsas.com.ar»** — la app es la referencia; JORNALES da horas y plata.

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs` (`query`, `withTx`).
- Adjuntos del dueño: NO llegan a disco; se sacan del JSONL de la sesión (memoria `adjuntos-estan-en-el-transcript`).
- Sheet Flujo de Caja: `ORQ_CASHFLOW_ID` o `1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`.

## 4. CERRADO HOY (14/09) — EN PRODUCCIÓN, CON EVIDENCIA

- **Conciliación bancaria:** extracto 14/09 cargado, `auditar-saldo-banco` CIERRA $39.012.283,70. Clave del
  movimiento = (cuenta, referencia, importe, FECHA) (migración 20260914T1400; importar-banco la re-aplica última).
  Echeq 308 Pagado, 381 Aceptado, físicos 320/321 DEBITADO=SI (leído en el Sheet).
- **Cobranzas «vencido» = columna Q/U del Sheet** en ficha, cartera, cuenta corriente, OBRAS y portal (migración
  20260914T1200 aplicada; auditor firmó). 3 cuotas duplicadas del portal ocultas (`visible_portal=false`, decisión dueño).
- **Portal:** acceso dentro de la ficha de cada cliente (cabecera «Ver portal ↗ · Accesos al portal», todas las
  solapas; NO en la lista); «próximo» marca todos los pagos del mismo día; cotizaciones de Drive en Presupuestos.
- **CRM documentos:** carpeta del cliente sin tope de 300 (ARCOR 542/542).
- **HH de obra:** la OBRA del día la dan TODAS las asignaciones de la app (también las reconstruidas); excepción
  «galpón 9 es La Estrella» (obra general del mismo cliente); dos obras el mismo día → JORNALES. Horas sin fecha
  de JORNALES → obra del renglón, último día del bloque (248 h). Lo corregido a mano en la web gana (memoria
  `web-gana-alcance-liquidacion`). Deploy c9a38335; verificar corrida 11:20 (Rosales en Quattropani 01–10/09).
- **Liquidación v1** + marca «−N% bajo básico UOCRA» (en producción; el dueño la rechaza → §5).
- **Datos:** convenio_escala desde uocra_escala; Petina=oficial, Castillo=ayudante (memoria categorías).

## 5. EN CURSO

- **Liquidación P0** (agente, rama `feat/liquidacion-cuadro-jornales`, worktree `.claude/worktrees/liquidacion-jornales`).
  Pedidos del dueño: TOTAL QUE COBRA cada persona a la vista (banco / efectivo, acuerdo 50/50 claro); $/h editable
  fácil en la celda + corregir en la misma quincena abierta (con registro); historial de $/h; sacar columna
  «Planilla»; extras como JORNALES (fórmula normal+extra×coef); Rosales: no contar `web:presencia-defecto`
  (11/09 8 h en Quattropani); no quitar nada. Memoria `liquidacion-rediseno-pedido-1409`. Al terminar: QA → deploy.
- **Ficha Obras a 390 px** (rama `fix/ficha-obras-390`, a9656aac, en QA): fila de gastos sin obra con scroll propio.

## 6. PENDIENTES

**Del dueño (FALTA_DATO):** 70 h del 11/06 (Alaniz/Agüero/Rosales) · Agüero bloque 18/05: vale 80 h, lo corrige él
en el Sheet · horas jefes 08/08–31/08 · Mis Facilidades ARCA (multiplicador 1,6713 = estimado) · Messina fila 89
(¿2º 50% OC 279 o duplicado?).
**Decidido «nada/nadie»:** 26 carpetas de cliente sin CRM · accesos portal Messina/ARCOR/La Estrella (por ahora).
**Técnico:** ~110 worktrees (`node scripts/higiene-worktrees.mjs` cuando no haya agentes) · 11 filas de
`esquema_pago` sin fila viva («a confirmar» en el portal) · ficha Esquema y pantalla 28 van un sync atrasadas ·
4 débitos de cheque sin número · `obra-cuenta.pg.test` Quattropani (redondeo, ya fallaba en main).

## 7. ESTADO GIT

- main = origin/main = producción VM: b5669ef6 (+ este traspaso) · ramas abiertas: §5

## 8. PRÓXIMO PASO

Cerrar QA de `fix/ficha-obras-390` → deploy. Verificar HH en la base tras la corrida 11:20. Liquidación P0: QA → deploy.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
