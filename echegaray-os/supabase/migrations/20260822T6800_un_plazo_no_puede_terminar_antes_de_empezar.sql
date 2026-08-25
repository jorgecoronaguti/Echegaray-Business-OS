-- ═══ UN PLAZO NO PUEDE TERMINAR ANTES DE EMPEZAR (22/08/2026 · PASADA D del E2E Quattropani) ═══
--
-- El negative testing del caso real lo probó: el formulario de actividad aceptaba fin_plan
-- anterior a inicio_plan y la fila quedaba viva con un plazo negativo — Gantt, forecast y
-- desvíos consumiendo un intervalo imposible sin que nadie grite. La validación de la action
-- (Zod) es la primera línea; este CHECK es el piso: ninguna cara del OS —web, chat, script,
-- sync del tracker— puede volver a escribirlo. Verificado antes de aplicar: cero filas vivas
-- lo violan (la única era la del propio ataque, ya eliminada).

alter table public.obra_actividad
  add constraint obra_actividad_plan_coherente
  check (inicio_plan is null or fin_plan is null or fin_plan >= inicio_plan);

alter table public.obra_actividad
  add constraint obra_actividad_base_coherente
  check (inicio_base is null or fin_base is null or fin_base >= inicio_base);
