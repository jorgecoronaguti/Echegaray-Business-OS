# LO QUE LE FALTA A XSAS PARA CERRAR UN PRESUPUESTO

> Medido el 2026-08-31 sobre COT-2026-001 (Salón Comercial, 26 partidas, 110 recursos, $ 84,9 M),
> corriendo el motor real contra la base real, con cero llamadas a un modelo.

## La respuesta corta: cuatro precios

El motor no puede afirmar el costo directo de Quattropani. Tiene **61 recursos bloqueados** y
**$ 12.485.690** en riesgo. Pero esa plata no está repartida: está concentrada.

| recurso | plata bloqueada | acumulado | vencido hace |
|---|---:|---:|---:|
| **Panel Chapa Trape Blanco Pur 50 mm Foil Blanco** | **$ 8.239.289** | **66 %** | 754 días |
| **VIAJE DE TATU con RSU** | **$ 2.520.000** | **86 %** | 729 días |
| HIERRO LISO ø 16 | $ 398.759 | 89 % | 526 días |
| PLACA DE YESO 12,5 × 2,4 × 1,2 | $ 296.100 | 92 % | 757 días |
| PINO ÁLAMO TABLA 1"×4" | $ 197.665 | 93 % | 911 días |
| PLANCHUELA 1 1/4" esp. 1/8 | $ 120.093 | 94 % | 754 días |
| CERÁMICOS PARA REVESTIMIENTO 1º | $ 118.144 | 95 % | 395 días |
| PINO ÁLAMO TIRANTE 2"×4" | $ 100.674 | 96 % | 476 días |
| ADHESIVO PARA CERÁMICOS - KLAUKOL | $ 74.923 | 97 % | 395 días |
| CLAVO PUNTA PARÍS 2" | $ 60.958 | 97 % | 911 días |
| …otros 51 recursos | $ 358.085 | 100 % | — |

**Dos precios son el 86 %. Cuatro son el 92 %.** Los otros cincuenta y siete, juntos, son el 8 %.

Hay uno vencido hace **1.306 días** (TOMA CORRIENTE COMÚN) que mueve $ 30.080. Ése es exactamente el
tipo de recurso que no debería frenar nada, y por eso el motor ahora lo separa por materialidad en
lugar de tratarlo igual que el panel de chapa.

## Por qué el motor no los resuelve solo

No es que no lo intente. Se probó fuente por fuente y quedó medido:

| lo que se intentó | resultado |
|---|---|
| **precio interno más nuevo** | es el que está vencido: cada recurso tiene **una sola** observación |
| **compras reales de ECSAS** | 800 filas leídas · 8 recursos resueltos en todo el catálogo · **0 de estos** |
| **tramo de paritaria UOCRA** | resolvió los 5 de mano de obra — ya no están en esta lista |
| **comparables del catálogo** | **0 de 61**, y por construcción: ver abajo |
| **serie histórica propia** | no existe: 389 recursos con 1 observación cada uno |
| **índice de precios** | el IPC llega hasta 2026-06 y no alcanza para indexar un precio de 2017 |

El desglose de por qué ningún comparable sirve, condición por condición:

- **49 de 61** se miden en `un`, `UN` o `DÓLAR` — unidades de conteo, tiempo o moneda. En `un` el
  precio **es** el objeto, no el material: un tomacorriente y un gabinete de 30 bocas comparten la
  unidad y no comparten nada más. **No hay comparable posible, no es cuestión de aflojar un umbral.**
- **11** están en unidad intensiva pero son productos únicos del catálogo, sin ningún par: Cemento
  Blanco, Hierro Liso ø 16, Panel Chapa Trape, Adhesivo Klaukol y otros siete.
- **1** (Clavo Punta París 2") tiene exactamente un comparable, y es de **2017**.

Donde la regla del comparable sí funciona —los siete diámetros de `HIERRO TORSIONADO`, todos a
$ 1.615/kg el mismo día— ya está todo con precio fresco. El resolvedor está bien; **este catálogo no
le da de qué agarrarse**.

## Qué desbloquea qué

Está probado de punta a punta que un precio nuevo atraviesa el motor entero y **el costo directo pasa
a afirmarse**: se corrió con un precio de prueba y la cotización llegó hasta el final. O sea que lo
que falta no es cañería, es el dato.

Hay dos caminos, y ninguno es código:

1. **Actualizar cuatro precios** y el 92 % del riesgo desaparece. Es media hora de trabajo de quien
   compra, y no requiere tocar el sistema: los precios entran por donde ya entran.
2. **Firmar un override** por recurso, si el criterio es «lo asumo con el precio viejo». El motor lo
   admite, exige quién lo autoriza y queda como evento auditado. Un override sin firma no existe —
   eso es deliberado y lo puso una auditoría anterior, después de que el motor llegara a sellar una
   versión como validada con precios de catorce meses.

## El efecto secundario que importa más que el presupuesto

Cada precio que se cargue **de acá en adelante se INSERTA en vez de pisar la fila anterior**. Ése es
el cambio que hace que dentro de unos meses el sistema pueda medir la volatilidad real de cada
recurso en lugar de estimarla con el IPC: hoy los 389 recursos tienen exactamente una observación
cada uno, y eso no es falta de historia — **es la firma de una carga que siempre sobrescribió**.

A la tercera vez que un recurso consiga precio, su vigencia deja de ser estimada y pasa a ser medida.
