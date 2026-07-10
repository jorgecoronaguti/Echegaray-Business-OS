---
name: propuestas-impacto-negocio-no-higiene
description: Jorge rechazó de plano las propuestas de mejora de la pestaña Compras basadas en higiene de datos (columnas muertas, duplicados, normalizar dropdowns) — "no me parecen útiles". Toda propuesta debe partir de qué decisión económica cambia; la limpieza de datos solo se propone como medio para una decisión concreta, nunca como fin.
metadata:
  type: feedback
---

Fecha: 2026-07-09. Tras estudiar Compras columna por columna propuse: eliminar columnas muertas, resolver 17 duplicados, normalizar tipo de comprobante, columna de percepciones. Jorge: **"no me parecen útiles las propuestas"**.

**Por qué**: eran hallazgos de auditoría técnica presentados como propuestas de negocio. El CLAUDE.md raíz ya lo decía ("¿Qué decisión cambia si este número cambia?" / "Siempre conectar las iniciativas con impacto económico") y no lo apliqué al proponer. Una columna muerta no le cuesta plata; saber a qué proveedor le está pagando de más, cuánta caja financia con cuenta corriente, o dónde se concentra el gasto, sí.

**Cómo aplicar**: antes de proponer cualquier mejora sobre una fuente de datos, pasarla por el filtro: *¿qué decisión concreta de plata/riesgo/tiempo habilita?* Si la respuesta es "datos más prolijos", no es una propuesta — a lo sumo es un paso previo que se ejecuta en silencio bajo la autorización permanente de corrección, o se menciona en una línea. Las propuestas que sí valen sobre una pestaña como Compras: concentración de proveedores (riesgo/negociación), gasto por unidad-obra-mes (dónde se va la plata), condiciones de pago (capital de trabajo), precios comparados del mismo insumo, % efectivo (control/fiscal). Ver [[resumen-manual-vs-dashboard-pivots]] — mismo patrón: lo técnico correcto no es lo operativamente útil.
