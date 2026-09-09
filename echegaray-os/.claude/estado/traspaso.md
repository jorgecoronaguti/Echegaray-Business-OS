# ECHEGARAY BUSINESS OS — HANDOFF

_actualizado: 2026-09-09 14:15 (hora local −03) · main `9507bd33` = origin = producción · Vercel al día_

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

- **Web publicada hoy (09/09)**: botón «Presente» en Plantel (`2c76456f`); Documentos del proveedor en ficha y
  panel lateral con bucket privado `proveedores-documentos` + tabla `proveedor_documento` (`3c6b1143`, `73b82964`);
  módulo **Liquidación** (Administración → Personal, `fbae2a0a`): tablas `persona_tarifa`, `liquidacion_quincena`,
  `liquidacion_linea`, RLS `ve_economia()` (jefe_obra NO ve sueldos), 14 tarifas sembradas desde `_J_OBREROS`.
- **Sheet Flujo de Caja**: **Plantel borrada** (respaldo `~/echegaray-os/respaldos/2026-09-09-Plantel.pdf`).
  **Jornales por Quincena** migrada al layout nuevo (commit `e2e618be`: 105 filas × 13 col, calendario único
  pagadas+proyectadas con oficina 1.1 y dirección 1.2, convenio UOCRA como bloque 2, titular 3 cifras; 17 fechas
  «Pagado el» repuestas por quincena). **Cargas Sociales** migrada (commit `a79c0c8e`: 63 filas × 15 col, 4 bloques,
  titular percibido). Ambas verificadas en el real: REAL_TOTAL 135.539.027 · OFICINA_PAGADO 24.330.363 ·
  DIRECCION_PAGADO 9.000.000 · pagado cargas 71.737.385; auditores de pantalla y censo en 0 para Cargas.
  **Jornales final** (`2cd6141a`, 102 filas: 8 retoques, parámetros `JORNALES_HORAS_MEDIDAS` / `JORNALES_SHARE_ADELANTO`
  en Parámetros, 5 tests reescritos) aplicada 12:1x con `olvidar-huella-de-formato --todas` + `pestana-migrar-layout --real`.
  **Nómina** migrada 12:27 (`35699f73`: piel de `estilo-statement` igual a las hermanas, once columnas, 15 «EFECTIVO
  redondeado» del dueño: 11 junto a su persona + 4 visibles debajo de «⇒ 15 persona(s)» — $120.000 / $340.000 / $290.000
  / $360.000 — suma total $4.374.000; se reponen con `nomina-pestana.mjs --aplicar --redondeado-de <respaldo>.json`).
  Cash Flow releído tras el pipeline de las 11:41: las 6 líneas reales idénticas; proyección sep–dic: jornales
  58.308.813 → 57.362.961, cargas 23.614.127 → 23.264.450, gremiales 7.090.019 → 7.008.105 (el calendario nuevo cuenta
  días hábiles por `NETWORKDAYS.INTL`; el viejo sumaba un «sábado supuesto») — **el dueño no lo confirmó todavía**.
