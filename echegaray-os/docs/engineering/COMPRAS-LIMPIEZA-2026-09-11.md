# COMPRAS — LIMPIEZA POR CONCEPTO (orden del dueño, 11/09/2026)

_Pedido textual: «de la pestaña Compras marcá como ELIMINADO todos los conceptos que no sean gastos
de Estructura, Mantenimiento o Civil: todo debe estar contemplado, pasado y futuro, en las pestañas
que corresponden». Análisis de sólo lectura sobre `Compras` viva y el libro `_MOVIMIENTOS`._

## Decisión que salió del análisis

Hoy **no hay doble conteo**: el libro deduplica. Pero cinco grupos entran al Cash Flow SOLO por
Compras (cargas sociales y gremiales pagadas, planes ARCA, impuestos varios, prendario, SAC): $94,1 M
de real y $17,3 M de proyectado. Vaciarlos antes de construir su fuente propia abre un agujero.

Por eso la orden se aplica en dos batches:

- **Batch 1 (seguro, cero efecto en el Cash Flow)**: 37 filas de Jornales/Sueldos que el libro ya
  excluye (`libro-extractores.mjs:166`, la nómina sale de Jornales por Quincena) + f475 (FCL) y f477
  (UOCRA), cubiertas por la cadena de Cargas Sociales. Se excluyen f779/780/781: son la fuente de los
  retiros de Dirección (`direccion-retiros.mjs`). Lista: `orquestador/datos/respaldos/compras-batch1-2026-09-11.json`.
  Se aplica con `orquestador/scripts/compras-marcar-eliminado.mjs`.
- **Batch 2 (después del hito de extractores)**: las 74 filas de unidad Impuestos/Financiero y las 6
  de SAC, cuando el libro emita su REAL y su FUTURO desde el banco, `_F931_RAW`, los planes y la
  cuota del prendario, con un test que pruebe que el Cash Flow no baja al vaciar Compras.

La marca es la del dueño: X = «ELIMINADO» e importe en cero (M/N vacíos si O es fórmula; O = 0 si
está tipeado). CAJA y `sync-compras` suman Compras sin mirar X, por eso el cero.

## Análisis completo (agente de investigación, 11/09/2026)

# Compras — filas candidatas a ELIMINADO (lectura 11/09/2026, sólo lectura)

## Grupo A · Unidad de Negocio ≠ Civil/Estructura/Mantenimiento (74 filas, $97.101.729)

