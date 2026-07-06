---
name: primer
description: "Cargar contexto completo de Echegaray Business OS al inicio de una conversacion. Lee CLAUDE.md raiz, arquitectura tecnica, memoria y decisiones previas. Activar cuando el agente no tiene contexto del proyecto o el usuario dice: que tenemos, donde estamos, dame contexto, resumeme el proyecto."
allowed-tools: Read, Grep, Glob, Bash
---

# Primer: Contexto de Echegaray Business OS

Este proyecto NO es un SaaS comercial. Es el sistema operativo interno de gestión de Echegaray Construcciones. No hay clientes externos del software, no hay producto que vender, no hay funnel de conversión.

Este skill carga contexto en orden. No te saltees pasos.

---

## Proceso de Contextualización

### 1. Leer el `CLAUDE.md` raíz (obligatorio, primero)

Ubicado un nivel arriba de `echegaray-os/`, en la raíz del repositorio. Ahí está:
- La estrategia y filosofía de negocio de Echegaray Construcciones
- Las capacidades centrales que el sistema debe fortalecer (cotizar, ejecutar, cobrar, aprender)
- Las reglas de oro (P&L devengado vs Cash Flow percibido, no fabricar datos, identificar cuello de botella antes de actuar, etc.)

Ese documento manda sobre cualquier decisión técnica. No lo repitas, pero toda recomendación debe ser consistente con él.

### 2. Leer el `CLAUDE.md` de `echegaray-os/`

Define cómo traducir esa estrategia a decisiones técnicas: stack, arquitectura feature-first, regla de no duplicar sistemas, regla de entender el proceso real antes de construir.

### 3. Entender la arquitectura técnica actual

- `src/app/` — rutas existentes (Next.js App Router)
- `src/features/` — qué dominios de negocio ya tienen carpeta y qué contienen realmente (muchas pueden estar vacías, no asumir que hay funcionalidad solo porque existe la carpeta)
- `src/lib/supabase/` — clientes configurados
- Si hay MCP de Supabase conectado, usar `list_tables` para ver qué tablas existen realmente antes de asumir un modelo de datos

### 4. Revisar memoria y decisiones previas

Leer `.claude/memory/MEMORY.md` y las memorias que indexa (`user/`, `feedback/`, `project/`, `reference/`). Ahí puede estar documentado el cuello de botella actual, decisiones ya tomadas sobre qué construir primero, y feedback de cómo trabajar con el usuario.

### 5. Entregar un resumen breve

```markdown
## Estado de Echegaray Business OS

### Negocio (de CLAUDE.md raíz)
[Cuello de botella actual si está documentado, o "no identificado todavía"]

### Técnico
- Rutas implementadas: ...
- Features con lógica real (no vacías): ...
- Tablas en Supabase: ... (o "ninguna todavía")

### Memoria relevante
[Decisiones o feedback previos relevantes a la tarea de hoy]

## Listo para trabajar
¿En qué ayudo?
```

---

## Qué NO asumir

- No asumir que se está construyendo un producto para vender a terceros.
- No asumir que existe ya un MVP definido: puede que la fase actual sea solo de diagnóstico o adaptación estructural.
- No proponer construir una funcionalidad sin haber pasado por los pasos 1 y 4 de este proceso.
