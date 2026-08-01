# Echegaray Business OS — Instrucciones Técnicas de Desarrollo

Este archivo es **subordinado** al `CLAUDE.md` de la raíz del repositorio.

El `CLAUDE.md` raíz define la estrategia, la filosofía de negocio y las reglas de decisión de Echegaray Construcciones. Ese documento manda. Este archivo no repite esa estrategia ni la contradice — solo traduce ese contexto a decisiones técnicas dentro de `echegaray-os/`.

Si algo acá parece entrar en conflicto con el `CLAUDE.md` raíz, el raíz gana.

---

## Qué es esta carpeta

`echegaray-os/` es la aplicación técnica (Next.js + Supabase) que soporta el sistema de gestión de Echegaray Construcciones. No es un producto SaaS que se vende a terceros. Es una herramienta interna.

No hay usuarios externos, no hay checkout, no hay landing de conversión, no hay onboarding de clientes de producto. Los usuarios son el dueño, jefes de obra y administración.

---

## Regla previa a construir cualquier funcionalidad

Antes de escribir código para un módulo (presupuestos, cobranza, HH, adicionales, lo que sea):

1. **Entender el proceso real hoy.** Cómo se hace ese trabajo actualmente (planilla, papel, memoria de alguien, WhatsApp). No asumir un proceso ideal que no existe.
2. **Identificar las fuentes de datos existentes.** Dónde vive ese dato hoy (Excel, Google Sheets, sistema contable, cuaderno de obra) antes de proponer una tabla nueva en Supabase.
3. **No fabricar estructura de datos sin evidencia.** Si no se conoce el dato real, decirlo explícitamente en vez de inventar un modelo "razonable".

Esto aplica el principio del `CLAUDE.md` raíz: *"No digitalizar caos. No automatizar procesos rotos. No construir software antes de entender el proceso."*

## Regla posterior a construir cualquier funcionalidad

Existía la regla previa (entender el proceso, ubicar las fuentes, no fabricar estructura sin evidencia). Faltaba la de después, y su ausencia costó un módulo cerrado tres veces con un agujero abierto.

Antes de dar por terminado un módulo se corre el proceso de `docs/engineering/AUDITORIA_FINAL_MODULOS.md` y se completa `docs/engineering/DEFINITION_OF_DONE.md` con evidencia, no con casillas. **Ningún módulo lo cierra quien lo construyó.**

## Regla contra la duplicación

No crear una tabla, un flujo o una pantalla que ya exista en otro lado (Google Sheets, sistema contable, otra feature de este mismo proyecto) sin justificación explícita. Si dos features necesitan el mismo dato, ese dato vive en un solo lugar y se referencia — no se copia.

Antes de proponer un sistema nuevo o paralelo, preguntar: **¿qué ya existe que hace esto, y por qué no alcanza?**

---

## Stack técnico (Golden Path)

| Capa | Tecnología |
|------|------------|
| Framework | Next.js (App Router) + React + TypeScript |
| Estilos | Tailwind CSS |
| Backend | Supabase (Auth + Postgres + RLS) |
| Testing | `node --test` para el núcleo (es el runner que produce la evidencia de cierre) · Playwright CLI para el recorrido por navegador |

No hay decisiones de stack pendientes. No se agregan librerías nuevas sin justificación ligada a una necesidad real del negocio.

## Arquitectura Feature-First

```
src/
├── app/                      # Next.js App Router
├── features/                 # Un dominio de negocio por carpeta
│   └── [dominio]/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── store/
└── shared/                    # Código genuinamente reutilizable entre dominios
```

Cada carpeta de `features/` corresponde a un dominio real del negocio (ej. presupuestos, cobranza, HH, adicionales) — no a una feature de producto SaaS.

---

## Herramientas metodológicas disponibles

Estas son herramientas de proceso de desarrollo, no funcionalidades del negocio:

**Regla previa a todas**: la selección de skills para cualquier trabajo material se gobierna por el ORQUESTADOR DE RAZONAMIENTO Y SKILLS (`CLAUDE.md` raíz + `.claude/skills/orquestador-de-razonamiento-y-skills/`). El inventario real se descubre con `python3 .claude/skills/orquestador-de-razonamiento-y-skills/scripts/inventario_skills.py` — la tabla de abajo es orientativa, no exhaustiva.

| Herramienta | Para qué sirve |
|---|---|
| `orquestador-de-razonamiento-y-skills` | Capa meta obligatoria: problema real → dominios → skills → gaps → investigación → integración → ejecución → validación → aprendizaje |
| `prp` | Planificar una feature antes de construirla (objetivo, datos, fases) |
| `bucle-agentico` | Ejecutar una feature aprobada por fases, con contexto real de cada fase |
| `supabase` | Modelar tablas, RLS, migraciones y queries |
| `playwright-cli` | QA automatizado navegando la app real |
| `memory-manager` / `.claude/memory/` | Memoria persistente del proyecto, versionada en git |
| `primer` | Cargar contexto completo al inicio de una sesión |
| `skill-creator` | Crear nuevas herramientas de este tipo si hace falta |
| `discovery-drive-echegaray` | Resolver dudas puntuales sobre Drive usando el conocimiento ya confirmado en los discoveries, sin re-explorar de cero |
| `cash-flow-operativo` | Reglas de negocio del módulo de Flujo de Caja (Fase 1 del Blueprint TO-BE) |
| `google-sheets-business-systems` | Criterio profesional obligatorio antes de leer, auditar o editar cualquier Google Sheet real de negocio (arquitectura, fórmulas, modelado financiero, UX, controles, performance) |
| `arquitectura-integracion-finanzas-obras` | Guardiana de coherencia entre Flujo de Fondos, P&L, Avance de Obras, Supabase y el OS — decide dónde vive cada cálculo económico-financiero y evita que se duplique entre sistemas |

