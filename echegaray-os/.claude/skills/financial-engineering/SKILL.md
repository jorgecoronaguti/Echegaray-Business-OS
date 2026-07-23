---
name: financial-engineering
description: Motor de Ingeniería Financiera del Business OS — el cerebro de tesorería que optimiza permanentemente liquidez, capital de trabajo y costo financiero. Piensa como el CFO/Tesorero de una corporación: consolida en un modelo único de liquidez las fuentes ya existentes (caja, obligaciones, cobranzas, cheques, descubierto, IVA), y agrega la capa de DECISIÓN que faltaba (priorización de pagos multicriterio, comparación de alternativas de financiamiento, recomendaciones justificadas económicamente). Activar ante cualquier decisión de tesorería: qué pagar y cuándo, con qué medio, si entrar al descubierto/descontar un cheque/esperar, cómo cubrir un bache de caja, cómo optimizar el capital de trabajo. Toda la lógica vive en el Business OS (orquestador/lib/ingenieria-financiera.mjs); la Web, el Director IA, el CFO IA y las APIs sólo consumen su resultado.
metadata:
  type: expert-domain
---

# Financial Engineering — el motor de tesorería del Business OS

## Qué es (y qué NO es)

**NO** es un reporte, un dashboard, un calendario ni un módulo financiero tradicional. Es el **motor de
Ingeniería Financiera**: el cerebro que optimiza permanentemente la liquidez, el capital de trabajo y
el costo financiero de Echegaray, y que **piensa y decide como el CFO y Tesorero de una corporación**.

Su mandato, subordinado a la misión del Business OS:

- **maximizar liquidez** permanentemente;
- **minimizar el costo financiero total**;
- **minimizar el riesgo financiero**;
- **optimizar el capital de trabajo**;
- **transformar información financiera en decisiones concretas**.

Regla de conducta absoluta: **nunca limitarse a informar. Siempre recomendar. Siempre justificar
económicamente.** Nunca responder sí/no pelado — explicar el porqué en pesos.

## Dónde vive la lógica (y dónde NO)

Toda la lógica vive **dentro del Business OS**:

- **`orquestador/lib/ingenieria-financiera.mjs`** — el motor determinista (núcleo puro + ensamblador).
- **`orquestador/lib/tools/ingenieria-financiera-tool.mjs`** — el contrato único que expone el motor:
  `finanzas.modelo_liquidez`, `finanzas.comparar_financiamiento`, `finanzas.priorizar_pagos`.

**Nunca** en React. **Nunca** en Google Sheets. **Nunca** duplicando lógica. La Web, el Director IA,
el CFO IA, el Flujo de Fondos, las APIs y futuras interfaces **sólo consumen** el resultado de este
motor a través del tool. Si una cara del OS recalcula por su cuenta un número que este motor ya da, es
un bug de arquitectura ([[arquitectura-3-caras-nucleo]], [[fuente-unica-postgres]]).

## LA REGLA QUE GOBIERNA TODO: no duplicar fuentes

Cada número de plata **ya tiene una fuente única y verificada** en el OS. Este motor **no recalcula
ninguno** — los **ensambla** en un modelo único y agrega la capa de decisión. El valor nuevo de esta
skill es el **cerebro que decide**, no otra copia de los datos.

| Concepto | Fuente única (dueña del dato) — se CONSUME, no se recalcula |
|---|---|
| Saldo de caja / disponibilidades / cobranzas / vencimientos 7d | `cash-briefing.mjs` (columnas estructuradas del Flujo de Caja) |
| Obligaciones (saldo, vencido, próx. 30 días) | `obligaciones.mjs` → vista `public.obligacion_resumen` (compartida con la web) |
| Costo del descubierto (verificado contra el cargo real) | `costo-descubierto.mjs` (TNA 55% ×1,12 = IVA 10,5% + percep 1,5%) |
| Límite del acuerdo / tarjeta / cupos | `banco-santander.mjs` (declarado por el banco, no estimado) |
| Impuesto al cheque | `impuesto-cheque.mjs` (Ley 25.413, 0,6% cada lado) |
| Cheques emitidos/recibidos, cobertura | `cheques-cobertura.mjs`, `cheques-recibidos.mjs` |
| Deuda por proveedor y plazo de pago | `compras-proveedores.mjs` |
| IVA a pagar / posición fiscal | `libro-iva.mjs`, `posicion-iva.mjs` |
| Cobranzas por cliente / reclamo | `cobranzas-por-cliente.mjs`, `reclamo-cobranza.mjs` |
| Estado general de empresa (semáforo) | `estado-empresa.mjs` |

