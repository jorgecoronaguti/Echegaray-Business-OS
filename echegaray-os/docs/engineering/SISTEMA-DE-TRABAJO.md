# El sistema de trabajo

Cómo trabaja Claude Code dentro de este repositorio, y por qué así. Escrito el 2026-08-03 sobre
medición, no sobre opinión: 60 sesiones reales, 167.740 líneas de transcript, 83.783 turnos.

---

## Lo que decía la medición

| Qué se midió | Número |
|---|---|
| Turnos con más de 200k tokens de contexto | **75 %** |
| Turnos con más de 400k | **39 %** |
| Contexto de arranque, antes de escribir una línea (mediana) | **38,3k tokens** |
| De eso, contenido que este repo controla | **~27,7k (72 %)** |
| Lectura de caché acumulada | **28.606 MTok** contra 377 MTok de escritura |
| Llamadas a herramientas | 26.185 Bash · 2.627 Read · **23 Grep** |
| `grep`/`sed` por shell contra la herramienta Grep | **2.011 contra 23** |
| Veces que se leyó entero `interactive-server.mjs` (1.488 líneas) | **385** (≈13,9 MTok) |
| Skills invocadas en 60 sesiones | **59**, sobre 42 disponibles |
| Veces que se cumplió la "REGLA OBLIGATORIA … sin excepción" del CLAUDE.md | **1** |
| Subagentes lanzados | 319 — **308 genéricos**; 6 de los 9 especializados, cero veces |

Dos conclusiones incómodas:

**La primera.** El costo no estaba en tareas grandes. Estaba en arrancar todas las tareas igual —
abrir archivos, barrer el repo, releer documentación — sin distinguir "¿cómo viene la caja?" de
"rediseñá el módulo". El contexto subía y ya no bajaba.

**La segunda, peor.** El `CLAUDE.md` raíz tenía 1.339 líneas y **el 89 % no era una regla
operativa**: filosofía, conocimiento de dominio duplicado de las skills, y ocho contradicciones
internas. Su regla más enfática —activar el orquestador antes de *todo trabajo material*, "sin
excepción"— se cumplió **una vez en 60 sesiones**. No porque se ignorara por capricho: porque
cumplirla costaba entre 14.600 y 41.600 tokens *antes* de leer el archivo a cambiar, y chocaba con
otra regla del mismo archivo que decía que un diff de una línea no se planifica.

Una instrucción que nadie puede cumplir no es una regla: es ruido caro que tapa las que sí importan.

---

## El principio

**Cada regla vive en la capa más barata que pueda hacerla cumplir.**

| Tipo de regla | Dónde vivía | Dónde vive ahora |
|---|---|---|
| Tiene que pasar siempre | prosa en CLAUDE.md | **hook** — determinístico, no opinable |
| Aplica sólo a ciertos archivos | prosa en CLAUDE.md | **`.claude/rules/` con `paths:`** — se carga al tocarlos |
| Procedimiento, a demanda | prosa en CLAUDE.md | **skill** — el cuerpo no cuesta hasta invocarla |
| Conocimiento de dominio | prosa en CLAUDE.md | **skill de dominio** |
| Hechos derivables del repo | prosa en CLAUDE.md | se borran: se leen del repo |
| Filosofía y estrategia | prosa en CLAUDE.md | **`docs/`** — íntegra, a demanda |

---

## Las piezas

### 1. CLAUDE.md mínimo

`CLAUDE.md` raíz: **1.339 → 172 líneas**. `echegaray-os/CLAUDE.md`: **209 → 122**. Bajo las 200
líneas por archivo que recomienda la documentación oficial, donde la adherencia se sostiene.

Nada se borró. La misión y la filosofía están enteras en `docs/MISION.md`; los marcos de negocio
—motor económico, cotización, HH, adicionales, control económico, inversiones, métricas— en
`docs/negocio/CRITERIOS-DE-NEGOCIO.md`. Se leen cuando la pregunta lo pide.

De paso se corrigieron **cuatro rutas rotas**: el CLAUDE.md raíz vive en `app/` y apuntaba a
`.claude/skills/`, `.claude/memory/` y `docs/engineering/`, que están un nivel más abajo. Ninguna
resolvía.

Y la regla del orquestador dejó de ser "sin excepción" para tener un umbral: se activa cuando el
trabajo **decide** algo con efecto económico, contractual, fiscal, laboral o de seguridad, o toca
una fuente de verdad. No se activa para leer código ni para un diff de una oración.

