# AUDITORÍA FUNCIONAL DEL COTIZADOR XSAS — ESTADO ACTUAL

_Fecha: 02/09/2026 · Base auditada: repo `24f3667a` + base productiva + gateway vivo (`c11b50ce`)._
_Método: verificación de código (archivo:línea), SELECTs contra la base productiva, y corridas en
vivo por la puerta real de /xsas. Los handoffs NO se tomaron como prueba. No se modificó nada._

**Convención de veredictos**: IMPLEMENTADO (código + evidencia de ejercicio) · PARCIAL ·
NO EJERCITADO (código probado que nadie llama en producción) · NO EXISTE · NO MEDIDO.

---

## 1. MAPA E2E ACTUAL

Hay **dos motores** con el mismo dominio:

- **Motor A (EN PRODUCCIÓN)** — `orquestador/lib/plano/`: drive_index → interpretación visual
  (modelo, cacheada por hash) → fusión → cómputo determinístico → selector de partidas (Base
  Maestra) → `cotizacion-v0.mjs` → tablas `cotizaciones`/`cotizacion_partida`/`computo` → vistas
  SQL `cotizacion_partida_valorizada`/`cotizacion_cascada` → pesos. Lo invocan `plano.cotizar` y
  `plano.razonamiento` (`lib/tools/plano-tool.mjs`) desde el gateway XSAS, y la web lee las vistas.
- **Motor B (NO EJERCITADO)** — `orquestador/lib/cotizador/`: 48 módulos + 53 tests, las 11 etapas
  INGEST→…→OUTPUT de `correr()` (`orquestador.mjs:127`), alcance, takeoff, costo con negativa a
  afirmar totales incompletos, cascada pura, indirectos por concepto, resolución de precios en
  cascada, freeze, oferta, obra, plan-vs-real, conversación. **Sus únicos invocadores son 3 scripts
  manuales.** El adaptador que uniría ambos motores — `desdePipelineDePlano()`
  (`orquestador.mjs:58`) — existe y su único importador es un test (`claude-zero.test.mjs:20`).
  La web importa exactamente 3 funciones del Motor B vía `services/cotizadorPuente.ts`
  (conversación, estado-desde-filas, huella de freeze).

Cadena real hoy, con el estado de cada flecha:

```
ENTRADA (chat/Drive)      IMPLEMENTADO   adjuntos suben a Drive + drive_index (adjuntos.mjs:71-113)
→ LECTURA                 IMPLEMENTADO   PDF/imagen/planilla/Word/DXF-DWG (ver §4)
→ INTERPRETACIÓN          IMPLEMENTADO   visión COMPLEX, caché por hash EN DISCO (pipeline.mjs:44,89-100)
→ CÓMPUTO                 IMPLEMENTADO   determinístico, Number→Evidence (ver §5)
→ PARTIDAS                IMPLEMENTADO   selector puro contra Base Maestra (seleccion.mjs:114)
→ COMPOSICIONES           IMPLEMENTADO   analisis/analisis_linea (223 tareas · 1.393 líneas)
→ RECURSOS                IMPLEMENTADO   406 recursos tipados
→ HH                      PARCIAL        hs_unitarias = Σ mano de obra del análisis; cuadrilla/duración NO EJERCITADO
→ PRECIOS                 PARCIAL        389 precios, TODOS del xlsm del 27/05/2026; cascada autónoma NO EJERCITADA
→ COSTO                   PARCIAL        vista con sum() que se come NULLs; la valorización correcta no se persiste
→ COTIZACIÓN              IMPLEMENTADO   borrador real en pesos («un techo, no una oferta», plano-tool.mjs:51)
→ CONGELADO               IMPLEMENTADO   lo más maduro: gate + huella + copia inmutable + trigger (ver §12)
→ OBRA                    IMPLEMENTADO (vía web/SQL sobre congelado) · el camino XSAS sólo previsto (ver §13)
→ REAL                    PARCIAL        25 registros de HH en 4 días; costo por actividad NO EXISTE (declarado)
→ APRENDIZAJE             PARCIAL        118 hechos CANDIDATO, 0 VALIDADO
→ REUTILIZACIÓN           NO EXISTE      0 datos aprendidos usados en una cotización (medido)
```

---

## 2. FUENTES DE DATOS

