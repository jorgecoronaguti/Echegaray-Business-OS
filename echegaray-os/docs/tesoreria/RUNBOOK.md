# Tesorero Inversor IA — runbook operativo

Especialista subordinado al **CFO IA**. Analiza el excedente de caja por horizonte, releva Balanz en
solo lectura y propone colocaciones. **Nunca ejecuta una operación financiera.**

---

## Qué corre, cuándo y dónde

| Pieza | Ruta |
|---|---|
| Ciclo | `orquestador/scripts/ciclo-tesorero.mjs` |
| Políticas (proponer / aprobar) | `orquestador/scripts/tesoreria-politica.mjs` |
| Explorador de Balanz | `orquestador/scripts/balanz-explorar.mjs` |
| Motor | `orquestador/lib/tesoreria/` (12 módulos) |
| Skill de criterio | `.claude/skills/tesoreria-inversiones-corporativas/SKILL.md` |
| Tools (chat/Director/web) | `orquestador/lib/tools/tesoreria-tool.mjs` |
| Ledger | schema `tesoreria` (migración `20260801170000_tesoreria_inversor.sql`) |
| Timer | `echegaray-tesorero.timer` — lun-vie 09:15 y 15:30 |

```bash
node orquestador/scripts/ciclo-tesorero.mjs --dry      # sin publicar, sin escribir el ledger
node orquestador/scripts/ciclo-tesorero.mjs            # corrida normal
node orquestador/scripts/ciclo-tesorero.mjs --forzar   # publica aunque no haya cambio material
node orquestador/os.mjs excedente_invertible           # consulta puntual, misma fuente
```

**En una corrida normal hace CERO llamadas a la API de Anthropic.** La aritmética es determinística.

---

## Los dos números, y por qué no son el mismo

| | Qué es | Cuándo existe |
|---|---|---|
| **Techo técnico preliminar** | lo máximo que la aritmética permite | **siempre** |
| **Excedente aprobado** | el techo después de aplicar políticas **aprobadas** | sólo con todo aprobado y validado |

Mientras falte una política, `excedente_aprobado` es **null** —no un número más chico— y toda
recomendación sale `NO_ACCIONABLE`. Un número con nombre de accionable se usa como accionable, por
más notas al pie que lleve.

Los cuatro bloqueos posibles:

1. reserva mínima no aprobada
2. caja restringida en `unknown`, `unavailable` o `stale`
3. el extractor de Balanz no validado contra la pantalla real (`ORQ_BALANZ_EXTRACTOR_VALIDADO=1`)
4. sin datos de mercado frescos — **se mide sola**: la observación más vieja de los instrumentos
   relevados tiene que tener 6 horas o menos. Se cierra corriendo con la sesión de Balanz arriba y el
   mercado abierto; no hay variable que la encienda, porque la frescura es un hecho, no una decisión

---

## Aprobar la reserva mínima

El agente la **propone** con datos reales. **No puede aprobarla**: marcarte como aprobador de algo
que no miraste sería falsificar evidencia.

```bash
# 1 · ver qué hay
node orquestador/scripts/tesoreria-politica.mjs ver

# 2 · proponer (calcula sobre el calendario real y guarda como PROPUESTA)
node orquestador/scripts/tesoreria-politica.mjs proponer reserva_minima
#    opcional: --colchon 3000000

# 3 · aprobar (esto lo hace una persona)
node orquestador/scripts/tesoreria-politica.mjs aprobar reserva_minima --aprobador "Jorge Corona"
```

**El método**: el MÁXIMO entre los egresos confirmados de 7 días, las obligaciones fiscales y
laborales, los pagos de obra y el colchón operativo. El máximo y **no la suma** — los cuatro se
solapan, y sumarlos reservaría tres veces el mismo peso.

Aprobar **cierra la fila anterior y crea una nueva**: queda el historial de qué regla regía cuándo.

## Declarar la caja restringida

```bash
# 0 declarado explícitamente NO es lo mismo que "no sé"
node orquestador/scripts/tesoreria-politica.mjs declarar caja_restringida \
  --monto 0 --fuente "revisión de garantías y embargos" --aprobador "Jorge Corona"
```

Estados: `known_zero` · `known_positive` · `unknown` · `unavailable` · `stale`. Los tres últimos
bloquean la acción. Un dato de más de 30 días pasa a `stale`: se resta igual (es lo conservador)
pero no sostiene una decisión.

---

## El navegador de Balanz — vive en la VM, y lo único que hace una persona es entrar

El agente **reusa** una sesión ya iniciada. No automatiza login, ni OTP, ni CAPTCHA, no copia ningún
perfil, no lee contraseñas guardadas, no exporta cookies y no persiste tokens.

