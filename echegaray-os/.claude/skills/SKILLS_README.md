# Sistema de Skills — Echegaray Business OS

> Herramientas metodológicas de desarrollo. No son funcionalidades del negocio.

---

## Inventario de skills — AUTOMÁTICO, no manual

**Este README no mantiene una lista de skills.** La lista manual anterior quedó obsoleta (decía "12 total" con 30+ en disco) — evidencia de que las listas manuales mueren. La fuente de verdad es el descubrimiento automático:

```bash
python3 .claude/skills/orquestador-de-razonamiento-y-skills/scripts/inventario_skills.py            # inventario completo
python3 .claude/skills/orquestador-de-razonamiento-y-skills/scripts/inventario_skills.py --validar  # exit 1 si hay errores estructurales
```

El script escanea el filesystem, extrae frontmatter, deriva última modificación desde git y valida la estructura según `metadata.type`:

| `metadata.type` | Qué es | Validación extra |
|---|---|---|
| `expert-domain` | Conocimiento profesional de un dominio (ingeniería, contabilidad, laboral…) | Secciones obligatorias: Propósito, Alcance, Interacción con otras skills, Límites de certeza, Prohibido |
| `technical` | Capacidad técnica (supabase, playwright, web/UX…) | — |
| `methodology` | Método de trabajo del proyecto (prp, bucle-agentico, primer, memoria…) | — |
| `meta-orchestration` | El orquestador — gobierna a todas las demás | — |

Toda skill nueva declara su `metadata.type`. La activación de skills se gobierna desde el `CLAUDE.md` raíz (sección ORQUESTADOR DE RAZONAMIENTO Y SKILLS) y `.claude/skills/orquestador-de-razonamiento-y-skills/`.

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
