# UFW — Verificación de puertos (Mattermost + Cloudflare Tunnel, PR-2)

La topología de PR-2 **no requiere abrir ningún puerto entrante** para Mattermost: el túnel
de Cloudflare es **saliente** y Mattermost escucha **solo en loopback**. Este README documenta
cómo **verificar** ese invariante. **Los comandos `ufw` de abajo NO se ejecutan acá** (requieren
`sudo` y tocan el firewall productivo): son para que el dueño/operador los corra a conciencia.

## Invariante que debe cumplirse

1. Mattermost escucha **solo** en `127.0.0.1:8065` (nunca `0.0.0.0:8065`).
2. `cloudflared` abre **conexiones salientes** al edge de Cloudflare (443/QUIC), no un puerto entrante.
3. No hace falta **ninguna** regla `ufw allow` nueva para exponer `chat.ecsas.com.ar`.

## Chequeo read-only (SIN sudo) — evidencia real de esta VM

```bash
# ¿En qué interfaz escucha Mattermost? Debe ser 127.0.0.1, no 0.0.0.0.
ss -tlnH | grep ':8065'
```

Salida verificada en esta VM (PR-2, antes de activar el túnel):

```
LISTEN 0  4096  127.0.0.1:8065  0.0.0.0:*
```

→ **Correcto**: `8065` está atado a loopback. No es alcanzable desde fuera de la VM.
Confirma el binding `127.0.0.1:8065:8065` del `docker-compose.yml` y el
`no-new-privileges` del contenedor.

```bash
# Ningún socket de escucha en 0.0.0.0 para 8065 (debe no imprimir nada):
ss -tlnH | awk '{print $4}' | grep -E '^0\.0\.0\.0:8065$|^\[::\]:8065$' || echo "OK: 8065 no escucha en todas las interfaces"
```

## Verificación con UFW (REQUIERE sudo — DOCUMENTADO, no ejecutar desde el OS)

```bash
# Estado y reglas activas. NO debe existir ninguna regla que abra 8065 al exterior.
sudo ufw status verbose

# Confirmar explícitamente que 8065 no está permitido entrante:
sudo ufw status | grep -E '8065' || echo "OK: sin regla entrante para 8065"
```

### Lo que NO hay que hacer

- **No** `sudo ufw allow 8065` — expondría Mattermost saltándose el túnel (rompe la topología segura).
- **No** publicar el puerto a `0.0.0.0` en `docker-compose.yml`.

### Reglas mínimas recomendadas (referencia — el dueño decide y ejecuta)

El túnel funciona sin abrir nada entrante. Un firewall sano para esta VM sería:

```bash
sudo ufw default deny incoming        # nada entrante por defecto
sudo ufw default allow outgoing       # saliente permitido (lo necesita cloudflared)
sudo ufw allow 22/tcp                 # SSH (mantener el acceso de administración)
sudo ufw enable
# NO se agrega ninguna regla para 8065 ni para el túnel: es saliente.
```

> Docker puede insertar reglas en `iptables` por debajo de UFW. Como el puerto se publica en
> `127.0.0.1:8065` (no `0.0.0.0`), Docker **no** lo expone al exterior. Verificarlo con el
> chequeo `ss` de arriba, que refleja el binding real independientemente de UFW.

## Verificación de que el túnel es saliente (tras activarlo)

```bash
# cloudflared no debe abrir un puerto de escucha entrante (solo su metrics en loopback):
ss -tlnH | grep -i cloudflared || echo "OK: cloudflared no escucha entrante"
# Sus conexiones son salientes al edge de Cloudflare:
sudo ss -tnp | grep cloudflared        # ESTAB hacia IPs de Cloudflare, puerto remoto 443/7844
```
