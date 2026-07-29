# Auditoría de seguridad — puerto `0.0.0.0:3123`

**Autor:** WT-3 Security Audit (release Mattermost / PR-2)
**Fecha:** 2026-07-29
**Modo:** exclusivamente read-only. No se modificó ninguna configuración, firewall, Docker, Caddy, Mattermost ni proceso.
**VM:** Vultr, IP pública `64.176.22.159` (también corre el Business OS).

> **Alcance y disclaimer:** el puerto `3123` es **PREEXISTENTE y AJENO a PR-2 (Mattermost)**. No formaba parte de la release. Este informe lo identifica, evalúa el riesgo y **propone** un endurecimiento reversible. **No ejecuta ningún cambio.**

---

## 1. Veredicto en una línea

`3123` es la **propia app web del Business OS (Next.js `next start` en modo producción)**, lanzada a mano y **bindeada a todas las interfaces (`0.0.0.0`/`::`)** — no es Mattermost ni el túnel; **endurecer** rebindeándola a loopback (y dejarla detrás del túnel/Caddy que ya existe), porque hoy su única protección es UFW y el bind abierto es un fallo de defensa en profundidad.

---

## 2. Qué es el proceso identificado

| Atributo | Valor |
|---|---|
| Puerto | `3123` (TCP) |
| Bind | `*:3123` → **todas las interfaces**, IPv4+IPv6 (`::`) |
| Proceso | `next-server (v16.2.10)` — Next.js |
| PID | `1857242` |
| PPID | `1` (reparentado a init/systemd — el shell/npm que lo lanzó ya terminó) |
| Usuario | `jorge` (no root) |
| Comando npm | `next start` (`npm_lifecycle_event=start`, `npm_command=start`) → **build de PRODUCCIÓN**, no `next dev` |
| cwd | `/home/jorge/echegaray-os/app/echegaray-os` |
| Uptime | ~3 días 12 h (ELAPSED `3-11:59:40`) |
| Runtime | node v24.18.0 (nvm), npm 11.16.0 |
| Identidad HTTP | `<title>Echegaray Business OS</title>`; `HTTP/1.1 307 → /login`; `X-Powered-By: Next.js` |
| Lanzado desde | terminal del **VSCode Remote Server** de la VM (environ tiene `VSCODE_ESM_ENTRYPOINT`, `VSCODE_IPC_HOOK_CLI`), luego se desprendió del terminal |

**Conclusión de identidad:** es el **frontend/backend web del Business OS** (la misma app Next.js del repo `echegaray-os`), corriendo con `PORT=3123`. Next.js `next start` **bindea `0.0.0.0` por defecto** cuando no se le pasa `-H` — de ahí que escuche en todas las interfaces.

---

## 3. Cómo se abrió / quién lo lanzó

- **No es un servicio systemd.** No existe unit para esta app; el proceso quedó **reparentado a PID 1** tras cerrarse el terminal de VSCode que corrió `npm run start`. Es un **proceso suelto, no gestionado**: no reinicia solo, no sobrevive a un reboot, no tiene supervisión.
- **No es un contenedor Docker.** `docker ps` no mapea nada a `3123` (ver §4).
- **No tiene relación con el túnel cloudflared ni con Mattermost.** El túnel (`echegaray-os-tunnel.service`) apunta a `http://localhost:8790` (el *Claude Code Remote Control* / interactive-server del OS), no a `3123`. Es decir, **`3123` NO se expone por el túnel**: se expone **directamente** por el bind `0.0.0.0` + la IP pública de Vultr.

Cadena de exposición real de `3123`: `next start (PORT=3123, bind 0.0.0.0)` → **IP pública Vultr** → sólo lo tapa **UFW**.

---

## 4. Evidencia (comandos reales y salidas)

### 4.1 Quién escucha en `:3123`
```
$ ss -tlnp | grep 3123
LISTEN 0  511  *:3123  *:*  users:(("next-server (v1",pid=1857242,fd=21))
```
Bind `*:3123` = todas las interfaces. `sudo -n ss -tlnp` no aportó más (requiere sudo interactivo), pero el PID ya fue visible sin privilegios.

