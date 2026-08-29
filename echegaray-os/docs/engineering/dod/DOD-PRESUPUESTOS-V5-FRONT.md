# DoD — PRESUPUESTOS v5 · FRENTE FRONT

Rama `feat/presupuestos-v5-front`, nacida de `feat/cotizador-core`.
**No mergeada. No desplegada. Sin QA visual.** Lo cierra quien no lo construyó.

---

## Qué se construyó

| Archivo | Qué resuelve | § |
|---|---|---|
| `orquestador/lib/cotizador/interprete.mjs` | frase → intención, determinístico. Los 7 canónicos, sin red | 19, 33, 34 |
| `orquestador/lib/interprete-presupuesto-llm.mjs` | la puerta del modelo. **Fuera de `cotizador/`**, se inyecta | 19, 33, 41 |
| `orquestador/lib/cotizador/conversacion.mjs` | el hilo texto → `ejecutar()` → respuesta estructurada | 19 |
| `orquestador/lib/cotizador/desde-base.mjs` | filas de Postgres → forma del contrato. Cola parcial declarada | 22, 24 |
| `src/features/presupuestos/services/cotizadorPuente.ts` | **la costura**: el único lugar donde la web importa el motor | — |
| `src/features/presupuestos/services/conversacionPlan.ts` | qué escribe cada intención; RBAC de rol; lo que no se puede, dice por qué | 19, 40 |
| `src/features/presupuestos/services/actionsConversacion.ts` | la server action, con el rol leído del PERFIL y re-validado | 40 |
| `src/features/presupuestos/components/Conversacion.tsx` | el panel de la pantalla 15 | 46 |
| `src/features/presupuestos/components/ColaDeAtencion.tsx` | el presupuesto vivo: cola + gate con su porqué | 22, 23, 24 |
| `src/features/presupuestos/services/pipeline.ts` | el pipeline de 5 pasos, derivado de datos | — |
| `src/features/presupuestos/services/parametrosOperativos.ts` | los umbrales, leídos de su tabla | REALIDAD ÚNICA |
| `supabase/migrations/20260829T1400_*.sql` | `parametro_operativo` — **aplicada y verificada en la base** | 31, 45 |

---

## Evidencia (salida literal)

Tras mergear `feat/cotizador-core` al día (el CORE avanzó: trajo `pg.mjs`, `seguridad.mjs`,
`explosion.mjs` y la migración `20260829T1500`):

```
npm run orq:test    → EXIT=0 · 12.130 tests en dot · 0 fail
npm run typecheck   → EXIT=0
npx eslint .        → EXIT=0 · 0 errores · 60 warnings · 0 en el área de este frente
npm run build       → EXIT=0 · las 3 rutas de /presupuestos compilan
```

El warning nº 60 (eran 59) llegó con el merge del CORE, no de este frente: `npx eslint` sobre
`src/features/presupuestos`, `orquestador/lib/cotizador`, `interprete-presupuesto-llm.mjs` y
`src/app/(main)/presupuestos` sale limpio.

**El build exigió reemplazar el symlink de `node_modules` por `cp -al`**: Turbopack rechaza un
symlink que apunta fuera de la raíz del proyecto («Symlink [project]/node_modules is invalid»). Es
la trampa ya conocida de los worktrees; queda anotado porque vuelve a aparecer en el próximo.

Migración, las dos corridas:

```
$ node orquestador/scripts/aplicar-migracion.mjs supabase/migrations/20260829T1400_*.sql
✓ el ensayo corrió entero sin error. NO se aplicó (falta --aplicar)
$ node orquestador/scripts/aplicar-migracion.mjs supabase/migrations/20260829T1400_*.sql --aplicar
✓ aplicada y registrada: 20260829T1400_los_umbrales_dejan_de_vivir_en_typescript.sql
```

Efecto de la RLS leído en la base, como `authenticated` con el uuid de personas reales:

```
direccion  → banda_desvio, dias_precio_aceptable, dias_precio_fresco, jornada_horas, margen_objetivo_pct
jefe_obra  → banda_desvio, dias_precio_aceptable, dias_precio_fresco, jornada_horas
policy lectura: ((economico = false) OR ( SELECT ve_economia()))
vista parametro_operativo_vigente: [ 'security_invoker=on' ]
```

## Mutaciones corridas — no declaradas: **corridas**

