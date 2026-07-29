# Auditoría WEB QA — Módulo Comunicación (Mattermost)

**Rol:** WT-5 WEB QA · **Alcance:** integración web del módulo `/comunicacion` que se publica a `app.ecsas.com.ar` (Vercel).
**Modo:** read-only sobre el código real en `echegaray-os/`. Sin deploy, sin push, sin `npm run dev`.
**Fecha:** 2026-07-29 · **Rama:** `worktree-agent-a755ea9416bf25ad6`

**Veredicto global: OK — sin bloqueos.** El módulo es autocontenido, falla suave y no introduce regresiones. Se puede publicar antes de que `chat.ecsas.com.ar` esté activo.

---

## Resumen ejecutivo

| # | Ítem auditado | Veredicto |
|---|---|---|
| 1 | `/comunicacion` — lectura de URL, fallback, pestaña nueva, iframe opt-in, fail-suave, `any` | **OK** |
| 2 | Navegación — NavLink "Comunicación" → `/comunicacion` | **OK** |
| 3 | `.env.local.example` — documenta ambas envs | **OK** |
| 4 | Dominio canónico — `app.ecsas.com.ar` vía `site-url.ts`, sin hardcode `.vercel.app` en el módulo | **OK** (observación menor sobre el fallback, por diseño) |
| 5 | Comportamiento pre/post activación de chat + regresiones | **OK** |
| 6 | `npm run typecheck` + `npm run lint` | **OK** (0 errores) |

---

## 1. Módulo `/comunicacion` — `src/app/(main)/comunicacion/page.tsx`

- **Lectura de URL:** `const MATTERMOST_URL = process.env.NEXT_PUBLIC_MATTERMOST_URL || 'https://chat.ecsas.com.ar'` (línea 8). Usa `NEXT_PUBLIC_MATTERMOST_URL` con **fallback exacto a `https://chat.ecsas.com.ar`**. OK.
- **Pestaña nueva + seguridad:** el enlace (líneas 34-41) usa `target="_blank"` con `rel="noopener noreferrer"`. Cumple el requisito (`noopener`) y agrega `noreferrer`. OK.
- **Iframe opt-in:** el bloque `<iframe>` (líneas 48-61) está detrás de `MATTERMOST_EMBED`, derivado de `process.env.NEXT_PUBLIC_MATTERMOST_EMBED === 'true'` (línea 14). Default **off**. Correcto: Mattermost bloquea el embebido con `X-Frame-Options`/`frame-ancestors`, y el propio texto de la UI lo explica al usuario (líneas 42-45, 56-59). OK.
- **Falla suave sin env:** no hay throw ni acceso a propiedades de un valor posiblemente indefinido. Si la env no está, aplica el fallback. El helper `hostDe()` (líneas 80-86) envuelve `new URL()` en try/catch y devuelve la string cruda si la URL es inválida, evitando romper el render. La página es `export const dynamic = 'force-dynamic'` (server component) y no depende de datos de Supabase ni de red. OK.
- **`any`:** no hay. Tipos explícitos (`hostDe(url: string): string`). OK.
- **Componente:** es `page.tsx` server-side puro, sin hooks de cliente ni fetch. No puede fallar en runtime por datos faltantes.

**Veredicto: OK.**

## 2. Navegación — `src/app/(main)/layout.tsx`

- Grupo `Comunicación` agregado (líneas 41-44) con `{ href: '/comunicacion', label: 'Comunicación' }`. Renderizado vía `NavLink`. OK.
- Visibilidad por rol: aparece en `GRUPOS_NAV`, que ven `direccion` y los demás roles administrativos. El rol `campo` usa `NAV_CAMPO` (líneas 74-85) y **no** ve Comunicación — coherente con que el chat es para dirección/obras/administración; si más adelante se quiere dar acceso al campo, hay que agregarlo a `NAV_CAMPO`. No es bloqueo, es una decisión de alcance.

**Veredicto: OK.**

## 3. Variables — `.env.local.example`

Documenta ambas envs con bloque propio (líneas 16-22):
- `NEXT_PUBLIC_MATTERMOST_URL=https://chat.ecsas.com.ar`
- `NEXT_PUBLIC_MATTERMOST_EMBED=false`

Con comentarios que explican el propósito y la razón del default `false`. OK.

### Envs exactas a setear en Vercel (producción)

Para el módulo Comunicación, **ambas son opcionales** (el código funciona con los defaults). Setearlas explícitamente es la práctica recomendada para dejar la config visible en el panel:

| Variable | Valor en Vercel (prod) | Obligatoria | Nota |
|---|---|---|---|
| `NEXT_PUBLIC_MATTERMOST_URL` | `https://chat.ecsas.com.ar` | No (default igual) | Setear explícito para trazabilidad. Cambiar solo si el host del chat cambia. |
| `NEXT_PUBLIC_MATTERMOST_EMBED` | `false` (o no setear) | No | Dejar en `false` hasta que el servidor Mattermost habilite el embebido. |

Envs de contexto ya existentes que también deben estar en prod (no son de este módulo pero condicionan el dominio canónico — ítem 4):

