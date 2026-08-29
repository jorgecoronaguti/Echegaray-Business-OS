# COTIZADOR — MAPA A/B/C/D

Qué existe hoy para «cotización real punta a punta» (PROGRAMA v5), estación por estación.
**A** ya existe · **B** parcial · **C** existe pero no está conectado · **D** falta implementar.

Es para USAR. Antes de escribir una línea de una estación, mirar su fila y abrir el archivo citado.

---

## Estaciones

| # | Estación | Est. | Dónde está hoy | Qué falta |
|---|---|---|---|---|
| 1 | **INGEST** documentos (hash, tipo, versión, no reprocesar) | **B** | `plano/pipeline.mjs:43` `DIR_CACHE`, `:64` `leerCache`, `interpretar.mjs:283` `llaveDeCache` (sha256 del contenido) · `plano/documentos.mjs` `partirDocumentos` · `plano/documental.mjs:34` `claseDocumental` | El hash es del CONTENIDO y sirve de caché, pero no hay REGISTRO de documento con `{hash,tipo,version,estado,provenance}` consultable. §3 pide el registro, no sólo el caché |
| 2 | **INTERPRET** (LLM sólo acá, cacheado) | **A** | `pipeline.mjs:82` `interpretarLamina`, `:219` `interpretarRegion`, `plano/interpretar.mjs` `PROMPT/validarLamina` · degradación en `pipeline.mjs:285` `pedirConDegradacion` | — |
| 3 | **Proyecto como representación común** (complementa/contradice) | **A** | `plano/proyecto.mjs:115` `consolidar`, `:101` `ESTADO_HECHO`, `:334` `armarProyecto` · conflictos llegan a `control.mjs:278` | — |
| 4 | **SCOPE / ALCANCE** INCLUIDO/EXCLUIDO/POR_DEFINIR | **D** | `proyecto.mjs:224` `alcanceDe(frase)` detecta la frase, pero no existe entidad de alcance ni cruce EXCLUSIÓN↔CÓMPUTO | Todo: entidad, provenance obligatorio, y que una exclusión BLOQUEE partidas (§5) |
| 5 | **TAKEOFF / CÓMPUTO** | **A** | `plano/computo.mjs:132` `computarElemento` (value/formula/inputs/hueco) · `medicion-cad.mjs` · fusión y contradicciones en `pipeline.mjs:407` `fusionarElementos` | — |
| 6 | **UNIDADES FUERTES** (m ml m² m³ kg t un l hs día) | **D** | `plano/partidas.mjs:28` `EQUIVALENTES` sólo conoce `m3 m2 m un`. No hay parser de magnitud vs monetario | «520 m²» ≠ «520 millones»; kg/t/l/hs/día; incompatible ⇒ AMBIGUO/ERROR (§7) |
| 7 | **MAP a Base Maestra** (MATCH/CANDIDATO/AMBIGUO/SIN_PARTIDA) | **A** | `plano/seleccion.mjs:114` `seleccionar` PURA, `:35` `ESTADO`, `:161` `huella` · atributos discriminantes `plano/atributos.mjs` · veto del modelo sólo RESTA | Renombrar estados al vocabulario del §8 es cosmético: el contrato mapea `PARTIDA_CANDIDATA→SIN_PARTIDA/CANDIDATO` |
| 8 | **COMPOSE / APU** explota en MO/MAT/EQ/SUBC | **B** | `pipeline.mjs:136` `composiciones()` trae `analisis_linea` + `recurso_precio` vigente con `tipo` · `cotizacion-v0.mjs:101` `desglose` | Falta `source/version/validity/provenance` por línea y la distinción HISTORICA≠VALIDADA (§9) |
| 9 | **PRECIOS** RESOURCE ≠ PRICE OBSERVATION | **B** | `pipeline.mjs:144` `left join recurso_precio rp on rp.vigente` — devuelve `costoUnitario:null` si no hay precio (bien) y `fechaPrecio/moneda/fuentePrecio` (bien) | No hay entidad observación con `vigencia`; `PRECIO_DESACTUALIZADO` sólo existe como métrica en `plano/certeza.mjs:122` `plataEnPreciosViejos`, no como estado del dato (§10) |
| 10 | **FX explícito** | **B** | `base-maestra-moneda.mjs:128` `tipoDeCambioDeLibro`, `:89` `monedaDe` · `base-maestra-ajuste.mjs:90` `clasificarAjuste` ya devuelve UNKNOWN para el coeficiente no probado (§11 cumplido) | Falta `{pair,rate,source,observed_at,applied_at}` viajando con el costo aplicado |
| 11 | **HH** (TOTAL/CUADRILLA/JORNADA/DURACIÓN) | **A** | `base-maestra-hh.mjs:95` `hhPorCategoria` · `plano/cuadrilla.mjs:70` `horasNecesarias`, `:191` `cuadrillaOptima` — «más gente no baja HH, baja duración» ya está separado | — |
| 12 | **COSTO DIRECTO** determinístico y trazable | **B** | `cotizacion-v0.mjs:86` `valorizar` (un recurso sin precio ⇒ partida sin costo: correcto) · vista `cotizacion_partida_valorizada` (mig. `20260821T3100`) | **DEFECTO**: `cotizacion_cascada` hace `coalesce(sum(v.subtotal),0)` — `sum()` ignora NULL, así que una partida sin precio se cae del total y el total SE AFIRMA igual. §15 dice que no se afirma |
| 13 | **SUBCONTRATO sin precio ≠ $0** | **B** | Vista `cotizacion_partida_valorizada` (`20260821T3100:68`) publica `sin_precio_de_subcontrato` y `subtotal=NULL` | El contador existe; el TOTAL no se bloquea (mismo defecto de la fila 12). Falta `{scope,supplier,qty,quote_date,validity,source}` (§14) |
| 14 | **INDIRECTOS** CALCULATED vs APPLIED | **D** | Sólo `pct_gastos_generales` (un escalar) en `parametro_comercial` | Modelo estructurado, override guardado, nunca perder el calculado (§16) |
| 15 | **POLÍTICA COMERCIAL versionada y separada** | **A** | `public.parametro_comercial` (mig. `20260821T4300`) — 8 porcentajes, versionados, con fuente y vigencia; la cotización los COPIA | — |
| 16 | **COEFICIENTE DERIVADO, no escribible** | **A** | `cotizacion_cascada.coeficiente_sin_iva` es una expresión de la vista: no hay columna que escribir (`20260821T4300:218`) | — |
| 17 | **RESOURCE EXPLOSION** (QUOTE→ITEMS→COMPOSITIONS→TOTAL) | **D** | `cotizacion-v0.mjs:101` `desglose` agrega POR PARTIDA y por tipo; no hay total por RECURSO | Todo (§13) |
| 18 | **OUTLIER ENGINE** | **D** | No existe | Todo (§20). `certeza.mjs:230` `REGLAS` es un control de cierre, no un detector de valores atípicos |
| 19 | **EVENTOS / UNDO** | **D** | No existe tabla ni módulo (`grep` sin resultado en `supabase/migrations`) | Todo (§21) |
| 20 | **COLA DE ATENCIÓN derivada** | **B** | `plano/control.mjs:137` `preguntas`, `:240` `decisiones`, `:278` `controlar` producen preguntas con dueño | No son issues tipados con `{type,severity,entity,impact,evidence,recommended_action}` ni están ordenados por bloqueo+materialidad (§22) |
| 21 | **BLOCKING vs NON-BLOCKING testeado** | **B** | `control.mjs:266` `AMBIGUEDADES_QUE_BLOQUEAN`, `:269` `ESTADO_COTIZACION` | Es un binario COMPLETA/INCOMPLETA sobre cobertura. Faltan las reglas del §23 (cantidad crítica, subcontrato crítico, conflicto crítico) |
| 22 | **FREEZE** gate + fingerprint + inmutable | **B** | `public.congelar_presupuesto` (mig. `20260821T4400`) devuelve `jsonb` con los contadores, y los triggers `*_congelada_solo_lectura` hacen cumplir la inmutabilidad EN LA BASE | Falta el GATE previo `{ready,blocking_issues,warnings}` y el FINGERPRINT de inputs (§24). Hoy se puede congelar con 3 paquetes sin precio |
| 23 | **OFERTA desde lo congelado, con genealogy** | **C** | `plano/genealogia.mjs:44` `cadenaDe` y `fuente.mjs:118` `genealogia` existen y son buenos | Nadie los llama para producir la oferta; no hay adapter que oculte costo/HH/margen conservando la relación (§25) |
| 24 | **REVISIÓN con dos vistas sin mezclar** | **D** | `nueva_version_de_presupuesto` crea la versión (mig. `20260821T4300:236`) | Las dos vistas del §26 (A: impacto de alcance a precios de la oferta · B: valor actual) |
| 25 | **ADJUDICACIÓN → obra, sin destruir la quote** | **A** | `plano/genealogia.mjs:124` `obraDesdeCotizacion` · `public.convertir_*` (mig. `20260822T1000`) reconoce el paquete subcontratado · `cotizaciones.convertida_obra_id` | — |
| 26 | **PREPARAR OBRA** (Σ frentes = heredado) | **B** | `genealogia.mjs:80` `actividadDesde` hereda scope/qty/composición/HH con origen | Falta la guarda Σ frentes = cantidad heredada ⇒ BLOCK, y sin fecha de inicio ⇒ BLOCK (§28) |
| 27 | **RBAC por acción** | **B** | `public.ve_economia()` en RLS de `cotizaciones`, `parametro_comercial`, `cotizacion_partida`; tests en `columnas-comerciales-cerradas.test.mjs` | Es un solo permiso booleano. Faltan READ/WRITE/COMMERCIAL_WRITE/FREEZE/APPROVE/GLOBAL_POLICY_WRITE por acción (§40) |
| 28 | **CLAUDE-ZERO** | **B** | `pipeline.mjs:285` `pedirConDegradacion({permitirModelo:false})` y el bloque `degradacion` del resultado (`:793`) | El camino determinístico COMPLETO —hasta freeze/oferta/preparar obra— no tiene su test (§34) |
| 29 | **REPRODUCIBILIDAD** | **A** | `seleccion.mjs:161` `huella` + `pipeline.mjs:781` la publica · `scripts/plano-reproducibilidad.mjs` | — |
| 30 | **MÉTRICAS POR RUN** | **B** | `conocimiento/metricas.mjs` `medidor()` con `VIA`; `pipeline.mjs:788` publica el resumen; `plano/certeza.mjs:190` `metricas` | Faltan ~15 de los ~28 contadores del §38 (prices_current/stale/missing, subcontracts_missing_price, blocking/nonblocking, human_overrides…) |
| 31 | **PROMPT INJECTION** | **D** | El `PROMPT` no declara los documentos como datos no confiables | §41 |
| 32 | **CROSS-CLIENT LEAK** | **C** | Existe control construido en otro frente | No está enganchado como gate antes de freeze/output (§43) |
| 33 | **Conocimiento ECSAS** («se utilizó…», nunca «la regla es…») | **A** | `biblioteca.mjs`, `practica-historica.mjs` `ascensoProhibido()` — CANDIDATO no asciende por código | — |
| 34 | **PERSISTENCIA de la cotización** | **A** | `cotizacion-v0.mjs:142` `persistir` escribe `cotizaciones` + `cotizacion_partida` + `public.computo` (la genealogía) copiando los 8 porcentajes | — |

---

## Los tres defectos ya medidos que el orquestador tiene que arreglar

1. **El total se afirma con partidas sin precio.** `cotizacion_cascada` usa `coalesce(sum(v.subtotal),0)`
   y `sum()` de Postgres ignora los NULL. Una partida subcontratada sin precio deja `subtotal = NULL`,
   se cae de la suma, y `costo_directo`/`venta_final` salen como si el presupuesto estuviera completo.
   El contador `n_sin_precio_subcontrato` está al lado y nadie lo mira. Viola §15 y §14.
2. **No hay gate antes de congelar.** `congelar_presupuesto` informa los faltantes DESPUÉS de haber
   congelado. Viola §24.
3. **Las unidades no son fuertes.** `unidadCompatible` sólo conoce cuatro y nada distingue una
   magnitud de un monto. Viola §7.

## Lo que NO se toca

`biblioteca.mjs` · `practica-historica.mjs` · `orquestador/lib/plano/*` (core XSAS cerrado: se
ENVUELVE, no se edita) · el XLSM · cualquier Sheet · `motor-salarial`/`nomina-*`/`jornales-*`.
