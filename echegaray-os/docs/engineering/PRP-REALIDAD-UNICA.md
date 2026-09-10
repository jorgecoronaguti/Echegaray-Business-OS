# PRP · Realidad única — una definición por concepto, y el control que la cuida

_10/09/2026 · estado: H1 en curso · origen: el dueño («la info que se lee de la base no es uniforme;
te tengo que referenciar pestañas puntuales porque toda la info no es consistente en toda la
plataforma. Esto no puede suceder»)._

Base verificada sobre `main` `9f795036`: `.claude/MAPA.md` § «Fuentes de verdad», `CLAUDE.md`
«Realidad única», `docs/engineering/DEFINITION_OF_DONE.md`, `DISENO-FICHA-CLIENTE-v3.md`,
`PRP-PUENTE-DRIVE-APP.md`, 416 migraciones.

**Lo que ya existe y se aprovecha:** `orquestador/scripts/canario-fuente-unica.mjs` (canario en
runtime web vs chat para 3 conceptos; no está en la suite) · `src/shared/components/prefetch-en-listas.test.ts`
(test que lee el fuente: lista declarada + barrido + «excepción mirando al aire»; `sinComentarios()`
exportado) · `orquestador/lib/vistas-security-invoker.test.mjs` (lista de vistas con excepciones y
motivo) · `.claude/MAPA.md` § «Fuentes de verdad» (11 conceptos, sin verificación).

## 1 · Inventario de conceptos críticos

CONFLICTO = dos o más definiciones vivas que pueden dar números distintos · ÚNICA = una definición ·
SIN FUENTE = se muestra o decide pero nada lo define.