Capacidades latentes (existen, no se usan todavía porque no hay caso de uso justificado):

| Herramienta | Estado |
|---|---|
| `ai` | Solo se activa si se responden las 8 preguntas de IA del `CLAUDE.md` raíz (problema, frecuencia, costo, ROI, etc.) |
| `image-generation` | Sin caso de uso confirmado |

---

## Reglas de código

- KISS / YAGNI / DRY
- Archivos máx. 500 líneas, funciones máx. 50 líneas
- Nunca usar `any` (usar `unknown`)
- Validar toda entrada de usuario con Zod
- RLS habilitado en toda tabla de Supabase
- Nunca exponer secrets en código

## Comandos

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run typecheck     # Verificación de tipos
npm run lint          # ESLint
```

---

# REGLAS DE ORO DEL DESARROLLO

Rigen todo trabajo sobre el OS, igual que las reglas de negocio del `CLAUDE.md` raíz. Salen de las
mejores prácticas de Claude Code y del bucle agéntico del Agent SDK, cruzadas con lo que este repo
ya aprendió a la mala.

**El bucle es: REUNIR CONTEXTO → ACTUAR → VERIFICAR.** Las reglas de abajo son cómo se cierra cada
una de las tres etapas.

## 1. El contexto es el recurso escaso

El rendimiento cae a medida que la ventana se llena. Se administra activamente:

- **`/clear` entre tareas no relacionadas.** La sesión de todo incluido degrada todo lo que sigue.
- **Investigar es trabajo de un subagente**, no de la conversación principal. Un barrido de cientos
  de archivos que después nadie relee es contexto quemado. Ver `.claude/agents/`.
- **Delimitar la investigación.** "Investigá X" sin acotar es exploración infinita.
- **Después de DOS correcciones fallidas sobre el mismo problema, parar.** El contexto ya está
  contaminado de intentos que no funcionaron. `/clear` y reformular incorporando lo aprendido.

## 2. Todo trabajo se hace en un worktree

Nunca sobre el árbol principal del dueño. Él trabaja ahí, tiene cambios sin commitear y una rama en
curso: un `git checkout` o un archivo a medio escribir en ese árbol le pisa el día.

```bash
git worktree add -b <rama> .claude/worktrees/<nombre> <base>
git merge main    # PRIMERO — el worktree nace del commit inicial de la sesión, no de main vivo
```

Dos excepciones, y sólo dos: **la configuración de `.claude/`** (es lo que Claude Code lee de verdad)
y **escribir en el Sheet real** — desde un worktree eso ya borró una pestaña entera, porque la guarda
no encontró la base que esperaba y falló cerrada.

El worktree temporal se elimina al terminar. No se dejan ramas permanentes dando vueltas.

## 3. Explorar → planificar → implementar → confirmar

Saltar a codificar produce código que resuelve el problema equivocado.

Plan mode cuando el cambio toca varios archivos, cuando el código es desconocido o cuando no está
claro el enfoque. **Si el diff se puede describir en una oración, no hay nada que planificar.**

## 4. Toda tarea necesita una verificación EJECUTABLE

Sin algo que devuelva verde o rojo, "parece hecho" es la única señal disponible — y el humano se
convierte en el bucle de verificación.

- **Se muestra la evidencia, no se afirma el éxito**: la salida del test, el comando y lo que
  devolvió, la captura. Es más rápido revisar evidencia que volver a correr todo.
- **Tres formas, de más barata a más fuerte**: reglas (tests, typecheck, lint) · visual (capturas,
  el PDF de la pestaña, la pantalla real) · un modelo que juzga (el `auditor-de-cierre`).
- **La causa raíz, no el síntoma.** Silenciar un error no es arreglarlo.
- Los hooks de `settings.json` son la puerta determinística: lo que tiene que pasar siempre no se
  pide por instrucción, se enforcea con un hook.

## 5. Nadie cierra su propio trabajo

Ya está en el `CLAUDE.md` raíz (PRINCIPIO DE CIERRE) y acá se vuelve operativo: **antes de dar algo
por terminado, lo revisa un subagente con contexto nuevo**, que ve el diff y los criterios pero no
el razonamiento que los produjo.

Advertencia que viene con esto: un revisor al que se le pide encontrar brechas **siempre encuentra
alguna**. Se corrige lo que afecta corrección o requisitos declarados; perseguir cada hallazgo lleva
a sobre-ingeniería — capas de abstracción, código defensivo y tests para casos que no pueden pasar.

## 6. Los pedidos se hacen específicos

Archivo concreto, síntoma concreto, y qué cuenta como "corregido". "Arreglá el login" contra "el
login falla al vencer la sesión, mirá `src/auth/`, escribí primero el test que lo reproduce".
Cuando el patrón ya existe en el repo, se señala el archivo de ejemplo en vez de describirlo.

## 7. Cada capacidad en su lugar

| Capa | Para qué | Se carga |
|---|---|---|
| `CLAUDE.md` | lo que aplica SIEMPRE | cada sesión |
| `.claude/skills/` | conocimiento de dominio y método | bajo demanda |
| `.claude/commands/` | un flujo que se dispara a mano | al invocarlo |
| `.claude/agents/` | contexto aislado, herramientas restringidas, modelo barato | al delegar |
| `.claude/hooks/` | lo que debe pasar sí o sí | automático |

**Este archivo se mantiene corto.** El criterio para cada línea es: *¿causaría un error si la
borro?* Si no, se borra. Un CLAUDE.md inflado hace que se ignoren las reglas que sí importan — y
entonces la regla que faltaba el día que importaba estaba escrita, sólo que perdida en el ruido.

Conocimiento de dominio → skill. Nunca acá.