| Fila | ID | Fecha | Proveedor | Cliente/Asig | Concepto | Unidad (I) | Rubro (AC) | Total (O) | Estado (X) | Fecha caja (AD) | ¿Hoy en _MOVIMIENTOS? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 369 | 365 | 2026-01-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.275.316,65 | Pagado | 2026-01-07 | REAL 1.275.316,65 (Financiero) |
| 370 | 366 | 2026-01-10 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 938.878,1 | Pagado | 2026-01-10 | REAL 938.878,1 (Nómina · Gremiales) |
| 373 | 369 | 2026-01-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 144.427,46 | Pagado | 2026-01-16 | REAL 144.427,46 (Impuestos) |
| 374 | 370 | 2026-01-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 51.493,48 | Pagado | 2026-01-16 | REAL 51.493,48 (Impuestos) |
| 375 | 371 | 2026-01-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 700.000 | Pagado | 2026-01-17 | REAL 700.000 (Nómina · Gremiales) |
| 376 | 372 | 2026-01-19 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 3.811.457,55 | Pagado | 2026-01-19 | REAL 3.811.457,55 (Nómina · Cargas sociales) |
| 381 | 377 | 2026-02-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.275.316,65 | Pagado | 2026-02-07 | REAL 1.275.316,65 (Financiero) |
| 382 | 378 | 2026-02-09 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 313.716,79 | Pagado | 2026-02-09 | REAL 313.716,79 (Nómina · Gremiales) |
| 383 | 379 | 2026-02-10 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 1.994.802,59 | Pagado | 2026-02-10 | REAL 1.994.802,59 (Nómina · Cargas sociales) |
| 385 | 381 | 2026-02-13 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 721.871,71 | Pagado | 2026-02-13 | REAL 721.871,71 (Nómina · Gremiales) |
| 387 | 383 | 2026-02-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 144.427,46 | Pagado | 2026-02-16 | REAL 144.427,46 (Impuestos) |
| 388 | 384 | 2026-02-18 | ARCA | Plan de pago |  | Impuestos | Impuestos | 51.493,48 | Pagado | 2026-02-18 | REAL 51.493,48 (Impuestos) |
| 389 | 385 | 2026-02-18 | ARCA | Plan de pago | cuota 1 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-02-18 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 393 | 389 | 2026-03-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.275.316,65 | Pagado | 2026-03-07 | REAL 1.275.316,65 (Financiero) |
| 394 | 390 | 2026-03-30 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 867.458,04 | Pagado | 2026-03-30 | REAL 867.458,04 (Nómina · Gremiales) |
| 395 | 391 | 2026-03-10 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 5.142.044,67 | Pagado | 2026-03-10 | REAL 5.142.044,67 (Nómina · Cargas sociales) |
| 396 | 392 | 2026-03-10 | SINDICATOS | IERIC |  | Impuestos | Nómina · Gremiales | 8.674,58 | Pagado | 2026-03-10 | REAL 8.674,58 (Nómina · Gremiales) |
| 397 | 393 | 2026-03-10 | SINDICATOS | FODECO |  | Impuestos | Nómina · Gremiales | 8.674,58 | Pagado | 2026-03-10 | REAL 8.674,58 (Nómina · Gremiales) |
| 400 | 396 | 2026-03-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 144.427,46 | Pagado | 2026-03-16 | REAL 144.427,46 (Impuestos) |
| 401 | 397 | 2026-03-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 51.493,48 | Pagado | 2026-03-16 | REAL 51.493,48 (Impuestos) |
| 402 | 398 | 2026-03-16 | ARCA | Plan de pago | cuota 2 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-03-16 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 403 | 399 | 2026-03-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-03-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 404 | 400 | 2026-03-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 248.719,4 | Pagado | 2026-03-17 | REAL 248.719,4 (Nómina · Gremiales) |
| 407 | 403 | 2026-04-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.285.716,61 | Pagado | 2026-04-07 | REAL 1.285.716,61 (Financiero) |
| 408 | 404 | 2026-04-14 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 883.252,64 | Pagado | 2026-04-14 | REAL 883.252,64 (Nómina · Gremiales) |
| 409 | 405 | 2026-04-09 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 7.015.981,41 | Pagado | 2026-04-09 | REAL 7.015.981,41 (Nómina · Cargas sociales) |
| 411 | 407 | 2026-04-09 | SINDICATOS | IERIC |  | Impuestos | Nómina · Gremiales | 11.999,4 | Pagado | 2026-04-09 | REAL 11.999,4 (Nómina · Gremiales) |
| 412 | 408 | 2026-04-09 | SINDICATOS | FODECO |  | Impuestos | Nómina · Gremiales | 11.999,4 | Pagado | 2026-04-09 | REAL 11.999,4 (Nómina · Gremiales) |
| 415 | 411 | 2026-04-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 144.427,46 | Pagado | 2026-04-16 | REAL 144.427,46 (Impuestos) |
| 416 | 412 | 2026-04-16 | ARCA | Plan de pago |  | Impuestos | Impuestos | 51.493,48 | Pagado | 2026-04-16 | REAL 51.493,48 (Impuestos) |
| 417 | 413 | 2026-04-16 | ARCA | Plan de pago | cuota 3 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-04-16 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 418 | 414 | 2026-04-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-04-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 419 | 415 | 2026-04-08 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 356.593,52 | Pagado | 2026-04-08 | REAL 356.593,52 (Nómina · Gremiales) |
| 422 | 418 | 2026-05-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.275.316,65 | Pagado | 2026-05-07 | REAL 1.275.316,65 (Financiero) |
| 423 | 419 | 2026-05-11 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 1.137.000 | Pagado | 2026-05-11 | REAL 1.137.000 (Nómina · Gremiales) |
| 424 | 420 | 2026-05-11 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 7.110.198,14 | Pagado | 2026-05-11 | REAL 7.110.198,14 (Nómina · Cargas sociales) |
| 426 | 422 | 2026-05-11 | SINDICATOS | IERIC |  | Impuestos | Nómina · Gremiales | 11.378,78 | Pagado | 2026-05-11 | REAL 11.378,78 (Nómina · Gremiales) |
| 427 | 423 | 2026-05-11 | SINDICATOS | FODECO |  | Impuestos | Nómina · Gremiales | 11.378,78 | Pagado | 2026-05-11 | REAL 11.378,78 (Nómina · Gremiales) |
| 429 | 425 | 2026-05-16 | ARCA | Plan de pago | cuota 4 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-05-16 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 430 | 426 | 2026-05-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-05-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 431 | 427 | 2026-05-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 700.000 | Pagado | 2026-05-17 | REAL 700.000 (Nómina · Gremiales) |
| 433 | 429 | 2026-06-07 | Banco | Credito Prendario |  | Financiero | Financiero | 1.275.316,65 | Pagado | 2026-06-07 | REAL 1.275.316,65 (Financiero) |
| 434 | 430 | 2026-06-10 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 800.000 | Pagado | 2026-06-10 | REAL 800.000 (Nómina · Gremiales) |
| 435 | 431 | 2026-06-10 | ARCA | F931 |  | Impuestos | Nómina · Cargas sociales | 8.974.571,96 | Pagado | 2026-06-10 | REAL 8.974.571,96 (Nómina · Cargas sociales) |
| 437 | 433 | 2026-06-10 | SINDICATOS | IERIC |  | Impuestos | Nómina · Gremiales | 14.097,19 | Pagado | 2026-06-15 | REAL 14.097,19 (Nómina · Gremiales) |
| 438 | 434 | 2026-06-10 | SINDICATOS | FODECO |  | Impuestos | Nómina · Gremiales | 14.097,19 | Pagado | 2026-06-15 | REAL 14.097,19 (Nómina · Gremiales) |
| 443 | 439 | 2026-06-16 | ARCA | Plan de pago | cuota 5 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-06-16 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 444 | 440 | 2026-06-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-06-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 445 | 441 | 2026-06-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 796.806,3 | Pagado | 2026-06-17 | REAL 796.806,3 (Nómina · Gremiales) |
| 456 | 452 | 2026-07-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.282.810,54 | Pagado | 2026-07-07 | REAL 1.282.810,54 (Financiero) |
| 457 | 453 | 2026-07-10 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 800.000 | Pagado | 2026-07-10 | REAL 800.000 (Nómina · Gremiales) |
| 459 | 455 | 2026-07-29 | SINDICATOS | IERIC | Boleta 5715127 · período 2026/06 · 22 tr | Impuestos | Nómina · Gremiales | 15.092,62 | Pagado | 2026-07-30 | REAL 15.092,62 (Nómina · Gremiales) |
| 460 | 456 | 2026-07-29 | SINDICATOS | FODECO | Boleta 5715128 · período 2026/06 · 22 tr | Impuestos | Nómina · Gremiales | 15.092,62 | Pagado | 2026-07-30 | REAL 15.092,62 (Nómina · Gremiales) |
| 461 | 457 | 2026-07-16 | ARCA | Plan de pago | cuota 6 | Impuestos | Deuda previsional (planes de pago) | 1.034.931,82 | Pagado | 2026-07-16 | REAL 1.034.931,82 (Deuda previsional (planes de pago)) |
| 462 | 458 | 2026-07-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-07-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 463 | 459 | 2026-07-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 782.995,57 | Pagado | 2026-07-17 | REAL 782.995,57 (Nómina · Gremiales) |
| 464 | 460 | 2026-08-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.281.778,38 | Pagado | 2026-08-07 | REAL 1.281.778,38 (Financiero) |
| 465 | 461 | 2026-08-10 | FCL | FCL | FCL 07/2026 · lote AFON 260818507 · 17 t | Impuestos | Nómina · Gremiales | 1.222.596 | Pagado | 2026-08-18 | REAL 1.222.596 (Nómina · Gremiales) |
| 466 | 462 | 2026-08-11 | ARCA | F931 | F931 Julio — confirmado contra el extrac | Impuestos | Nómina · Cargas sociales | 8.235.741,96 | Pagado | 2026-08-11 | REAL 8.235.741,96 (Nómina · Cargas sociales) |
| 470 | 466 | 2026-08-10 | SINDICATOS | IERIC | Boleta 5736249 · período 2026/07 · 21 tr | Impuestos | Nómina · Gremiales | 13.191,19 | Pagado | 2026-08-10 | REAL 13.191,19 (Nómina · Gremiales) |
| 471 | 467 | 2026-08-10 | SINDICATOS | FODECO | Boleta 5736247 · período 2026/07 · 21 tr | Impuestos | Nómina · Gremiales | 13.191,19 | Pagado | 2026-08-10 | REAL 13.191,19 (Nómina · Gremiales) |
| 472 | 468 | 2026-08-16 | ARCA | Plan de pago |  | Impuestos | Deuda previsional (planes de pago) | 473.767,08 | Pagado | 2026-08-16 | REAL 473.767,08 (Deuda previsional (planes de pago)) |
| 473 | 469 | 2026-08-17 | SINDICATOS | UOCRA | Boleta 014678474 · período 07/2026 · 21  | Impuestos | Nómina · Gremiales | 649.940,06 | Pagado | 2026-08-17 | REAL 649.940,06 (Nómina · Gremiales) |
| 474 | 470 | 2026-09-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.280.712,77 | Pagado | 2026-09-07 | REAL 1.280.712,77 (Financiero) |
| 475 | 471 | 2026-09-10 | FCL | FCL |  | Impuestos | Nómina · Gremiales | 800.000 | Proyectado | 2026-09-10 | NO (el extractor la excluye) |
| 476 | 472 | 2026-09-07 | ARCA | F931 | F931 Agosto — confirmado contra el extra | Impuestos | Nómina · Cargas sociales | 8.331.697,69 | Pagado | 2026-09-07 | REAL 8.331.697,69 (Nómina · Cargas sociales) |
| 477 | 473 | 2026-09-17 | SINDICATOS | UOCRA |  | Impuestos | Nómina · Gremiales | 700.000 | Proyectado | 2026-09-17 | NO (el extractor la excluye) |
| 478 | 474 | 2026-10-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.282.810,54 | Proyectado | 2026-10-07 | PROYECTADO 1.282.810,54 (Financiero) |
| 479 | 475 | 2026-11-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.282.810,54 | Proyectado | 2026-11-07 | PROYECTADO 1.282.810,54 (Financiero) |
| 480 | 476 | 2026-12-07 | Banco | Credito Prendario | Prestamo Camioneta Ford XLS | Financiero | Financiero | 1.282.810,54 | Proyectado | 2026-12-07 | PROYECTADO 1.282.810,54 (Financiero) |
| 697 | 693 | 2026-08-16 | ARCA | F931 | Plan F931 W303094 | Impuestos | Deuda previsional (planes de pago) | 2.494.875,65 | Pagado | 2026-08-16 | REAL 2.494.875,65 (Deuda previsional (planes de pago)) |
| 698 | 694 | 2026-09-16 | ARCA | F931 | Plan F931 W303094 | Impuestos | Deuda previsional (planes de pago) | 2.494.875,65 | Pendiente | 2026-09-16 | COMPROMETIDO 2.494.875,65 (Deuda previsional (planes de pago)) |
| 699 | 695 | 2026-10-16 | ARCA | F931 | Plan F931 W303094 | Impuestos | Deuda previsional (planes de pago) | 2.494.875,65 | Pendiente | 2026-10-16 | COMPROMETIDO 2.494.875,65 (Deuda previsional (planes de pago)) |
| 836 | 832 | 2026-08-18 | Colegio de Ingenieros SJ | Administracion | Matrícula Anual 2026 MP 4673 · proveedor | Impuestos | Impuestos | 240.000 | Pagado | 2026-08-18 | REAL 240.000 (Impuestos) |

