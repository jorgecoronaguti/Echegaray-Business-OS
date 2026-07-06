# Echegaray Business OS — Aplicación Técnica

Aplicación interna de gestión para Echegaray Construcciones. No es un producto que se venda a terceros — es una herramienta de uso interno.

El contexto de negocio, estrategia y reglas de decisión están en el `CLAUDE.md` de la raíz del repositorio (un nivel arriba de esta carpeta). Ese documento manda sobre cualquier decisión técnica tomada acá.

## Estado actual

Esqueleto técnico sin módulos de negocio construidos todavía. `src/app/`, `src/features/` y `src/shared/` existen como estructura, pendientes de contenido real.

## Stack técnico

```yaml
Framework: Next.js (App Router)
UI: React + TypeScript
Estilos: Tailwind CSS
Backend: Supabase (Auth + Postgres + RLS)
Testing: Playwright CLI
```

## Arquitectura Feature-First

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Rutas de autenticación
│   ├── (main)/                # Rutas principales
│   └── layout.tsx
│
├── features/                  # Un dominio de negocio real por carpeta
│   └── [dominio]/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── store/
│
└── shared/                    # Código genuinamente reutilizable entre dominios
    ├── components/
    ├── hooks/
    ├── lib/
    └── types/
```

Cada carpeta de `features/` debe corresponder a un dominio real del negocio (ej. presupuestos, cobranza, horas hombre, adicionales), no a una feature de producto genérico.

## Quick Start

```bash
npm install
cp .env.local.example .env.local
# completar credenciales de Supabase
npm run dev
```

## Comandos

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run typecheck    # Verificación de tipos
npm run lint         # ESLint
```

## Herramientas metodológicas (`.claude/`)

Este proyecto usa Claude Code con un conjunto de skills que ordenan **cómo** se construye, no **qué** se construye (eso lo define el `CLAUDE.md` raíz). Ver detalle completo en [`.claude/README.md`](.claude/README.md).

Resumen:

| Herramienta | Cuándo usarla |
|---|---|
| `primer` | Al empezar una sesión, para cargar contexto completo |
| `prp` | Antes de construir cualquier feature no trivial: planificar objetivo, datos y fases |
| `bucle-agentico` | Para ejecutar una feature ya planificada, fase por fase |
| `supabase` | Para modelar tablas, RLS, migraciones y queries |
| `playwright-cli` | Para QA automatizado navegando la app real |
| `memory-manager` | Para guardar y consultar memoria persistente del proyecto |
| `skill-creator` | Para crear una nueva herramienta de este tipo si hace falta |

Capacidades latentes (existen, sin uso activo por falta de caso de uso justificado): `ai`, `image-generation`, `add-login`, `update-sf`.

## Deploy

Vercel, con las variables de entorno de Supabase configuradas en el dashboard del proyecto.
