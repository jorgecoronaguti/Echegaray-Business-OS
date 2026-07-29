# PR-4.1 · Plan de resolución de bloqueantes y activación (ejecutable)

> Documento de planificación. **No se modificó código, no se desplegó, no se aplicó ninguna migración,
> no se tocó producción.** Todo lo de abajo es análisis + plan; nada se ejecutó.

---

## 1. Diagnóstico definitivo

Reconocimiento real de este entorno (read-only):

| Hecho verificado | Consecuencia |
|---|---|
| El OS corre con **systemd de USUARIO** (`~/.config/systemd/user/`, `Linger=yes`) | **`systemctl --user` NO requiere sudo.** B1 casi desaparece. |
| `DATABASE_URL` vive en `~/.config/echegaray-orq/worker.env` (accesible por el usuario `jorge`) | Las migraciones se aplican con `psql` sourceando ese archivo, **sin sudo**. B2 es operable. |
| Docker accesible sin sudo; `echegaray-mm-{caddy,app,db}` healthy; MM responde `200` en `127.0.0.1:8065` | Bot/webhook vía `mmctl` (docker exec, local mode) **sin sudo**. Mattermost operativo. |
| El código PR-3/4/4.1 vive **solo en el worktree** (no en el checkout que corren las units) | B3 real: falta una **ruta de integración** al runtime sin merge/push. |
| El endpoint (PR-4.1) exige **HMAC**; el outgoing webhook de Mattermost autentica con **token**, no HMAC | B4 real: hay que **decidir el mecanismo de auth** (y hay un ítem de código asociado, mínimo). |
| No existen aún el bot @os ni los secretos de comunicación | B5 real: generar secretos + crear bot en la ventana. |

**Reencuadre:** el bloqueo NO es de calidad (código validado: vertical+lane 20/20, endpoint 16/16, demo
8/8) ni de privilegios (son user-units, sin sudo). Los bloqueos reales son **B3 (ruta de código)** y
**B4 (decisión de auth + un ítem de código mínimo)**. B1/B2/B5 son operables sin sudo.

## 2. Resolución propuesta por bloqueante

### B1 — Privilegios · **RESUELTO (no requiere sudo)**
El OS usa systemd de usuario con lingering. Instalar el worker + endpoint de comunicación como
**user-units** (`~/.config/systemd/user/`) y su env en `~/.config/echegaray-orq/comunicacion.env` **no
requiere sudo**. Los templates que dejé en `deploy/*.service` están escritos como **system-units** y hay
que adaptarlos a user-units (quitar `User=`, `ProtectSystem`, `WantedBy=multi-user.target` → `default.target`,
`EnvironmentFile=%h/.config/echegaray-orq/comunicacion.env`) — **cambio de plantilla, a autorizar aparte**.

### B2 — Migraciones · operable sin sudo (ver §3 más abajo). Dos migraciones, ambas reversibles.

### B3 — Ruta de integración · ver §3 (decisión arquitectónica). Recomendación: **checkout de deploy dedicado**.

### B4 — Relay · reevaluado (ver análisis abajo). Recomendación: **no construir el relay ahora**; usar el
mecanismo nativo para el primer flujo y dejar el WebSocket-bot como arquitectura definitiva.

### B5 — Secretos · generar en la ventana; almacenar en `~/.config/echegaray-orq/comunicacion.env` (600).

---

## 3. Decisión arquitectónica recomendada

### 3.a · B3 — cómo llega el código al runtime (alternativas)

