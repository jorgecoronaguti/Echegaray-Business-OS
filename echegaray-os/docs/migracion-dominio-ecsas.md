# Migración de dominio a ecsas.com.ar — Auditoría e Instructivo

> **Estado:** preparación completa. **No se cambió ningún DNS ni configuración de producción.**
> Los cambios de repo son env-gated (no alteran nada hasta que se define `NEXT_PUBLIC_SITE_URL`).
> Fecha: 2026-07-28.

Destinos objetivo:

| Servicio | Dominio | Dónde corre | Cómo se expone |
|---|---|---|---|
| Business OS (web) | `https://app.ecsas.com.ar` | **Vercel** | CNAME → Vercel (SSL de Vercel) |
| Mattermost | `https://chat.ecsas.com.ar` | VM (Docker) | Cloudflare Tunnel *(PR-2, no ahora)* |
| Communication Service | `https://api.ecsas.com.ar` | VM (futuro) | Cloudflare Tunnel *(PR-3+, no ahora)* |

---

## 1. Auditoría del estado actual (datos reales medidos)

### Vercel
- **Proyecto:** `echegaray-business-os` — ID `prj_z9g8rawBnhOExjj12OST7XFb3xxM`, team `team_vDSURnTraRXncUzKQjzJs0zq`.
- **Root directory del proyecto:** `echegaray-os` (monorepo; la raíz de git es `app/`).
- **Dominio de producción actual:** `echegaray-business-os.vercel.app`.
- **Sin `vercel.json`** en el repo (dominios, redirects y env se administran en el dashboard).

### DNS de ecsas.com.ar (consultado en vivo)
- **Nameservers:** `ns1.donweb.com`, `ns2.donweb.com` → **el DNS lo maneja DonWeb**.
- **Apex `ecsas.com.ar`:** A `200.1.1.1` (IP de parking de DonWeb, sin uso real).
- **Correo (MX):** Google Workspace → `ASPMX.L.GOOGLE.COM` (1), `ALT1` (5), `ALT3` (10). **Crítico: no romper.**
- **TXT:** `v=spf1 include:_spf.google.com ~all` + `google-site-verification=hH7AX3…`.
- **`app` / `chat` / `api`:** no existen todavía → hoja limpia.

### VM
- IP pública: **64.176.22.159**. Exposición actual: túnel Cloudflare *efímero* (se reemplaza en PR-2).

---

## 2. Verificación de compatibilidad (punto 4 del pedido)

