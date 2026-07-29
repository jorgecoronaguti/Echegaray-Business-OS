# Caddy — Reverse proxy público de Mattermost (PR-2, Path B)

Publica **https://chat.ecsas.com.ar** hacia el Mattermost que corre **solo en la red interna**
del compose (`mattermost:8065`). Caddy es el **único** servicio que mira a Internet (puertos
**80/443**), termina TLS con **ACME automático** (Let's Encrypt/ZeroSSL) y proxya al backend.
Mattermost **nunca** se expone directo: sigue en `127.0.0.1:8065` solo para health/mmctl locales.

```
navegador ──HTTPS/WSS (443)──▶ echegaray-mm-caddy ──HTTP (red interna)──▶ mattermost:8065
                                (TLS + ACME auto)                          (loopback + interna)
```

Caddy corre como **servicio Docker** en el mismo `../docker-compose.yml` (contenedor
`echegaray-mm-caddy`, imagen `caddy:2-alpine`, `restart: unless-stopped`). No hay systemd ni
binario en el host: todo vive en el compose.

## Qué hace y por qué es simple

- **HTTPS automático**: Caddy obtiene y **renueva solo** el certificado de `chat.ecsas.com.ar`.
  No hay que instalar certbot, cron de renovación ni tocar nginx. Un `reverse_proxy` y listo.
- **HTTP→HTTPS**: Caddy agrega la redirección automáticamente (no se declara en el Caddyfile).
- **WebSocket transparente**: `reverse_proxy` de Caddy v2 hace el upgrade y el túnel
  bidireccional sin configuración especial (verificado contra la doc oficial de Caddy).
  Mattermost necesita el WebSocket para tiempo real; funciona sin nada extra.
- **Certificados persistentes**: viven en el volumen Docker `caddy_data` (mapeado a `/data`),
  no en el repo. Sobreviven reinicios/recreaciones del contenedor, así la renovación no se pierde.

La config completa es el archivo declarativo [`Caddyfile`](./Caddyfile) (montado read-only en
`/etc/caddy/Caddyfile`). Dominio y email de ACME se parametrizan por entorno (`CHAT_DOMAIN`,
`ACME_EMAIL`), inyectados desde `.env` vía el compose.

## Prerrequisitos (los cumple el DUEÑO — Nivel E: DNS + firewall)

Antes de que Caddy pueda emitir el certificado y quedar público:

1. **A record propagado** en DonWeb (DNS de `ecsas.com.ar`), **un solo** registro nuevo:

   | Tipo | Nombre | Valor           | TTL  |
   |------|--------|-----------------|------|
   | A    | `chat` | `64.176.22.159` | 3600 |

   No se tocan NS / MX / SPF / DKIM / DMARC ni Google Workspace. Verificar propagación:
   `dig +short chat.ecsas.com.ar` debe devolver `64.176.22.159`.

2. **Puertos 80 y 443 entrantes habilitados** en el firewall de Vultr (panel de la VM) y, si se
   usa UFW en el host, permitidos ahí también (ver [`../ufw/README.md`](../ufw/README.md)). Caddy
   los necesita: **80** para el desafío ACME HTTP-01 + el redirect a HTTPS, **443** para servir
   HTTPS (y el desafío TLS-ALPN-01 como alternativa). Sin estos puertos, ACME no puede validar
   el dominio y no se emite el certificado.

3. **Puertos 80 y 443 libres en el host** (que ningún otro proceso los ocupe). Verificar:
   `ss -tlnH | grep -E ':80 |:443 '` no debe imprimir nada antes de arrancar Caddy.

## Arrancar / parar

```bash
cd app/infra/mattermost
cp .env.example .env          # editar: setear ACME_EMAIL real, confirmar CHAT_DOMAIN

# Arrancar solo Caddy (Mattermost ya debe estar healthy):
docker compose up -d caddy

# Ver logs (la primera emisión de certificado aparece acá):
docker compose logs -f caddy

# Parar / quitar Caddy (deja MM en loopback = estado pre-PR2, ver ../ROLLBACK.md):
docker compose stop caddy
docker compose rm -f caddy
```

> Todo el stack junto: `docker compose up -d` levanta `mattermost-db`, `mattermost` y `caddy`
> respetando el orden (`caddy` espera a que Mattermost esté healthy).

## Verificar (después de A record + puertos)

```bash
# Caddy corriendo y saludable:
docker compose ps caddy

# El origen sigue SOLO en loopback (esto NO debe cambiar):
curl -f http://127.0.0.1:8065/api/v4/system/ping        # {"status":"OK"}

# El hostname público responde por HTTPS (esperar emisión de cert + propagación DNS, minutos):
curl -I https://chat.ecsas.com.ar/api/v4/system/ping    # HTTP/2 200
curl -s https://chat.ecsas.com.ar/api/v4/system/ping    # {"status":"OK"}

# HTTP redirige a HTTPS:
curl -I http://chat.ecsas.com.ar/                        # 308/301 -> https://

# WebSocket: en la app web de MM, DevTools ▸ Network ▸ WS ▸ debe conectar a
#   wss://chat.ecsas.com.ar/api/v4/websocket con status 101.
```

Si `curl -I https://chat.ecsas.com.ar` falla:
- **DNS**: `dig +short chat.ecsas.com.ar` debe devolver `64.176.22.159`.
- **Certificado**: `docker compose logs caddy | grep -i "certificate\|acme\|error"` — la emisión
  requiere 80/443 alcanzables desde Internet y el A record propagado.
- **Puertos**: confirmar en el panel de Vultr que 80/443 entrantes están permitidos.

## Validar el Caddyfile sin levantar nada

```bash
docker run --rm -v "$PWD/caddy/Caddyfile":/etc/caddy/Caddyfile:ro \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile   # -> "Valid configuration"
```

## Reversión

`../ROLLBACK.md`: parar y quitar el contenedor Caddy deja a Mattermost exactamente en el estado
pre-PR2 (solo loopback). El dueño quita el A record en DonWeb.