| # | Concepto | Dónde se muestra / decide | Fuente en cada cara | Veredicto · ejemplo del 10/09 |
|---|---|---|---|---|
| 1 | Contratado | `/clientes` (`TablaClientes`, `chipsCartera`) · ficha (`ListasClienteV2`) · Esquema (`esquemaService`) · portal Pagos (`portalService.contratoDeCertificados`) · ficha obra (`CamposObra`, `fijar_monto_contratado()`) · vista `obra_economia` | `obra_economia_cartera` · ídem + fallback `obra_panel.monto_contratado` · (hasta hoy) `cliente_panel.contratado` · «Contrato en curso» sólo con cronograma · `obra_canonica.monto_contratado` · `contratado_de_obra()`+adicionales | **CONFLICTO (5 definiciones)**. Quattropani $1.504 por `MARCADOR_CONTRATO` sobre H78 |
| 2 | Facturado | Cuenta corriente (`cliente_cuenta_corriente.facturado_90d`) · Plan de cobranza (`certificado_cliente`) · `comprobantes_arca` (recibidas, tipo R) | | **CONFLICTO de ventana** (90 d vs acumulado) y de naturaleza |
| 3 | Cobrado (percibido) | Cuenta corriente (`cobranzas` vía vista) · barra `/clientes` (`obra_cobranza`, resuelve obra por alias: casi nunca) · portal (`certificado_cliente`) · Cash Flow (`_MOVIMIENTOS`) | | **CONFLICTO (4 derivadas, 3 criterios)**; fila 62 U$S 15.400 como $15.400 |
| 4 | Pendiente / vencido | `cliente_cuenta_corriente` (aging por fecha_cobro) · `Cobranzas!V` semáforo manual · `obra_cobranza.por_cobrar_proyectado` · `esquema_pago` | | **CONFLICTO**; «pendiente = contratado − cobrado» SIN FUENTE |
| 5 | Retenciones | `cobranzas.retenciones` · `cliente_orden.tipo='retencion'` (papel) · `certificado_cliente.reparo` (fondo de reparo) · `impuestos-pestana` lee `Cobranzas!A5:Q` | | **CONFLICTO semántico** (impositiva / reparo / comprobante) |
| 6 | Costo MO | `obra_economia_sheet.costo_mo` (proyectado) · `obra_costo_real` · `liquidacion_linea` · `registros_hh × persona_tarifa` | | **CONFLICTO de naturaleza sin rótulo** |
| 7 | Costo materiales | `obra_economia_sheet` · `compra_sheet` · `comprobante_compra` · `costos_obra` (legacy) · `comprobantes_arca` | | **CONFLICTO**; 3 filas de Compras con caja doble |
| 8 | Margen | `obra_economia_sheet.margen` (contratado − costos proyectados) vs `obra_economia.margen_cotizado/final_proyectado` | | **CONFLICTO de fórmula** |
| 9 | Avance | `obra_avance` (físico) · certificado (`avance_acum_pct`, económico) · `avance_obra` (muerta) | | ACEPTABLE rotulado; retirar `avance_obra` |
| 10 | Saldo caja / banco | `banco_movimientos.saldo_despues` (cadena) vs pie «Saldo al» descartado | | **CONFLICTO**: $42,16 M vs $3.584.941,27 (rama `fix/banco-saldo-declarado-echeq-48hs`) |
| 11 | Obras activas / cerradas / fusionadas | `obra_canonica` → `obra_panel` · `public.obras` (7 lectores) · portal leía `obra_canonica` sin filtro | | **CONFLICTO** |
| 12 | Cliente (identidad) | `clientes` · resolución texto→cliente en `cobranzas-a-cliente.mjs` y en `obra_cobranza` (`norm_obra`) | | **CONFLICTO de resolución**; ARCOR sin CUIT |
| 13 | Proveedor | `proveedores` (CUIT único) + `proveedor_alias` · `costos_obra.proveedor` texto libre | | ÚNICA con fuga |
| 14 | Papeles del cliente | `cliente_documento` (162) · `documento_cliente` (41, portal) · `cliente_orden` (374) · `recibo_cliente` · `drive_index` | | **CONFLICTO**: ficha 162, portal 41 |
| 15 | Papeles del proveedor | `proveedor_papel` + `proveedor_documento` | | ÚNICA por diseño |
| 16 | Persona activa | `personas.en_la_empresa` · `liquidacionPlantelActivo` (3 evidencias) · `usuariosService` (acceso) · padrón JORNALES | | **CONFLICTO de criterio**; 5 del FCL fuera del padrón |
| 17 | Jefe de obra | `esJefeDeObra(puesto)` (12 consumidores) · rol de acceso `jefe_obra` · rol organizacional | | ÚNICA como puesto; tres palabras para dos conceptos |
| 18 | Horas / asistencia | `registros_hh` · `asistencia_dia` · JORNALES → `registros_hh` (`fuente_legacy`) | | ÚNICA |
| 19 | Liquidación | `liquidacion_quincena/linea` + `nomina_recibo_neto` + `liquidacionAcuerdo.ts` · JORNALES (Sheet) sigue generando | | **CONFLICTO latente** (dos productores) |
| 20 | Cargas sociales declaradas / pagadas | `obligacion_resumen` · `calendario-financiero.mjs` por regex · Compras (prohibido) · pago real sólo en `banco_movimientos` | | **SIN FUENTE del «pagado»** |
| 21 | Obligaciones y vencimientos | `obligacion_resumen` · `esquema_pago` · `calendario-financiero.mjs:212` lee `Cobranzas!A5:R2000` directo | | **CONFLICTO** |
| 22 | Moneda de una cobranza | `sync-cobranzas` valúa (desde hoy) · `cruce-banco.mjs:80`, `impuestos-pestana.mjs:285`, `calendario-financiero.mjs:212`, `fechas-vs-extracto.mjs:159`, `conciliar-caja-vs-cashflow.mjs:353` leen por debajo de AA | | **CONFLICTO**: 5 lectores tratan U$S como $ |

## 2 · La regla: una fuente canónica por concepto

Dos familias. **Nace en el Sheet** (el dueño lo edita: Cobranzas, OBRAS, Compras, JORNALES, extracto):
la canónica es la réplica única en Postgres escrita por un solo sync; todo lo demás son vistas; nadie
lee el rango del Sheet salvo el sync y los generadores que escriben el Sheet. **Nativo del OS**
(`cliente_orden`, asistencia, `registros_hh`, liquidación, `obra_canonica`, `proveedores`, `personas`):
la canónica es la tabla; el Sheet, si existe, es salida.

