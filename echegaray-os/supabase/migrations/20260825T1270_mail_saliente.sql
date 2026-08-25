-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA COLA DE MAILS AL CLIENTE — habilitación (31), aviso y publicación del esquema (32)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Mandar un mail a un cliente es NIVEL E: efecto comunicacional hacia afuera. Lo dispara siempre una
-- persona apretando un botón; el OS prepara y envía, nunca decide mandarlo solo. Por eso no hay nada
-- acá que genere filas por su cuenta: las escribe una server action detrás de un click.
--
-- ═══ POR QUÉ UNA COLA Y NO UN ENVÍO DIRECTO ═══
--
-- Mismo motivo que Cobranzas: la app está en Vercel y la cuenta de Gmail del orquestador vive en la
-- VM. Además, un envío que falla dentro de una server action se pierde con el request; acá queda la
-- fila con el error y se reintenta.
--
-- ═══ LA IDEMPOTENCIA ES EL PUNTO ═══
--
-- Un mail duplicado a un cliente es un error visible desde afuera de la empresa. `clave_unica` es lo
-- que impide que dos clicks o un reintento del worker manden dos veces lo mismo: la arma quien
-- encola con lo que hace único al envío (p. ej. `esquema:<cliente>:<publicado_at>`). Es nullable
-- porque hay envíos legítimamente repetibles (reenviar una invitación es justamente eso).
create table if not exists public.mail_saliente (
  id           uuid primary key default gen_random_uuid(),
  para         text not null check (para = lower(btrim(para)) and position('@' in para) > 1),
  asunto       text not null check (btrim(asunto) <> ''),
  cuerpo_html  text not null check (btrim(cuerpo_html) <> ''),
  -- Qué plantilla lo produjo. Sirve para poder responder «¿le avisamos de esto?» sin leer el HTML.
  plantilla    text check (plantilla is null or plantilla in
                 ('habilitacion_portal', 'esquema_publicado', 'aviso_vencimiento')),
  cliente_id   uuid references public.clientes(id) on delete set null,
  clave_unica  text unique,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'procesando', 'enviado', 'error')),
  intentos     smallint not null default 0,
  error        text,
  pedido_por   uuid not null default auth.uid() references auth.users(id),
  pedido_at    timestamptz not null default now(),
  tomado_at    timestamptz,
  enviado_at   timestamptz
);

create index if not exists mail_saliente_cola_idx
  on public.mail_saliente (estado, pedido_at) where estado in ('pendiente', 'procesando');

comment on table public.mail_saliente is
  'Cola de mails al cliente. Nivel E: sólo se llena detrás de un click de una persona. El worker de '
  'la VM los manda con gmailSend desde administracion@ecsas.com.ar. clave_unica impide el duplicado.';
comment on column public.mail_saliente.clave_unica is
  'Lo que hace único al envío (p. ej. esquema:<cliente_id>:<publicado_at>). NULL para los envíos '
  'legítimamente repetibles, como reenviar una invitación.';

alter table public.mail_saliente enable row level security;

drop policy if exists mail_saliente_select on public.mail_saliente;
create policy mail_saliente_select on public.mail_saliente
  for select to authenticated using ((select public.es_administracion()));

-- Nace pendiente, a nombre propio y con 0 intentos. El cliente NO tiene ninguna policy acá: que un
-- externo pudiera insertar en esta tabla sería darle el Gmail de la empresa para mandar lo que
-- quiera a quien quiera.
drop policy if exists mail_saliente_insert on public.mail_saliente;
create policy mail_saliente_insert on public.mail_saliente
  for insert to authenticated
  with check ((select public.es_administracion())
              and pedido_por = (select auth.uid())
              and estado = 'pendiente' and intentos = 0 and enviado_at is null);

-- Sin UPDATE ni DELETE: el estado del envío lo escribe el worker por DATABASE_URL. `enviado` tiene
-- que significar «Gmail lo aceptó», no «alguien marcó que sí».

grant select on public.mail_saliente to authenticated;
grant insert (para, asunto, cuerpo_html, plantilla, cliente_id, clave_unica, pedido_por, estado, intentos)
  on public.mail_saliente to authenticated;
