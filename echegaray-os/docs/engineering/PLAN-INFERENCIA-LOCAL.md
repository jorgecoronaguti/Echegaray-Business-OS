# PLAN — INFERENCIA LOCAL EN LA VM

_04/09/2026 · cómo se implementa lo que ofrece Hugging Face sin contratar otro proveedor de IA_

## La regla que gobierna todo el plan

Decisión del dueño, 04/09/2026, en dos tiempos: **«nada de openai compatible, todo es Claude acá»**
y **«necesito que sí haga trabajo de razonar pero que sea interno, que no consuma IA de nada»**.

De ahí salen tres invariantes que ningún hito puede violar:

1. **Claude es el único modelo pago del OS.** `lib/ia/proveedores/openai-compatible.mjs` queda
   apagado. No se usa la API de inferencia de Hugging Face ni ninguna otra.
2. **Hugging Face es fuente de PESOS, no proveedor de servicio.** Se bajan una vez a disco y corren
   en la VM. Costo marginal: cero.
3. **Todo corre en la VM.** Nada de modelos en el navegador del usuario.

Y una cuarta, heredada del `CLAUDE.md`: **nada que decida algo con efecto económico, contractual,
fiscal o laboral sale de un modelo local.** El vector sugiere y ordena; Claude y el determinismo
deciden.

## El techo del hardware — lo que hace viable e inviable cada hito

Medido el 04/09/2026:

```
4 cores · 7 GB RAM (4 libres) · SIN GPU · 99 GB disco · Azure (Hyper-V)
Intel Xeon Cascade Lake — AVX-512 + VNNI (aceleración INT8 por hardware)
```

VNNI es la buena noticia: ONNX Runtime la aprovecha sola y un embedding INT8 sale en ~10-30 ms.
La mala es definitiva: **sin GPU no hay visión.** Planos, fotos de avance y reconocimiento de
equipos quedan fuera del plan, no postergados. `interpretar-region` —el gasto vivo #1 del cotizador,
$17,69 en 169 llamadas— es visión y **se queda en Claude**: se ataca mandándole menos regiones, no
cambiándole el modelo.

## Presupuesto de recursos — por qué un solo servicio

Con 14 timers, 7 servicios, Postgres y Next corriendo, cargar el modelo en cada proceso revienta la
VM. Va **un servicio único**, `echegaray-inferencia` (systemd user unit, como los otros 7), que
carga los modelos una vez y expone HTTP en localhost.

| Modelo | RAM residente |
|---|---|
| `intfloat/multilingual-e5-small` INT8 | ~150 MB |
| `whisper-base` INT8 (fase 5) | ~200 MB |
| overhead ONNX Runtime | ~200 MB |
| **total** | **~550 MB de los 4 GB libres** |

`ORT_NUM_THREADS=2` y `Nice=10`: no puede competir con los timers. Precedente pagado — `orq:test`
en paralelo ya tumbó Supabase una vez.

Esto descarta **BGE-M3** (568M, ~2,2 GB residentes) como modelo por defecto. Queda como opción
configurable si e5-small no alcanza: el modelo es una constante, no una dependencia del código.


## MEDIDO EN LA VM — 04/09/2026 (no estimado)

Se instaló `@huggingface/transformers` 4.2.0 y se corrió `Xenova/multilingual-e5-small` INT8 en
esta VM. **El plan anterior prometía cosas que esta corrida NO sostiene.**

| Métrica | Estimado antes | Medido |
|---|---|---|
| Latencia por embedding | 10-30 ms | **7 ms** |
| Carga del modelo | — | 5,8 s |
| RSS del proceso | ~550 MB | **584 MB** |
| Pesos en disco (2 modelos) | — | 259 MB |
| `node_modules` de la librería | — | **686 MB** |

`intfloat/multilingual-e5-small` publica `onnx/model_qint8_avx512_vnni.onnx`: un build cuantizado
para exactamente el CPU de esta VM.

### El resultado incómodo: la señal semántica SOLA no alcanza

Cinco consultas reales contra seis capacidades:

```
e5-small:  4/5 aciertos · margen promedio 0.0152
  OK  "flujo de fondos"        -> CAJA       margen 0.0005   <-- ruido, no señal
  MAL "plata que nos deben"    -> CAJA       (debia ser COBRANZAS)
MiniLM:    3/5 aciertos · margen promedio 0.0710
  MAL "plata que nos deben"    -> CAJA
  MAL "sueldos de la quincena" -> COBRANZAS
```

«Flujo de fondos» acertó por **0,0005**. Eso no rutea nada: cualquier cambio de redacción lo da
vuelta. Y los dos modelos fallan el mismo caso obvio.

**Corrección de diseño que sale de acá:** comparar la consulta contra la DESCRIPCIÓN de una
capacidad es el enfoque débil. El fuerte es compararla contra **consultas anteriores reales ya
etiquetadas** (kNN sobre ejemplos). Por eso el corpus de frases del dueño no es un accesorio del
hito H1.1: es la condición para que funcione, y sin él H1.1 no se empieza.

