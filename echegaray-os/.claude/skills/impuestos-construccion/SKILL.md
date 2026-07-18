---
name: impuestos-construccion
description: "Criterio impositivo nacional, provincial (San Juan) y municipal aplicado a una empresa constructora. Activar ante preguntas sobre IVA en construcción, Ingresos Brutos, Ganancias, retenciones, o cualquier decisión con impacto fiscal (cotizar, facturar, cerrar una obra). Nunca cita una alícuota o norma vigente sin verificarla primero — es el dominio de mayor riesgo de desactualización de todo el sistema."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Impuestos Nacionales, Provinciales y Municipales

## Propósito

Aportar el criterio fiscal aplicado a las decisiones de Echegaray — qué impuestos afectan una obra, cómo cambia el costo/margen real después de impuestos, y cuándo se necesita confirmar una alícuota vigente antes de decidir.

## Alcance

Cubre: estructura general de impuestos que afectan a una constructora (IVA, Ingresos Brutos, Ganancias, impuesto a los Débitos y Créditos Bancarios, tasas municipales), identificación de jurisdicción aplicable por tipo de operación.

No cubre: el tratamiento contable de reconocimiento (`contabilidad-constructoras`), ni las cargas sociales/laborales específicas (`derecho-laboral-construccion`, aunque ambas conectan en el costo total de un trabajador).

## Preguntas profesionales que debe hacer

- ¿Esta operación tributa IVA, y a qué alícuota (verificar, no asumir)?
- ¿Ingresos Brutos aplica en San Juan, en la jurisdicción del cliente, o en ambas (Convenio Multilateral) si Echegaray opera fuera de San Juan?
- ¿Corresponde alguna retención (Ganancias, IIBB) sobre este pago a proveedor o cobro de cliente?
- ¿Hay un impuesto municipal específico (tasa de seguridad e higiene, habilitación) aplicable a esta obra según su ubicación concreta?
- ¿La última vez que se verificó esta alícuota/norma fue reciente, o hace falta re-verificar antes de usarla en una decisión real?

## Marcos de análisis

- **Toda cifra impositiva es una NORMA OBLIGATORIA hasta que se verifique que cambió** — nunca se presenta desde memoria del modelo como vigente sin verificación en la sesión.
- **Jurisdicción primero, alícuota después**: antes de citar cualquier número, identificar si la operación es nacional, de San Juan, de otra provincia (si el cliente opera fuera de San Juan) o municipal.
- **El impuesto es un costo real de la operación**, no un tema aparte — debe entrar en el margen que calcula `costos-presupuestacion`, no analizarse de forma aislada.

## Cableado al OS real (verificado 2026-07-18) — qué leer

**Corrección: el OS SÍ modela dato fiscal hoy** (la primera versión decía "ninguno"). Existe:
- `public.comprobantes_arca` (459 comprobantes fiscales reales, sincronizados de ARCA — timer `echegaray-arca-sync`). Es la fuente real de IVA crédito/débito y de qué se facturó/compró con respaldo fiscal.
- `orquestador/lib/libro-iva.mjs` → arma el **Libro IVA** por período desde `comprobantes_arca` (verificado: junio 2026 ≈ $2,64M a pagar). Capacidad determinística, 0 API — llamarla, no recalcular el IVA a mano.
- `costos_obra` distingue `iva` y `total` por comprobante; el eje `obra_canonica` permite ver carga fiscal por obra.

**Lo que sigue siendo cierto (no cambió):** ninguna **alícuota o norma** se cita sin verificar en la sesión (AFIP/ARCA nacional, DGR San Juan provincial, municipio por obra). El dato del OS te dice *qué comprobantes hay y cuánto IVA*; NO te dice *qué alícuota aplica hoy* — eso siempre se verifica. El dato real y la norma vigente son dos cosas distintas: el primero está en el núcleo, la segunda se verifica cada vez.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Jurisdicción | ¿Nacional, San Juan, otra provincia, o municipal? |
| Vigencia | ¿Se verificó la alícuota/norma en esta sesión? |
| Exención/reducción | ¿Aplica algún régimen especial de la construcción? |
| Impacto en margen | ¿Cuánto reduce el margen neto de la operación? |

## Errores frecuentes

- Presentar una alícuota de IIBB o IVA como vigente sin haberla verificado en la sesión actual — el error más grave posible en este dominio.
- Asumir que San Juan es la única jurisdicción de Ingresos Brutos cuando Echegaray trabaja con clientes o en obras fuera de la provincia (requeriría Convenio Multilateral).
- Confundir impuesto nacional con provincial al explicarle al usuario el origen de una carga.

## Información necesaria

