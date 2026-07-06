# Echegaray Business OS — Herramientas de Desarrollo (`.claude/`)

> Fuente de verdad de las herramientas metodológicas de este proyecto.

Este proyecto se originó como un fork del template "SaaS Factory". Fue adaptado para dejar de ser una fábrica de SaaS genéricos y convertirse en la base técnica de **Echegaray Business OS**, el sistema de gestión interno de Echegaray Construcciones. Las herramientas de producto SaaS (pagos, emails masivos, PWA, landing de conversión, entrevista de negocio genérica, eject) fueron eliminadas. Lo que queda es el chasis técnico y el método de trabajo.

---

## Contexto de negocio

El `CLAUDE.md` de la raíz del repositorio (un nivel arriba de `echegaray-os/`) define la estrategia, filosofía y reglas de decisión del negocio. Manda sobre cualquier cosa descrita acá.

El `CLAUDE.md` de `echegaray-os/` traduce ese contexto a reglas técnicas: stack, arquitectura, y la obligación de entender el proceso real antes de construir cualquier módulo.

## Stack técnico

```yaml
Framework: Next.js (App Router) + TypeScript
Styling: Tailwind CSS
Backend: Supabase (Auth + Postgres + RLS)
Testing: Playwright CLI
```

## Arquitectura Feature-First

```
src/
├── app/                      # Next.js App Router
├── features/                  # Un dominio de negocio real por carpeta
│   └── [dominio]/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── store/
└── shared/                    # Código reutilizable entre dominios
```

---

## Skills activas

Herramientas de proceso que se usan de forma directa hoy:

| Skill | Comando | Qué hace |
|---|---|---|
| `primer` | `/primer` | Carga contexto completo del proyecto (negocio + técnico + memoria) al inicio de sesión |
| `prp` | `/prp [feature]` | Genera un plan (Product Requirements Proposal) antes de construir cualquier feature no trivial |
| `bucle-agentico` | — | Ejecuta una feature ya planificada, por fases, con mapeo de contexto real en cada una |
| `supabase` | — | Modela tablas, RLS, migraciones, queries y métricas |
| `playwright-cli` | — | QA automatizado navegando la app real |
| `memory-manager` | — | Memoria persistente del proyecto en `.claude/memory/`, versionada en git |
| `skill-creator` | `/skill-creator` | Crea una nueva skill si hace falta una herramienta de este tipo |

## Capacidades latentes

Skills que se conservan porque el chasis técnico es reutilizable, pero sin caso de uso confirmado en Echegaray Construcciones todavía. No activarlas sin justificación explícita:

| Skill | Por qué está latente |
|---|---|
| `ai` | Solo se justifica si se responden las 8 preguntas de IA del `CLAUDE.md` raíz (qué problema resuelve, frecuencia, costo, ROI, etc.) |
| `image-generation` | Sin caso de uso confirmado |
| `add-login` | Construiría un módulo de autenticación real; no hay roles/usuarios internos definidos todavía |

## PRPs (Product Requirements Proposals)

`PRPs/prp-base.md` es la plantilla de planificación: objetivo, por qué, modelo de datos, fases, gotchas. Se usa antes de construir cualquier feature con la skill `prp`.

## Memoria persistente (`.claude/memory/`)

- `.claude/memory/MEMORY.md` es el índice (máx. 200 líneas, se carga automáticamente)
- Carpetas por tipo: `user/`, `feedback/`, `project/`, `reference/`
- Versionada en git, compartida con quien trabaje en el repo

## Hooks

`hooks/log-tool-usage.sh` — registra cada uso de herramienta en `.claude/logs/tool-usage.log` para auditoría/debug.

## MCPs (`.mcp.json`)

Configurados: `next-devtools`, `playwright`, `supabase`. Opcionales adicionales documentados en `example.mcp.json` (brave-search, firecrawl, n8n, firebase, etc.) — se agregan solo si un caso de uso concreto lo justifica.

## Google Drive / Sheets / Docs (discovery)

El acceso de lectura y búsqueda a Google Drive (Sheets, Docs, PDFs, estructura de carpetas) **no se configura en este repositorio**. Se usa el conector nativo de Google Workspace de Claude (cuenta/organización, en Settings → Connectors de Claude), no un servidor MCP local declarado en `.mcp.json`.

Esto es intencional:

- Cero credenciales, tokens o client secrets de Google en el repo — no hay nada que gitignorear porque no hay ningún archivo de configuración local para esto.
- El conector es gestionado por Anthropic; no depende de un paquete npm/PyPI de terceros que haya que auditar o mantener actualizado.
- Alcance de esta primera etapa: exclusivamente descubrimiento (buscar, listar, leer). No se usan las capacidades de escritura que el conector también expone (crear/copiar archivos) hasta que exista una razón de negocio explícita para eso.

Si en el futuro se necesita un control de acceso más estricto (solo-lectura garantizado a nivel de scope OAuth, no solo por convención), la alternativa evaluada y descartada por ahora es un servidor MCP self-hosted como `taylorwilsdon/google_workspace_mcp` en modo `--read-only`, declarado en `.mcp.json` con credenciales propias del proyecto (nunca commiteadas).

## Estructura de `.claude/`

```
.claude/
├── memory/                    # Memoria persistente del proyecto
│   ├── MEMORY.md
│   ├── user/
│   ├── feedback/
│   ├── project/
│   └── reference/
│
├── skills/
│   ├── primer/
│   ├── prp/
│   ├── bucle-agentico/
│   ├── supabase/
│   ├── playwright-cli/
│   ├── memory-manager/
│   ├── skill-creator/
│   ├── ai/                    # latente
│   ├── image-generation/      # latente
│   └── add-login/             # latente
│
├── PRPs/
│   └── prp-base.md
│
├── hooks/
│   └── log-tool-usage.sh
│
├── .mcp.json
└── example.mcp.json
```
