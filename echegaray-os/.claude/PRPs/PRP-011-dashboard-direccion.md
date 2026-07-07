# PRP-011: Dashboard de Dirección

> **Estado**: CERRADA
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Construir el primer centro de mando del dueño: una pantalla que responda "¿Dónde tengo que intervenir hoy y por qué?" cruzando las capacidades ya construidas (Control Económico, Adicionales, Ejecución Financiera, HH, Compras, Obligaciones), sin fabricar alertas nuevas ni tablas/vistas nuevas.

## Revisión previa (sin discovery general)

Esta capacidad es pura síntesis sobre lo ya construido — no requirió consulta a Drive. Se revisaron las 10 capacidades anteriores (PRP-001 a PRP-010) y se confirmó un hecho central: **cada una ya calcula sus propias alertas como función TypeScript pura sobre su propia vista/datos** (`calcularEstadoEconomico`, `calcularAlertasAdicional`, `calcularAlertasCertificado` + `calcularAlertasObraEjecucionFinanciera`, `calcularAlertasObraHH`, `calcularAlertasCompra` + `calcularAlertasObraCompras`, `calcularAlertasObligacion` + `calcularAlertasGeneralesObligaciones` + `calcularTensionLiquidez`). El Dashboard no necesita reinventar ninguna de estas reglas — solo consumirlas, normalizarlas a un formato común y ordenarlas.

## Análisis de arquitectura

**Decisión: 100% TypeScript de síntesis, cero SQL nuevo.** No se creó ninguna tabla ni vista. Se evaluaron las alternativas:

| Opción | Por qué se descartó / eligió |
|---|---|
| Vista SQL consolidada (`dashboard_alertas`) | Descartada — reimplementaría en SQL una lógica que ya existe, correcta y probada, en TypeScript puro en cada capacidad. Duplicar esa lógica en dos lenguajes es el riesgo de divergencia que el prompt pide evitar explícitamente ("bajo riesgo de duplicación"). |
| Tabla de alertas persistida | Descartada — las alertas son 100% derivables en el momento de la consulta; persistirlas exigiría un job de recálculo y sincronización que no aporta nada sobre calcularlas al vuelo con los datos ya cargados. |
| **TypeScript que reutiliza cada `calcularAlertasX` existente + variantes "todas las obras" de los servicios ya existentes** | **Elegida.** Cada capacidad expone su propia función de alertas; el Dashboard solo necesita los mismos datos que cada ficha de obra ya carga, pero **sin el filtro `.eq('obra_id', ...)`**. Se agregaron variantes `getXTodasLasObras()` a los servicios existentes (control-económico, adicionales, ejecución-financiera, HH, compras) — mismo query, sin filtro, cero tablas nuevas. `obligaciones` ya tenía esas variantes desde PRP-010. |

**Normalización**: se definió un tipo único `AlertaDashboard` (título, severidad, categoría, obra, contraparte, monto, fecha crítica, causa, decisión sugerida, link) y una función `construirAlertasDashboard()` que llama a cada `calcularAlertasX` importado de su propia capacidad, mapea cada alerta reportada al formato común (con tablas de severidad/decisión explícitas por tipo de alerta, no umbrales nuevos) y ordena el resultado por severidad.

**Alerta nueva agregada, justificada explícitamente**: "obra activa sin movimiento reciente relevante" no existía en ninguna capacidad individual (HH ya tenía "sin registro de HH", pero el pedido es más amplio: sin adicionales, certificados, compras NI HH). Se implementó reutilizando los mismos arreglos ya cargados (sin queries nuevas): para cada obra `activa`, se toma la fecha más reciente entre adicionales/certificados/compras/registros_hh de esa obra y se compara contra un umbral abierto (`DIAS_OBRA_SIN_MOVIMIENTO = 14`, mismo valor que ya usa HH por consistencia).

**Severidad**: se definieron 4 niveles (`critica`, `alta`, `media`, `informativa`) y se asignó cada tipo de alerta existente a un nivel, documentado explícitamente en tablas `SEVERIDAD_X` dentro de `features/dashboard/types/index.ts` — no se fabricó ningún umbral numérico nuevo; se reutilizan los umbrales que cada capacidad ya declaró como "propuesta abierta".

