# Plan de Aceptación Funcional End-to-End — PR-2 · Mattermost (Path B: Caddy)

Este plan **complementa** — no reemplaza — los dos aparatos de QA que ya existen en la rama del release:

- `infra/mattermost/qa/pruebas.sh` — checks **read-only** de salud, aislamiento de red y exposición
  pública (Path B / Caddy). Es la base automatizada. **No se modifica.**
- `infra/mattermost/qa/CHECKLIST-PRODUCCION.md` — checklist de cierre técnico del PR. **No se modifica.**

Mientras `pruebas.sh` prueba que el **aparato** está sano y seguro, este documento define la
**aceptación funcional de uso real**: que una persona pueda entrar, ver su equipo y canales, mandar y
recibir mensajes, subir archivos, y recibir el aviso en el celular — de punta a punta, por HTTPS público.

> **Arquitectura (Path B, elegida por el dueño):** Internet ─(80/443)→ **Caddy**
> (`echegaray-mm-caddy`) termina TLS con Let's Encrypt/ZeroSSL (ACME) y hace `reverse_proxy` a
> `mattermost:8065` por la red interna. Mattermost sigue **sólo** en `127.0.0.1:8065`; Postgres **sin
> puertos publicados**. **NO se usa Cloudflare Tunnel** (el `PUSH-MOVIL.md` menciona Cloudflare por
> herencia de un borrador anterior; la arquitectura vigente y la que gobierna este plan es Caddy).

---

## Cómo usar este plan

Cada ítem trae: **Precondición**, **Pasos exactos**, **Resultado esperado**, **Evidencia**, y una
etiqueta de **Dependencia** que dice cuándo se puede ejecutar:

| Etiqueta | Significado | Cuándo se ejecuta |
|---|---|---|
| 🟢 **PRE-HOY** | Pre-validable **hoy**, sin DNS ni Caddy. Ya lo cubre `pruebas.sh` o se prueba contra `127.0.0.1:8065` en la VM. | Ahora |
| 🟡 **DNS/CADDY** | Requiere el A record propagado **y** Caddy publicando HTTPS. No ejecutable aún. | Post-activación |
| 🔵 **MANUAL** | Requiere una acción física del dueño que ningún script hace (celular real, reboot de la VM, bajar Caddy). | Ventana coordinada |

Muchos ítems funcionales tienen **dos tramos**: un **pre-check hoy** contra el loopback (🟢) y una
**confirmación final pública** (🟡). Cuando así sea, se indica explícitamente. La lógica es la misma
de `pruebas.sh`: lo que ya debería andar y no anda es **regresión**; lo que aún no se activó es
**pendiente**, no falla.

**Datos de referencia (de bootstrap y compose, verificados en el código del release):**

| Dato | Valor |
|---|---|
| Hostname público | `chat.ecsas.com.ar` |
| IP pública VM (A record) | `64.176.22.159` |
| Loopback MM (VM) | `http://127.0.0.1:8065` |
| Admin inicial | `admin` / `admin@ecsas.com.ar` (system-admin, creado por bootstrap) |
| Equipo | slug `echegaray` · display **Echegaray Construcciones** |
| Canales declarados | `direccion` (privado), `obras`, `administracion`, `compras` (+ Town Square y Off-Topic por defecto) |
| Tamaño máx. de archivo | `104857600` bytes = **100 MB** (`FileSettings.MaxFileSize`) |
| Adjuntos habilitados | `EnableFileAttachments: true` (sin restricción de tipo → imágenes/audio/PDF permitidos) |
| Push | TPNS `https://push-test.mattermost.com`, `PushNotificationContents: generic` |
| Restart policy | `unless-stopped` en MM, DB y Caddy |

---

## Índice de ítems

