---
name: integracion-real-google-workspace
description: Primera integración real del OS con un sistema externo -- cuenta de servicio de Google con acceso de lectura/escritura acotada a Sheets/Docs/Drive que Echegaray comparte explícitamente, sin delegación de dominio.
metadata:
  type: project
---

Fecha: 2026-07-09. Construida a pedido de Jorge después de confirmar que el conector nativo de Drive de claude.ai (usado desde el inicio del proyecto) no tiene capacidad de escritura -- solo lee, copia o crea archivos nuevos.

## Qué se construyó

`scripts/google_workspace/` (Python): `client.py` (autenticación), `sheets.py` (leer rango, agregar fila, crear pestaña), `docs.py` (leer documento, agregar texto al final), `drive.py` (diagnóstico de qué archivos están compartidos). La clave de la cuenta de servicio vive en `scripts/google_workspace/credentials/service-account.json`, gitignored, nunca versionada.

**Regla de diseño no negociable**: los scripts nunca sobrescriben una celda, fila o texto existente -- solo agregan. Motivo real, no teórico: ya sabemos que Control de Gastos y JORNALES tienen fórmulas rotas (`#REF!`); escribir sobre un rango existente sin ver la fórmula real podría romper algo que todavía funciona parcialmente.

## Alcance de acceso real (no delegación de dominio)

Jorge compartió la carpeta completa "administracion" de Drive con el email de la cuenta de servicio (`echegaray-os-workspace@echegaray-business-os.iam.gserviceaccount.com`). Esto dio acceso real a ~45 archivos, mucho más que los 5 pedidos originalmente:

- Los 5 ya diagnosticados: Ingresos y Egresos - P&L, Flujo de Caja - Cash Flow, CONTROL DE GASTOS.xlsx, JORNALES, Avances de Obra.
- Vision/Tracción, Daily Meeting.
- **Hallazgos nuevos no vistos hasta ahora**: `ADICIONALES.xlsm` (un tracker real de adicionales -- conecta directo con [[gestion-empresarial-riesgos]] y el dominio Adicionales del OS, nunca antes localizado), `PRESUPUESTO PISO - INTERNO.xlsm` (presupuesto interno de la obra Pisos), carpeta `CERTIFICADOS`, carpeta `RECIBOS`, carpeta `FACTURAS A`, PDFs mensuales de DDJJ Ganancias y estado de deuda, `Cronograma de Visitas, Listado de Herramientas y Registro de Capacitacion.xlsm`, `Planilla alta control nuevas empresas SUBCONTRATISTAS.xlsx`.

Verificado con lectura real (no solo listado): `sheets.py leer` sobre el Dashboard P&L devolvió los datos reales correctos.

## Por qué este mecanismo y no delegación de dominio

Evaluado explícitamente contra la alternativa (cuenta de servicio con delegación de dominio de Workspace, que puede acceder a cualquier casilla/archivo del dominio sin compartir uno por uno). Se eligió la opción acotada: si la clave se filtra, solo compromete los archivos compartidos explícitamente, no todo `ecsas.com.ar`. Coherente con el principio de mínimo privilegio ya aplicado en RLS/roles del OS.

## Próximo paso natural

`ADICIONALES.xlsm` y `PRESUPUESTO PISO - INTERNO.xlsm` son fuentes reales nunca antes leídas -- candidatas directas para el próximo ciclo de lectura a fondo, antes de seguir con Santander/ARCA (que dependen de un trámite externo que Jorge todavía no inició).