### 4.2 Headers HTTP (identificación pasiva, local, sin explotación)
```
$ curl -sI http://127.0.0.1:3123
HTTP/1.1 307 Temporary Redirect
location: /login
X-Powered-By: Next.js
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Content-Type: text/html; charset=utf-8

$ curl -s http://127.0.0.1:3123/login | grep -i title
<title>Echegaray Business OS</title>
```
Hay **middleware de auth**: la raíz redirige a `/login` (307). La app usa Supabase Auth.

### 4.3 Proceso, cmdline, cwd, environ
```
$ ps -o pid,ppid,user,etime,cmd -p 1857242
    PID    PPID USER    ELAPSED CMD
1857242       1 jorge  3-11:59:40 next-server (v16.2.10)

$ cat /proc/1857242/cmdline | tr '\0' ' '
next-server (v16.2.10)

$ ls -la /proc/1857242/cwd
... /proc/1857242/cwd -> /home/jorge/echegaray-os/app/echegaray-os

$ cat /proc/1857242/environ | tr '\0' '\n' | grep -iE 'PORT|npm_lifecycle|npm_command|VSCODE_ESM'
PORT=3123
npm_lifecycle_script=next start
npm_lifecycle_event=start
npm_command=start
VSCODE_ESM_ENTRYPOINT=vs/workbench/api/node/extensionHostProcess
```

### 4.4 Mapa completo de puertos en escucha (contraste)
```
$ ss -tlnp
127.0.0.1:8065    -> Mattermost (docker, SOLO loopback)          [OK]
127.0.0.1:20241   -> cloudflared (métricas, loopback)            [OK]
127.0.0.1:40225   -> node (loopback)                             [OK]
127.0.0.1:33551   -> code-e8653663e8 (VSCode server, loopback)   [OK]
127.0.0.1:35301   -> loopback                                    [OK]
127.0.0.53/54:53  -> systemd-resolved                            [OK]
0.0.0.0:22 / [::]:22 -> sshd                                     [esperado]
*:3123            -> next-server  ← ÚNICO no-SSH en TODAS las interfaces   [HALLAZGO]
```

### 4.5 Docker (no mapea 3123)
```
$ docker ps --format '{{.Names}} {{.Ports}} {{.Image}}'
echegaray-mm-app  8067/tcp, 127.0.0.1:8065->8065/tcp, 8074-8075/tcp  mattermost/mattermost-team-edition:11.8.4
echegaray-mm-db   5432/tcp
```
Mattermost está **correctamente** publicado sólo en `127.0.0.1:8065`. No es la causa de `3123`.

### 4.6 Túnel cloudflared (no toca 3123)
```
$ systemctl --user cat echegaray-os-tunnel.service | grep ExecStart
ExecStart=/.../orquestador/scripts/os-tunnel.sh
# → cloudflared tunnel --url http://localhost:8790 --no-autoupdate
# publica: https://requesting-allowed-ground-expanded.trycloudflare.com
```
El túnel expone `localhost:8790` (Claude Remote Control), **no** `3123`.

### 4.7 Firewall (no legible sin sudo)
```
$ grep -i enabled /etc/ufw/ufw.conf
ENABLED=yes                      # UFW está ACTIVO

$ ls -la /etc/ufw/user.rules
-rw-r----- 1 root root 1721 Jul 29 11:29 /etc/ufw/user.rules   # root-only; modificado HOY 11:29

$ sudo -n ufw status verbose   → "sudo: interactive authentication is required"
$ sudo -n iptables -L -n       → "sudo: interactive authentication is required"
```
**Limitación declarada:** no pude leer las reglas efectivas de UFW/iptables (requieren sudo interactivo). Sé que **UFW está habilitado** y que `user.rules` fue **modificado hoy 11:29** (coherente con la auditoría de firewall que disparó este trabajo). **No puedo confirmar** si `3123` está explícitamente denegado o permitido hacia Internet sin `sudo ufw status`.

---

## 5. Riesgos concretos