- Ubicación exacta de la obra (municipio, para tasas locales).
- Si el cliente o la operación involucra a otra jurisdicción además de San Juan.
- Fecha de la última verificación de cada alícuota citada (registrar siempre).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El tratamiento contable del impuesto | `contabilidad-constructoras` |
| Impacto en costo de mano de obra | `derecho-laboral-construccion` |
| Impacto en el margen de la cotización | `costos-presupuestacion` |
| Impacto en caja (cuándo se paga, no cuánto) | `finanzas-tesoreria-construccion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: estructura general del sistema tributario argentino (qué impuestos existen y su naturaleza, no sus valores).
2. **Normativa y regulación cambiante**: alícuotas, exenciones, regímenes de retención — **cambian con frecuencia, nunca se citan sin verificación**.
3. **Documentación interna de Echegaray**: FACTURAS A/B/C, constancia AFIP (confirmados en Drive), `Ingresos y Egresos - P&L` (línea de Impuesto a los Ingresos Brutos e Impuesto a los Débitos y Créditos, ya presente en el P&L real).
4. **Datos estructurados del OS**: `comprobantes_arca` (459, IVA crédito/débito real) + `libro-iva.mjs` (Libro IVA por período). El `total`/`iva` por comprobante y el eje `obra_canonica` permiten carga fiscal por obra. (Modelan el DATO fiscal real; NO las alícuotas vigentes — esas se verifican siempre.)
5. **Experiencia histórica de obras**: Post Mortem, si documenta situaciones fiscales relevantes.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida, incluyendo cuándo confirmar con el estudio contable/impositivo externo de Echegaray.

## Política de fuentes externas y protocolo de vigencia

**Obligatorio antes de citar cualquier alícuota o norma como vigente**: verificar con WebSearch/WebFetch la fuente oficial (AFIP para nacional, DGR San Juan para provincial, municipio correspondiente para tasas locales). Registrar siempre: fuente, autoridad emisora, jurisdicción, fecha de publicación de la norma, fecha de vigencia, fecha de consulta, alcance, estado de verificación. Si no se pudo verificar en la sesión, decir explícitamente "no verificado — no usar como vigente sin confirmar" y no dar un número.

## Jurisdicción aplicable

- **Nacional**: IVA, Ganancias, impuesto a los Débitos y Créditos Bancarios (AFIP).
- **Provincial (San Juan)**: Ingresos Brutos (DGR San Juan) — verificar régimen para la actividad de construcción específicamente, puede tener tratamiento diferencial.
- **Municipal**: tasas de seguridad e higiene/habilitación según el municipio donde se ejecuta la obra — verificar por obra, no asumir un único municipio.
- **Convenio Multilateral**: si Echegaray factura o ejecuta obra fuera de San Juan, IIBB se distribuye entre jurisdicciones — verificar si aplica.

## Límites de certeza

Esta skill **nunca** puede afirmar una alícuota específica como vigente sin verificación en la sesión actual. No puede asumir que un régimen de exención de años anteriores sigue vigente.

## Gaps de conocimiento conocidos (primera versión)

No hay ninguna alícuota o norma impositiva verificada y registrada todavía en esta skill — es intencional, para no fabricar precisión falsa en la primera versión. Cada vez que se necesite un número real, seguir el protocolo de verificación antes de usarlo, y considerar agregarlo acá con su registro completo de fuente/vigencia una vez confirmado.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

A diferencia de otros dominios, acá el "aprendizaje" no es sobre patrones de la empresa sino sobre **mantener vigente el registro de normas verificadas**: cada vez que se verifica una alícuota o norma (evento), se registra con su fecha de vigencia (evidencia) — cuando pase suficiente tiempo o cambie el contexto normativo (ej. un anuncio de reforma), se marca como "requiere re-verificación" (propuesta de aprendizaje) antes de volver a usarla. Nunca pasa de **D (conocimiento validado)** a uso sin volver a pasar por verificación si venció su fecha de vigencia registrada.

## Relación con el OS

- **Áreas**: Administración y Finanzas (dominio Fiscal/Contable).
- **Capacidades existentes**: ninguna modela impuestos explícitamente hoy — es un gap confirmado en la revisión estratégica (Bloque F4/F5).
- **Centro de Acción**: podría en el futuro generar una acción de "verificar vigencia de alícuota X antes del cierre del mes" — no construido hoy.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: consumidora si un Post Mortem documenta un problema fiscal específico de una obra.
- **Memoria del proyecto**: cada alícuota/norma verificada con éxito debería registrarse en memoria con su fecha de vigencia, no quedar solo en la conversación.
- **Futuros agentes/automatización**: ninguna decisión fiscal se automatiza — siempre clase E, máximo riesgo regulatorio del sistema completo.

## Prohibido

No inventar ninguna alícuota, tasa, régimen de retención o exención. No presentar un número fiscal de memoria del modelo como vigente sin verificación explícita en la sesión.
