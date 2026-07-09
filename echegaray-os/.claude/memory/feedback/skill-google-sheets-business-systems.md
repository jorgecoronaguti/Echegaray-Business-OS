---
name: skill-google-sheets-business-systems
description: Jorge exigió crear una skill formal de arquitectura/best practices de Google Sheets después de varios incidentes reales (colisiones de escritura, fórmulas mal verificadas) durante la auditoría del archivo Cash Flow -- no aceptar más "fórmulas aisladas improvisadas".
metadata:
  type: feedback
---

Fecha: 2026-07-09. Durante una sesión de auditoría profunda de `Flujo de Caja - Cash Flow`, se acumularon varios incidentes reales: sobrescritura accidental de datos de Rodrigo (detectada y corregida vía historial de revisiones), una fórmula SUMIFS con criterio de texto+emoji que devolvía un total incorrecto sin marcar error, una tabla dinámica que colisionó dos veces con contenido escrito al lado sin verificar el rango completo primero, y una edición concurrente real de Rodrigo que borró parte de un panel agregado en la misma sesión.

Jorge reaccionó pidiendo explícitamente: parar de editar, crear la skill `google-sheets-business-systems` con investigación real (WebSearch, no solo conocimiento interno), definir un protocolo obligatorio (Entender → Auditar → Diseñar → Implementar → Verificar → Validar con números reales), y recién después volver a aplicar el trabajo.

**Por qué**: la velocidad de "implementa ya mismo" sin este protocolo generó errores reales y repetidos sobre un archivo que la empresa usa en vivo -- el costo de pausar a verificar es bajo comparado con el de romper silenciosamente un archivo productivo.

**Cómo aplicar**: antes de tocar cualquier Google Sheet real de Echegaray, invocar/aplicar [[google-sheets-business-systems]] -- no tratar ninguna edición de Sheet como un ajuste trivial, incluso si el pedido puntual de Jorge suena simple. Esto no contradice su pedido de velocidad ("implementa ya mismo") -- lo que pidió es que la velocidad venga con verificación real incorporada al proceso, no que se sacrifique la verificación por velocidad.
