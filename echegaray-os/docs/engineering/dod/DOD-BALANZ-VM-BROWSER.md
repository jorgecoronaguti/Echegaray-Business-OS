# DoD — El navegador de Balanz vive en la VM

**Rama:** `feature/balanz-vm-browser-runtime` · **Base:** `ac5954a`

## Qué problema resolvía

El Tesorero Inversor IA leía el mercado a través del Chrome de la Mac del dueño, publicado a la VM
con un túnel SSH inverso. Servía para desarrollar y validar. No podía sostener un agente que corre
dos veces por día hábil sin que nadie esté mirando: **alcanzaba con cerrar la notebook para dejarlo
ciego**, y el aviso que publicaba en ese caso decía "no hay sesión", que era falso — no había
navegador.

## Cómo se resolvió, y las dos opciones que se descartaron primero

La VM no tiene navegador, no tiene servidor X, y `jorge` no tiene sudo. Se intentó, en orden:

1. **Xvfb extraído de los `.deb` a un prefijo local.** Arranca y muere al inicializar el teclado: el
   servidor X invoca `/usr/bin/xkbcomp` por ruta absoluta compilada y no respeta `XKB_BINDIR` en este
   build. Sin teclado no se puede tipear una contraseña, que es lo único que esta pantalla necesita.
2. **Montar el binario que falta con un espacio de nombres de usuario.** Lo prohíbe AppArmor en esta
   VM (`kernel.apparmor_restrict_unprivileged_userns=1`).
3. **Docker** — que además resultó ser la mejor opción y no sólo la posible: el navegador que sostiene
   la sesión de un bróker deja de ver el data room, los `.env` y el repo.

## Criterios cumplidos

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| A1 | Navegador dedicado corriendo en la VM | ✅ | `echegaray-balanz`, imagen `echegaray-balanz-browser:1`, Chrome/151.0.7922.71 |
| A2 | Funciona sin la Mac y sin túnel SSH | ✅ | el CDP de la VM es 9223 (Chrome/151); el túnel de la Mac sigue en 9222 con Chrome/150 — puertos y navegadores distintos |
| A3 | CDP y VNC sólo en loopback | ✅ | `ss -ltn` → `127.0.0.1:9223`, `127.0.0.1:5900`; contra la IP pública, ambos fallan |
| A4 | Sandbox de Chromium ACTIVO | ✅ | `chromium-sandbox` instalado; `docker logs` sin "No usable sandbox" ni "Failed to move to new namespace" |
| A5 | Contenedor sin privilegios | ✅ | `user=1001:1001`, `caps=[]`, `privileged=false`, `memory=2g`, solo en `balanz_net` |
| A6 | Pestaña canónica única, no se cierra ni se duplica | ✅ | `pestanaCanonica` + tests; `relevar` reusa la pestaña y le devuelve su URL |
| A7 | Login MANUAL, nunca automatizado | ✅ | el perfil nace vacío; no hay código que escriba usuario, contraseña ni OTP |
| A8 | Pantalla remota autenticada | ✅ | 403 sin token, 200 con token firmado; sobre socket unix, cero puertos TCP nuevos |
| A9 | El puente no interpreta lo que se tipea | ✅ | `balanz-ws.mjs` mueve tramas opacas; no hay dispatch de teclas ni registro de contenido |
| A10 | Un error nunca es "mercado vacío" | ✅ | nueve estados distintos; `diagnosticar` recorre contenedor → CDP → targets → pestaña → sesión |
| A11 | No se reinicia por una sesión vencida | ✅ | `NO_REINICIAR` + test que verifica que no se ejecuta `docker rm` |
| A12 | Recuperación automática del navegador caído | ✅ | `restart: unless-stopped` + vigía cada 15 min |
| A13 | Sobrevive al reboot | ✅ | `docker.service` enabled, `Linger=yes`, units `WantedBy=default.target` |
| A14 | Avisa una vez por incidente, y lo cierra al volver | ✅ | `correspondeAvisar` + tests |
| A15 | La barrera transaccional quedó intacta | ✅ | `git diff origin/main..HEAD -- '*denylist*'` vacío |
| A16 | Suite verde | ✅ | 2284 tests, 0 fail, 95 skipped · typecheck limpio · eslint 0 errores |
| A17 | Documentación migrada | ✅ | RUNBOOK reescrito; sin instrucciones de Mac, `open -na` ni `ssh -N -R` |

## Lo que NO está cerrado

| # | Criterio | Estado | Qué falta |
|---|---|---|---|
| B1 | **Sesión de Balanz iniciada en el navegador de la VM** | ❌ | el perfil nace vacío y el login es manual: lo tiene que hacer el dueño por la pantalla remota |
| B2 | **Relevamiento real desde el navegador de la VM** | ❌ | depende de B1. El extractor está validado contra el DOM real, pero con el navegador anterior |
| B3 | **Corrida real completa con mercado** | ❌ | depende de B1 |
| B4 | Ruta `/balanz` publicada por Caddy | ⏳ | el Caddyfile está cambiado en la rama; toma efecto al actualizar el árbol productivo y recargar Caddy |
| B5 | Units instalados y habilitados en producción | ⏳ | `bash orquestador/systemd/install.sh` después del merge |
| B6 | Túnel de la Mac retirado | ⏳ | lo cierra el dueño; el OS ya no lo usa |
| B7 | Reboot de la VM probado | ❌ | no se reinició la VM: afecta al resto del OS y no es una decisión del agente |

**B1 no es un defecto: es el diseño.** Un agente que pudiera iniciar sesión solo sería exactamente lo
que el pedido prohíbe. Pero mientras B1 no ocurra, este trabajo está probado como **infraestructura**
y no como relevamiento de mercado, y el DoD no puede decir otra cosa.

## Defectos que sólo aparecieron corriéndolo

1. **Sin `chromium-sandbox`** la única salida era `--no-sandbox`: abrir Internet sin aislamiento de
   render. El paquete mantiene el sandbox aun corriendo como usuario no root.
2. **El candado del perfil sobrevive al contenedor** y apunta al hostname viejo. Chromium concluye
   que el perfil está en uso "en otra computadora" y se niega a abrir: el primer reinicio murió así.
3. **La primera limpieza de ese candado no limpiaba nada**: `SingletonLock` es un symlink colgado y
   `-e` sobre un symlink colgado da falso. Hace falta `-L`.
4. **Chromium ignora `--remote-debugging-address`** y ata el CDP a loopback igual
   (`0100007F:2406` en `/proc/net/tcp`). El puerto publicado no llegaba a nada y el contenedor
   parecía sano. Se puentea con un relay — que además deja el CDP sin exponer ni dentro del contenedor.
5. **El proceso de pruebas quedaba colgado con todo en verde y sin imprimir una línea**: con la salida
   entubada el búfer no se vacía hasta que el proceso muere. Eran el pool de `fetch`/undici y los
   sockets del doble.
6. **La guarda de recorrido de la ruta de estáticos normalizaba el ataque en vez de rechazarlo**, y
   `fetch` lo tapaba: el cliente colapsa los `../` antes de mandar el pedido, así que el servidor
   nunca los veía. Contra `http` crudo, `/vendor/../../../package.json` devolvía 200.