| # | Ítem | Dependencia |
|---|---|---|
| T0 | Base local sana + aislamiento (pre-requisito heredado de `pruebas.sh`) | 🟢 PRE-HOY |
| T1 | Smoke test HTTPS público (`/api/v4/system/ping` → 200 + cert Let's Encrypt válido) | 🟡 DNS/CADDY |
| T2 | Redirección HTTP → HTTPS (puerto 80 → 443) | 🟡 DNS/CADDY |
| T3 | WebSocket público (`101` en `/api/v4/websocket` vía Caddy) | 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (público) |
| T4 | Login web con el admin del bootstrap | 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (público) |
| T5 | Equipo Echegaray + canales iniciales presentes | 🟢 PRE-HOY |
| T6 | Envío y recepción de mensajes entre 2 usuarios | 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (tiempo real público) |
| T7 | Carga de archivos / imágenes / audio (según `config.patch.json`) | 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (móvil) |
| T8 | Móvil Android (app oficial → login → mensaje → push) | 🔵 MANUAL + 🟡 DNS/CADDY |
| T9 | Móvil iPhone (app oficial → login → mensaje → push) | 🔵 MANUAL + 🟡 DNS/CADDY |
| T10 | TPNS: la notificación push llega (servicio de PRUEBA, **sin SLA**) | 🔵 MANUAL + 🟡 DNS/CADDY |
| T11 | Recuperación tras reboot (MM+DB+Caddy levantan solos) | 🟢 PRE-HOY (config) + 🔵 MANUAL (reboot) |
| T12 | Rollback controlado (parar Caddy → MM vuelve a loopback) | 🔵 MANUAL + 🟢 PRE-HOY (verificación) |
| — | **Checklist Final de Aceptación (GO / NO-GO)** | — |

**Resumen de ejecución:** de 13 ítems (T0–T12), **6 son pre-validables hoy** en todo o en su tramo
principal (T0, T3-loopback, T4-loopback, T5, T6-loopback, T7-loopback, T11-config, T12-verificación),
y **6 dependen de DNS/Caddy y/o acción manual** para su confirmación pública definitiva (T1, T2, T8,
T9, T10, y los tramos públicos de T3/T4/T6/T7). T0 es 100% hoy.

---

## T0 — Base local sana + aislamiento de red 🟢 PRE-HOY

Pre-requisito de todo lo demás. Ya está cubierto íntegramente por `pruebas.sh`; se lista para que la
aceptación funcional arranque desde una base verificada.

- **Precondición:** stack de PR-1/PR-2 levantado en la VM (`docker compose up -d`), bootstrap ya corrido.
- **Pasos exactos:**
  ```bash
  bash infra/mattermost/qa/pruebas.sh -v
  ```
- **Resultado esperado:** §1 (salud local), §2 (aislamiento), §3 (recursos), §4 (logs), §5 (OS) en
  `[ OK ]`; exit code `0`. §6 puede estar `[PEND]` si Caddy aún no publica — es correcto.
  Específicamente: MM `running+healthy`, `/api/v4/system/ping` en loopback → 200, `mmctl --local system
  status` → Server/DB/Filestore OK, WS local → 101, Postgres 5432 **sin** listener en el host, MM 8065
  **sólo** en `127.0.0.1`.
- **Evidencia:** salida de `pruebas.sh` (guardar a archivo: `bash infra/mattermost/qa/pruebas.sh -v |
  tee /tmp/t0-pruebas.txt`), exit code `echo $?` = 0.

---

## T1 — Smoke test HTTPS público 🟡 DNS/CADDY

- **Precondición:** A record `chat.ecsas.com.ar → 64.176.22.159` propagado; Caddy corriendo
  (`docker compose up -d caddy`); 80/443 abiertos en el firewall de Vultr; certificado ACME ya emitido.
- **Pasos exactos:**
  ```bash
  # 1. Ping público responde 200
  curl -sS -o /dev/null -w 'ping publico: %{http_code}\n' \
    https://chat.ecsas.com.ar/api/v4/system/ping

  # 2. Certificado: cadena confiable, NO self-signed, emisor CA pública
  echo | openssl s_client -connect chat.ecsas.com.ar:443 -servername chat.ecsas.com.ar 2>/dev/null \
    | grep -E 'Verify return code|subject=|issuer='

  # 3. Vigencia del certificado (> 7 días)
  echo | openssl s_client -connect chat.ecsas.com.ar:443 -servername chat.ecsas.com.ar 2>/dev/null \
    | openssl x509 -noout -enddate
  ```
- **Resultado esperado:**
  - `ping publico: 200`.
  - `Verify return code: 0 (ok)` y `subject` ≠ `issuer` (no self-signed).
  - `issuer` contiene **Let's Encrypt** o **ZeroSSL** (las dos CAs por defecto de Caddy) — nunca el cert
    interno de Caddy.
  - `notAfter` con margen holgado (Let's Encrypt emite a 90 días; Caddy renueva solo).
- **Evidencia:** salida de los tres comandos; equivale a los checks de `pruebas.sh` §6d/§6e (que lo
  reportan `[ OK ]` una vez publicado). Guardar la línea `Verify return code: 0 (ok)` y el `notAfter`.
- **Nota:** hasta que DNS propague, `pruebas.sh` §6 reporta este ítem `[PEND]` con el motivo preciso
  (Caddy no levantado / A record sin propagar / ACME provisionando). No es fallo.

---

## T2 — Redirección HTTP → HTTPS 🟡 DNS/CADDY

- **Precondición:** la de T1 (Caddy publicando, puerto 80 abierto para el reto ACME y el redirect).
- **Pasos exactos:**
  ```bash
  # NO seguir la redirección (-L off): confirmar el 3xx a https://
  curl -sS -o /dev/null -D - --max-time 12 http://chat.ecsas.com.ar/ | grep -iE 'HTTP/|location'
  ```
- **Resultado esperado:** código `301`/`302`/`308` (3xx) y cabecera `Location: https://chat.ecsas.com.ar/…`.
  Es el comportamiento por defecto de Caddy: 80 sirve el reto ACME HTTP-01 y redirige el resto a 443.
- **Evidencia:** línea `HTTP/1.1 30x` + `Location: https://…`. Equivale a `pruebas.sh` §6f.
- **Nota:** un `200` en `/` sobre el puerto 80 sería sospechoso (podría ser un reto ACME sirviéndose) —
  `pruebas.sh` lo marca `[WARN]`. Un `000` significa 80 cerrado → Caddy no puede renovar el cert.

---

## T3 — WebSocket público (tiempo real) 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (público)

Mattermost **exige** WebSocket para el tiempo real (mensajes que aparecen sin refrescar, push del móvil).

- **Precondición loopback:** MM healthy (T0). **Precondición pública:** T1 (Caddy publicando HTTPS).
- **Pasos exactos:**
  ```bash
  # 3a. PRE-HOY — WS local (siempre debe andar, no depende de Caddy):
  curl -s -o /dev/null -w 'WS local: %{http_code}\n' --max-time 6 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    http://127.0.0.1:8065/api/v4/websocket

  # 3b. DNS/CADDY — WS público a través de Caddy:
  curl -s -o /dev/null -w 'WS publico: %{http_code}\n' --max-time 6 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    https://chat.ecsas.com.ar/api/v4/websocket
  ```
- **Resultado esperado:** ambos → **`101` Switching Protocols**. El público prueba que Caddy pasa el
  `Upgrade` de forma transparente (`reverse_proxy`) y que la `SiteURL` es coherente (si `MM_SITE_URL` no
  fuera `https://chat.ecsas.com.ar`, MM rechazaría el origin del WebSocket).
- **Evidencia:** `WS local: 101` (hoy) y `WS publico: 101` (post-activación). Equivalen a `pruebas.sh`
  §1d y §6g. Verificar SiteURL efectiva:
  `docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get ServiceSettings.SiteURL` →
  `https://chat.ecsas.com.ar`.

---

## T4 — Login web con el admin del bootstrap 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (público)

- **Precondición:** bootstrap corrido (admin creado). Contraseña real desde `.env.bootstrap` (no el
  placeholder). Para el pre-check por navegador contra loopback, acceso a la VM (SSH túnel o navegador
  en la VM).
- **Pasos exactos:**
  - **4a. PRE-HOY (API/loopback, sin navegador)** — confirmar que el admin existe y autentica:
    ```bash
    # El admin figura como system admin:
    docker exec echegaray-mm-app /mattermost/bin/mmctl --local user list | grep -i admin

    # Login por API contra loopback (prueba credenciales sin navegador):
    curl -sS -i -X POST http://127.0.0.1:8065/api/v4/users/login \
      -H 'Content-Type: application/json' \
      -d '{"login_id":"admin@ecsas.com.ar","password":"<CONTRASEÑA_REAL>"}' \
      | grep -iE 'HTTP/|token:'
    ```
  - **4b. DNS/CADDY (navegador real)** — abrir `https://chat.ecsas.com.ar`, iniciar sesión con
    `admin` / contraseña real. Debe cargar el equipo y los canales sin advertencia de certificado.
- **Resultado esperado:**
  - 4a: el admin aparece en `user list`; el login por API responde `HTTP/1.1 200` y cabecera `Token:`.
  - 4b: pantalla de MM con el equipo **Echegaray Construcciones** y la lista de canales; candado válido
    en el navegador.
- **Evidencia:** 4a → salida con `200 OK` + `Token:`. 4b → captura de pantalla del login exitoso.
- **Nota de seguridad:** no dejar la contraseña en el historial de shell; usar una variable de entorno o
  el prompt de `read -s`. Cambiar la contraseña del admin tras el primer login real (recomendado por el
  propio bootstrap).

---

## T5 — Equipo Echegaray + canales iniciales presentes 🟢 PRE-HOY

- **Precondición:** bootstrap corrido.
- **Pasos exactos:**
  ```bash
  # Equipo:
  docker exec echegaray-mm-app /mattermost/bin/mmctl --local team list

  # Canales del equipo:
  docker exec echegaray-mm-app /mattermost/bin/mmctl --local channel list echegaray
  ```
- **Resultado esperado:**
  - `team list` incluye `echegaray` (display **Echegaray Construcciones**).
  - `channel list echegaray` incluye los 4 canales declarados: `direccion` (privado), `obras`,
    `administracion`, `compras`; más `town-square` y `off-topic` (creados por MM al crear el equipo).
    No debe existir un canal `general` duplicado (Town Square cumple ese rol — decisión de `channels.txt`).
- **Evidencia:** salida de ambos comandos. Coincide con el ítem G del `CHECKLIST-PRODUCCION.md`.

---

## T6 — Envío y recepción de mensajes entre 2 usuarios 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (tiempo real público)

- **Precondición:** admin creado (T4) y un **segundo usuario de prueba**. Crear el segundo usuario (paso
  reversible, se puede borrar después):
  ```bash
  docker exec echegaray-mm-app /mattermost/bin/mmctl --local user create \
    --email prueba@ecsas.com.ar --username prueba --password '<PASS_FUERTE_10+>' --email-verified
  docker exec echegaray-mm-app /mattermost/bin/mmctl --local team users add echegaray prueba
  docker exec echegaray-mm-app /mattermost/bin/mmctl --local channel users add echegaray:obras prueba
  ```
- **Pasos exactos:**
  - **6a. PRE-HOY** — dos navegadores/perfiles contra `http://127.0.0.1:8065` en la VM (o túnel SSH):
    sesión A como `admin`, sesión B como `prueba`, ambos en el canal `obras`. A escribe un mensaje; B
    lo recibe **sin refrescar** (prueba el WebSocket local). B responde; A lo recibe en vivo.
  - **6b. DNS/CADDY** — repetir el 6a contra `https://chat.ecsas.com.ar` (uno en web, otro en móvil o
    en otra red) para confirmar el tiempo real **por Caddy** de punta a punta.
  - **Alternativa sin navegador (smoke):** publicar un post por API y leerlo:
    ```bash
    # requiere token de T4a; obtener canal 'obras':
    docker exec echegaray-mm-app /mattermost/bin/mmctl --local post create \
      echegaray:obras --message "smoke test T6 $(date +%T)"
    ```
- **Resultado esperado:** el mensaje aparece en la sesión del otro usuario **en tiempo real** (no hace
  falta refrescar). El tramo 6b confirma que el WebSocket llega a través de Caddy.
- **Evidencia:** capturas de las dos sesiones con el mismo mensaje; o el post creado visible con
  `mmctl post list echegaray:obras`.
- **Limpieza:** el usuario `prueba` se puede desactivar tras la prueba
  (`mmctl --local user deactivate prueba`).

---

## T7 — Carga de archivos / imágenes / audio 🟢 PRE-HOY (loopback) + 🟡 DNS/CADDY (móvil)

Config vigente (`config.patch.json`): `EnableFileAttachments: true`, `MaxFileSize: 104857600` (**100 MB**).
No hay lista blanca/negra de extensiones → imágenes, audio y PDF están permitidos.

- **Precondición:** login (T4). Filestore OK (T0 lo confirma vía `mmctl system status`).
- **Pasos exactos:**
  - **7a. PRE-HOY — verificar la config efectiva:**
    ```bash
    docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get FileSettings.EnableFileAttachments
    docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get FileSettings.MaxFileSize
    ```
  - **7b. PRE-HOY — subir por web (loopback):** en el canal `obras`, adjuntar y enviar: (i) una **imagen**
    (JPG/PNG) — debe mostrar preview; (ii) un **audio** (M4A/MP3) — debe mostrar un reproductor; (iii) un
    **PDF**. Confirmar que se abren/descargan.
  - **7c. PRE-HOY — límite de tamaño:** intentar subir un archivo **> 100 MB** y confirmar que MM lo
    rechaza con el error de tamaño (validación del límite declarado).
  - **7d. DNS/CADDY — desde el móvil:** repetir 7b desde la app oficial una vez publicado (verifica que
    Caddy no impone un límite de body más chico que MM; el `Caddyfile` no debe recortar por debajo de 100 MB).
- **Resultado esperado:** 7a → `true` y `104857600`. 7b → los tres archivos suben y se visualizan.
  7c → rechazo controlado por exceder 100 MB. 7d → sube desde móvil sin error de proxy (413).
- **Evidencia:** salida de `config get`; capturas del mensaje con imagen/audio/PDF; captura del rechazo
  por tamaño.

---

## T8 — Móvil Android (app oficial → login → mensaje → push) 🔵 MANUAL + 🟡 DNS/CADDY

- **Precondición:** T1 (HTTPS público con cert válido), T3-público (WS por Caddy), un teléfono Android
  con la app oficial **Mattermost** (Google Play) y una cuenta real (admin o `prueba`).
- **Pasos exactos:**
  1. Abrir la app oficial → **Add server** → `https://chat.ecsas.com.ar`.
  2. Iniciar sesión con la cuenta real. Debe conectar, cargar el equipo y los canales.
  3. Con la app **en primer plano**, pedir a otra persona/dispositivo que escriba en un canal común
     (`obras`). El mensaje debe llegar **en vivo** (prueba directa del WebSocket hasta el móvil).
  4. Poner la app **en segundo plano / pantalla apagada** y enviar otro mensaje desde otro dispositivo
     → debe llegar la **notificación push** (ver T10; TPNS).
- **Resultado esperado:** login exitoso sin advertencia de certificado; mensajes en vivo con la app
  abierta; notificación push con la app cerrada mostrando **quién** y **en qué canal** (por
  `PushNotificationContents: generic`), **sin** el texto del mensaje.
- **Evidencia:** capturas de: (i) login, (ii) mensaje recibido en vivo, (iii) notificación push en la
  barra de notificaciones. Corresponde al ítem F del `CHECKLIST-PRODUCCION.md`.

---

## T9 — Móvil iPhone (app oficial → login → mensaje → push) 🔵 MANUAL + 🟡 DNS/CADDY

- **Precondición:** idéntica a T8, con un iPhone y la app oficial **Mattermost** (App Store). Push por
  APNs (en Android es FCM); en ambos casos el proxy es TPNS.
- **Pasos exactos:** idénticos a T8 (1–4), en iOS.
- **Resultado esperado:** idéntico a T8. En iOS conviene confirmar que los permisos de notificación de
  la app están habilitados en Ajustes → Notificaciones → Mattermost.
- **Evidencia:** capturas de login, mensaje en vivo y notificación push en iOS.

---

## T10 — TPNS: la notificación push llega — servicio de PRUEBA, **SIN SLA** 🔵 MANUAL + 🟡 DNS/CADDY

> **Advertencia explícita (de `bootstrap/PUSH-MOVIL.md`): el push de PR-2 usa TPNS
> (`https://push-test.mattermost.com`), el servicio de PRUEBA gratuito de Mattermost. NO tiene SLA:
> no hay garantía de entrega ni de disponibilidad, no está recomendado para producción, y su capacidad
> es un recurso compartido que Mattermost puede limitar sin aviso.** Un push puede demorarse o no llegar
> y no hay soporte comprometido. Por eso: **no apoyar sobre este canal ningún proceso donde perder una
> notificación tenga consecuencia económica o de seguridad (alerta de caja, seguridad en obra,
> aprobación urgente) sin un plan B.** La migración a HPNS (push soportado, con SLA, plan pago) es una
> decisión de negocio y es sólo cambiar una URL — procedimiento en `PUSH-MOVIL.md §5`.

- **Precondición:** T8 y/o T9 en curso (device-token registrado); `EmailSettings.SendPushNotifications:
  true` y `PushNotificationServer: https://push-test.mattermost.com` (config del bootstrap).
- **Pasos exactos:**
  1. Confirmar la config efectiva del push:
     ```bash
     docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get EmailSettings.SendPushNotifications
     docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get EmailSettings.PushNotificationServer
     docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get EmailSettings.PushNotificationContents
     ```
  2. Con un móvil logueado y la app **cerrada**, enviar un mensaje que le genere notificación (mención o
     DM) desde otro dispositivo.
  3. Confirmar que la notificación aparece (puede tardar; TPNS no garantiza inmediatez).
- **Resultado esperado:** config → `true`, `https://push-test.mattermost.com`, `generic`. La
  notificación **generalmente** llega mostrando remitente + canal, sin el texto. Si **no** llega o
  llega tarde: **NO es bloqueante para el GO** — es el comportamiento esperado de un servicio sin SLA.
  Registrar el resultado tal cual (llegó / tardó / no llegó) y, si el push es crítico para el uso, abrir
  la decisión de migrar a HPNS.
- **Evidencia:** salida de los `config get`; captura (o registro) del intento de push con su tiempo de
  llegada. En el `CHECKLIST-PRODUCCION.md` este ítem admite quedar `[-]` (diferido) sin bloquear el cierre.

---

## T11 — Recuperación tras reboot 🟢 PRE-HOY (config) + 🔵 MANUAL (reboot)

- **Precondición:** stack levantado. El reboot real de la VM es una acción del dueño, en ventana coordinada.
- **Pasos exactos:**
  - **11a. PRE-HOY — verificar la política de reinicio (sin reiniciar nada):**
    ```bash
    docker inspect --format '{{.Name}} -> {{.HostConfig.RestartPolicy.Name}}' \
      echegaray-mm-app echegaray-mm-db echegaray-mm-caddy
    docker volume ls | grep -E 'caddy_(data|config)'   # el cert persiste -> no re-emite al arrancar
    ```
  - **11b. MANUAL — reboot planificado de la VM:** `sudo reboot`. Esperar a que la VM vuelva.
  - **11c. Verificar recuperación automática (tras el reboot):**
    ```bash
    docker ps --format '{{.Names}}: {{.Status}}' | grep echegaray-mm
    curl -sS -o /dev/null -w 'ping publico post-reboot: %{http_code}\n' \
      https://chat.ecsas.com.ar/api/v4/system/ping
    bash infra/mattermost/qa/pruebas.sh
    ```
- **Resultado esperado:** 11a → los tres contenedores con `unless-stopped` y los volúmenes `caddy_data`/
  `caddy_config` presentes. 11c → los tres contenedores `Up (healthy)` **sin intervención manual**, el
  ping público → `200`, y Caddy reusa el certificado de su volumen (no re-emite → evita rate limits de
  Let's Encrypt). `pruebas.sh` → todo OK.
- **Evidencia:** salida de `docker inspect` (11a), `docker ps` + ping 200 + `pruebas.sh` exit 0 (11c).
  Corresponde al ítem I del `CHECKLIST-PRODUCCION.md`.

---

## T12 — Rollback controlado (parar Caddy → MM vuelve a loopback) 🔵 MANUAL + 🟢 PRE-HOY (verificación)

Procedimiento en `infra/mattermost/ROLLBACK.md`; verificación read-only en `infra/mattermost/qa/rollback-test.md`.
Este ítem **no duplica** esos documentos: los referencia como el guion de aceptación del rollback.

- **Precondición:** Caddy publicando (para poder demostrar el rollback). La única acción mutante —
  parar/quitar **sólo** el contenedor Caddy — la ejecuta el dueño y es **reversible**.
- **Pasos exactos:**
  1. **Línea base** (read-only): `bash infra/mattermost/qa/pruebas.sh -v` + `ss -ltn | grep -E
     ':(80|443|8065|5432)$'` + `curl` al OS (paso 0 de `rollback-test.md`).
  2. **Rollback** (acción del dueño, reversible): `cd app/infra/mattermost && docker compose stop caddy
     && docker compose rm -f caddy`; y quitar el A record en DonWeb.
  3. **Verificar post-rollback** (read-only, paso 2 de `rollback-test.md`):
     - MM sigue vivo **sólo** en loopback: `curl http://127.0.0.1:8065/api/v4/system/ping` → 200;
       `ss -ltn | grep 8065` → `127.0.0.1:8065` (nunca `0.0.0.0`).
     - 80/443 **dejan de escuchar**: `ss -ltn | grep -E ':(80|443)$'` → sin resultado.
     - Postgres sigue sin listener; `chat.ecsas.com.ar` público → `000`.
     - OS con el **mismo** código HTTP que antes; volúmenes (incl. `caddy_data`) intactos.
     - `bash infra/mattermost/qa/pruebas.sh` → §1/§2/§3/§4/§5 OK, §6 `[PEND]`, exit `0`.
  4. **Restaurar:** `docker compose up -d caddy` + re-crear el A record → `pruebas.sh` §6 vuelve a OK.
- **Resultado esperado:** el rollback deja el sistema **exactamente en estado PRE-PR2** sin tocar datos,
  y es reversible sin re-emitir el certificado. Si tras el rollback `pruebas.sh` diera **FAIL** en
  §1/§2/§5, el rollback rompió algo que no debía (paró MM, expuso un puerto o afectó al OS).
- **Evidencia:** salidas de los pasos 1 y 3; exit code 0 del `pruebas.sh` post-rollback; captura de que
  el OS mantuvo su código HTTP. Corresponde al ítem J del `CHECKLIST-PRODUCCION.md`.

---

## Checklist Final de Aceptación — GO / NO-GO

Marcar cada ítem. Convención: `[ ]` pendiente · `[x]` verificado · `[~]` en curso · `[-]` no aplica / diferido.

### Bloque hoy (pre-validable sin DNS/Caddy) — debe estar 100% antes de activar

| ✔ | Ítem | Criterio de aceptación | Fuente |
|---|---|---|---|
| [ ] | T0 Base local + aislamiento | `pruebas.sh` §1–§5 OK, exit 0; 8065 sólo loopback, 5432 sin listener | `pruebas.sh` |
| [ ] | T3a WS local | `/api/v4/websocket` loopback → `101` | `pruebas.sh` §1d |
| [ ] | T4a Admin autentica | admin en `user list`; login API loopback → `200` + Token | mmctl / API |
| [ ] | T5 Equipo + canales | `echegaray` + `direccion/obras/administracion/compras` (+ town-square/off-topic) | mmctl |
| [ ] | T6a Mensajes en vivo (loopback) | 2 usuarios se ven los mensajes sin refrescar | web loopback |
| [ ] | T7a/b Archivos (loopback) | `EnableFileAttachments=true`, `MaxFileSize=100MB`; imagen+audio+PDF suben; >100MB rechazado | mmctl / web |
| [ ] | T10.1 Config push | `SendPushNotifications=true`, server=TPNS, contents=`generic` | mmctl |
| [ ] | T11a Restart policy | MM+DB+Caddy = `unless-stopped`; volúmenes `caddy_*` presentes | docker inspect |

### Bloque post-activación (requiere DNS propagado + Caddy publicando)

| ✔ | Ítem | Criterio de aceptación | Fuente |
|---|---|---|---|
| [ ] | T1 Smoke HTTPS público | ping público → `200`; cert `Verify return code: 0`, no self-signed, LE/ZeroSSL, >7 días | `pruebas.sh` §6 |
| [ ] | T2 Redirección 80→443 | `http://chat…/` → `3xx` + `Location: https://…` | `pruebas.sh` §6f |
| [ ] | T3b WS público | `/api/v4/websocket` por HTTPS → `101`; SiteURL = `https://chat.ecsas.com.ar` | `pruebas.sh` §6g |
| [ ] | T4b Login web público | login por navegador en `https://chat…` con candado válido | manual |
| [ ] | T6b Mensajes tiempo real público | mensaje en vivo entre 2 usuarios por Caddy | manual |
| [ ] | T7d Archivos desde móvil | subida desde app oficial sin error 413 de proxy | manual |

### Bloque manual del dueño (celular / reboot / rollback)

| ✔ | Ítem | Criterio de aceptación | Bloquea GO |
|---|---|---|---|
| [ ] | T8 Móvil Android | login + mensaje en vivo + push con app cerrada | Sí (login+vivo); push no |
| [ ] | T9 Móvil iPhone | login + mensaje en vivo + push con app cerrada | Sí (login+vivo); push no |
| [ ] | T10 Push TPNS llega | notificación con quién/canal, sin texto — **sin SLA** | **No** (best-effort; puede quedar `[-]`) |
| [ ] | T11 Supervivencia a reboot | tras `reboot`, los 3 contenedores vuelven solos + ping público `200` | Sí |
| [ ] | T12 Rollback probado | parar Caddy → MM sólo loopback, 80/443 sin listener, OS intacto, reversible | Sí |

### Criterio de GO / NO-GO

**GO (PR-2 productivo)** cuando se cumplan **todas** estas condiciones:

1. **Bloque hoy** 100% en `[x]` (base sana antes de exponer).
2. **Bloque post-activación** 100% en `[x]` (T1, T2, T3b, T4b, T6b, T7d).
3. **Bloque manual:** T8 y T9 con **login + mensaje en vivo** OK; T11 (reboot) OK; T12 (rollback) OK.
4. `bash infra/mattermost/qa/pruebas.sh` → **exit 0 sin ningún FAIL**, con §6 en OK (Caddy publicando).
5. El `CHECKLIST-PRODUCCION.md` (bloques A, B, C, D, E, H, I, J) en `[x]`; F y G validados o anotados.

**NO-GO** si aparece cualquiera de:

- Algún `FAIL` en `pruebas.sh` §1/§2/§5 (regresión en base local, aislamiento u OS).
- `0.0.0.0:8065` o `0.0.0.0:5432` visibles en la VM (superficie de red mal → viola la regla de oro del PR).
- Certificado self-signed, no confiable o vencido (T1).
- WebSocket público sin `101` (T3b) → no hay tiempo real ni push real.
- El rollback (T12) rompe MM, expone un puerto o afecta al OS.

**No bloquean el GO** (se registran y se difieren si hace falta): la **entrega efectiva del push TPNS**
(T10) por ser un servicio **sin SLA**; el push queda como best-effort hasta una eventual migración a
HPNS (decisión de negocio, `PUSH-MOVIL.md §4-5`).

---

## Trazabilidad con el aparato existente

- Los ítems con fuente `pruebas.sh` se auto-verifican corriendo el script — no se re-implementan acá.
- Este plan agrega la capa **funcional de uso real** (login, mensajería, archivos, móvil, push) que un
  script read-only no puede cubrir por sí solo.
- El `CHECKLIST-PRODUCCION.md` sigue siendo el checklist de **cierre técnico** del PR; este documento es
  el de **aceptación funcional**. Ambos deben quedar completos para el GO.