| Variable | Valor en Vercel (prod) |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://app.ecsas.com.ar` |

> Recordatorio: al ser `NEXT_PUBLIC_*`, se inyectan en build. Un cambio de valor requiere **redeploy** para tomar efecto en el cliente.

**Veredicto: OK.**

## 4. Dominio canónico — `src/lib/site-url.ts`

- `siteUrl()` resuelve en este orden: `NEXT_PUBLIC_SITE_URL` → `https://${VERCEL_URL}` (solo server) → fallback `https://echegaray-business-os.vercel.app`.
- Con `NEXT_PUBLIC_SITE_URL=https://app.ecsas.com.ar` en Vercel, **toda la app apunta al dominio canónico** sin tocar código. Correcto.
- El único `.vercel.app` hardcodeado es el **fallback de seguridad** `DOMINIO_ACTUAL_VERCEL` (línea 10), por diseño explícito para no romper mientras el DNS de `app.ecsas.com.ar` no esté listo. Se vuelve irrelevante en cuanto la env está seteada. No es hardcode del canónico. Observación menor, no bloqueo.
- **El módulo `/comunicacion` no usa `siteUrl()`** — y está bien: el chat vive en un host distinto (`chat.ecsas.com.ar`), no en el dominio del OS. No hay acoplamiento incorrecto.
- Consumidores de `siteUrl()` verificados: `src/app/layout.tsx` (`metadataBase`), `descargas/page.tsx` (`/api/os/version`), `OperariosManager.tsx` (link de acceso). Todos toman el canónico correcto vía env.
- Nota adicional: `src/app/api/os/[...path]/route.ts` tiene un comentario que menciona `echegaray-business-os.vercel.app` como "front estable" — es solo un comentario, no afecta el ruteo del módulo Comunicación.

**Veredicto: OK.**

## 5. Comportamiento esperado post-deploy

### En `app.ecsas.com.ar/comunicacion` — ANTES de activar Caddy/`chat.ecsas.com.ar`

- La página **carga normalmente**: título "Comunicación", descripción, y la tarjeta "Abrir el chat" mostrando el host `chat.ecsas.com.ar`.
- El botón "Abrir Mattermost ↗" apunta a `https://chat.ecsas.com.ar`. Al clickear, el navegador abre una pestaña nueva que **fallará** (DNS no resuelve / 404 / sin respuesta) hasta que el tunnel/Caddy esté activo. Esto es esperado y no rompe el OS: el fallo ocurre en la pestaña nueva del chat, no en la app.
- El iframe **no se renderiza** (`NEXT_PUBLIC_MATTERMOST_EMBED` en `false`), así que no hay zona en blanco ni error de embebido visible.
- Resto del OS: sin impacto.

### DESPUÉS de activar `chat.ecsas.com.ar`

- El mismo botón abre Mattermost en pestaña nueva y el usuario inicia sesión con su cuenta del equipo. Sin cambios de código ni redeploy (la URL ya apuntaba ahí).

### Regresiones potenciales en el resto del OS

- **Ninguna detectada.** El cambio es aditivo: un `page.tsx` nuevo aislado + un grupo de nav nuevo + un bloque en `.env.example`. No modifica rutas, servicios, tablas ni componentes compartidos existentes.
- `layout.tsx` solo agrega un elemento al array `GRUPOS_NAV`; el render itera el array, no hay índices fijos ni lógica que se rompa.
- No agrega dependencias nuevas ni llamadas a Supabase/red en el server render de la página.

**Veredicto: OK.**

## 6. Typecheck + Lint

```
npm run typecheck  →  tsc --noEmit  →  sin salida = 0 errores. OK.
npm run lint       →  0 errors, 38 warnings.
```

- **0 errores.**
- Las 38 warnings son todas `@typescript-eslint/no-unused-vars` **preexistentes** en `orquestador/scripts/*.mjs` y `src/features/integraciones/components/HerramientasManager.tsx`.
- **Cero warnings** en `comunicacion/page.tsx`, `layout.tsx` o `site-url.ts`. El módulo auditado está limpio.

**Veredicto: OK.**

---

## Conclusión

El módulo Comunicación está listo para publicarse a `app.ecsas.com.ar`. Es autocontenido, falla suave sin envs, no expone `any`, abre el chat en pestaña nueva con `rel="noopener noreferrer"`, mantiene el iframe detrás de una env opt-in en `false`, y no introduce regresiones. Antes de activar `chat.ecsas.com.ar` el usuario ve la tarjeta funcional y el link "muerto" (404) solo en la pestaña del chat; después funciona sin redeploy.

**Acciones recomendadas en Vercel (no bloqueantes):**
1. `NEXT_PUBLIC_SITE_URL=https://app.ecsas.com.ar` (dominio canónico).
2. `NEXT_PUBLIC_MATTERMOST_URL=https://chat.ecsas.com.ar` (explícito, aunque coincide con el default).
3. Dejar `NEXT_PUBLIC_MATTERMOST_EMBED` sin setear o en `false`.
