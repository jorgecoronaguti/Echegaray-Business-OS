# Construir capacidades de negocio, no pantallas o tablas aisladas

El usuario estableció esto explícitamente al aprobar Capacidad 1 (Caja Operativa) y pedir Capacidad 2 (Obra como Unidad Económica).

**Regla**: cada incremento del Business OS debe resolver una decisión real de la empresa y convertirse en una base reutilizable para capacidades futuras — no una tabla o pantalla suelta. Antes de escribir código: revisar Blueprint TO-BE + PRP correspondiente, activar solo los skills necesarios, consultar Drive solo ante una duda puntual de regla de negocio (nunca un discovery general nuevo).

**Por qué**: el objetivo es que la Obra sea el centro del sistema y que todo (Presupuesto, Costos, Compras, HH, Adicionales, Facturación, Control Económico, Dashboard, Post Mortem) se pueda anclar a ella sin rehacer el modelo — construir features aisladas rompería eso.

**Cómo aplicar**: antes de modelar una entidad nueva, justificar explícitamente (por qué existe, qué decisión permite tomar, qué capacidad futura depende de ella, si puede reutilizar algo que ya existe). Si una entidad puede evitarse extendiendo algo existente, evitarla — confirmado en la práctica: Capacidad 2 se resolvió extendiendo `obras` en vez de crear `contratos`. Priorizar simplicidad/trazabilidad/consistencia/extensibilidad por sobre velocidad. No construir dashboards, KPIs, ni cálculos de resultado hasta que la capacidad correspondiente lo pida explícitamente.
