---
name: contabilidad-constructoras
description: "Criterio contable específico de empresas constructoras: reconocimiento de ingresos por obra, tratamiento de certificados, costos diferidos y P&L consolidado. Activar ante preguntas sobre cómo se debe registrar contablemente un certificado, un adicional, o el cierre de una obra, y para interpretar el P&L consolidado real de Echegaray (Ingresos y Egresos - P&L). No reemplaza al estudio contable externo — señala criterio y cuándo consultarlo."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Contabilidad para Empresas Constructoras

## Propósito

Aportar el criterio contable específico del sector construcción (reconocimiento de ingresos por obra en curso, tratamiento de certificados y costos diferidos), y servir de puente para interpretar correctamente el P&L consolidado real de Echegaray.

## Alcance

Cubre: criterio de reconocimiento de ingresos (por avance de obra vs. por entrega), tratamiento contable de certificados/adicionales, costos directos e indirectos en el estado de resultados, lectura del P&L consolidado (`Ingresos y Egresos - P&L`, confirmado real, líneas Civil/Mantenimiento/Estructura).

No cubre: el aspecto fiscal específico (`impuestos-construccion`), ni la gestión de caja/tesorería (`finanzas-tesoreria-construccion`) — esta skill es sobre el **devengado**, no sobre el percibido.

## Preguntas profesionales que debe hacer

- ¿El ingreso de esta obra se está reconociendo por avance certificado o por facturación — y coincide con el criterio contable correcto?
- ¿El costo asociado a un certificado ya está devengado en el mismo período, o hay un desfase?
- ¿Los gastos de Estructura (Administración/Taller, confirmados en `Ingresos y Egresos - P&L`) están bien distribuidos entre el resultado de Civil y Mantenimiento, o se están mezclando?
- ¿Un adicional aprobado pero no facturado ya debería devengarse como ingreso?
- ¿El resultado neto que muestra el P&L es coherente con el margen esperado por obra que muestra el control económico del OS?

## Marcos de análisis

- **P&L = devengado, siempre** (regla de oro #4 del CLAUDE.md raíz) — nunca reconocer un ingreso o costo por cuándo se cobra/paga, sino por cuándo se genera el derecho/obligación económica.
- **Nunca mezclar Civil, Mantenimiento y Estructura** al analizar rentabilidad — son líneas de negocio distintas, confirmadas con datos reales, y mezclarlas oculta cuál de las dos genera el resultado real.
- **Costo comprometido ≠ costo devengado ≠ costo pagado**: ya modelado en el OS (`costos_reales`, PRP-004) — esta skill debe reforzar esa distinción al leer cualquier resultado contable.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Momento de reconocimiento | ¿Corresponde a este período o a otro? |
| Línea de negocio | ¿Es Civil, Mantenimiento o Estructura? |
| Consistencia | ¿Coincide el resultado contable con el control económico por obra del OS? |
| Materialidad | ¿La diferencia justifica ajustar el criterio o es ruido normal? |

## Errores frecuentes

- Comparar el P&L consolidado (todas las obras, devengado, mensual) contra el control económico de una sola obra (acumulado, desde el inicio) sin ajustar la ventana temporal — violación directa de la regla de oro #3 (nunca mezclar ventanas de tiempo incompatibles).
- Reconocer un certificado como ingreso pero no reconocer su costo asociado en el mismo período.
- Tratar los gastos de Estructura como si fueran gasto de una obra puntual.

## Información necesaria

- `Ingresos y Egresos - P&L` (Sheet real confirmado, P&L mensual completo Civil/Mantenimiento/Estructura, con EBITDA/EBT/Resultado neto).
- `obra_resumen_economico` y `obra_ejecucion_financiera` del OS (margen y certificación por obra).
- Criterio contable formal que aplique el estudio externo de Echegaray (no confirmado en discovery — gap).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El tratamiento tiene impacto fiscal | `impuestos-construccion` |
| Se necesita entender el impacto en caja (no solo devengado) | `finanzas-tesoreria-construccion` |
| El costo viene de una compra o subcontrato | `compras-abastecimiento-subcontratacion` |
| Es el cierre contable de una obra | Post Mortem (capacidad del OS, no skill) |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de contabilidad de constructoras (método de avance de obra).
2. **Normativa y regulación cambiante**: normas contables profesionales (resoluciones técnicas del CPCE) — verificar vigencia antes de citar una específica.
3. **Documentación interna de Echegaray**: `Ingresos y Egresos - P&L`, Balances (confirmados en Drive, carpeta legal/societaria).
4. **Datos estructurados del OS**: `obra_resumen_economico`, `obra_ejecucion_financiera`.
5. **Experiencia histórica de obras**: Post Mortem.
6. **Interpretación profesional**: lectura del caso concreto — no sustituye al contador real de Echegaray.
7. **Recomendación**: acción sugerida, incluyendo cuándo confirmar con el estudio contable externo.

## Política de fuentes externas y protocolo de vigencia

Para citar una resolución técnica contable específica o un criterio normativo del CPCE, verificar vigencia con WebSearch antes de presentarlo como aplicable. Registrar fuente, organismo emisor, fecha de vigencia y fecha de consulta.

## Jurisdicción aplicable

Normas contables profesionales: nacionales (FACPCE) con adhesión del CPCE de San Juan. Fiscal: ver `impuestos-construccion` para el desglose por jurisdicción.

## Límites de certeza

Esta skill no reemplaza al contador/estudio externo de Echegaray — no puede certificar un balance ni asumir un criterio contable definitivo sin confirmación profesional real ante una decisión de materialidad relevante.

## Gaps de conocimiento conocidos (primera versión)

No se confirmó el criterio contable formal exacto que usa el estudio de Echegaray para reconocer ingresos por obra (por avance vs. por certificación) — se debe preguntar directamente al contador antes de asumir uno u otro en un análisis de materialidad relevante.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: el resultado neto mensual del P&L no coincide con la suma de márgenes por obra del control económico (evento/desvío) → se investiga la causa (ej. gastos de Estructura no distribuidos, o desfase de reconocimiento) → si se repite mes a mes (recurrencia), se propone un ajuste de criterio de conciliación entre ambos sistemas → el usuario/contador valida (nivel 3, alto riesgo — requiere confirmación profesional) → se incorpora como regla de conciliación → se mide en el próximo cierre mensual.

## Relación con el OS

- **Áreas**: Administración y Finanzas (dominio Fiscal/Contable).
- **Capacidades existentes**: Control Económico (PRP-005), Ejecución Financiera (PRP-007) — ambos devengado por obra; el P&L consolidado de empresa es el bloque F4 pendiente de la revisión estratégica.
- **Centro de Acción**: no genera alertas propias hoy.
- **Dashboard**: no aporta alertas propias hoy — es insumo de interpretación, no de detección automática.
- **Post Mortem**: consumidora del resumen económico final de cada obra.
- **Memoria del proyecto**: el criterio contable confirmado con el estudio externo debería documentarse ahí una vez validado.
- **Futuros agentes/automatización**: ninguna conciliación contable se automatiza sin aprobación — siempre clase E dado el riesgo regulatorio/fiscal asociado.

## Prohibido

No inventar una resolución técnica contable ni un criterio de reconocimiento de ingresos sin verificación real con el estudio contable de Echegaray.
