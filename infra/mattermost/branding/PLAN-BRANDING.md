# PLAN DE BRANDING — Mattermost → Echegaray Business OS

**Estado:** DISEÑO / DOCUMENTACIÓN. **Nada de este plan se aplica a producción todavía.**
La aplicación real la autoriza el dueño (Jorge) y se ejecuta en una sesión aparte.

**Instancia objetivo (NO modificar acá):**

- Mattermost **Team Edition 11.8.4** self-hosted (sin licencia Enterprise/Professional).
- Dominio: `chat.ecsas.com.ar`.
- Configuración declarativa e idempotente en `infra/mattermost/bootstrap/config.patch.json`, aplicada por `bootstrap.sh` vía `mmctl config patch` (local mode, dentro del contenedor distroless).
- `TeamSettings.SiteName` ya = `"Echegaray Construcciones"` (branding básico de PR-2).

**Objetivo:** reemplazar todo rastro visual de "Mattermost" por "Echegaray Business OS / Echegaray Construcciones" donde la Team Edition lo permita, **sin parchear binarios ni assets internos del contenedor** (cualquier `docker pull` de una versión nueva los pisaría). Solo lo soportado por: configuración (`config.patch.json` / `mmctl`), variables de entorno, y — para el punto de logo de login — el endpoint de brand image oficial. Todo lo que sobreviva a un `docker compose pull && up -d` sin re-trabajo manual.

---

## 0. Regla de compatibilidad con updates (criterio que gobierna todo el plan)

Se admite **solo** branding que persista a través de una actualización de imagen:

| Mecanismo | ¿Sobrevive a update? | ¿Se usa en este plan? |
|---|---|---|
| `config.patch.json` aplicado por `bootstrap.sh` (idempotente) | Sí — vive en la config del server, en el volumen/DB, no en la imagen | **Sí (mecanismo principal)** |
| `mmctl config set` / `config patch` | Sí — misma config | Sí |
| Variables de entorno `MM_*` en `docker-compose.yml` | Sí — viven en el compose, no en la imagen | Sí (donde aplica) |
| Brand image vía API `/api/v4/brand/image` (se guarda en el data volume, no en la imagen) | Sí — persiste en `./volumes/app/mattermost/data` | Sí (condicionado a licencia, ver §2.4) |
| **Editar assets estáticos dentro del contenedor** (`client/root.html`, `favicon.ico`, `manifest.json`, CSS del webapp, cadenas i18n) | **NO — los pisa cada `docker pull`** | **PROHIBIDO por este plan** |
| Recompilar el webapp / fork del binario | NO — se pierde en cada release | PROHIBIDO |

Consecuencia: hay marca de "Mattermost" que **no se puede** quitar en Team Edition sin violar esta regla. Se lista explícitamente en §4 (Fuera de alcance). Preferimos una marca honesta y mantenible a un branding frágil que se rompe en el próximo update.

---

## 1. Inventario de puntos de marca

Clasificación de "brandeable en TE" (Team Edition sin licencia):

- **SÍ** — config soportada, sin licencia, se aplica hoy y sobrevive updates.
- **CONDICIONADO** — el valor de config es escribible en TE, pero **el render en pantalla puede estar gateado por licencia** en 11.8.4. Requiere verificación empírica en staging antes de prometerlo (ver §2.4).
- **NO** — no se puede en TE sin editar assets internos (pisados por updates) o sin app propia. Fuera de alcance.

