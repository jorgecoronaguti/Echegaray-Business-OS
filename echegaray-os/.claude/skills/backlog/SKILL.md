---
name: backlog
description: Recibe un listado de tareas, analiza dependencias y conflictos, y las ejecuta en paralelo en worktrees aislados — una rama por tarea, sin abandonar ninguna a mitad de camino. Usalo cuando el dueño escriba /backlog seguido de una lista, o cuando entregue varias tareas juntas y pida ejecutarlas en paralelo.
---

# Backlog paralelo en worktrees

El dueño escribe una lista y no tiene que hacer nada más. Ni crear ramas, ni administrar worktrees,
ni limpiarlos después.

```
/backlog

1. Primera tarea
2. Segunda tarea
3. Tercera tarea
```

## Qué NO es (para no duplicar lo que ya existe)

- `prp` planifica **una** feature compleja antes de construirla.
- `bucle-agentico` ejecuta **una** feature aprobada, por fases dependientes entre sí.
- `orq.*` en Postgres es la cola del worker autónomo, que corre solo 24×7.

`backlog` es otra cosa y no las reemplaza: coordina **varias tareas independientes entre sí**,
repartidas en worktrees paralelos. Si una de esas tareas resulta ser grande, adentro de su worktree
lo que corresponde es usar `prp` y `bucle-agentico` — no reimplementarlos acá.

## La regla que gobierna todo esto

**Una tarea empezada no se suelta.** Sólo puede terminar en `COMPLETADA`, `BLOQUEADA` o
`CANCELADA`. No se abandona porque apareció una más fácil, porque surgió un problema menor, porque
el backlog tiene otras cosas, o porque hace falta más contexto que se puede conseguir solo.

`BLOQUEADA` es para causas reales que no se pueden resolver de forma autónoma: falta una credencial,
falta un dato indispensable, hace falta una decisión de negocio no documentada, depende de una tarea
sin terminar, o hay un conflicto técnico que necesita autorización. Cuando eso pasa hay que informar
**causa exacta, evidencia, qué se intentó, qué hace falta para seguir, y en qué estado quedó el
worktree** — y la tarea sigue visible en el tablero. Nunca se arranca otra tarea *en lugar* de una
bloqueada para disimular; sí se puede usar la capacidad libre con otra independiente.

## Antes que nada: la misión

Vale el `CLAUDE.md` de la raíz. Antes de convertir un pedido en tarea, la pregunta es cómo contribuye
a la misión del Business OS y cuál es la forma de mayor impacto de resolver el problema real. Si un
pedido del backlog no parece la mejor acción, se desafía **antes** de ejecutarlo, no después.

Y adentro de cada worktree siguen rigiendo, sin excepción: las Reglas de Oro, el Business OS como
fuente de verdad, y no duplicar capacidades que ya existen.

## 1 · Planificar (siempre, aunque el backlog sea corto)

1. **Convertir cada pedido en una tarea con criterio de finalización.** "Mejorar Proveedores" no es
   una tarea; "Proveedores pasa el auditor de patrón con 0 defectos y 0 celdas en error" sí.
2. **Detectar dependencias** funcionales y técnicas.
3. **Detectar conflictos de recurso.** Es lo que más rompe y lo que el DAG no ve: dos tareas
   independientes entre sí pueden tocar el mismo archivo, el mismo módulo, **la misma pestaña del
   Sheet**, la misma tabla, la misma migración o el mismo script. Este repositorio ya pagó ese error
   en la vida real: dos generadores escribiendo una misma pestaña dejaron anchos de grilla mezclados,
   bloques huérfanos y un techo de 14 quincenas que nadie veía. **Dos tareas que tocan el mismo
   recurso NO van juntas, aunque sean independientes.**
4. **Clasificar**: paralelizable · secuencial · bloqueada · conflictiva.
5. **Armar el DAG** y cargarlo en el registro:

```bash
node .claude/hooks/backlog.mjs init '[
  {"id":"T01","titulo":"…","criterio":"…","depende_de":[],"recursos":["orquestador/lib/x.mjs","Sheet:CAJA"]},
  {"id":"T02","titulo":"…","criterio":"…","depende_de":["T01"],"recursos":["Sheet:Proveedores"]}
]' 3
```

