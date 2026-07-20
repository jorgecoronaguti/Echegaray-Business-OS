---
name: ingenieria-civil-construccion
description: "Conocimiento técnico de ingeniería civil y métodos constructivos aplicado a las decisiones de Echegaray Construcciones (San Juan). Activar ante preguntas sobre viabilidad técnica de una solución constructiva, patologías, materiales, sistemas estructurales, o cómputos técnicos que sustentan una cotización o un adicional. No decide solo — aporta el criterio técnico que Costos, Planificación y Contratos necesitan para decidir."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Ingeniería Civil y Construcción

## Propósito

Aportar el criterio técnico-constructivo que sostiene cualquier decisión de Echegaray sobre qué se puede construir, cómo, con qué materiales y con qué riesgo técnico — antes de que Costos lo valorice o Contratos lo formalice.

## Alcance

Cubre: sistemas estructurales y constructivos habituales en obra civil e industrial (hormigón armado, mampostería, metálica, montaje industrial), patologías y su diagnóstico, criterios de elección de materiales, cómputos métricos técnicos, interpretación de planos y especificaciones técnicas de cliente (pliegos).

No cubre: la valorización económica de una solución (`costos-presupuestacion`), la programación en el tiempo (`planificacion-produccion`), ni el riesgo contractual de un cambio técnico (`derecho-construccion-contratos`) — esta skill responde "¿es técnicamente correcto y viable?", no "¿cuánto cuesta, cuándo se hace o qué dice el contrato?".

## Construir en San Juan: condiciones del sitio que cambian las decisiones técnicas

No es contexto de color: es lo que diferencia una obra bien resuelta acá de una copiada de otra región.

- **Peligrosidad sísmica elevada.** San Juan está entre las zonas de mayor riesgo sísmico de la Argentina, con historia de sismos destructivos. El diseño sismorresistente **no es un agregado, es la condición de partida** de toda estructura. *(La zonificación y el reglamento aplicable —familia CIRSOC 103 y lo que exija el código de edificación provincial/municipal— deben verificarse en su edición vigente antes de citarse: ver la política de vigencia de esta skill.)*
- **Qué implica en la ejecución, que es donde Echegaray incide**: en zona sísmica **la calidad de ejecución es tan determinante como el cálculo**. Los puntos donde una estructura correctamente calculada falla igual son casi siempre de obra:
  - **detallado y anclaje de armaduras**: longitudes de anclaje y empalme, ganchos, y sobre todo el **confinamiento en nudos y extremos de columnas** (separación de estribos donde el reglamento la exige más estricta). Ahí se juega la ductilidad, que es lo que evita el colapso.
  - **encadenados y confinamiento de la mampostería**: los muros sin confinar son un mecanismo de falla clásico en la región.
  - **juntas de dilatación / separación sísmica entre cuerpos**: si no se respetan, los cuerpos se golpean.
  - **anclaje de elementos NO estructurales**: cielorrasos, luminarias, tabiques, estanterías, equipos industriales. En sismo son causa mayor de daño y lesiones, y suelen quedar fuera del control.
  - **calidad y continuidad del hormigón**: nidos de abeja, juntas frías y recubrimientos insuficientes comprometen justo lo que el diseño sísmico necesita.
- **Suelos de la región**: en Cuyo son frecuentes los **suelos limosos/loéssicos con riesgo de colapso por humedecimiento** — un suelo que se comporta bien seco y se desmorona al mojarse. Implica: estudio de suelos real (no supuesto), cuidado extremo con **pérdidas de agua y drenaje** cerca de fundaciones, y desconfiar de extrapolar la fundación de una obra vecina. **Nunca definir fundación sin estudio de suelos del sitio.**
- **Clima**: amplitud térmica marcada, baja humedad y **viento Zonda** (cálido, seco e intenso). Efecto técnico directo sobre el **curado del hormigón y los morteros**: alta evaporación → fisuración por retracción plástica. Hormigonar con Zonda o en horas de máxima evaporación sin protección y curado adecuado es una causa real y evitable de patología. Es también restricción de programación y de seguridad (cruzar con `planificacion-produccion` y `seguridad-higiene-art`).
- **Sismo y responsabilidad**: en zona sísmica, un vicio que compromete la solidez tiene consecuencias de otra magnitud — y la **responsabilidad por ruina es decenal y de orden público** (ver `derecho-construccion-contratos`). Documentar ensayos, controles y no conformidades (`calidad-obra`) es protección patrimonial de la empresa, no burocracia.

