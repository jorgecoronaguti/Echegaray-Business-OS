# Echegaray Business OS — cómo se trabaja acá

Subordinado al `CLAUDE.md` de la raíz. Si algo parece contradecirlo, gana el raíz.

`echegaray-os/` es la aplicación (Next.js + Supabase) del sistema de gestión interno. No es un SaaS:
no hay usuarios externos, checkout, landing ni onboarding. Los usuarios son el dueño, jefes de obra
y administración.

---

## El bucle

**REUNIR CONTEXTO → ACTUAR → VERIFICAR.** Todo lo de abajo es cómo se cierra cada etapa.

### 1. El contexto es el recurso escaso

Medido sobre 60 sesiones de este repo: el 75% de los turnos corrió con más de 200k tokens y el 39%
con más de 400k. Eso —no el tamaño de las tareas— es el gasto.

- **`/clear` entre tareas no relacionadas.** La sesión de todo incluido degrada todo lo que sigue.
- **Antes de abrir un archivo: ¿es estrictamente necesario?** Si no, no se abre. Leer un archivo de
  1.500 líneas para cambiar una función cuesta 36k tokens y se queda en la ventana todo el resto de
  la sesión. Leer el tramo, no el archivo.
- **Usar las herramientas Grep y Glob, no `grep -rn` por Bash.** La salida de shell entra cruda y
  sin tope. En el historial hay 2.011 greps por shell contra 23 con la herramienta.
- **Investigar es trabajo de un subagente**, no de la conversación principal. Delimitar qué se
  busca y qué cuenta como respuesta.
- **Después de DOS correcciones fallidas sobre el mismo problema, parar.** El contexto ya está
  contaminado. `/clear` y reformular con lo aprendido.
- **Antes de cerrar con trabajo a medio hacer: `/traspaso`.** La sesión siguiente lo recibe sola.

**Lo medido el 25/08/2026, cuando el consumo semanal llegó al 100%:**

- **La salida de los tests era el gasto \#1.** `npm run orq:test` imprimía una línea por cada uno de
  los 9.365 tests: ~800.000 caracteres ≈ **228.000 tokens por corrida**, y en una jornada se corre
  ocho o diez veces. Ahora usa `--test-reporter=dot`: la misma corrida son ~2.600 tokens, **86× menos**,
  y los fallos siguen saliendo enteros con su stack y su diff. Para ver los ✔ uno por uno existe
  `npm run orq:test:detalle`, que casi nunca hace falta.
- **La misma regla vale para toda salida de shell.** `build`, `eslint`, `tsc` y cualquier script
  hablador van a un archivo y se lee el final: `> /tmp/.../x.log 2>&1; tail -20 x.log`. Una salida
  cruda entra al contexto entera y se queda ahí el resto de la sesión.
- **Ninguna skill se carga "por las dudas".** Las 44 suman 163.650 tokens; sus `description` ya están
  en el contexto y alcanzan para elegir. El `orquestador-de-razonamiento-y-skills` (5.180 tokens) es
  un meta-cargador que arrastra otras en cascada: se carga la skill que hace falta, directamente y por
  su nombre, o ninguna. Portar una pantalla, arreglar un test o refactorizar no lleva ninguna.
- **Un subagente cuesta entre 150.000 y 380.000 tokens.** Medido sobre los once de esa jornada. Se
  lanza cuando aporta **paralelismo o aislamiento real** —frentes que avanzan a la vez, un worktree
  propio, un contexto que no conviene mezclar—, no para tareas que la conversación principal resuelve
  en tres herramientas. Un agente para algo que se hace con dos `grep` cuesta cien veces más que los
  dos `grep`.
- **Checkpoint commiteado en cada etapa.** Un agente que cae con trabajo sin commitear obliga a
  reconstruir su contexto entero para retomar. Ese día cayeron seis a la vez y ninguno había
  commiteado.

### 2. Todo trabajo de código se hace en un worktree

Nunca sobre el árbol principal: el dueño trabaja ahí.