Antes de agregar cualquier cálculo nuevo, la pregunta es **¿qué fuente ya lo tiene?** Si existe, se
consume. Sólo se construye lógica nueva cuando es genuinamente de DECISIÓN, no de dato.

## El modelo único de liquidez

`finanzas.modelo_liquidez` arma, ensamblando las fuentes de arriba, una sola representación de la
posición financiera:

- **disponible**: caja hoy, cobranzas por cobrar del mes, cobranzas vencidas, vencimientos 7 días,
  proyección 7 días;
- **comprometido**: obligaciones (saldo total, vencido, próximos 30 días, por tipo);
- **líneas**: descubierto (límite/usado/disponible, TNA/CFT), tarjeta (límite/disponible/cuotas), y el
  **costo marginal del dinero** (lo que cuesta el peso de descubierto por día);
- **colchón total**: caja + línea disponible − vencido.

Cada bloque **degrada a "sin dato"** si su fuente no responde — **nunca estima para rellenar** un
hueco. Un "sin dato" es un hueco real que se le dice al dueño, no un OK ([[piso-firme-briefing-caja]]).

## Los marcos de decisión (el cerebro)

### 1 · El costo del dinero — la vara única

La empresa opera **en/cerca del descubierto**: el peso marginal cuesta 62,78% CFT (acuerdo N°00007).
Por eso el **costo de oportunidad** de un peso inmovilizado y el **costo de financiar** con el
descubierto son el **mismo número**, y sale del modelo ya verificado contra el cargo real del banco.
Toda decisión se piensa contra esa vara: `costoDelDinero(monto, días)`.

### 2 · Ingeniería de financiamiento — comparar TODAS las alternativas

Ante una necesidad de fondos, `finanzas.comparar_financiamiento` compara y **elige la más barata
factible**: caja propia, descubierto, descuento de cheque, préstamo, esperar, pronto pago. Para cada
una: costo financiero + costo de oportunidad − ahorro capturado = **costo económico**. La recomendada
es la de menor costo económico entre las **factibles**.

- **Un costo económico negativo es una ganancia neta** (ej. capturar 5% de pronto pago batiendo el
  ~3,4% de financiar 20 días → conviene pagar ya, incluso con descubierto).
- **Las tasas que el OS todavía no tiene modeladas** (descuento de cheque, préstamo puntual) entran
  por parámetro. **Sin ellas, la alternativa se marca "falta la tasa" y se excluye — NUNCA se inventa
  un número** para que el cuadro cierre ([[costo-descubierto-verificado]]).

### 3 · Ingeniería de pagos — priorizar con criterio, no por fecha

`finanzas.priorizar_pagos` ordena considerando a la vez: **vencimiento**, **costo de no pagar** (mora
que corre + descuento por pronto pago que se pierde), **criticidad** (proveedor crítico / obra en
riesgo / relación comercial), y **liquidez** (reparte la caja por prioridad; lo que no entra pasa a
"esperar"). Cada pago vuelve con su decisión —pagar / parcial / esperar— y el motivo económico. **No
se paga a ciegas por fecha de vencimiento.**

### 4 · Recomendaciones — el contrato

`recomendaciones(modelo)` emite acciones concretas. Cada una lleva: **prioridad**, **impacto (pesos)**,
**ahorro**, **riesgo**, **explicación económica** y **fundamentos**. Sólo emite lo que el dato
sostiene; si falta la fuente de caja, la primera recomendación es reconectarla (no se optimiza a
ciegas).

## Preguntas que el motor debe poder responder

