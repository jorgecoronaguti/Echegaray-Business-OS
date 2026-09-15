# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-15 ~14:00 (−03) · main = producción (eb656cf8)_

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

- **Columna Obra** en el Sheet real (Compras L, Cobranzas H, desplegable `_OBRAS_OS`): escrita 952/959 y 93/98;
  Supabase igual (`compra_sheet` 952, `cobranzas` 93 tras sync 12:46). Cola `compra_obra_cambio` 952 aplicadas, 0 rechazadas
  (las 15 «rechazado» eran del worker viejo que no aceptaba «Sin obra – CLIENTE»: reconciliadas contra la celda).
- **Migraciones aplicadas hoy**: T0900, T0910, T2130, T0700, T2200 (resolver sin mayúsculas), T2210 (`cobranza_obra_asignar` +
  `compra_obra_cambio.pestana`, RPC probada como dueño con rollback), T2220 (presentismo: `asistencia_dia.llego_tarde/salio_antes`,
  `liquidacion_linea.presentismo/presentismo_perdido`; probada como jefe con rollback, CHECK rechaza tardanza sobre no-presente).
- **Sección Compras** (54bf664d): obra en línea con desplegable, columnas Comprobante/Pago, encabezado fijo, sin salto al abrir.
- **Relleno versionado** (8aedd3e7): `orquestador/scripts/obra-relleno-aplicar.mjs`, worker por pestaña, validador JS = SQL.
- **Presentismo por tardanzas** (eb656cf8): 20 % básico UOCRA × h ÷ 2 en juego por quincena, se pierde con una marca; el jefe
  marca en la presencia del día; rige desde 16/09; jefes/mensuales afuera. Sin plata nueva (decisión: arrancar «en juego»).
- Bot comprobantes: cargador por rótulo vivo, propone Obra; consumidor ws reiniciado con 8aedd3e7. Sin carga real desde la
  inserción de la columna → falta la lectura de vuelta de un comprobante real.

## 4b. DECISIONES DEL DUEÑO 15/09

- Liquidaciones finales: no considerar. Jefes cobran por mes. Presentismo: tardanzas/salidas tempranas, no faltas; 50/50
  blanco-negro; «hacelo» a la regla en juego. Compras «al centavo por obra» también en Proveedores.

## 5. EN CURSO

- **Costo por obra por `obra_id`** (agente en `.claude/worktrees/obra-costo`, rama `fix/obra-costo-por-obra-id`): la vista
  `obra_costo_real` sigue por texto (`norm_obra(obra_texto)=alias`) → OB-0003 «LE OBRA GENERAL» $156 M y las obras reales $0.
  Migración T2300 pendiente: vista por `costos_obra.obra_id`, RPC `compra_obra_asignar` también escribe `costos_obra` y
  `compra_obra_asignada`, filtro muerto de `costo_de_obras_a_la_fecha`, `proveedor_compra` publica obra_id/celda, Proveedores
  con `<ObraEnLinea>`, TabOperacion y `obra-costos.mjs` por obra_id.
- QA visual (Compras, Proveedores, botones de tardanza a 390 px, columna Presentismo) corriendo.

## 6. RIESGOS / DEUDA DETECTADA

- «Sin obra – LA ESTRELLA» 63 filas $35,7 M y «Sin obra – SAN FRANCISCO» 151 filas $33,8 M: compras sin obra concreta
  (el Sheet no la dice; LE galpón 7/8, cierre, mampostería sin fechas → no se puede asignar por ventana). Las asigna el dueño
  en la app (desplegable) o en el Sheet.
- 108 `obra_inconsistencia` (62 Impuestos y 12 Financiero en Compras con ES-ADM; 20 Civil/Mantenimiento con estructura).
- Negro negativo con presentismo (recibo paga más horas que las cargadas): se muestra, decisión del dueño pendiente.
- Vacías a propósito: Compras 89/357/372/386/391/428/432; Cobranzas ADDATO, LIRIO, Macro ×2.
- Worktrees: 138; `node scripts/higiene-worktrees.mjs` cuando no haya agentes.

## 7. PENDIENTES DEL DUEÑO

- Qué poner en las 11 celdas vacías; asignar las «Sin obra – CLIENTE» ($69 M); negro negativo del presentismo;
  mandar un comprobante al canal para cerrar la prueba real del bot.

## 8. PRÓXIMO PASO

- Recibir el agente de costo por obra → aplicar T2300 (dry, aplicar, leer OB-0006 ≈ 45.196.366 y OB-0003 ≈ 0) → merge →
  deploy → QA Proveedores → avisar al dueño con la cifra por obra.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