## Grupo B · Unidad de obra pero rubro de caja ajeno (nómina/SAC/cargas) (46 filas, $150.205.705)

| Fila | ID | Fecha | Proveedor | Cliente/Asig | Concepto | Unidad (I) | Rubro (AC) | Total (O) | Estado (X) | Fecha caja (AD) | ¿Hoy en _MOVIMIENTOS? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 371 | 367 | 2026-01-10 | Sueldos | Administracion |  | Estructura | Nómina · Sueldos administración | 4.500.000 | Pagado | 2026-01-10 | NO (el extractor la excluye) |
| 372 | 368 | 2026-01-15 | Sueldos | Obras |  | Estructura | Nómina · Jornales de obra | 4.888.075 | Pagado | 2026-01-15 | NO (el extractor la excluye) |
| 379 | 375 | 2026-01-31 | Sueldos | San Francisco |  | Civil | Nómina · Jornales de obra | 4.911.300 | Pagado | 2026-01-31 | NO (el extractor la excluye) |
| 380 | 376 | 2026-01-31 | Sueldos | LA ESTRELLA |  | Civil | Nómina · Jornales de obra | 2.732.500 | Pagado | 2026-01-31 | NO (el extractor la excluye) |
| 384 | 380 | 2026-02-10 | Sueldos | Administracion | Liquidacion Guada, Ignacio, Sueldo emi y | Estructura | Nómina · Sueldos administración | 4.579.303,51 | Pagado | 2026-02-10 | NO (el extractor la excluye) |
| 386 | 382 | 2026-02-15 | Sueldos | Obras |  | Estructura | Nómina · Jornales de obra | 8.332.250 | Pagado | 2026-02-15 | NO (el extractor la excluye) |
| 390 | 386 | 2026-02-28 | Sueldos | San Francisco | SAN FRANCISCO | Civil | Nómina · Jornales de obra | 5.351.000 | Pagado | 2026-02-28 | NO (el extractor la excluye) |
| 391 | 387 | 2026-02-28 | Sueldos | Obras |  | Estructura | Nómina · Jornales de obra | 3.686.000 | Pagado | 2026-02-28 | NO (el extractor la excluye) |
| 392 | 388 | 2026-03-05 | Sueldos | Administracion |  | Estructura | Nómina · Sueldos administración | 2.960.000 | Pagado | 2026-03-05 | NO (el extractor la excluye) |
| 398 | 394 | 2026-03-13 | Sueldos | San Francisco | SAN FRANCISCO | Civil | Nómina · Jornales de obra | 4.576.750 | Pagado | 2026-03-13 | NO (el extractor la excluye) |
| 399 | 395 | 2026-03-13 | Sueldos | LA ESTRELLA | La Estrella | Civil | Nómina · Jornales de obra | 3.371.450 | Pagado | 2026-03-13 | NO (el extractor la excluye) |
| 405 | 401 | 2026-04-01 | Sueldos | San Francisco | La Estrella | Civil | Nómina · Jornales de obra | 5.773.630,5 | Pagado | 2026-04-01 | NO (el extractor la excluye) |
| 406 | 402 | 2026-04-01 | Sueldos | LA ESTRELLA | SAN FRANCISCO | Civil | Nómina · Jornales de obra | 3.737.187,5 | Pagado | 2026-04-01 | NO (el extractor la excluye) |
| 410 | 406 | 2026-04-10 | Sueldos | Administracion |  | Estructura | Nómina · Sueldos administración | 3.078.125 | Pagado | 2026-04-10 | NO (el extractor la excluye) |
| 413 | 409 | 2026-04-17 | Sueldos | LA ESTRELLA | La Estrella | Civil | Nómina · Jornales de obra | 5.174.629 | Pagado | 2026-04-17 | NO (el extractor la excluye) |
| 414 | 410 | 2026-04-17 | Sueldos | San Francisco | SAN FRANCISCO | Civil | Nómina · Jornales de obra | 1.642.850 | Pagado | 2026-04-17 | NO (el extractor la excluye) |
| 420 | 416 | 2026-04-30 | Sueldos | LA ESTRELLA | La Estrella | Civil | Nómina · Jornales de obra | 6.147.450 | Pagado | 2026-04-30 | NO (el extractor la excluye) |
| 421 | 417 | 2026-04-30 | Sueldos | San Francisco | SAN FRANCISCO | Civil | Nómina · Jornales de obra | 3.792.200 | Pagado | 2026-04-30 | NO (el extractor la excluye) |
| 425 | 421 | 2026-05-10 | Sueldos | Administracion |  | Estructura | Nómina · Sueldos administración | 3.160.000 | Pagado | 2026-05-10 | NO (el extractor la excluye) |
| 428 | 424 | 2026-05-15 | Sueldos | Obras |  | Estructura | Nómina · Jornales de obra | 9.000.000 | Pagado | 2026-05-15 | NO (el extractor la excluye) |
| 432 | 428 | 2026-05-30 | Sueldos | Obras |  | Estructura | Nómina · Jornales de obra | 9.000.000 | Pagado | 2026-05-30 | NO (el extractor la excluye) |
| 436 | 432 | 2026-06-10 | Sueldos | Administracion |  | Estructura | Nómina · Sueldos administración | 2.721.731,2 | Pagado | 2026-06-10 | NO (el extractor la excluye) |
| 439 | 435 | 2026-06-15 | Sueldos | San Francisco | Metalurgia | Civil | Nómina · Jornales de obra | 3.679.400 | Pagado | 2026-06-17 | NO (el extractor la excluye) |
| 440 | 436 | 2026-06-15 | Sueldos | San Francisco | Revoques | Civil | Nómina · Jornales de obra | 340.000 | Pagado | 2026-06-17 | NO (el extractor la excluye) |
| 441 | 437 | 2026-06-15 | Sueldos | MESSINA |  | Civil | Nómina · Sueldos administración | 986.700 | Pagado | 2026-06-17 | NO (el extractor la excluye) |
| 442 | 438 | 2026-06-15 | Sueldos | LA ESTRELLA |  | Civil | Nómina · Jornales de obra | 3.340.550 | Pagado | 2026-06-17 | NO (el extractor la excluye) |
| 446 | 442 | 2026-06-30 | Sueldos | ARCOR | Junio - Segunda | Mantenimiento | Nómina · Jornales de obra | 792.350 | Pagado | 2026-06-30 | NO (el extractor la excluye) |
| 447 | 443 | 2026-06-30 | Sueldos | San Francisco | Junio - Segunda | Civil | Nómina · Jornales de obra | 4.385.350 | Pagado | 2026-06-30 | NO (el extractor la excluye) |
| 448 | 444 | 2026-06-30 | Sueldos | MESSINA | Junio - Segunda | Civil | Nómina · Sueldos administración | 1.642.100 | Pagado | 2026-06-30 | NO (el extractor la excluye) |
| 449 | 445 | 2026-06-30 | Sueldos | LA ESTRELLA | Junio - Segunda | Civil | Nómina · Jornales de obra | 2.564.300 | Pagado | 2026-06-30 | NO (el extractor la excluye) |
| 450 | 446 | 2026-06-30 | Sueldos | Administracion | Junio | Estructura | Nómina · Sueldos administración | 1.296.406,87 | Pagado | 2026-07-01 | NO (el extractor la excluye) |
| 451 | 447 | 2026-06-30 | Sueldos | Administracion | Junio | Estructura | Nómina · Sueldos administración | 1.296.406,87 | Pagado | 2026-07-01 | NO (el extractor la excluye) |
| 452 | 448 | 2026-06-30 | SAC | Administracion | Junio | Estructura | Nómina · SAC | 641.802,48 | Pagado | 2026-06-30 | REAL 641.802,48 (Nómina · SAC) |
| 453 | 449 | 2026-06-30 | SAC | Administracion | Junio | Estructura | Nómina · SAC | 510.605,29 | Pagado | 2026-06-30 | REAL 510.605,29 (Nómina · SAC) |
| 454 | 450 | 2026-06-30 | SAC | Sueldos | Junio | Estructura | Nómina · SAC | 4.952.302 | Pagado | 2026-06-30 | REAL 4.952.302 (Nómina · SAC) |
| 455 | 451 | 2026-06-30 | SAC | Administracion | Junio | Estructura | Nómina · SAC | 1.264.000 | Pagado | 2026-07-01 | REAL 1.264.000 (Nómina · SAC) |
| 481 | 477 | 2026-12-30 | SAC | Sueldos |  | Estructura | Nómina · SAC | 7.000.000 | Proyectado | 2026-12-30 | PROYECTADO 7.000.000 (Nómina · SAC) |
| 482 | 478 | 2026-12-30 | SAC | Administracion |  | Estructura | Nómina · SAC | 1.500.000 | Proyectado | 2026-12-30 | PROYECTADO 1.500.000 (Nómina · SAC) |
| 770 | 766 | 2026-08-03 | Sueldos | LA ESTRELLA | Santiago Isaias Videla | Civil | Nómina · Jornales de obra | 340.000 | Pagado | 2026-08-03 | NO (el extractor la excluye) |
| 779 | 775 | 2026-08-03 | Sueldos | Administracion | Agosto | Estructura | Nómina · Sueldos administración | 3.000.000 | Pagado | 2026-08-03 | NO (el extractor la excluye) |
| 780 | 776 | 2026-08-03 | Sueldos | Administracion | Agosto | Estructura | Nómina · Sueldos administración | 3.000.000 | Pagado | 2026-08-03 | NO (el extractor la excluye) |
| 781 | 777 | 2026-08-04 | Sueldos | Administracion | Agosto | Estructura | Nómina · Sueldos administración | 3.000.000 | Pagado | 2026-08-04 | NO (el extractor la excluye) |
| 800 | 796 | 2026-08-07 | Sueldos | Administracion | Julio - Parte B | Estructura | Nómina · Sueldos administración | 440.000 | Pagado | 2026-08-07 | NO (el extractor la excluye) |
| 801 | 797 | 2026-08-07 | Sueldos | Administracion | Julio - Parte B | Estructura | Nómina · Sueldos administración | 440.000 | Pagado | 2026-08-07 | NO (el extractor la excluye) |
| 827 | 823 | 2026-08-14 | Sueldos | Administracion | Rodrigo | Estructura | Nómina · Sueldos administración | 500.000 | Pagado | 2026-08-14 | NO (el extractor la excluye) |
| 856 | 852 | 2026-08-22 | Sueldos | Taller | Arreglo de camion 608 y orden en fondo d | Estructura | Nómina · Sueldos administración | 177.000 | Pagado | 2026-08-22 | NO (el extractor la excluye) |

