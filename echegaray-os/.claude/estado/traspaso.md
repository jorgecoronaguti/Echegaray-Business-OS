# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-16 ~14:40 (−03) · main = producción (b0ff2da3, Vercel success)_

## 1. OBJETIVO GENERAL

Echegaray Business OS es el sistema operativo digital de Echegaray Construcciones: app web (Next.js + Supabase),
datos, automatizaciones, motores determinísticos e IA para que Dirección y la empresa operen desde una única
plataforma. XSAS es la capa de inteligencia operativa. El usuario trabaja desde la app con lenguaje natural,
interfaces y archivos, sin conocer tablas ni código. Claude Code NO es la interfaz operativa: sólo desarrolla,
corrige, prueba y evoluciona el OS y XSAS.

## 2. PRINCIPIOS INVARIANTES

- Obra como eje · una fuente de verdad por concepto (Postgres) · Plan vs Real vs Forecast · P&L devengado, Cash Flow percibido
- UX simple, compacta, operativa; less is more; skill `diseno-ui-ux-producto-os` antes de tocar pantallas; nada se da por bueno sin mirarlo en navegador (1440 y 390)
- Evidencia antes que inferencia · no inventar · FALTA_DATO / CONFLICTO explícitos · preservar provenance
- **Lo que el dueño pidió no se quita** por criterio de QA/diseño (16/09 se quitó «Efect. red.» y lo reclamó); edición manual del dueño = verdad
- Nivel E (efecto externo) = firma del dueño · nunca debilitar RLS · padrón: nunca alta/baja · columnas del dueño en Compras (AD/AE/AF/AG/AK) nunca
- Sheet real nunca desde un worktree · nunca correr pipeline/generadores «para ver si anda»
- **PROHIBIDO `orq:test`/suites completas mientras el dueño trabaja**: tumban Postgres (16/09 se reinició 08:53 y 08:57). Tests por archivo, typecheck, eslint.
- Reutilizar motores/capacidades existentes; deterministic first; LLM sólo con valor real; mínimos tokens
- Nadie cierra su propio trabajo · responder al dueño por el bot (`avisar-al-dueno.mjs`) · si un pedido se frena, avisar en el momento
- DDL en horario del dueño: migración por migración, `--aplicar` y LEER el efecto (grants, policies = 586)

## 3. ARQUITECTURA CONCEPTUAL

Usuario → OS/XSAS → intención/contexto → capabilities/skills/workflows → engines/tools/integraciones → datos ECSAS →
ejecución → verificación → respuesta/acción. Reasoner/LLM sólo cuando lo determinístico no alcanza.

Operativo: web en Vercel desde `main`; backend = push + `git -C ~/echegaray-os/produccion/echegaray-os pull --ff-only`
(+ reiniciar timers/servicios tocados). Migraciones: `node orquestador/scripts/aplicar-migracion.mjs <f>` (ensayo) / `--aplicar`.
Consultas: `node -e` con `orquestador/lib/db.mjs`. Worktrees en `/home/jorge/echegaray-os/app/wt-<nombre>` (symlink node_modules);
`.claude/worktrees` está vedado a Read. Sheet Flujo de Caja `1SR6HY…`; JORNALES `1s0KlEU…`; réplicas en Postgres
(`compra_sheet`, `uocra_escala`…). Cola app→Sheet `compra_obra_cambio` (Obra y pagos) + worker `compras-obra-cola.mjs`.

## 4. ESTADO ACTUAL

- **Operativo y verificado en producción**: Liquidación de horas (cuentas en celdas con/sin «=», Pagado/Saldo por lado
  compensados, cabecera y Persona fijas, Persona ensanchable, botón Pagar con cierre solo de quincena, Recibo/Plataforma con $/h,
  escala UOCRA, «Más» corregido, Efect. red.), Horas («Obra en la quincena» en pasadas), Plantel con filtro por obra y
  tardanza/retiro, Compras con Proveedores como sección (Compras · Proveedores · A quién le debo · Nombres sin resolver),
  legajo con Retribución 2026 y Documentos (certificados), comprobantes por chat resilientes, costo por obra por `obra_id`.
