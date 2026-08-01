---
name: tesoreria-inversiones-corporativas
description: "Criterio experto para colocar excedentes de caja de una constructora: cuánto sobra de verdad, por cuánto tiempo, contra qué tasa de corte se mide y qué instrumento es apto para caja operativa (no para una cartera personal). Activar ante cualquier pregunta sobre invertir plata parada, plazo fijo, money market, FCI, Lecap, caución, 'me conviene dejarlo en el banco', o al evaluar una oportunidad de Balanz. Trabaja en PERCIBIDO y subordinada a finanzas-tesoreria-construccion: si esa skill dice que no hay caja, acá no hay nada que decidir."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
  version: "1.0.0"
---

# Tesorería e Inversiones Corporativas — caja de constructora

## Propósito

Decidir qué hacer con la plata que sobra **sin poner en riesgo la operación**. No es asesoramiento de
inversión: es gestión de caja. La diferencia no es de grado, es de objetivo — una cartera busca
rendimiento, una tesorería busca no quedarse sin plata el día 5.

## Contribución a la misión

Del `CLAUDE.md` raíz: **proteger o generar caja** y **reducir el costo de oportunidad**. Una empresa
que opera en descubierto y a la vez deja saldos ociosos está pagando dos veces por el mismo peso.

## LA REGLA QUE GOBIERNA TODO

> **CANCELAR DESCUBIERTO ES UNA INVERSIÓN AL CFT DEL ACUERDO, LIBRE DE RIESGO Y DE IMPUESTOS.**

Echegaray opera con el acuerdo N°00007 al **62,78% CFT** (verificado contra el cargo real del banco,
no supuesto). Entonces la **tasa de corte** de cualquier colocación no es cero: es 62,78% efectivo
anual. Un instrumento que rinde menos **hace perder plata**, aunque el número sea positivo.

Consecuencia práctica: **mientras la cuenta esté en rojo, la respuesta correcta es siempre "no
inviertas, cancelá la línea"**. Un análisis que en esa situación propone un FCI está mal, por más
prolijo que se vea.

## Las cinco cajas que la gente llama "caja"

| Concepto | Qué es | ¿Se invierte? |
|---|---|---|
| **Real** | lo que hay hoy en las cuentas (percibido) | es el punto de partida |
| **Comprometida** | ya tiene destino y fecha: cheques, obligaciones, proveedores | **nunca** |
| **Restringida** | está en la cuenta pero no es de libre disposición | **nunca** |
| **Mínima** | piso operativo, política del dueño | **nunca** |
| **Excedente** | real − comprometida − restringida − mínima | lo único evaluable |

Y una sexta que no es caja y se confunde siempre: **lo por cobrar**. Una factura emitida, un cheque
en cartera y una cobranza esperada **no son caja** hasta que se acreditan.

## El número que decide no es el saldo: es el piso del período

Un saldo de $10M hoy no habilita invertir $10M a 30 días si el día 5 se pagan sueldos y el saldo toca
$1M. **El techo de lo invertible a N días es el saldo MÍNIMO del período**, y bajo escenario adverso
(cobros al 50%), porque lo que falla en una constructora es que los clientes pagan tarde.

Los egresos **no** se relajan en el escenario adverso: ya son compromisos. Suponer que se postergan
solos es el optimismo que deja a la empresa sin plata.

## Tasas: el error que no se ve

Nunca comparar sin llevar todo a una sola vara (TEA):

- **TNA ≠ TEA.** 60% TNA con capitalización mensual es 79,6% TEA.
- **Un rendimiento histórico NO se anualiza para comparar.** El pasado no es una expectativa;
  presentarlo como tal es fabricar precisión.
- **Una tasa sin tipo declarado no entra al análisis.** Es preferible un instrumento sin tasa —que
  queda afuera— a uno con un número que nadie sabe qué mide.
- **Los costos se restan del rendimiento DEL PERÍODO, no de la tasa anual.** Una comisión del 0,5%
  sobre 7 días se come tres veces el rendimiento.

## Liquidez: rescate + liquidación

El plazo real de vuelta es la **suma**. Un fondo que "rescata T+0" pero liquida T+2 devuelve la plata
en dos días. Si no se conoce el plazo de rescate, la liquidez **no se asume compatible**: se excluye.

## Aptitud para caja operativa

| Apto | No apto para caja operativa |
|---|---|
| Money market, FCI renta fija, Lecap/letras, caución, plazo fijo | Bonos, ON, CEDEAR, acciones, renta variable/mixta, dólar linked, hard dollar |

No es una opinión sobre el instrumento: un CEDEAR puede ser una gran inversión y una pésima decisión
de tesorería el mismo día. La caja operativa no admite pérdida de capital ni demora.

## Riesgos, en el orden que importan para una tesorería

1. **Liquidez / rescate** — el dominante. Si la plata no vuelve a tiempo, nada más importa.
2. **Pérdida de capital** — todo lo que cotiza a precio de mercado la tiene.
3. **Información desactualizada** — una tasa de ayer no es la de hoy. Más de 24 horas **bloquea**.
4. Moneda (descalce: las obligaciones son en pesos), crédito, duration, concentración.

La volatilidad se castiga **menos** que la iliquidez, al revés de una cartera personal.

## Nivel E — nunca se ejecuta

Comprar, vender, suscribir, rescatar, transferir, confirmar, caucionar, licitar: **todo requiere
aprobación humana explícita**. Este dominio produce PROPUESTAS. Toda recomendación nace y muere como
`PROPUESTA — REQUIERE APROBACIÓN HUMANA`, y trae adjunto qué la invalida y cuándo vence.

## Datos que faltan y no se inventan

- **Reserva mínima operativa**: es una política del dueño. Sin ella declarada, se dice que falta y
  baja la confianza — no se supone un piso.
- **Caja restringida**: hoy ninguna fuente del OS la declara. Un 0 significa "no hay dato".

## Implementación en el OS

El criterio de esta skill está ejecutado y probado en `orquestador/lib/tesoreria/`: diez módulos, uno
por skill del contrato, con 65 tests. La aritmética es determinística — el modelo no suma.

Runbook operativo: `docs/tesoreria/RUNBOOK.md`.

## Política de vigencia

El CFT del acuerdo, el límite de la línea y las alícuotas cambian. **Antes de usar la tasa de corte
en una decisión concreta se verifica contra `banco-santander.mjs` y el extracto vigente.** Un número
de este documento nunca se cita como vigente sin ese chequeo.

## Política de aprendizaje

Clasificación A–E del `CLAUDE.md` raíz. Una política financiera (reserva, tolerancia, instrumentos
excluidos) es **siempre D o E**: no se modifica automáticamente, ni con tres confirmaciones ni con
treinta. Y una cortesía —"gracias", "dale"— **no es una confirmación**.
