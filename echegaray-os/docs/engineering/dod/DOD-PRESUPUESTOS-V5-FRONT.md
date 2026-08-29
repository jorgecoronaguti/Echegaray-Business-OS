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
npm run orq:test    → EXIT=0 · 12.059 tests en dot · 0 fail
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

## LÍMITES CONOCIDOS

Cada uno **bloquea el criterio que toca**. Ninguno está resuelto.

### 1 · Sin QA visual · bloquea «la pantalla 15 funciona»

`qa-visual` no estaba disponible para este frente. **Nadie miró el panel en un navegador.** El
build compila y los tests corren, pero un panel de conversación que no se usó a mano no está
probado: la hidratación, el foco del campo tras enviar, el ancho del panel en 13" y el
comportamiento de `useActionState` con el formulario nativo no tienen evidencia. **Esto tiene que
mirarlo el QA antes de cualquier merge.**

### 2 · El modelo nunca se llamó de verdad · bloquea «el intérprete LLM funciona»

Todos los tests del puente al modelo usan un `pedir` inyectado. **Nunca se hizo una llamada real a
la API.** Lo que está probado es que ninguna forma de basura que devuelva el modelo muta estado; lo
que NO está probado es que el modelo produzca JSON útil con ese prompt, ni cuánto cuesta, ni cuánto
tarda. Las métricas del §38 sobre uso de LLM no se pueden llenar con esto.

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

### 5 · Ningún dato real pasó por el circuito · bloquea todo criterio de efecto

No se corrió una conversación contra un presupuesto real de la base. Las escrituras
(`cotizacion_partida.cantidad`, `precio_subcontrato`, `cotizaciones.pct_*`) **están probadas como
PLAN, no como fila escrita.** La evidencia es del plan, no del efecto.

### 6 · Los cuatro umbrales de Base Maestra siguen decidiendo desde la constante

`DIAS_FRESCO`, `DIAS_ACEPTABLE`, `JORNADA_HORAS` y `BANDA_DESVIO` están sembrados en
`parametro_operativo` con su procedencia, y sus funciones ya los aceptan por parámetro — pero
**sus callers todavía usan el default**. Sólo `margen_objetivo_pct` se movió del todo. Cablear
Base Maestra es de su propio frente.

### 7 · El conflicto del margen sigue abierto — a propósito

`margen_objetivo_pct = 17` con estado `CONFLICTO`: el handoff dice 12. §31 y §45 dicen que lo
resuelve evidencia o autoridad. **Decisión pendiente del dueño.** Mientras tanto la cartera marca
bajo objetivo contra 17, igual que antes, pero ahora se puede ver por qué.

### 8 · El E2E de la pantalla no existe

No se escribió ningún `tests/*.spec.ts` para el circuito de conversación.

---

## Lo que necesita el CORE

1. **`intencion()` descarta campos que `ACCION[x].campos` declara.** `supplier`, `reason`,
   `currency`, `source` y `correlation_id` no se propagan, y `comandos.validar()` los LEE
   (`intent.supplier` decide si «sanitaria 8,5M» es un subcontrato o una pregunta). El canónico «la
   sanitaria la hace X por 8,5M» **no se puede expresar con el constructor oficial**. Mientras
   tanto lo cubre `intencionCompleta()` en `interprete.mjs`, que sólo propaga campos declarados.

2. **El evento identifica la entidad por el texto del usuario.** `evento({entidad:
   String(intent.target)})`: «la mamposteria», «mamposteria de ladrillo hueco» y «01.01» son la
   misma partida y dejan tres entidades distintas en el historial. El `undo` del §21 no puede
   agruparlas. `comandos.validar()` ya resolvió la partida — debería viajar al evento. Hay un
   candado en `conversacion.test.mjs` que se pone rojo cuando lo corrijan.

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