```bash
git worktree add -b <rama> .claude/worktrees/<nombre> <base>   # desde app/, no desde acá
git merge main    # PRIMERO — el worktree nace del commit inicial de la sesión, no de main vivo
```

Dos excepciones y sólo dos: **la configuración de `.claude/`** (es lo que Claude Code lee de verdad)
y **escribir en el Sheet real** — desde un worktree eso ya borró una pestaña entera.

El worktree se elimina al terminar. Inventario y limpieza: `node scripts/higiene-worktrees.mjs`.

### 3. Explorar → planificar → implementar → confirmar

Plan mode cuando el cambio toca varios archivos, el código es desconocido, o no está claro el
enfoque. **Si el diff se puede describir en una oración, no hay nada que planificar.**

### 4. Toda tarea necesita una verificación EJECUTABLE

Sin algo que devuelva verde o rojo, "parece hecho" es la única señal — y el humano se convierte en
el bucle de verificación.

- **Se muestra la evidencia, no se afirma el éxito**: el comando, su salida, la captura.
- **De más barata a más fuerte**: reglas (tests, typecheck, lint) · visual (capturas, el PDF de la
  pestaña) · un modelo que juzga (`auditor-de-cierre`).
- **La causa raíz, no el síntoma.** Silenciar un error no es arreglarlo.

### 5. Nadie cierra su propio trabajo

Antes de dar algo por terminado lo revisa un subagente con contexto nuevo, que ve el diff y los
criterios pero no el razonamiento que los produjo. Proceso completo en
`docs/engineering/AUDITORIA_FINAL_MODULOS.md` y `docs/engineering/DEFINITION_OF_DONE.md`; las
trampas ya pagadas, en `docs/engineering/LECCIONES_APRENDIDAS_ASISTENCIA.md`.

Advertencia: un revisor al que se le pide encontrar brechas siempre encuentra alguna. Se corrige lo
que afecta corrección o requisitos declarados. Lo que se descarta, se descarta **por escrito** — no
en silencio, porque ahí es donde se cuela el agujero.

### 6. Los pedidos se hacen específicos

Archivo concreto, síntoma concreto, y qué cuenta como corregido. Cuando el patrón ya existe en el
repo, se señala el archivo de ejemplo en vez de describirlo.

---

## Stack y comandos

| Capa | Tecnología |
|------|------------|
| Framework | Next.js (App Router) + React + TypeScript |
| Estilos | Tailwind CSS |
| Backend | Supabase (Auth + Postgres + RLS) |
| Testing | `node --test` — es el runner que produce la evidencia de cierre · Playwright para navegador |

```bash
npm run orq:test     # 216 archivos de test, ~37 s   ← la evidencia de cierre
npm run typecheck    # ~2 s
npm run lint         # ~33 s (eslint .)
npm run dev / build
```

**`npm test` no existe**: devuelve éxito en 0,16 s sin correr nada. Nunca es evidencia.

## Arquitectura

```
src/app/          Next.js App Router
src/features/     un dominio de negocio por carpeta (components/hooks/services/types/store)
src/shared/       lo genuinamente reutilizable entre dominios
orquestador/      el núcleo: lib/, scripts/, comunicacion/, engines/, handlers/
supabase/         migraciones
```

Cada carpeta de `features/` es un dominio real del negocio, no una feature de producto.

## Reglas atadas a archivos

No están acá: se cargan solas al tocar los archivos que gobiernan.
`.claude/rules/` → `sheets.md` · `codigo.md` · `tests.md` · `comunicacion.md` · `migraciones.md` ·
`web.md`.

## Herramientas

`.claude/agents/` (9, con su README) para delegar · `.claude/skills/` para conocimiento y método ·
`.claude/hooks/` para lo que debe pasar siempre · `/backlog` para coordinar tareas paralelas ·
`/traspaso` para cerrar la sesión.

<!-- Este archivo se mantiene bajo 200 líneas. Criterio por línea: ¿causaría un error si la borro?
     Si no, se borra o se va a rules/, a una skill o a docs/. -->
