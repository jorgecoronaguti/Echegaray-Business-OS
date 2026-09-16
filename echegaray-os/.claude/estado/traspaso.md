# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-16 ~14:20 (−03) · main = producción (b0ff2da3)_

## 0. HOY 16/09 (mañana) — lo que entró y lo que sigue

Entró a main y producción: cuentas sin «=» · conciliación «B.D.H.»=«BDH» (fila 972 con PDF) · Liquidación pulida (cabecera fija
con respaldo, Pagado abre vacío, Efect. red. fuera) · Horas (asignar día siguiente sin tramos de 1 día; 13 limpiados; cabecera
fija) · legajo Retribución · marca PAGADA (mig. 20260916T1300) con hover/alto 34-44/marca en 2º renglón · CIERRE SOLO al marcar
el último pagado (misma traba que Cerrar: `decisionDeAutocierre`) · documentos del legajo (mig. 20260916T0100; 3 certificados
cargados: Carlos Samuel 14–15/09, Juan Guillermo 07–09/09 ×2 — estaban en la carpeta Drive de Emiliano) · «Más»: Caja con los
totales del pie · escala UOCRA vigente al lado de «Más» (ago-2026; SNR junio cargada) · cargador desde Drive lee nombre_completo ·
17 excepciones «cobrado» viejas fuera. Postgres se reinició 08:53 y 08:57 por suites completas de agentes: PROHIBIDO
`orq:test` completo mientras el dueño trabaja.
Después (hasta 0245acea, todo en producción y mirado con navegador): Horas «Obra en la quincena» en quincenas pasadas
(`quincenaPorObra.ts`, 3 tests) · Proveedores «A quién le debo» (`?vista=deuda`, panel derecho, coteja con `proveedor_deuda`) ·
Plantel filtro por obra (`?obra=<id>`, `FiltroDeObraEnPlantel.tsx`, `recorteDeObra.ts`, `enlaceDeVista.ts`) · barra sin filo entre
grupos · $/h cat. del blanco verificado = recibo Q2-08 para los 16 con recibo (Castillo sin recibo aún).
Tarde (hasta 03ea3cfd, todo en producción y mirado): Proveedores como sección de Compras (mismas URLs; `seccionesDeCompras.ts`) ·
Liquidación: Recibo/Plataforma con $/h bajo el nombre (`categoriasDeLaFila.ts`), negro 1ª sep = JORNALES col W (4 tarifas
corregidas en `persona_tarifa` con rastro), Persona ensanchable (`anchoDePersona.ts`, `--liq-persona`, localStorage),
escala UOCRA sin enlace, «Efect. red. ✎» restaurada (la pidió el dueño; memoria `lo-pedido-por-el-dueno-no-se-quita`).
Cierre (hasta b0ff2da3): cartel «Cargando…» corregido (clic en botón dentro de fila-enlace; memoria
`cartel-cargando-clic-en-boton-dentro-de-enlace`) · tirador de Persona visible · PAGOS DE COMPRAS mergeados: migraciones
20260916T1700 (cola con tipo/celdas/previo) y 20260916T1800 (comprobante de pago; bucket comprobantes 25 MB; función
compra_pago_comprobante_registrar con 6 args — se corrigió la firma del grant) APLICADAS; timers compras-obra-cola y
compras-sync reiniciados; cola en seco vacía. Sin pago real registrado todavía: se le pidió al dueño que haga el primero y
se mira la cola + la celda del Sheet. Fuera de alcance declarado: control de pago en Proveedores › «A quién le debo»
(sólo lectura) y tercer pago parcial. QA visual del panel de pago en curso (agente).
Abierto menor: Castillo $/h blanco manual 5.399 (el dueño dijo «dejalo así») · `tests/liquidacion-fidelidad.spec.ts:228`
desactualizado · console.error WebSocket realtime tras revalidate · sin timer `_UOCRA_RAW`→`uocra_escala` ·
`npm run build`/`orq:test` completos no corridos hoy (Postgres se reinició dos veces por suites en paralelo).

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


### 4c. Tarde del 15/09 (hecho y verificado)
- Tello: f.806 → OB-0005 (L806 escrita directa: la cola rechazó por `sin_huella`, ahora arreglado en 306cfbea);
  f.880–883 = 2.144 m² × 4.400 (9.433.600, a cuenta 1.250.000, pago 1 1.770.000, 3 × 2.137.866,67); f.956–961 = resto
  1.466 m² (6 × 1.075.066,67 = 6.450.400). `subcontrato` 799482f9 en pisos-industriales $15.884.000 (el de Quattropani borrado).
- 8 comprobantes del canal (14:44) fallaron por Google 504 al leer la cabecera (no créditos); el fajo persistido
  `comunicacion.comprobante_fajos` dc2d0273 se recargó con `escribirFajo` tras `olvidarCargados` de las 8 reservas sin fila
  → filas 964–971 ($1.062.357), espejo corrido. Scratch: `scratchpad/recargar-fajo.mjs`.
