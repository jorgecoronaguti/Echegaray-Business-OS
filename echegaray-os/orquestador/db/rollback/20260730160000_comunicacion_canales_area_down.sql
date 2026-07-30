-- Rollback de la tabla de binding canal → área. Aditiva y aislada: al retirarla, el
-- Director deja de resolver el área por canal y cae al reclamo del especialista (que sigue
-- funcionando) y al catálogo. No se pierde ninguna capacidad de dominio.
drop index if exists comunicacion.canales_area_lookup_idx;
drop table if exists comunicacion.canales_area;