| Concepto | Canónica | Propietario | Criterio | Secundarias → destino |
|---|---|---|---|---|
| Contratado | **`cliente_economia`** (vista nueva) + `obra_economia_cartera` | `obras-economia-sync.mjs` | suma de obras no fusionadas; NULL si OBRAS no lo tiene | `cliente_panel.contratado` se retira · `monto_contratado` sólo «declarado» o se retira (D1) · `contratado_de_obra()` lee la réplica |
| Facturado | `cliente_cuenta_corriente` | vista sobre `cobranzas` | ventana a decidir (D2) | `certificado_cliente.estado` → derivado de `cobranzas` |
| Cobrado | `cliente_cuenta_corriente` (cliente) · `obra_cobranza` (obra) | vistas | `estado='Cobrado' and fecha_cobro <= hoy` (un solo predicado) | portal lee las vistas |
| Pendiente / vencido | `cliente_cuenta_corriente` + `pendiente_contractual` | vista | vencido por fecha_cobro | `Cobranzas!V` salida; `por_cobrar_proyectado` → `no_cobrado` |
| Retenciones | `cobranzas.retenciones` · `fondo_reparo` · papel `cliente_orden` | syncs | tres nombres | `impuestos-pestana` lee `public.cobranzas` |
| Costo MO | `costo_mo_proyectado` (OBRAS) · `obra_costo_mo_real` (vista nueva) | sync OBRAS / liquidación | proyectado ≠ real ≠ devengado HH | |
| Costo materiales | `compra_unificada` (vista: `compra_sheet` ∪ `comprobante_compra`) → `obra_costo_real` | compras-sync + bot | devengado por comprobante | `costos_obra` se retira; `comprobantes_arca` sólo cruce fiscal |
| Margen | `obra_economia` (OS) · `margen_obras_sheet` (OBRAS) | vistas | nunca «margen» solo | |
| Avance | `obra_avance` (físico) · certificado (económico) | jefe / sync | rotulados | `avance_obra` se retira |
| Saldo banco | `banco_movimientos` + `banco_saldo_declarado` | `importar-banco.mjs` | declarado manda; cadena controla | `_BANCO_RAW`/CAJA derivadas |
| Obras | `obra_canonica` → `obra_panel` | app + `obras-fusionar` | fusionada nunca en listas | `public.obras` se retira (H3) |
| Cliente | `clientes` + `obra_alias` + función `cliente_de_texto(text)` | app | una resolución | |
| Proveedor | `proveedores` + `proveedor_alias` | app + `alta-padron` | CUIT | `costos_obra.proveedor` desaparece |
| Papeles cliente | `documento_entidad` (PRP puente) → vista `papeles_cliente` (+ `cliente_orden`, `recibo_cliente`, `compartible_portal`) | indexador + gmail + recibos | un archivo, una fila | `cliente_documento`, `documento_cliente` → vistas |
| Persona activa | vista `persona_estado` (`en_la_empresa`, `activa_quincena`, `acceso`) | app / liquidación | dos columnas con nombre | |
| Jefe de obra | `personas.puesto` → `esJefeDeObra()`; `usuario_obra.rol` (acceso) | app | puesto ≠ permiso | |
| Liquidación | `liquidacion_*` + `nomina_recibo_neto` | web | blanco = recibo; efectivo = cobra − blanco | JORNALES → salida (D6) |
| Cargas sociales | `obligaciones` (declarado) + `carga_social_pago` (nueva, pagado) | importador boletas + banco | declarado ≠ pagado | `calendario-financiero` regex → `obligacion_resumen`; Compras nunca |
| Obligaciones | `obligacion_resumen` | app | ya canónica | `calendario-financiero.mjs:212` deja el Sheet |
| Moneda | `cobranzas.moneda/tipo_cambio/*_origen` | `sync-cobranzas` | una valuación | 5 lectores → `public.cobranzas` |

## 3 · El control que pone rojo

- **`orquestador/datos/definiciones.json`**: una entrada por concepto (`canonica`, `propietario`,
  `criterio`, `ventana`, `confianza`, `prohibidas[{patron, porque}]`, `excepciones[{archivo, porque}]`).
- **`docs/engineering/DEFINICIONES.md`**: la cara humana; una sección por concepto con fuente
  primaria · propietario · criterio · consumidores · confianza · última decisión del dueño. El test
  exige correspondencia 1:1 JSON ↔ MD.
- **`src/shared/definiciones/canonico-definiciones.test.ts`**: entra por el glob de la suite; reusa
  `sinComentarios` de `prefetch-en-listas.test.ts`; barre `src/**` y `orquestador/**` (sin tests ni
  `node_modules`); por concepto, ningún archivo fuera de sus excepciones puede matchear un patrón
  prohibido; cada excepción debe seguir matcheando algo («mirando al aire» = rojo); el barrido debe
  ver > 500 archivos (verde vacío = rojo); ningún patrón prohibido puede matchear su propia canónica.
  Si hubiera existido el 10/09 habría puesto rojo: `esquemaService` (`cliente_panel.contratado`),
  `portal/obrasDelCliente` (`obra_canonica` sin filtro), 5 lectores de `Cobranzas!A5:…`, 7 `from('obras')`,
  `costos_obra` en control-obras y ficha de proveedor.
- Límite declarado: un test estático no ve consultas concatenadas ni `rpc()`; por eso
  **`canario-fuente-unica.mjs`** pasa a leer el mismo JSON y compara canónica vs cada cara en runtime,
  dentro del pipeline del Flujo de Caja, dejando constancia en `orq.events`.
