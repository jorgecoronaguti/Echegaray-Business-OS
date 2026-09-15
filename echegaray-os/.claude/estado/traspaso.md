# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-15 ~09:10 (−03) · main = producción (423e89fc)_

## 1. OBJETIVO GENERAL

Echegaray Business OS: app web (Next.js + Supabase), datos, motores determinísticos e IA para operar
Echegaray Construcciones. XSAS es la capa de inteligencia operativa. Claude Code sólo desarrolla.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · P&L devengado · Cash Flow percibido
- Evidencia antes que inferencia · FALTA_DATO / CONFLICTO explícitos · edición manual del dueño = verdad
- Nivel E = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- Nadie cierra su propio trabajo (qa-visual / auditor) · responder al dueño por el bot (avisar-al-dueno.mjs)
- **Si un pedido grande se frena (agentes cortados), avisar al dueño en el momento** (15/09 preguntó 5 veces por la columna Obra)
- El dueño pidió «todo ahora, nada de esta noche»: DDL en horario sí, pero migración por migración y leyendo el efecto

## 3. ARQUITECTURA (lo que se usa seguido)

- Web: Vercel desde `main`. Backend: push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`.
- Migraciones desde main: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) y `--aplicar`.
- Probar como usuario: tx con `set local role authenticated` + `request.jwt.claims` (dueño 4677f284-d873-4531-9c8f-cc3dab56ffd0). **El ensayo como postgres NO ve errores de permisos** (así se cayó el CRM).
- Consultas: script en scratchpad que importa `orquestador/lib/db.mjs` (FK de líneas: `liquidacion_linea.liquidacion_id`).

## 4. CERRADO HOY (15/09) — EN PRODUCCIÓN, VERIFICADO EN LA BASE

- **HH por obra** (8f528000): las 210 asignaciones «reconstruido desde JORNALES» ya no mueven horas (693 filas vueltas a la planilla; LE Mampostería 3.660 h). Rosales → Quattropani desde 01/09 (fila ea81c8d5). Auditor firmó.
- **Costo MO por obra** (0800→0842): cerradas = pagado real; jefes fuera de las HH de obra y costo entero a ES-ADM (siguen siendo jefes en Personal); Tello subcontratista; sin doble conteo BSA. Quattropani 556 h / MO $4,50 M.
- **CRM caído y lento → arreglado**: 0850 (`persona_para_costo`) + 0855 (`costo_mo_quincena` SECURITY DEFINER con puerta `liquida_sueldos() or ve_economia()`; `persona_para_costo` sólo service_role → el sellado funciona). Cartera 8,1 s → 2,8 s. Auditor firmó 0855.
- **Quincenas históricas** (a00b84cb + 423e89fc): Palacios y Gonzales emparejados, Oficina 26 cargada (29 líneas), BAJA declaradas en `monto_excluido`, columna interna sin fecha, guarda de quincenas firmadas/selladas/editadas. Control: Δ pagado 0 desde Q2-04.
- **Celda de horas vacía** (186b3026, Vercel OK): vaciar un día sin 0 ni ausente en Horas/Carga del día/Liquidación; presencia por defecto no rellena al re-guardar. Auditor firmó con límites; QA en producción sobre personas de prueba en curso.
- **Jefes en todas las quincenas** (f1051b3a): Horas y Liquidación agrupan por `esJefeDeObra(puesto)`, no por tarifa; en cerradas COBRA = importe de la planilla. Auditor firmó con límites: Q2-08 sin sueldo cargado (preguntado al dueño).
- **Angel Fernandez** rubro Subcontratista (declarado por el dueño 15/09).

## 4b. DECISIONES DEL DUEÑO 15/09 (tarde)

- Filas BAJA Q2-03 se pagaron → cargar (Aguirre fila 192 no cierra: ¿470.000? preguntado).
- Las 10 personas «alta 01/09 desde liquidación final» sin fecha de ingreso = cuadrilla del subcontratista Gerson Castro (Messina, 05–12/08); su costo va a Messina, no a Estructura; no son plantel propio.
- Columna Obra: prioridad 1; «todo basado y consolidado en Supabase»; cuidado con el impacto en todas las pestañas.

## 5. EN CURSO (agentes, worktrees)

- `feat/tiempo-real` (dbfb0d9f): triggers por evento → `realtime.send` topic `os:cambios`, cliente con debounce y sin pisar edición. **Auditor corriendo. BLOQUEO: `realtime.messages` sin particiones → los avisos no se guardan.** Migración 20260915T2100 sin aplicar.
- `fix/jefes-en-quincenas-cerradas`: en Liquidación Q1-08/Q2-08 los jefes caen en OBREROS «sin tarifa» (agrupa por tarifa mensual vigente, sólo existe desde 09/01) y BANCO $663.141,56 idéntico; en Horas 16–31/08 Maldonado cae en obreros. Capturas en `tests/qa-shots/jefes-*` (untracked, borrar al cerrar).
- `feat/celda-de-horas-vacia`: dejar un día sin horas (ni ausente, ni presencia por defecto) en TODOS los cuadros de horas.
- **Columna Obra** (pedido 14/09, NADA en producción): base `feat/obra-por-fila` (5255a9c5, migración 0700 sin aplicar) · `feat/columnas-encabezado-lectores` (7be8530c, terminada) · `feat/columnas-encabezado-cobranzas` y `-generadores` (agentes; generadores además entrega inventario de impacto en TODAS las pestañas: `scratchpad/obra-impacto-sheet.md`) · `feat/obra-cargador-y-app` (bot comprobantes + Compras en la app + backfill en seco). Después: auditor → merge → insertar L/H desde producción con timers pausados y verificación celda por celda → 0700 → backfill con OK del dueño.

## 6. RIESGOS / DEUDA DETECTADA

- `obra_panel.monto_contratado` publica bsa-adicional 5,97 M y `CarteraObras.tsx:144` lo suma → doble conteo en Obras. `cliente_economia.contratado` Messina 159,76 M vs ficha 185,63 M (dos verdades).
- Subcontratos sin obra asignada ≈ $27 M (Castro, Fredes Messina, Angel Fernandez sin rubro, Leandro Rojas sin proveedor) → los resuelve el backfill de la columna Obra.
- Liquidación vs `registros_hh` no concilian por quincena cuando el bloque de JORNALES cruza el día 15. Oficina fila 56 («2/3») pone $1,5 M en Q1-04.
- `hh-por-obra.pg.test.mjs` y otros `.pg` rojos esperados/ajenos; `orq:test` completo no corrido hoy.

## 7. PENDIENTES DEL DUEÑO (preguntado)

Filas BAJA Q2-03 ($2,33 M) ¿se pagaron? · Agüero/Alaniz Q2-05 80 vs 88 h · ¿quiénes de las quincenas son de equipos de subcontratistas? · Angel Fernandez = subcontratista en ficha · corregir en JORNALES celda 70 h 11/06 y T479=29 · encabezados Oficina filas 40/46 · Bases Tanque SO2 contratado ¿corto 9,5 M?

## 8. PRÓXIMO PASO

Integrar lo que devuelvan los agentes (jefes → celda vacía → tiempo real → columna Obra), cada uno con auditor, merge, efecto leído en la base y aviso por bot.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
