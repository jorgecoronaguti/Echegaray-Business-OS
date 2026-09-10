-- 10/09/2026 · «RLS no es GRANT»: obra_canonica tiene política de lectura (obra_canonica_select:
-- administración, jefe de obra o ve_obra(id)) pero el rol authenticated sólo tenía DELETE.
-- La vista cobranza_imputacion (20260910T2330) llama funciones que leen obra_canonica con el rol
-- del usuario y PostgREST respondía 42501 «permission denied for table obra_canonica»; la pantalla
-- Clientes apagaba la columna Cobrado de todas las obras. Con el GRANT, la RLS decide las filas.
grant select on public.obra_canonica to authenticated;
