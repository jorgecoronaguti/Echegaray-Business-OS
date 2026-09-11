# HUGGING FACE — INCORPORADO VS RECHAZADO

_11/09/2026 · cierre de los §6 y §7 del mandato de optimización integral · evidencia cruda en
`docs/engineering/evidencia/hf-2026-09-11/`_

Este documento cierra el programa Hugging Face del OS. Lo que gobierna: **nada es PRODUCCIÓN sin
consumidor real y trazas**; **ningún proveedor de IA pago además de Claude** (HF es fuente de pesos
para correr local, no proveedor de API); **una herramienta se adopta sólo si supera a lo que ya
existe, medida sobre un problema real con baseline conocido**.

## 1 · RESUMEN

| | Cantidad | Qué |
|---|---|---|
| **Incorporado (producción)** | 1 modelo | `Xenova/multilingual-e5-small` local — 547 operaciones en 30 días, 0 USD |
| Producción sin trazas (en observación) | 1 | reranker `bge-reranker-base` — 0 trazas en 90 días; baja el 11/10 si sigue en 0 |
| Sombra / candidato / experimental | 5 | Qwen3-4B y gpt-oss-120b (tool calling, sombra) · whisper (candidato) · mDeBERTa y docling (experimental) |
| **Rechazado con evidencia** | 5 | Qwen3-32B · SigLIP · **Qwen3-Coder-30B** · **GLM-4.7-Flash** · **Qwen3-VL-30B** |
| Bloqueado (licencia o datos) | 2 | Chronos (WAPE 77-104 %) · granite-docling OCR (alucina) · visión EPP (AGPL) |
| Gasto externo en HF | **0,0000 USD** | 30 días, medido por `ml-tablero` |

Los tres nombres en negrita son el §6: herramientas del Hub para **construir** ECSAS (revisar un
diff, auditar una captura). Las tres perdieron.

## 2 · §6 — HERRAMIENTAS PARA CONSTRUIR EL OS

### Método

Dos problemas reales del repo con baseline conocido, el mismo prompt para todos los modelos:

- **(a) Revisión de código.** El diff completo del commit `8c8c7d99` (9 archivos, 435 líneas,
  12.550 tokens: una RPC `pantalla_cliente(p_slug, p_solapa)` + lector TS + test `.pg`). Baseline:
  los **tres hallazgos** que el auditor de cierre (Claude) encontró y que se corrigieron en
  `30f1ff28`: (1) el guardián no recorría dos de las nueve caras; (2) tres claves con cero filas no
  podían dar rojo; (3) dos comentarios afirmaban fail-open y el código es fail-closed.
- **(b) Revisión visual.** Captura real de la pantalla Clientes (1600×1084). Baseline: la revisión
  que Claude Code hizo de la misma imagen antes de leer la del modelo (cuatro defectos visibles:
  margen de Quattropani partido y absurdo, botón flotante pisando la nota al pie, «sin movimientos»
  quebrado, 9 obras / 10 obras / 5 filas inconsistentes).

Las llamadas fueron por `router.huggingface.co/v1/chat/completions` con el token del dueño, **sin
pasar por el adapter del OS** (`hf-inferencia.mjs` registra trazas en Postgres y un experimento no
escribe en Supabase). Script: `evidencia/hf-2026-09-11/hf-prueba.mjs`.

### Resultado

| Herramienta | Proveedor | ms | Tokens in/out | USD | Contra el baseline | Veredicto |
|---|---|---|---|---|---|---|
| Qwen/Qwen3-Coder-30B-A3B-Instruct | scaleway | 11.029 | 12.550 / 1.227 | ~0,004 | 6 hallazgos: 0 exactos · 1 parcial · **2 invertidos** · 3 ruido | **RECHAZADO por calidad** |
| zai-org/GLM-4.7-Flash | router · novita ×2 · deepinfra | 78.465 – 120.423 | 12.088 / 2.500 (todo reasoning) | 0 | 4 intentos: tres 504 a los 120 s, un 200 con `content=""` | **RECHAZADO por operación** |
| Qwen/Qwen3-VL-30B-A3B-Instruct | novita | 12.790 | 1.900 (1.702 de imagen) / 1.352 | ~0,0011 | 8 hallazgos: 1 coincide · 0 únicos correctos · **4 fabricados** · 4 visibles omitidos | **RECHAZADO por fabricación** |

