---
name: autonomia-lectura-edicion-financiera
description: Jorge autorizó de forma permanente la lectura y edición (append-only) de archivos financieros de Drive vía la cuenta de servicio, sin pedir permiso cada vez, y pidió incorporar cuestiones impositivas al alcance.
metadata:
  type: feedback
---

Fecha: 2026-07-09. Mensaje textual: "autorizo lectura edicion, todo siempre. y quiero q se agregue cuestiones impositivas".

**Regla**: dentro del dominio financiero (Cash Flow, P&L, Control de Gastos, JORNALES, Facturas, Certificados, DDJJ Ganancias, estado de deuda, ADICIONALES, y cualquier archivo impositivo/fiscal que aparezca), la lectura y edición vía `scripts/google_workspace/` (o el conector nativo de Drive) queda autorizada de forma permanente. No hace falta confirmar antes de leer o de agregar (nunca sobrescribir) contenido en estos archivos.

**Por qué**: Jorge está cansado de la fricción de autorizar cada lectura puntual cuando ya dio luz verde a todo el ciclo de análisis financiero. Encaja con la autorización más amplia ya registrada en [[autonomia-deploy-y-skills]] (deploy, skills, autonomía), pero esta es específica del dominio financiero/impositivo y explícitamente "siempre", no una vez.

**Cómo aplicar**: 
- Sigue vigente la regla de diseño no negociable de nunca sobrescribir una celda/fila/texto existente (ver [[integracion-real-google-workspace]]) -- la autorización es de alcance (qué puedo tocar sin preguntar), no de método (cómo escribo).
- "Cuestiones impositivas" ahora es parte explícita del alcance de trabajo financiero: DDJJ Ganancias, estado de deuda, IIBB, impuesto al cheque, cargas sociales -- no son un tema aparte que requiera pedir permiso de nuevo.
- Decisiones de alto riesgo (mover dinero real, presentar una declaración jurada, decidir un pago) siguen fuera de esta autorización -- el `CLAUDE.md` raíz reserva eso a aprobación humana explícita; esto solo cubre lectura y edición de archivos/registros, no ejecución de movimientos reales.