- **Herramientas nuevas** (en main): `scripts/en-copia.mjs` (un generador sólo corre contra una copia),
  `scripts/sheet-copia-prueba.mjs` (files.copy + siembra `_UOCRA_RAW` porque IMPORTHTML da #REF! en copias),
  `scripts/pestana-migrar-layout.mjs` (respaldo JSON → celdas del dueño por clave → vaciar → generador → reponer),
  `scripts/pestana-retirar.mjs` (se niega si alguien mira la pestaña; PDF antes de borrar).
- **Trampa pagada hoy**: `jornales-pestana.mjs` ESCRIBE sin flag (dry sólo con `--dry`); corrí una etapa a medio
  hacer sobre el real y rompió Oficina; se repuso celda por celda. Memoria `generador-sin-flag-escribe-el-sheet-real`.
- Timer `echegaray-flujo-caja` encendido; producción en `eab80d78` (generadores nuevos de Jornales y Cargas).

## 5. TRABAJO DE ESTA SESIÓN (09/09)

Ver §4. Además: memoria `decisiones-0909-sheet-personal` (Plantel se borra · Nómina migra a la web · UOCRA se
queda en Jornales · Cargas percibido).

**14:00 — Impuestos: «lo que se va a facturar es lo que Cobranzas marca con B»** (`9507bd33`, aplicado al real con
`pestana-migrar-layout --real`; respaldo `2026-09-09-16-56-Impuestos_y_Financieros-REAL.json`). El débito de un mes
sin DDJJ pasa a MAX(facturas B de Cobranzas por «Fecha de Factura»; ARCA); el crédito del mes cerrado sigue siendo ARCA
solo (el Libro mide lo pagado, no lo facturado). Agosto: débito $7.191.299 → $18.064.390, IVA a pagar $0 → $4.703.659
(21/09); hero «A pagar en 30 días» $5.496.981 → $10.201.763. Memorias `lo-que-se-factura-es-cobranzas-b` y
`verificar-en-copia-trampas`.

Cableado revisado de Impuestos (09/09): IVA declarado ← PDF F.2051 en Drive `archivo fiscal/2026/IVA` (hasta 07-2026,
del 18/08) · IIBB ← `2026/IIBB` (hasta 07-2026, del 14/08) · comprobantes ← `comprobantes_arca` (AfipSDK) → `_ARCA_RAW`
(ventas: 30, última 01/09; compras: 737, última 04/09; cargado 07/09) · retenciones ← Cobranzas X/Y/Z por fecha de cobro
· impuesto al cheque ← `_BANCO_RAW` · planes F931 ← `CARGAS_MES_PLANES`. **AfipSDK**: el timer (01, 11 y 18 a las 03:00)
falló el 01/09 porque producción no tenía `scripts/arca/credentials/` (copiado el 07/09) y el 07/09 por cuota (8/10 en la
ventana 10/08→10/09, plan free, 2 automatizaciones por corrida). Ventana nueva desde el 10/09: **verificar la corrida del
11/09 03:00** (`journalctl --user -u echegaray-arca-sync`).

## 6. PENDIENTES REALES

**P0 — Sheet (todo aplicado el 09/09; verificar el pipeline siguiente)**
- **Cargas final** (`5e8663d5`, 59 filas): sin filas duplicadas de cuotas (sólo bloque 4), titular «Próximo vencimiento»
  = primer período con fecha ≥ hoy y SIN pago en bloque 2 → $6.959.556 · 10/10 (antes anunciaba el F931 de agosto ya
  pagado). **Impuestos rediseñada** (`98787125`, 43 filas, 5 bloques, hero de 3 filas, cero prosa, sin bloque «Supuestos
  y huecos», sin fila mensual de planes F931; `ALICUOTA_IVA` vive ahora en `Parámetros!B111`).
- Pipeline 13:08 con las cuatro nuevas: 6 líneas reales de nómina idénticas; «Deuda previsional» 11.547.069 / 4.989.751
  (sin doble conteo). Pipeline 13:29 leído: «Impuestos» 1.023.684 / 12.842.309 (sep 1.719.294 · oct 6.015.159 · nov
  4.005.752), «Financiero» 15.781.442 / 3.848.432, las 12 líneas de nómina iguales. **Tras el cambio de las 14:00 la línea
  proyectada de «Impuestos» debe subir en el pipeline de las 14:50**: sep ≈ 6,42 M (IIBB 1.719.294 + IVA 4.703.659), oct
  ≈ 12,18 M (10.761.596 + 1.422.994), nov ≈ 4,01 M. Confirmar releyendo el Cash Flow Mensual.
- **14:30 — tres celdas repuestas a mano en Impuestos** (bypass `yaGuardado`): B13 libre disponibilidad de enero
  $20.803.502, C21/D21 retenciones IIBB feb $839.024 y mar $282.153. Cotejados los 7 PDF de IVA y los 7 de IIBB del
  archivo fiscal contra la pestaña: coinciden. Marzo dejó de mostrar $14.074 de IIBB a pagar (la DDJJ dice $0); hero
  «A pagar en 30 días» $10.182.690, «A favor» $9.875.444 (+$19.073 de IIBB jul). Causa (bucle de «vaciaste» por forma)
  en memoria `celda-vaciada-falsa-por-forma`; **de raíz: que `respetar-ediciones` no selle como escrita una celda que
  rechazó**. Verificar tras el pipeline de las 14:50 que las tres siguen.
- El lector del 931 de Cargas toma sólo `*F.931*.pdf` de `<año>/931`: «2026-08 pago vep» y los `Tk` no entran (bien).
  Suelto en `2026/IIBB`: un zip de comprobantes de compras (ruido, no rompe nada).
- Datos de Cobranzas a confirmar con el dueño: las 9 filas «B» de Quattropani (78–86) tienen «Fecha de Factura»
  18/08 y ningún número de comprobante (¿se facturan todas en agosto o una por certificación?); la fila 78 dice
  «Cobrado» con fecha de cobro 11/09 (futura). Cobranzas B difiere de las F.2051 presentadas en ±$2 M por mes (may
  +674 k, jun −1,75 M, jul +1,6 M): la DDJJ manda, pero conviene saber por qué.
- Cambio semántico a firmar: la deuda pendiente en planes del hero de Impuestos pasó de «fecha prevista > hoy» a
  «no marcado Pagado» (hoy las dos dan $4.989.751). Se perdió de la pantalla «El IVA empieza a salir de la caja en»
  (derivable del bloque 1) y la trazabilidad de DDJJ (fecha + N°) sólo queda en el log.
- Aviso del generador de Cargas: «la DDJJ de 2026-08 declara 25 y la planilla tiene 15». **El dueño (09/09): el plantel
  son 17 = 15 obreros + 2 oficina.** El control de Cargas compara sólo obreros: corregirlo para que cuente obreros +
  oficina (17); la brecha real contra la DDJJ es 8, no 10.
- Decisiones del dueño sobre Nómina: los 4 importes de EFECTIVO redondeado sin persona (¿a quién van?) y Sosa (literales
  pegados vs fórmula «MITAD BLANCA» $330.431: confirmar con el recibo). Censo marca los 15 del dueño como «pegados»:
  declarar la columna I como entrada del dueño en `censo-numeros-pegados`.
- Confirmar con el dueño la baja de proyección sep–dic (−$1,38 M en total) por el cambio de «sábado supuesto» a días hábiles.
- Defectos menores de pantalla (B13 de Impuestos ya repuesta): Jornales G78 «Σ $/hora con aumento» y Nómina I32 «EFECTIVO redondeado» cortados a 100 px;
  titular de Jornales con las tres cifras en columnas distintas (B/G/H) en vez de B como Cargas/Nómina.
- El pipeline termina en `failed` por auditores rojos (cobertura, diseño unificado, censo, formato-pestanas «8 fuera de
  estándar»): revisar cuáles son de hoy y cuáles preexistentes.

**P1 — decisiones del dueño (módulo Liquidación)**
- ADELANTO en efectivo sin fuente en Postgres (vive en col. Z de JORNALES): ¿importar o cargar en la web?
- Horas cargadas vs proyectadas al día de pago (web $3,6M vs Sheet $9,5M para 01/09–15/09).
- 3 obreros sin tarifa (Zogbe/Zogber, Castillo, Alaniz). Nómina del Sheet se retira recién cuando esto cierre.
- Messina eCHEQ · Quiroga · Dupec 912/913 (arrastrados).

**P2**
- Documentos del proveedor: el jefe de obra ve documentos de cualquier proveedor (sin filtro por obra); baja no
  libera bytes; prosa restante junto a «Archivar» y `NotaBloque` de la cartera.
- `nomina-quincena.test.mjs` rojo en main (lo arregla la rama de Nómina). Vercel: confirmar borrado de deploys.
- ~105 worktrees viejos (`node scripts/higiene-worktrees.mjs`; los de hoy están «locked»: `remove -f -f`).

## 7. ESTADO GIT

- `main` `9507bd33` = origin = producción. Árbol limpio. Respaldos JSON/PDF en `~/echegaray-os/respaldos/`.
- Sin ramas pendientes; worktrees de hoy retirados.

## 8. PRÓXIMO PASO

Releer la línea proyectada de «Impuestos» del Cash Flow Mensual tras el pipeline de las 14:50 (debe reflejar el IVA de
agosto por Cobranzas B: sep ≈ 6,42 M · oct ≈ 12,18 M · nov ≈ 4,01 M), verificar la corrida de AfipSDK del 11/09, y
llevarle al dueño las decisiones abiertas (Quattropani ×9 sin comprobante, (4 importes de EFECTIVO redondeado sin persona, Sosa, «sábado supuesto», adelanto en efectivo y
horas proyectadas del módulo Liquidación, brecha 25 vs 15 en la DDJJ de agosto).

## 9. REGLA PARA NUEVAS SESIONES

1) Leer este archivo · 2) `git status --short --branch` · 3) verificar HEAD · 4) recibir la tarea ·
5) inspeccionar SOLO los archivos necesarios (MAPA.md primero) · 6) cambio mínimo correcto ·
7) tests dirigidos (suite completa sólo en hitos) · 8) actualizar este handoff al cerrar.

El handoff es contexto, NO verdad absoluta: si el repo lo contradice, **EL REPO MANDA.** No leer
transcripts viejos, no explorar todo el repo, no auditorías generales por defecto. Mantener este
archivo CHICO: lo permanente vive en docs/, MAPA.md o la memoria, no acá.