| Fuente | Aporta | Vive en | Se lee con | Consumidor | ¿Conectada al cotizador? | Evidencia |
|---|---|---|---|---|---|---|
| PDF de planos | geometría, elementos, grillas | Drive + `drive_index` (3.812) | visión COMPLEX + `pdf-parse` | pipeline plano | **SÍ** | `pipeline.mjs:89-100`; Quattropani vivo |
| Imágenes (png/jpg/webp/gif) | ídem | Drive | visión | pipeline plano | **SÍ** | `documentos.mjs:29` MIRABLE |
| DXF | bloques, cotas | Drive | parser local | `documental.ingerir` | **PARCIAL: se abre, su conteo NO llega al cómputo** | defecto `medicion-cad.mjs:104-118` vs `computo.mjs:93-116` |
| DWG | ídem | Drive | conversor local→DXF | ídem | **PARCIAL** (ídem) | `documental.mjs:187-193` |
| Excel/planillas | celdas, fórmulas → takeoffs | Drive/chat | parser local | `documental.takeoffs` | **NO: sólo lo consume un script** | `scripts/xsas-desde-documentos.mjs:137` |
| DOC/DOCX, pliegos, memorias, contratos | hechos, especificaciones | Drive | `leerWord` + clasificación | consolidación de hechos | **PARCIAL: bloquean por conflicto, NO completan datos** | `proyecto.mjs:128-213`; `hechosDe()` sin llamadores |
| Cotizaciones históricas ECSAS | referencia | Drive (232 archivos) | `estudiar-cotizaciones-drive.mjs` → biblioteca.json | script | **NO conectada al acto de cotizar** | count vivo |
| Base Maestra (tareas/composiciones) | 223 tareas, 1.393 líneas, 406 recursos | `tarea_tipo`/`analisis`/`analisis_linea`/`recurso` | SQL | selector + valorización | **SÍ** (núcleo) | `20260821T2200…sql` |
| Precios | 389 precios ARS | `recurso_precio` | vista `recurso_costo` | cascada de la cotización | **SÍ, pero foto única del xlsm 27/05/2026** | SELECT vivo |
| Compras reales (Sheet 943 + ARCA 682) | precios pagados | `compra_sheet`/`comprobantes_arca` | — | — | **NO: ningún flujo las convierte en precio** (`precio_aplicacion`=0) | SELECT vivo |
| Proveedores | 36 | `proveedores` | — | — | NO conectada al cotizador | SELECT |
| Jornales / HH reales | 25 registros HH (19-22/08), 24 quincenas | `registros_hh`/`jornales_quincena` | vistas `xsas_actividad` | aprendizaje | **PARCIAL: estructura sí, datos mínimos** | `xsas-aprendizaje.mjs:326` («de 277 actividades sólo 4 tienen HH») |
| Obras ejecutadas / Plan vs Real | 8 filas | vista `rendimiento_contra_lo_cotizado` | SQL | aprendizaje | PARCIAL | SELECT vivo |
| CIRCOT (UNSJ) | referencia MO + omisiones | `lib/circot/` + `datos/circot/mano-de-obra-2026-07.json` | import directo | **control de omisiones del pipeline** | **SÍ** (única referencia técnica externa conectada) | `pipeline.mjs:36,758-785` |
| Normas (CIRSOC/INPRES) | detección de mención sísmica | texto del plano | regex | razonamiento | PARCIAL: detecta cita, no aplica norma | `razonamiento.mjs:127-134` |
| Web | precio observado | `precio_observacion` (3 filas, VTEX Easy, con URL+SKU+evidencia+cotizacion_id) | `precio-web.mjs` por script | resolución de precios | **PARCIAL: el flujo existe, se usó 1 vez, no corre solo** | SELECT vivo |
| Investigación (web.search) | referencia externa | gateway | `investigacion_directa` | chat | NO llega al cotizador | `xsas-gateway.mjs:437` |
| Correcciones humanas | — | `orq.xsas_memoria`/`xsas_mensaje` (0 filas; desplegadas 02/09) | memoria conversacional | chat | **NO: ningún módulo del cotizador las lee** | grep en `lib/plano/`+`lib/cotizador/` |
| Memoria/aprendizaje XSAS | 118 hechos | `rendimiento_historico`/`duracion_historica`/`aprendizaje_candidato` | `rendimiento-para-cotizar.mjs` | tool de chat + web (vista `rendimiento_recomendado`) | **EXISTE PERO EL PIPELINE NO LA CONSULTA** | `pipeline.mjs:17-41` no lo importa |

**Provenance/prioridad/freshness**: los precios llevan fuente+fecha+moneda+vigencia
(`recurso_precio`); la interpretación lleva evidencia por dimensión (§5); la freshness real de los
precios es **mayo 2026** (una sola ingesta). Documentos que «revelan la respuesta» (presupuesto,
cómputo ajeno, contrato) se apartan y no entran como insumo (`documentos.mjs:33-83`).

---

## 3. JERARQUÍA DE FUENTES

La regla real cuando varias fuentes pueden resolver el mismo dato:

- **Geometría/cantidad**: cita del plano > nada. `dimension()` degrada a `INFERIDO` si el número no
  aparece en su cita (`fuente.mjs:144-190`); `incluyeExtremos` sin declarar ⇒ cantidad `null`
  (`computo.mjs:93-125`) — FALTA_DATO, no supuesto. Entre láminas: fusión union-find con
  contradicciones declaradas (`pipeline.mjs:408-546`). Entre documentos: jerarquía memoria > pliego
  > planilla > sin clasificar, con estados CONFIRMADO/COMPLETADO/**CONFLICTO**/SOLO_MENCIONES/
  RESUELTO_POR_JERARQUIA (`proyecto.mjs:102-213`). Un conflicto sin resolver deja la cotización
  INCOMPLETA (`control.mjs:283-296`).
- **Rendimiento**: `rendimiento-para-cotizar.mjs` separa **referencia (xlsm)** de **experiencia
  (ejecución real)** y no recomienda con un solo caso ni confianza baja (`:80-89`) — pero el
  pipeline no lo consulta: usa siempre el análisis vigente.
