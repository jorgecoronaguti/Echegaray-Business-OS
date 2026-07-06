<p align="center">
  <img src="assets/factory-overview.png" alt="SaaS Factory - The Machine that Builds the Machine" width="800"/>
</p>

<p align="center">
  <img src="assets/v4-skill-first.png" alt="SaaS Factory V4 — Skill First: Construir, Inteligencia, Calidad, Evolucion" width="800"/>
</p>

<h1 align="center">SaaS Factory V4</h1>

<p align="center">
  <strong>La maquina que construye la maquina es mas importante que el producto.</strong><br/>
  <em>— Elon Musk</em>
</p>

<p align="center">
  <a href="#que-es-saas-factory">Que Es</a> &bull;
  <a href="#el-golden-path">Tech Stack</a> &bull;
  <a href="#15-skills-tu-caja-de-herramientas">15 Skills</a> &bull;
  <a href="#3-mcps-tus-sentidos">MCPs</a> &bull;
  <a href="#instalacion-2-minutos">Instalacion</a>
</p>

---

## Que es SaaS Factory

La mayoria esta ahi afuera haciendo **"Vibe Coding"**, tirando prompts al azar o atrapados en el infierno del No-Code construyendo telaranas que se rompen cuando las miras feo.

SaaS Factory es la **infraestructura exacta** para que el codigo deje de ser dados al azar y se convierta en un **activo empresarial**. Un sistema donde la IA no "adivina" — ejecuta con **precision industrial**.

<p align="center">
  <img src="assets/header.png" alt="De Artesano a Arquitecto" width="600"/>
</p>

Cuando ejecutas `saas-factory`, copias toda la **infraestructura de la fabrica** al directorio actual. No es un template vacio. Es **production-ready desde el minuto 0**.

```
tu-proyecto/
├── CLAUDE.md                  # Factory OS — Cerebro del agente
├── GEMINI.md                  # Espejo para Gemini
├── .mcp.json                  # 3 MCPs configurados (Next.js, Playwright, Supabase)
├── src/                       # App con Feature-First Architecture
├── .claude/
│   ├── skills/                # 22 skills (V4) — Todo es un Skill
│   ├── memory/                # Memoria persistente por proyecto
│   ├── PRPs/                  # Blueprints de features
│   └── design-systems/        # 5 sistemas de diseno
└── package.json               # Next.js 16, React 19, Tailwind 3.4
```

---

## V4: Todo es un Skill

V4 unifica commands, agents y prompts en un solo concepto: **Skills**.

```
V3: commands/ + agents/ + prompts/ (3 dirs, fragmentado)
V4: skills/ (1 dir, 22 skills unificados con YAML metadata)
```

El usuario habla en lenguaje natural. El agente decide que skill activar:

```
"Quiero crear una app" → skill NEW-APP (entrevista de negocio)
"Necesito una landing" → skill LANDING (scroll-stop cinematico)
"Quiero agregar IA"    → skill AI (11 templates: chat, RAG, vision, tools...)
"Optimiza este skill"  → skill AUTORESEARCH (loop autonomo de mejora)
```

---

## 22 Skills: Tu Caja de Herramientas

### Skills que el usuario invoca

| Skill | Que hace |
|-------|---------|
| `/new-app` | Entrevista de negocio → genera `BUSINESS_LOGIC.md` con la especificacion completa |
| `/landing` | Landing cinematica estilo Apple: scroll-driven video + copy AIDA/PAS + glass-morphism |
| `/primer` | Carga contexto del proyecto al inicio de sesion |
| `/add-login` | Auth completo con Supabase (Email + Google OAuth + profiles + RLS) |
| `/ai [template]` | 11 templates de IA: chat, RAG, vision, tools, web search, structured outputs |
| `/prp [feature]` | Genera Product Requirements Proposal antes de implementar |
| `/bucle-agentico` | Implementa features complejas por fases coordinadas (DB + API + UI) |
| `/sprint` | Tareas rapidas sin planificacion (un fix, un componente, algo simple) |
| `/qa` | Testing automatizado con Playwright CLI |
| `/memory-manager` | Memoria persistente POR PROYECTO en `.claude/memory/` (reemplaza auto-memory) |
| `/image-generation` | Genera y edita imagenes con OpenRouter + Gemini |
| `/autoresearch` | Auto-optimiza skills con loop autonomo (patron Karpathy) |
| `/skill-creator` | Crea nuevos skills para extender la fabrica |
| `/eject-sf` | Remueve SaaS Factory del proyecto (destructivo) |
| `/update-sf` | Actualiza a la ultima version |