- Alta de una lectura nueva: canónica → nada; fuente prohibida → excepción con motivo en JSON + MD en el
  mismo PR; cambio de canónica → primero el registro, el test dice qué quedó leyendo la vieja.
- Tabla `orq.definiciones`: descartada para arrancar (el test corre sin base); puede ser espejo después.

## 4 · Hitos

| Hito | Cierra | Migración | Verificación | Tamaño |
|---|---|---|---|---|
| **H1 · `cliente_economia`** contratado / facturado / cobrado / pendiente en UNA vista, consumida por lista, ficha, esquema, home, portal y barra; `certificado_cliente.estado` derivado de `cobranzas`; predicado «cobrado» unificado; registro + test con 4 conceptos | 1-4 | vista gateada con `ve_economia()`; `cliente_panel` pierde `contratado`/`costo_real` | SQL: por cliente `cliente_economia.contratado = Σ obra_economia_cartera` y `cobrado = cliente_cuenta_corriente.cobrado` · test canónico 0 lecturas prohibidas · E2E: mismo número en las 4 pantallas para Quattropani y Messina · `vistas-security-invoker` | M |
| **H2 · Moneda en TODOS los lectores** | 22, 21 | ninguna | patrón `Cobranzas!…:` prohibido salvo sync y generadores; fila 62 vale igual en impuestos, cruce-banco y cuenta corriente | S |
| **H3 · Obras: un solo eje** | 11, 9 | `obra_canonica.legacy_obra_id`; FKs de `pedidos_materiales`, `obra_adjunto_cliente`, `cliente_acceso.obras` → canónica; `public.obras` → `obras_legacy_retirada`; `drop view avance_obra` | 0 `from('obras')`; huérfanos = 0; portal Terminadas/Documentos desde `obra_panel` | M |
| **H4 · Papeles del cliente** (converge con PRP puente H2/H6) | 14 | `documento_entidad`; vista `papeles_cliente`; `cliente_documento`/`documento_cliente` → vistas | conteo ficha = vista; portal = `compartible_portal` | M |
| **H5 · Personas** | 16, 17, 19 | vista `persona_estado`; `jefe_de_obra` generado con la misma lista que `PUESTOS_DE_JEFE` (test SQL == TS) | `from('personas')` sólo en acciones; las 5 del FCL se ven con `en_la_empresa=false, activa_quincena=true` | M |
| **H6 · Registro y test completos** | 5-8, 10, 12, 13, 20, 21 | ninguna | suite verde con el test dentro (anotar antes los rojos preexistentes); canario en el pipeline | S |

El esqueleto del registro y el test nacen en H1 (4 conceptos) y cada hito agrega los suyos.

## 5 · Qué no hacer

Reemplazar Cobranzas/OBRAS/Compras por pantallas · hacer conscientes de la moneda a las 11 caras ·
un campo `activo` a mano · arreglar pantalla por pantalla sin registro ni test (hoy se hizo cinco
veces y no impide la sexta) · `drop table public.obras` (FKs) · un `.md` sin test o un test sin `.md`
· corregir la suite roja «de paso» · meter el test en `orq:test` antes de declarar las excepciones
vigentes (un rojo permanente se ignora en una semana).

## 6 · Decisiones del dueño

| # | Decisión | Opciones | Efecto |
|---|---|---|---|
| D1 | Qué es «contratado» con OC parciales y adicionales | (a) Σ OC valuadas al TC de la OC · (b) OC + adicionales aprobados · (c) lo que tipea en OBRAS | `cliente_economia.contratado`; destino de `monto_contratado` |
| D2 | Ventana de facturado/cobrado | 90 días (hoy) · acumulado por obra | una o dos columnas |
| D3 | `public.obras`: retirar y mapear «MAMPOSTERÍA» | | H3 |
| D4 | U$S → $: TC único del archivo o TC por fecha de fila | hoy: único | Quattropani |
| D5 | Fondo de reparo vs retención impositiva con nombres distintos | | H1 |
| D6 | Quién manda en la liquidación: JORNALES o la web; Oficina/50-50 | | `jornales-pestana` salida |
| D7 | Dónde se registra el pago de cargas sociales (fuera de Compras) | bloque en Cargas Sociales · `carga_social_pago` desde banco + boletas | concepto 20 |
| D8 | «Persona activa» para el padrón; las 5 del FCL | | H5 |
| D9 | Qué papeles ve el cliente en el portal | | H4 |
| D10 | Costo MO/materiales «real»: devengado o percibido | | nombres en `obra_costo_real` |