| Mutación | Resultado |
|---|---|
| `supplier: null` → `'a definir'` en el intérprete | FAIL «inventó un proveedor que nadie dijo» |
| regla de cantidad ANTES de las consultas | FAIL «de donde salen 47,2 m3 produjo una acción que muta» + 7 más |
| `{r.titulo &&` → `{'Aplicado' &&` en el panel | FAIL «Aplicado está escrito en Conversacion.tsx: es una respuesta preescrita» |
| `Number.isFinite(Number(v))` en `deltaDePrecio` | FAIL: `ventaSinIva: null` entraba como 0. **Era un defecto real, corregido.** |
| `interprete-llm` importado dentro de `cotizador/` | FAIL en `claude-zero.test.mjs`. **Era un defecto real: el archivo se mudó afuera.** |

---

## AUDITORÍA DELTA — 6 ataques rompieron, 4 bloqueantes. Qué se hizo

| # | Defecto medido por el auditor | Arreglo |
|---|---|---|
| 1 | **Lost update**: A lee 480, B escribe 1200, A aplica 520 → los 1200 mueren mudos, el evento miente (`antes: 480`) y el outlier midió +8 % sobre un cambio real de −57 % | Predicado de concurrencia (`.eq`/`.is` sobre el valor leído) + cero filas ⇒ CONFLICTO con los dos valores + **relectura del destino** antes de decir «Aplicado» |
| 2 | La interpretación del modelo mutaba sin confirmación y sin marca: un «Aplicado» de una regla y uno de una alucinación eran idénticos | Origen `GRAMATICA`/`MODELO` en toda la cadena; una mutación de origen MODELO exige el «¿Lo aplico igual?» **antes de mutar**, aunque el outlier calle; el panel lo dibuja |
| 3 | Como `administracion` reescribió el margen a 99, borró la fila y movió el `pct_beneficio` global | Migración `20260829T2000`: las dos tablas con `cot_permiso('GLOBAL_POLICY_WRITE')`, sin `delete` en el grant |
| 4 | El canario del E2E afirmaba lo que no probaba: la ausencia de `conversacion-degradada` es compatible con «el modelo contestó bien» | El assert pasa a `origen-modelo`, que sí distingue los dos casos |
| 5 | La key volvió a colisionar por el otro lado (dos huecos de la misma fila) — y el arreglo anterior **no tenía test** | `${type}-${partidaId}` + test con las dos colisiones y su mutación |
| 6 | `set_global_policy` valida como `commercial_override` en el motor | La base ya lo frena (punto 3) y el intérprete nunca la produce. **Declarado**: el motor es del CORE, pedido en el informe |
| 7 | `validar()` acepta negativos | Guarda explícita en el intérprete. La mutación delató que **no tenía test**: escrito |

**Lo que resistió y quedó firmado por el auditor:** la frontera del contrato ante JSON malicioso
(campos extra, prototype, unidades incompatibles), el RBAC en las tres cerraduras contra la base con
el jefe real, el E2E honesto (corrida propia, sin residuo, rebote genuino del gate) y los guards
anti-demo, que el auditor mutó y gritaron.

---

## LÍMITES CONOCIDOS

Cada uno **bloquea el criterio que toca**. Ninguno está resuelto.

### 1 · El QA visual corrió y encontró 6 defectos · 5 corregidos, 1 sin reproducir

El QA usó navegador, login y base reales. Lo que encontró y qué pasó con cada cosa:

| # | Defecto | Estado |
|---|---|---|
| 1 | El gate de congelar era decorativo: congeló con un bloqueante vivo y precio $0 | **Corregido.** `puedeCongelar()` consume el gate; la action llama a `cot_congelar_con_gate` |
| 2 | El input nunca enviaba lo tipeado (`onSubmit` limpiaba en carrera) | **Corregido.** Se limpia después de despachar |
| 3 | Cartera/Edición a 390 px: `scrollWidth === clientWidth` | **RETIRADO por el QA.** Había medido `TarjetaTabla` (la caja) en vez de `.canon-scroll-x`; bien medido, scrollea |
| 4 | Convertir a 390 px: la descripción con `width=0` | **Corregido.** La grilla pasa por `EnvoltorioAncho` |
| 5 | `venta_sin_iva` llega 0 y el guard sólo miraba `=== null` | **Corregido** en `freeze.mjs` (archivo del CORE — que lo absorba) |
| 6 | «sanitaria sanitaria 8,5M» | **Corregido** en `comandos.mjs` (idem) |
| 8 | Evidence query sin match: JSON de nulls mudo | **Corregido.** Línea estructural de ausencia + el JSON debajo |

