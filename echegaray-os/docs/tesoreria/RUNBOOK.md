# Tesorero Inversor IA — runbook operativo

Especialista subordinado al **CFO IA**. Analiza el excedente de caja por horizonte, releva Balanz en
solo lectura y propone colocaciones. **Nunca ejecuta una operación financiera.**

---

## Qué corre, cuándo y dónde

| Pieza | Ruta |
|---|---|
| Ciclo | `orquestador/scripts/ciclo-tesorero.mjs` |
| Motor | `orquestador/lib/tesoreria/` (10 módulos, uno por skill) |
| Skill de criterio | `.claude/skills/tesoreria-inversiones-corporativas/SKILL.md` |
| Tools (chat/Director/web) | `orquestador/lib/tools/tesoreria-tool.mjs` |
| Ledger | schema `tesoreria` (migración `20260801170000_tesoreria_inversor.sql`) |
| Timer | `echegaray-tesorero.timer` — lun-vie 09:15 y 15:30 |

```bash
node orquestador/scripts/ciclo-tesorero.mjs --dry      # sin publicar, sin escribir el ledger
node orquestador/scripts/ciclo-tesorero.mjs            # corrida normal
node orquestador/scripts/ciclo-tesorero.mjs --forzar   # publica aunque no haya cambio material
```

**En una corrida normal hace CERO llamadas a la API de Anthropic.** Toda la aritmética es
determinística.

---

## El login de Balanz — lo hace una persona, siempre

El agente **reusa** una sesión ya iniciada. No automatiza login, ni OTP, ni CAPTCHA, no copia el
perfil de Chrome, no lee contraseñas guardadas, no exporta cookies y no persiste tokens.

Para habilitarlo:

```bash
# en la máquina donde está tu Chrome, con TU perfil
google-chrome --remote-debugging-port=9222
# entrás a Balanz a mano y dejás la pestaña abierta
```

Si el OS corre en otra máquina (hoy es el caso), hace falta además un túnel:

```bash
ssh -R 9222:127.0.0.1:9222 usuario@servidor-del-os
```

El endpoint se configura con `ORQ_BALANZ_CDP` (default `http://127.0.0.1:9222`).

**Si no hay sesión**: el ciclo registra `SESSION_REQUIRED`, publica el aviso, **no intenta entrar** y
termina bien. El análisis de caja se hace igual — es la mitad que más decide.

---

## La barrera transaccional

`orquestador/lib/tesoreria/balanz-denylist.mjs`. Es un módulo **puro**, no una instrucción en un
prompt, y tiene 13 tests que la atacan a propósito.

- Bloquea por texto, `aria-label`, `title`, texto del elemento padre, `href`, `action` y ruta.
- Bloquea **todo** formulario y **todo** submit.
- **Falla cerrada**: un elemento sin nada evaluable no se toca.
- El navegador tiene **un solo** `.click()` y **un solo** `.goto()`, ambos detrás de la barrera. Un
  test lee el archivo y lo verifica.

Los bloqueos quedan en `tesoreria.bloqueos_seguridad` con la etiqueta del elemento y 80 caracteres de
texto: alcanza para auditar, no reconstruye la pantalla de un bróker autenticado.

**Limitación conocida y deliberada**: `/mercado/cauciones` está fuera del relevamiento automático
porque su URL contiene "caucion", que la barrera bloquea (caucionar *es* operar). No se debilita el
patrón por comodidad; si hacen falta cauciones, se cargan por `opts.instrumentos`.

---

## El Sheet — solo lectura

Fuente: **Flujo de Caja - Cash Flow ECSAS** (`1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`).

El agente **no lo abre por su cuenta**: consume `calendario-financiero.mjs` y `cash-briefing.mjs`,
que son los lectores únicos ya probados en producción. Pestañas que alcanzan: `CAJA`, `Cobranzas`,
`Compras`, `Cheques Emitidos`.

Un test verifica que **ningún** módulo de `tesoreria/` llame a una función de escritura de Google.

Pestañas prohibidas declaradas por el dueño: `08_CONTROL_CLIENTE` y `P&L`. **Ninguna de las dos
existe en este spreadsheet** — la guarda queda igual, por si aparecen o por si el ID cambia.

---

## Qué se publica y qué no

Sólo **cambios materiales**: entrada/salida del descubierto, aparición o desaparición de excedente,
variación del excedente ≥ $500.000, cambio de la mejor tasa ≥ 2 puntos, cambio del instrumento
recomendado, o sesión vencida. Un mensaje diario que repite lo de ayer entrena a la gente a no leerlo.

El mensaje **no lleva botones**: un callback de Mattermost llega sin identidad verificable, y aprobar
una colocación se hace donde se opera — a mano, por una persona.

Canal: `ORQ_TESORERIA_CANAL`. Sin esa variable, el ciclo imprime en el journal y no publica.

---

## Concurrencia e idempotencia

- **Lock**: `pg_try_advisory_lock(738201)`. La segunda corrida se **omite**, no se encola: un análisis
  de tesorería atrasado no sirve.
- **Nunca dos navegadores sobre la misma sesión**: es lo que el lock evita de verdad.
- **Recomendaciones**: clave estable `(bloque, día, instrumento)` → una segunda corrida del mismo día
  actualiza, no duplica.
- **Observaciones de mercado**: histórico **inmutable**, una fila por lectura. Es la única forma de
  auditar si el agente decidió con el dato que había.
- **Timer sin `Persistent=true`**, a propósito: una corrida atrasada publicaría la caja de hoy contra
  tasas que ya no existen.

---

## Aprobación y aprendizaje

Toda propuesta nace `PROPUESTA — REQUIERE APROBACIÓN HUMANA` y **vence en 24 horas**.
`vencerPropuestas()` corre al inicio de cada ciclo.

Correcciones humanas (`tesoreria.feedback`): una **política financiera** es clase E y **nunca** se
aplica sola. Una cortesía ("gracias", "dale", "ok") **no es una confirmación**.

Políticas (`tesoreria.politicas`): se cambian con una fila nueva y aprobación explícita, nunca con un
update en caliente — así queda el historial de qué regla regía cuándo.

Claves que el agente lee y hoy **no están cargadas**:

| Clave | Qué es | Sin ella |
|---|---|---|
| `reserva_minima` | piso de caja que no se perfora | se declara faltante y baja la confianza |
| `caja_restringida` | fondos no disponibles | 0 significa "no hay dato", no "no hay fondos" |

---

## Diagnóstico

```bash
systemctl --user status echegaray-tesorero.timer
journalctl --user -u echegaray-tesorero -n 50 --no-pager
node --test 'orquestador/lib/tesoreria/*.test.mjs'
```

```sql
select run_id, iniciada_en, estado, publicado, motivo from tesoreria.corridas order by iniciada_en desc limit 10;
select bloque, monto_maximo, motivo from tesoreria.ventanas where run_id = '<run>';
select motivo, count(*) from tesoreria.bloqueos_seguridad group by 1 order by 2 desc;
```

| Síntoma | Causa probable |
|---|---|
| `estado=omitida` | otra corrida tenía el lock |
| `session_required` | no hay Chrome con `--remote-debugging-port` (o falta el túnel) |
| `sin_excedente=true` siempre | la cuenta está en descubierto: es la respuesta correcta |
| ninguna propuesta con excedente | ningún instrumento supera el 62,78% — mirá `sin_propuesta` |
| no publica nada | no hubo cambio material; `--forzar` para verlo igual |