- **Precio**: producción usa el vigente de `recurso_precio` (sin cascada). La cascada
  INTERNO→COMPRA_ECSA→COMPARABLE→WEB con VIGENTE/ACTUALIZADO/NECESITA_HUMANO/SIN_PRECIO existe en
  `precio-resolucion.mjs:51,231` y sólo corre por script con `--aplicar` explícito.
- **Mapeo de estados reales del sistema** (pedidos vs implementados): HECHO_PROYECTO = evidencia
  citada del plano/documento · EXPERIENCIA_ECSAS = `fuente='ejecucion-real'` · BASE_MAESTRA =
  `analisis` vigente · REFERENCIA_TECNICA/CIRCOT = `lib/circot` + `REFERENCIA` en
  `rendimiento_historico` · WEB = `precio_observacion tipo WEB` · INFERIDO = `fuente.mjs` ·
  SUPUESTO = `supuestosOcultos` (`control.mjs:84-118`) · CANDIDATO/VALIDADO/DESCARTADO =
  `xsas-aprendizaje.mjs:16-18` · FALTA_DATO = `faltantes[]`/`PARTIDA_CANDIDATA` · CONFLICTO =
  consolidación documental. **NORMA como fuente aplicable no existe** (sólo detección de citas).

---

## 4. INGESTA DOCUMENTAL

Dos rutas separadas que no comparten tabla de formatos:

- **Chat /xsas** (`xsas-archivos.mjs` → `comunicacion/archivos/flujo.mjs`): PDF→texto local,
  planilla→filas, texto→extracto/texto, imagen→deriva a comprobantes; **DWG/DXF/DOCX por esta vía
  no se abren** (`DESTINO.NINGUNO`, `xsas-archivos.mjs:162-164`). Un plano adjuntado se sube a
  Drive y se indexa antes de cotizar (`adjuntos.mjs:71-113`).
- **Drive → pipeline** (`documentos.mjs`): al cotizador llegan sólo `plano*` con extensión MIRABLE
  `(pdf|png|jpe?g|webp|gif)` (`documentos.mjs:29,87-94`). CAD sale en `noLegibles` para el cómputo
  visual, pero `documental.ingerir` sí lo abre (DXF directo, DWG por conversor,
  `documental.mjs:77-91,187-193`); Word/Excel se abren como texto/hechos, no como geometría.

**Reconstrucción del proyecto**: el cruce PLANTA↔CORTE↔DETALLE↔CUADRO↔MEMORIA↔PLIEGO existe como
grafo de documentos + consolidación de hechos con jerarquía y conflictos (`pipeline.mjs:633`,
`relacion.mjs:238`, `proyecto.mjs:128-213`) — **a nivel documento/hecho, no a nivel elemento**, y
alimenta el CONTROL, no las cantidades: `hechosDe()` no tiene un solo llamador en producción, y los
`takeoffs` de planilla sólo los usa un script.

**Formatos que llegan a cotización**: PDF e imagen. **Sólo se abren**: DXF/DWG (bloques contados,
cantidad no computada — defecto §5), Excel (takeoffs sin consumidor), Word/pliegos (hechos que
bloquean, no completan). **No se abren**: RVT/IFC/SKP/DWF.

---

## 5. CÓMPUTO

Motor determinístico (`razonamiento.mjs` puro, sin modelo; `computo.mjs`; `computo-constructivo.mjs`):

| Concepto | Estado | Evidencia |
|---|---|---|
| Superficies (declaradas con cita + impronta como CÁLCULO) | IMPLEMENTADO | `pasoSuperficies` `razonamiento.mjs:88-110`; vivo Quattropani |
| Semicubierta | PARCIAL (sólo si un rótulo la declara) | `:108` |
| Bases B0/B1 + secciones | IMPLEMENTADO | `pasoBases` `:113-118` |
| Muertos de anclaje | IMPLEMENTADO | `ROL.MUERTO` `:38` |
| Columnas / encadenados | IMPLEMENTADO | `pasoColumnas` `:139-144` |
| Vigas fundación/arriostramiento/carga | IMPLEMENTADO | `pasoVigasFundacion` `:121-136` |
| Sísmica | PARCIAL por diseño (cita o «DESCONOCIDO») | `:127-134` |
| Excavaciones con profundidad (volumen sólo con ancho+largo+prof.) | IMPLEMENTADO | `pasoExcavaciones` `:183-212` + `computo-constructivo.mjs:253-291` |
| Luces / longitudes entre columnas | PARCIAL (reporta luces de grilla; no calcula luz entre apoyos por posición) | `pasoLuces` `:147-165` |
| Barrido X/Y | PARCIAL (inventario por lámina, no recorrido geométrico por ejes) | `pasoBarrido` `:168-179` |
| Relaciones entre elementos | IMPLEMENTADO a nivel documento/hecho, no elemento | §4 |
| Control de duplicación | IMPLEMENTADO (fusión + contradicciones declaradas) | `fusionarElementos` `pipeline.mjs:408-546` |
| Control de omisión | IMPLEMENTADO (adversarial: CIRCOT + checklist; propone, no agrega) | `pipeline.mjs:758-762` |
| Cantidad por separación (n/n+1) | IMPLEMENTADO y estricto (`incluyeExtremos` sin default) | `computo.mjs:93-125` |
| **Cantidad por conteo CAD** | **DEFECTO: no produce cantidad** — `medicion-cad.mjs` emite `modo:'conteo_cad'` que `computo.mjs` no conoce; cae a la rama de separación y devuelve `null` con motivo equivocado, aunque `viaDeCantidad` la cuenta como resuelta | `medicion-cad.mjs:104-118` vs `computo.mjs:93-116`; cotas contadas y no usadas `:126-128` |