Falta medir, y hasta que se mida H1.1 no puede llamarse P0:
- cuántas consultas rutea mal XSAS hoy, y con qué frecuencia se usa;
- el mismo experimento con las descripciones REALES de las capacidades (las de la prueba las
  escribió el que hizo el plan, que es justamente lo que no vale).

---


## EL ORDEN LO FIJA LA MISIÓN, NO LA COMODIDAD TÉCNICA

`docs/MISION.md` fija el criterio de profundidad progresiva: **impacto económico + riesgo +
frecuencia + tiempo humano ahorrado + mejora de precisión + capacidad desbloqueada.**

La primera versión de este plan ordenó los hitos por dependencia técnica (qué habilita qué). Contra
ese criterio el orden estaba mal:

| Hito | Qué produce (principio de utilidad) | Orden técnico | Orden por misión |
|---|---|---|---|
| Anomalías en compras y banco | **recupera dinero** | fase 4 | **primero** |
| Aprender rendimientos -> cotización | **aumenta margen** (Regla de oro 16) | fase 4 | **segundo** |
| Ruteo de XSAS | reduce fricción | fase 1 | después |
| Buscador global | reduce fricción | fase 1 | después |

Y la misión pide algo que este plan casi no cubría: **el OS no debe esperar solicitudes** — debe
buscar por sí mismo inconsistencias, desvíos, errores y oportunidades (Nivel B). Eso es detección de
anomalías, no ruteo.

Las fases 4.1 y 4.2 **no dependen del motor de embeddings** (son determinismo puro): pueden
arrancar en paralelo con la fase 0 y entregar valor económico antes que cualquier hito de HF.

---

# FASE 0 — LO QUE HABILITA TODO

## H0.0 · Arreglar la medición ANTES de tocar nada

**Por qué va primero:** el objetivo declarado es bajar el consumo. Hoy no se puede probar que bajó.
`orq.chat_cost.model` guarda a veces el alias (`'sonnet'`, `'haiku'` — 360 filas) y a veces el ID
real (`'claude-opus-4-8'`), y **373 de 712 filas tienen `funcion = null`**: más de la mitad del gasto
no sabe qué lo pidió. Medir el efecto de este plan contra ese registro sería validarlo contra
información que no puede responder la pregunta.

- Normalizar `model` a ID real; `funcion` obligatoria en toda llamada nueva.
- Vista de línea de base congelada: gasto por función de los últimos 30 días, **antes** de tocar nada.

**Evidencia de cierre:** consulta que devuelve gasto por función sin filas huérfanas, y el número
de línea de base escrito en este documento.

## H0.1 · pgvector

- `CREATE EXTENSION vector` (rol `postgres` tiene `supabase_privileged_role`; **verificar
  ejecutando**, no asumir).
- Migración en `supabase/migrations/`.

**Evidencia:** `installed_version` deja de ser `null`. Recordar: migración en el repo ≠ aplicada.

## H0.2 · El motor — `orquestador/lib/embeddings/`

La **única puerta**, igual que `lib/ia/` es la única puerta a los modelos de razonamiento.
Ningún consumidor conoce el modelo ni el runtime.

- `@huggingface/transformers` 4.2.0 (ONNX, Node puro — sin sidecar de Python).
- `multilingual-e5-small` INT8. El id del modelo es constante configurable.
- Servicio `echegaray-inferencia` con los límites de arriba.
- Caché de vectores: el mismo texto no se re-embebe nunca.

**Evidencia:** vectores estables entre corridas · latencia medida · RSS del servicio bajo 600 MB ·
los 14 timers siguen cumpliendo su ventana con el servicio cargado.

**Riesgo declarado:** si el servicio se cae, todo consumidor debe **degradar al comportamiento de
hoy**, nunca fallar. Igual que `openai-compatible` apagado no cambia nada.

---

# FASE 1 — RUTEO Y BÚSQUEDA (el valor inmediato)

Cada hito de esta fase es una prueba independiente de que el motor sirve.

## H1.1 · Ruteo semántico de XSAS

**El defecto, verificado en el código:** `lib/xsas-resolutores.mjs:476` `afinidad()` puntúa por
substring de palabras contra el nombre y la descripción de la tool. «flujo de fondos» y «caja» no
comparten una sola palabra: el mecanismo **no puede** acertar. Por eso `flujo de fondos → iva_anual`.

- `ordenarPorAfinidad()` es el punto único: se le suma señal semántica.
- Los vectores de las descripciones de tools se calculan al arrancar (son decenas).
- **El vector SUMA señal, no reemplaza el léxico.**

**Evidencia:** test hoy rojo con «flujo de fondos» → verde. Más un **corpus de regresión de frases
reales del dueño**: ningún caso que hoy anda puede empeorar.

## H1.2 · Buscador global de app.ecsas.com.ar

`src/shared/components/BuscadorGlobal.tsx` **ya existe** — se le agrega una señal, no se construye
otro. La consulta se embebe en la VM (~10-30 ms) contra vectores precalculados en pgvector; total
~60 ms por API route.

**Evidencia:** test hoy rojo — «plata que nos deben» no encuentra Cobranzas.

## H1.3 · Vector como señal en `lib/drive-busqueda/ranking.mjs`

