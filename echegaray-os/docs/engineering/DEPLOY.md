# Despliegue en Vercel — qué se sube, cuándo y cuánto ocupa

## El proyecto

| | |
|---|---|
| Proyecto | `echegaray-business-os` (`prj_z9g8rawBnhOExjj12OST7XFb3xxM`) |
| **Root Directory** | **`echegaray-os`** — está en `.vercel/repo.json`, en la raíz del repo |
| Región | `gru1` (São Paulo) |
| Configuración | `echegaray-os/vercel.json` |

El Root Directory manda: **todo lo que Vercel corre —`buildCommand`, `installCommand`,
`ignoreCommand`— tiene el cwd en `echegaray-os/`, no en la raíz del repo.** Las rutas de
`scripts/vercel-ignorar-build.sh` son relativas a eso. Lo que vive fuera de `echegaray-os/` (el
`docs/` y el `.claude/` de la raíz) es invisible para el build, y por eso nunca dispara un
despliegue.

## Por qué se llenó el Function Storage

Vercel avisó el 08/09 que el equipo gratuito iba por el 75 % de los 10 GB de **Function Storage**.
Ese espacio lo ocupa el bundle de funciones serverless de **cada despliegue retenido**, no el último.
Con un bundle de ~73 MB, 10 GB son unos 137 despliegues; el 08/09 entraron 101 commits a `main`.

Dos palancas, las dos aplicadas:

### 1. Menos despliegues — `ignoreCommand`

`vercel.json` corre `scripts/vercel-ignorar-build.sh` antes de construir. **Contrato de Vercel: salir
0 salta el build, salir 1 lo construye.** El script mira el diff `HEAD^..HEAD` y salta sólo si TODO
lo que cambió cae en rutas que no llegan al navegador: `tests/`, `qa-shots/`, `docs/`, `.claude/`,
`supabase/`, `*.md`, `*.test.*`, `*.spec.ts`, `*.log`, la config de Playwright y la de ESLint.

Está escrito como **lista de lo que NO importa**, no de lo que sí. Una lista blanca falla en
silencio y hacia el lado peligroso: el día que aparezca un `middleware.ts` o una carpeta nueva no
estaría en la lista, el cambio real no se desplegaría y nadie se enteraría. Acá lo desconocido
siempre construye.

`orquestador/` **no** está excluido, aunque parezca backend puro: 23 archivos de `src/` importan
`orquestador/lib` y `orquestador/comunicacion`, y ésos importan `../engines/`, `../handlers/` y
`../../scripts/`. Un cambio ahí sí cambia el bundle.

Medido sobre los 104 commits de first-parent del 08–09/09 en `main`: **26 se saltan, 78 construyen
(25 % menos despliegues).**

**Límite conocido:** el script compara contra `HEAD^`, que es el commit anterior, no el último
efectivamente desplegado. Si un `push` lleva varios commits y el último sólo toca tests, el
despliegue se salta y los cambios de código de ese mismo push esperan al push siguiente (no se
pierden: el build siempre sale del HEAD, que los contiene). Con el flujo de este repo —una rama por
tarea, merge a `main`, push— `HEAD^` es el commit desplegado anterior y el caso no aparece. Vercel no
expone el SHA del despliegue previo sin token, así que no hay forma de cerrarlo desde acá.

Verificación: `node --test scripts/vercel-ignorar-build.test.mjs`.

### 2. Funciones más chicas — `outputFileTracingExcludes`

Medido sobre las trazas del build (`.next/server/**/*.nft.json`, que es exactamente el conjunto de
archivos que Vercel sube): **85,6 MB, y 73,3 MB los arrastraba una sola ruta,
`/portal/recibo/[id]`.**

La causa no es esa ruta: importa `orquestador/lib/config.mjs`, que calcula
`APP_DIR = resolve(HERE, '..', '..')` y lee `.env.local` de ahí. El trazador de Next no puede saber
qué archivo de ese directorio hace falta, así que se lleva el directorio entero — capturas de QA de
1,7 MB cada una, 395 migraciones `.sql`, 1.266 archivos de test, la documentación.

`next.config.ts` los excluye con `outputFileTracingExcludes`. Los patrones van con `**/` adelante
porque la raíz de trazado no es la misma en Vercel que en un worktree local.

Para volver a medir:

```bash
NEXT_TURBOPACK_ROOT=/home/jorge/echegaray-os/app npm run build
du -sb .next/server
```

### 3. Borrar los despliegues ya retenidos (lo hace el dueño)

**Esto no se puede hacer desde la VM: no hay token de Vercel.** Las dos palancas de arriba frenan el
crecimiento, pero no liberan lo ya ocupado. En el dashboard:

1. **vercel.com** → equipo → proyecto **echegaray-business-os** → pestaña **Deployments**.
2. Filtrar por **Environment: Preview** (y por **Status: Error / Canceled**). Esos no sirven para
   nada: no son la producción viva ni el rollback.
3. En cada uno, el menú **⋯** → **Delete**. Se pueden seleccionar de a varios con la casilla.
   **No borrar el que dice `Current` / Production**, ni el anterior de producción: ése es el
   rollback.
4. **Settings → General → Deployment Retention** (Vercel lo ofrece según el plan; en Hobby puede no
   estar). Si aparece: poner la retención más corta que el plan permita para *Preview* y
   *Canceled/Errored*, dejando Production más larga.
5. **Settings → Git → Ignored Build Step**: tiene que quedar en *"Automatic"* o vacío. Si ahí hay un
   comando cargado a mano, **pisa** el `ignoreCommand` de `vercel.json` y esto no sirve de nada.

`vercel.json` **no** tiene ninguna clave de retención de despliegues: la retención es una opción del
proyecto/plan, no del archivo. Lo único que el archivo puede hacer es evitar que se creen, que es la
palanca 1.