## Preguntas profesionales que debe hacer

- ¿La solución propuesta cumple con la función estructural/funcional requerida, o solo resuelve el síntoma?
- ¿Qué norma técnica (CIRSOC, IRAM) o especificación de cliente rige esta partida?
- ¿Qué patología previa explica el problema actual, si la hay?
- ¿Qué tolerancias y ensayos exige el pliego del cliente (si es industrial, como ARCOR/Saint Gobain)?
- ¿La solución es reproducible con la mano de obra y equipos reales disponibles en Echegaray, o requiere un subcontratista especializado?
- ¿Qué riesgo técnico introduce (falla, retrabajo, garantía) si se ejecuta como se propone?

## Marcos de análisis

- **Función → Solución → Verificación**: no proponer una solución constructiva sin antes confirmar qué función estructural o de servicio debe cumplir, y cómo se va a verificar que la cumple (ensayo, inspección, cálculo).
- **Causa raíz antes que síntoma**: ante una patología, distinguir causa (ej. napa freática, mal diseño de junta) de síntoma (fisura, humedad) — nunca recomendar una reparación que no ataque la causa.
- **Especificación de cliente prevalece sobre criterio general**: cuando existe un pliego técnico del cliente (confirmado: ARCOR exige pliegos propios de condiciones técnicas y de seguridad/salud/medio ambiente), ese documento manda sobre cualquier norma general que Echegaray use por defecto.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Viabilidad técnica | ¿Es constructible con los medios reales de Echegaray? |
| Cumplimiento normativo | ¿Qué norma/pliego aplica y se cumple? |
| Riesgo de falla | ¿Qué pasa si la solución no funciona como se espera? |
| Reversibilidad | ¿Se puede corregir después sin demoler/rehacer? |
| Impacto en plazo/costo | Señalar el impacto para que Planificación y Costos lo valoricen — no valorizarlo acá |

## Errores frecuentes

- Recomendar una solución "que siempre funcionó" sin verificar que las condiciones de esta obra sean las mismas (suelo, cliente, normativa).
- Confundir cumplir con un pliego de cliente con cumplir con la norma técnica general — pueden no coincidir, y el pliego del cliente es más restrictivo casi siempre.
- Aceptar un cómputo técnico de una fuente sin cruzarlo contra `Planilla para Cotizar` (fuente de verdad de presupuestos ya confirmada en el AS-IS).

## Información necesaria

- Planos, memoria técnica o pliego del cliente para la partida en cuestión.
- Condiciones reales de sitio (si difieren de lo supuesto en la cotización original).
- Registro de patologías previas en esa obra o en obras comparables (Post Mortem).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| La solución técnica cambia el costo o el plazo | `costos-presupuestacion`, `planificacion-produccion` |
| El cambio técnico puede ser un adicional | `derecho-construccion-contratos` |
| La solución introduce un riesgo de seguridad | `seguridad-higiene-art` |
| Se requiere un ensayo o control de calidad | `calidad-obra` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de ingeniería estructural y constructiva de aplicación general (no cambian con el tiempo).
2. **Normativa y regulación cambiante**: CIRSOC (normas de acción de cargas, hormigón, sismorresistente), IRAM — las versiones vigentes deben verificarse, no asumirse desde memoria.
3. **Documentación interna de Echegaray**: pliegos de cliente confirmados en Drive (ej. Pliego de Condiciones Generales, Pliego SSMA de ARCOR).
4. **Datos estructurados del OS**: `costos_reales`, `adicionales` con causa técnica documentada.
5. **Experiencia histórica de obras**: Post Mortem, campo `causas_desvio`.
6. **Interpretación profesional**: lectura razonada de un caso concreto a partir de 1-5.
7. **Recomendación**: la acción sugerida, siempre distinguida de los puntos anteriores.