### Skills que el agente activa automaticamente

| Skill | Se activa cuando... |
|-------|---------------------|
| `frontend` | UI/UX, componentes React, Tailwind, animaciones |
| `backend` | Server Actions, APIs, logica de negocio, validaciones Zod |
| `supabase-admin` | Migraciones, RLS, queries SQL, configurar auth |
| `codebase-analyst` | Analisis de patrones, convenciones, arquitectura |
| `vercel-deployer` | Deploy, env vars, dominios, rollbacks |
| `documentacion` | Actualizar docs despues de cambios en codigo |
| `calidad` | Testing, quality gates, validacion |

---

## Memoria Persistente por Proyecto

SaaS Factory V4 incluye un sistema de memoria que vive **dentro del repo**, no en tu maquina:

```
.claude/memory/
├── MEMORY.md       # Indice (se carga automaticamente)
├── user/           # Preferencias del usuario/equipo
├── feedback/       # Correcciones (que hacer/no hacer)
├── project/        # Decisiones y estado de iniciativas
└── reference/      # Patrones, soluciones, donde encontrar cosas
```

**vs Auto-memory de Claude Code:**

| | Auto-memory (default) | Memory Manager (V4) |
|-|---|---|
| **Ubicacion** | `~/.claude/projects/` (local) | `.claude/memory/` (en el repo) |
| **Viaja con git** | No | Si |
| **Versionado** | No | Si (cada cambio es un commit) |
| **Compartido con equipo** | No | Si |
| **Control** | Claude decide | Tu decides |

La primera vez que se usa, el skill deshabilita automaticamente la auto-memory de Claude Code y crea la estructura.

---

## El Golden Path

> *"Pueden tener el coche del color que quieran, siempre que sea negro."* — Henry Ford

Un solo stack perfeccionado. Sin opciones. Solo el camino dorado:

| Capa | Tecnologia | Por Que |
|------|------------|---------|
| **Frontend** | Next.js 16 + React 19 + TypeScript | Full-stack, Turbopack |
| **Estilos** | Tailwind CSS 3.4 + shadcn/ui | Utility-first, sin context switching |
| **Backend** | Supabase (Auth + DB + Storage + RLS) | PostgreSQL completo sin servidor |
| **AI Engine** | Vercel AI SDK v5 + OpenRouter (300+ modelos) | Multi-model, sin vendor lock-in |
| **Validacion** | Zod | Type-safe schemas |
| **Estado** | Zustand | Lightweight client state |
| **Testing** | Playwright MCP | Validacion visual automatica |
| **Deploy** | Vercel | Un click a produccion |

---

## 3 MCPs: Tus Sentidos

```typescript
// next.config.ts — Esta linea lo cambia todo
experimental: { mcpServer: true }
```

| MCP | Rol | Superpoder |
|-----|-----|------------|
| **Next.js DevTools** | Quality Control | Lee errores/logs en tiempo real via `/_next/mcp` |
| **Playwright** | Ojos | Captura screenshots, valida UX visualmente |
| **Supabase** | Manos | Ejecuta SQL, migraciones, consulta logs |

**Sin MCPs:** La IA adivina que esta roto.
**Con MCPs:** La IA **ve** exactamente que esta roto y por que.

---

## Arquitectura Feature-First

