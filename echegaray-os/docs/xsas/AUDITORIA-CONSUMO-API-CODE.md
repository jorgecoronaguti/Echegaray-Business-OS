# AUDITORÍA FORENSE DE CONSUMO — API RUNTIME vs CLAUDE CODE

_Fecha: 02/09/2026 ~14:45 · Fuentes: `orq.chat_cost` (681 filas desde 15/07), `orq.xsas_requests`
(229 desde 27/08), systemd, código, `~/.claude/`. **Cero llamadas de API nuevas para esta
auditoría** — todo es SQL, filesystem y configuración. Los montos son los REGISTRADOS; donde el
registro tiene huecos se dice, no se estima._

---

## A. API RUNTIME

### 1. Inventario de llamadores (código + config vivos)

**Un solo provider configurado: Anthropic** (`ANTHROPIC_API_KEY` en
`~/.config/echegaray-orq/anthropic.env`). El fallback `openaiCompatible` existe en código
(`lib/ia/cliente.mjs:65`, `PROVEEDORES = [anthropic, openaiCompatible]`) pero **sin key: es
inerte** — coherente con `fallback_de` = 0 filas en toda la historia. Cloudflare: sólo
`CLOUDFLARE_ACCOUNT_ID` (imágenes/slides van por ahí sin costo de modelo registrado en chat_cost).
No hay OpenAI, OpenRouter, Gemini, Bedrock ni Vertex.

| Caller | Archivo/función | Modelo real (chat_cost) | Trigger | Sync/BG | Cache |
|---|---|---|---|---|---|
| Visión de láminas | `lib/plano/pipeline.mjs::interpretarLamina` (COMPLEX) | claude-opus-4-8 | `plano.cotizar`/`razonamiento` | sync del request | disco `~/.cache/echegaray-planos` por hash |
| Visión por región | `pipeline.mjs::interpretarRegion` | claude-opus-4-8 | ídem, 2ª pasada | sync | ídem (`v3region:`) |
| Medición | `conteo.medir` vía pipeline | claude-opus-4-8 | ídem, 3ª pasada | sync | ídem (`:medicion`) — **no siempre** |
| Elegir/desambiguar partida (veto) | `plano/seleccion.mjs` | opus-4-8 | cotizar | sync | no |
| Lector de comprobantes | worker `echegaray-comprobantes-web` (`leer`, agente comprobantes) | **claude-opus-5** | cola de comprobantes (timer c/1 min, corre sólo con items) | BG | no |
| Gateway N2/N3 | `xsas-gateway` (`nivel-2`, `nivel-3`, `completar-argumentos`) | haiku-4-5 / opus | mensaje sin capacidad | sync | no |
| web.search | gateway (`web-search`) | haiku-4-5 | investigación directa | sync | no |
| Director Mattermost | `comunicacion` (`rutear`) | haiku-4-5 | mensaje en canal | sync | no |
| Asistente Sheets (legacy, filas sin `funcion`) | Mattermost/escrituras (`motivo: escritura_sheet/escritura/simple`) | sonnet/haiku | chat del bot | sync | no |
| Aprendizaje (`clasificar-actividades`) | `xsas-ciclo` (timer 4 h) | haiku | ciclo | BG | no |
| Sonda del razonador | `scripts/xsas-sonda-razonador.mjs` (timer 20 min) | opus | **sólo** si el flag `sin_credito` está puesto (1 llamada en 30 d) | BG | — |
| Autotest salud | `orq-health` (`autotest`) | haiku | timer 5 min — 4 llamadas en 30 d, todas fallaron `client` | BG | — |

**Retries**: `TOPE_REINTENTOS = min(4, ORQ_IA_REINTENTOS ?? 2)` → hasta 3 intentos por provider
(`cliente.mjs:67,172`); con un solo provider el peor caso es ×3, y **no hay un solo fallback
registrado en la historia**. Cost control central: **no existe** (ni tope por objetivo, ni por
corrida, ni por día — ver §13).

### 2. Consumo real registrado