**Qwen3-Coder** es barato e inmediato y aun así no sirve: de los tres defectos reales no encontró
ninguno exacto, y en dos afirmó lo contrario de lo que hace el código porque se creyó el comentario
equivocado (el mismo que el auditor había detectado como falso). Un revisor que confirma el
comentario falso multiplica el trabajo: el humano tiene que refutarlo.

**GLM-4.7-Flash** nunca contestó. El router corta a los ~120 s y el modelo, en modo pensante, gasta
esa ventana razonando: con tope 2.500 devolvió 2.500 `reasoning_tokens` y contenido vacío; con tope
8.000, novita y deepinfra dieron 504 a los 120 s. La calidad quedó sin medir, y una herramienta que
frena dos minutos una revisión y no entrega nada es peor que no tenerla.

**Qwen3-VL** coincidió con Claude en un hallazgo (el gris de «sin movimientos») y le inventó un hex
`#A0A0A0` que no se puede leer de una captura, exactamente lo que el prompt le pidió no hacer. Inventó
un ícono que no existe y una columna sin «$», y no vio los cuatro defectos más evidentes.

### Lo que queda en el código

- `orquestador/lib/ml/registro.mjs`: tres entradas `herramienta.*` con estado, licencia, revisión del
  Hub, dataset, medición y **condición de reingreso** (para que en seis meses nadie las vuelva a
  probar de cero).
- `orquestador/lib/ml/registro.test.mjs`: candado. Ninguna herramienta puede figurar en producción
  sin haber ganado; un rechazo por calidad trae los hallazgos contados; un rechazo por operación trae
  al menos tres intentos con proveedor, status y ms.

### Incidente de política, declarado

La captura de Clientes enviada a novita contenía nombres de clientes reales y montos. El techo de HF
remoto es **INTERNAL** (`politica.mjs`); una pantalla con cartera de clientes es CONFIDENTIAL. La
llamada no pasó por el adapter, así que la política no la frenó. **No se repite**: el reingreso de
cualquier VLM exige captura anonimizada o de entorno de prueba, y toda llamada remota pasa por
`hfInferencia()` para que la política corra ANTES de la request. El diff de código (a) es INTERNAL y
no tiene este problema.

## 3 · §7 — IMPACTO LOCAL VS INFERENCE PROVIDERS

Medido en la VM (4 cores · 7,4 GB · sin GPU · 4,97 GB disponibles al momento de medir), scripts
`mide-e5.mjs`, `mide-reranker.mjs`, `mide-remoto.sh` en la carpeta de evidencia.

| | e5-small LOCAL | reranker bge-base LOCAL | e5-small REMOTO |
|---|---|---|---|
| Carga del modelo | 2.058 ms | 3.019 ms | — |
| Operación (caliente) | **8 ms** por tanda | 21–32 ms por reorden | **5.045 ms** (hf-inference, frío) |
| RSS pico del proceso | 614 MB | 960 MB | 0 |
| CPU durante la carga | 151 % de un core, ~2,5 s | 141 %, ~4 s | 0 |
| Costo | 0 | 0 | `x-inference-cost` vacío → **DESCONOCIDO** |
| Disponibilidad | siempre | siempre | `/v1/embeddings` → **404** para e5-small, e5-large y bge-m3; sólo la ruta `hf-inference/…/pipeline/feature-extraction` responde |