Todo el contexto de una feature en un solo lugar:

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Rutas de autenticacion
│   └── (main)/               # Rutas principales
│
├── features/                  # Organizadas por funcionalidad
│   └── [feature]/
│       ├── components/       # UI de la feature
│       ├── hooks/            # Logica
│       ├── services/         # API calls
│       ├── types/            # Tipos
│       └── store/            # Estado
│
└── shared/                    # Codigo reutilizable
    ├── components/
    ├── hooks/
    ├── lib/
    └── types/
```

---

## 5 Design Systems

| Sistema | Vibe |
|---------|------|
| **Neobrutalism** | Bordes duros, colores primarios, sombras offset |
| **Neumorphism** | Soft UI con sombras suaves |
| **Liquid Glass** | Glassmorphism con efectos liquidos |
| **Gradient Mesh** | Gradientes mesh complejos |
| **Bento Grid** | Layout de grids asimetricos |

---

## Instalacion (2 minutos)

### 1. Clona el repositorio
```bash
git clone https://github.com/saas-factory-community/saas-factory-setup.git
cd saas-factory-setup
```

### 2. Abre en Claude Code
```bash
claude .
```

### 3. Pide que configure el alias
```
Configura el alias "saas-factory" en mi terminal
```

Claude Code detecta tu sistema (zsh/bash) y configura todo automaticamente.

---

## De 0 a Produccion

### 1. Crear proyecto
```bash
mkdir mi-saas && cd mi-saas
saas-factory
```

### 2. Instalar y configurar
```bash
npm install
cp .env.local.example .env.local  # Agrega credenciales de Supabase
```

### 3. Prender el MCP
```bash
npm run dev
# Output: - MCP Server: http://localhost:3000/_next/mcp
```

### 4. Conectar Claude Code
```bash
claude .  # En otra terminal
```

### 5. Definir el negocio
```
/new-app
```

Responde las preguntas. El agente genera `BUSINESS_LOGIC.md`.

### 6. Construir
```
Implementa las features segun BUSINESS_LOGIC.md
```

La IA usa los MCPs para ver errores en tiempo real mientras construye.

---

## Auto-Blindaje

Cada error refuerza la fabrica. El mismo error NUNCA ocurre dos veces.

```
Error ocurre → Se arregla → Se DOCUMENTA → NUNCA ocurre de nuevo
```

Con el **Memory Manager**, los errores y patrones descubiertos se guardan en `.claude/memory/` y viajan con el proyecto. Tu fabrica se hace mas inteligente con cada sesion.

---

## FAQ

**Por que solo Next.js?**
Hace el 100% del trabajo para el 95% de los SaaS B2B. No necesitas Python ni backends separados.

**Puedo personalizar?**
Si. Todo esta disenado para ser extendido. `CLAUDE.md` es tu punto de entrada. Crea nuevos skills con `/skill-creator`.

**Como actualizo?**
```
/update-sf
```

**Como remuevo SaaS Factory?**
```
/eject-sf
```
Te deja con un proyecto Next.js limpio y funcional.

---

## Documentacion

| Archivo | Descripcion |
|---------|-------------|
| `saas-factory/CLAUDE.md` | Factory OS — Cerebro del agente (decision tree + skills) |
| `saas-factory/GEMINI.md` | Espejo para Gemini |
| `saas-factory/.claude/skills/SKILLS_README.md` | Inventario completo de 22 skills |
| `saas-factory/.claude/skills/ai/references/` | 11 AI Templates (chat, RAG, vision, tools...) |
| `saas-factory/.claude/PRPs/` | Sistema de Blueprints |
| `saas-factory/.claude/design-systems/` | 5 sistemas de diseno |
| `saas-factory/.claude/memory/` | Memoria persistente del proyecto |

---

<p align="center">
  <strong>SaaS Factory V4</strong> — Todo es un Skill. Agent-First. 22 skills. Memoria persistente.<br/>
  De la idea a produccion en minutos, no en meses.
</p>
