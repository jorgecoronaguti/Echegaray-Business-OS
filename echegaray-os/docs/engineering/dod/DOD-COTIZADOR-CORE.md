# DoD — COTIZADOR CORE (`orquestador/lib/cotizador/`)

Rama `feat/cotizador-core`. **No mergeado. No desplegado.** Lo cierra quien no lo construyó.

---

## Qué se construyó

| Módulo | Qué resuelve | §
|---|---|---|
| `contrato.mjs` | 11 estados, 11 etapas, 14 acciones con RBAC, 13 tipos de issue, 13 invariantes | 1, 2, 22, 40, 42 |
| `unidades.mjs` | unidades fuertes, colisión `m` declarada, parser es-AR | 7 |
| `alcance.mjs` | INCLUIDO/EXCLUIDO/POR_DEFINIR + cruce exclusión↔cómputo | 5 |
| `precios.mjs` | RESOURCE ≠ PRICE OBSERVATION, SIN_PRECIO, vencimiento, FX explícito | 10, 11 |
| `costo.mjs` | costo directo que se niega, subcontrato sin precio, 5 cajones trazables | 14, 15 |
| `comercial.mjs` | política versionada, indirectos CALCULATED/APPLIED, coeficiente derivado | 16, 17, 18 |
| `outlier.mjs` | 5 señales por materialidad | 20 |
| `eventos.mjs` | evento + undo por correlación, append-only | 21 |
| `atencion.mjs` | cola derivada + reglas de bloqueo | 22, 23 |
| `comandos.mjs` | el enchufe: autorización→validación→reglas→outlier→mutación | 19 |
| `freeze.mjs` | gate previo + huella de entradas | 24, 39 |
| `oferta.mjs` | oferta desde congelado con genealogía; revisión con dos vistas + puente | 25, 26 |
| `obra.mjs` | adjudicación sin destruir la quote; Σ frentes = heredado | 27, 28 |
| `metricas.mjs` | ~30 contadores + 3 tasas, `null` sobre denominador cero | 30, 38 |
| `orquestador.mjs` | la máquina de 11 etapas | 1, 34 |

Migración `20260829T1200` — 4 tablas nuevas, **aplicada y verificada en la base**.

---

## Evidencia

```
node --test 'orquestador/lib/cotizador/*.test.mjs'   → # tests 156 · # pass 156 · # fail 0
npm run orq:test                                     → exit 0 · 591 líneas de dot · 0 fail
npm run typecheck                                    → exit 0
npx eslint .                                         → exit 0 · 0 errores · 59 warnings (ninguno en cotizador/)
node orquestador/scripts/aplicar-migracion.mjs … --aplicar → aplicada y registrada
```

**Efecto de la migración leído en su destino** (no la pantalla que respondió que sí):

| tabla | RLS | policies | select | insert | update | delete |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `cotizacion_alcance` | ✓ | 1 | ✓ | ✓ | ✓ | ✓ |
| `cotizacion_evento` | ✓ | 2 | ✓ | ✓ | **✗** | **✗** |
| `cotizacion_huella` | ✓ | 2 | ✓ | ✓ | **✗** | **✗** |
| `indirecto_concepto` | ✓ | 1 | ✓ | ✓ | ✓ | ✓ |

`migracion_aplicada`: `20260829T1200… @ 2026-08-29T13:09:39.737Z`. `cotizacion_cascada` sigue
devolviendo sus 11 filas: nada existente se rompió.

**Mutaciones CORRIDAS** (no declaradas): 43 en total, todas ROJO en la vuelta final. Tres salieron
VERDE en la primera vuelta y obligaron a agregar el test que faltaba — están listadas abajo, en
Límites, porque son la parte del informe que dice qué NO estaba cubierto.

---

## LÍMITES CONOCIDOS — cada uno bloquea el criterio que toca

### 1. Nada de esto corrió sobre un proyecto real. **Bloquea §35, §36 y §37.**
Los 156 tests corren sobre entradas construidas a mano. **Quattropani no se usó como regresión**,
el caso ciego no existe, y las tres formas de cotizar desde cero (doc suficiente / doc incompleta /
cómputo manual) no se ejercitaron. El único puente al circuito real es `desdePipelineDePlano`, que
tiene **un** test con datos sintéticos. Hasta que no corra sobre la carpeta real de un cliente, la
afirmación «el motor funciona» no tiene evidencia.