| # | Alternativa | Ventajas | Desventajas | Riesgos | Git | Producción | Compat. no-merge/no-push |
|---|---|---|---|---|---|---|---|
| **A** | **Checkout de deploy dedicado** del branch `feature/pr4-mattermost-work-fabric` en una ruta estable (p.ej. `git worktree add /home/jorge/echegaray-os/deploy-comunicacion <branch>`); las user-units de comunicación apuntan ahí. | No toca el checkout del OS; trazabilidad total (es el commit real); reversible (borrar checkout + deshabilitar units); la migración de lane es retro-compatible con el worker general. | Un checkout más que mantener; hay que recordar actualizarlo al avanzar el branch. | Bajo — aislado del runtime del OS. | Sin merge/push; branch intacto. | El OS principal sigue corriendo desde su ruta, sin cambios. | ✅ Total |
| B | **Merge** del branch a la rama desplegada (`feat/pr2-mattermost-publico`/`main`) + units en el main tree. | Un solo árbol; camino "normal". | Arrastra 28 commits sin pushear + WIP de finanzas; cambia el checkout que corre el OS. | Medio/alto — modifica el runtime del OS en vivo. | Viola no-merge. | Cambia el main tree en producción. | ❌ |
| C | **Cherry-pick** de los commits de comunicación sobre la rama desplegada. | Preciso; sólo el código de comunicación. | Igual modifica la rama/checkout desplegado; el worker principal pasa a tener el handler registrado. | Medio. | Modifica la rama desplegada. | Cambia el main tree. | ❌ (es una forma de merge) |
| D | **`git archive`/export** del branch a un dir estático de deploy. | Simple; sin `.git` en prod. | **Pierde trazabilidad** (no es un commit vivo). | Bajo pero sin linaje. | — | Aislado. | ✅ pero sin trazabilidad |

**Recomendación definitiva: Alternativa A (checkout de deploy dedicado).** Es la única que respeta
no-merge/no-push, **conserva trazabilidad** (corre un commit real, `cab3eef`), **no toca el runtime del
OS**, y es completamente reversible. La migración de lane es retro-compatible, así que el worker general
(que sigue en su checkout) convive sin cambios.

### 3.b · B4 — ¿es imprescindible el relay firmante?

**Análisis objetivo.** El endpoint HTTP (PR-4.1) exige HMAC sobre el raw body. El **outgoing webhook** de
Mattermost **no firma**: autentica con un **token compartido**. Para el primer flujo hay tres caminos:

| Opción | Seguridad | Componente nuevo | Código | Veredicto |
|---|---|---|---|---|
| **Token nativo + loopback** (MM→`127.0.0.1:8791`, endpoint en localhost, allowlist `127.0.0.1`, token en tiempo constante) | Alta **para este modelo de amenaza**: MM y endpoint en el MISMO VM, sin exposición pública, un solo usuario, canal privado. El aporte del HMAC (integridad sobre transporte no confiable) es marginal en un loop localhost. | No | Mínimo (modo token en la capa OS del endpoint; NO toca el comm-service congelado) | **Recomendado para el primer flujo** |
| **Relay firmante (HMAC)** | Muy alta; necesaria si el ingreso viene de **fuera del VM** (terceros). | **Sí** (relay) | Medio | Innecesario para el primer flujo; útil sólo con inbound de terceros |
| **Bot + WebSocket Events API** (el bot @os se conecta SALIENTE a MM por WS autenticado con su token; recibe eventos; **no hay endpoint inbound**) | La más alta: **elimina toda superficie de ataque inbound**; la autenticidad la da la conexión saliente autenticada + TLS. 100% nativo. | Sí (consumidor WS) — pero **reemplaza** endpoint+relay | Medio | **Arquitectura definitiva recomendada** (futuro) |