| Ventana | Llamadas | Tokens in | Tokens out | USD registrado |
|---|---|---|---|---|
| 24 h | 147 | 777.898 | 495.433 | **$15,53** |
| 7 d | 320 | 1.623.227 | 778.722 | **$26,63** |
| 30 d | 370 | 1.675.098 | 782.295 | **$39,34** |

**Cobertura de medición: PARCIAL.** (a) `chat_cost` no registra cache read/write ni request_id del
provider; (b) **hay llamadas con `usd = NULL`**: las 40 de `leer` comprobantes con **claude-opus-5
y 523.317 tokens** — el costo real de 30 d es MAYOR que $39,34 y ese hueco es el más grande;
(c) `chat_cost` no lleva `correlation_id`: no se puede unir llamada→pedido de usuario por SQL.

Por día (7 d): 27/08 $2,13 · 28/08 $6,27 · 29/08 $0,10 · 30/08 $0,10 · 31/08 $2,39 · 01/09 $0,10 ·
**02/09 $15,53** — el día más caro de los 30 es HOY, y es la corrida de La Estrella (§4).

### 3. Top consumidores (30 d, por USD registrado)

| # | Caller/capability | Llamadas | Tokens (in/out) | USD |
|---|---|---|---|---|
| 1 | `interpretar-region` (visión cotizador) | 154 | 714k/524k | **$16,67** |
| 2 | Asistente Mattermost legacy (sin `funcion`; sonnet escritura/simple) | 58 | mínimos | **$15,87** |
| 3 | `interpretar-plano` (visión cotizador) | 17 | 140k/167k | $4,88 |
| 4 | `medir-plano` | 11 | 72k/23k | $0,94 |
| 5 | `elegir-partida` | 7 | 69k/11k | $0,61 |
| 6 | `web-search` | 10 | 172k/4k | $0,18 |
| 7 | `nivel-3` (razonador del gateway) | 7 | 1,5k/4k | $0,11 |
| 8 | `clasificar-actividades` (ciclo) | 6 | 11k/8k | $0,05 |
| 9 | `completar-argumentos` | 22 | 5k/0,4k | $0,01 |
| 10 | `rutear` (director) | 17 | 2k/15 | $0,00 |
| — | `leer` comprobantes (**opus-5**) | 40 | **483k/40k** | **NULL — no medido** |

**La visión del cotizador es el 57% del USD medido de 30 días ($22,49 de $39,34)**, y el asistente
legacy de Mattermost otro 40%. Todo lo demás junto no llega a $1. Por modelo: opus-4-8 = $23,21
(206 llamadas), sonnet legacy = $13,32, haiku ≈ $2,80, **opus-5 = NULL (40 llamadas sin precio)**.

### 4. Forense La Estrella (hoy, 13:47–14:32 hora local)

Disparador: **2 pedidos de auditoría** («mostrame el razonamiento del cotizador de la estrella»),
el primero con timeout de cliente a los 5 min, el reintento a los 9,7 min. **El pipeline no se
entera de que el cliente se fue**: siguió corriendo 45 minutos hasta terminar solo a las 14:32,
sin nadie escuchando.

| Etapa | Llamadas | Tokens in/out | USD | Tiempo de modelo |
|---|---|---|---|---|
| `interpretar-plano` (11 láminas) | 11 | 103k/119k | $3,49 | 18,2 min (67–142 s c/u, secuencial ~1/min) |
| `interpretar-region` | **101** | 507k/353k | **$11,36** | 59,4 min (2–5 por minuto) |
| `medir-plano` | 7 | 47k/13k | $0,55 | 2,6 min |
| **TOTAL** | **119** | **657k/485k** | **$15,40** | ~80 min de modelo en 45 min de pared |

- **Por qué 119**: 11 láminas × (1 interpretación + regiones de la 2ª pasada + mediciones). El tope
  `limiteRegiones = 12` es POR LÁMINA (≈9 regiones/lámina promedio) — no hay tope por corrida ni
  por proyecto.
- **Secuencial/paralelo**: láminas secuenciales; regiones con paralelismo bajo (2–5/min).
- **Retries/fallback**: 0 registrados. 8 `interpretar-region` fallaron por `credit` en la historia
  (sin costo), ninguna hoy.