## Corroboración por rubro (leída en `orquestador/lib/`)

| Rubro AC | ¿Hoy entra al libro desde Compras? | Pestaña dueña / extractor | Veredicto |
|---|---|---|---|
| Nómina · Jornales de obra · Sueldos administración | NO (`libro-extractores.mjs:166` los saltea) | Jornales por Quincena · `libro-extractores-nomina.mjs` | ELIMINAR no cambia el Cash Flow. EXCEPTO f779/780/781: son la FUENTE de los retiros de Dirección (`direccion-retiros.mjs:145-171` filtra Compras K/O/AD con importe>0) |
| Nómina · Cargas sociales / Gremiales | SÍ las PAGADAS (REAL); las pendientes sólo si la cadena no cubre el mes (`libro-extractores-cargas.mjs:445-451`) | Cargas Sociales · `deCargasSociales` — emite sólo FUTURO y se apaga por `mesesPagados` de Compras (`:378-381`) | Pasado: NO CONTEMPLADO en otra pestaña (el libro no tiene Cargas Sociales REAL). Además, sin la fila pagada la cadena vuelve a emitir el mes (F931 no se cruza con el banco) |
| Deuda previsional (planes de pago) | SÍ (`rubro-caja.mjs:104` paga:'compras') | ninguna: Cargas Sociales publica el rango `planes` para el hero, no al libro | NO CONTEMPLADO — eliminar borra $16,5M pasados + $4,99M futuros |
| Impuestos (planes ARCA viejos + Colegio Ing.) | SÍ (`rubro-caja.mjs:156`) | Impuestos y Financieros sólo emite IVA/IIBB/Ley 25.413 (`libro-extractores.mjs:573-605`) | NO CONTEMPLADO |
| Financiero (prendario) | SÍ (`rubro-caja.mjs:162`) | `deBancoCargos` sólo cargos sin factura (`libro-extractores.mjs:365`); Impuestos y Financieros lo LEE de Compras (`impuestos-pestana.mjs:181`) | NO CONTEMPLADO — eliminar borra $11,5M pasados + $3,85M futuros |
| Nómina · SAC | SÍ (`rubro-caja.mjs:85`) | ninguna (`cash-flow-lineas.mjs:885` lo lee del libro) | NO CONTEMPLADO — $7,37M pasados + $8,5M dic |

