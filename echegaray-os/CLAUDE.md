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
