-- PRP-001 / Fase 0: fix de seguridad detectado por get_advisors (Supabase real)
-- `set_updated_at()` tenía search_path mutable (lint: function_search_path_mutable).

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