- **¿Doble procesamiento?** Probable en parte: el 2º intento arrancó (14:04) mientras el 1º seguía
  en regiones; las láminas ya cacheadas no se repagaron (sólo 11 interpretaciones), pero las
  regiones aún no cacheadas del 1º pudieron pagarse en ambos. `chat_cost` no guarda el hash del
  contenido → **no comprobable** (observabilidad incompleta).
- **¿Quedó cacheado?** SÍ: `~/.cache/echegaray-planos` pasó de 63 a **122 archivos**. Una próxima
  corrida de La Estrella pagaría ~0 visión de láminas.
- **¿La corrida fallida dejó costo?** SÍ, TODO: **$15,40 gastados y ningún cliente recibió
  respuesta**; ni siquiera quedó fila en `xsas_requests` (se registra al final). El único valor
  que quedó es el caché.

### 5. Consumo invisible (sin usuario)

Timers activos: comprobantes-web (1 min) · os-schedules/orq-health/pedidos-sync (5 min) ·
cobranzas/compras-sync (1 h) · xsas-sonda (20 min) · xsas-ciclo (4 h) · drive-index (6 h) ·
orq-cleanup · vigilancia (7:00).

**Con XSAS quieto el gasto medible es ≈ $0**: sonda = 1 llamada/30 d (sólo si hay flag
`sin_credito`), autotest = 4/30 d (fallidas), ciclo = 6 llamadas haiku/30 d (~$0,05). El lector de
comprobantes corre por timer pero SÓLO paga cuando hay items en la cola (subidos por personas).
**La excepción real es el zombi de §4**: el único consumo grande sin usuario fue un pipeline que
siguió gastando después de que el usuario se desconectó.

### 6. Multiplicadores

- Retries: máx. 3 intentos/provider; en los datos, 0 reintentos con costo doble visibles.
- Fallback: nunca ocurrió (un solo provider con key).
- **El multiplicador real no es retry ni fallback: es la fragmentación de visión.**
  `MODEL_CALLS_PER_USER_REQUEST`: global 7 d ≈ 320 llamadas / 229 pedidos ≈ **1,4**; para
  `plano.cotizar`/`razonamiento` el peor caso medido es **1 pedido → 119 llamadas** (La Estrella);
  Quattropani tibio = 1 pedido → 0–10; consultas determinísticas (atajos, memoria, tools) = **0**.
  Costo por llamada de visión: lámina ~$0,29 · región ~$0,11 · medición ~$0,08.

---

## B. CLAUDE CODE (suscripción semanal — NO es la API)

### 7. Últimos 7 días

- **150 archivos de sesión/subagente, 0,4 GB** en `~/.claude/projects/`(total histórico 1,8 GB).
- **Una sesión monstruo: 258 MB de transcript** (`6f1ea72c…`, la campaña con flota de subagentes
  de la semana pasada — sus subagentes suman >30 MB más). Le siguen ésta (19 MB) y una de 18 MB.
- Lo ya medido en `CLAUDE.md` sigue vigente como diagnóstico: 75% de los turnos con >200k de
  contexto, salida de tests sin `--test-reporter=dot` = 228k tokens/corrida, subagentes de
  150k–380k tokens.

### 8. Estado actual

- Modelo activo: **claude-fable-5** (esta sesión). Transcript de esta sesión: **19 MB**, con 2
  compactaciones. Presupuesto de la sesión: ~14,93 M tokens restantes de 15 M.
- Procesos `claude` vivos: **5** (esta sesión + shells/watchers). Ninguno ejecuta trabajo autónomo
  de API runtime — ningún proceso de Claude Code llama a la API de Anthropic del OS.
- Esta auditoría no usó subagentes ni suite completa.

### 9. Quién paga qué

