-- ENLACES DE UN SOLO USO DE LA PANTALLA DE ASISTENCIA.
--
-- Por qué esto vive en la BASE y no en memoria: el enlace lo emite un proceso (el servidor
-- del slash command) y lo consume otro (la pantalla), systemd los reinicia, y mañana puede
-- haber más de una réplica. Un Set en memoria diría "enlace nuevo" después de cada reinicio,
-- y "un solo uso" dejaría de ser cierto sin que nadie se entere. El INSERT con
-- `on conflict do nothing` es la única forma de que dos pestañas abriendo el mismo enlace al
-- mismo tiempo tengan un ganador y un perdedor determinísticos.
--
-- La fila SE CREA AL CONSUMIR, no al emitir. Un enlace que nadie abre no deja rastro: la
-- tabla tiene el tamaño de los usos reales, no de los comandos escritos. Y como la fila ES la
-- prueba del uso, no hace falta ninguna columna `usado boolean` que pueda quedar desalineada.
--
-- Qué NO vive acá: el token (nunca se guarda — se guarda su identificador `jti`), los permisos
-- (los decide comunicacion.permisos_skill en cada pedido), y cualquier dato de asistencia (eso
-- vive en el Sheet JORNALES y ahí se queda).
--
-- ADITIVA y AISLADA en el schema `comunicacion`, que ya existe.

create table if not exists comunicacion.asistencia_enlaces (
  jti                 text primary key,                    -- identificador del enlace (NO es el token)
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text not null,                       -- identidad REAL de quien lo abrió
  plataforma_username text,                                -- para leer la auditoría sin ir a MM
  usado_at            timestamptz not null default now(),  -- el primer (y único) uso
  expira_at           timestamptz not null,                -- vencimiento que traía el token
  ip                  text,                                -- desde dónde se abrió, si se conoce
  user_agent          text
);

comment on table comunicacion.asistencia_enlaces is
  'Consumo de los enlaces firmados de un solo uso de la pantalla de asistencia. La fila se crea al ABRIR el enlace, no al emitirlo: su existencia ES la prueba de que ya se usó. No guarda el token, sólo su identificador (jti). Sirve además como traza de quién abrió la pantalla y cuándo.';

comment on column comunicacion.asistencia_enlaces.jti is
  'Identificador aleatorio del enlace, firmado dentro del token. El token en sí NUNCA se persiste.';

-- Índice para la purga por vencimiento (abajo) y para responder "quién abrió la pantalla hoy".
create index if not exists asistencia_enlaces_expira_idx
  on comunicacion.asistencia_enlaces (expira_at);

create index if not exists asistencia_enlaces_usuario_idx
  on comunicacion.asistencia_enlaces (plataforma, plataforma_user_id, usado_at desc);

-- PURGA. Una vez vencido el token, la fila ya no protege de nada: ningún enlace expirado se
-- acepta aunque no esté en la tabla. Se conserva una ventana de gracia para poder auditar
-- ("¿quién abrió la pantalla el martes?") y después se borra sola. No hay scheduler acá: la
-- llama el mantenimiento, igual que comunicacion.vencer_sesiones_asistencia().
create or replace function comunicacion.purgar_enlaces_asistencia(dias_gracia int default 30)
returns integer
language plpgsql
as $$
declare
  borradas integer;
begin
  delete from comunicacion.asistencia_enlaces
   where expira_at < now() - make_interval(days => greatest(dias_gracia, 0));
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;

comment on function comunicacion.purgar_enlaces_asistencia(int) is
  'Borra los enlaces ya consumidos cuyo vencimiento quedó fuera de la ventana de auditoría. Seguro de correr en cualquier momento: un enlace vencido no se acepta esté o no la fila.';
