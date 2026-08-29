# COTIZADOR — EL CONTRATO

**Versión 1.1.0.** Fuente ejecutable: `orquestador/lib/cotizador/contrato.mjs`. Este documento
explica; el que manda es el `.mjs`. Si difieren, gana el código y este archivo está desactualizado.

Tres caras leen lo mismo —la pantalla de Presupuestos, la conversación XSAS y Claude Code—. Si cada
una define «falta un dato» a su manera, el mismo presupuesto dice tres cosas.

## Cómo se cambia

Agregar un estado, una acción o un tipo de issue **es compatible** y sube la minor. Quitar o
renombrar **rompe el frente de frontend** y sube la major, con el motivo escrito acá abajo, en la
tabla de cambios. No se cambia en silencio.

| Versión | Fecha | Qué cambió | Por qué |
|---|---|---|---|
| 1.0.0 | 29/08/2026 | Primera | — |
| 1.1.0 | 29/08/2026 | `intencion()` propaga los campos que la acción DECLARA (`supplier`, `reason`, `currency`, `source`) | La 1.0.0 los descartaba, así que el canónico «la sanitaria la hace X por 8,5M» no se podía expresar con el constructor oficial: sin `supplier` la validación pregunta quién. El frente tuvo que escribir un constructor paralelo. Aditivo y compatible: lo no declarado sigue sin entrar |

---

## 1 · Los once estados de dominio

`EXTRAIDO · CALCULADO · HISTORICO · PROPUESTO · CONFIRMADO · VALIDADO · FALTA_DATO · AMBIGUO ·
CONFLICTO · ERROR · NO_APLICA`

Son estados de **dominio**, no de pantalla: la UI traduce. Cada uno lleva en el código su
`COMO_SE_RESUELVE` — no es documentación, es lo que la cola de atención muestra como acción sugerida.

Dos derivaciones que el motor usa en vez de comparar strings:

- `esAusencia(estado)` → los cuatro que significan «acá no hay número»: `FALTA_DATO AMBIGUO
  CONFLICTO ERROR`.
- `sumable({valor, estado})` → **la función que impide el defecto ya medido en la base**:
  `cotizacion_cascada` hace `coalesce(sum(subtotal), 0)` y `sum()` de Postgres ignora los `NULL`,
  así que una partida subcontratada sin precio se cae de la suma y el presupuesto se publica
  completo. Acá un ausente no se ignora: envenena el total (§15).
- `cierra(estado)` → los que pueden sostener un número en una versión congelada. `HISTORICO` **no
  está**: una práctica histórica es referencia, no norma (§29).

## 2 · Las once etapas y la forma de su resultado

`INGEST → INTERPRET → SCOPE → TAKEOFF → MAP → COMPOSE → COST → COMMERCIAL → VALIDATE → FREEZE →
OUTPUT`

Toda etapa devuelve **las nueve llaves, siempre**:

```
{ etapa, status, result, evidence, provenance, confidence,
  missing_data, conflicts, blocking_issues, next_actions }
```

`status` ∈ `OK · DEGRADADA · BLOQUEADA · FALLIDA · OMITIDA`. `DEGRADADA` es la que existe para el
CLAUDE-ZERO (§34): produjo resultado sin el proveedor de razonamiento **y lo dice**.

Dos garantías que el constructor `resultadoEtapa()` hace cumplir y no son negociables:

1. **Las ocho llaves acompañantes se materializan aunque estén vacías.** Un `{status:'OK'}` a secas
   obliga a adivinar si no encontró conflictos o si no los buscó, y esas dos cosas se ven iguales
   desde afuera.
2. **Una etapa con `blocking_issues` no puede declararse `OK`.** El constructor la degrada a
   `BLOQUEADA`. Un status que los propios datos desmienten es peor que ninguno.

## 3 · La cola de atención

`issue({type, severity, entity, impact, evidence, recommended_action, detalle})`.

Trece tipos: `FALTA_DATO · CONFLICTO · AMBIGUO · SIN_PRECIO · PRECIO_DESACTUALIZADO ·
SUBCONTRATO_SIN_PRECIO · OUTLIER_PENDING · COMMERCIAL_DECISION · UNIDAD_INCOMPATIBLE ·
EXCLUSION_CON_COMPUTO · SIN_PARTIDA · CANTIDAD_CRITICA_AUSENTE · FUGA_ENTRE_CLIENTES`.

Cuatro severidades: `BLOQUEANTE · ALTA · MEDIA · BAJA`. `BLOQUEANTE` no es un adjetivo: es lo que
hace que el gate de freeze diga que no.

**`impact` es plata o `null`, nunca cero.** Un issue sin impacto conocido y uno con impacto cero son
cosas distintas; escribir `0` cuando no se sabe lo manda al fondo de la cola, que es exactamente
donde no tiene que estar. `ordenarCola()` ordena por bloqueo → materialidad → tipo → entidad; los
dos últimos existen para que dos corridas devuelvan la **misma** cola (§39).