| Consumo | Paga |
|---|---|
| /xsas determinístico (atajos, tools, memoria, cascada, SQL) | **nadie** ($0 de modelo) |
| /xsas Reasoner (nivel 2/3, completar-argumentos, web.search) | **API BILL** (centavos) |
| Visión del cotizador (láminas/regiones/mediciones) | **API BILL** (el rubro dominante) |
| Lector de comprobantes (worker) | **API BILL** (opus-5, hoy SIN PRECIO REGISTRADO) |
| Director/asistente Mattermost | **API BILL** |
| Timers (sonda, autotest, ciclo) | **API BILL** (≈$0) |
| Claude Code: desarrollo, auditorías, subagentes, tests | **CLAUDE CODE WEEKLY LIMIT** |
| Tests del repo (`orq:test`) | **ninguno** — no llaman providers reales (los 4 `autotest` con modelo salen del timer de salud, no de la suite) |

### 10. Trazabilidad de costo — **OBSERVABILIDAD_INCOMPLETA**

La cadena pedida (user request → correlation → capability → caller → provider → model →
request_id → tokens → cache → USD → resultado) HOY se corta en tres lugares:
1. **`chat_cost` no tiene `correlation_id` ni request_id del provider** → una llamada no se puede
   unir a su pedido; el costo por pedido/objetivo no es calculable por SQL.
2. **`usd` NULL en opus-5** (40 llamadas, 523k tokens) y en el legado — el total es un piso.
3. **Cache read/write no se registra**, y la visión no guarda qué hash procesó → no se puede probar
   si una región se pagó dos veces.
Por eso el costo P50/P95 por request **NO_MEDIDO**; sólo hay costo por llamada (§6).

### 11–12. Bombas de costo (por impacto real)

1. **Pipeline zombi**: la corrida de visión no se cancela cuando el cliente se va ni tiene tope de
   presupuesto — hoy: $15,40 y 45 min sin receptor. Es además el único gasto "sin usuario" real.
2. **Visión sin tope por corrida/proyecto**: el único límite es 12 regiones POR LÁMINA; una obra de
   30 láminas puede pasar $40+ en un solo pedido, legítimamente.
3. **Reintento humano sobre corrida viva**: dos intentos del mismo objetivo pueden solapar y
   repagar regiones aún no cacheadas (no comprobable por falta de hash en chat_cost — el diseño lo
   permite).
4. **Lector de comprobantes en opus-5 sin precio registrado**: 523k tokens invisibles en el total;
   tarea de extracción que un modelo más chico podría cubrir (a validar, no se cambió nada).
5. **Asistente Mattermost legacy**: $15,87/30 d con filas casi sin metadata (sin funcion/motivo) —
   caro e inobservable.
6. **Claude Code — sesiones campaña**: un transcript de 258 MB con flota de subagentes es el
   equivalente semanal del zombi: consumo enorme en una sola sesión (ya normado en CLAUDE.md).

### 13. Freno de emergencia recomendado (NO aplicado — valores salidos de los datos)

- `MAX_VISION_CALLS_PER_RUN` ≈ **40** (cubre Quattropani completo ~25–30; corta La Estrella a 1/3).
- `MAX_USD_PER_RUN` ≈ **$5** (llevando costo por función a la corrida: lámina $0,29 · región $0,11).
- `MAX_RUNTIME_SECONDS` ≈ **300** con **PARTIAL_RESULT_ON_BUDGET_EXCEEDED** (devolver lo computado
  + FALTA_DATO de lo no mirado — el pipeline ya sabe degradar declarando, sólo falta el gatillo).
- **CANCELACIÓN AL DESCONECTAR** o al menos «una corrida viva por proyecto» (lock) — evita zombi y
  solape.
- `MAX_RETRIES` queda como está (2) — no es problema hoy.
- `CACHE_BEFORE_MODEL` ya existe (hash por contenido) — mantener.
- Observabilidad mínima antes que cualquier otra cosa: `correlation_id` + hash + usd SIEMPRE en
  `chat_cost` (hoy no se puede administrar lo que no se puede unir).

### 14. Constancia de método

No se ejecutó La Estrella ni Quattropani, no se llamó a ningún provider ni se corrió E2E; las
únicas llamadas de hoy (§4) ocurrieron ANTES de esta auditoría, durante la auditoría funcional
anterior, y son precisamente el caso forense.