**El defecto 3 se retiró.** No faltaba `overflow-x-auto`: el mecanismo estaba entero
(`TarjetaTabla cols={COLS}` → `EnvoltorioAncho` → `.canon-scroll-x` bajo
`@media (max-width: 1023px)`) y el ancho reservado era 845/838 px. El QA había medido la caja
—que lleva `overflow: hidden` a propósito— en vez del contenedor de scroll, que es su hijo.
Bien medido, la rueda llega hasta TOTAL y MARGEN. Queda anotado porque el error de medición es
fácil de repetir: **el scroll de una tabla del canon NO está en `[data-testid]`, está en el
`.canon-scroll-x` de adentro.**

### Micro-tanda del re-QA — dos defectos más, cerrados

| Defecto | Arreglo |
|---|---|
| El foco no volvía al input tras enviar tipeando | `focus()` después de despachar y limpiar, en el mismo lugar |
| Key duplicada en la cola con dos partidas de igual descripción | El issue lleva el id de SU fila en `evidence`; la pantalla lo usa como clave |

La key no se arregló con el índice del array. `entity` cae a la descripción cuando la partida no
tiene código, así que dos partidas iguales daban **dos huecos distintos que se ven idénticos en
pantalla** — el warning de React era el síntoma barato de eso. El id de la fila viaja en `evidence`,
que es el campo del contrato para «de dónde salió este issue», así que no hizo falta pedirle un
campo nuevo al CORE. Un índice habría callado a React sin identificar nada.

Y la línea del evidence query sin match ahora distingue las TRES cosas que se confundían: **no
está** · **está cargada sin datos** · **vale cero**. El mensaje del motor se muestra intacto y la
distinción va al lado — reescribirlo habría tapado lo que el motor dijo.

### 2 · El modelo nunca se llamó de verdad · bloquea «el intérprete LLM funciona»

Todos los tests del puente al modelo usan un `pedir` inyectado. **Nunca se hizo una llamada real a
la API.** No está probado que el prompt produzca JSON útil, ni cuánto cuesta, ni cuánto tarda: las
métricas del §38 sobre uso de LLM no se pueden llenar con esto.

**Lo que la auditoría delta corrigió de esta declaración:** decía que «lo que SÍ está probado es que
ninguna forma de basura que devuelva el modelo muta estado». Eso era cierto para el JSON malformado
y para las acciones inventadas —el auditor lo atacó y resistió— pero **no** para un JSON bien
formado y plausible: ése entraba a `ejecutar()` y, si el outlier callaba, mutaba solo. Ya no: una
intención de origen `MODELO` exige confirmación explícita, aunque el outlier no tenga nada que
decir. Sigue sin probarse el camino del modelo en sí.

### 3 · Cinco de las catorce acciones no escriben · bloquea «la conversación cubre el §19»

`set_resource_price`, `set_global_policy`, `undo`, `freeze` y `approve` **no tienen dónde
escribirse hoy** y devuelven un rechazo con el motivo, no un «listo» falso. Están en
`MOTIVO_SIN_PLAN` y cada uno nombra QUÉ falta.

**`exclude_scope` e `include_scope` YA escriben** (cerrado después del merge del CORE, que trajo
`cotizacion_alcance` con su RLS): «sacá pintura» hace un upsert con `fuente: CONVERSACION` y el
texto literal, y `cruzarAlcance()` —el del §5, no una reimplementación— hace que la cola deje de
pedir el precio de lo excluido. Sigue sin probarse contra una fila real: ver el límite 5.

### 4 · La cola es parcial · bloquea «el presupuesto vivo muestra qué falta»

`desde-base.mjs` deriva la cola de las FILAS, no de las once etapas de `orquestador.correr()` —que
necesitan documentos, elementos y composiciones, o sea el pipeline de plano, que es otro frente—.
Ve tres tipos de hueco de trece. La pantalla lo dice (`data-testid="cola-parcial"`), pero **«no hay
nada bloqueando» en esa cola no significa que el presupuesto esté listo.**

### 5 · ~~Ningún dato real pasó por el circuito~~ — OBSOLETO desde el E2E

Este límite contradecía al 8 y quedó viejo: `tests/presupuesto-conversacion.spec.ts` recorre el
circuito con datos reales y lee las filas en su destino, y `concurrencia.pg.test.mjs` y
`congelar-con-gate.pg.test.mjs` atacan la base directamente. Lo que sigue sin cubrirse es acotado y
está en los límites 2 y 9.

### 6 · Los cuatro umbrales de Base Maestra siguen decidiendo desde la constante

