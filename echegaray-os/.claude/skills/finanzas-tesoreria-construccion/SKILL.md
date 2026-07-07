---
name: finanzas-tesoreria-construccion
description: "Criterio de finanzas y tesorería específico de empresas constructoras: capital de trabajo, posición de caja, financiamiento de obra, cheques/echeqs. Activar ante preguntas sobre cómo financiar el capital de trabajo de una obra, gestionar la posición de caja, o decidir entre instrumentos de pago/financiamiento. Trabaja en percibido (caja), nunca mezclar con contabilidad-constructoras (devengado)."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Finanzas y Tesorería de Empresas Constructoras

## Propósito

Aportar el criterio de gestión financiera de caja y capital de trabajo — la pregunta que el CLAUDE.md raíz plantea como central: "¿cuándo entra y sale efectivamente el dinero?", y cómo financiar la brecha entre ejecutar una obra y cobrarla.

## Alcance

Cubre: capital de trabajo, posición de caja actual y proyectada, financiamiento de obra (adelantos, SGR, ANR, préstamos), gestión de cheques/echeqs, condiciones de cobro/pago.

No cubre: el reconocimiento contable devengado (`contabilidad-constructoras`), ni la carga impositiva de una operación financiera (`impuestos-construccion`).

## Preguntas profesionales que debe hacer

- ¿Cuánto capital de trabajo necesita esta obra antes de recibir el primer cobro?
- ¿La condición de cobro pactada (anticipo, certificación mensual, contra entrega) alcanza para financiar la ejecución sin recurrir a deuda?
- ¿Un cheque o echeq ya emitido está realmente debitado, o solo comprometido a futuro? (distinción ya establecida en PRP-010 del OS)
- ¿Existe tensión de liquidez proyectada en las próximas semanas, cruzando obligaciones a pagar contra cobros esperados?
- ¿El financiamiento disponible (SGR, ANR, préstamo) tiene costo financiero menor que el retorno de aceptar la obra?

## Marcos de análisis

- **Cash Flow = percibido, siempre** (regla de oro #5 del CLAUDE.md raíz) — nunca confundir con el resultado devengado que ve `contabilidad-constructoras`.
- **Una empresa puede ganar dinero y quedarse sin caja** (CLAUDE.md raíz, sección Cash Flow y P&L) — el análisis de esta skill nunca se apoya solo en el margen esperado, siempre cruza contra la posición de caja real.
- **Capital de trabajo = Cuentas por Cobrar + Caja − Cuentas por Pagar** — métrica pendiente de construir en el OS (Bloque F2 de la revisión estratégica), calculable hoy con los datos ya existentes.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Necesidad de capital de trabajo | ¿Cuánto y por cuánto tiempo? |
| Costo de financiamiento | ¿Qué instrumento es más barato para esta necesidad? |
| Tensión de liquidez | ¿Hay semanas con posición proyectada negativa? |
| Instrumento de pago | ¿Cheque, echeq, transferencia — y cuándo impacta realmente en caja? |

## Errores frecuentes

- Aceptar una obra grande sin evaluar si el capital de trabajo que requiere pone en riesgo la caja de las obras en curso.
- Confundir un cheque emitido con dinero ya debitado (distinción explícita ya resuelta en PRP-010 del OS — obligaciones y medios de pago).
- Proyectar caja sumando cobros "esperados" sin distinguir probabilidad real de cobro por cliente.

## Información necesaria

- `movimientos_caja` reales y proyectados (PRP-001).
- `obligaciones` con fecha de vencimiento y saldo pendiente (PRP-010).
- Posición de caja consolidada (Bloque F1 de la revisión estratégica, aún no construido — hoy hay que calcularla manualmente cruzando ambas fuentes).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El resultado devengado no coincide con la caja | `contabilidad-constructoras` |
| Hay impacto impositivo en el instrumento financiero | `impuestos-construccion` |
| Se está evaluando si aceptar una obra por su necesidad de capital | `costos-presupuestacion`, `gestion-empresarial-riesgos` |
| El financiamiento afecta la decisión de comprar vs. alquilar un equipo | `compras-abastecimiento-subcontratacion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de gestión de capital de trabajo y tesorería.
2. **Normativa y regulación cambiante**: tasas de referencia (BCRA), condiciones de SGR/ANR — verificar vigencia antes de citar una tasa específica.
3. **Documentación interna de Echegaray**: `Flujo de Caja - Cash Flow` (Sheet real confirmado, fuente de verdad de caja).
4. **Datos estructurados del OS**: `movimientos_caja`, `obligaciones`, `obligacion_resumen`.
5. **Experiencia histórica de obras**: Post Mortem, si documenta problemas de financiamiento.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Para citar una tasa de interés, condición de SGR/ANR o instrumento financiero específico, verificar con WebSearch la fuente (BCRA, entidad financiera, SGR) y registrar fecha de publicación y de consulta. No asumir que una tasa de hace meses sigue vigente en un contexto de alta variabilidad como el argentino.

## Jurisdicción aplicable

Nacional (BCRA, entidades financieras) — no suele haber variación provincial relevante en instrumentos financieros, salvo programas específicos de fomento provincial (verificar si San Juan tiene alguno vigente antes de descartarlo).

## Límites de certeza

No puede afirmar una tasa de interés o condición de financiamiento vigente sin verificación. No puede afirmar la posición de caja de la empresa sin cruzar `movimientos_caja` y `obligaciones` reales — no estimar sin dato.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy en el OS una vista de posición de caja consolidada ni de capital de trabajo (Bloques F1/F2 de la revisión estratégica, priorizados por el usuario pero aún no construidos) — mientras tanto, esta skill debe calcularlos manualmente cruzando `movimientos_caja` y `obligaciones` cuando se necesite, dejando explícito que es un cálculo ad-hoc, no una vista persistida.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra genera tensión de liquidez recurrente por su condición de cobro pactada (evento/desvío) → se documenta la causa (ej. certificación mensual pero pago a 60 días) → si se repite con el mismo tipo de cliente (recurrencia), se propone exigir mejores condiciones de anticipo en la próxima cotización con ese perfil de cliente → el usuario valida (nivel 2) → se incorpora como criterio de `costos-presupuestacion` también → se mide en la próxima obra comparable.

## Relación con el OS

- **Áreas**: Administración y Finanzas (dominio Tesorería y Planeamiento Financiero).
- **Capacidades existentes**: Caja Operativa (PRP-001), Obligaciones y Medios de Pago (PRP-010).
- **Centro de Acción**: consumidora de alertas de vencimiento próximo, tensión de liquidez (ya calculadas en PRP-010/Dashboard).
- **Dashboard**: consumidora directa de la sección Caja y Obligaciones.
- **Post Mortem**: consumidora si documenta problemas de financiamiento por obra.
- **Memoria del proyecto**: patrones de tensión de liquidez validados deberían documentarse ahí.
- **Futuros agentes/automatización**: un forecast de caja (clase B, analítica) es candidato directo del Bloque F1 — ninguna decisión de financiamiento se automatiza, siempre clase E.

## Prohibido

No inventar tasas de interés, condiciones de SGR/ANR, ni afirmar una posición de caja sin cruzar datos reales del OS.
