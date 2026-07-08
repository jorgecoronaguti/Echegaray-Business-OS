---
name: continuidad-operacional-datos
description: Descubrimiento exhaustivo de la carpeta administracion de Drive (universo documental real de Echegaray) + registro vivo fuentes_datos con frescura/cobertura, conectado al Motor de Decisiones. Dependencia transversal resuelta antes de OLA 3.
metadata:
  type: project
---

Fecha: 2026-07-08. Ejecutado antes de OLA 3 por pedido explícito del usuario ("dependencia transversal crítica").

## Qué se descubrió (recorrido real, no lista cerrada)

Carpeta raíz `administracion` (Drive, id `1a_3sIbioAQm0EcuJTbu3L6q_hy_LHUXs`) es efectivamente el universo documental inicial tal como dijo Jorge -- sin parent visible, es la raíz compartida. 31 items directos recorridos + subcarpetas clave abiertas (VEHICULOS, FONDO DE CESE, TELEGRAMAS, IVA 2026, COMPROBANTES DE TRANSFERENCIAS, Estrategia).

**Hallazgos nuevos más importantes** (no estaban en [[arquitectura-cobertura-integral]] ni en discovery-drive-echegaray):

- **IVA 2026**: Libro IVA Ventas mensual real, PDF por mes (nov-2025 a may-2026). Confirmado con contenido real: mayo 2026 factura a IMOTOR SRL (cliente de Pisos) por $20.000.000 neto gravado, IVA débito $4.200.000. Primer dato real para Fiscal (1→2).
- **VEHICULOS**: padrón real de 6 vehículos (RTO/cédula/título vigentes) -- primer dato real para Equipos y Vehículos (0→2). Sembrado en tabla `equipos`.
- **TELEGRAMAS**: cartas documento de desvinculación laboral reales (validadas RENAPER), Art. 245 LCT. Confirmado leyendo 1 caso real. Dato sensible -- catalogado como fuente, **no** estructurado en una tabla (decisión deliberada, requiere diseño explícito de acceso antes de tabular datos de desvinculación).
- **FONDO DE CESE**: confirma la procedencia real de la obligación "Fondo de Cese Laboral / UOCRA / IERIC" ya cargada en `obligaciones` desde antes.
- **COMPROBANTES DE TRANSFERENCIAS**: comprobantes de pago de sueldos -- solo 2 archivos, ambos de marzo/abril 2025. Sin actividad hace más de un año: gap verificable, no se asumió abandono ni vigencia.
- **Flujo de Caja - Cash Flow (Form)**: existe un Form homónimo al Sheet ya confirmado como fuente de verdad -- candidato a fuente abandonada, ya advertido por Jorge en PR0 que no es la fuente real.
- **Reporte Economico Echeg Const SAS.xlsm** y **carga-masiva.xlsx**: no se pudieron clasificar del todo (macro-enabled sin preview / posible duplicación con el proceso de echeqs de PR1-B) -- backlog, no inventado.

## Qué se construyó

- **`fuentes_datos`** (23 filas reales): catálogo vivo con proceso, área, responsable probable, frecuencia, vigencia, primaria/derivada, naturaleza del dato, cobertura temporal, destino en Supabase, capability dependiente, criticidad, mecanismo de integración, duplicaciones/conflictos conocidos, y estado de frescura (6 estados pedidos). Página `/fuentes`.
- **`equipos`** (6 vehículos reales): primer dato estructurado del dominio Equipos y Vehículos.
- **Motor de Decisiones conectado a frescura**: `/motor-decisiones` ahora muestra una advertencia cuando alguna fuente crítica está atrasada/con error (2 casos reales: IVA 2026, TELEGRAMAS) -- una recomendación ya no se presenta como si toda su base fuera igualmente confiable.

## Decisiones de alcance (no sobreingeniería)

- **No se construyó scheduling real** (cron/webhook) para que las fuentes se actualicen solas -- mismo bloqueante ya identificado en Rutinas Proactivas (OLA 2): requiere decisión de infraestructura, no solo código.
- **No se tabularon los datos de TELEGRAMAS** (desvinculaciones) pese a ser un hallazgo real y valioso -- es información sensible de personas, amerita una decisión de diseño explícita (quién puede verlo, con qué RLS) antes de estructurarlo, no una carga automática de este pase.
- **No se leyó Reporte Economico Echeg Const SAS.xlsm** en profundidad (archivo macro sin preview soportado) -- mismo método que JORNALES/avance_obra (descarga+parseo local) queda como próximo paso si se prioriza.

## Efecto colateral real detectado

Se reasignó el rol de la cuenta de prueba compartida (`jorge.o.corona+direccion-test-...@gmail.com`) a `direccion` para que Jorge pudiera navegar el OS sin restricciones de escritura. Esto rompió un test de la suite (`auth-roles.spec.ts`, caso "jefe_obra no puede escribir movimiento de caja") porque esa cuenta ya no está en el rol que el test espera en ese punto de la secuencia. **No se revirtió** el rol para no interrumpir la sesión de Jorge -- registrado en backlog, no oculto.

## Scorecard actualizado en esta ola

Fiscal 1→2, Equipos y Vehículos 0→2, Datos 6→7 (fuentes_datos conectado al Motor de Decisiones). Personas/Laboral/Legal y Contractual: evidencia reforzada, nivel sin cambio (fuentes reales confirmadas pero sin tabla nueva estructurada).

## Próximo paso natural

OLA 3 puede arrancar directamente sobre 2 de sus dominios objetivo ya con evidencia real fresca: profundizar Fiscal (extraer montos de IVA a una tabla) y Equipos (vincular a costos). Sigue pendiente la única pregunta que no se puede inferir: si Pipeline Comercial es hoy el cuello de botella real (ya planteada en el backlog de OLA 2, sin respuesta de Jorge todavía).