**Descartado explícitamente:**
- IA, reportes PDF, gráficos, análisis predictivo, integración con Sheets — fuera de alcance, tal como se pidió.
- Post Mortem — no se tocó.
- Cualquier alerta sin decisión sugerida y sin link accionable — cada `AlertaDashboard` incluye ambos campos obligatoriamente por tipo (`interface AlertaDashboard`), no hay alertas "informativas puras" sin una acción sugerida.

---

## Modelo de datos

Ninguno nuevo. Se reutilizan: `obra_resumen_economico`, `adicionales`, `certificados` + `obra_ejecucion_financiera`, `registros_hh` + `obra_hh_resumen`, `compras` + `compra_resumen`, `obligaciones` + `obligacion_resumen` (todas ya existentes, PRP-005 a PRP-010).

Servicios extendidos (mismo query existente, sin el filtro `.eq('obra_id', ...)`):
- `getResumenEconomicoTodasLasObras`
- `getAdicionalesTodasLasObras`
- `getCertificadosTodasLasObras`, `getEjecucionFinancieraTodasLasObras`
- `getRegistrosHHTodasLasObras`, `getHHResumenTodasLasObras`
- `getComprasTodasLasObras`, `getComprasResumenTodasLasObras`
- (`getObligaciones`, `getObligacionesResumen` ya existían sin filtro desde PRP-010)

---

## Blueprint (fase única) ✅ CERRADA (2026-07-07)

**Objetivo**: página `/dashboard` (reemplaza el stub original) con resumen por severidad, ranking de prioridades, y 6 secciones (Caja y Obligaciones, Obras en riesgo, Adicionales, Certificación/Facturación/Cobranza, HH, Compras), cada alerta con link a la ficha de obra o a `/obligaciones`.

**Validación**: sin migraciones nuevas (no hay esquema que cambiar). Se verificó contra Supabase real, con datos de prueba que abarcan 3 capacidades sobre la misma obra (un adicional ejecutado sin cotizar, una compra retrasada, una obligación vencida), que las tablas/vistas subyacentes siguen respondiendo correctamente en conjunto para el mismo `obra_id` — insumo directo de lo que `construirAlertasDashboard` consume. `get_advisors(security)` sin hallazgos nuevos (ninguno esperado, no hay esquema nuevo). `tsc`/`build`/`lint`/23 tests de Playwright en verde. Datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [ ] Los umbrales de severidad (mapas `SEVERIDAD_X` en `features/dashboard/types/index.ts`) son un criterio nuevo de priorización, no validado con el usuario — son la primera capa de "juicio de negocio" que decide qué es crítico vs. informativo cuando varias capacidades ya marcaban distintos niveles de urgencia con nombres distintos. Fácil de ajustar sin migración.
- [ ] "Obra activa sin movimiento reciente relevante" es una alerta nueva de esta capacidad (no de una capacidad anterior) — usa un umbral abierto (`DIAS_OBRA_SIN_MOVIMIENTO = 14`) igual al de HH por consistencia, pero no fue validado específicamente para esta alerta.
- [ ] El ranking de prioridades muestra las primeras 10 alertas ordenadas por severidad — no pondera por "obra más importante" ni por monto, solo por severidad y orden de inserción dentro de cada nivel.
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad de las alertas reales end-to-end (mismo límite de entorno de siempre, ver PRP-001) — el test cubre que la página no crashea y muestra el aviso de RLS correctamente.

## Anti-patrones
- NO reimplementar en SQL una lógica de alerta que ya existe en TypeScript en su capacidad de origen.
- NO crear una tabla ni vista de "dashboard" — todo es derivado en el momento de la consulta.
- NO mostrar una alerta sin `decisionSugerida` y sin `link` (cuando hay una ficha donde actuar).
- NO avanzar a Post Mortem ni construir IA/gráficos/reportes en esta capacidad.

---

*Capacidad 11 (Dashboard de Dirección): CERRADA y validada contra Supabase real.*