---

## Simulación sin Compras — 11/09/2026, 20:15 (rama `feat/libro-fuentes-propias`)

**Qué es.** `node orquestador/scripts/libro-simular-sin-compras.mjs` arma el libro DOS VECES sobre las
mismas lecturas —tal cual, y con las 81 filas que el vaciado anula marcadas `ELIMINADO`, que es lo que
el bisturí escribe de verdad— y publica la diferencia. Es **sólo lectura** (`READONLY_SCOPES`): no
toca el Sheet. La salida literal de la última corrida:

```
SIMULACIÓN SIN COMPRAS — corte 2026-09-11 · sólo lectura
  filas de Compras que el vaciado anula: 81 (unidades: Financiero 12 · Impuestos 63 · Estructura 6)
  libro TAL CUAL: 1297 movimiento(s) · neto $37.027.766
  libro VACIADO : 1251 movimiento(s) · neto $58.607.160
  el extracto de _BANCO_RAW empieza el 2026-05-28: lo anterior NO lo puede reponer ninguna fuente bancaria

  LOS RUBROS QUE LA ORDEN PONE EN RIESGO — «pierde» es egreso que el cuadro deja de ver
  RUBRO                                 NETO con extracto   PIERDE antes           GANA
  ✓ Financiero                                    -$2.895     $6.386.983         $9.189
  ✓ Nómina · Cargas sociales                           $0    $25.074.484    $19.268.224
  ✓ Nómina · Gremiales                           -$27.240     $6.931.596     $8.875.981
  ✓ Nómina · SAC                              -$4.699.908             $0    $10.460.216
  ✗ Impuestos                                    $240.000       $783.684             $0
  ✗ Deuda previsional (planes de pago)         $4.989.751     $5.561.029             $0

  LO QUE HAY QUE EXPLICAR (rubro crítico que pierde plata con el extracto disponible)
    2026-06 Nómina · SAC                        REAL         $5.760.309
    2026-09 Deuda previsional (planes de pago)  FUTURO       $2.494.876
    2026-10 Deuda previsional (planes de pago)  FUTURO       $2.494.876
    2026-06 Nómina · Gremiales                  REAL         $1.625.001
    2026-07 Nómina · Gremiales                  REAL         $1.598.088
    2026-08 Nómina · Gremiales                  REAL         $1.235.787
    2026-08 Impuestos                           REAL           $240.000
    2026-10 Financiero                          FUTURO           $2.098
    2026-11 Financiero                          FUTURO           $2.098
    2026-12 Financiero                          FUTURO           $2.098

  LAS PRÓXIMAS 8 SEMANAS (neto de caja)
  SEMANA DEL             ACTUAL          VACIADO       DIFERENCIA
  2026-09-07        $42.914.365      $42.914.365               $0
  2026-09-14        $49.497.368      $51.992.244       $2.494.876
  2026-09-21        $25.065.382      $25.065.382               $0
  2026-09-28        $10.980.252      $10.980.252               $0
  2026-10-05        $12.205.343      $12.207.441           $2.098
  2026-10-12        -$5.142.052      -$2.647.176       $2.494.876
  2026-10-19        -$4.639.445      -$4.639.445               $0
  2026-10-26        $21.843.097      $21.843.097               $0

  ✗ DENTRO de la ventana del extracto el vaciado todavía le saca plata a: Impuestos $240.000 · Deuda previsional (planes de pago) $4.989.751
  ⚠ ANTES del 2026-05-28 el vaciado se lleva $44.737.776 que NINGUNA fuente puede reponer: el extracto no llega a esas fechas. Las dos salidas son importar el extracto de enero a mayo (scripts/importar-banco.mjs) o NO vaciar las filas anteriores a junio.
```