`DIAS_FRESCO`, `DIAS_ACEPTABLE`, `JORNADA_HORAS` y `BANDA_DESVIO` están sembrados en
`parametro_operativo` con su procedencia, y sus funciones ya los aceptan por parámetro — pero
**sus callers todavía usan el default**. Sólo `margen_objetivo_pct` se movió del todo. Cablear
Base Maestra es de su propio frente.

### 7 · El conflicto del margen sigue abierto — a propósito

`margen_objetivo_pct = 17` con estado `CONFLICTO`: el handoff dice 12. §31 y §45 dicen que lo
resuelve evidencia o autoridad. **Decisión pendiente del dueño.** Mientras tanto la cartera marca
bajo objetivo contra 17, igual que antes, pero ahora se puede ver por qué.

### 8 · ~~El E2E de la pantalla no existe~~ — CERRADO

`tests/presupuesto-conversacion.spec.ts`: dos recorridos, en navegador real, **tipeando** con
`pressSequentially` y `Enter` sobre el formulario nativo (no `fill`, que no reproduce el defecto que
el QA encontró). Cada afirmación se cierra leyendo la fila en Postgres, no el mensaje de la
pantalla.

```
E2E_PORT=3287 LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs \
  npx playwright test tests/presupuesto-conversacion.spec.ts

CORRIDA 1 → 2 passed (24.6s)
CORRIDA 2 → 2 passed (19.6s)
```

Puerto propio: con `E2E_PORT` el arnés apaga el reuso, así que lo que se prueba sale de ESTE
worktree. Limpieza por marca propia (`ZZE2E-CONVERSACION`) al entrar y al salir, gane o pierda —
verificado después de las dos corridas: cero residuo en la base.

**Tres defectos que sólo encontró el E2E**, y que los tests de estructura no podían ver:

1. **El foco seguía sin volver** aunque el `focus()` estaba puesto. La causa era otra:
   `disabled={pendiente}` en el input. Deshabilitar un elemento enfocado se lo quita el navegador,
   así que el `focus()` se perdía en el repintado siguiente. El arreglo anterior era necesario y no
   suficiente. El input ya no se deshabilita — el doble envío lo frena el botón, que sí.
2. **Mi mutación declarada era falsa.** Escribí que «limpiar antes de despachar pierde lo que se
   escribió»; la mutación inversa dejó el E2E en **verde**. El FormData llega a la acción ya
   capturado, así que el orden ahí adentro es indiferente: lo que rompía era `onSubmit`, que corre
   antes de que React lo arme. Comentario y test de estructura corregidos.
3. **El outlier sí pregunta** en el caso del guion: 480→520 mueve $1.000.000 sobre $12.000.000, más
   del 2 % de materialidad. El recorrido verifica que el primer intento **no** mueve la fila y que
   sólo se aplica con el «Aplicalo igual» explícito (§20).

**Lo que este E2E no prueba:** el camino del modelo. Todas las frases son de las que el intérprete
determinístico resuelve, y eso se verifica con el canario `conversacion-degradada`, que tiene que
estar ausente. El límite 2 sigue abierto.

---

## Lo que necesita el CORE

1. ~~`intencion()` descarta campos declarados~~ — **RESUELTO por el contrato 1.1.0.** Mi
   `intencionCompleta()` está borrado y todo usa el constructor oficial.

2. ~~El evento identifica la entidad por el texto del usuario~~ — **RESUELTO por el contrato
   1.1.0.** El candado se puso rojo, como estaba previsto, y quedó dado vuelta: ahora afirma la
   propiedad nueva (dos textos distintos sobre la misma partida ⇒ una sola entidad, `01.01`).

3. **`pg.mjs` NO sirve para la web, y conviene decirlo antes de que alguien lo intente.** Los
   adaptadores que el CORE entregó reciben `{ query }` —un pool de Postgres directo—, así que
   corren con el rol del pool y **no con la sesión del usuario: la RLS no aplica**. La server
   action de Next usa el cliente Supabase con la cookie, que es lo único que hace cumplir
   `ve_economia()`. Por eso `desde-base.mjs` sigue vivo y no se reemplazó por `pg.mjs`. Si el CORE
   quiere una sola implementación, el adaptador tiene que poder recibir un cliente PostgREST.

4. **`ejecutar()` es síncrono** y llama a `mutar` en el medio del pipeline. Por eso `mutar` acá
   devuelve un PLAN que la server action aplica después. Si el CORE lo vuelve async, el plan
   desaparece — pero se pierde la garantía de que el command layer se prueba sin red. **La costura
   actual parece la buena; queda dicho por si el CORE opina distinto.**
