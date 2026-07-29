# ACTIVACIÓN NIVEL E — Exposición pública de Mattermost (PR-2 · Path B / Caddy)

Instructivo **paso a paso, copy-paste**, para pasar Mattermost de "sólo local" (PR-1) a
**publicado en `https://chat.ecsas.com.ar`** con un reverse proxy **Caddy** y certificado
**Let's Encrypt** automático. Es una acción de **Nivel E** (efecto externo real: abre puertos,
crea DNS, publica un servicio en Internet), así que **la ejecuta el dueño**, en una ventana
coordinada, siguiendo estos 12 pasos en orden.

> **Arquitectura:** Caddy (`echegaray-mm-caddy`, contenedor del compose) escucha en **80/443**,
> termina TLS con Let's Encrypt/ZeroSSL (ACME automático) y hace `reverse_proxy` a
> `mattermost:8065` por la red interna. Mattermost sigue publicando sólo `127.0.0.1:8065` en el
> host; Postgres sigue sin puertos. **NO se usa Cloudflare Tunnel.**

> **Datos fijos de este despliegue:**
> - VM (esta máquina): IP pública **`64.176.22.159`** (proveedor **Vultr**).
> - Dominio de chat: **`chat.ecsas.com.ar`** (zona DNS en **DonWeb**).
> - Business OS: `app.ecsas.com.ar` (Vercel) — **debe seguir intacto** todo el tiempo.
> - Directorio de la infra en la VM: `app/infra/mattermost/` (ajustá el `cd` a tu ruta real).

> **Regla previa:** antes de empezar, dejá una línea base sana:
> ```bash
> cd app/infra/mattermost
> bash qa/pruebas.sh          # esperado hoy: exit 0, 13 OK / 7 PENDIENTE / 0 FAIL
> ```
> Si eso ya da FAIL, **no sigas**: primero se arregla la base local (§1/§2/§5 del script).

---

## Paso 1 — [Vultr] Abrir 80 y 443 entrantes en el firewall de la VM

En el panel de **Vultr** → tu instancia → **Firewall** (o "Firewall Group" asociado a la VM),
agregar dos reglas de entrada (IPv4, y si la VM tiene IPv6 también IPv6):

| Acción  | Protocolo | Puerto | Origen      | Para qué |
|---------|-----------|--------|-------------|----------|
| Aceptar | TCP       | 80     | `0.0.0.0/0` | Reto ACME HTTP-01 + redirección a HTTPS |
| Aceptar | TCP       | 443    | `0.0.0.0/0` | HTTPS público de Mattermost (Caddy) |

**No abrir** 8065 ni 5432 (nunca van al exterior). No tocar la regla de SSH (22).

**Resultado esperado:** desde afuera, `nc -vz 64.176.22.159 443` conecta (aunque todavía no
haya nada escuchando, el firewall ya no bloquea). Si Vultr no usa firewall group y la VM sólo
tiene `ufw`, ver el bloque alternativo al final de este paso.

> **Alternativa con `ufw` en la VM** (sólo si NO se usa firewall de Vultr): hay reglas de
> ejemplo en `infra/mattermost/ufw/`. En esencia:
> ```bash
> sudo ufw allow 80/tcp
> sudo ufw allow 443/tcp
> sudo ufw status verbose      # deben figurar 80 y 443 ALLOW
> ```

## Paso 2 — [DonWeb] Crear el A record `chat → 64.176.22.159`

En el panel de **DonWeb** → DNS de la zona **`ecsas.com.ar`** → agregar UN registro:

| Tipo | Nombre | Valor           | TTL  |
|------|--------|-----------------|------|
| A    | `chat` | `64.176.22.159` | 3600 |

**No tocar** ningún otro registro. En especial, **NO** modificar **MX**, **SPF** (TXT),
**DKIM** (TXT) ni **DMARC** (TXT): el correo de `ecsas.com.ar` no se toca en este PR.

**Resultado esperado:** el registro queda listado como `chat.ecsas.com.ar. A 64.176.22.159`.

## Paso 3 — Esperar la propagación DNS (verificar con `dig`)

Desde la VM (o cualquier máquina):

```bash
dig +short chat.ecsas.com.ar A
```

**Resultado esperado:** imprime exactamente `64.176.22.159`. Si sale vacío, todavía no
propagó — esperar (TTL 3600 = hasta ~1 h la primera vez) y reintentar. Podés forzar un
resolver público para descartar caché local:

```bash
dig +short chat.ecsas.com.ar A @1.1.1.1
```

**No avances al Paso 5 hasta que esto devuelva la IP:** Caddy necesita el DNS resuelto para
que Let's Encrypt valide el dominio (reto HTTP-01). Si levantás Caddy antes, reintentará solo,
pero es más limpio esperar.

