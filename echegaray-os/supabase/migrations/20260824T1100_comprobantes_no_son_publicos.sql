-- EL LIBRO DE COMPRAS NO ES PÚBLICO (24/08/2026 · QA visual del rediseño, hallazgo grave).
--
-- `comprobantes_arca_select` tenía qual `true`: CUALQUIER authenticated —un empleado raso con la
-- app del teléfono— leía los 653 comprobantes con sus importes ($279,5M sumados en la sonda) vía
-- PostgREST, sin tocar la UI. La restricción tiene que vivir en la base, no en ocultar pantallas.
--
-- Queda en `es_administracion()` (Dirección, Administración y jefatura de obra): el jefe VE COSTO
-- por decisión del dueño del 19/08. Si el dueño decide que el LIBRO COMPLETO es sólo económico
-- (`ve_economia()`), es cambiar esta única policy — está declarado como pendiente en el informe.
-- El portero va como InitPlan (T7000): por consulta, no por fila.

alter policy comprobantes_arca_select on public.comprobantes_arca
  using ((select es_administracion()));
