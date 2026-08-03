---
paths:
  - "orquestador/**/*.mjs"
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Código

## Convenciones que se verifican solas

- Archivos ≤500 líneas, funciones ≤50. Hoy **25 archivos pasan las 500** — no se agrega al montón.
- `unknown`, nunca `any`. Toda entrada de usuario se valida con Zod.
- RLS habilitada en toda tabla nueva de Supabase. Una tabla sin policy falla en silencio.
- Nunca un secreto en el código.

## Validación — los comandos reales

| Qué | Comando | Tarda |
|---|---|---|
| Núcleo (216 archivos) | `npm run orq:test` | ~37 s |
| Tipos | `npm run typecheck` | ~2 s |
| Lint de un archivo | `npx eslint <archivo>` | ~2 s |

**`npm test` no existe en este repo**: devuelve éxito en 0,16 s sin correr nada. Si lo usás como
evidencia de que algo anda, estás mirando una validación que siempre miente. El comando es
`orq:test`.

## Una fuente por concepto

Un concepto que aparece en más de una cara (web, chat, Claude Code) se define **una vez**, en
Postgres. Si dos features necesitan el mismo dato, se referencia — no se copia. Ya pasó que la web
mostraba obras legacy mientras el chat mostraba las canónicas.

## Antes de agregar una tabla, un flujo o una pantalla

Preguntar qué existe hoy que hace eso y por qué no alcanza. La respuesta va escrita en el commit.
