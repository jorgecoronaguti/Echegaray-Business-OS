-- Vuelta atrás de 20260930T1500. Sólo saca la función: los asientos que ya hizo quedan en el libro
-- (es inmutable) y el stock que sumaron sigue en su lugar.
drop function if exists public.ingresar_material(text, text, uuid, numeric, text);