**Number→Evidence**: cada dimensión viaja con `{archivo, lámina, vista, textoLiteral, ubicación}`;
`origenCitable` exige archivo+textoLiteral+(lámina|vista) y separa `computados` de `admitidas`
(`computo.mjs:193-228`); `supuestosOcultos` contrasta el número contra su propia cita
(`control.mjs:84-118`). Dos huecos: evidencia vacía se persiste como el string `«null»`
(`cotizacion-v0.mjs:166`) y las cantidades agregadas por tipo del `plano.razonamiento` salen sin
cita propia (`razonamiento.mjs:72-83`).

---

## 6. PARTIDAS (CÓMPUTO → PARTIDA)

IMPLEMENTADO y **determinístico**: `seleccionar()` (`plano/seleccion.mjs:114`) — filtros duros de
unidad compatible y conflicto de atributos, puntaje por vocabulario con «delatores» de sistema
constructivo (`partidas.mjs:58-70`), desempate por código para que el orden de la consulta no
decida. Contra **Base Maestra** (`tarea_tipo`, 223 tareas), no histórico ni modelo. El modelo sólo
puede **vetar**, nunca promover (`seleccion.mjs:114-117`).

- Ninguna compatible → `PARTIDA_CANDIDATA`, `fuente: FALTA_DATO` (`seleccion.mjs:125`).
- Dos empatadas (distancia < 0,25) → `AMBIGUO`, sin partida, con las dos a la vista (`:48,129`).
- Puntaje < 0,9 o atributo sin respaldo → `PARTIDA_CANDIDATA` (`:47,126-128`).
- Huella reproducible de la selección (`:161`). En base: 157/161 partidas mapeadas a Base Maestra.

---

## 7. COMPOSICIONES (PARTIDA → COMPOSICIÓN → RECURSOS)

IMPLEMENTADO en Postgres: `analisis` (versionado, un solo vigente) → `analisis_linea` (1.393) →
`recurso` (406) con CHECK `tipo in (mano_obra, carga_social, material, equipo, otro)`; subcontrato
es flag de partida. Desglose calculado por vista `analisis_costo`, no guardado. Origen declarado:
`Planilla para Cotizar (2).xlsm` (ingesta 21/08). Ejemplo real: T1023 = 0,9 h oficial + 0,8 h
ayudante por unidad (`base-maestra-hh.mjs:21`).

- **Modificación por cotización**: sólo al congelar — la composición se copia línea por línea a
  `cotizacion_partida_composicion` (462 filas hoy) con nombre/código en vez de id (§12).
- **El borrador de `plano.cotizar` NO escribe composición** pese a lo que anuncia el encabezado del
  archivo (`cotizacion-v0.mjs:5-10` vs `:154-168`): la valorización del borrador es la vista viva.

---

## 8. HH / RENDIMIENTOS

- El rendimiento con que se cotiza es `hs_unitarias = Σ cantidad de líneas mano_obra` del análisis
  vigente (`20260821T2200…sql:161`; «hs_unitarias es el rendimiento», `:163`). O sea: **xlsm, no
  experiencia**.
- `rendimientoParaCotizar()` (referencia vs experiencia, mediana, confianza; un caso no cambia el
  precio) existe, está expuesto como tool de chat y como vista para la web
  (`rendimiento_recomendado`, 205 filas) — **el pipeline de cotización no lo consulta**
  (`pipeline.mjs:17-41`).
- **HH→cuadrilla→duración**: método Navas/Ridl/Torés completo en `plano/cuadrilla.mjs` (8
  funciones, jornada efectiva 7,50 h, con tests) — **NO EJERCITADO: nadie lo importa** salvo tests.
- Datos de ejecución real: 25 `registros_hh` (19–22/08), 8 filas en `rendimiento_contra_lo_cotizado`,
  2 rendimientos CANDIDATO de Quattropani (0,116 hs/m² vs 0,120 plan, confianza alta; 0,400 hs/m³
  vs 3,400, baja). **La retroalimentación real→futuras cotizaciones NO ocurre todavía** (§15).

---

## 9. PRECIOS

- **Producción**: `recurso_precio` — 389 precios, **todos ARS, fecha 27/05/2026, una sola fuente**
  (xlsm, ingesta 21/08); 58 sin fecha declarados como tales (NULL «no es cero ni hoy»). USD con
  `costo_origen`+`tc_aplicado`. Desperdicio aplicado en vista (`recurso_costo`).
