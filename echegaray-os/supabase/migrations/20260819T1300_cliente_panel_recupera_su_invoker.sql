-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `cliente_panel` PERDIÓ SU `security_invoker` Y VOLVIÓ A FILTRAR LA CARTERA ENTERA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ CÓMO APARECIÓ (19/08/2026) ═══
--
-- El test `el nivel OBRAS ve su obra y NADA más` se puso rojo con una diferencia elocuente, medida
-- con el token de un jefe de obra contra PostgREST:
--
--     clientes        → 0 filas   ✓ el RLS de la tabla funciona
--     cliente_panel   → 5 filas   ✖ la vista se los devuelve igual
--
-- Una vista sin `security_invoker` corre con los permisos de SU DUEÑO —`postgres`, que salta el
-- RLS—, así que la policy de la tabla deja de gobernar lo que sale por la vista. Y toda la web lee
-- por las vistas: la cartera de clientes viajaba entera a un usuario que no tiene ninguna.
--
-- ES LA MISMA FUGA QUE SE CERRÓ EL 18/08 en las cuatro vistas del módulo, y volvió porque un
-- `create or replace view` que no repite `with (security_invoker = true)` **borra la opción**: no
-- la hereda de la definición anterior. Es un default peligroso —lo inseguro es lo que pasa si te
-- olvidás— y por eso además de arreglarla se deja el control que la mide.
--
-- Verificado antes de escribir esto, sobre las siete vistas del módulo:
--     cliente_panel  (sin opciones)  ← la única
--     obra_panel · obra_plan_vs_real · obra_avance · imputacion_pendiente
--     proveedor_nombre_pendiente     security_invoker=true
--     persona_plantel                security_invoker=false   ← A PROPÓSITO y documentado: publica
--       sólo cuatro columnas no sensibles del legajo para que la obra pueda asignar personal sin
--       ver el legajo entero. Es una desescalada declarada, no un olvido.

alter view public.cliente_panel set (security_invoker = true);

comment on view public.cliente_panel is
  'La cartera de clientes. `security_invoker = true` NO ES OPCIONAL: sin él la vista corre como su '
  'dueño, saltea el RLS de `clientes` y devuelve la cartera entera a cualquiera con sesión. Un '
  '`create or replace view` que no repita la opción la borra.';