## Paso 4 — Configurar `ACME_EMAIL`, `CHAT_DOMAIN` y `MM_SITE_URL` en `.env`

En la VM, editar `app/infra/mattermost/.env` (el archivo real, gitignoreado):

```bash
cd app/infra/mattermost
cp -n .env.example .env         # si aún no existe; si ya existe, editá el que hay
nano .env
```

Asegurar estas tres variables (crear las que falten):

```dotenv
# Dominio público que sirve Caddy y para el que saca el certificado.
CHAT_DOMAIN=chat.ecsas.com.ar

# Email de la cuenta ACME (avisos de expiración de Let's Encrypt). Usar uno real y monitoreado.
ACME_EMAIL=administracion@ecsas.com.ar

# Mattermost lo usa para el origin del WebSocket, CSRF y los enlaces que genera.
# DEBE coincidir con el dominio público servido por Caddy.
MM_SITE_URL=https://chat.ecsas.com.ar
```

**Resultado esperado:** `grep -E 'CHAT_DOMAIN|ACME_EMAIL|MM_SITE_URL' .env` muestra las tres
con los valores de arriba. (El resto de `.env` —secreto de la base, `TZ`— ya viene de PR-1.)

## Paso 5 — Levantar Caddy (`docker compose up -d caddy`)

Caddy arranca, valida el dominio contra Let's Encrypt por el reto HTTP-01 (puerto 80) y saca
el certificado **solo** — no hay que generar ni copiar nada a mano.

```bash
cd app/infra/mattermost
docker compose up -d caddy
docker compose ps caddy                          # State: running (Up)
docker compose logs -f caddy                      # seguir hasta ver el cert emitido; Ctrl-C para salir
```

**Resultado esperado en los logs de Caddy** (aparece en segundos a ~1 min): líneas del tipo
`certificate obtained successfully` / `serving initial configuration` para
`chat.ecsas.com.ar`, **sin** bucles de `challenge failed`. Si repite `challenge failed`,
volvé al Paso 1 (¿80 abierto?) y Paso 3 (¿DNS resuelve a la IP correcta?).

> El certificado y la cuenta ACME quedan persistidos en los volúmenes `caddy_data`/`caddy_config`:
> un reinicio de Caddy **reusa** el cert (no re-tramita), evitando los rate limits de Let's Encrypt.

## Paso 6 — Verificar HTTPS público

```bash
curl -I https://chat.ecsas.com.ar/api/v4/system/ping
```

**Resultado esperado:** `HTTP/2 200`. Y la redirección desde HTTP:

```bash
curl -I http://chat.ecsas.com.ar/
```

**Resultado esperado:** un `3xx` (p. ej. `HTTP/1.1 308 Permanent Redirect`) con `Location:
https://chat.ecsas.com.ar/` (Caddy redirige 80→443 por defecto).

Cierre automático de este bloque con el QA:

```bash
bash qa/pruebas.sh
```

**Resultado esperado:** exit 0 y **§6 en OK** (Caddy running, DNS, HTTPS 200, SSL cadena
confiable / no self-signed / no vencido, redirección 80→443, WebSocket público 101). Los
únicos PENDIENTE que pueden quedar son los **(manual)** de app móvil.

## Paso 7 — Bootstrap de Mattermost (idempotente)

Deja la instancia lista para uso: aplica config declarativa, crea el admin, el equipo
"Echegaray" y los canales. Es **idempotente** (se puede correr N veces sin duplicar).

```bash
cd app/infra/mattermost/bootstrap
cp -n .env.bootstrap.example .env.bootstrap       # completar admin/equipo con valores REALES
nano .env.bootstrap                                # MM_ADMIN_*, MM_TEAM_* — password fuerte, no el placeholder
./bootstrap.sh
```

**Resultado esperado:** el script termina sin error y confirma admin + equipo + canales
creados. Verificación:

```bash
docker exec echegaray-mm-app /mattermost/bin/mmctl --local user list | head
docker exec echegaray-mm-app /mattermost/bin/mmctl --local team list
```

**Resultado esperado:** aparece el admin y el equipo "Echegaray". (Esto además apaga el ruido
benigno `List of admins is empty` de los logs.)

## Paso 8 — Primer login del admin por la web

En un navegador: **`https://chat.ecsas.com.ar`** → iniciar sesión con el
`MM_ADMIN_USERNAME` / `MM_ADMIN_PASSWORD` que pusiste en `.env.bootstrap`.

**Resultado esperado:** entra al equipo "Echegaray", ve los canales creados, el candado del
navegador muestra un certificado válido de **Let's Encrypt** (no advertencia de seguridad).
Enviar un mensaje de prueba en un canal.

## Paso 9 — Validar en Android (app oficial de Mattermost)

En el teléfono Android:

1. Instalar/abrir la app oficial **Mattermost** (Google Play).
2. Servidor: **`https://chat.ecsas.com.ar`** → **Connect**.
3. Iniciar sesión con una cuenta real (el admin u otra ya creada).
4. Abrir un canal y **enviar un mensaje**.
5. Desde la web (Paso 8) escribir en el mismo canal y confirmar que **llega en vivo al teléfono**
   (prueba directa de que el WebSocket atraviesa Caddy hasta el móvil).
6. Poner la app en segundo plano y, desde otro dispositivo, mandar un mensaje: confirmar que
   **llega la notificación push** (TPNS de Mattermost).

**Resultado esperado:** conecta sin advertencias de certificado, mensajes en tiempo real, y
push funcionando.

## Paso 10 — Validar en iPhone (app oficial de Mattermost)

Idéntico al Paso 9 en iOS:

1. Instalar/abrir la app oficial **Mattermost** (App Store).
2. Servidor: **`https://chat.ecsas.com.ar`** → **Connect**.
3. Login con una cuenta real → abrir un canal → **enviar un mensaje**.
4. Confirmar **mensaje en vivo** (cruzado con la web) y **notificación push** con la app en
   segundo plano.

**Resultado esperado:** igual que Android — conexión limpia, tiempo real y push OK.

## Paso 11 — Reboot de la VM y verificar recuperación automática

Prueba de resiliencia: los contenedores tienen `restart: unless-stopped`, así que MM + DB +
Caddy deben volver **solos** tras un reinicio, y Caddy reusar su certificado.

```bash
# Coordinar la ventana (habrá unos minutos sin chat). Luego:
sudo reboot
```

Cuando la VM vuelva (esperar ~1-2 min y reconectar por SSH):

```bash
cd app/infra/mattermost
docker compose ps                                 # mattermost, mattermost-db y caddy: Up (healthy)
curl -I https://chat.ecsas.com.ar/api/v4/system/ping   # HTTP/2 200 (sin haber tocado nada)
bash qa/pruebas.sh                                 # exit 0, §6 en OK
```

**Resultado esperado:** todo vuelve sin intervención manual; el HTTPS responde 200 usando el
cert persistido (no hubo re-emisión). Si algo no levantó solo, revisar
`docker compose logs <servicio>`.

## Paso 12 — Ejecutar y verificar el rollback

Confirmar que la exposición pública se puede revertir de forma limpia y reversible, siguiendo
**`infra/mattermost/ROLLBACK.md`**. En esencia (parar y quitar **sólo Caddy**, sin tocar MM/DB):

```bash
cd app/infra/mattermost
docker compose stop caddy
docker compose rm -f caddy
# + (DonWeb) quitar el A record 'chat' si se quiere rollback total del DNS.
```

Verificación read-only guiada por `infra/mattermost/qa/rollback-test.md`:

```bash
curl -s -o /dev/null -w 'MM loopback: %{http_code}\n' http://127.0.0.1:8065/api/v4/system/ping   # 200
ss -ltn | grep -E ':(80|443)$' || echo 'OK: 80/443 ya no escuchan (Caddy abajo)'                 # sin listener
curl -s -o /dev/null -w 'chat publico: %{http_code}\n' --max-time 10 https://chat.ecsas.com.ar/api/v4/system/ping  # 000
curl -s -o /dev/null -w 'OS: %{http_code}\n' https://app.ecsas.com.ar/                            # mismo código que antes
bash qa/pruebas.sh                                                                                 # exit 0, §6 PENDIENTE
```

**Resultado esperado:** MM sigue vivo sólo en loopback, 80/443 dejan de escuchar, `chat`
público → 000 (rollback efectivo, **no** es un fallo), el OS intacto, y los volúmenes (incl.
`caddy_data` con el cert) sin borrar. **Re-publicar** es volver a `docker compose up -d caddy`
(y re-crear el A record si se quitó); Caddy reusa el cert y republica.

---

## Resumen de estados esperados por `bash qa/pruebas.sh`

| Momento | Exit | §1-§5 | §6 |
|---|---|---|---|
| Antes de activar (hoy) | 0 | OK | PENDIENTE (Caddy no desplegado) |
| Tras Paso 6 (Caddy publicando) | 0 | OK | OK (salvo app móvil, manual) |
| Tras Paso 12 (rollback) | 0 | OK | PENDIENTE (Caddy no desplegado) |
| Regresión real en cualquier momento | **1** | FAIL donde corresponda | — |

Cualquier **FAIL** después del Paso 6 es un problema real (SSL/WS/Caddy/puerto expuesto/OS
caído) y hay que resolverlo antes de dar por cerrado el PR-2. El criterio de cierre completo,
ítem por ítem, está en `infra/mattermost/qa/CHECKLIST-PRODUCCION.md`.