**`recommended_action` es una acción del command layer, no una frase.** Así la pantalla ofrece el
botón y el chat ofrece la intención desde el mismo dato.

## 4 · El command layer y su RBAC

Seis permisos: `READ · WRITE · COMMERCIAL_WRITE · FREEZE · APPROVE · GLOBAL_POLICY_WRITE`.

| Rol | READ | WRITE | COMMERCIAL_WRITE | FREEZE | APPROVE | GLOBAL_POLICY_WRITE |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `DUENO` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ADMINISTRACION` | ✓ | ✓ | ✓ | ✓ | | |
| `JEFE_DE_OBRA` | ✓ | ✓ | | | | |
| `LECTOR` | ✓ | | | | | |

`veComercial(rol)` se **deriva** de `COMMERCIAL_WRITE`: no existe un rol que escriba lo comercial y
no lo vea, y tener la lista suelta permitiría que se separen sin que nadie lo note.

### Las catorce acciones

| Acción | Permiso | Muta | Campos |
|---|---|:-:|---|
| `update_quantity` | WRITE | ✓ | target, value, unit |
| `exclude_scope` | WRITE | ✓ | target, reason |
| `include_scope` | WRITE | ✓ | target, reason |
| `set_subcontract` | WRITE | ✓ | target, supplier, value, currency |
| `set_resource_price` | WRITE | ✓ | target, value, currency, source |
| `commercial_override` | COMMERCIAL_WRITE | ✓ | target, value |
| `set_global_policy` | GLOBAL_POLICY_WRITE | ✓ | target, value |
| `freeze` | FREEZE | ✓ | — |
| `approve` | APPROVE | ✓ | — |
| `undo` | WRITE | ✓ | correlation_id |
| `evidence_query` | READ | | target |
| `blockers_query` | READ | | — |
| `cost_query` | READ | | target |
| `commercial_query` | COMMERCIAL_WRITE | | target |

`commercial_query` **no muta y aun así exige `COMMERCIAL_WRITE`**: §40 dice que el jefe de obra no
ve lo comercial por ningún canal, y una consulta es un canal. Es la separación entre «puede leer» y
«puede escribir» que este repo ya rompió una vez en el otro sentido.

**El motivo de un rechazo no nombra el valor.** Un mensaje de error es un canal de lectura: «no
tenés permiso para cambiar el beneficio» está bien; «no podés poner el beneficio en 19 %» ya contó
cuánto es.

### El enchufe del LLM

El modelo produce **sólo** `intencion({action, target, value, unit, textoOriginal})`. Su única
garantía es sintáctica: una acción fuera de la lista cerrada no se construye. Entre la intención y
el estado de negocio pasa, **en este orden y todo en código de este repo**:

```
AUTORIZACIÓN → VALIDACIÓN → REGLAS → OUTLIER → MUTACIÓN → RECÁLCULO → PERSISTENCIA
```

El modelo nunca escribe estado de negocio. Los siete casos canónicos del §19 son la prueba de
aceptación del command layer.

### La costura oficial: `ejecutar()` es SÍNCRONA y no escribe

Recibe `mutar`, que devuelve un **plan** de escritura, y el plan lo aplica **quien llama, con SU
credencial**. No es una limitación pendiente: es lo que mantiene la RLS honesta. Si el motor
escribiera, lo haría con la conexión del servidor —rol del pool, RLS no aplicada— y los seis
permisos volverían a vivir sólo en JavaScript, que es el agujero que cerró la migración
`20260829T1500`.

Corolario: **`orquestador/lib/cotizador/pg.mjs` NO ES PARA LA WEB.** Recibe el pool directo, así que
las policies no se evalúan. Sirve para scripts, informes, tests y el worker. Una ruta de Next o una
server action tienen que aplicar el plan con la credencial del usuario.

### La entidad del evento es la partida, no el texto

`ejecutar()` arma el evento con la partida que la **validación ya resolvió**, no con lo que escribió
la persona. «mamposteria», «la mamposteria» y «T4010» dejan **una sola** entidad en el historial —
sin eso, `historiaDe()` no puede reconstruir el estado de una partida y el `undo` del §21 no puede
agrupar lo que fue un solo pedido.

## 5 · Las trece invariantes del §42

Viven en `INVARIANTES` y cada una tiene su test negativo:

`NULL≠0 · ERROR≠0 · UNKNOWN≠0 · SIN_PRECIO≠0 · HISTORICO≠VALIDADO · CANDIDATO≠NORMA ·
EXTERNAL≠ECSAS · COST≠PRICE · QUOTE≠OFFER · FROZEN≠DRAFT · REVISION≠MUTACIÓN · HH≠CREW · HH≠DURACIÓN`