| Componente | Compatibilidad | Nota decisiva |
|---|---|---|
| **Vercel** | ✅ | `app` como subdominio se resuelve con un **CNAME** a Vercel. Vercel emite el SSL solo. |
| **SSL** | ✅ | `app` → certificado gestionado por Vercel. `chat`/`api` → Cloudflare (o Let's Encrypt en Opción B). |
| **Cloudflare Tunnel** | ⚠️ **Condicional** | El túnel **exige que la zona `ecsas.com.ar` esté en Cloudflare**. Un CNAME a `cfargotunnel.com` desde DonWeb **no funciona**. → Para usar el túnel en `chat`/`api` hay que **migrar los nameservers a Cloudflare** (Opción A). |
| **Mattermost** | ✅ | Necesita hostname estable + `SiteURL=https://chat.ecsas.com.ar` + **WebSocket (WSS)**. Tanto Cloudflare proxied como un reverse proxy soportan WSS. |
| **Communication Service** | ✅ | Igual que `chat` (futuro, PR-3+). |
| **Correo Google Workspace** | ⚠️ **Riesgo** | Si se migran los nameservers a Cloudflare (Opción A), **hay que replicar MX + SPF + verificación + DKIM/DMARC antes** de cambiar los NS, o el correo se corta. |

### La decisión de fondo (chat/api): **se puede desacoplar en el tiempo**

- **`app.ecsas.com.ar` NO requiere tocar los nameservers.** Un CNAME en DonWeb hacia Vercel alcanza.
  **Riesgo de correo = cero.** → **Se hace ahora.**
- **`chat` y `api` sí obligan a una decisión de topología**, pero **recién en PR-2** (Mattermost no se
  publica todavía; el Communication Service ni existe). Por eso este instructivo deja `app` 100% resuelto
  y `chat`/`api` planteados como decisión de PR-2, sin bloquear la migración de la web.

**Topología recomendada para PR-2 (chat/api):**

- **Opción A — mover la zona a Cloudflare (recomendada, mantiene Cloudflare Tunnel).**
  El *registrador* sigue siendo DonWeb; sólo se cambian los **nameservers** a los de Cloudflare (plan
  gratuito). Requisito previo innegociable: **replicar en Cloudflare TODOS los registros de correo**
  (MX ×3, SPF, `google-site-verification`, y DKIM `google._domainkey` / DMARC si existen) y **verificar
  que el correo sigue** antes de cambiar los NS. Después: `app` = CNAME a Vercel **en gris (DNS only)**,
  `chat`/`api` = túnel Cloudflare (proxied, SSL de Cloudflare).
- **Opción B — quedarse en DonWeb (sin Cloudflare Tunnel).**
  `chat`/`api` = registro **A** en DonWeb → `64.176.22.159` + reverse proxy (Caddy) con Let's Encrypt en
  la VM y puerto 443 abierto. No toca el correo, pero **renuncia al túnel Cloudflare** y expone puertos.

> Recomendación: **A**. Mantiene la arquitectura de túnel que ya venís usando y no abre puertos. Pero se
> ejecuta como paso deliberado de PR-2, con el correo blindado primero. **Decisión pendiente tuya.**

---

## 3. Cambios ya preparados en el repositorio (punto 5)

Todos **env-gated**: sin efecto hasta definir `NEXT_PUBLIC_SITE_URL`. Fallback seguro al dominio actual
de Vercel → nada se rompe antes de que el DNS esté listo.

| Archivo | Cambio |
|---|---|
| `src/lib/site-url.ts` *(nuevo)* | Helper `siteUrl()`: usa `NEXT_PUBLIC_SITE_URL`; si no, `VERCEL_URL` (servidor); si no, el dominio actual de Vercel. |
| `src/app/(main)/descargas/page.tsx` | `VERSION_URL` deja de estar hardcodeada a `vercel.app` → usa `siteUrl()`. |
| `src/features/usuarios/components/OperariosManager.tsx` | El texto de credenciales usa `siteUrl()` (link de acceso canónico). |
| `src/app/layout.tsx` | Agrega `metadataBase: new URL(siteUrl())` (canónico correcto para el dominio nuevo). |
| `src/app/api/os/[...path]/route.ts` | Comentario actualizado: el frente estable es Vercel hoy y `app.ecsas.com.ar` tras la migración. |

**Cómo se activa:** definiendo en Vercel `NEXT_PUBLIC_SITE_URL=https://app.ecsas.com.ar` (paso del
instructivo, **después** de validar el DNS). Validado con `tsc --noEmit` (0 errores).

---

## 4. Instructivo paso a paso — `app.ecsas.com.ar` (hacer AHORA)

### A. En Vercel
1. Proyecto **echegaray-business-os** → **Settings → Domains → Add**.
2. Agregar `app.ecsas.com.ar`.
3. Vercel mostrará el registro DNS exacto a crear. Para un subdominio es un **CNAME** cuyo valor
   normalmente es `cname.vercel-dns.com` (usá el que muestre Vercel si difiere).
4. **Todavía no** definas `NEXT_PUBLIC_SITE_URL` (se hace en el paso D, tras validar).

### B. En DonWeb (Zona DNS de ecsas.com.ar)
Crear **un** registro (no tocar nada más — MX, TXT y NS quedan intactos):

| Tipo | Nombre / Host | Valor | TTL |
|---|---|---|---|
| **CNAME** | `app` (FQDN: `app.ecsas.com.ar`) | `cname.vercel-dns.com.` | `3600` (podés usar `300` durante la migración y subirlo después) |

> No se crea ningún registro para `chat` ni `api` en este paso (son PR-2).
> No se cambian los nameservers. El correo no se toca.

### C. Validar propagación y SSL
```bash
dig +short CNAME app.ecsas.com.ar          # -> cname.vercel-dns.com.
curl -I https://app.ecsas.com.ar/login     # -> 200/307 y certificado válido (emitido por Vercel)
```
En Vercel, el dominio debe pasar a **Valid Configuration** y emitir el certificado (automático).

### D. Activar el dominio como principal en la app
1. Vercel → **Settings → Environment Variables**: agregar
   `NEXT_PUBLIC_SITE_URL = https://app.ecsas.com.ar` (Production).
2. **Redeploy** (para que el valor entre al build).
3. Vercel → **Domains**: marcar `app.ecsas.com.ar` como **Primary** y activar
   *"Redirect echegaray-business-os.vercel.app → app.ecsas.com.ar"* (opcional pero recomendado).

### E. Supabase (login en el dominio nuevo) — no olvidar
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://app.ecsas.com.ar`.
- **Redirect URLs:** agregar `https://app.ecsas.com.ar/**` (mantener también el `.vercel.app` mientras convivan).

> Las cookies de sesión no cruzan de un dominio a otro: al cambiar de dominio los usuarios vuelven a
> loguearse una vez. Es esperable, no es un error.

### F. Extensión de Chrome (nota, no bloqueante)
La extensión llama al proxy `/api/os/*` en el dominio de Vercel (hardcodeado en el `.zip`). Sigue
funcionando porque Vercel sirve ambos dominios. Si más adelante querés que apunte a `app.ecsas.com.ar`,
es un rebuild de la extensión (fuera de alcance de esta migración).

---

## 5. Orden recomendado (resumen)

1. **(Repo)** ✅ ya hecho: cambios env-gated commiteados.
2. **Vercel:** agregar `app.ecsas.com.ar` (paso 4.A).
3. **DonWeb:** crear el CNAME `app` (paso 4.B).
4. **Validar** DNS + SSL (paso 4.C).
5. **Vercel:** setear `NEXT_PUBLIC_SITE_URL` + redeploy + Primary/redirect (paso 4.D).
6. **Supabase:** Site URL + Redirect URLs (paso 4.E).
7. **Validación final** (abajo).
8. **PR-2 (recién después):** decidir Opción A/B para `chat`/`api` y ejecutar.

---

## 6. Validaciones finales (criterio de "dominio listo")

- [ ] `dig +short CNAME app.ecsas.com.ar` → `cname.vercel-dns.com.`
- [ ] `curl -I https://app.ecsas.com.ar/login` → 200/307, certificado válido y vigente.
- [ ] Login real en `https://app.ecsas.com.ar/login` funciona (usuario de prueba).
- [ ] El link de credenciales que genera "Usuarios" muestra `https://app.ecsas.com.ar/login`.
- [ ] `https://app.ecsas.com.ar/descargas` levanta la versión de la extensión (proxy OK).
- [ ] **Correo intacto:** `dig +short MX ecsas.com.ar` sigue devolviendo los `ASPMX…GOOGLE.COM`.
- [ ] `echegaray-business-os.vercel.app` redirige (o al menos sirve) sin romperse.

Cuando todos den OK, el dominio está **completamente configurado y validado** y se puede avanzar a PR-2.

---

## 7. Qué queda explícitamente para PR-2 (no ahora)

- Decisión de topología `chat`/`api` (Opción A: zona a Cloudflare / Opción B: DonWeb + reverse proxy).
- Registros DNS de `chat` y `api` (dependen de esa decisión):
  - **Opción A:** se crean en **Cloudflare** vía `cloudflared tunnel route dns` (CNAME proxied a
    `<uuid>.cfargotunnel.com`); en DonWeb sólo se cambian los **NS** a Cloudflare (previa réplica del correo).
  - **Opción B:** en **DonWeb**, `chat` y `api` = **A** → `64.176.22.159` (TTL 3600) + Caddy/Let's Encrypt + 443.
- Named tunnel estable + `MM_SITE_URL=https://chat.ecsas.com.ar` + cierre del `0.0.0.0:3123`.
