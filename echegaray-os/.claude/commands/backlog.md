---
description: Ejecuta una lista de tareas en paralelo, cada una en su worktree aislado, sin abandonar ninguna a mitad de camino
argument-hint: "1. primera tarea · 2. segunda tarea · 3. tercera tarea"
---

Tomá la lista de abajo y ejecutala con el procedimiento de backlog paralelo.

**Leé primero `.claude/skills/backlog/SKILL.md`** — ahí está el procedimiento completo (planificación,
DAG, conflictos de recurso, worktrees, estados, definición de terminado, integración). Este archivo
sólo existe para que `/backlog` sea un comando; el criterio vive en la skill y no se duplica acá.

Lo que no se negocia, aunque no vuelvas a abrir la skill:

- **Una tarea empezada no se suelta.** Sólo termina en `COMPLETADA`, `BLOQUEADA` o `CANCELADA`.
  `BLOQUEADA` exige causa real, qué intentaste y qué hace falta para seguir.
- **El estado se escribe, no se recuerda**: `node .claude/hooks/backlog.mjs` (`init`, `estado`,
  `listas`, `ver`, `pendientes`). El tablero es la verdad — un `/compact` no se lleva puesto el backlog.
- **Dos tareas que tocan el mismo recurso no van juntas**, aunque el DAG diga que son independientes.
  Mismo archivo, misma pestaña del Sheet, misma tabla, misma migración.
- **Tope de concurrencia 3.** La cuota de la API de Google Sheets es un recurso compartido.
- **Ni merge ni push automático.** Cada resultado queda en su rama, para revisión.
- Adentro de cada worktree siguen rigiendo las Reglas de Oro, el Business OS como fuente de verdad y
  la prohibición de duplicar capacidades que ya existen.

Si el pedido de abajo está vacío, mostrá el tablero actual (`backlog.mjs ver`) en vez de inventar tareas.

---

$ARGUMENTS