### 2. Nada de esto está conectado. **Bloquea el cierre entero.**
El motor no lee ni escribe la base: `orquestador.mjs` recibe una entrada materializada. Falta el
adaptador que traiga partidas, composiciones y `recurso_precio` de Postgres, y el que persista
alcance, eventos y huella en las tablas recién creadas. **Las cuatro tablas están vacías y nadie
las escribe todavía.** Su RLS está probada por privilegio, no por una escritura real desde un JWT
de `authenticated`.

### 3. El cruce exclusión↔cómputo se ejercitó con un caso RECONSTRUIDO, no con el contrato real.
§5 pide ejercitarlo «con un caso real». El test usa los patrones `entrepiso` y `escalera` que la
memoria del OS registra del contrato de Quattropani, pero **no se abrió el contrato**. La mecánica
está probada; que esos sean los patrones correctos, no.

### 4. `recurso_precio` no tiene vigencia por observación.
El corte de 180 días vive en `DIAS_VIGENCIA` del código. La tabla tiene un `vigente` booleano.
Agregarle `vigencia_dias` es un ALTER sobre una tabla que consume media docena de vistas y no se
hizo. Consecuencia: **`PRECIO_DESACTUALIZADO` funciona en memoria y no se puede consultar por SQL.**

### 5. El RBAC de seis permisos vive sólo en JavaScript.
La base sigue teniendo un único portero: `ve_economia()`. `COMMERCIAL_WRITE`, `FREEZE`, `APPROVE` y
`GLOBAL_POLICY_WRITE` se distinguen en `contrato.mjs` y **no en la RLS**. Un PATCH de PostgREST
sobre `parametro_comercial` hecho por alguien con `ve_economia()` saltea la distinción entera. §40
pide tests adversariales contra el sistema vivo: los de acá son contra la función pura.

### 6. Sin gate de fuga entre clientes. **Bloquea §43.**
`fugaEnLaSalida` sólo chequea nombres de campo internos. El control cross-client construido en otro
frente **no está enganchado** antes de freeze/output.

### 7. Sin defensa contra prompt injection. **Bloquea §41.**
No se tocó el `PROMPT` de `plano/interpretar.mjs` (core cerrado) y no hay ningún test de §41. Un
«ignore previous instructions» dentro de un PDF hoy no tiene nada que lo pare.

### 8. Resource explosion (§13) NO se implementó.
Estaba en el mapa como **D** y quedó en D. Hay desglose por cajón y por partida; no hay el total
por recurso que alimenta Compras/Personal/Equipos.

### 9. La resolución de FALTA_DATO (§30) es una métrica, no una cadena.
`incertidumbre_no_declarada` se calcula. La jerarquía «proyecto → XSAS → experiencia ECSAS →
técnico → fuentes permanentes → web → LLM → pregunta humana» **no está implementada**: nada busca.

### 10. Las latencias fría/tibia se declaran y no se miden.
`metricasDeCorrida` acepta `msFrio`/`msTibio` y nadie se los pasa. Salen `null`, que es honesto y
no es la métrica.

### 11. Tres mutaciones salieron VERDE en la primera vuelta.
- `evaluarCambio` — el caso que probaba el orden autorización/validación usaba un target VÁLIDO,
  donde las dos ordenaciones dan el mismo mensaje. Se agregó el que usa un target inválido.
- `revisar` — el test usaba la MISMA política para hoy y para la oferta, así que calcular la vista A
  con la equivocada no se notaba. Se agregó una política de hoy con beneficio 19 %.
- `costoDePartida` — no había test de que una sola línea sin precio deja la partida entera sin
  subtotal. Se agregó.

Dos más quedaron VERDE **por redundancia deliberada** del contrato (una etapa con `blocking_issues`
no puede declararse `OK`, así que mutar cualquiera de las dos por separado no cambia el resultado).
Se agregó la aserción sobre el contenido del bloqueo.

### 12. `metricas.mjs` no tiene test propio.
Se ejercita indirectamente por `claude-zero.test.mjs` (reproducibilidad de métricas entre dos
corridas). Sus ~30 contadores individuales **no están verificados uno por uno**.

---

## Quién tiene que firmar

- **Auditor adversarial con contexto nuevo**: el diff completo, buscando qué afirma sin evidencia.
- **El dueño**: la cascada comercial y el coeficiente tienen efecto económico directo. El
  `1,681968` está verificado a mano contra la migración `20260821T4300`, y esa migración a su vez
  contra el XLSM — pero nadie que no sea él puede firmar que ése es el precio de la empresa hoy.