- **SIN_PRECIO honesto**: un recurso sin precio deja la partida con `costoUnitario: null`, nunca $0
  (`cotizacion-v0.mjs:88`); `analisis_incompleto` publica la deuda. PERO ver §10: la vista de
  producción no hereda esa negativa.
- **Cascada autónoma** (`precio-resolucion.mjs`): INTERNO→COMPRA_ECSA→COMPARABLE→WEB, resultados
  VIGENTE/ACTUALIZADO/NECESITA_HUMANO/SIN_PRECIO, provenance con recorrido y descartados, aserción
  que rompe antes que publicar $0, precio vencido no se usa en silencio. **Corre sólo por script,
  no escribe por defecto** (`resolver-precios.mjs:24-29`). Evidencia real: 107 resoluciones (49
  VIGENTE, 56 NECESITA_HUMANO, 2 SIN_PRECIO) + 3 observaciones WEB con URL/SKU/evidencia.
- **XSAS NO actualiza ningún precio autónomamente hoy.** Las compras reales (943 Sheet + 682 ARCA)
  no alimentan ningún precio (`precio_aplicacion` = 0).

---

## 10. COSTO Y PRECIO DE VENTA

- **Cascada real de la empresa, versionada, sin backsolve**: costo directo → +GG 27% → industrial →
  +beneficio 22% + financiero 3,5% → +IIBB 2,4% + Ganancias 2% → subtotal → +cheque 1,2% → venta
  sin IVA (coef. 1,68197, verificado contra el libro 6/6 con $0,00 de diferencia) → +IVA 21%
  (2,03518). Ocho porcentajes = política versionada en `parametro_comercial` (vigencia, fuente, un
  vigente); cada cotización los **copia** para que cambiar la política no reescriba ofertas.
  Coeficiente inescribible por diseño (`comercial.mjs:237`); búsqueda de patrones de backsolve en
  todo el repo: cero.
- **Indirectos por concepto** (`indirectos.mjs`, con override auditado): Motor B, NO EJERCITADO —
  producción usa sólo `pct_gastos_generales`.
- **Dato implícito peligroso encontrado**: la vista de producción suma con
  `coalesce(sum(subtotal),0)` que **se come los NULL** y publica el costo directo como completo
  (`20260821T4300…sql:174`); la guarda «un total al que le falta un renglón no se afirma» existe
  sólo del lado desconectado (`costo.mjs:1-22`). Además `persistir()` no escribe `costo_unitario`,
  así que **el precio del borrador es el VIVO de la Base Maestra**: dos corridas del mismo plano en
  fechas distintas pueden dar totales distintos sin señal. Los contadores `n_sin_analisis`/
  `n_sin_precio` quedan al lado, en otra columna.

---

## 11. GENEALOGÍA

IMPLEMENTADO, con huecos declarados en vez de omitidos:

- En memoria: 10 eslabones PROYECTO→…→COTIZACION (`genealogia.mjs:27`), `cadenaDe()` devuelve
  `faltantes`/`completa`.
- En base: cada línea de `computo` (65 filas) guarda documento (drive_id + nombre), elemento,
  fórmula, entradas y **el texto literal del plano** (`cotizacion-v0.mjs:163-168`); la partida
  guarda `tarea_tipo_id`+`analisis_id`+`analisis_version`; la composición congelada guarda recurso,
  costo y fecha de precio.
- Navegable por SQL: `xsas_genealogia_cadena(partida_id)` recorre 11 eslabones con huecos
  declarados (`20260901T0400…sql:190-245`) — hoy la invocan 2 scripts y 1 test; la web no.
- Seguimiento real hacia atrás verificado en vivo: el razonamiento de Quattropani cita lámina y
  texto literal por número («258.77 m² (A-01)», «6.00 6.00 6.00 6.08 … (en Corte B-B)»).
- Hueco: evidencia vacía persiste como `«null»`; las cantidades agregadas del razonamiento no
  arrastran cita (§5).

---

## 12. FREEZE / VERSIONES

**El punto más maduro.** `congelar_presupuesto()` es función de base, no un update: copia línea por
línea la composición (con nombre/código, no id, para sobrevivir bajas), snapshot del paquete
subcontratado, fija `costo_unitario`/`hs_unitarias`/`analisis_version`, se niega a correr dos veces
y exige `ve_economia()`. El **gate corre ANTES y en la misma transacción**
(`cot_congelar_con_gate()`, `20260829T1500…sql:239-257`), la web lo llama de verdad
(`actions.ts:222`) calculando la **huella SHA-256 de entradas** (`freeze.mjs:50`) hacia
`cotizacion_huella`. Trigger `composicion_congelada_no_se_reescribe` fuerza la inmutabilidad.
Versiones: `(numero, version)` único, un vigente por número; la revisión nace en borrador y sin
costos fijados, para revalorizar — **no toca la versión congelada**.
Limitación: `cotizacion_huella` y `cotizacion_evento` tienen 0 filas (ningún freeze ejercitado
todavía sobre datos reales); `oferta.mjs`/`revisar()` sin caller fuera de tests.

---

## 13. COTIZACIÓN → OBRA