- Regla nueva del dueño: «a la fecha» = pagado + vencido; cuotas por vencer aparte (agente panel/T2320).
- Agentes en curso: costo por obra_id (T2300), panel detalle + regla por vencer (T2320), tardanza en asistencia de escritorio,
  comprobantes reintento 5xx + fajo persistido (T2330), auditoría MO/MA/SUB por obra (script + informe + .pg.test).


### 4d. Tarde-noche del 15/09
- Blanco estimado con el $/h del último recibo real (d87098c2; memoria `blanco-categoria-del-recibo-negro-plataforma`).
- Panel de detalle por rubro en la ficha del cliente + `costo_de_obra_filas` + regla «a la fecha = pagado + vencido, por vencer
  aparte» (89dfed2c, T2320 aplicada; caché de fichas borrada). Efecto: 19,5 M pasan de «a la fecha» a «por vencer».
- Tardanza en Plantel de escritorio (8a078d5c). Worker de cola de Obra con huella de respaldo (306cfbea).
- Agentes (opus) en curso, worktrees en /home/jorge/echegaray-os/app/wt-*: liquidación pagado real + fórmulas + encabezado
  fijo (T2340), legajo $/h, costo por obra_id + Proveedores (T2300), anotación→obra, comprobantes 5xx + fajo (T2330),
  auditoría MO/MA/SUB. Límites: fable semanal hasta 00:00; sonnet sesión hasta 19:00.


### 4e. Noche del 15/09 (todo desplegado y verificado en la base)
- Comprobantes que no se pierden (c3a4d5a5, T2330 aplicada, worker y ws reiniciados).
- Legajo con $/h negro / recibo / básico (0fb8ac32 + cosmética 1cfa30b7; QA OK con Agüero, Quiroga S., Maldonado).
- Auditoría MO/MA/SUB (439d709d): script `auditar-costo-por-obra.mjs`, informe docs/auditorias/2026-09-15; 230 hallazgos:
  vista vieja (corregido en T2300), $75 M «Sin obra» ($13,4 M de subcontratistas), MO por cliente vs MA por sub-obra.
- Costo por obra por obra_id (675377cb, T2300 aplicada; `obra_costo_real`, RPC escribe costos_obra+asignación,
  Proveedores con ObraEnLinea, «Sin obra» canónicas) + NC restan (7b400e84): OB-0006 45.245.366 = pestaña.
- Cargador con lo manuscrito (9ac7c1d8): `anotacion-a-obra.mjs`, «Sin obra – CLIENTE» se escribe con cliente seguro,
  repesca de respaldos cada 10 min (3 pendientes viejos dan 404 en Mattermost: archivos borrados; falta un «rendirse»).
- Agente en curso: Liquidación rehecha (pagado real, saldos, fórmulas, encabezado fijo; T2340). QA Proveedores/obra corriendo.
- Nota: Agüero tarifa 01/09 volvió a 5.974 («corrección de la quincena»), antes 6.979; preguntado al dueño.


### 4f. Madrugada del 16/09
- Liquidación rehecha desplegada (e17fd215, T2340 aplicada; 39ccb076 sin columna Saldo fija). Falta: Efect. red. fuera, Pagado
  abre vacío, encabezado fijo robusto + spec Playwright (agente). Legajo → sección Retribución 2026 (agente).
- Decisiones del dueño aplicadas por RPC: 08/09 Tello J.A. y Zogbe presentes; f.806 K «Galpones»; subcontratistas SF → OB-0005,
  Gerson LE → OB-0006, Tello LE → OB-0006, Tello ME → OB-0019, Á. Fernández ME → OB-0017; regla por fecha (única obra activa)
  repartió 184 «Sin obra» ($59,8 M: 123 OB-0005, 48 OB-0006, 12 OB-0017, 1 OB-0020) — LE galpón 7/8, cierre y mampostería
  SIN FECHAS → todo LE fue a OB-0006 (rehacer si el dueño da fechas). Scratch: `scratchpad/sin-obra-regla.mjs`.
- **CRONOLOGÍA ROTA (queja 16/09)**: `echegaray-jornales-registros` pisó 543 registros (15/09 08:00) + 150 (16/09 07:00).
  Causa: `echegaray-asistencia-obra` (obra del día del jefe) vs `echegaray-jornales-registros` (obra del rótulo) se pisaban 4×/día.
  RESUELTO (972dc73f): ancla de ASISTENCIA en `registros_hh.notas`, toda fila `web:*` gana, conflicto declarado, 8 filas de 01–15/09
  restauradas (`restaurar-hh-desde-web.mjs`), timer JORNALES reactivado. 2 conflictos de licencia quedan como la app.
  Pendiente: asignar «día siguiente» (crea tramos de 1 día), licencia que se arrastra, encabezado fijo en Horas.

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
