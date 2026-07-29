# UFW / Firewall — Puertos de Mattermost + Caddy (PR-2, Path B)

La topología de PR-2 (Path B) expone Mattermost detrás del **reverse proxy Caddy**. Caddy es el
**único** que mira a Internet y necesita **80/443 entrantes**. Mattermost sigue **solo en
loopback**. Este README documenta qué debe estar abierto y qué **no**, y cómo verificarlo.
**Los comandos `ufw` de abajo NO se ejecutan acá** (requieren `sudo` y tocan el firewall
productivo): son para que el dueño/operador los corra a conciencia.

> Además de UFW en el host, esta VM está en **Vultr**: si hay un **firewall de nube** activo en el
> panel de Vultr, 80/443 entrantes deben habilitarse **también** ahí, o ACME no podrá validar el
> dominio y no se emitirá el certificado.

## Invariante que debe cumplirse

1. **Caddy** escucha en `0.0.0.0:80` y `0.0.0.0:443` (público) — es el borde de entrada.
2. **Mattermost** escucha **solo** en `127.0.0.1:8065` (nunca `0.0.0.0:8065`): no se expone directo.
3. **PostgreSQL** no publica ningún puerto (solo red interna del compose).
4. Puerto **22** (SSH) permitido para administración. Todo lo demás entrante, denegado.

## Chequeo read-only (SIN sudo) — evidencia real de esta VM

```bash
# Mattermost debe seguir SOLO en loopback:
ss -tlnH | grep ':8065'
```

Salida esperada (correcto):

```
LISTEN 0  4096  127.0.0.1:8065  0.0.0.0:*
```

→ `8065` atado a loopback: no alcanzable desde fuera de la VM. Confirma el binding
`127.0.0.1:8065:8065` del `docker-compose.yml`.

```bash
# Ningún socket de escucha en 0.0.0.0 para 8065 (debe no imprimir nada):
ss -tlnH | awk '{print $4}' | grep -E '^0\.0\.0\.0:8065$|^\[::\]:8065$' || echo "OK: 8065 no escucha en todas las interfaces"

# Con Caddy corriendo, 80/443 SÍ deben escuchar en todas las interfaces (es el borde público):
ss -tlnH | grep -E ':80 |:443 '
# Esperado (Caddy arriba): LISTEN ... 0.0.0.0:80 y 0.0.0.0:443 (y/o [::]:80 [::]:443)
# Antes de levantar Caddy: sin salida (80/443 libres — requisito para que Caddy pueda tomarlos).
```

## Reglas UFW (REQUIEREN sudo — DOCUMENTADO, no ejecutar desde el OS)

Firewall sano para esta VM con Caddy como borde público:

```bash
sudo ufw default deny incoming        # nada entrante por defecto
sudo ufw default allow outgoing       # saliente permitido (ACME sale a la CA)
sudo ufw allow 22/tcp                 # SSH (mantener el acceso de administración)
sudo ufw allow 80/tcp                 # Caddy: desafío ACME HTTP-01 + redirect a HTTPS
sudo ufw allow 443/tcp                # Caddy: HTTPS público (+ TLS-ALPN-01 alternativo)
sudo ufw enable
# NO se abre 8065 ni 5432: Mattermost y Postgres no se exponen directo.
```

Verificar:

```bash
sudo ufw status verbose
sudo ufw status | grep -E '80/tcp|443/tcp'            # deben estar ALLOW IN
sudo ufw status | grep -E '8065|5432' || echo "OK: sin regla entrante para 8065/5432"
```

### Lo que NO hay que hacer

- **No** `sudo ufw allow 8065` ni publicar `8065` a `0.0.0.0` en el compose — expondría
  Mattermost saltándose el proxy (rompe la terminación TLS y la topología segura).
- **No** `sudo ufw allow 5432` — Postgres nunca se expone.

> **Docker y UFW**: Docker inserta reglas en `iptables` por debajo de UFW. Caddy publica
> `80:80` y `443:443` en `0.0.0.0` **a propósito** (es el borde público), así que esos puertos
> quedan alcanzables aunque UFW no los liste — está bien, es lo buscado. Mattermost publica en
> `127.0.0.1:8065`, por lo que Docker **no** lo expone al exterior. Verificar el binding real con
> el chequeo `ss` de arriba, que refleja la realidad independientemente de UFW.

## Por qué 80 y 443 (no uno solo)

- **443**: sirve el HTTPS público de `chat.ecsas.com.ar` y permite el desafío ACME TLS-ALPN-01.
- **80**: permite el desafío ACME HTTP-01 (la vía por defecto de Caddy para emitir/renovar) y el
  redirect automático HTTP→HTTPS. Si 80 está cerrado, Caddy puede caer a TLS-ALPN-01 por 443,
  pero mantener 80 abierto es lo más robusto y lo que espera la configuración por defecto.