**Conclusión B4:** **el relay NO es imprescindible.** Se logra seguridad adecuada para el primer flujo con
**capacidades nativas** (outgoing webhook + token, sobre el loop localhost). El relay sólo se justifica si
alguna vez entra tráfico inbound de terceros — y en ese caso la opción **definitiva y nativa** superior es
el **consumidor WebSocket del bot** (sin inbound, sin relay). Por lo tanto:
- **Primer flujo:** token nativo + loopback (interino y explícito; el dueño ya dijo "token no como solución
  permanente" — acá NO es permanente).
- **Definitivo:** migrar la ingesta al **bot WebSocket** (nativo, sin relay, sin endpoint público) cuando se
  quiera cerrar el tema para siempre. El relay queda descartado salvo requerimiento de inbound de terceros.

> **Ítem de código pendiente (a autorizar aparte, NO ahora):** el endpoint hoy sólo valida HMAC. El primer
> flujo con token nativo requiere agregar un **modo token** en la capa OS del endpoint (constante, con
> allowlist), sin tocar el comm-service. Es el único código que falta antes de activar. Alternativamente,
> se construye el relay (más código). Ninguna se hace en este documento.

### 3.c · Arquitectura de activación recomendada (resumen)

```
Mattermost (outgoing webhook @os, token)  ──local 127.0.0.1──►  endpoint (user-unit, modo token)
   → Communication Service (checkout de deploy A) → inbox → puente → orq.events + orq.enqueue_task (lane 'comunicacion')
   → worker de comunicación (user-unit) → handler comunicacion.responder (datos reales) → outbox → MM (mismo hilo)
```
Sin sudo · sin relay · sin exposición pública del endpoint · main OS intacto · migraciones retro-compatibles.

---

## 4. Secuencia exacta de activación (a ejecutar SÓLO tras autorización)

1. **Resolver el ítem de código de B4** (modo token en el endpoint) — autorización aparte.
2. **Checkout de deploy** (B3-A): `git worktree add /home/jorge/echegaray-os/deploy-comunicacion feature/pr4-mattermost-work-fabric`.
3. **Adaptar los 2 templates systemd a user-units** + crear `~/.config/echegaray-orq/comunicacion.env` (600).
4. **B5 — secretos:** crear bot @os (`mmctl`), obtener `MM_BOT_TOKEN`/`MM_BOT_USER_ID`; crear outgoing
   webhook (`@os`, canal privado de prueba) y leer su token → `MM_INCOMING_TOKEN`.
5. **B2 — migraciones** (ver §11 ventana): pausar worker principal → aplicar `comunicacion` 0001 → aplicar
   lane → reanudar worker.
6. **Instalar + habilitar user-units:** `systemctl --user daemon-reload && systemctl --user enable --now …`.
7. **Verificar** (checklist §7): endpoint 202, worker activo, dedup/retry/DLQ/lease, logs.
8. **Prueba funcional** `@os estado del sistema` en el canal privado (solo Jorge).
9. Si todo OK → dejar user-units activas (linger ya está). Si falla → rollback §10.

## 5. Lista de comandos `sudo`

**NINGUNO.** El OS usa systemd **de usuario** (`~/.config/systemd/user/`, `Linger=yes`), Docker es accesible
sin sudo, `DATABASE_URL` está en el home del usuario, y el webhook es loopback (no toca Caddy del host).
Toda la activación se ejecuta como el usuario `jorge` sin elevación:

| Comando (SIN sudo) | Objetivo | Riesgo | Resultado esperado | Validación |
|---|---|---|---|---|
| `git worktree add /home/jorge/echegaray-os/deploy-comunicacion feature/pr4-mattermost-work-fabric` | Ruta de código en runtime (B3-A) | Bajo | Checkout del commit `cab3eef` | `git -C … rev-parse HEAD` = cab3eef |
| `install -m600 … ~/.config/echegaray-orq/comunicacion.env` | Secretos del enlace | Bajo | Env 600 del usuario | `stat -c %a` = 600 |
| `docker exec echegaray-mm-app mmctl --local bot create …` | Bot @os (B5) | Bajo (reversible) | Bot creado | `mmctl --local bot list` |
| `psql "$DATABASE_URL" -1 -f communication-service/db/migrations/0001_comunicacion.sql` | Schema comunicacion (B2) | Bajo (aditivo) | schema creado | `\dn comunicacion` |
| `psql "$DATABASE_URL" -1 -f supabase/migrations/20260729180000_orq_comunicacion_lane.sql` | Lane (B2) | Bajo (retro-compat, en tx) | claim_task con lane | test claim por lane |
| `systemctl --user daemon-reload` | Registrar units | Bajo | — | `systemctl --user list-unit-files` |
| `systemctl --user enable --now echegaray-comunicacion-endpoint` | Endpoint activo | Bajo | escuchando 127.0.0.1:8791 | `curl 127.0.0.1:8791` |
| `systemctl --user enable --now echegaray-comunicacion-worker` | Worker activo | Bajo | procesa lane comunicación | logs + smoke |

> Si en el futuro se expusiera el endpoint por HTTPS, la config de Caddy se hace **por `docker exec` sobre
> `echegaray-mm-caddy`** (no sudo). Para el primer flujo (loopback) **no hace falta tocar Caddy**.

## 6. Checklist PREVIO

- [ ] Autorización expresa del dueño para la ventana.
- [ ] Ítem de código B4 (modo token) resuelto y validado en descartable.
- [ ] Backup verificado (MM + PG del Work Fabric) — `infra/mattermost/backup/`.
- [ ] `DATABASE_URL` legible en `~/.config/echegaray-orq/worker.env`.
- [ ] Rollback scripts a mano (comm down + lane down).
- [ ] Canal privado de prueba creado; único usuario: Jorge.

## 7. Checklist DURANTE

- [ ] Checkout de deploy en `cab3eef`.
- [ ] Migraciones aplicadas sin error (schema `comunicacion` + `queue`/`claim_task`).
- [ ] user-units cargadas y activas (`systemctl --user status`).
- [ ] Endpoint responde (202 a un request de prueba firmado/tokenizado; 401 a uno inválido, auditado).
- [ ] Worker de comunicación reclama SÓLO la lane `comunicacion`; el worker general intacto.
- [ ] Logs estructurados con `correlation_id` en cada hop.

## 8. Checklist POSTERIOR

- [ ] `@os estado del sistema` responde en el MISMO hilo, con datos reales.
- [ ] Repetición → sin doble tarea ni doble post (dedup `comm_event_id`).
- [ ] `correlation_id`/`causation_id` preservados end-to-end.
- [ ] Reinicio del worker (`systemctl --user restart`) → retoma sin perder nada.
- [ ] DLQ/retry/lease observables.
- [ ] Rotación de secretos probada.

## 9. Riesgos

- **Migración de lane (DROP+CREATE `claim_task`)**: mitigado corriendo en transacción (atómico) y pausando
  el worker principal ~30–60 s. Retro-compatible (llamadas de 2 args → default). Rollback disponible.
- **Auth interino con token**: adecuado para el loop localhost; **no** dejarlo si el endpoint se expone a
  terceros — ahí va WebSocket/HMAC (definitivo).
- **Checkout de deploy desincronizado** del branch: documentar el procedimiento de actualización.
- **Bot con permisos de más**: crear con permisos mínimos (publicar sólo en el canal de prueba).

## 10. Rollback (ejecutable, sin sudo)

1. `systemctl --user disable --now echegaray-comunicacion-endpoint echegaray-comunicacion-worker`.
2. Borrar/deshabilitar el outgoing webhook y el bot en Mattermost (`mmctl --local`).
3. `psql "$DATABASE_URL" -1 -f orquestador/db/rollback/20260729180000_orq_comunicacion_lane_down.sql`
   (restaura `claim_task` de 2 args, quita la lane).
4. (Opcional) `psql "$DATABASE_URL" -c 'drop schema comunicacion cascade'`.
5. `git worktree remove /home/jorge/echegaray-os/deploy-comunicacion`.
6. Verificar: worker principal reclama normal; MM/OS intactos.

## 11. Tiempo estimado de indisponibilidad

- **Usuario final: 0.** Mattermost, Caddy, PG y la web siguen arriba todo el tiempo.
- **Worker principal del OS (autónomo): ~30–60 s** de pausa durante la migración de lane (recomendado por
  prudencia; técnicamente la migración es atómica en transacción). El flujo de comunicación aún no está
  vivo, así que no hay downtime de comunicación.
- **Total de la ventana** (con verificación + smoke): ~20–30 min de trabajo, sin corte de servicio.

## 12. Confirmación

**No se modificó producción.** No se aplicó ninguna migración, no se instaló ninguna unit, no se tocó
Caddy/systemd/Mattermost/PostgreSQL, no se creó ningún secreto ni bot, no se desplegó ningún código.
Este documento es sólo el plan. Estado productivo verificado e intacto: MM `200`, contenedores healthy.
