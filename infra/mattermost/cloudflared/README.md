# Cloudflare Tunnel — Exposición pública de Mattermost (PR-2)

Publica **https://chat.ecsas.com.ar** hacia el Mattermost que corre **solo en loopback**
(`127.0.0.1:8065`), mediante un **túnel saliente** hacia el edge de Cloudflare.
**No se abre ningún puerto entrante** en la VM y **no se mueve la zona**: `ecsas.com.ar`
sigue en DonWeb; solo se agrega un CNAME.

```
navegador ──HTTPS/WSS──▶ edge Cloudflare ──túnel saliente──▶ cloudflared (esta VM)
                                                          └──HTTP──▶ 127.0.0.1:8065 (Mattermost)
```

## Estado actual (antes de activar)

- Mattermost `echegaray-mm-app`: healthy, escuchando **solo** en `127.0.0.1:8065`.
- `cloudflared` v2026.7.1 instalado en `/home/jorge/bin/cloudflared`.
- **No** hay túnel creado, **ni** `cert.pem`, **ni** servicio systemd todavía.
- `chat.ecsas.com.ar` **no resuelve** nada aún.

## Los 2 pasos que requieren al DUEÑO (Nivel E — credenciales / DNS)

Estos dos pasos **no** se pueden automatizar: uno abre una sesión autenticada de Cloudflare
y el otro toca el DNS productivo. El resto es copy-paste reproducible.

### PASO DUEÑO 1 — Autenticar cloudflared contra Cloudflare

```bash
cloudflared tunnel login
```

Abre el navegador para iniciar sesión en la cuenta Cloudflare y autorizar. Genera
`~/.cloudflared/cert.pem` (el "origin certificate" que habilita crear túneles).

> Requisito previo: la cuenta de Cloudflare debe existir. Como la zona `ecsas.com.ar`
> se queda en DonWeb, **no hace falta** delegar la zona a Cloudflare: alcanza con una
> cuenta Cloudflare (aunque no administre la zona) para operar túneles con hostname vía CNAME.

### PASO DUEÑO 2 — Agregar el CNAME en DonWeb

En el panel de DonWeb (DNS de `ecsas.com.ar`), crear **un solo** registro:

| Tipo  | Nombre | Valor                              | TTL  |
|-------|--------|------------------------------------|------|
| CNAME | `chat` | `<TUNNEL_UUID>.cfargotunnel.com`   | 3600 |

- `<TUNNEL_UUID>` es el que imprime `cloudflared tunnel create` (paso automatizado 2, abajo).
- **No** se tocan MX / SPF / DKIM / DMARC ni los nameservers. Solo se agrega este CNAME.

---

## Pasos automatizados (copy-paste, los ejecuta el OS/operador)

Todo lo siguiente es reproducible y reversible (ver `../ROLLBACK.md`).

### 1. Crear el túnel

```bash
cloudflared tunnel create echegaray-mm
```

Imprime el **TUNNEL_UUID** y crea el credentials-file `~/.cloudflared/<TUNNEL_UUID>.json`.
Anotá el UUID: se usa en `config.yml` y en el CNAME (PASO DUEÑO 2).

Verificar:

```bash
cloudflared tunnel list          # debe aparecer "echegaray-mm" con su UUID
```

### 2. Cablear el UUID en la config

Reemplazar los dos `<TUNNEL_UUID>` de `config.yml` por el UUID real:

```bash
# Desde infra/mattermost/cloudflared/
UUID="$(cloudflared tunnel list --output json | python3 -c 'import sys,json;print([t["id"] for t in json.load(sys.stdin) if t["name"]=="echegaray-mm"][0])')"
sed -i "s/<TUNNEL_UUID>/$UUID/g" config.yml
grep -n "$UUID" config.yml       # confirmar que quedó en tunnel: y credentials-file:
```

### 3. Instalar binario, config y credenciales en rutas del sistema

```bash
sudo install -m0755 /home/jorge/bin/cloudflared /usr/local/bin/cloudflared
sudo mkdir -p /etc/cloudflared
sudo cp config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/"$UUID".json /etc/cloudflared/    # credentials-file (secreto, NO al repo)
sudo chmod 600 /etc/cloudflared/"$UUID".json
```

> El credentials-file `<UUID>.json` es un **secreto** del túnel: vive en `/etc/cloudflared/`,
> nunca en el repo. `config.yml` sí se versiona (con el UUID, que no es secreto).

### 4. Instalar y arrancar el servicio systemd

```bash
sudo cp cloudflared.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager        # active (running)
journalctl -u cloudflared -n 40 --no-pager          # "Registered tunnel connection" x4
```

### 5. (Después del PASO DUEÑO 2) Verificar la exposición pública

```bash
# El edge de Cloudflare responde con el hostname público (esperar propagación DNS, minutos):
curl -I https://chat.ecsas.com.ar/api/v4/system/ping    # HTTP/2 200
curl -s https://chat.ecsas.com.ar/api/v4/system/ping    # {"status":"OK",...} o {"status":"OK"}

# El origen sigue SOLO en loopback (esto NO debe cambiar):
curl -f http://127.0.0.1:8065/api/v4/system/ping        # {"status":"OK"}

# El WebSocket viaja por el mismo hostname (chequeo de handshake):
#   en la app web de MM, DevTools ▸ Network ▸ WS ▸ debe conectar a
#   wss://chat.ecsas.com.ar/api/v4/websocket con status 101.
```

Si `curl -I https://chat.ecsas.com.ar` falla:
- **DNS**: `dig +short chat.ecsas.com.ar CNAME` debe devolver `<UUID>.cfargotunnel.com`.
- **Túnel**: `cloudflared tunnel info echegaray-mm` debe mostrar conexiones activas.
- **Servicio**: `journalctl -u cloudflared -n 60 --no-pager`.

## Notas

- **WebSocket**: Cloudflare Tunnel soporta WebSocket de forma nativa (no aplica la
  limitación del proxy CDN de planes free); no requiere configuración extra en Mattermost
  más allá de `SiteURL=https://chat.ecsas.com.ar` (ya seteado en el compose vía `.env`).
- **Puertos**: el túnel es 100% saliente. Ver `../ufw/README.md` para verificar que no hay
  puertos entrantes de MM abiertos.
- **Rollback**: `../ROLLBACK.md` deja el sistema exactamente en el estado pre-PR2.
