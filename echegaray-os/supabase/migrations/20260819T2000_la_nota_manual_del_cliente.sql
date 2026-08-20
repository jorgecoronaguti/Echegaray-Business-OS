-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA NOTA MANUAL DEL CLIENTE — EL ÚNICO EVENTO DE LA ACTIVIDAD QUE NO SE PUEDE DERIVAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ POR QUÉ ESTA TABLA SÍ, SI LA ACTIVIDAD SE DERIVA ═══
--
-- `construirLineaDeTiempo` arma la historia del cliente LEYENDO las fechas que ya están guardadas
-- (la ficha, los contactos, las obras, los documentos, los certificados). Eso vale para todo lo que
-- el sistema ya registra, y por eso no existe una tabla de auditoría: una tabla de eventos nace
-- vacía y el día que se enciende, ARCOR —cliente desde julio— aparece con «sin actividad».
--
-- «Llamé al arquitecto y dijo que la certificación de agosto entra recién en septiembre» no está
-- guardado en ninguna parte y no se puede deducir de ninguna fila. O se escribe, o se pierde. Esa
-- —y sólo esa— es la razón de esta tabla. NO es un log de auditoría, NO duplica ningún evento que
-- ya exista, y la línea de tiempo la sigue construyendo la misma función pura de siempre.
--
-- ═══ ESTA MIGRACIÓN NO ESTÁ APLICADA ═══
--
-- La escribió un agente en un worktree; aplicarla es una decisión de quien integra. Verificado
-- contra la base viva el 19/08/2026: `public.cliente_nota` NO existe (PostgREST devuelve PGRST205).
-- Mientras siga así, `crearNota` FALLA CERRADO y la pantalla dice el nombre de esta migración: lo
-- que no se puede escribir jamás se informa como escrito.

-- ── 1 · LA TABLA ────────────────────────────────────────────────────────────────────────────────
--
-- `autor_id` sale de `auth.uid()` por DEFAULT y no de un campo del formulario: un campo de
-- formulario lo edita cualquiera desde el navegador, y una nota firmada por otro es peor que una
-- nota sin firma. Es el mismo patrón que `obra_documento.creado_por`.
--
-- Apunta a `public.perfiles(id)`, que es la misma clave que `auth.users(id)` en este esquema
-- (`20260819T1200` ya usa `references public.perfiles(id) default auth.uid()`). `on delete set
-- null` y no `cascade`: dar de baja a una persona no puede borrar lo que dijo del cliente. La nota
-- queda sin firma, que es la verdad, en vez de desaparecer.
create table if not exists public.cliente_nota (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  -- `check (texto <> '')` y no sólo `not null`: la cadena vacía pasa el not null y produce un
  -- renglón en la línea de tiempo que no dice nada. Zod ya recorta en el borde; esto es el cierre
  -- del lado de la base, que es el que vale cuando la escritura no viene de la pantalla.
  texto      text not null check (length(btrim(texto)) > 0),
  autor_id   uuid references public.perfiles (id) on delete set null default auth.uid(),
  creado_en  timestamptz not null default now()
);

-- La pregunta que hace la ficha es siempre «las notas DE ESTE cliente, la última arriba». Sin este
-- índice es un scan completo de la tabla en cada apertura de un record.
create index if not exists cliente_nota_cliente_idx
  on public.cliente_nota (cliente_id, creado_en desc);

-- ── 2 · RLS. UNA POLICY POR COMANDO — NUNCA `FOR ALL` ───────────────────────────────────────────
--
-- `FOR ALL` incluye SELECT, y las policies permisivas se combinan con OR: en cuanto el `using` de
-- la escritura es más ancho o igual que el de la lectura, la policy de lectura pasa a ser
-- decorativa. En este repo ese defecto se pagó en `obra_actividad`, en `usuario_obra` y en
-- `cliente_contacto`. Con INSERT / UPDATE / DELETE separados, la única policy que decide qué se LEE
-- es la de SELECT, y esa clase de error deja de ser posible en esta tabla.
alter table public.cliente_nota enable row level security;

-- LEER: cualquiera que entró. Es el mismo alcance que `cliente_contacto_select` y que
-- `cliente_documento_select` — un jefe de obra CONSULTA la relación con el cliente aunque no la
-- administre. La nota no lleva importes: lo económico está acotado aparte, en `cliente_panel` y en
-- `obra_panel`, y no viaja por acá.
drop policy if exists cliente_nota_select on public.cliente_nota;
create policy cliente_nota_select on public.cliente_nota for select to authenticated
  using (true);

-- ESCRIBIR: sólo Administración (dirección o administración), vía `es_administracion()`, que falla
-- cerrado cuando no hay perfil.
--
-- `autor_id = auth.uid()` en el `with check` es lo que hace que la firma NO sea falsificable: aun
-- mandando un `autor_id` a mano por PostgREST, la base rechaza la fila si no es la propia. Cuando
-- la nota entra desde la pantalla el campo ni se manda y el DEFAULT lo completa.
drop policy if exists cliente_nota_write  on public.cliente_nota;
drop policy if exists cliente_nota_insert on public.cliente_nota;
create policy cliente_nota_insert on public.cliente_nota for insert to authenticated
  with check (public.es_administracion() and autor_id = auth.uid());

-- Corregir un typo sí; reescribir lo que dijo otro, no. El `with check` repite la condición para
-- que un update no pueda MUDAR la nota a otro cliente ni cambiarle el autor.
drop policy if exists cliente_nota_update on public.cliente_nota;
create policy cliente_nota_update on public.cliente_nota for update to authenticated
  using (public.es_administracion() and autor_id = auth.uid())
  with check (public.es_administracion() and autor_id = auth.uid());

drop policy if exists cliente_nota_delete on public.cliente_nota;
create policy cliente_nota_delete on public.cliente_nota for delete to authenticated
  using (public.es_administracion() and autor_id = auth.uid());

-- ── 3 · RLS NO ES GRANT ─────────────────────────────────────────────────────────────────────────
--
-- Una policy sin su grant devuelve `permission denied`, y Next lo muestra como un 404: la pantalla
-- entera desaparece y el mensaje no habla de permisos. El módulo 01 ya estuvo caído entero por
-- esto. `service_role` necesita los suyos aparte: PostgREST no hereda nada del rol `postgres`.
grant select, insert, update, delete on public.cliente_nota to authenticated;
grant select, insert, update, delete on public.cliente_nota to service_role;

comment on table public.cliente_nota is
  'NOTA MANUAL del cliente: lo único de la actividad que no se puede derivar de otra fila. No es un log de auditoría.';
comment on column public.cliente_nota.autor_id is
  'auth.uid() de quien la escribió, puesto por DEFAULT y exigido por la policy. No viaja en el formulario: sería falsificable.';
comment on column public.cliente_nota.creado_en is
  'Cuándo se escribió. Es la fecha con la que la nota entra a la línea de tiempo; sin ella no habría dónde ubicarla.';
