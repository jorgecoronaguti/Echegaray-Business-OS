---
name: compras-abastecimiento-subcontratacion
description: "Criterio profesional de compras, abastecimiento y subcontratación: cómo evaluar un proveedor o subcontratista, qué cláusulas exigir, qué riesgos técnicos y legales considerar. Activar ante preguntas sobre elegir un proveedor, decidir subcontratar una tarea, o evaluar riesgo de un proveedor recurrente. No rehace la lógica operativa ya construida en features/compras (PRP-009) — aporta criterio de decisión, no el proceso transaccional."
allowed-tools: Read, Bash
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Compras, Abastecimiento y Subcontratación

## Propósito

Aportar el criterio profesional para decidir qué comprar, a quién, y cuándo conviene subcontratar una tarea en vez de ejecutarla con recursos propios — distinto del proceso operativo de registrar la compra, que ya existe en el OS.

## Alcance

Cubre: criterio de evaluación de proveedores (confiabilidad, plazos, calidad), decisión de subcontratar vs. ejecutar con recursos propios, riesgos de un subcontratista (técnico, legal, de seguridad).

No cubre: el registro operativo de la compra (ya construido, PRP-009), el registro laboral del subcontratista (`derecho-laboral-construccion`), ni el riesgo de seguridad que introduce (`seguridad-higiene-art`).

## Preguntas profesionales que debe hacer

- ¿Este proveedor/subcontratista tiene historial confiable con Echegaray, o es la primera vez?
- ¿Conviene subcontratar esta tarea (por especialización, capacidad o plazo) o ejecutarla con recursos propios?
- ¿El subcontratista cumple los requisitos de registro laboral y seguridad que Echegaray necesita para no asumir un riesgo de solidaridad?
- ¿La compra es urgente por mala planificación propia, o es genuinamente imprevisible? (distinción ya relevante en las alertas de Compras del OS, PRP-009)
- ¿El proveedor tiene retrasos recurrentes que deberían pesar en la decisión de seguir comprándole?

## Marcos de análisis

- **Comprar vs. tercerizar vs. alquilar**, no asumir automáticamente ejecución propia — mismo criterio del marco de decisión de inversiones del CLAUDE.md raíz aplicado a la decisión de subcontratar.
- **El historial real del proveedor pesa más que la relación personal** — el OS ya calcula alertas de "proveedor con retrasos recurrentes" (PRP-009) dentro de una obra; esta skill debe usar ese dato, no una impresión subjetiva.
- **Un subcontratista mal elegido traslada riesgo legal y de seguridad a Echegaray** — cruzar siempre con `derecho-laboral-construccion` y `seguridad-higiene-art` antes de decidir.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Historial | ¿Cumplió plazos y calidad en compras/obras anteriores? |
| Especialización | ¿Echegaray tiene la capacidad real de hacerlo internamente? |
| Riesgo de solidaridad | ¿Está registrado y cumple seguridad? |
| Urgencia | ¿Es evitable con mejor planificación? |

## Errores frecuentes

- Elegir un proveedor solo por precio sin considerar su historial de retrasos (ya detectable con datos reales del OS).
- Subcontratar sin verificar registro laboral, exponiendo a Echegaray a responsabilidad solidaria.
- Generar compras urgentes recurrentes por falta de planificación y tratarlas como imprevisibles (alerta ya calculada en PRP-009: `concentracion_urgentes`).

## Información necesaria

- `compra_resumen` y alertas de proveedor con retrasos recurrentes (PRP-009, ya calculado dentro de una obra — el análisis cruzado entre obras es un gap confirmado, pendiente en la revisión estratégica, Bloque 6).
- Estado de registro laboral/seguridad del subcontratista (no estructurado en el OS hoy).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El subcontratista aporta mano de obra | `derecho-laboral-construccion` |
| Introduce riesgo de seguridad | `seguridad-higiene-art` |
| Afecta el cronograma | `planificacion-produccion` |
| Impacto en costo/margen | `costos-presupuestacion` |
| Hay que redactar condiciones contractuales | `derecho-construccion-contratos` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: criterios generales de evaluación de proveedores y decisión make-or-buy.
2. **Normativa y regulación cambiante**: no aplica directamente (ver `derecho-laboral-construccion` para el registro de subcontratistas).
3. **Documentación interna de Echegaray**: historial de proveedores en Drive/OS.
4. **Datos estructurados del OS**: `compras`, `compra_resumen`, alertas de PRP-009.
5. **Experiencia histórica de obras**: Post Mortem, si documenta problemas con proveedores/subcontratistas.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Esta skill depende poco de fuentes externas cambiantes — su criterio es de gestión, no normativo. Si se necesita verificar la situación legal/de seguridad de un proveedor específico (ej. su registro), remitir a `derecho-laboral-construccion` o `seguridad-higiene-art` para el protocolo de vigencia correspondiente.

## Jurisdicción aplicable

No aplica jurisdicción normativa directa a esta skill.

## Límites de certeza

No puede afirmar la confiabilidad de un proveedor sin datos reales de compras anteriores en el OS — no inventar una reputación sin evidencia.

## Gaps de conocimiento conocidos (primera versión)

El análisis de confiabilidad de proveedor hoy solo existe **dentro de una obra** (PRP-009 lo descartó explícitamente como cross-obra, "pertenece al futuro Dashboard consolidado") — y aunque Fase II construyó una vista cross-obra de compras, **no se agregó el análisis de confiabilidad entre obras** (gap confirmado y repetido en la revisión estratégica, Bloque 6, pendiente).

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: un proveedor genera retraso en una obra (evento) → si se repite en otra obra con el mismo proveedor (recurrencia, ya parcialmente detectable con `calcularAlertasObraCompras`), se propone marcarlo como proveedor de riesgo → el usuario valida (nivel 1, dato empírico) → se incorpora como criterio de esta skill → se mide en la próxima compra a ese proveedor.

## Relación con el OS

- **Áreas**: Compras y Abastecimiento (dominio Proveedores).
- **Capacidades existentes**: Compras y Abastecimiento de Obra (PRP-009).
- **Centro de Acción**: consumidora de alertas de compras (`entrega_retrasada`, `pagada_no_recibida`, etc.).
- **Dashboard**: consumidora directa de la sección Compras.
- **Post Mortem**: fuente de aprendizaje sobre proveedores problemáticos.
- **Memoria del proyecto**: proveedores marcados como riesgo validado deberían documentarse ahí.
- **Futuros agentes/automatización**: un scoring automático de proveedor (clase B) es candidato futuro, siempre con la decisión final de contratar en manos humanas (clase E).

## Prohibido

No inventar historial o reputación de un proveedor/subcontratista sin datos reales del OS o de Drive.
