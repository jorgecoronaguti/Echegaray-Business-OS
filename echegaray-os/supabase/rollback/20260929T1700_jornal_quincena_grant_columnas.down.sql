-- VUELTA ATRÁS DE 20260929T1700_jornal_quincena_grant_columnas.sql (29/09/2026).
--
-- Fuera de `supabase/migrations/` a propósito (ver 20260928T2330…down.sql): se corre a mano.
-- Efecto de volver: el recibo en blanco vuelve a mostrar «—» en la fecha de pago de las quincenas
-- que sólo están en `jornal_quincena`, y la app registra el error de lectura.
revoke select (desde, hasta, clase, fecha_pago) on public.jornal_quincena from authenticated;
