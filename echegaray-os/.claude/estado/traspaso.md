# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-14 ~10:20 (−03) · main = producción_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño (mails a clientes, lo que ve un cliente) · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (auditor-de-cierre / qa-visual) · responder al dueño por el bot (avisar-al-dueno.mjs)

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs` (`query`, `withTx`).
- Adjuntos del dueño: NO llegan a disco; se sacan del JSONL de la sesión (memoria `adjuntos-estan-en-el-transcript`).
- Sheet Flujo de Caja id: `ORQ_CASHFLOW_ID` o `1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`.

## 4. CERRADO HOY (14/09) — EN PRODUCCIÓN, CON EVIDENCIA

- **Liquidación v1** (un cuadro + «Más», filtro «Cobra», buscador, «estimado» en costos, marca «−N% bajo
  básico UOCRA»). El dueño la RECHAZÓ igual → ver P0.
- **Importador JORNALES:** lo corregido a mano en la web gana (alcance firmado: memoria
  `web-gana-alcance-liquidacion`); horas en columnas sin fecha → obra del renglón, último día del bloque,
  nota «sin fecha en la planilla (col X)» (99a9ced6; ensayo +240 h; verificar corrida 10:20 en registros_hh).
- **Conciliación bancaria 14/09:** extracto cargado, `_BANCO_RAW` 614 mov., **auditar-saldo-banco CIERRA
  $39.012.283,70**. Bug corregido: clave del movimiento = (cuenta, referencia, importe, FECHA) en código e
  índice (migración 20260914T1400, aplicada; importar-banco la re-aplica última). Echeq 308 Pagado (re-débito
  11/09), 381 Aceptado (se reparó un duplicado propio), físicos 320/321 DEBITADO=SI (leído en el Sheet).
- **CRM:** acceso al portal desde la lista `/clientes` (Ver como lo ve el cliente ↗ · Accesos →), carpeta del
  cliente sin tope de 300 (ARCOR 542/542), 883 vínculos cliente_documento + 22 carpetas de obra aplicados. QA OK.
- **Datos:** convenio_escala desde uocra_escala (184 filas); padrón Petina=oficial (recibo), Castillo=ayudante
  (alta ARCA, elegido por el dueño; memoria `categoria-y-alta-manda-la-planilla-del-dueno` actualizada).
- **Messina:** A-227 ya estaba Cobrada (fila 41); fila 89 NO se tocó (¿segundo 50% OC 279 o duplicado? sin confirmar).

## 5. EN CURSO — RAMAS SIN MERGEAR

- `feat/liquidacion-cuadro-jornales` (agente ejecutor, worktree `.claude/worktrees/liquidacion-jornales`):
  P0 del dueño. Pedido textual y decisiones en memoria `liquidacion-rediseno-pedido-1409`. Al terminar: QA
  visual → merge → deploy.
- `fix/cobranzas-un-vencido` (agente, worktree `.claude/worktrees/cobranzas-vencido`): «vencido» = columna U
  (Pendiente y Q<hoy), decisión del dueño 14/09 «col q» (reemplaza la del 14/08); OBRAS alineada; portal marca
  todos los pagos del mismo día. **Auditor RECHAZÓ:** el portal muestra $11,7M vencidos ya cobrados (filas
  `esquema_pago` sin `cobranza_fila`: La Estrella «Faltante 2/2» ↔ Cobranzas f40; Messina Pilón ↔ f30);
  ficha Esquema/pantalla 28 con otra regla; test no da rojo desde el cero. En corrección. Despliegue: migración
  20260914T1200 con lock_timeout fuera de horario → verificar en destino → recién ahí merge web. El vínculo
  `cobranza_fila` cambia lo que ve un cliente: lo aplica un tercero tras revisión.

## 6. PENDIENTES

**Del dueño (decidido, falta hacer):** cotizaciones de Drive visibles en la solapa Presupuestos del cliente.
**Del dueño (FALTA_DATO):** 70 h del 11/06 (Alaniz/Agüero/Rosales) · Agüero bloque 18/05: vale total 80 h,
lo corrige él en el Sheet · horas jefes 08/08–31/08 · Mis Facilidades ARCA (multiplicador 1,6713 = estimado).
**Decidido «nada/nadie»:** 26 carpetas de cliente sin CRM · accesos portal Messina/ARCOR/La Estrella (por ahora).
**Técnico:** 109 worktrees acumulados (`node scripts/higiene-worktrees.mjs` cuando no haya agentes) ·
4 débitos de cheque sin número en el extracto · alto táctil del link portal en 390 px (cosmético).

## 7. ESTADO GIT

- main = origin/main = producción VM: 99a9ced6 (+ este traspaso) · árbol principal limpio
- ramas abiertas: `feat/liquidacion-cuadro-jornales`, `fix/cobranzas-un-vencido` (ver §5)

## 8. PRÓXIMO PASO

Cerrar los dos agentes de §5 (QA / re-auditoría), desplegar Liquidación P0. Verificar corrida importador
10:20 (`notas like '%sin fecha en la planilla%'` ≈ 30 celdas / 240 h).

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
