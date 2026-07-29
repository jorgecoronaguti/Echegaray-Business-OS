# Recomendaciones de seguridad — Mattermost producción (WT-1 Hardening)

Auditoría **read-only** del Mattermost ya productivo de Echegaray. Este documento **solo recomienda**:
no aplica ningún cambio. Todo cambio con efecto sobre producción lo autoriza el dueño.

- **Instancia auditada:** Mattermost Team Edition **11.8.4**, Docker (`echegaray-mm-app`, loopback `127.0.0.1:8065`),
  Postgres aislado (`echegaray-mm-db`), reverse proxy **Caddy** (`echegaray-mm-caddy`, 80/443, TLS Let's Encrypt para `chat.ecsas.com.ar`).
- **Fecha auditoría:** 2026-07-29.
- **Método:** `mmctl --local config show --json` sobre el contenedor vivo + `curl -I` real contra `https://chat.ecsas.com.ar/`
  (resuelto a loopback) + lectura de `config.patch.json`, `Caddyfile`, `docker-compose.yml`.
- **Config declarativa de referencia:** `infra/mattermost/bootstrap/config.patch.json` y `infra/mattermost/caddy/Caddyfile`.

> **Nota de edición.** Es **Team Edition** (gratuita). Dos endurecimientos habituales están **gated a Enterprise** y por lo tanto
> **no son accionables** hoy aunque figuren en el config: `EnforceMultifactorAuthentication` (forzar MFA) y
> `SessionIdleTimeoutInMinutes` (logout por inactividad). Se documentan igual pero marcados como *no aplicable en Team Edition*.

## Resumen ejecutivo

- **CRÍTICO que amerite acción inmediata: ninguno.** TLS está forzado (redirect 308 HTTP→HTTPS), el registro abierto está apagado,
  la base no se expone, no hay CORS abierto ni conexiones salientes inseguras. La base es sólida.
- **Top 3 (severidad ALTA), todos en instancia pública de Internet:**
  1. **Sin HSTS** — Caddy no envía `Strict-Transport-Security`. *(quick-win)*
  2. **Rate limiting desactivado** — `RateLimitSettings.Enable=false`: login público sin freno a fuerza bruta.
  3. **MFA no disponible** — `EnableMultifactorAuthentication=false`: ningún usuario puede activar 2FA. *(quick-win)*
- **Dato a decidir por el dueño (privacidad):** el push móvil usa el **servidor de prueba público** de Mattermost
  (`push-test.mattermost.com`), no apto para producción. Ver ítem 8.

Convención de severidad: **crítico** (explotable ahora, daño alto) · **alto** · **medio** · **bajo**.
"Quick-win" = bajo riesgo de romper algo, alto beneficio, reversible.
"Rompe con updates" = si un `docker compose pull`/upgrade de imagen puede revertir o chocar con el cambio.

---

## 1. HSTS (Strict-Transport-Security) — FALTA

| Campo | Detalle |
|---|---|
| **Estado actual** | `curl -I https://chat.ecsas.com.ar/` **no** devuelve `Strict-Transport-Security`. El `Caddyfile` solo tiene `reverse_proxy mattermost:8065` + `encode gzip`, sin bloque `header`. |
| **Gap vs recomendado** | La doc oficial de Mattermost recomienda fijar HSTS **en el proxy** (`add_header Strict-Transport-Security max-age=15768000;`). Detrás de un reverse proxy, el HSTS interno de Mattermost (`ServiceSettings.TLSStrictTransport=false`) **no aplica** — lo debe poner Caddy. Sin HSTS, un primer request por HTTP o un MITM permite *SSL-strip* / downgrade. |
| **Cambio recomendado (EXACTO)** | En `infra/mattermost/caddy/Caddyfile`, dentro del bloque del sitio: `header Strict-Transport-Security "max-age=31536000"` |
| **Severidad** | **Alto** |
| **Quick-win** | **Sí.** TLS ya funciona y el cert se auto-renueva; agregar el header no cambia el flujo. |
| **Rompe con updates** | No (vive en el Caddyfile del repo, no en la imagen). |

> **Cuidado con `includeSubDomains` / `preload`.** El dominio de correo/organización es `ecsas.com.ar`. Un HSTS con
> `includeSubDomains` en `chat.ecsas.com.ar` **no** afecta a otros subdominios de `ecsas.com.ar` (el header solo cubre el host que lo emite),
> pero **`preload` sí es peligroso**: envía el dominio a la lista precargada de los navegadores y es difícil de revertir.
> **Recomendación: empezar sin `includeSubDomains` ni `preload`**, como está escrito arriba. Subir a `includeSubDomains` solo si se decide
> que todo lo que cuelgue de `chat.ecsas.com.ar` será siempre HTTPS, y nunca activar `preload` sin una decisión explícita del dueño.

Fuente: Mattermost — *Set up an NGINX proxy* (config recomendada con `add_header Strict-Transport-Security max-age=15768000;`).

---

## 2. Rate limiting — DESACTIVADO

| Campo | Detalle |
|---|---|
| **Estado actual** | `RateLimitSettings.Enable=false`. También: `PerSec=10`, `MaxBurst=100`, `VaryByRemoteAddr=true`, `VaryByUser=false`, `VaryByHeader=""`. Caddy tampoco limita. |
| **Gap vs recomendado** | Instancia pública con login por email/usuario y sin freno. Mattermost trae limitador propio; la doc recomienda limitar tráfico abusivo (fuerza bruta a `/api/v4/users/login`, scraping de API). |
| **Cambio recomendado (EXACTO)** | En `config.patch.json`, agregar bloque `RateLimitSettings`: `{"Enable": true, "PerSec": 10, "MaxBurst": 100, "VaryByRemoteAddr": false, "VaryByHeader": "X-Forwarded-For"}` |
| **Severidad** | **Alto** |
| **Quick-win** | **Parcial** — el beneficio es alto pero exige entender el punto del proxy (abajo). No aplicar a ciegas. |
| **Rompe con updates** | No. |

> **Punto crítico del reverse proxy.** Detrás de Caddy, **todo** el tráfico llega a Mattermost desde la IP interna de Caddy.
> Si se activa el rate limit con `VaryByRemoteAddr=true` (el default actual), Mattermost mete a **todos los usuarios en un mismo balde**
> por la IP de Caddy → o no limita a nadie útilmente, o **bloquea a todos juntos**. Por eso el cambio recomendado pone
> `VaryByRemoteAddr=false` + `VaryByHeader="X-Forwarded-For"` (Caddy setea `X-Forwarded-For` con la IP real del cliente por defecto).
> Requiere además que Mattermost confíe en ese header. **Alternativa igualmente válida y más simple de razonar:** limitar en Caddy
> (directiva `rate_limit`) y dejar el de Mattermost apagado. **No activar `RateLimitSettings.Enable=true` sin ajustar `VaryBy*`** o se
> arriesga un lockout general.

Fuente: Mattermost — *Environment configuration settings* (Rate limiting / *Trusted proxy IP header*: mantener el default cuando NO hay proxy; con proxy hay que apuntar al header del IP real).

---

## 3. MFA — NO DISPONIBLE

| Campo | Detalle |
|---|---|
| **Estado actual** | `EnableMultifactorAuthentication=false` y `EnforceMultifactorAuthentication=false`. Ningún usuario puede siquiera activar 2FA. |
| **Gap vs recomendado** | Instancia expuesta a Internet sin segundo factor. En Team Edition, **habilitar** MFA (self-service, opt-in por usuario) **sí está disponible** desde v5.8. **Forzar** MFA es Enterprise (no accionable). |
| **Cambio recomendado (EXACTO)** | En `config.patch.json`, `ServiceSettings`: `"EnableMultifactorAuthentication": true`. Luego, operativamente, pedir a Dirección/Admin que activen 2FA en su perfil. |
| **Severidad** | **Alto** |
| **Quick-win** | **Sí.** Habilitar solo *ofrece* MFA; no fuerza ni rompe logins existentes. |
| **Rompe con updates** | No. |

> `EnforceMultifactorAuthentication` (obligar a todos) es **Enterprise** → no aplicable en Team Edition. La política de "todos con 2FA"
> se sostiene por procedimiento, no por config, mientras sea Team Edition.

Fuente: Mattermost — *Multi-factor authentication* (MFA disponible en Team Edition; enforcement es Enterprise).

---

## 4. Duración de sesión larga + idle timeout inefectivo

| Campo | Detalle |
|---|---|
| **Estado actual** | `SessionLengthWebInHours=720` (30 días), `SessionLengthMobileInHours=8760` (**365 días**), `SessionLengthSSOInHours=720`, `ExtendSessionLengthWithActivity=true` (sesión rodante: se renueva con actividad). `SessionIdleTimeoutInMinutes=43200` pero **es Enterprise → no se aplica**. |
| **Gap vs recomendado** | Un token web robado vive hasta 30 días de inactividad (rodante); el móvil hasta un año. Para una empresa chica sin logout por inactividad disponible, la única palanca es acortar la vida de sesión. |
| **Cambio recomendado (EXACTO)** | En `config.patch.json`, `ServiceSettings`: `"SessionLengthWebInHours": 168` (7 días) y evaluar `"SessionLengthMobileInHours": 720` (30 días) balanceando UX del push móvil. |
| **Severidad** | **Medio** |
| **Quick-win** | Parcial — bajar la web es de bajo riesgo (a lo sumo re-login más seguido); bajar la móvil molesta la UX del celular. Decidir con el dueño. |
| **Rompe con updates** | No. |

> `SessionIdleTimeoutInMinutes` (logout por inactividad) es **Enterprise** → dejar documentado que **no** protege hoy, para no
> asumir falsamente que hay auto-logout.

---

## 5. Verificación de email desactivada

| Campo | Detalle |
|---|---|
| **Estado actual** | `EmailSettings.RequireEmailVerification=false`. Mitigado por `TeamSettings.EnableOpenServer=false` (sin auto-registro): los usuarios entran por invitación/alta de admin. `EnableUserCreation=true`. |
| **Gap vs recomendado** | Con registro abierto apagado el riesgo baja mucho, pero verificar el email evita altas con correos tipeados mal o suplantados por invitación. |
| **Cambio recomendado (EXACTO)** | `config.patch.json` → `EmailSettings`: `"RequireEmailVerification": true` (requiere SMTP configurado y funcionando; si no hay SMTP, no activar o quedan usuarios sin poder verificar). |
| **Severidad** | **Bajo-Medio** |
| **Quick-win** | No — depende de tener SMTP operativo. Verificar antes. |
| **Rompe con updates** | No. |

---

## 6. EnableLocalMode = true (por diseño)

| Campo | Detalle |
|---|---|
| **Estado actual** | `ServiceSettings.EnableLocalMode=true`. Lo activa el compose para el **healthcheck** (`mmctl --local system status`) y la administración local, ya que la imagen es distroless. El socket local es **interno del contenedor**, no publicado al host ni a la red. |
| **Gap vs recomendado** | Local Mode da administración **sin autenticación** a quien pueda `docker exec` dentro del contenedor. No es superficie de red, pero amplía lo que consigue quien ya comprometió el host/daemon Docker. |
| **Cambio recomendado** | **Mantener** (es la base del healthcheck y del bootstrap declarativo). Compensar endureciendo el acceso al host y al socket de Docker. No es un cambio de config, es una nota de riesgo aceptado. |
| **Severidad** | **Bajo** (aceptable / by design) |
| **Quick-win** | N/A |
| **Rompe con updates** | N/A |

---

## 7. Privacidad: email y nombre completo visibles

| Campo | Detalle |
|---|---|
| **Estado actual** | `PrivacySettings.ShowEmailAddress=true`, `PrivacySettings.ShowFullName=true`. |
| **Gap vs recomendado** | En un equipo interno chico es lo esperable y facilita reconocer a la gente. Solo revisar si en algún momento entran externos/invitados al workspace. |
| **Cambio recomendado (EXACTO)** | Sin cambio hoy. Si entran externos: `config.patch.json` → `PrivacySettings`: `"ShowEmailAddress": false`. |
| **Severidad** | **Bajo** |
| **Quick-win** | N/A (decisión de política, no de seguridad urgente) |
| **Rompe con updates** | No. |

---

## 8. Push móvil apunta al servidor de PRUEBA público

| Campo | Detalle |
|---|---|
| **Estado actual** | `EmailSettings.SendPushNotifications=true`, `PushNotificationServer=https://push-test.mattermost.com`, `PushNotificationContents=generic`. |
| **Gap vs recomendado** | `push-test.mattermost.com` es el **servidor de prueba público** de Mattermost: rate-limited y explícitamente **no soportado para producción**. Aunque `generic` evita mandar el contenido del mensaje, la **metadata** (que un usuario tiene notificación) transita por un tercero fuera del control de Echegaray. |
| **Cambio recomendado (EXACTO)** | Decisión del dueño entre: (a) autohospedar el *mattermost-push-proxy* y apuntar `PushNotificationServer` ahí; (b) usar HPNS oficial (requiere plan pago); (c) aceptar formalmente el uso del test server sabiendo que es no-soportado y mantener `PushNotificationContents=generic`. Ya hay contexto en `infra/mattermost/bootstrap/PUSH-MOVIL.md`. |
| **Severidad** | **Medio** (privacidad / dependencia de un servicio no-soportado) |
| **Quick-win** | No (requiere infra o decisión de plan). |
| **Rompe con updates** | No. |

---

## 9. Plugins: marketplace on, firma no requerida

| Campo | Detalle |
|---|---|
| **Estado actual** | `PluginSettings.Enable=true`, `EnableMarketplace=true`, `RequirePluginSignature=false`, **`EnableUploads=false`** (bien: no se pueden subir plugins arbitrarios por la UI). |
| **Gap vs recomendado** | Con uploads apagado el vector principal está cerrado. Queda que un admin instale desde el marketplace sin exigir firma. |
| **Cambio recomendado (EXACTO)** | Opcional: `config.patch.json` → `PluginSettings`: `"RequirePluginSignature": true` **y/o** `"EnableMarketplace": false` si no se planea instalar plugins. *(Exigir firma puede impedir instalar plugins no firmados del marketplace — evaluar antes.)* |
| **Severidad** | **Bajo-Medio** |
| **Quick-win** | Parcial (puede limitar instalaciones legítimas; decidir según si se usan plugins). |
| **Rompe con updates** | No. |

---

## 10. Headers HTTP presentes (estado) y Permissions-Policy vacío

Respuesta real de `https://chat.ecsas.com.ar/` (servidos **por Mattermost**, no por Caddy):

| Header | Valor observado | Lectura |
|---|---|---|
| `content-security-policy` | `frame-ancestors 'self' ; script-src 'self'` | OK (anti-clickjacking + anti-XSS de scripts) |
| `x-frame-options` | `SAMEORIGIN` | OK |
| `x-content-type-options` | `nosniff` | OK |
| `referrer-policy` | `no-referrer` | OK |
| `permissions-policy` | *(presente pero vacío)* | Mejorable: sin política, no restringe cámara/mic/geoloc. |
| `strict-transport-security` | **ausente** | Ver ítem 1 (el gap principal). |

| Campo | Detalle |
|---|---|
| **Cambio recomendado (EXACTO)** | Opcional, en el `header` del `Caddyfile` (junto a HSTS): `header Permissions-Policy "camera=(), microphone=(), geolocation=()"`. |
| **Severidad** | **Bajo** |
| **Quick-win** | Sí (bajo impacto). |
| **Rompe con updates** | No. |

> Los headers buenos ya vienen de Mattermost. Caddy hoy no agrega **ni pisa** nada. Si se agrega un bloque `header` en Caddy, tener
> presente que Caddy **añade** (no reemplaza salvo que se use la sintaxis de reemplazo), así que no duplicar los que MM ya manda.

---

## 11. Cookies de sesión

| Campo | Detalle |
|---|---|
| **Estado actual** | No se pudo capturar `Set-Cookie` sin un login válido, pero por config: `SiteURL=https://chat.ecsas.com.ar` ⇒ Mattermost marca la cookie de auth como **Secure** automáticamente; el token de auth es **HttpOnly**; SameSite por defecto **Lax**. `ServiceSettings.AllowCookiesForSubdomains=false` (bien: la cookie no se comparte con otros subdominios de `ecsas.com.ar`). |
| **Gap vs recomendado** | Config correcta. Solo queda pendiente de verificación empírica un `Set-Cookie` real en un login para confirmar los flags en vivo. |
| **Cambio recomendado** | Sin cambio. Verificación sugerida (read-only) tras un login real: inspeccionar `Set-Cookie` de `MMAUTHTOKEN` (esperar `Secure; HttpOnly`) y `MMCSRF`. |
| **Severidad** | **Bajo** (informativo) |

---

## 12. Config que YA está bien (no tocar)

Reconocer lo correcto evita "arreglar" lo que no está roto:

- `TeamSettings.EnableOpenServer=false` — sin auto-registro público. **Bien.**
- `ServiceSettings.EnableInsecureOutgoingConnections=false` — no acepta TLS inválido saliente. **Bien.**
- `ServiceSettings.EnableUserAccessTokens=false` — sin tokens de acceso personales. **Bien.**
- `ServiceSettings.CorsAllowCredentials=false` y `AllowCorsFrom=""` — CORS cerrado. **Bien.**
- `ServiceSettings.EnableAPITeamDeletion / EnableAPIUserDeletion / EnableAPIChannelDeletion=false` — sin borrado vía API. **Bien.**
- `ServiceSettings.EnableDeveloper=false` y `LogSettings.EnableDiagnostics=false` — sin modo dev ni telemetría. **Bien.**
- `FileSettings.EnablePublicLink=false` — sin enlaces públicos a archivos. **Bien.**
- `GuestAccountsSettings.Enable=false` — sin cuentas de invitado. **Bien.**
- `PasswordSettings` — mínimo 10 + mayús/minús/número. Sólida (símbolo opcional apagado, aceptable). **Bien.**
- Redirect HTTP→HTTPS `308` activo, base Postgres sin puertos publicados, `no-new-privileges` en los tres contenedores, límites de CPU/mem. **Bien.**

---

## Plan sugerido de aplicación (cuando el dueño autorice — NO ejecutado aquí)

| Orden | Cambio | Dónde | Riesgo | Requiere validar |
|---|---|---|---|---|
| 1 | HSTS `max-age=31536000` (sin includeSubDomains/preload) | `Caddyfile` | Bajo | `curl -I` muestra el header; sitio sigue cargando |
| 2 | `EnableMultifactorAuthentication: true` | `config.patch.json` | Bajo | Usuarios pueden activar 2FA; logins actuales intactos |
| 3 | `Permissions-Policy` | `Caddyfile` | Bajo | `curl -I` |
| 4 | `SessionLengthWebInHours: 168` | `config.patch.json` | Bajo | Re-login tras 7 días de inactividad |
| 5 | Rate limiting con `VaryByHeader=X-Forwarded-For` **o** `rate_limit` en Caddy | `config.patch.json` / `Caddyfile` | **Medio** (riesgo lockout si se hace mal) | Probar login desde 2 IPs distintas; confirmar que no bloquea a todos |
| 6 | Decisión push (self-host proxy / HPNS / aceptar test) | infra | — | Decisión de negocio |
| 7 | `RequireEmailVerification: true` | `config.patch.json` | Bajo | **Solo con SMTP operativo** |

Los cambios de `config.patch.json` se aplican por el bootstrap declarativo idempotente ya existente
(`infra/mattermost/bootstrap/`). Los de `Caddyfile` requieren recarga de Caddy. **Nada de esto se ejecutó en esta auditoría.**

---

## Fuentes (verificadas en la sesión, 2026-07-29)

- Mattermost — *Set up an NGINX proxy* (config recomendada con `add_header Strict-Transport-Security max-age=15768000;` y `X-Frame-Options SAMEORIGIN`, `proxy_read_timeout 600s` / `90s` WebSocket): https://docs.mattermost.com/deployment-guide/server/setup-nginx-proxy.html
- Mattermost — *Environment configuration settings* (Rate limiting y *Trusted proxy IP header* detrás de proxy): https://docs.mattermost.com/administration-guide/configure/environment-configuration-settings.html
- Mattermost — *Multi-factor authentication* (MFA disponible en Team Edition; enforcement Enterprise): https://docs.mattermost.com/administration-guide/onboard/multi-factor-authentication.html
- Evidencia directa: `mmctl --local config show --json` sobre `echegaray-mm-app` y `curl -I --resolve chat.ecsas.com.ar:443:127.0.0.1 https://chat.ecsas.com.ar/`.