## Política de fuentes externas y protocolo de vigencia

Antes de citar una norma CIRSOC/IRAM específica (número de norma, año de edición, valores) como vigente, verificar con WebSearch/WebFetch la edición actual. Registrar: fuente, autoridad emisora (INTI/IRAM), jurisdicción (nacional), fecha de la edición citada, fecha de consulta, y si se confirmó o no la vigencia. Si no se pudo verificar, decir explícitamente "no verificado en esta sesión" y no presentar el número de norma como un hecho.

## Jurisdicción aplicable

Normativa técnica: nacional (CIRSOC, IRAM) salvo ordenanza municipal de San Juan que exija algo adicional (ej. código de edificación local) — verificar por obra si hay requisito municipal específico. Requisitos de cliente industrial (ARCOR, Saint Gobain): contractuales, por encima de la norma general cuando son más estrictos.

## Límites de certeza

Esta skill no puede afirmar el número y año exacto de una norma CIRSOC/IRAM vigente sin verificación externa en el momento de uso. No puede evaluar una patología sin datos reales de sitio (no inventar diagnóstico sin evidencia).

## Gaps de conocimiento conocidos (primera versión)

No hay todavía un repositorio interno de patologías/soluciones típicas de Echegaray por tipo de obra — hoy ese conocimiento vive disperso en la memoria de las personas. Protocolo para cerrarlo: cada vez que un Post Mortem documente una causa técnica de desvío, evaluar si corresponde incorporarla acá como patrón (ver mecanismo de aprendizaje).

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra reporta retrabajo por una junta de dilatación mal ejecutada (evento) → costo real desvía del presupuestado (resultado/desvío) → Post Mortem documenta la causa técnica (causa/evidencia) → si aparece en 2+ obras (recurrencia), se propone como patrón a incorporar en esta skill (propuesta de aprendizaje) → el usuario valida si es un patrón real o una casualidad (validación según riesgo — nivel 2, criterio profesional) → se incorpora como criterio de decisión nuevo (incorporación) → se aplica en la próxima cotización similar (aplicación futura) → se mide si el próximo caso comparable mejoró (medición).

Clasificación: un solo caso es **A. observación aislada** — nunca se convierte en regla. Con 2-3 casos comparables pasa a **B. recurrencia**; con un mecanismo técnico explicado, a **C. patrón probable**; solo tras validación explícita del usuario pasa a **D. conocimiento interno validado** o **E. regla operativa aprobada**.

## Relación con el OS

- **Áreas**: Obras y Producción (dominio Documentación técnica y Calidad).
- **Capacidades existentes**: Post Mortem (PRP-012, campo `causas_desvio`), Adicionales (PRP-006, cuando el origen es técnico).
- **Centro de Acción**: no genera acciones por sí sola — informa la causa técnica de una acción ya generada por otra capacidad (ej. una alerta de desvío de costo).
- **Dashboard**: no aporta alertas propias.
- **Post Mortem**: fuente principal de aprendizaje de esta skill.
- **Memoria del proyecto**: los patrones validados (nivel D/E) deberían documentarse ahí, no en el código.
- **Futuros agentes/automatización**: ninguna automatización de decisión técnica sin aprobación humana — siempre clase E (aprobación humana) en cualquier cambio de solución constructiva.

## Prohibido

No inventar número/año de norma CIRSOC o IRAM sin verificar. No inventar rendimientos técnicos, tolerancias ni especificaciones que no consten en el pliego real del cliente o en una fuente verificada.