El último argumento es el **tope de concurrencia: 3**. Es prudente a propósito. Cada agente en
paralelo consume contexto, cuota de API y —en este proyecto— cuota de la API de Google Sheets, que es
un recurso compartido y limitado. No se usa toda la capacidad disponible sólo porque existe.

`backlog.mjs listas` devuelve el lote que puede arrancar ahora: descarta las bloqueadas, las que
tienen dependencias sin cerrar, y las que chocan por recurso con otra del mismo lote.

## 2 · Ejecutar

Para cada tarea del lote, **un worktree propio**, con el mecanismo oficial:

- La herramienta `EnterWorktree` crea el worktree bajo `.claude/worktrees/` y cambia la sesión a él.
  Se le pasa un `name` corto y único —el ID de la tarea sirve—. El dueño no administra nada.
- Se despacha con `Agent` usando `isolation: "worktree"`, que le da a cada agente su propia copia
  aislada del repositorio. Si el agente no cambia nada, el worktree se limpia solo.
- En el prompt de cada agente va: el objetivo, el **criterio de finalización**, los recursos que
  tiene permitido tocar, y la instrucción explícita de no salirse de ahí.

Dentro del worktree:

- **No se hace merge automático. No se hace push automático.** El resultado queda en su rama, para
  revisión.
- No se borra una rama ni un worktree con trabajo no preservado.
- Los hooks del proyecto aplican igual: `.claude/settings.json` se hereda en el worktree, así que el
  chequeo de sintaxis y el **hook de cierre** corren también ahí. Un agente no puede terminar con las
  validaciones en rojo.

Las tareas **dependientes** arrancan sólo cuando su dependencia está `COMPLETADA` y su resultado está
disponible en una base coherente.

## 3 · Seguir el estado

Todo cambio de estado se escribe. El tablero es la verdad, no mi memoria:

```bash
node .claude/hooks/backlog.mjs estado T01 EN_EJECUCIÓN --agente general-purpose --rama backlog/T01-x --worktree .claude/worktrees/T01
node .claude/hooks/backlog.mjs estado T01 EN_VALIDACIÓN --validaciones "orq:test 454 OK · typecheck OK · eslint 0 errores"
node .claude/hooks/backlog.mjs estado T01 COMPLETADA --resultado "…"
node .claude/hooks/backlog.mjs estado T02 BLOQUEADA --bloqueo "falta el monto contratado de la obra · intenté leerlo del Sheet y de public.obras · necesito que el dueño lo confirme · worktree limpio, sin cambios"
node .claude/hooks/backlog.mjs ver
```

El registro **impide** marcar `COMPLETADA` sin validaciones registradas, y `BLOQUEADA` sin causa. No
es una convención: es una barrera.

**Se informa cada tarea a medida que termina**, no al final de todo el backlog.

## 4 · Definición de terminado

Una tarea sólo queda `COMPLETADA` cuando: resolvió el pedido entero; cumple las Reglas de Oro; reusa
el Business OS en vez de duplicarlo; no deja código temporal ni TODOs nuevos sin justificar; no deja
cambios parciales; **se revisó el diff**; corrieron las validaciones aplicables; no hay conflictos de
git; los errores preexistentes relevantes quedaron documentados; y la rama quedó lista para revisar.

No se mezclan cambios ajenos para aparentar que una tarea quedó completa.

## 5 · Cerrar el backlog

Al terminar cada tarea se informa: **rama, worktree, resumen del cambio, validaciones reales que
corrieron, riesgos**. Y queda pendiente de revisión.

Cuando el dueño lo ordene —nunca antes— la integración es: revisar los resultados → elegir ramas →
integrar en el orden del DAG → resolver conflictos → correr la validación consolidada
(`npm run orq:test && npm run typecheck && npx eslint .`) → recién ahí limpiar los worktrees ya
integrados con `git worktree remove`.

Al final, `backlog.mjs pendientes` sale con código 1 si queda algo sin cerrar. Si sale 1, el backlog
**no** está terminado, por más que haya tareas verdes.