Lo que cambió: el navegador ya **no está en tu Mac**. Vive en la VM, en un contenedor propio, y
sobrevive a que cierres la notebook, VS Code, Claude Code y todas las terminales. No hay túnel SSH.

```
Caddy (chat.ecsas.com.ar)  →  socket unix  →  pantalla remota  →  VNC 127.0.0.1:5900
                                                                        ↓
   Tesorero  →  CDP 127.0.0.1:9222  →  Chromium + Xvfb  (contenedor echegaray-balanz)
```

### 1 · Levantarlo (una vez; después arranca solo)

```bash
bash orquestador/systemd/install.sh          # copia y habilita los tres units
systemctl --user status echegaray-balanz-browser.service
```

El perfil vive en `~/.local/share/echegaray-os/balanz/perfil` y **persiste**: reiniciar el
contenedor no borra la sesión. Reiniciar el navegador, sí — la sesión de Balanz vive en
`sessionStorage`, que es por pestaña.

### 2 · Iniciar sesión (lo único que necesita una persona)

Cuando la sesión vence, el agente publica en Mattermost **BALANZ · NECESITA AUTENTICACIÓN** con un
enlace. Abrilo, entrá a Balanz a mano, cerrá la pestaña. Nada más: el OS detecta la sesión solo,
cierra el incidente con **BALANZ · SESIÓN RESTAURADA** y releva en la próxima corrida.

Si necesitás el enlace sin esperar el aviso:

```bash
node orquestador/scripts/balanz-runtime.mjs enlace     # vence en 20 minutos
```

El enlace va firmado y **da acceso a la pantalla del bróker**: no se reenvía ni se pega en un canal
público. El puente que lo sirve mueve tramas opacas y no las interpreta — no registra pulsaciones,
ni contraseña, ni OTP.

### 3 · Ver qué está pasando

```bash
node orquestador/scripts/balanz-runtime.mjs estado
```

| Estado | Qué significa | Qué hacer |
|---|---|---|
| `SESSION_ACTIVE` | hay pestaña de Balanz fuera del login | nada |
| `SESSION_REQUIRED` | la sesión venció | abrir el enlace y entrar a mano |
| `BALANZ_TARGET_MISSING` | no quedó ninguna pestaña | el OS la repone solo |
| `BROWSER_STARTING` | Chromium todavía no abrió el puerto | esperar (no reiniciar) |
| `BROWSER_ERROR` | el navegador no responde | `balanz-runtime.mjs reiniciar` |

### 4 · Verificar que nada quedó expuesto

Los dos puertos son **de loopback de la VM**. CDP no pide autenticación: quien lo alcanza maneja el
navegador entero, con la sesión del bróker adentro.

```bash
ss -ltn | grep -E "9222|5900"                        # tiene que decir 127.0.0.1, NUNCA 0.0.0.0
curl -s --max-time 5 http://64.176.22.159:9222/json/version   # tiene que FALLAR
curl -s --max-time 5 http://64.176.22.159:5900                # tiene que FALLAR
curl -s -o /dev/null -w '%{http_code}\n' https://chat.ecsas.com.ar/balanz   # 403 sin token
```

**Nunca**: bind en `0.0.0.0`, abrir 9222 o 5900 en el firewall, ni publicarlos por Cloudflare.

### 5 · Parar o volver atrás

```bash
systemctl --user stop echegaray-balanz-vigia.timer echegaray-balanz-remoto.service
systemctl --user stop echegaray-balanz-browser.service    # para el contenedor
docker rm -f echegaray-balanz                             # además lo borra (el perfil sobrevive)
```

Para forzar un login nuevo, borrá el perfil: `rm -rf ~/.local/share/echegaray-os/balanz/perfil`.

### 5 · Mapear el DOM y validar el extractor

Con la sesión arriba, **desde el servidor**:

```bash
node orquestador/scripts/balanz-explorar.mjs            # estructura de las pantallas informativas
node orquestador/scripts/balanz-explorar.mjs --json > /tmp/balanz-mapa.json
```

Devuelve encabezados, tablas con sus columnas, tabs, paginación y el veredicto de la barrera sobre
cada control. **Cero clics.** Con eso se ajustan los selectores del extractor (que lee por nombre de
columna, no por posición) y se compara una muestra contra la pantalla.

Recién cuando esa comparación esté hecha:

```bash
ORQ_BALANZ_EXTRACTOR_VALIDADO=1 node orquestador/scripts/ciclo-tesorero.mjs
```

Esa variable es una **declaración humana**, no algo que el agente pueda afirmar de sí mismo.

---

## La barrera transaccional

`orquestador/lib/tesoreria/balanz-denylist.mjs`. Módulo **puro**, no una instrucción en un prompt,
con 20 tests que la atacan a propósito más 11 contra un DOM real.

