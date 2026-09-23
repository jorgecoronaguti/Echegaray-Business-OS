# Echegaray Business OS — Aplicación Técnica

Aplicación interna de gestión para Echegaray Construcciones. No es un producto que se venda a terceros — es una herramienta de uso interno.

El contexto de negocio, estrategia y reglas de decisión están en el `CLAUDE.md` de la raíz del repositorio (un nivel arriba de esta carpeta). Ese documento manda sobre cualquier decisión técnica tomada acá.

## Estado actual

En producción en **app.ecsas.com.ar**, con la empresa operando encima. Medido el 23/09/2026:

- **26 dominios de negocio** en `src/features/` — entre ellos `obras`, `clientes`, `administracion`
  (personal y liquidación), `compras` vía `administracion`, `efectivo` (efectivo a rendir),
  `herramientas`, `flujo-caja`, `analiticas`, `presupuestos`, `portal` (cliente) y `xsas` (el LLM).
- **506 archivos de test** con `node --test`, que son la evidencia de cierre (`npm run orq:test`).
- **El orquestador** (`orquestador/`): 504 scripts, el bot de Mattermost, el circuito de comprobantes
  (lectura, ARCA, duplicados, freno de mano) y los generadores del Sheet de Flujo de Fondos.
- **27 timers de systemd** en la VM: Flujo de Caja, sincronizaciones, vigilancia y respaldos.
- **Postgres (Supabase) es la fuente de verdad** de lo que consumen varias caras; el Sheet sigue siendo
  la verdad de Compras, Cobranzas, CAJA y Cheques, que se escriben con freno de mano.

**Dónde vive cada cosa, para no recorrer 400 módulos: `.claude/MAPA.md`.** Dice qué archivo toca cada
tipo de tarea, la fuente de verdad de cada concepto, los comandos y las trampas ya pagadas.

## Stack técnico

```yaml
Framework: Next.js (App Router)
UI: React + TypeScript
Estilos: Tailwind CSS
Backend: Supabase (Auth + Postgres + RLS)
Testing: node --test (evidencia de cierre) + Playwright (navegador)
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
