-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UN INDIRECTO APLICADO SIN CALCULADO TAMBIÉN TIENE QUE DECIR QUIÉN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ADITIVA: agrega UN check. No borra ninguno, no toca columnas, no toca datos. `cotizacion_indirecto`
-- tiene 0 filas al 31/08/2026, así que la validación no puede fallar sobre lo existente.
--
-- ═══ EL HUECO, ENCONTRADO EJERCITANDO LA CAPACIDAD #11 ═══
--
-- `indirecto_aplicado_explicado` dice:
--
--   pct_aplicado IS NULL OR pct_calculado IS NULL OR pct_aplicado = pct_calculado OR override_actor IS NOT NULL
--
-- El segundo término es la puerta abierta. Con `pct_calculado` en NULL —que es EXACTAMENTE el estado
-- de hoy: los 14 conceptos de `indirecto_concepto` están cargados sin monto y sin porcentaje, así que
-- `indirectoCalculado()` devuelve `null`— se puede escribir cualquier `pct_aplicado` sin actor, sin
-- motivo, sin evidencia y sin fecha. La base lo acepta.
--
-- Está MEDIDO, no supuesto. Corrido contra la base viva dentro de una transacción revertida
-- (`orquestador/scripts/xsas-escenario-indirectos-politica.mjs`, sección 3):
--
--   con calculado 0,0595 → aplicar 0,02 sin actor  → RECHAZADO por indirecto_aplicado_explicado
--   SIN calculado        → aplicar 0,02 sin actor  → ACEPTADO
--
-- Y es la forma exacta del defecto que toda esta familia de tablas vino a cerrar: el 27 % de
-- `parametro_comercial` es un número que nadie puede explicar, y ésta era la única puerta que quedaba
-- para volver a fabricar uno.
--
-- ═══ POR QUÉ NO SE MODIFICA EL CHECK QUE YA ESTÁ ═══
--
-- Reemplazarlo obliga a un `drop constraint` sobre una tabla que comparten otros frentes en la misma
-- ventana. Agregar uno nuevo al lado da el mismo resultado —los dos tienen que cumplirse— y no le
-- saca a nadie una garantía que ya tenía.
--
-- ═══ LO QUE ESTE CHECK NO DICE ═══
--
-- No obliga a que el override esté COMPLETO: de eso ya se ocupa `indirecto_override_completo`, que
-- exige los cuatro campos juntos o ninguno. Éste sólo cierra el caso «hay un aplicado que nadie
-- calculó y nadie firmó».

alter table public.cotizacion_indirecto
  add constraint indirecto_aplicado_sin_calculado_exige_actor
  check (
    pct_aplicado is null
    or pct_calculado is not null
    or override_actor is not null
  );

comment on constraint indirecto_aplicado_sin_calculado_exige_actor on public.cotizacion_indirecto is
  'Un porcentaje de indirecto aplicado que la estructura no pudo calcular es una DECISIÓN de una persona, no un cálculo: sin actor no se guarda. Cierra el hueco que dejaba `indirecto_aplicado_explicado` cuando pct_calculado es NULL — medido contra la base viva el 31/08/2026.';
