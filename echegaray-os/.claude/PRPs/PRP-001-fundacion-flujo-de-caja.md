# PRP-001: Fundación de datos + Flujo de Caja

> **Estado**: EN PROGRESO
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Construir la fundación mínima de datos (Cliente, Obra, Cuenta financiera, Proveedor) y, sobre ella, el módulo de Flujo de Caja capaz de responder las 12 preguntas definidas en el Blueprint TO-BE, corriendo en paralelo con Flujo de Caja - Cash Flow y CONTROL DE GASTOS.xlsx hasta demostrar que representa la realidad correctamente.

## Por Qué

| Problema (AS-IS) | Solución |
|---|---|
| Cobranza duplicada entre Flujo de Caja - Cash Flow y Control de Gastos, sin reconciliar (Gap #2 del AS-IS) | Fuente única de cobros/pagos/cheques, con trazabilidad a Cliente/Obra/Proveedor/Cuenta financiera |
| Obra y Cliente viven como texto libre e inconsistente en 6+ sistemas (Gap #4) | Identidad única de Cliente y Obra, prerequisito de todo el modelo |
| No hay alerta de déficit de caja ni versionado de la proyección | Cálculo de posición semanal/mensual con alertas y comparación contra la proyección anterior |

**Valor de negocio**: elimina el trabajo de reconciliar manualmente dos planillas de caja y da visibilidad temprana de déficit — el cuello de botella de caja identificado en el AS-IS ("hay rentabilidad pero falta caja").

## Qué

### Criterios de éxito (a nivel de todo el PRP, no de un solo incremento)
- [ ] Cliente, Obra, Cuenta financiera y Proveedor existen como entidades con ID único
- [ ] Cobros, pagos, cheques/echeqs y obligaciones recurrentes se registran distinguiendo real vs. proyectado
- [ ] La posición de caja semanal/mensual se calcula y alerta déficit
- [ ] Toda entrada de dinero está ligada a Cliente + Obra; toda salida a Proveedor/Obra/obligación
- [ ] El OS corre en paralelo con las fuentes legacy y las divergencias se pueden explicar

### Comportamiento esperado
Un usuario interno (Rodrigo/administración) puede: dar de alta una Obra ligada a un Cliente, registrar cobros y pagos (reales o proyectados) contra Cuentas financieras y Proveedores, y ver la posición de caja proyectada de la semana/mes, con alerta si hay déficit.

---

## Contexto

### Referencias
- `CLAUDE.md` raíz — estrategia, regla de oro percibido/devengado
- `echegaray-os/CLAUDE.md` — regla de no fabricar estructura de datos sin evidencia, no duplicar
- Blueprint TO-BE (aprobado en esta conversación) — modelo de entidades y Fase 0/1
- Análisis AS-IS (aprobado) — Gaps #2 y #4, mapa de datos
- Skills `discovery-drive-echegaray` y `cash-flow-operativo`

### Arquitectura propuesta (Feature-First)
```
src/features/
├── fundacion/            # Cliente, Obra, Cuenta financiera, Proveedor
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── store/
│   └── types/
└── flujo-caja/           # Cobro, Pago, Cheque, obligaciones, posición
    ├── components/
    ├── hooks/
    ├── services/
    ├── store/
    └── types/
```

### Modelo de datos — Fundación (Incremento 1)
```sql
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  nombre text not null,
  estado text not null default 'activa' check (estado in ('activa', 'pausada', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cuentas_financieras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('banco', 'caja')),
  saldo_inicial numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: sistema interno de una sola empresa, sin roles definidos todavía
-- (echegaray-os/CLAUDE.md: "no hay roles/usuarios internos definidos todavía").
-- Se habilita RLS con acceso completo para cualquier usuario autenticado,
-- no particionado por user_id (no es multi-tenant). Revisar cuando existan roles.
alter table clientes enable row level security;
alter table obras enable row level security;
alter table cuentas_financieras enable row level security;
alter table proveedores enable row level security;
```

Entidades de Flujo de Caja (Cobro, Pago, Cheque, obligaciones recurrentes, posición) se modelan en incrementos posteriores de este mismo PRP, no en el Incremento 1.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada una (bucle agéntico).

### Fase 0 — Fundación de datos
**Objetivo**: Cliente, Obra, Cuenta financiera y Proveedor existen con ID único, tipados de punta a punta (DB → tipos → servicios → UI mínima de alta/listado).
**Validación**: migración aplica sin error contra Postgres real; `tsc`/`build`/`lint` en verde; alta y listado de Obra/Cliente funciona en el navegador (Playwright).

### Fase 1 — Movimientos base de caja (Cobro / Pago)
**Objetivo**: registrar cobros y pagos, reales o proyectados, ligados a Cliente/Obra/Proveedor/Cuenta financiera.
**Validación**: un cobro y un pago de prueba quedan registrados y visibles, con el flag real/proyectado correcto.

### Fase 2 — Cheques y echeqs
**Objetivo**: representar cheques/echeqs emitidos y recibidos como compromisos de pago/cobro diferido.
**Validación**: un cheque de prueba impacta la posición proyectada en la fecha correcta (una vez definido el criterio de fecha de impacto — ver decisión abierta).

### Fase 3 — Obligaciones recurrentes
**Objetivo**: cargar sueldos/jornales (total agregado), cargas sociales, obligaciones fiscales y financieras, gastos operativos, como salidas proyectadas de calendario conocido.
**Validación**: las obligaciones cargadas aparecen en la posición proyectada del período correspondiente.

### Fase 4 — Posición de caja y alertas
**Objetivo**: calcular posición semanal y mensual (saldo inicial + cobros − pagos), alertar déficit, versionar la proyección para comparar contra la semana anterior.
**Validación**: con datos de prueba conocidos, la posición calculada coincide con el cálculo manual esperado; una semana en déficit dispara alerta visible.

### Fase 5 — Reconciliación contra fuentes legacy
**Objetivo**: comparar la posición del OS contra Flujo de Caja - Cash Flow y Control de Gastos para el mismo período real, documentar divergencias.
**Validación**: reporte de comparación generado; toda divergencia queda explicada o registrada como pendiente (no oculta).

### Fase 6 — Validación final
**Objetivo**: sistema funcionando end-to-end, corriendo en paralelo con las fuentes legacy.
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] Playwright confirma los flujos principales
- [ ] Criterios de éxito del PRP cumplidos

---

## 🧠 Aprendizajes (Self-Annealing)

### 2026-07-06: Sin proyecto Supabase live ni Docker disponible
- **Situación**: no hay `.env.local`, no hay proyecto Supabase conectado (`.mcp.json` tiene placeholders), no hay Docker instalado para `supabase start` local.
- **Decisión**: usar Postgres local vía Homebrew (ya instalado y corriendo, `postgresql@16`) para validar que la migración DDL aplica sin error, en una base de datos temporal descartable. Esto valida sintaxis y constraints, **no** valida RLS con `auth.uid()` (eso requiere el esquema `auth` real de Supabase, que no existe en Postgres puro).
- **Aplicar en**: todo incremento futuro que agregue tablas — validar DDL localmente de la misma forma hasta que exista un proyecto Supabase real conectado.
- **Pendiente**: cuando exista un proyecto Supabase real, re-aplicar todas las migraciones ahí y correr `get_advisors(type: "security")` para confirmar RLS efectivo.

### 2026-07-06: `createServerClient` tira una excepción síncrona si faltan las env vars
- **Error**: envolver solo las llamadas a `supabase.from(...).select()/.insert()` en try/catch no alcanza — `createClient()` (que llama a `createServerClient` de `@supabase/ssr`) tira "Your project's URL and Key are required..." de forma síncrona apenas se invoca, antes de llegar a ninguna query. Playwright detectó esto: la página `/fundacion` devolvía 500 en vez del estado "no configurado" que se había diseñado.
- **Fix**: envolver también la creación del cliente (`await createClient()`) en try/catch, tanto en `page.tsx` (función `loadFundacionData`) como en cada Server Action (`createClientOrError` en `actions.ts`).
- **Aplicar en**: cualquier código nuevo que llame a `createClient()` de `@/lib/supabase/server` o `@/lib/supabase/client` sin un proyecto Supabase real conectado — no asumir que solo las queries pueden fallar.

### 2026-07-06: `playwright-cli` (skill) documentaba comandos de CLI que no existen
- **Error**: la skill `playwright-cli` (heredada del template SaaS Factory) documentaba `npx playwright navigate/click/fill/snapshot`, que no son subcomandos reales del CLI de Playwright (confirmado con `npx playwright --help`: los reales son `test`, `codegen`, `screenshot`, `show-report`, etc.).
- **Fix**: se reescribió `.claude/skills/playwright-cli/SKILL.md` para reflejar el flujo real — escribir `tests/*.spec.ts` con `@playwright/test` y correr `npx playwright test`, con `playwright.config.ts` en la raíz del proyecto.
- **Aplicar en**: cualquier PRP futuro que use el skill `playwright-cli` — ya no hace falta redescubrir esto.

---

## Gotchas

- [ ] Postgres local (Homebrew) no tiene el esquema `auth` de Supabase — las políticas RLS se escriben para Supabase pero no se pueden probar end-to-end localmente hasta conectar un proyecto real.
- [ ] `estado` de Obra (`activa/pausada/cerrada`) es un campo mínimo agregado para poder filtrar obras vigentes en el cálculo de caja — no confundir con el modelo completo de ciclo de vida de obra (eso es de fases posteriores, no de Fundación).

## Anti-patrones
- NO fabricar credenciales ni un project-ref de Supabase falso.
- NO simular datos de Cobro/Pago reales — solo datos de prueba explícitamente marcados como tales.
- NO mezclar percibido y devengado en ninguna tabla de este módulo.

---

*PRP en progreso. Fase 0, Incremento 1 en ejecución.*
