# Agentes — Echegaray Business OS

> Un agente no es una skill con otro nombre. Si no aporta lo que una skill no puede, no debe existir.

---

## La única pregunta antes de crear un agente

**Skill** = conocimiento y criterio. Se carga en el contexto del que ya está trabajando.
**Agente** = un trabajador aparte, con su propio contexto, sus propias herramientas y su propio modelo.

Un agente se justifica sólo si aporta **al menos una** de estas tres cosas:

| Razón | Qué resuelve | Ejemplo real de este repo |
|---|---|---|
| **Contexto aislado** | Un barrido que inundaría la conversación con archivos que nadie va a volver a leer | recorrer 2.400 archivos para contestar una pregunta |
| **Herramientas restringidas** | Que sea *imposible* hacer daño, no que esté prohibido | un auditor que **no tiene** `Edit` no puede pisar una pestaña |
| **Modelo más barato** | Trabajo mecánico que no necesita criterio caro | leer logs, correr tests, mirar timers |

Si la respuesta es "aporta criterio de dominio" → **eso es una skill**, y hay 42. No se duplica.

Y al revés: los cuatro auditores de acá **no llevan conocimiento de negocio adentro**. Cargan la skill
que corresponda igual que cualquiera. Lo que aportan es la *posición* desde la que miran: afuera del
trabajo, sin poder tocarlo.

---

## El bucle que cubren

El Agent SDK define un solo bucle: **reunir contexto → actuar → verificar**. Los nueve agentes no son
una lista: son las tres etapas cubiertas, y por eso son nueve y no treinta.

| Etapa | Agente | Qué aporta |
|---|---|---|
| **Reunir contexto** | `buscador-de-evidencia` | barre el data room y vuelve con el dato y su fuente, no con los archivos |
| | `centinela-de-produccion` | el estado real: qué corre, con qué hash, qué falló |
| **Actuar** | `ejecutor-de-tarea` | escribe código, en worktree aislado |
| | `mattermost` | escribe el subsistema del chat: bot, asistente, capacidades, ruteo |
| | `mantenedor-flujo-de-fondos` | mantiene el Sheet vivo — corriendo el pipeline, nunca celda por celda |
| **Verificar** | `cazador-de-regresiones` | feedback por **reglas**: tests, typecheck, lint |
| | `qa-visual` | feedback **visual**: el navegador, la captura |
| | `auditor-de-sheet` | feedback **visual** sobre el Sheet: el render y el PDF |
| | `auditor-de-cierre` | un **modelo que juzga** contra los criterios de cierre |

La etapa de verificación tiene cuatro agentes. No es un descuido: en este OS lo que falla no es
escribir código, es dar por terminado algo que no lo está.

**Bash es un vector de escritura, y el inventario no lo muestra.** `mantenedor-flujo-de-fondos`
figura sin `Write` ni `Edit` y sin embargo reescribe pestañas del Sheet real — lo hace corriendo el
pipeline, que ya tiene adentro los candados, las firmas y el snapshot. Es deliberado: una escritura
"a mano" saltearía las tres protecciones a la vez. El alcance de cada agente lo fija su prompt, no
la lista de herramientas.

## Por qué existen estos y no otros

Los cuatro auditores salen de una sola línea del `CLAUDE.md` raíz, la del PRINCIPIO DE CIERRE:

> **NINGÚN TRABAJO LO CIERRA QUIEN LO CONSTRUYÓ.**
> El cierre lo firma quien no escribió el trabajo y probó el sistema vivo intentando romperlo.

Esa regla era, hasta ahora, una intención. No se podía cumplir: el que construía era el mismo que
revisaba, con el mismo contexto y los mismos puntos ciegos. Un agente con contexto propio y sin
permiso de escritura es la primera forma material de cumplirla.

Los tres que actúan existen por lo contrario: son los que **sí** escriben, y por eso llevan grabadas
las trampas que ya costaron trabajo perdido en este repo.

---

## El inventario es automático

Igual que las skills. Una lista escrita a mano en este README moriría en dos semanas — ya pasó con
las skills, que decían "12 total" con 30 en disco.

```bash
node .claude/agents/scripts/inventario-agentes.mjs             # qué hay, con qué herramientas y qué modelo
node .claude/agents/scripts/inventario-agentes.mjs --validar   # exit 1 si alguno está mal declarado
```

---

## Reglas de declaración

Cada agente es **un archivo** `.claude/agents/<nombre>.md` con frontmatter YAML:

```yaml
---
name: auditor-de-cierre          # kebab-case, igual que el archivo
description: Cuándo usarlo…      # esto es lo que decide si se lo llama: escribí el CUÁNDO, no el QUÉ
tools: Read, Grep, Glob, Bash    # mínimo suficiente. Omitirlo hereda TODO — casi nunca es lo que querés
model: opus                      # haiku | sonnet | opus
---
```

Tres cosas que este repo aprendió a la mala y valen para cualquier agente nuevo:

1. **`description` es el criterio de activación, no una etiqueta.** Si dice "audita cosas", nunca se
   va a llamar solo. Tiene que decir cuándo corresponde y cuándo no.
2. **`tools` se declara siempre.** Omitirlo hereda todas las herramientas, incluida `Write`. Un
   auditor con `Write` es un auditor que algún día va a "arreglar" lo que audita.
3. **`model` se elige por costo.** El consumo de API fue la falla número uno de este OS. Leer logs y
   correr tests no necesita el modelo caro; decidir si un módulo está terminado, sí.

---

## Cómo se mejora un agente que no rinde

Del Agent SDK, el diagnóstico según el síntoma — es más útil que reescribirle el prompt a ciegas:

| Síntoma | Qué cambiar |
|---|---|
| Entiende mal la tarea | la `description`: el problema es el criterio de activación, no el prompt |
| Falla siempre en lo mismo | agregar una regla explícita y verificable, no una advertencia más |
| No se corrige solo | le faltan herramientas para intentar otro camino |
| Rinde distinto cada vez | hace falta un set de casos representativos para medirlo, no una impresión |

## Lo que ningún agente de acá hace

- No commitea, no mergea, no pushea, no despliega. Eso lo decide el dueño.
- No escribe en el Sheet real. Ni siquiera el que puede escribir código (ver `ejecutor-de-tarea`).
- No corre migraciones ni toca datos productivos.
- No llama a APIs externas con efecto económico, contractual, fiscal o laboral (Nivel E del
  `CLAUDE.md` raíz: requiere autorización humana explícita).