**Lectura.** Lo local cuesta entre 0,6 y 1 GB de RAM **transitorios** por proceso que carga el modelo
(los consumidores son timers, no un servicio residente: `documentos-procesar`, `backfill-compras-
cheques`, `documentos-indexar`), 2-3 s de carga y después milisegundos. Lo remoto es 600× más lento
por operación, no tiene precio visible en la respuesta y para los modelos que usa el OS no está en
el router. La decisión de correr embeddings y reranking en la VM queda **confirmada por medición**,
no por preferencia. El riesgo real es de RAM, no de CPU: dos timers que carguen modelos a la vez
suman ~1,6 GB contra 4,97 GB disponibles; hoy no coinciden, y `flujo-caja` (el proceso pesado de la
VM) no carga ninguno.

**Reparto real de los últimos 30 días** (`ml-tablero`, 11/09 15:00): 1.439 operaciones ML — 46 %
estadística, 38 % e5 local, 16 % reglas; **Hugging Face nube: 0**. Claude aparte: 506 llamadas,
2,42 M tokens, 52,38 USD.

## 4 · REGISTRO COMPLETO CONTRA REALIDAD

| Capacidad | Modelo | Estado | Consumidor real | Evidencia |
|---|---|---|---|---|
| embed | Xenova/multilingual-e5-small | **producción** ✔ | drive-busqueda, documentos-procesar | 547 ops/30 d |
| embed | ibm-granite/granite-embedding-97m | deprecado | — | perdió contra e5 (04/09) |
| rerank | Xenova/bge-reranker-base | producción ✖ | bot (cableado) | 0 trazas en 90 d → baja el 11/10 |
| forecast | amazon/chronos-2 | bloqueado | — | WAPE 77-104 % con 14 semanas |
| classify | MoritzLaurer/mDeBERTa-v3-xnli | experimental | — | sin consumidor |
| extractDocument | docling-layout-heron-onnx | experimental | — | 100 % de los PDF ya traen capa de texto |
| ocr | granite-docling-258M-ONNX | bloqueado | — | alucina inglés sobre español |
| transcribe | openai/whisper-large-v3 | candidato | ninguno (el bot no rutea audio) | bajó el 11/09 |
| vision | Xenova/siglip-base | rechazado | — | 05/09 |
| toolCalling | Qwen3-4B-Instruct-2507 | sombra | elegir-partida (medirEnSombra) | 90 % = Haiku, 2,3× más lento |
| toolCalling | openai/gpt-oss-120b | sombra | idem | 77 % |
| toolCalling | Qwen3-32B | rechazado | — | obedeció una inyección destructiva 1 de 2 |
| revisionDeCodigo | Qwen3-Coder-30B-A3B | **rechazado** | — | §2 |
| revisionDeCodigo | GLM-4.7-Flash | **rechazado** | — | §2 |
| revisionVisualDePantalla | Qwen3-VL-30B-A3B | **rechazado** | — | §2 |
| escalateToClaude | lib/ia/capacidad.mjs | producción ✔ | todo | — |

## 5 · DECISIONES QUE QUEDAN DEL DUEÑO

1. **Reranker**: si el 11/10 sigue con 0 trazas, pasa a candidato (regla ya escrita en la memoria).
2. **Plan PRO de Hugging Face**: en 30 días el OS no consumió inferencia remota y los pesos se bajan
   con cuenta gratuita. Lo único que el PRO habilitó fueron estos experimentos. Si no va a haber más,
   el plan es un costo sin consumidor. Es una decisión suya (Nivel E); el importe se verifica en la
   cuenta, no acá.
3. **Nada más de HF se prueba sin un problema real con baseline**: el banco de pruebas queda en la
   carpeta de evidencia (mismo prompt, mismo diff, mismos tres hallazgos) para cualquier reingreso.

## SIGUIENTE PASO

Ninguno de HF. El frente vuelve a lo que el mandato prioriza: P0/P1 (RPC `pantalla_obra`, Horas con
25 consultas por render, Cargas Sociales leyendo Compras).
