-- Continuidad operacional real (Bloque 1): hasta ahora `fuentes_datos.estado` era una
-- foto manual (correcta el día que se cargó, pero congelada). Esta función escala
-- automáticamente `actualizado` -> `atrasado` cuando pasó más tiempo del esperado
-- según la frecuencia declarada de cada fuente, sin que nadie tenga que volver a
-- correr SQL a mano.
--
-- Deliberadamente unidireccional: solo escala urgencia (actualizado -> atrasado).
-- Nunca la baja sola con el simple paso del tiempo -- bajarla (atrasado -> actualizado)
-- requiere evidencia real de una sincronización nueva (alguien/algo actualiza
-- ultima_sincronizacion_exitosa a una fecha más reciente Y el estado en el mismo
-- movimiento). Un chequeo "¿está la fecha dentro de la ventana de hoy?" sin verificar
-- que la fecha CAMBIÓ produciría un bug de flip-flop (bajaría solo por seguir pasando
-- el tiempo, sin evidencia real de que la fuente se actualizó). No se construye esa
-- mitad todavía -- queda como decisión explícita, no como olvido.
--
-- Umbrales conservadores (aproximación de primera versión, no un calendario fiscal
-- exacto por fuente): diaria +2 días, semanal +9 días, quincenal +18 días, mensual +35
-- días de gracia sobre la frecuencia declarada.
--
-- No toca fuentes en error/conflicto/cobertura_parcial/fuente_no_disponible (esos
-- estados ya reflejan un juicio humano que no debe pisarse con una regla genérica de
-- tiempo transcurrido) ni fuentes por_evento/esporadica/desconocida (el paso del
-- tiempo no es señal de atraso para esas).
create or replace function recalcular_frescura_fuentes()
returns void
language plpgsql
set search_path = public
as $$
begin
  update fuentes_datos
  set estado = 'atrasado', updated_at = now()
  where estado = 'actualizado'
    and frecuencia_actualizacion in ('diaria', 'semanal', 'quincenal', 'mensual')
    and ultima_sincronizacion_exitosa is not null
    and ultima_sincronizacion_exitosa < now() - (case frecuencia_actualizacion
          when 'diaria' then interval '2 days'
          when 'semanal' then interval '9 days'
          when 'quincenal' then interval '18 days'
          when 'mensual' then interval '35 days'
        end);
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'recalcular_frescura_fuentes_diario') then
    perform cron.unschedule('recalcular_frescura_fuentes_diario');
  end if;
end $$;

select cron.schedule(
  'recalcular_frescura_fuentes_diario',
  '0 11 * * *',
  $$select recalcular_frescura_fuentes();$$
);