| # | Punto de marca | Dónde se ve | Brandeable en TE | Mecanismo |
|---|---|---|---|---|
| 1 | **Nombre del sitio (SiteName)** | Header/footer de login, selección/creación de equipo, creación de cuenta, invitaciones por email, página "About" | **SÍ** (ya hecho en PR-2) | `TeamSettings.SiteName` |
| 2 | **Descripción del sitio** | Subtítulo de la página de login | **SÍ** | `TeamSettings.CustomDescriptionText` |
| 3 | **Texto de marca del login** (tagline bajo el logo) | Panel izquierdo de la página de login | **CONDICIONADO** | `TeamSettings.EnableCustomBrand` + `TeamSettings.CustomBrandText` |
| 4 | **Imagen/logo de marca del login** | Panel izquierdo de la página de login | **CONDICIONADO** | `EnableCustomBrand` + upload vía `mmctl` / API `/api/v4/brand/image` |
| 5 | **Links de soporte** (About, Help, Report a Problem, Support Email, Términos, Privacidad) | Menú de ayuda, página About, footer, emails | **SÍ** | `SupportSettings.*` |
| 6 | **Remitente y firma de emails de notificación** | Todos los correos que manda el server (invitaciones, reset de contraseña, notificaciones) | **SÍ (parcial)** | `EmailSettings.FeedbackName`, `FeedbackEmail`, `ReplyToAddress` |
| 7 | **Colores / tema (sidebar, acentos)** | Toda la app (web y móvil) | **CONDICIONADO / per-usuario** | Tema por usuario (libre, no imponible) o plugin "Default Theme"; `ThemeSettings.*` org-wide es Enterprise |
| 8 | **Favicon del navegador** | Pestaña del browser, notificaciones | **NO** | Solo editando `favicon.ico` interno (pisado por update) o plugin no oficial parcial |
| 9 | **Logo dentro de la app** (esquina del sidebar, splash de carga) | App web ya logueado | **NO** | Asset estático interno (pisado por update) |
| 10 | **App móvil oficial** (nombre "Mattermost", ícono, splash, textos) | iOS/Android app store | **NO** | Requiere compilar app propia (Enterprise / build propio) |
| 11 | **Título de la pestaña del navegador / PWA name** | `<title>`, `manifest.json` | **NO** (el título usa SiteName en algunas vistas, pero el `manifest.json`/`root.html` es asset interno) | Asset estático interno |

---

## 2. Cambio exacto por punto

Todos los cambios de config se agregan a `infra/mattermost/bootstrap/config.patch.json` (fuente declarativa, idempotente). Los valores concretos con datos reales del negocio (emails, links) están marcados como **[CONFIRMAR CON JORGE]** — no se inventan.

### 2.1 — SiteName (#1) — ya aplicado, sin cambios

```json
"TeamSettings": {
  "SiteName": "Echegaray Construcciones"
}
```