### Cómo se lee, y el error que hay que no cometer

Los egresos viven en el libro con `signo: -1`. En un rubro de egreso **un delta POSITIVO es plata que
el cuadro PIERDE** y un negativo es cobertura nueva. Por eso el SAC de diciembre aparece como
−$7.978.905: es la línea que no existía y ahora existe. El criterio se juzga sobre el **neto del rubro
dentro de la ventana del extracto**.

### Veredicto rubro por rubro

| Rubro | Neto con extracto | Estado |
|---|---|---|
| Financiero | −$2.895 | ✓ cierra. El prendario REAL sale del extracto y el futuro de `datos/prestamo-prendario.json` con el importe del último débito real |
| Nómina · Cargas sociales | $0 | ✓ cierra. El F931 se aparea al centavo contra la DDJJ declarada y el mes pagado apaga la cadena |
| Nómina · Gremiales | −$27.240 | ✓ cierra. Se reusa el apareo de `cargas-pagos-banco.mjs`, que ya existía y sólo restaba la obligación |
| Nómina · SAC | −$4.699.908 | ✓ cierra y MEJORA: aparece el medio aguinaldo de diciembre ($7.978.905) que antes no estaba en ninguna celda |
| Impuestos | **$240.000** | ✗ el Colegio de Ingenieros de agosto. `banco-santander.mjs` no tiene ninguna regla que lo reconozca: sin naturaleza no hay apareo y adivinar por el texto sería fabricar |
| Deuda previsional | **$4.989.751** | ✗ las dos cuotas PENDIENTES de Compras (sep y oct). Es el hueco declarado PLAN SIN CRONOGRAMA: el OS conoce tres importes de cuota observados y no sabe cuántas faltan |