- IMPLEMENTADO (web/SQL): `convertir_partida_a_plan()` exige adjudicado+congelado y genera
  rubro→frente→tarea con `cantidad_objetivo` y `hh_plan` (NULL = «sin cargar», nunca 0); los
  **materiales viajan por trigger** desde la composición congelada
  (`obra_actividad_insumo_plan`, origen `presupuesto_congelado`, sin precio a propósito).
  Evidencia de uso: `obra_partida_plan` 26 filas, `obra_origen_cotizacion` 1.
- Sólo PREVISTO: `plano/genealogia.mjs::obraDesdeCotizacion()` (en memoria, no escribe; 14
  eslabones de obra declarados pendientes), `cotizador/obra.mjs::adjudicar()/prepararObra()` (sin
  callers fuera de scripts), dependencias/duraciones/cuadrillas (cuadrilla.mjs muerto, §8).

---

## 14. OBRA → REAL

Lo que hoy recibe el sistema de la ejecución:

| Dato real | Estado | Evidencia |
|---|---|---|
| HH reales | PARCIAL: 25 registros en 4 días (19–22/08); esquema soporta actividad/improductiva/causa_desvio | `registros_hh` |
| Jornales | 24 quincenas SIN obra (`jornales_quincena_obra`=0) | SELECT |
| Asistencia | 4 marcas | `asistencia_marca` |
| Materiales/compras | 943+682 comprobantes, sin imputación a partida cotizada | §9 |
| Costos de obra | `costos_obra` 934 / `costos_reales` 37; `obra_partida_costo_real`=0 — **costo por actividad NO EXISTE, declarado** (`xsas-que-se-aprende.mjs:54-59`) | SELECT |
| Duración | 116 duraciones históricas medidas (dominantes La Estrella) | `duracion_historica` |
| Avance/desvíos vs cotizado | vista `rendimiento_contra_lo_cotizado` = 8 filas | SELECT |
| Certificaciones | `certificados` 0 | SELECT |

El vínculo con lo cotizado existe como estructura (vistas + `obra_origen_cotizacion`), con datos
mínimos: «de 277 actividades reales sólo 4 tienen HH» (`xsas-aprendizaje.mjs:326`).

---

## 15. APRENDIZAJE

Circuito real, flecha por flecha:

```
COTIZADO→ESPERADO      PASS      hh_plan/hs_unitarias en el plan de obra
ESPERADO→EJECUTADO     PARCIAL   8 filas de rendimiento_contra_lo_cotizado
EJECUTADO→REAL         PARCIAL   25 HH reales en 4 días; costo por actividad no existe
REAL→DIFERENCIA        PASS      xsas-aprendizaje compara contra plan (0,116 vs 0,120)
DIFERENCIA→OUTCOME     PARCIAL   confianza alta/media/baja calculada
OUTCOME→CANDIDATO      PASS      2 rendimientos + 116 duraciones CANDIDATO; timer echegaray-xsas-ciclo ACTIVO
CANDIDATO→CONTRASTADO  NO EXISTE (exige otra obra con la misma tarea; nunca ocurrió)
CONTRASTADO→VALIDADO   NO EXISTE 0 VALIDADO en toda la base
VALIDADO→REUTILIZADO   NO EXISTE medido: script de reuso = «familia aprendizaje: 0 elegibles, 0 reuso»;
                                 además «nadie registra qué aprendizaje se aplicó a qué decisión»
```

**Qué puede aprender hoy** (infraestructura + primer dato): rendimiento hs/unidad (2 CANDIDATO) y
duración por tarea (116 CANDIDATO). **Qué no**: consumo de material, cuadrilla, composición,
precio, proceso constructivo, clasificación — sin flujo de captura. Estados reales:
CANDIDATO/VALIDADO/DESCARTADO + REFERENCIA (`xsas-aprendizaje.mjs:16-18,181-190`); un CANDIDATO
valida sólo contra **otra obra** (`:414-419`) — el diseño es sano, el cuello es la materia prima
(§14).

---

## 16. CONSOLIDACIÓN DEL CONOCIMIENTO

| Tipo | Artefacto | Estado/provenance | Versionado | Consumidor | Promoción |
|---|---|---|---|---|---|
| RAW documental | Drive + `drive_index` (3.812) | path/nombre/hash | no | pipeline | — |
| RAW interpretación | **`~/.cache/echegaray-planos` (63 archivos, por hash)** — no tabla | llave = sha256 contenido | v1/v2/v3region | pipeline | — |
| RAW conversacional | `orq.xsas_mensaje` (0 — desplegada 02/09) | actor+conversación | no se reescribe | memoria XSAS | — |
| MEMORIA conversacional | `orq.xsas_memoria` (0) | estados mencionado…conflicto, genealogía | supersesión | chat (no el cotizador) | corrección del actor |
| HECHO de proyecto | `computo` (65) + hechos consolidados en memoria de corrida | texto literal citado | por cotización | valorización/control | — |
| EXPERIENCIA ECSAS | `rendimiento_historico` (2 ejecución-real) / `duracion_historica` (116) | obra+fuente+confianza | fila por medición | `rendimiento-para-cotizar` (chat/web) | CANDIDATO→VALIDADO con 2ª obra |
| REFERENCIA | `rendimiento_historico` REFERENCIA (9, xlsm) + `lib/circot/` + `precio_observacion` WEB | fuente declarada | — | pipeline (CIRCOT) / scripts | nunca se promueve sola |
| BASE MAESTRA | `tarea_tipo`/`analisis`/`analisis_linea`/`recurso(_precio)` | fuente xlsm, fecha | `analisis.version`, 1 vigente | selector + valorización | decisión humana |
| POLÍTICA | `parametro_comercial` | fuente + vigencia | 1 vigente, copiado a cada cotización | cascada | dueño |
| CONGELADO | `cotizacion_partida_composicion` (462) + `cotizacion_huella` (0) | snapshot con fecha de precio | inmutable por trigger | oferta/obra | freeze con gate |

