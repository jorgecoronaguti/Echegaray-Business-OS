-- TOPE DE ERRORES DEL NAVEGADOR (30/09/2026, auditoría del registro de la app).
--
-- /api/registro-error está abierta a cualquiera que llegue a la pantalla de error, sin sesión incluida:
-- un navegador en bucle (o alguien a propósito) podía llenar app_registro de filas. El tope va en la base
-- y no en memoria del servidor porque Vercel corre varias instancias y cada una tendría su propio contador.
--
-- Regla: como mucho 20 error_cliente por minuto y por persona; todos los «sin sesión» comparten un solo
-- cupo de 20. Lo que pasa el tope se descarta en silencio (la ruta ya contesta 204 siempre): 20 por minuto
-- del mismo error alcanzan para verlo, y el resto es la misma firma repetida.
-- Usa app_registro_perfil_idx (con sesión) y app_registro_errores_idx (sin sesión).

create or replace function public.app_registro_tope_errores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'error_cliente' and (
    select count(*) from public.app_registro r
     where r.tipo = 'error_cliente'
       and r.en > now() - interval '1 minute'
       and r.perfil_id is not distinct from new.perfil_id
  ) >= 20 then
    return null;
  end if;
  return new;
end
$$;

drop trigger if exists app_registro_tope_errores on public.app_registro;
create trigger app_registro_tope_errores
  before insert on public.app_registro
  for each row execute function public.app_registro_tope_errores();