Nota de criterio: `SiteName` tiene **máx. 30 caracteres**. "Echegaray Business OS" (21) y "Echegaray Construcciones" (24) entran. Decisión de nombre para el usuario final: **"Echegaray Construcciones"** (marca de la empresa que la gente reconoce) vs **"Echegaray Business OS"** (marca del sistema). Recomendación: mantener **"Echegaray Construcciones"** en `SiteName` (es lo que ve el empleado de obra en el login) y usar "Echegaray Business OS" solo en el texto de marca/descripción (#2/#3). **[DECISIÓN DE JORGE]**

### 2.2 — Descripción del sitio (#2)

Agregar a `TeamSettings` en `config.patch.json`:

```json
"TeamSettings": {
  "SiteName": "Echegaray Construcciones",
  "CustomDescriptionText": "Echegaray Business OS · Comunicación interna"
}
```

- Aparece como subtítulo en la página de login. Máx. 1024 caracteres, **sin** Markdown.
- Brandeable en TE sin licencia (es texto de config plano, no gateado).

### 2.3 — Texto de marca del login (#3) — CONDICIONADO

```json
"TeamSettings": {
  "EnableCustomBrand": true,
  "CustomBrandText": "**Echegaray Business OS**\n\nSistema central de operación de Echegaray Construcciones."
}
```

- `CustomBrandText`: máx. 500 caracteres, **soporta Markdown**. Se muestra bajo la imagen de marca en el panel izquierdo del login.
- **Advertencia de licencia (crítica):** la documentación actual de Mattermost lista "Custom Branding" como *"Available on Entry, Professional, Enterprise, and Enterprise Advanced plans"*. Históricamente (desde v5.0, jun-2018) el custom brand **funcionaba en Team Edition**; en versiones recientes el render puede estar gateado por licencia. **No se puede afirmar sin verificar en la instancia 11.8.4.** El valor de config es escribible por `mmctl` en TE, pero puede no renderizarse en el login sin licencia.
- **Procedimiento de verificación (en staging o en una ventana controlada, NO como cambio permanente sin aprobación):**
  1. Aplicar el patch con `EnableCustomBrand: true` + `CustomBrandText`.
  2. Abrir `https://chat.ecsas.com.ar/login` en ventana incógnito.
  3. Confirmar visualmente si aparece el texto/imagen de marca.
  4. Si NO aparece → es feature licenciada en 11.8.4 → pasa a §4 (fuera de alcance) y se revierte `EnableCustomBrand` a `false`.
  5. Registrar el resultado en este archivo (tabla de §2.4).

### 2.4 — Imagen/logo del login (#4) — CONDICIONADO (misma licencia que #3)

- El logo del login **no** es un archivo de config: se sube por API y Mattermost lo guarda en el data volume (`.../mattermost/data`), por lo que **persiste a updates** (no es asset de imagen).
- Requiere `EnableCustomBrand: true`. Mismo condicionante de licencia que §2.3.
- Comando (una vez verificado que la licencia lo permite):

  ```bash
  # Vía mmctl (local mode, como bootstrap.sh). Copiar el asset al contenedor y subirlo.
  docker cp infra/mattermost/branding/assets/login-brand.png "$MM_CONTAINER:/tmp/login-brand.png"
  # API REST autenticada como system-admin (mmctl no expone subcomando de brand image en todas las versiones):
  #   POST /api/v4/brand/image  (multipart, campo "image")
  # Alternativa soportada: System Console > Site Configuration > Customization > Custom Brand Image (si la licencia lo habilita).
  ```

- Especificación del asset: ver §3.
- **Resultado de la verificación de licencia (a completar en la sesión de aplicación):**

  | Fecha | Versión | ¿Custom brand renderiza en TE? | Evidencia |
  |---|---|---|---|
  | _pendiente_ | 11.8.4 | _pendiente de verificar_ | _screenshot login_ |

### 2.5 — Links y email de soporte (#5) — SÍ

Reemplazan los defaults que apuntan a `mattermost.com`. Agregar bloque `SupportSettings` a `config.patch.json`:

```json
"SupportSettings": {
  "AboutLink": "https://chat.ecsas.com.ar/",          // o URL del OS [CONFIRMAR]
  "HelpLink": "https://chat.ecsas.com.ar/",           // [CONFIRMAR]
  "ReportAProblemLink": "mailto:sistemas@ecsas.com.ar", // [CONFIRMAR email real]
  "SupportEmail": "sistemas@ecsas.com.ar",            // [CONFIRMAR email real]
  "TermsOfServiceLink": "",                            // vacío = ocultar link legal ajeno
  "PrivacyPolicyLink": ""                              // vacío = ocultar link legal ajeno
}
```

- Todos son texto de config plano, **sin licencia**, render garantizado en TE.
- Poner `TermsOfServiceLink`/`PrivacyPolicyLink` en `""` **oculta** los enlaces a los términos genéricos de Mattermost (es preferible vacío a que apunten a mattermost.com). Confirmar con Jorge si la empresa tiene política propia que enlazar.
- `SupportEmail` por defecto es `feedback@mattermost.com`; cambiarlo elimina esa marca del menú de ayuda y de emails.

### 2.6 — Remitente de emails (#6) — SÍ (parcial)

```json
"EmailSettings": {
  "FeedbackName": "Echegaray Business OS",
  "FeedbackEmail": "sistemas@ecsas.com.ar",     // [CONFIRMAR — debe ser un buzón real que el SMTP pueda usar]
  "ReplyToAddress": "sistemas@ecsas.com.ar"     // [CONFIRMAR]
}
```

- `FeedbackName`: nombre que aparece como remitente ("De: Echegaray Business OS") en todos los correos del server. **Sin licencia.**
- `FeedbackEmail` / `ReplyToAddress`: requieren un buzón real y SMTP configurado (WT/PR aparte; hoy la instancia puede no tener SMTP saliente). Si no hay SMTP, `FeedbackName` igual mejora el branding cuando se configure.
- **Parcial** porque: el *cuerpo/plantilla* de los emails (HTML, footer "powered by Mattermost") **no** es editable en TE — es asset/plantilla interna. La firma "Mattermost" del pie de los correos queda (ver §4).

### 2.7 — Colores / tema (#7) — CONDICIONADO / per-usuario

Realidad de Team Edition:

- **`ThemeSettings` a nivel organización** (imponer un tema default, restringir temas, `EnableThemeSelection`/`DefaultTheme`/`AllowCustomThemes`/`AllowedThemes`) es **feature licenciada (Enterprise)**. No se puede forzar un tema corporativo global en TE.
- **Tema por usuario SÍ es gratis:** cada usuario puede, en *Configuración → Display → Theme → Custom Theme*, pegar un tema personalizado. Se puede **documentar y compartir** un tema Echegaray para que cada quien lo importe, pero **no es imponible ni automático**.
- **Opción soportada y update-safe:** el plugin oficial de comunidad **"Default Theme"** (marketplace) permite fijar un tema default swithout Enterprise. Los plugins viven en el data volume y sobreviven updates. Es la única vía razonable para un color corporativo global en TE. Marcar como **opcional** — evaluar en Hardening si vale la complejidad.

Tema Echegaray propuesto (mapeo desde el design system real del OS, ver §3.3) — formato de import de Mattermost, **PROPUESTA**:

```
{"sidebarBg":"#10233a","sidebarText":"#c7d2e0","sidebarUnreadText":"#ffffff","sidebarTextHoverBg":"#1d3452","sidebarTextActiveBorder":"#2f6df6","sidebarTextActiveColor":"#ffffff","sidebarHeaderBg":"#0a2540","sidebarHeaderTextColor":"#ffffff","sidebarTeamBarBg":"#081b30","onlineIndicator":"#067647","awayIndicator":"#93591b","dndIndicator":"#b42318","mentionBg":"#2f6df6","mentionBj":"#2f6df6","mentionColor":"#ffffff","centerChannelBg":"#ffffff","centerChannelColor":"#0a2540","newMessageSeparator":"#b42318","linkColor":"#175cd3","buttonBg":"#10233a","buttonColor":"#ffffff","errorTextColor":"#b42318","mentionHighlightBg":"#e9f0fd","mentionHighlightLink":"#175cd3","codeTheme":"github"}
```

---

## 3. Especificación de assets a producir

### 3.1 — Logo del login (#4)

- **Formato:** PNG con transparencia (soportado: JPG, PNG, TIFF, BMP; PNG es lo correcto para logo con transparencia).
- **Dimensiones:** 200–500 px de lado (recomendación oficial). Objetivo: un cuadrado ~400×400 px o un lockup horizontal ~480×200 px.
- **Peso:** **< 2 MB** (se descarga en cada login; apuntar a < 150 KB).
- **Contenido:** logotipo Echegaray Construcciones / "Echegaray Business OS", legible sobre fondo claro (el panel de login es claro).
- **Ubicación en repo:** `infra/mattermost/branding/assets/login-brand.png` (crear la carpeta `assets/` al producir el asset).

### 3.2 — Favicon (#8) — solo si en el futuro se acepta el trade-off de update

- **NO recomendado en TE** (asset interno, se pisa en cada update). Documentado solo para completar el inventario.
- Si algún día se decide: `favicon.ico` multi-resolución (16/32/48 px) + PNG 192/512 para PWA. Fuera de alcance de este plan.

### 3.3 — Paleta de colores Echegaray — NO se inventa, se reutiliza la existente

**No corresponde "proponer una paleta nueva": el OS ya tiene un design system con fuente única** en `echegaray-os/src/app/globals.css` (tokens `--os-*`). El tema de Mattermost se **deriva** de esos tokens para que el chat sea visualmente coherente con la web del OS:

| Rol en Mattermost | Token del OS | Hex |
|---|---|---|
| Sidebar / header oscuro | `--os-accent` / `--os-ink` | `#10233a` / `#0a2540` |
| Acento y foco | `--os-focus` | `#2f6df6` |
| Links | `--os-info` | `#175cd3` |
| Online / positivo | `--os-pos` | `#067647` |
| DND / negativo | `--os-neg` | `#b42318` |
| Away / warn | `--os-warn` | `#93591b` |
| Fondo canal / superficie | `--os-surface` / `--os-canvas` | `#ffffff` / `#f6f8fb` |
| Texto principal | `--os-ink` | `#0a2540` |

Esto respeta el principio de fuente única del OS: la identidad de color vive **una vez** en `globals.css` y el tema de Mattermost la consume. Marcar el JSON de §2.7 como **PROPUESTA derivada** — la aprueba Jorge.

---

## 4. Fuera de alcance en Team Edition (marca de "Mattermost" que queda)

Por la regla de §0 (nada que un update pise) y por límites de licencia, **estos rastros de "Mattermost" NO se eliminan** y hay que aceptarlos o resolverlos con Enterprise/app propia:

1. **Favicon del navegador** (#8) — asset interno. Queda el ícono de Mattermost en la pestaña.
2. **Logo dentro de la app ya logueada** (#9) — sidebar/splash de carga. Asset interno.
3. **Título de pestaña / nombre PWA** (#11) — `root.html`/`manifest.json` internos.
4. **App móvil oficial** (#10) — nombre "Mattermost", ícono y textos de la store. Solo se resuelve compilando una app propia (requiere Enterprise + build pipeline; costo alto, no justificado hoy para ~6-10 usuarios internos).
5. **Pie "powered by Mattermost" / plantilla de emails** — el HTML de los correos es plantilla interna. Se puede cambiar el remitente (§2.6) pero no el cuerpo.
6. **Textos varios de UI** (algunas cadenas i18n mencionan "Mattermost") — asset interno, se pisan en updates.
7. **Custom brand del login (#3/#4)** — **si la verificación de §2.4 confirma que 11.8.4 lo gatea por licencia**, cae acá.
8. **Tema corporativo global forzado (#7)** — `ThemeSettings` org-wide es Enterprise. En TE solo hay tema per-usuario o el plugin "Default Theme".

**Criterio honesto para Jorge:** en Team Edition se puede lograr que **la página de login, el nombre, los links de ayuda y el remitente de correos digan "Echegaray"**, y que **cada usuario opte por el tema Echegaray**. Lo que **no** se puede quitar sin Enterprise ni app propia es el favicon, el logo interno de la app y la marca en la app móvil. Es un branding "90% del contacto diario" (nombre + login + colores del chat que el usuario ve todo el día), no un white-label total.

---

## 5. Confirmación: nada rompe updates

Chequeo contra la regla de §0:

- Todo el branding "SÍ" (#1, #2, #5, #6) vive en `config.patch.json`, se aplica con `mmctl config patch` (idempotente) y persiste en la config del server, **no en la imagen**. Un `docker compose pull && up -d` no lo toca; y si algo se resetea, `bootstrap.sh` lo re-aplica.
- El logo de login (#4), si se habilita, se guarda en el **data volume** (`./volumes/app/mattermost/data`), no en la imagen → sobrevive updates.
- El tema per-usuario / plugin (#7) vive en la DB / data volume → sobrevive updates.
- **No se edita ningún archivo dentro del contenedor** (favicon, root.html, CSS, i18n, binario). Por eso #8–#11 quedan fuera: la única forma de tocarlos violaría esta regla.
- Los assets fuente (`branding/assets/*`) viven en el repo, versionados; reproducibles.

**Conclusión:** el plan es 100% update-safe por construcción. La frontera de lo brandeable coincide exactamente con la frontera de lo que persiste a updates — no por casualidad, sino porque se descartó a propósito todo lo que no persiste.

---

## 6. Resumen ejecutable (qué agregar a `config.patch.json` cuando Jorge apruebe)

Bloques a **sumar** (no reemplazar) al `config.patch.json` actual, con los `[CONFIRMAR]` resueltos:

```jsonc
{
  "TeamSettings": {
    "SiteName": "Echegaray Construcciones",
    "CustomDescriptionText": "Echegaray Business OS · Comunicación interna"
    // "EnableCustomBrand": true,        // ← solo tras verificar licencia (§2.4)
    // "CustomBrandText": "**Echegaray Business OS**\n\n..."
  },
  "SupportSettings": {
    "AboutLink": "…",
    "HelpLink": "…",
    "ReportAProblemLink": "mailto:sistemas@ecsas.com.ar",
    "SupportEmail": "sistemas@ecsas.com.ar",
    "TermsOfServiceLink": "",
    "PrivacyPolicyLink": ""
  },
  "EmailSettings": {
    "FeedbackName": "Echegaray Business OS",
    "FeedbackEmail": "sistemas@ecsas.com.ar",
    "ReplyToAddress": "sistemas@ecsas.com.ar"
  }
}
```

## 7. Fuentes (verificado en la sesión)

- Custom branding tools — docs.mattermost.com/administration-guide/configure/custom-branding-tools.html
- Site configuration settings — docs.mattermost.com/administration-guide/configure/site-configuration-settings.html
- Customize your theme — docs.mattermost.com/end-user-guide/preferences/customize-your-theme.html
- Editions and offerings / plans — docs.mattermost.com/product-overview/editions-and-offerings.html
- Config model (SupportSettings, EmailSettings, ThemeSettings) — github.com/mattermost/mattermost/blob/master/server/public/model/config.go
- "Default Theme" plugin (workaround org-wide theme en TE) — mattermost.com/marketplace/default-theme-plugin/
- Historial: Custom branding movido a Team Edition en v5.0 (jun-2018); docs actuales lo listan bajo planes pagos → **verificar render en 11.8.4** (§2.4).

**Nota de honestidad (principio de confianza del OS):** el único punto donde el plan no puede afirmar un HECHO es la licencia del custom brand del login (#3/#4) en 11.8.4 — está marcado como CONDICIONADO con procedimiento de verificación, no como capacidad confirmada. Todo lo demás (SiteName, descripción, SupportSettings, EmailSettings) es config no gateada, confirmada brandeable en TE.