- Bloquea por texto, `aria-label`, `title`, texto del contenedor, `href`, `action` y ruta.
- Bloquea **todo** `type=submit`, **todo** `<form>` y **todo lo que viva dentro de un formulario**.
- **Falla cerrada**: un elemento sin nada evaluable no se toca.
- El navegador tiene **un solo** `.click()` y **un solo** `.goto()`, ambos detrás de la barrera. Un
  test lee el archivo y lo verifica.

**Cauciones**: `/mercado/cauciones` entra por una allowlist de **ruta exacta**. `/mercado/caucionar`,
`/mercado/cauciones/operar` y `/mercado/cauciones-nueva` siguen bloqueadas, el query se evalúa aparte
(`?accion=caucionar` cae), y el botón "Caucionar" de esa misma pantalla **también** sigue bloqueado:
la excepción vale para **navegar**, no para tocar. A cauciones se entra por URL.

Los bloqueos quedan en `tesoreria.bloqueos_seguridad` con la etiqueta del elemento y 80 caracteres de
texto: alcanza para auditar, no reconstruye la pantalla de un bróker autenticado.

---

## El Sheet — solo lectura

Fuente: **Flujo de Caja - Cash Flow ECSAS** (`1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`).

El agente **no lo abre por su cuenta**: consume `calendario-financiero.mjs` y `cash-briefing.mjs`,
los lectores únicos ya probados. Pestañas que alcanzan: `CAJA`, `Cobranzas`, `Compras`,
`Cheques Emitidos`.

Un test verifica que **ningún** módulo de `tesoreria/` llame a una función de escritura de Google.

Pestañas prohibidas declaradas por el dueño: `08_CONTROL_CLIENTE` y `P&L`. **Ninguna de las dos
existe en este spreadsheet** — la guarda queda igual.

### El control de coherencia del total

Si "Total disponibilidades" se rompe (`#REF!`, fórmula rota), `parseMonto` devuelve 0 y el OS
informaría **caja $0** como un hecho. El agente cruza ese total contra la suma de las cuentas que el
lector detectó fila por fila; la relación esperada es *total = suma − valores a depositar*. Si se
rompe, la posición sale `sin_dato` con el motivo.

**Pasó de verdad el 01/08.** Si ves este error, andá a la pestaña CAJA y buscá el `#REF!`.

---

## Qué se publica y qué no

Sólo **cambios materiales**: entrada/salida del descubierto, aparición o desaparición de excedente,
variación ≥ $500.000, cambio de la mejor tasa ≥ 2 puntos, cambio del instrumento recomendado, o
sesión vencida.

**Nunca se publica una recomendación accionable si** falta reserva aprobada, la caja restringida es
materialmente desconocida, los datos de Balanz están vencidos, el extractor no fue validado, la
recomendación no superó el validador, la tasa no está tipificada, o la moneda o el horizonte no
coinciden.

El mensaje **no lleva botones**: un callback de Mattermost llega sin identidad verificable, y aprobar
una colocación se hace donde se opera — a mano, por una persona.

Canal: `ORQ_TESORERIA_CANAL`. Sin esa variable, el ciclo imprime en el journal y no publica.

---

## Cómo leer una recomendación

| Campo | Qué mirar |
|---|---|
| `estado` | siempre `PROPUESTA — REQUIERE APROBACIÓN HUMANA` |
| `estado_accionabilidad` | `ACCIONABLE` o `NO_ACCIONABLE` — si es lo segundo, el monto es orientativo |
| `vara_periodo` / `modo_vara` | contra qué se comparó: `cancelacion_deuda`, `costo_oportunidad` o `contingencia` |
| `condiciones_invalidez` | qué tiene que pasar para que deje de valer |
| `vence_en` | 24 horas. Después se marca `vencida` sola |
| `confianza` | baja si los costos no se pudieron leer o faltan campos |

---

## Concurrencia e idempotencia

- **Lock**: `pg_try_advisory_lock(738201)`. La segunda corrida se **omite**, no se encola.
- **Nunca dos navegadores sobre la misma sesión**: es lo que el lock evita de verdad. Por eso el chat
  **no** releva el mercado — pelearía con el timer por la misma pestaña.
- **Recomendaciones**: clave estable `(bloque, día, instrumento)` → actualiza, no duplica.
- **Observaciones de mercado**: histórico **inmutable**, una fila por lectura.
- **Timer sin `Persistent=true`**: una corrida atrasada publicaría la caja de hoy contra tasas que ya
  no existen.

---

## Migración — cómo aplicarla al integrar