- **Recién desplegado, sin uso real todavía**: pagos de Compras app ↔ Supabase ↔ Sheet con comprobante de pago adjunto
  (b0ff2da3; migraciones 20260916T1700 y T1800 aplicadas; bucket `comprobantes` a 25 MB; timers `compras-obra-cola` y
  `compras-sync` reiniciados). Ningún pago llegó aún a una celda del Sheet: el dueño registra el primero y se mira cola + celda.
- Fuera de alcance declarado: control de pago dentro de «A quién le debo» (sólo lectura) y tercer pago parcial (la pestaña tiene dos tramos).
- Protecciones activas: `no-borrar.mjs` (una escritura vacía no borra celdas), verificación de identidad de fila antes de escribir el Sheet.
- Abierto menor: Castillo $/h blanco manual 5.399 («dejalo así») · `tests/liquidacion-fidelidad.spec.ts:228` desactualizado ·
  console.error WebSocket realtime tras revalidate · sin timer `_UOCRA_RAW`→`uocra_escala` · «Sin obra – CLIENTE» que asigna el dueño.

## 5. TRABAJO DE ESTA SESIÓN (16/09)

Todo mergeado a main y desplegado: cuentas sin «=» (`formulaEsAR.ts`); conciliación de nombres «B.D.H.»=«BDH» (fila 972
con PDF); Liquidación pulida + marca Pagar (`MarcaDePago.tsx`, mig. T1300) + autocierre (`autocierreDeQuincena.ts`) +
categorías (`categoriasDeLaFila.ts`) + ancho de Persona (`anchoDePersona.ts`) + negro 1ª sep = JORNALES col W (4 tarifas
en `persona_tarifa` con rastro); Horas sin tramos duplicados + obra de la quincena (`quincenaPorObra.ts`); legajo Retribución
y Documentos (mig. T0100, 3 certificados cargados); «Más» Caja con totales del pie + escala UOCRA (`escalaUocra.ts`);
Proveedores «A quién le debo» (`deudaProveedores*.ts`) y como sección de Compras (`seccionesDeCompras.ts`); Plantel filtro
por obra; barra sin filo; cartel «Cargando…» corregido (`IndicadorNavegacion.tsx`: clic en botón dentro de fila-enlace);
pagos de Compras (`pagos-de-compra.mjs`, `comprasPagoActions.ts`, `PagoDeCompra`). 37 worktrees viejos eliminados.
Memorias nuevas: `ux-sin-parches-usar-la-skill`, `lo-pedido-por-el-dueno-no-se-quita`, `cartel-cargando-clic-en-boton-dentro-de-enlace`.

## 6. PENDIENTES REALES

- P0 — Verificar el primer pago real: cuando el dueño registre uno en Compras, `node orquestador/scripts/compras-obra-cola.mjs`
  (en seco) → mirar la fila `aplicado` y la celda en el Sheet (`exportar-pestana-pdf.mjs`/`ver-pestana.mjs`) y en `compra_sheet`.
- P1 — Recibir el QA visual del panel de pago y del «Cargando» (agente lanzado al cierre; si no vuelve, repetirlo): corregir lo que acuse.
- P1 — `npm run build` (React #419 no lo ve el typecheck) y `orq:test` completo en un momento sin el dueño operando.
- P2 — Control de pago en «A quién le debo»; `liquidacion-fidelidad.spec.ts:228`; WebSocket realtime; timer UOCRA.

## 7. ESTADO GIT

- Rama: `main` (= origin/main) · HEAD: f16f1ab4 (traspaso 14:20; código = b0ff2da3)
- Working tree: limpio salvo `scratchpad/` sin trackear (temporal, no se commitea)
- Producción: b0ff2da3 desplegado (Vercel success; backend pull hecho)

## 8. PRÓXIMO PASO

Verificar el primer pago real de Compras: leer `compra_obra_cambio` (tipo pago) y la celda escrita en la pestaña Compras del
Sheet, partiendo de la cola vacía y las migraciones T1700/T1800 aplicadas; corregir lo que acuse el QA visual del panel.

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO lo necesario · 6) cambio mínimo correcto · 7) tests dirigidos · 8) actualizar handoff.
El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.**
No leer conversaciones anteriores; no explorar el repo «para ponerse en contexto»; no auditar por defecto.
