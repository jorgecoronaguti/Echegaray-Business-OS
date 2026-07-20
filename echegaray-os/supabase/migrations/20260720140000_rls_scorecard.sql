-- RLS EN LAS TABLAS NUEVAS. Las creé sin RLS y sin permisos, violando una regla explícita del
-- proyecto ("RLS habilitado en toda tabla de Supabase"). Consecuencia concreta: el scorecard mostró
-- TODO EN $0 aunque los datos estaban cargados — yo había probado las consultas con el rol de
-- servicio, que ignora los permisos, y no con el rol que usa el navegador. Probar con credenciales
-- distintas a las del usuario no es probar.
do $$
declare t text;
begin
  foreach t in array array['cobranza','jornales_quincena','jornales_quincena_obra',
                           'cargas_sociales_periodo','indice_economico','uocra_escala']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    -- Lectura para cualquier usuario autenticado: son datos de gestión de la propia empresa y
    -- todos los que entran al OS trabajan acá. La escritura sigue siendo del backend.
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

grant select on public.calendario_caja to authenticated;
grant select on public.nomina_por_mes to authenticated;
grant select on public.egreso_por_area to authenticated;
grant select on public.factor_ajuste to authenticated;