---

## 17. DEPENDENCIA DE MODELOS

| Etapa | Naturaleza | Providers OFF |
|---|---|---|
| Buscar/clasificar/relacionar documentos | DETERMINÍSTICO | corre igual |
| **Interpretar lámina / región / medir** | **REASONER (visión COMPLEX; Anthropic→openai-compatible fallback)** | 0 elementos; `error` por lámina + `laminasNoLeidas` declaradas — **FALTA_DATO, no invento** (`pipeline.mjs:286-309,801-815`) |
| Abrir CAD/PDF/Word/Excel | DETERMINÍSTICO (parsers locales) | corre igual |
| Fusión, cómputo, procesos | DETERMINÍSTICO/PURO | corre igual (sin láminas no hay qué computar) |
| Selección de partida | DETERMINÍSTICO; modelo sólo veta | mismo resultado sin veto |
| Control/cobertura/CIRCOT/checklist | DETERMINÍSTICO | corre igual |
| Precios y cascada | DETERMINÍSTICO (SQL) | corre igual |
| `plano.razonamiento` con caché tibio | DETERMINÍSTICO | responde completo (vivo: 0 llamadas) |
| Cierre / decisión de oferta | HUMANO | borrador, preguntas priorizadas |
| KNOWLEDGE (memoria/aprendizaje) | DETERMINÍSTICO | corre igual — pero hoy no alimenta la cotización |
| RESEARCH (web) | sólo por script / chat | no llega al cotizador |

El único Reasoner imprescindible es la **visión** de láminas (y su prompt prohíbe calcular y
rellenar nulls, `interpretar.mjs:96-101`). Todo lo demás degrada declarando.

---

## 18. MÉTRICAS (con casos reales como regresión)

**Corridas vivas de esta auditoría (02/09, puerta real, sin corregir nada):**
- **Quattropani** — `plano.razonamiento`: OK en 18,7 s con **`llamadas_ia = 0`** (caché por hash);
  7 pasos con citas (superficies declaradas 258,77 m² A-01; impronta 199,5 m² marcada CÁLCULO con
  la grilla citada; bases con cantidad incompleta declarada, «no se inventa»). 6 cotizaciones
  `xsas:plano` en borrador; los 2 únicos rendimientos aprendidos de ejecución real son de esta obra.
- **La Estrella** — 112 archivos en drive_index (con .dwg), 2 obras canónicas, dominante en las 116
  duraciones aprendidas. `plano.razonamiento` en frío **no completó en dos intentos (timeouts de
  cliente a 5 y 9,7 minutos, 0 bytes)**; del lado del servidor la interpretación SÍ corrió — en la
  ventana se registraron **11 `interpretar-plano` + 48 `interpretar-region` + 7 `medir-plano`**
  exitosas en `chat_cost` — pero el request nunca llegó a registrarse en `xsas_requests`. Evidencia
  del costo real de una obra grande sin caché (≈66 llamadas de visión) y de que el camino largo no
  responde dentro de un timeout razonable de chat.
- Historial: **12 corridas** registradas del cotizador de planos (8 `plano.cotizar` + 4
  `plano.razonamiento`), **8 en error**; llamadas de visión previas: 6 `interpretar-plano` + 4
  `medir-plano` (`orq.chat_cost`).

| Métrica | Valor | Estado |
|---|---|---|
| % partidas mapeadas a Base Maestra | 157/161 = 97,5% | MEDIDO (script de reuso) |
| % precios resueltos en la última resolución | 49 VIGENTE / 56 NECESITA_HUMANO / 2 SIN_PRECIO (107) | MEDIDO |
| «Reuso» global reportado | 77,4% — **es xlsm + mapeo, no aprendizaje** | MEDIDO |
| Reuso de aprendizaje | **0 elegibles / 0 reuso** | MEDIDO |
| % cantidades resueltas por corrida | `viaDeCantidad` existe pero cuenta mal el CAD (§5) | NO CONFIABLE |
| % composiciones/recursos/HH resueltos | sin denominador persistido por corrida | NO_MEDIDO |
| Model calls por corrida | `llamadas_ia` en el output (vivo: 0 cacheado; ≈66 La Estrella en frío) | MEDIDO |
| Preguntas humanas | `control.preguntas` en el output; sin serie histórica | PARCIAL |
| FALTA_DATO / CONFLICTO por corrida | en el output (`faltantes`, control INCOMPLETA); sin serie | PARCIAL |
| Aprendizaje reutilizado | 0 | MEDIDO |

---

## 19. QUÉ FUNCIONA REALMENTE