### 2. Reglas atadas a archivos — `.claude/rules/`

El mecanismo que el repo no estaba usando. Una regla con `paths:` **sólo entra al contexto cuando
Claude toca un archivo que matchea**.

| Archivo | Se carga al tocar | Qué contiene |
|---|---|---|
| `sheets.md` | los 28 scripts que escriben el Flujo de Fondos | las trampas de las 6 pérdidas documentadas |
| `codigo.md` | `.mjs`/`.ts`/`.tsx` | convenciones, comandos reales, fuente única |
| `tests.md` | `*.test.*` | el test primero, el español real del dueño |
| `comunicacion.md` | `orquestador/comunicacion/**` | registro de especialistas, voseo, callbacks |
| `migraciones.md` | `supabase/migrations/**` | migración en el repo ≠ aplicada; RLS |
| `web.md` | `src/**` | fuente única, verificar autenticado |

Antes esto era o CLAUDE.md (se pagaba siempre) o nada.

### 3. Clasificador de tareas — `hooks/clasificar-tarea.mjs`

Corre en `UserPromptSubmit`, es una función pura sobre el texto, tarda menos de 20 ms y **no gasta
un token de API**. Clasifica en OPERACIÓN · DESARROLLO · ARQUITECTURA · BUG · REFACTOR ·
MANTENIMIENTO · DOCUMENTACIÓN · INVESTIGACIÓN · OPTIMIZACIÓN, y devuelve el protocolo mínimo de esa
categoría: qué contexto cargar, cómo se verifica, qué trampa aplica.

Cuatro decisiones lo hacen usable:

- **Es humilde.** Si la señal es débil no dice nada. Un protocolo equivocado es peor que ninguno:
  manda a hacer el trabajo de otra categoría con tono de instrucción.
- **Es barato.** El protocolo más largo son ~190 tokens. Uno que inyectara 2k por prompt gastaría
  más de lo que ahorra.
- **Detecta la mezcla.** Dos categorías fuertes a la vez suelen ser dos tareas en un pedido; avisa
  que se separen.
- **Nunca bloquea.** Sale 0 siempre. Un clasificador roto no puede dejar al dueño sin hablar.

Las señales pesan distinto, y ésa es la parte que costó acertar: el sustantivo del dominio **no**
define la categoría. "Caja", "saldo" y "obra" aparecen en pedidos de las nueve. Lo que define
OPERACIÓN es *pedir un número* ("cuánto", "decime", "mostrame"). Sin eso, "arreglá el bug de la
caja" se clasificaba como consulta de negocio.

Está probado contra pedidos reales del dueño copiados de los transcripts —con "q" por "que", "cdo"
por "cuando", sin acentos y con typos— porque un parser probado con español de manual acierta en el
test y falla en la conversación.

### 4. Traspaso entre sesiones — `hooks/estado-sesion.mjs` + `/traspaso`

`SessionStart` inyecta rama, archivos sin commitear y últimos commits **calculados en el momento**,
más el traspaso que dejó la sesión anterior. `SessionEnd` deja el rastro mecánico.

La división importa: **el estado se calcula, lo semántico lo escribo yo**. Un archivo de estado
escrito ayer miente hoy, y un traspaso que miente es peor que ninguno porque se actúa sobre él con
confianza. Si nadie escribió el traspaso, el hook lo dice en vez de rellenar.

Techo: 2.000 caracteres. Por encima se recorta **avisando dónde está el resto** — nunca en silencio.

### 5. Carga incremental

- `permissions.deny` sobre `Read` de `node_modules`, `.next`, `.claude/worktrees` y
  `package-lock.json`: barrer eso deja de ser posible, no sólo desaconsejado.
- Regla explícita de usar Grep/Glob en vez de `grep -rn` por Bash. La salida de shell entra cruda y
  sin tope; la herramienta viene acotada.
- `skillOverrides` apaga tres skills de boilerplate del starter kit del que nació el repo —
  `add-login`, `ai`, `image-generation` — sin uso comprobable: la primera porque el OS ya tiene su
  auth propia, las otras dos porque documentan Vercel AI SDK y OpenRouter, y `OPENROUTER_API_KEY`
  no existe en ninguna parte del código.

---

## El resultado, medido

Lo que se carga en toda sesión, antes de escribir una línea de la tarea:

| | antes | ahora | delta |
|---|---:|---:|---:|
| `CLAUDE.md` raíz | 12.698 tok | 2.327 | **−10.371** |
| `CLAUDE.md` app | 3.105 | 1.514 | −1.591 |
| listado de skills | 5.939 | 5.663 | −276 |
| `MEMORY.md` | 6.079 | 6.079 | 0 |
| **total controlable** | **27.821** | **15.583** | **−12.238 (−44 %)** |

Sobre el arranque mediano real medido (38,3k tokens, que incluye system prompt y herramientas, que
no controlamos): **−32 %**.

Eso es por sesión y antes de contar el segundo efecto, que es mayor y no se puede estimar con
honestidad todavía: lo que no entra al contexto al principio no se re-lee en cada turno posterior.
Con el 75 % de los turnos por encima de 200k, cada token que no entra se deja de pagar decenas de
veces. Cuánto exactamente se sabrá midiendo los transcripts nuevos, no calculándolo acá.

## Lo que se corrigió de paso

Cinco defectos reales que la auditoría destapó y no eran el objetivo:

1. **`npm test` no existía**: devolvía éxito en 0,16 s sin correr nada. Cualquiera que lo usara como
   evidencia estaba mirando una validación que siempre miente. Queda dicho en el CLAUDE.md y en
   `rules/codigo.md`.
2. **La suite excluía 6 archivos de test.** El glob era sólo `orquestador/**`; los tests de
   `.claude/hooks/` y `scripts/` **nunca corrieron**. Son 41 tests que existían y no avisaban nada.
   Ahora el glob los cubre: la suite pasó de 2.308 a 2.349.
3. **El hook de cierre bloqueaba por rojo falso.** Su tope interno era de 300 s y el del hook de
   420 s: una suite lenta moría por el interno, `correr()` devolvía error y el cierre se bloqueaba
   por un test que nunca falló. Ahora 600 s adentro, 900 s afuera.
4. **El hook de cierre validaba el proyecto equivocado en los worktrees.** Buscaba `package.json` en
   la raíz del worktree, donde no está —el proyecto cuelga de `echegaray-os/`— y caía al árbol
   principal, dando por buena la tarea de un agente que ni siquiera había mirado.
5. **`log-tool-usage.sh` era código muerto** documentado en el README como si estuviera activo.
   Nunca corrió: `.claude/logs/` no existía.

Y una causa raíz de desorden: `.claude/worktrees/` sólo estaba excluido en `.git/info/exclude`, que
es **local y no viaja en el clon**. Por eso `git status` nunca los mostró y crecieron a 75 (4,25 GB)
sin que nadie lo notara. Ahora está en el `.gitignore` versionado.

---

## Lo que queda abierto

- **75 worktrees, 4,25 GB.** `scripts/higiene-worktrees.mjs` los inventaria y limpia, con dos
  niveles y sin poder perder trabajo: nunca toca uno con cambios sin commitear y nunca borra una
  rama. **16 tienen trabajo real sin commitear** —uno con un conflicto de merge de hace seis días—
  y ésos necesitan una decisión humana, no un script.
- **134 ramas locales, 121 sin publicar.** Mismo criterio: inventariadas, no tocadas.
- **El backlog está abandonado**: 7 tareas en `EN_EJECUCIÓN` de agentes que murieron hace una
  semana, y 41 backups nunca purgados. Está fuera de git, así que se pudre sin aparecer en
  `git status`.
- **Cinco skills sin gancho de activación** (`financial-engineering`, `lectura-bancaria-impacto-sheet`,
  `carga-gastos-multimedia`, `tesoreria-inversiones-corporativas`, `appsheet-desarrollo`): existen,
  son buenas, y nada las nombra desde un agente ni desde `skill-map.mjs`.
- **`cash-flow-operativo` tiene decisiones marcadas como abiertas que ya se resolvieron** en el
  código. Un modelo podría cargarla y negarse a resolver algo que ya tiene respuesta.
- **La config de producción de Caddy no sale de `main`**, sale de un worktree de release.

---

## Cómo se mide si esto funcionó

El número a mirar es el **contexto del primer turno de una sesión**, que hoy tiene mediana de
38,3k tokens. El script que lo calcula quedó escrito; se vuelve a correr sobre los transcripts
nuevos dentro de unas semanas. Si el arranque no bajó, este sistema no sirvió y hay que decirlo.

El segundo número es la **proporción de turnos por encima de 200k**. Hoy 75 %.

Ninguno de los dos se puede fingir: salen de los transcripts, que los escribe Claude Code, no yo.
