# COTIZADOR — MAPA A/B/C/D

> **Estado al cierre de la FASE 2 (29/08/2026).** La tabla de abajo es el estado ANTES de construir
> `orquestador/lib/cotizador/`. Lo que la fase 1 y la 2 movieron está en la sección «Qué se movió»
> al final; el mapa original se conserva porque es la evidencia de qué había, y reescribirlo
> borraría el punto de partida contra el que se mide.

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


---

## Qué se movió (fases 1 y 2)

| # | Estación | Antes | Ahora | Dónde |
|---|---|:-:|:-:|---|
| 1 | INGEST | B | B | sigue sin registro de documento consultable |
| 4 | SCOPE | **D** | **A** | `cotizador/alcance.mjs` + `public.cotizacion_alcance` |
| 6 | Unidades fuertes | **D** | **A** | `cotizador/unidades.mjs` |
| 8 | COMPOSE | B | B | falta `source/version/validity` por línea |
| 9 | Precios | B | **A** | `cotizador/precios.mjs` + vista `recurso_precio_vigencia` |
| 10 | FX | B | **A** | `cotizador/precios.mjs` `tipoDeCambio`/`aplicarFx` |
| 12 | COSTO DIRECTO | B | **A** | `cotizador/costo.mjs` — el total se niega |
| 13 | Subcontrato sin precio | B | **A** | `cotizador/costo.mjs` `subcontrato()` |
| 14 | Indirectos | **D** | **A** | `cotizador/comercial.mjs` + `public.indirecto_concepto` |
| 17 | Resource explosion | **D** | **A** | `cotizador/explosion.mjs` con reconciliación |
| 18 | Outlier engine | **D** | **A** | `cotizador/outlier.mjs` — 5 señales |
| 19 | Eventos / undo | **D** | **A** | `cotizador/eventos.mjs` + `public.cotizacion_evento` |
| 20 | Cola de atención | B | **A** | `cotizador/atencion.mjs` |
| 21 | Blocking rules | B | **A** | `cotizador/atencion.mjs` + `public.cot_gate_congelado` |
| 22 | FREEZE | B | **A** | `cotizador/freeze.mjs` + `public.cot_congelar_con_gate` |
| 23 | Oferta con genealogía | **C** | **A** | `cotizador/oferta.mjs` |
| 24 | Revisión dos vistas | **D** | **A** | `cotizador/oferta.mjs` `revisar()` con puente |
| 26 | Preparar obra | B | **A** | `cotizador/obra.mjs` — Σ frentes |
| 27 | RBAC por acción | B | **A** | `contrato.mjs` + `public.cot_permiso` / `cot_permiso_de_accion` |
| 28 | CLAUDE-ZERO | B | **A** | `cotizador/claude-zero.test.mjs` |
| 30 | Métricas por run | B | **A** | `cotizador/metricas.mjs` con test propio |
| 31 | Prompt injection | **D** | **A** | `cotizador/seguridad.mjs` |
| 32 | Cross-client leak | **C** | **A** | `cotizador/seguridad.mjs`, enganchado antes de FREEZE |
| — | Adaptadores Postgres | — | **A** | `cotizador/pg.mjs` — 5 consultas, sin N+1 |

**Los tres defectos medidos, cerrados:** el total ya no se afirma con partidas sin precio
(`costo.mjs` + `cot_gate_congelado`); el gate va antes de congelar (`cot_congelar_con_gate` levanta
excepción); las unidades son fuertes y la colisión de `m` está declarada.

**Lo que sigue en D o B:** registro de documentos (1), `source/version/validity` por línea de
composición (8), y la jerarquía de resolución de FALTA_DATO del §30 —que es una métrica, no una
cadena que busque—. Los casos reales (§35, §36, §37) no se ejercitaron: es la fase siguiente.
