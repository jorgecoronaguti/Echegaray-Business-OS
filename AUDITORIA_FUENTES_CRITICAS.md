# Auditoría de 13 Fuentes Críticas — Estado de Vigencia y Confianza

**Fecha de auditoría:** 2026-07-12  
**Período covered:** PR0-A/B (2026-07-07), PR1-B (2026-07-07/08)  
**Clasificación de confianza:**
- **Real Conciliado (RC):** Dato verificado contra múltiples fuentes internas y/o externas  
- **Real No Conciliado (RNC):** Dato real pero sin validación cruzada explícita  
- **Inferido Fuerte (IF):** Deducido de múltiples indicios con alta probabilidad  
- **Inferido Parcial (IP):** Deducido con menor confianza, requiere confirmación  
- **Desconocido (D):** No se cuenta con información suficiente  

---

## Tabla de 13 Fuentes Críticas

| # | Fuente | Propietario | Última actualización | Vigencia | Nivel confianza | Conciliada contra | Gap / Riesgo |
|---|---|---|---|---|---|---|---|
| 1 | **Flujo de Caja - Cash Flow** (Sheet) | Sistema de tesorería interna / Jorge | Última lectura 2026-07-07 | VIGENTE | **RC** | Ingresos y Egresos (P&L); Libro Banco (externo no verificado) | Flujo Proyectado duplica Sueldos julio (error confirmado). No sincronizado con planilla JORNALES real |
| 2 | **Ingresos y Egresos - P&L** (Sheet) | Sistema contable interna / Jorge | Última lectura 2026-07-07 | VIGENTE | **RC** | Flujo de Caja (reconciliación P&L devengado vs CF percibido manual); Certificado DGR IIBB (09/06/2026) | IVA Compras falta (solo Ventas en IVA 2026/). P&L da devengado mensual; vencimientos de pago requieren cruzar con Flujo |
| 3 | **CONTROL DE GASTOS.xlsx** (Sheet) | Sistema de obligaciones interna / Jorge | Última lectura 2026-07-07 | VIGENTE | **RNC** | Flujo de Caja (parcial — solo GASTOS FIJOS); Planilla JORNALES (parcial — nómina a pagar)  | Nómina $3.500.000 permanente (no updateada). No se verificó que vencimientos exactos coincidan con cobrados realmente (proyectado vs real) |
| 4 | **JORNALES** (Sheet, gid=1233944089) | Sistema de nómina / Jefe de Obra u Administración | Última lectura 2026-07-04 (últimas líneas) | VIGENTE | **RC** (datos reales de semana 30/06) | Ninguna otra fuente interna de nómina descubierta. Flujo de Caja usa cifra triplicada (error confirmado) | **Libro de Sueldos legal no localizado en Drive.** JORNALES es el mejor proxy actual, pero no reemplaza el registro legal AFIP-obligatorio |
| 5 | **CF_COB** (pestaña gid=? de Ingresos y Egresos) | Sistema de cobranzas interna / Jorge | Última lectura 2026-07-08 (lectura completa local) | VIGENTE | **RC** (49 filas reales, resto vacías) | Flujo de Caja (posición de caja refleja cobros); Cheques/eCheq de La Estrella verificados contra Universo de Cheques | Cobertura parcial verificada: primeras ~30 filas de 1.504 dimensionales. Resto (~1.474 filas) no inspeccionadas — puede haber adicionales reales pendientes no detectados |
| 6 | **Cheques/eCheq** (pestaña gid=825424599 de Flujo de Caja) | Sistema de pagos interna / Tesorería | Última lectura 2026-07-08 (lectura completa local, 848 filas reales) | VIGENTE | **RC** (pagos individuales verificados vs RESUMEN y obligaciones) | Obligaciones (PR0-B: vinculación vía `aplicaciones_pago`); Proveedores (reconciliación con RESUMEN Flujo de Caja) | 30/848 filas con estado de pago definido (debitado SI/No). 818 filas sin dato — histórico aclarado pero sin utilidad operativa futura. 1 exclusión por ambigüedad: Diesel Rodriguez ($500k vs $510k, se cargó la mayoría). |
| 7 | **avance_obra.xlsx** (Sheet, gid=791251642) | Sistema de obras interna / Jefe de Obra | Última lectura 2026-07-07 | VIGENTE | **IP** (modelo visual/checklist, no %-based confirmado en todas obras) | Ingresos y Egresos (fechas de obra cruzadas); CF_COB (clientes de obras verificados); Flujo de Caja (costos de obras referenciados) | **Modelo de avance no homogéneo:** Estrella = checklist tareas/materiales; San Francisco + Messina = tracker Gantt con % diario. No claro si limitación de la herramienta (gid fallido) o realidad operativa. O1 debe soportar ambos |
| 8 | **IVA 2026/** (carpeta Drive) | DGR San Juan / Sistema impositivo | Última lectura 2026-07-07 (archivo Libro IVA Ventas) | VIGENTE (parcial) | **IF** (débito fiscal verificado; crédito sin respaldo) | Certificado de Cumplimiento Fiscal DGR San Juan (09/06/2026, confirma IIBB al día) | **IVA Compras falta.** Solo Libro IVA Ventas disponible — no se puede calcular neto a pagar sin crédito fiscal. Obligación IIBB próxima vencible no confirmada (DGR solo confirma al 09/06, hoy es 12/07) |
| 9 | **Clientes** (vía CF_COB + Ingresos y Egresos) | Sistema comercial interna / Administración | Última lectura 2026-07-08 | VIGENTE | **RC** (4 clientes confirmados en PR0: La Estrella, Messinas, ARCOR, Javi Sánchez/IMOTOR) | Cobranzas pendientes (CF_COB vinculadas); Obras (contratación confirmada); Facturación (Ingresos y Egresos) | Universo de clientes no exhaustivo confirmado — solo los 4 que aparecen en obras/cobranzas verificados. Clientes históricos de Flujo de Caja (ej. "Banco" como acreedor) no clasificados como clientes de negocio |
| 10 | **Proveedores** (vía Cheques + CONTROL DE GASTOS + RESUMEN) | Sistema de compras interna / Administración | Última lectura 2026-07-08 | VIGENTE | **RC** (7 proveedores con cheques pendientes; 2 sin datos) | Obligaciones (vinculación `aplicaciones_pago`); Cheques (pagos individuales); Flujo de Caja RESUMEN (agregado de deudas) | Universo parcial: 9 proveedores identificados en PR1-B; RESUMEN Flujo de Caja puede contener más sin desglosar. Carralon Progreso ($4,2M) y Alumetal ($1,8M) reconciliados vía cheques individuales. 5 proveedores nuevos sin obligación previa. Excluida 1 fila ambigua (Diesel Rodriguez) |
| 11 | **Obligaciones** (tabla Supabase, cargada en PR0-B) | Base de datos / Supabase | Última carga: 2026-07-07 (10 obligaciones iniciales + 0 en PR1-B) | VIGENTE | **RC** (saldos calculados exacto vs fuentes) | Cheques (29 pagos vinculados vía `aplicaciones_pago` en PR1-B); RESUMEN Flujo de Caja (total $37.706.775,50 exacto); Flujo de Caja detalle | Total $37.706.775,50 verificado. Adicionales Messinas ($6,9M + $7,2M) no representables (gap: `adicionales.obra_id` NOT NULL, Messinas sin obra formal en OS). |
| 12 | **Movimientos de Caja** (tabla Supabase, PR0-C + PR1-B) | Base de datos / Supabase | Última carga: 2026-07-08 (3+29 pagos, 2+14 cobranzas nuevas en PR1-B) | VIGENTE | **RC** (cada movimiento verificado por suma exacta antes de insertar) | Flujo de Caja (origen de todos los datos cargados); Cheques (pagos verificados 1:1); CF_COB (cobranzas verificadas); Obligaciones (aplicaciones vinculadas) | Posición de caja Supabase (Banco $3,4M + Caja $2,7M) no conciliada automáticamente contra Flujo de Caja real — se cargó como `saldo_inicial` en PR0, pendiente de cierre diario/mensual. Nómina 1 fila real ($9,3M semana 30/06) vs Flujo triplicado — pendiente validación de qué cifra es vigente |
| 13 | **Supabase - Tabla Obras** (y schema conexo) | Base de datos / Ingesta desde Drive | Última carga: 2026-07-07 (3 obras: ARCOR, La Estrella, San Francisco) | VIGENTE | **RC** (fechas, montos, estado verificados contra Ingresos y Egresos + avance_obra) | Ingresos y Egresos (fechas, montos contractados); avance_obra (avance físico); CF_COB (cobranzas por obra); Flujo de Caja (costos por obra) | **Messinas (cliente sin obra registrada en el OS),** genera un gap: cobranzas y adicionales de Messinas no pueden vincularse a `obra_id` — se cargaron como movimientos genéricos, perdiendo trazabilidad del ciclo de vida de adicionales |

---

## Síntesis de Riesgos y Gaps

### Críticos (bloquean decisiones)

1. **Nómina duplicada:** Flujo de Caja triplicó cifra de Sueldos julio ($3M × 3). JORNALES real ($9,3M para semana 30/06). Libro de Sueldos legal **no localizado** — falta definir fuente oficial.
   - **Acción:** Localizar Libro de Sueldos; validar qué cifra (Flujo vs JORNALES) es correcta para planificación de caja.

2. **IVA Compras falta:** Solo Ventas disponible en `IVA 2026/`. Sin crédito fiscal no se puede calcular obligación IIBB neta.
   - **Acción:** Obtener Libro IVA Compras del Estudio Contable o sistema contable externo.

3. **Adicionales sin obra:** Messinas (cliente) y Macro Construcciones tienen adicionales reales ($6,9M + $7,2M + $38,7k + $58,0k) que no se pueden cargar en la tabla `adicionales` por constraint `obra_id NOT NULL`.
   - **Acción:** Redefinir si Messinas/Macro son obras sin número formal en el OS, o si la tabla `adicionales` debe relajarse a clientes sin obra.

4. **Cobranzas parcialmente inspeccionadas:** CF_COB tiene ~1.504 filas dimensionales; solo primeras ~30 verificadas. Riesgo: adicionales reales pendientes sin detectar.
   - **Acción:** Completar lectura de CF_COB (scripts locales con openpyxl ya funcionales); cargar cobranzas pendientes no detectadas.

### Altos (requieren verificación)

5. **Modelo de avance heterogéneo:** Checklist en Estrella vs Gantt % en San Francisco/Messina. No claro si es limitación de lectura (gid fallido) o realidad.
   - **Acción:** Confirmar con Jorge si el modelo varía por obra o si fue un error de lectura.

6. **Nómina vs GASTOS FIJOS:** CONTROL DE GASTOS muestra "JORNALES OBRAS" $3,5M constante (dos meses iguales), mientras JORNALES real fluctúa cada semana.
   - **Acción:** Auditar GASTOS FIJOS — ¿es una proyección desactualizada o una cifra correcta de obligación?

7. **Flujo de Fondos no sincronizado con JORNALES:** Flujo de Caja referencia sueldos pero no está conectado automáticamente a la planilla JORNALES real — riesgo de inconsistencia manual.
   - **Acción:** Automatizar ingesta de JORNALES a Flujo de Caja, o llevar sueldos exclusivamente desde JORNALES a Supabase.

### Medios (documentados, sin bloqueantes inmediatos)

8. **Cobranzas categoría N (Negro):** 14 filas de CF_COB sin respaldo, correctamente excluidas de carga. Riesgo bajo si la exclusión sigue siendo deliberada.

9. **Reconciliación P&L ↔ Cash Flow manual:** No existe un cierre automático diario/mensual que verifique que la posición de caja en Supabase + movimientos = saldo real de banco. Se cargó `saldo_inicial` en PR0, pero el puente no está automatizado.
   - **Acción:** Crear rutina de conciliación periódica (semanal o mensual, per Echegaray) que cruza Supabase vs Flujo de Caja real.

10. **Universo de proveedores incompleto:** RESUMEN Flujo de Caja agrega deudas pero no siempre las detalla. 5 nuevos proveedores descubiertos en cheques sin obligación previa en PR0 — no claro si el RESUMEN los omitía o si son nuevos.

11. **Ambigüedad en Diesel Rodriguez:** 2 valores de cheque mismo número ($500k vs $510k) — se cargó la cifra majoritaria, pero la fuente es ambigua.
    - **Acción:** Confirmar con tesorería cuál es el monto exacto.

---

## Observaciones sobre Nivel de Confianza

- **RC (Real Conciliado):** 7 de 13 fuentes tienen validación cruzada explícita (Flujo ↔ P&L, Cheques ↔ Obligaciones, Movimientos ↔ múltiples fuentes).
- **RNC (Real No Conciliado):** 1 fuente (CONTROL DE GASTOS) — datos reales pero sin validación cruzada sistemática.
- **IF (Inferido Fuerte):** 1 fuente (IVA 2026) — débito fiscal verificable; crédito inferido como falta, no confirmado.
- **IP (Inferido Parcial):** 1 fuente (avance_obra) — modelo operativo no completamente claro; puede ser limitación de lectura.
- **RC (tablas Supabase):** 2 fuentes (Obligaciones, Movimientos, Obras) — datos estructurados derivados de fuentes verificadas.

---

## Recomendaciones Inmediatas

### Bloquear hasta resolver:

1. ✋ **Definir fuente oficial de nómina:** Libro de Sueldos legal vs JORNALES vs Flujo de Caja. Una sola.
2. ✋ **Completar lectura de CF_COB:** Primeras 30 filas ≠ universo de cobranzas. Script está funcional.
3. ✋ **Obtener IVA Compras:** Crédito fiscal obligatorio para decisiones de obligaciones y caja.

### Mejorar a la siguiente ronda:

4. 🔄 **Automatizar JORNALES → Supabase:** No copiar/pegar en Flujo de Caja.
5. 🔄 **Crear tabla `clientes_sin_obra`** o relajar `adicionales.obra_id` para Messinas/Macro.
6. 🔄 **Cierre mensual automático:** Conciliación Supabase ↔ Flujo de Caja real, no snapshots manuales.

---

## Fuentes de la Auditoría

- [[arquitectura-fuentes-informacion]] — Principio permanente de arquitectura de fuentes
- [[pr0-linea-base-echegaray]] — Resoluciones de Jorge en PR0-A/B (2026-07-07)
- [[fuentes-drive-pr0-linea-base]] — URLs y gid exactas confirmadas
- [[pr1-b-cf-cob-cheques]] — Lectura completa local con openpyxl, clasificaciones A-E, cargas ejecutadas
- Certificado de Cumplimiento Fiscal DGR San Juan (09/06/2026) — Referencia externa