1. **Bind a `0.0.0.0` de toda la app de gestión de la empresa (defensa en profundidad rota).** El Business OS completo (Supabase, orquestador, claude-remote spawning, datos financieros) queda **a un solo control de distancia** de Internet. Hoy sólo lo tapa UFW; si UFW se desactiva, se flushea, o una regla se agrega mal, el OS entero queda expuesto en `64.176.22.159:3123` **al instante y sin aviso**. Un servicio interno no debería depender exclusivamente del firewall del host.
2. **Proceso no gestionado (fragilidad operativa + riesgo de estado).** Corre suelto reparentado a PID 1 desde un terminal de VSCode ya cerrado. No hay systemd, no reinicia en reboot, no hay logs supervisados. Un `next start` de hace 3 días puede estar sirviendo un **build viejo** desincronizado del código actual — es una superficie difícil de auditar y de actualizar (ej. ante un parche de seguridad).
3. **Auth presente pero es la única barrera.** Sí hay middleware (`307 → /login`, Supabase). Pero exponer directo a Internet significa que **toda ruta `/api/*`** y la superficie SSR quedan alcanzables por cualquiera; la protección depende 100% de que **cada** endpoint valide sesión. No audité endpoint por endpoint (fuera de alcance: nada de fuerza bruta ni explotación). El `next start` en producción es lo correcto (no expone el dev server ni source maps), lo que baja el riesgo respecto de un `next dev`.
4. **Fingerprinting trivial.** `X-Powered-By: Next.js` y `next-server (v16.2.10)` se anuncian. No verifiqué CVEs de esa versión (requiere verificación online que no corresponde a esta auditoría pasiva), pero la versión queda publicada para cualquiera que escanee el puerto.
5. **(Colateral, fuera de alcance)** el túnel cloudflared publica `localhost:8790` (Claude Remote Control) a una URL `trycloudflare.com` pública; hoy **no hay proceso escuchando en 8790** (`ss` no lo lista). Es otro tema, no `3123`, pero conviene registrarlo.

**Lo que está bien:** Mattermost (8065) y el resto de servicios están en loopback. El único desvío real es `3123`.

---

## 6. Propuesta de endurecimiento (mínima, reversible — NO ejecutada)

Objetivo: que `3123` deje de escuchar en `0.0.0.0` y quede en loopback, sin cambiar cómo se usa el OS (ya hay túnel/Caddy y la app pública real vive en Vercel según memoria del proyecto).

**Opción A — recomendada: rebindear a loopback (raíz del problema).**
Relanzar la app con host explícito:
```
# en /home/jorge/echegaray-os/app/echegaray-os
HOST=127.0.0.1 PORT=3123 npm run start        # next start -H 127.0.0.1
# o directamente: next start -H 127.0.0.1 -p 3123
```
Reversible: volver a lanzar sin `-H` restaura el comportamiento previo. Elimina la exposición en la fuente, sin depender del firewall.

**Opción B — complementaria: gestionarlo como systemd user service.**
Crear `echegaray-os-web.service` con `ExecStart=.../next start -H 127.0.0.1 -p 3123`, `Restart=always`, `WorkingDirectory=.../echegaray-os`. Da supervisión, reinicio en reboot y un único punto para actualizar el build. Reversible: `systemctl --user disable/stop`.

**Opción C — cinturón de seguridad inmediato (si no se puede reiniciar el proceso ya):** confirmar/cerrar `3123` en UFW hacia Internet:
```
sudo ufw status verbose            # primero LEER las reglas efectivas
sudo ufw deny in on <iface_pub> to any port 3123   # o asegurar default-deny incoming
```
Reversible con `ufw delete`. Es un parche: no arregla el bind `0.0.0.0`, sólo lo tapa. Debe combinarse con A.

**No recomendado:** dejarlo como está confiando sólo en UFW. Viola defensa en profundidad para la app más sensible de la VM.

**Orden sugerido:** A (rebind) → B (systemd) → C (UFW como respaldo). Todo requiere **aprobación humana** (Nivel D/E) y una ventana, ya que reiniciar la app la interrumpe momentáneamente.

---

## 7. Resumen ejecutivo

- **Qué es `3123`:** la app web del Business OS (Next.js `next start`, PID 1857242), lanzada a mano desde VSCode, **bindeada a `0.0.0.0`**. No es Mattermost, no es el túnel, no es Docker. Preexistente y ajena a PR-2.
- **¿Es riesgo?** Sí, moderado: exposición directa a Internet de toda la app de gestión, protegida hoy sólo por UFW y por el login de Supabase; además corre como proceso no supervisado. No hay evidencia de explotación y la auth está presente.
- **Recomendación (1 línea):** rebindear la app a `127.0.0.1` (`next start -H 127.0.0.1`) y gestionarla con systemd, dejando de exponer `3123` en todas las interfaces — cambio reversible, a ejecutar con aprobación del dueño.