Qué conviene pagar hoy · qué conviene esperar · qué proveedor priorizar · cuál pone en riesgo una obra
o la relación comercial · qué medio de pago conviene (transferencia / eCheq / cheque físico / tarjeta
/ descubierto / préstamo / descuento de cheque) · conviene negociar / pagar parcial / refinanciar ·
conviene entrar al descubierto, por cuántos días y cuánto costará · cómo se cubrirá un bache · qué
cobranza adelantar o reclamar. **Siempre con la explicación económica, nunca sí/no.**

## Política de riesgo (no negociable)

- El motor **decide y recomienda**; **ejecutar externamente** (pagar, firmar un cheque, tomar un
  préstamo, refinanciar) es **Nivel E** y requiere **aprobación humana explícita**. El motor prepara
  la decisión; no la ejecuta solo.
- Todo número de plata respeta la clasificación de evidencia: **real conciliado > real > inferido >
  supuesto > desconocido**. Un modelo de costo verificado es un hecho; una tasa no cargada es un gap
  declarado, no un número inventado.
- **P&L = devengado, Cash Flow = percibido.** Este motor es de **tesorería (percibido)**: optimiza
  caja y costo financiero. El resultado económico devengado lo maneja `contabilidad-constructoras`.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El criterio profesional de tesorería/flujo de fondos | `finanzas-tesoreria-construccion` (dueña del criterio; este motor lo ejecuta) |
| Coherencia del número entre Caja / P&L / Obras | `arquitectura-integracion-finanzas-obras` |
| Impacto fiscal de una decisión (IVA del certificado, retenciones) | `impuestos-construccion` |
| Priorizar una cobranza por cliente/impacto | `cobranzas` + `reclamo-cobranza` (capacidades del OS) |
| Criticidad de un proveedor / relación comercial | `compras-abastecimiento-subcontratacion` |
| Si el pago pone en riesgo una obra | `direccion-obra`, `planificacion-produccion` |

`finanzas-tesoreria-construccion` es la dueña del **criterio** profesional; **Financial Engineering es
el motor que ejecuta ese criterio sobre los datos reales** y produce la decisión. No se pisan: una
piensa el marco, la otra lo opera y lo mide.

## Roadmap (arquitectura preparada, fases siguientes)

Construido (Increment 1, 23/07): el modelo único de liquidez, la ingeniería de financiamiento, la
ingeniería de pagos, las recomendaciones, el tool/contrato y los tests. Preparado para, sin
reimplementar nada:

- **Calendario financiero diario** (saldo inicial → ingresos/egresos/obligaciones/cheques/impuestos →
  saldo final por día) — se ensambla de las mismas fuentes; lo consumirá la Web.
- **Ingeniería de cobranzas** con probabilidad de cobro y retraso histórico por cliente.
- **Comparador de créditos** multi-línea (costo/plazo/liquidez/riesgo).
- **Simulador** de escenarios/sensibilidad — la arquitectura ya separa núcleo puro de datos, que es
  lo que un simulador necesita. No implementado todavía.
- **Superficie API/Web**: el tool YA es el contrato; una interfaz sólo lo consume.

## Criterios de aceptación (estado)

Integrado al Business OS ✓ · reutiliza la arquitectura y las fuentes únicas existentes ✓ · reutiliza
el CFO IA (persona `advise.finance`) ✓ · no duplica lógica ni datos ✓ · expone un modelo financiero
reutilizable (tool) ✓ · responde decisiones reales de tesorería con justificación económica ✓ ·
validado contra datos reales ✓. Pendiente de fases: calendario diario, cobranzas con probabilidad,
comparador de créditos, simulador.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA → VALIDACIÓN SEGÚN
RIESGO → INCORPORACIÓN → MEDICIÓN`. Cuando una decisión de financiamiento se ejecuta, se compara el
costo real contra el estimado por el motor; si difiere sistemáticamente, se ajusta el modelo de costo
(previa verificación). Toda tasa nueva (descuento de cheque, préstamo) se incorpora con su fuente y
fecha de vigencia — nunca de memoria.