La migración **no está aplicada en producción**. Es aditiva (schema nuevo + 1 capacidad + 1 agente) y
no toca ninguna tabla existente. Probada dos veces contra un Postgres descartable.

```bash
# al integrar, desde el árbol principal
psql "$DATABASE_URL" -f supabase/migrations/20260801170000_tesoreria_inversor.sql
```

**Verificación posterior** (tiene que dar 11, ninguna sin RLS, 22 policies):

```sql
select count(*) from pg_tables where schemaname='tesoreria';
select tablename from pg_tables where schemaname='tesoreria' and not rowsecurity;
select count(*) from pg_policies where schemaname='tesoreria';
select slug, org_title from orq.agents where slug='tesorero';
```

**Revertir** (destructivo — se pierde el histórico de observaciones):

```sql
drop schema tesoreria cascade;
delete from orq.agent_capabilities where capability_slug = 'advise.treasury';
delete from orq.model_routes where match_key = 'advise.treasury';
delete from orq.agents where slug = 'tesorero';
delete from orq.capabilities where slug = 'advise.treasury';
```

**No aplicar la migración antes del merge**: el `context_ref` del agente apunta a
`.claude/skills/tesoreria-inversiones-corporativas`, que no existe en `main`. El riesgo real es bajo
—`advise.treasury` no está en el clasificador del Director, así que nada rutea ahí solo— pero no hay
motivo para correrlo.

---

## Encender el timer (después, no antes)

`install.sh` **copia** la unit pero **no la habilita**. Antes de que corra solo hacen falta tres cosas
que el agente no puede darse a sí mismo:

1. la migración aplicada,
2. la reserva mínima **aprobada** por una persona,
3. el extractor validado contra la pantalla real (`ORQ_BALANZ_EXTRACTOR_VALIDADO=1`).

Con las tres:

```bash
bash orquestador/systemd/install.sh          # copia la unit
systemctl --user enable --now echegaray-tesorero.timer
systemctl --user list-timers echegaray-tesorero.timer
```

Las tres variables del agente van en `~/.config/echegaray-orq/worker.env` (fuera de git, `chmod 600`).
Están comentadas en la plantilla de `install.sh` con qué se rompe si faltan; **si el archivo ya existe,
el instalador no lo toca** — hay que agregarlas a mano.

---

## Diagnóstico

```bash
systemctl --user status echegaray-tesorero.timer
journalctl --user -u echegaray-tesorero -n 50 --no-pager
node --test 'orquestador/lib/tesoreria/*.test.mjs'
LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs node --test 'orquestador/lib/tesoreria/balanz-dom.test.mjs'
```

```sql
select run_id, iniciada_en, estado, publicado, motivo from tesoreria.corridas order by iniciada_en desc limit 10;
select bloque, monto_maximo, motivo from tesoreria.ventanas where run_id = '<run>';
select motivo, count(*) from tesoreria.bloqueos_seguridad group by 1 order by 2 desc;
select clave, valor, aprobada_por from tesoreria.politicas order by vigente_desde desc;
```

| Síntoma | Causa probable |
|---|---|
| `estado=omitida` | otra corrida tenía el lock |
| `session_required` | la sesión de Balanz venció: hace falta que una persona entre por la pantalla remota |
| "el total de la pestaña dice $0" | la pestaña CAJA tiene un `#REF!` — andá a arreglarla |
| todo `NO_ACCIONABLE` | falta aprobar la reserva y/o declarar la caja restringida |
| `sin_excedente=true` con deuda | hay descubierto utilizado: esa porción va a la línea |
| ninguna propuesta con excedente | ningún instrumento supera la vara — mirá `sin_propuesta` |
| no publica nada | no hubo cambio material; `--forzar` para verlo igual |
| el navegador no arranca | faltan las libs: `LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs` |

---

## Riesgos y limitaciones vigentes

| Qué | Impacto | Cómo se cierra |
|---|---|---|
| El extractor **no** fue validado contra el DOM real de Balanz | todo sale `NO_ACCIONABLE` | `balanz-runtime.mjs estado` + `balanz-explorar.mjs` + comparar una muestra |
| Sin sesión no hay datos de mercado, y sin datos frescos nada es accionable | el análisis de caja se publica igual | misma sesión: los dos bloqueos se cierran juntos |
| La migración no está en producción | el ledger no persiste | aplicarla al integrar (arriba) |
| Reserva y caja restringida sin cargar | todo `NO_ACCIONABLE` | los dos comandos de arriba |
| `row_reference` y `source_formula` en null | trazabilidad a nivel pestaña, no fila | conseguirla exigiría duplicar el lector del Sheet: no se hace |
| El escenario adverso usa cobros al 50% | supuesto declarado, no medido | medirlo con `aprendizaje-cobranzas` cuando haya historia suficiente |
