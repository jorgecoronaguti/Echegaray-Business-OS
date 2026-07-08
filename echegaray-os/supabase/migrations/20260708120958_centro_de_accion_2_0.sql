-- Centro de Acción 2.0: cierra el ciclo de aprendizaje de una acción resuelta.
-- Adición incremental (nullable, no rompe nada existente) -- no una modificación
-- material del modelo: no cambia ninguna relación ni constraint existente.
alter table acciones add column resultado_real text;
alter table acciones add column aprendizaje_asociado text;