1. Plano PDF/imagen → interpretación con evidencia por dimensión → cómputo determinístico →
   partida por selector puro → borrador en pesos, vivo por /xsas (Quattropani, 0 IA en caché).
2. La barrera anti-invento: cita por número, INFERIDO degradado, `incluyeExtremos` sin default,
   supuestos ocultos contrastados, FALTA_DATO/AMBIGUO/PARTIDA_CANDIDATA en vez de elegir en silencio.
3. Base Maestra completa y versionada (223/1.393/406) con cascada comercial verificada contra el
   libro y sin backsolve posible.
4. Freeze con gate en la base, huella, copia inmutable y conversión a obra con materiales heredados
   (web/SQL).
5. CIRCOT-UNSJ conectado al control de omisiones. Control adversarial que propone y no agrega.
6. Ciclo de aprendizaje corriendo por timer, con estados sanos (CANDIDATO exige otra obra para validar).

## 20. QUÉ ESTÁ PARCIAL

- HH: rendimiento = xlsm; experiencia medida pero no consultada por el pipeline; cuadrilla/duración
  implementado y muerto.
- Precios: honestos pero congelados en mayo; cascada autónoma sólo por script; web usada 1 vez.
- Costo publicado: la vista suma comiéndose NULLs; el borrador valoriza con el precio vivo.
- Cruce documental: bloquea por conflicto, no completa datos; takeoffs sin consumidor.
- CAD: se abre, se cuenta, y la cantidad no llega al cómputo (defecto concreto).
- Genealogía navegable por SQL que la web no usa; evidencia `«null»` en algunos cómputos.
- Real: estructuras listas, 25 HH en 4 días de datos.
- `plano.razonamiento`: cantidades agregadas sin cita propia; no persiste; en frío no responde
  dentro de un timeout de chat para obras grandes.

## 21. QUÉ NO EXISTE

- Reutilización real de aprendizaje en una cotización (0, medido) y registro de qué aprendizaje se
  aplicó a qué decisión.
- Flujo compras reales → precios de recursos (`precio_aplicacion` = 0).
- Costo real por actividad (declarado inexistente por diseño actual).
- Validación (0 VALIDADO) — nunca hubo segunda obra con la misma tarea medida.
- El Motor B en producción: 11 etapas, alcance, indirectos por concepto, oferta/revisión, cola de
  atención completa — todo sin caller real.
- Normas aplicadas como fuente (sólo detección de citas), RVT/IFC, aprendizaje de consumo de
  material/cuadrilla/composición/precio/proceso, memoria conversacional consumida por el cotizador,
  serie histórica de métricas por corrida.

## 22. TOP 10 BRECHAS POR IMPACTO

1. **El motor grande está escrito, probado y desconectado** — 48 módulos, 11 etapas, y el adaptador
   `desdePipelineDePlano()` lo importa un solo test. Todo lo que sigue (alcance, cola completa,
   indirectos, oferta) está detrás de esa costura sin enchufar.
2. **Se cotiza con precios de mayo 2026** — 389 precios de una sola foto del xlsm, mientras 943
   compras + 682 comprobantes ARCA de todo el año están en la base sin ningún flujo al cotizador,
   y la cascada de resolución de precios (construida, con provenance) no corre sola.
3. **Aprendizaje con 0 reuso** — 118 hechos CANDIDATO, 0 VALIDADO, el pipeline no consulta
   `rendimientoParaCotizar()`, y nadie registra qué aprendizaje se aplicó a qué decisión: hoy el
   cotizador no mejora con las obras.
4. **La materia prima del aprendizaje casi no existe** — 25 registros de HH en 4 días, jornales sin
   obra, costo por actividad inexistente: aunque se conectara el circuito, no habría con qué validar.
5. **El costo publicado puede afirmar de más y moverse solo** — la vista suma comiéndose NULLs
   (partida sin precio no resta del total) y el borrador valoriza con el precio VIVO: dos corridas
   del mismo plano pueden dar totales distintos sin señal.
6. **El conteo CAD no produce cantidades** — la única vía de cantidad sin modelo emite un modo que
   el cómputo no conoce y devuelve null con motivo equivocado, contándose igual como resuelta.
7. **El cruce documental no completa datos** — memoria/pliego/planilla pueden bloquear la
   cotización pero nunca llenan una dimensión faltante; `hechosDe()` y los takeoffs no tienen
   consumidor.
8. **HH→cuadrilla→duración muerto** — el método completo existe con tests y nadie lo llama: la
   cotización no produce duración ni plan de mano de obra.
9. **La interpretación (lo más caro) vive en un caché de disco local y no escala a obra grande** —
   sin tabla, sin trazabilidad por proyecto, repagable ante limpieza o cambio de máquina; 8 de 12
   corridas históricas en error y La Estrella en frío (≈66 llamadas de visión) sin responder en
   10 minutos.
10. **Freeze/oferta sin ejercitar sobre datos reales** — el mecanismo más maduro del sistema
    (gate+huella+inmutabilidad) tiene `cotizacion_huella` y `cotizacion_evento` en 0: ninguna
    cotización real pasó todavía por congelado → oferta → obra de punta a punta.
