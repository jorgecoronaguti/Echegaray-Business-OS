# MAPA DE IMPACTO — evento bancario → pestaña/columna del Flujo de Caja

Cada regla acá está implementada en el código y **no se duplica**: esta referencia documenta dónde vive.
El mapa como dato verificable está en `orquestador/lib/impacto-bancario.mjs` (`DESTINOS`, `IMPACTO_UNIVERSAL`),
con `impacto-bancario.test.mjs` que corre el extracto real entero y falla si algún evento queda sin destino.

Flujo físico del dato:
```
extracto/captura → importar-banco.mjs → public.banco_movimientos → banco-raw-pestana.mjs → _BANCO_RAW
                                                                                              │
        CAJA (fórmulas) ◄── Impuestos y Financieros (fórmulas) ◄── Cheques Emitidos (sync) ◄─┘
```

## Impacto universal (todos los movimientos)

| Evento | Destino | Mecanismo | Archivo |
|---|---|---|---|
| Saldo de cuenta (último saldo declarado) | CAJA · 1 Disponibilidades · Banco Santander (pesos) | `formulaUltimoSaldo` = `INDEX(...; MAX(ISNUMBER×(<>0)×ROW))` — ignora placeholders del día (saldo 0/vacío) | `lib/caja-posterior-al-corte.mjs` L146; `scripts/caja-pestana.mjs` (`refs.bancoRaw`) |
| Fecha de corte | CAJA · Fecha del saldo + ancla de "posteriores al corte" | `formulaFechaCorte` = `MAX(_BANCO_RAW!A)` | `lib/caja-posterior-al-corte.mjs` L161 |
| Réplica de cada movimiento | `_BANCO_RAW` (fecha, concepto, importe, saldo, entra/sale, **Naturaleza**) | la columna Naturaleza (F) la deduce el OS: es lo que hace posible cada SUMIF/SUMPRODUCT de abajo | `scripts/banco-raw-pestana.mjs` |

## Débitos (importe < 0) → pestaña de su naturaleza

| Naturaleza (`clasificarMovimiento`) | Destino | Mecanismo | Archivo |
|---|---|---|---|
| Impuesto al cheque (Ley 25.413) | Impuestos y Financieros · §4 Otros impuestos, por mes | `SUMPRODUCT((YEAR=..)(MONTH=..)×SEARCH("Impuesto al cheque"; col F)×ABS(col C))` — la alícuota 0,6% la **declara el banco** en el concepto, no se cita de memoria | `scripts/impuestos-pestana.mjs` L248-253 |
| Costo financiero del descubierto (interés + IVA 10,5% + percep RG 2408) | CAJA · §4.3 Costo del descubierto | `SUMIFS(col C; Naturaleza; "Costo financiero del descubierto"; por mes)`; la línea del mes es `MAX(proyectado; real)` para no subestimar. CFT ×1,12 **verificado** contra el cargo real del 14/07 | `lib/costo-descubierto.mjs` L110-121 |
| Préstamo prendario | Impuestos y Financieros · §6 Deuda financiera | `ABS(SUMIF(col F; "Préstamo prendario"; col C))`, proyectada a los meses que faltan (es UNA cuota, no doce) | `scripts/impuestos-pestana.mjs` L309 |
| Cheques y echeq | Cheques Emitidos · columna DEBITADO (K) | `cheques-emitidos-sync-banco.mjs` marca por nº de echeq: Pagado→SI, Aceptado→No. **Fuente: lista `ECHEQS_EMITIDOS`** (captura), no el parser de movimientos | `scripts/cheques-emitidos-sync-banco.mjs` |
| Sueldos | Jornales por Quincena / Cargas Sociales (detalle) | el saldo absorbe la salida; el detalle vive en su pestaña | — |
| AFIP | Impuestos y Financieros | el saldo lo absorbe; el desglose por impuesto NO sale del concepto (gap) | `scripts/impuestos-pestana.mjs` |
| Pago de la tarjeta | Tarjeta de Credito (control de disponible) | CAJA §4.2 controla disponible tarjeta vs pestaña Tarjeta | `scripts/caja-pestana.mjs` bloque 4.2 |
| Compras con tarjeta de débito / Transferencias a proveedores | Compras (detalle: obra, rubro) | el saldo absorbe; si es Pagado por Transferencia/Débito y posterior al corte, resta en la línea neta de CAJA | `lib/caja-posterior-al-corte.mjs` L96 (`formulaComprasPagadasPosteriores`) |
| Débitos automáticos (seguros) | Recurrentes / Compras | el saldo lo absorbe | — |
| Ajuste sin detalle del banco (hold intradía) | CAJA (rotulado, no disfrazado) | entra a `_BANCO_RAW` con su rótulo para cerrar la cadena; bucket propio para no ensuciar la conciliación | `lib/banco-santander.mjs` MOVIMIENTOS_DIA |

## Créditos (importe > 0) → el saldo ya los contiene; sólo `cobranza` se concilia

`naturalezaIngreso` (`lib/banco-santander.mjs` L553) separa tres naturalezas por CUIT de contraparte y por concepto:

| Naturaleza | Qué es | Tratamiento |
|---|---|---|
| `cobranza` | un cliente pagó | ÚNICO grupo que se compara contra Cobranzas en la misma ventana |
| `traslado` | plata propia cambiando de lugar (depósito de efectivo, echeq propio que se acredita) | no es ingreso nuevo; alimenta la alerta de CAJA "efectivo cobrado que no se depositó" |
| `financiero` | rescate de inversión, desembolso de préstamo (Balanz, por CUIT 30710630670) | nunca es ingreso operativo |

**Por qué importa:** comparar traslado o financiero contra Cobranzas inventa una diferencia falsa — es lo que hizo que el OS reportara $11,9M "faltantes" que nunca faltaron.

## Movimientos posteriores al corte → CAJA (línea neta)

`formulaNetaPosterior` (`lib/caja-posterior-al-corte.mjs` L110): cobros (estado Cobrado, sin echeq) − cheques debitados − compras pagadas por transferencia/débito, **todo con fecha > corte**. El extracto ya trae lo anterior; contarlo de nuevo duplicaría. Los echeqs quedan afuera porque ya están en Valores a depositar.

## Datos bancarios que NO entran por el importador de movimientos (gap)

Estos viven como constantes capturadas en `lib/banco-santander.mjs` y hoy requieren editar el archivo cuando cambian:
- `CUENTA.saldoDolares` (saldo USD)
- `ACUERDO` (descubierto: importe, TNA/TEA/CFT, vencimiento)
- `TARJETA` (límite, consumos, cuotas, disponible)
- `ECHEQS_TERCEROS` (custodia/endosado/cobrado)
- `ECHEQS_EMITIDOS` (para el sync del DEBITADO)

El importador de movimientos cubre **el extracto de transacciones**. Estos otros son fotos de otras pantallas del homebanking; que no tengan puerta propia es un gap declarado, no un descuido a tapar.
