# Resumen Ejecutivo — 13 Fuentes Críticas

**Estado actual:** Auditoría completada al 2026-07-12 sobre base de descubrimientos PR0-A/B (2026-07-07) y PR1-B (2026-07-08).

| # | Fuente | Propietario | Última Act. | Vigencia | Confianza | Conciliada ✓ | Riesgo Crítico |
|---|---|---|---|---|---|---|---|
| 1 | Flujo de Caja - Cash Flow | Tesorería interna | 2026-07-07 | ✓ | **RC** | Sí (P&L, Banco) | ⚠️ Nómina triplicada julio; no sync con JORNALES |
| 2 | Ingresos y Egresos - P&L | Contable interna | 2026-07-07 | ✓ | **RC** | Sí (Flujo, DGR) | ⚠️ IVA Compras falta |
| 3 | CONTROL DE GASTOS.xlsx | Administración interna | 2026-07-07 | ✓ | **RNC** | Parcial (nómina) | ⚠️ JORNALES $3,5M constante (desactualizado) |
| 4 | JORNALES (nómina real) | Jefe de Obra/Admin | 2026-07-04 | ✓ | **RC** | No formalizado | 🚨 **Libro Sueldos legal NO ubicado** |
| 5 | CF_COB (cobranzas) | Cobranzas interna | 2026-07-08 | ✓ | **RC** | Sí (Flujo, cheques) | ⚠️ Cobertura 30/1.504 filas; resto sin inspeccionar |
| 6 | Cheques/eCheq (pagos) | Tesorería interna | 2026-07-08 | ✓ | **RC** | Sí (Obligaciones) | ⚠️ 1 exclusión Diesel Rodriguez ($500k vs $510k ambiguo) |
| 7 | avance_obra.xlsx | Jefe de Obra | 2026-07-07 | ✓ | **IP** | Parcial (obras) | ⚠️ Modelo heterogéneo (checklist vs Gantt %); gid fallido |
| 8 | IVA 2026/ (impuestos) | DGR San Juan | 2026-07-07 | ✓ (parcial) | **IF** | No (Ventas sí, Compras no) | 🚨 **IVA Compras falta** |
| 9 | Clientes (CF_COB + P&L) | Administración interna | 2026-07-08 | ✓ | **RC** | Sí (obras, cobranzas) | ⚠️ Universo 4 clientes; no exhaustivo |
| 10 | Proveedores (Cheques + RESUMEN) | Compras interna | 2026-07-08 | ✓ | **RC** | Sí (obligaciones) | ⚠️ 9 identificados; RESUMEN puede omitir |
| 11 | Obligaciones (Supabase) | BD estructurada | 2026-07-07 | ✓ | **RC** | Sí (cheques, flujo) | ⚠️ Gap: adicionales Messinas sin obra en OS |
| 12 | Movimientos Caja (Supabase) | BD estructurada | 2026-07-08 | ✓ | **RC** | Sí (todas las fuentes) | ⚠️ Posición caja no auto-conciliada diario |
| 13 | Tabla Obras (Supabase) | BD estructurada | 2026-07-07 | ✓ | **RC** | Sí (P&L, avance, CF) | ⚠️ Messinas sin obra formal |

---

## Leyenda

**Confianza:**
- **RC** (Real Conciliado): Dato verificado contra ≥2 fuentes internas/externas
- **RNC** (Real No Conciliado): Dato real pero sin validación cruzada
- **IF** (Inferido Fuerte): Deducido de múltiples indicios; confianza alta
- **IP** (Inferido Parcial): Deducido con menor confianza; requiere confirmación

**Conciliada:** ✓ = validada contra otra fuente; Parcial = solo en parte; No = sin validación cruzada

**Riesgos:**
- 🚨 = Crítico (bloquea decisiones)
- ⚠️ = Alto/Medio (requiere seguimiento)

---

## 3 Bloqueantes Inmediatos

| Acción | Urgencia | Impacto | Responsable |
|---|---|---|---|
| Localizar **Libro de Sueldos legal** o definir si JORNALES/Flujo es oficial | 🚨 **Crítico** | Nómina, caja, obligaciones AFIP | Administración / Jorge |
| Obtener **IVA Compras** (Estudio Contable) para calcular neto a pagar | 🚨 **Crítico** | Obligaciones fiscales, caja | Contabilidad / Estudio Contable |
| Completar lectura **CF_COB** (script funcional; 1.474 filas pendientes) | 🚨 **Crítico** | Cobranzas, caja proyectada | Claude / Desarrollo |

---

## Próximas Rondas de Mejora

1. **Automatizar JORNALES → Supabase:** Eliminar ingesta manual en Flujo de Caja.
2. **Cierre mensual automático:** Conciliación Supabase ↔ Flujo de Caja real.
3. **Resolver Messinas:** ¿Obra sin número formal, o cliente sin obra? Define schema de adicionales.
4. **Auditar GASTOS FIJOS:** Validar si cifras son proyecciones vivas o datos reales.

---

**Ver:** `AUDITORIA_FUENTES_CRITICAS.md` para análisis completo por fuente.