Ya existen `drive-busqueda/` (buscar · ranking · feedback · métricas · adaptativo · explicar) y
`lib/conocimiento/`. **No se construye otro buscador.**

Dos hallazgos a resolver antes de indexar:
- `public.drive_documento_estado` tiene **0 filas** — algo que debería poblarse no se pobló.
- El corpus en Postgres es de ~883 filas (306 biblioteca + 259 por área + 214 cliente + 72 empresa
  + 32 obra) contra **1.951 archivos del data room**: hay brecha de ingesta.

Con 883 filas la indexación son minutos. `pg_trgm` ya está instalado: para nombre de archivo o CUIT
gana trigrama y es más barato. Semántica sólo para «qué dice el pliego sobre X».

---

# FASE 2 — SELECCIÓN DE CONTEXTO (el ahorro de verdad)

## H2.1 · Elegir qué se le manda a Claude

El ítem que más baja consumo en todo el OS: en vez de mandarle 20 documentos, se le mandan los 4 que
importan. Aplica al Director, al bot @os y al cotizador.

**Evidencia:** tokens de entrada por llamada, antes y después, contra la línea de base de H0.0.
**Y la respuesta no puede empeorar** — se mide con casos reales, no con la sensación de que anda.

## H2.2 · Clasificar el pedido del bot sin Claude

`comunicacion/razonar-ruteo.mjs` gasta hoy una llamada a Claude de 24 tokens sólo para rutear.

---

# FASE 3 — DOCUMENTOS

## H3.1 · Docling en `lib/ingesta/`

Docling + TableFormer (`ds4sd/docling-models`, ~200 MB) como **un adaptador más detrás de
`registro.mjs`** — que ya es el patrón del repo. Para contratos, pliegos, memorias y certificados:
error barato, y alimenta la búsqueda de H1.3.

**Límite duro:** los **comprobantes que impactan plata no se tocan.** `lib/comprobantes/vision.mjs`
se queda en `claude-opus-5` — está escrito en `lib/ia/capacidad.mjs` por qué: leer mal el neto de una
factura es plata mal imputada en el Cash Flow.

## H3.2 · Recibos del cliente, libretas IERIC, constancias de ARCA

Mismo motor. Extraer texto, no decidir.

---

# FASE 4 — DETERMINISMO (no es HF, y es lo que más plata encuentra)

## H4.1 · Anomalías en compras y banco

Estadística, sin modelo: duplicados, precios de insumo fuera de rango (946 filas en `compra_sheet`),
HH anormales. Precedente medido: la referencia del banco ya destapó 68 duplicados.

## H4.2 · Learning engine de rendimientos

**Regla de oro 16** — que el real de obra corrija el estimado de la próxima cotización. Regresión
sobre Plan vs Real, apoyada en `lib/plano/cuadrilla.mjs` y `datos/circot/`.

## H4.3 · Normalización de materiales y proveedores

«hierro del 8» = «Ø8» = «acero 8mm». **La identidad de un proveedor es el CUIT**: el vector sugiere,
nunca crea ni fusiona.

---

# FASE 5 — VOZ EN CAMPO

`whisper-base` o `whisper-tiny` INT8 en CPU, por el patrón **cola → worker** que ya usa el repo
(`echegaray-comprobantes-web.timer`, cada 1 min). El jefe de obra graba el parte, lo sube y sigue
trabajando; el worker transcribe.

No alcanza para dictado en vivo: 30 s de audio son ~10-20 s con `tiny` y ~30-60 s con `base`.
Queda el audio original como evidencia.

**Decisión pendiente del dueño:** ¿los partes se cargan por celular o por tablet? Decide tiny vs base.

---

# CÓMO SE EJECUTA CADA HITO

Uno por vez, y ninguno depende de más de uno anterior:

1. Worktree propio (`git merge main` primero).
2. Test que **falla antes** y pasa después.
3. Mientras se itera: `node --test <archivo>`. Antes de cerrar: `typecheck` + lint del área.
   `orq:test` completo y `build` **sólo en el hito**, no en cada iteración.
4. **Lo cierra un tercero** (`auditor-de-cierre`), no quien lo construyó.
5. Checkpoint commiteado en cada etapa.
6. Se elimina el worktree.

## Riesgos transversales

| Riesgo | Mitigación |
|---|---|
| El vector rompe casos que hoy andan por léxico | suma señal, no reemplaza · corpus de regresión con frases reales |
| El servicio de inferencia compite con los timers | 2 hilos, `Nice=10`, medir la ventana de los timers |
| Se cae el servicio | todo consumidor degrada al comportamiento de hoy, nunca falla |
| Calidad del modelo en español rioplatense | e5-small es multilingüe; si no alcanza, el modelo es una constante |
| Creer que bajó el consumo sin poder probarlo | H0.0 va primero, por eso |

## Lo que este plan NO hace

- No activa un segundo proveedor de IA.
- No mete un modelo local en ninguna decisión económica, contractual, fiscal o laboral.
- No toca la lectura de comprobantes que impactan plata.
- No toca `lib/plano/seleccion.mjs`, que ya es puro.
- No promete visión: sin GPU no la hay.
