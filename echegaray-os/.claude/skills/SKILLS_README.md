# Sistema de Skills — Echegaray Business OS

> Herramientas metodológicas de desarrollo. No son funcionalidades del negocio.

---

## Inventario real de skills (12 total)

Este inventario refleja únicamente lo que existe en disco después de la limpieza de herencia SaaS Factory. Cualquier skill mencionada en otro documento y que no esté en esta lista no existe.

### Activas

| Skill | Comando | Qué hace |
|---|---|---|
| `primer` | `/primer` | Carga contexto completo del proyecto (negocio + técnico + memoria) al inicio de sesión |
| `prp` | `/prp [feature]` | Genera un plan (Product Requirements Proposal) antes de construir una feature no trivial |
| `bucle-agentico` | — | Ejecuta una feature ya planificada, por fases, con mapeo de contexto real |
| `supabase` | — | Modela tablas, RLS, migraciones, queries y métricas |
| `playwright-cli` | — | QA automatizado navegando la app real |
| `memory-manager` | — | Memoria persistente del proyecto en `.claude/memory/` |
| `skill-creator` | `/skill-creator` | Crea una nueva skill si hace falta una herramienta de este tipo |
| `discovery-drive-echegaray` | — | Resume el conocimiento ya confirmado de Drive (sistemas, duplicaciones, obsoletos) para resolver dudas puntuales sin re-explorar |
| `cash-flow-operativo` | — | Reglas de negocio del Flujo de Caja: percibido vs. devengado, real vs. proyectado, vínculo Cliente/Obra/Proveedor, decisiones abiertas |

### Latentes (se conservan, sin caso de uso activo)

| Skill | Estado |
|---|---|
| `ai` | Requiere justificar con las 8 preguntas de IA del `CLAUDE.md` raíz antes de usarse |
| `image-generation` | Sin caso de uso confirmado |
| `add-login` | Construiría auth real; sin roles/usuarios internos definidos todavía |

---

## Estructura de un Skill

```
skill-name/
├── SKILL.md              # Requerido: frontmatter YAML + instrucciones
├── scripts/               # Opcional: codigo ejecutable (.py, .sh, .js)
├── references/            # Opcional: docs de referencia (>5k palabras)
└── assets/                # Opcional: templates, imagenes, fonts
```

### Frontmatter YAML

```yaml
---
name: skill-name                    # Identificador (lowercase, hyphens, max 64 chars)
description: Que hace               # Claude usa esto para decidir cuando activarlo
argument-hint: "[argumento]"        # Hint en autocomplete (opcional)
user-invocable: false               # Solo Claude puede invocarlo (opcional)
disable-model-invocation: true      # Solo el usuario puede invocarlo (opcional)
allowed-tools: Read, Write, Bash    # Tools permitidos sin pedir permiso (opcional)
model: claude-sonnet-4-6            # Modelo especifico (opcional)
context: fork                       # Ejecuta en subagent aislado (opcional)
agent: Explore                      # Tipo de agente (opcional)
---
```

### Variables de Sustitucion

| Variable | Descripcion |
|----------|-------------|
| `$ARGUMENTS` | Todos los argumentos del usuario |
| `$ARGUMENTS[N]` o `$N` | Argumento por indice (0-based) |
| `${CLAUDE_SESSION_ID}` | ID de sesion actual |
| `${CLAUDE_SKILL_DIR}` | Directorio del skill |
| `` !`comando` `` | Inyeccion de contexto dinamico (ejecuta shell) |

### Progressive Disclosure

1. **Metadata** (~100 palabras) - Siempre en contexto (frontmatter)
2. **SKILL.md** (<5k palabras) - Cuando se activa
3. **Resources** (unlimited) - Bajo demanda (scripts/, references/, assets/)

---

## Memoria Persistente (.claude/memory/)

Sistema de memoria persistente POR PROYECTO, versionado en git.

**Como funciona:**
- `.claude/memory/MEMORY.md` es el indice (max 200 lineas, se carga automaticamente)
- Carpetas por tipo: `user/`, `feedback/`, `project/`, `reference/`
- Git-versioned: cada cambio es un commit que puedes revertir
- El skill `memory-manager` gestiona cuando consultar y cuando guardar

---

## Recursos Compartidos

| Recurso | Path | Usado por |
|---------|------|-----------|
| PRP Template | `.claude/PRPs/prp-base.md` | Skill `prp` |
| AI Templates | `.claude/skills/ai/references/` | Skill `ai` (latente) |

---

## Crear un Nuevo Skill

```bash
# Opcion 1: Usar skill-creator
/skill-creator

# Opcion 2: Manual
mkdir .claude/skills/mi-skill
# Crear SKILL.md con frontmatter + instrucciones
```

### Checklist

- [ ] SKILL.md con YAML frontmatter valido (name + description)
- [ ] Contenido <5k palabras, forma imperativa
- [ ] Scripts con --help y manejo de errores
- [ ] References para docs >5k palabras
- [ ] Descripcion clara de cuando usarlo
