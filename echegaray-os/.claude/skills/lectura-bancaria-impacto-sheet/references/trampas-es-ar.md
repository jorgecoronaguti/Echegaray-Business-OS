# Trampas al leer un extracto del Santander (es-AR)

Todas están resueltas en `orquestador/lib/banco-importar.mjs` y cubiertas por su test. Se listan para
saber QUÉ mira el parser y qué queda a cargo de quien transcribe una captura.

## Resueltas por el parser

| Trampa | Ejemplo | Regla |
|---|---|---|
| **Coma decimal, punto de miles** | `1.234,56` | se saca el punto, la coma pasa a punto. Leerlo como inglés da `1.23456` — plausible y equivocado, no da error |
| **Signo al final** | `1.234,56-` | negativo (varios exports lo ponen así) |
| **Débito entre paréntesis** | `(1.282.810,54)` | negativo. Es el formato del CSV descargado del homebanking |
| **Fecha DD/MM, nunca MM/DD** | `07/05/2026` = 7 de mayo | todo el Drive es es-AR; leerla al revés da el día equivocado sin avisar |
| **Fecha sin año** | `22/07` | de las capturas del listado del día; toma el año por defecto |
| **Número dentro del concepto** | `tarj nro. 6077`, CUIT | el importe se busca de atrás para adelante y un campo con letras corta la búsqueda |
| **Concepto con espacios largos** | `Pago haberes - 260717507      260717507` | el CSV se parte SÓLO por `;` cuando hay encabezado con columnas extra |
| **Orden descendente** | homebanking lista del más nuevo al más viejo | se invierte a orden cronológico (la cadena de saldos sólo cierra así) |
| **Movimiento del día sin saldo** | `Cheque debitado` sin columna saldo | entra con saldo `null`, no `0`. Un 0 inventado rompe la cadena o infla CAJA hacia abajo |
| **Back-fill intradía** | filas del día sin saldo corrido | el saldo se deduce encadenando desde el último saldo conocido |

## A cargo de quien transcribe una CAPTURA (el parser no puede saberlo)

| Trampa | Por qué el parser no la ve | Qué hacer |
|---|---|---|
| **Signo por color** | la banca online muestra el débito en rojo **sin** signo menos; del OCR sale positivo | aplicar el signo a mano (rojo/"enviada"/"débito" → negativo) ANTES de pasar el texto al parser |
| **Débito/crédito en columnas separadas** | el screenshot puede tener dos columnas "Débito | Crédito" en vez de un importe con signo | consolidar a un solo importe con signo antes de parsear |
| **Falta la columna saldo** | en "Movimientos del Día" no hay saldo corrido | sin saldo, la cadena no puede verificar el signo — extremar el cuidado |

## La red de seguridad

La **cadena de saldos** (`saldo(n) = saldo(n−1) + importe(n)`) atrapa cualquier importe o signo mal leído
**siempre que la fila traiga saldo**. `previsualizar-impacto-banco.mjs` y `importar-banco.mjs` la corren y
**no cargan** si no cierra (salvo `--igual-cargalo` con motivo declarado). Por eso el mayor riesgo real
son las filas sin saldo: ahí no hay red y el signo es responsabilidad de quien transcribe.