### Los dos límites que decide el dueño, no el código

1. **`_BANCO_RAW` empieza el 28/05/2026.** El vaciado se lleva **$44.737.776** de pagos anteriores que
   ninguna fuente bancaria puede reponer, porque el extracto no llega a esas fechas. Peor que perder el
   importe: en cargas sociales la cadena vuelve a emitir esos meses como deuda VENCIDA ($19.268.224),
   así que el cuadro diría que se debe plata que se pagó en marzo. **Dos salidas: importar el extracto
   de enero a mayo (`scripts/importar-banco.mjs`) o no vaciar las filas anteriores a junio.**
2. **El SAC de junio ($5.760.309) sólo tiene $2.481.312 de respaldo bancario identificable.** El resto
   salió dentro de lotes de haberes que las quincenas reclaman, y `haberes-conciliacion.mjs` ya dejó
   escrito que el extracto no puede separar un SAC de una liquidación final. Se reporta, no se imputa.

### Lo que la simulación encontró de MI propio trabajo

- La cuota de junio del prendario se contaba **dos veces**: Compras decía $1.275.317 y el banco debitó
  $1.284.505,37 (0,7 %, porque el préstamo ajusta). El dedupe por importe exacto no los reconocía como
  el mismo hecho. Se agregó una banda relativa del 2 % **sólo** donde el instrumento garantiza una
  obligación por mes (prendario y F931), con el mismo mes calendario exigido — sin eso, la fila de
  agosto explicaba también la cuota de septiembre, que está a 31 días.
- Los planes de ARCA son **tres** importes recurrentes ($1.034.931,85 · $473.767,08 · $2.494.875,65),
  no uno: con un solo importe se reponía una cuota de tres.
