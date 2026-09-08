-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS ANOTACIONES DE UNA PERSONA — LO QUE EL EMPLEADOR OBSERVA Y HOY SE PIERDE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño, 08/09/2026: *«quiero que dejes dentro de la ficha de cada persona en app.ecsas.com.ar
-- un lugar para hacer anotaciones»*.
--
-- ═══ POR QUÉ UNA TABLA NUEVA Y NO `personas.notas` ═══
--
-- `personas.notas` ya existe y es OTRA cosa: un campo de texto del legajo que se pisa entero cada
-- vez que se edita la ficha —no tiene autor, no tiene fecha y no tiene historia—. Una anotación es
-- un HECHO CON FECHA Y FIRMA: «llegó tarde tres días seguidos», «pidió adelanto», «pidió cambio de
-- obra». Guardarlas en el mismo campo obligaría a que quien escribe la segunda no borre la primera,
-- y el día que alguien edite el legajo desde el panel de identidad se lleva puesto el historial.
-- Se deja `personas.notas` como está: no se migra, no se lee desde acá, no se reemplaza.
--
-- ═══ POR QUÉ NO SE EDITA NI SE BORRA ═══
--
-- Decisión del dueño: la anotación queda. Si algo salió mal escrito, se agrega otra que lo corrige.
-- Eso NO se hace escondiendo el botón en la pantalla —una acción de servidor se invoca sin abrir
-- jamás la pantalla—: se hace no creando las policies de UPDATE y DELETE. Sin policy, RLS niega, y
-- además el grant a `authenticated` es sólo `select, insert`. Son dos cerraduras independientes.
--
-- Esto es la ficha del EMPLEADOR sobre su empleado: es un dato laboral sensible. Por eso NO la ve
-- el rol `campo` (que es la persona misma cargando su asistencia) y NO aparece en «Mi cuenta».
--
-- ═══ ESTA MIGRACIÓN NO ESTÁ APLICADA ═══
--
-- La escribió un agente en un worktree; aplicarla la decide quien integra. Mientras no esté, la
-- pantalla avisa que las anotaciones no están disponibles y el formulario no deja escribir: lo que
-- no se puede guardar jamás se informa como guardado (`anotacionesService.ts`).
--
-- REVERSIBLE: `drop table public.persona_nota;` — no toca ninguna tabla existente.

-- ── 1 · LA TABLA ────────────────────────────────────────────────────────────────────────────────
--
-- `creado_por` sale de `auth.uid()` por DEFAULT y no de un campo del formulario: un campo del
-- formulario lo edita cualquiera desde el navegador, y una anotación firmada por otro sobre el
-- legajo de un empleado es peor que una sin firma. Mismo patrón que `cliente_nota.autor_id`.
--
-- `on delete set null` en el autor y NO cascade: dar de baja la cuenta de un jefe de obra no puede
-- borrar lo que observó. La anotación queda sin firma —que es la verdad— en vez de desaparecer.
create table if not exists public.persona_nota (
  id         uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id) on delete cascade,
  -- `check (length(btrim(texto)) > 0)` y no sólo `not null`: la cadena vacía y los tres espacios
  -- pasan el not null y producen un renglón que no dice nada. Zod recorta en el borde; esto es el
  -- cierre del lado de la base, que es el que vale cuando la escritura no viene de la pantalla.
  texto      text not null check (length(btrim(texto)) > 0),
  creado_por uuid references public.perfiles (id) on delete set null default auth.uid(),
  creado_en  timestamptz not null default now()
);

-- La pregunta que hace la ficha es siempre «las anotaciones DE ESTA persona, la última arriba».
-- Sin este índice es un scan completo cada vez que alguien abre un legajo.
create index if not exists persona_nota_persona_idx
  on public.persona_nota (persona_id, creado_en desc);

-- ── 2 · RLS. UNA POLICY POR COMANDO, Y LAS QUE NO EXISTEN NIEGAN ────────────────────────────────
--
-- `FOR ALL` incluye SELECT, y las policies permisivas se combinan con OR: en cuanto el `using` de
-- la escritura es más ancho o igual que el de la lectura, la de lectura queda decorativa. Ese
-- defecto ya se pagó acá en `obra_actividad`, `usuario_obra` y `cliente_contacto`.
alter table public.persona_nota enable row level security;

-- LEER Y ESCRIBIR: `es_administracion()` — dirección, administración y jefe de obra desde el
-- 19/08/2026 (ver 20260819T4900). Es EXACTAMENTE la lista que pidió el dueño, y `campo` queda
-- afuera de las dos. La función se importa, no se copia: un `current_rol() in (...)` escrito acá
-- sería una segunda definición del mismo criterio, y la que nadie actualiza.
--
-- Va envuelta en `(select ...)`: así el planificador la evalúa UNA vez por consulta (InitPlan) y no
-- una vez por fila. Medido el 22/08: sin esto, una vista tardaba 63,9 s contra 0,7 s.
drop policy if exists persona_nota_select on public.persona_nota;
create policy persona_nota_select on public.persona_nota for select to authenticated
  using ((select public.es_administracion()));

-- `creado_por = auth.uid()` en el `with check` es lo que hace que la firma NO sea falsificable: aun
-- mandando un `creado_por` a mano por PostgREST, la base rechaza la fila si no es la propia. Desde
-- la pantalla el campo ni se manda y lo completa el DEFAULT.
drop policy if exists persona_nota_insert on public.persona_nota;
create policy persona_nota_insert on public.persona_nota for insert to authenticated
  with check ((select public.es_administracion()) and creado_por = (select auth.uid()));

-- NO HAY policy de UPDATE ni de DELETE, y su ausencia es la decisión: RLS niega todo comando sin
-- policy. Una anotación no se corrige pisándola — se corrige agregando otra.

-- ── 3 · RLS NO ES GRANT ─────────────────────────────────────────────────────────────────────────
--
-- Una policy sin su grant devuelve `permission denied`, y Next lo muestra como un 404: la pantalla
-- entera desaparece sin decir una palabra de permisos. El módulo 01 ya estuvo caído entero por esto.
--
-- EL SELECT VA A NIVEL DE TABLA A PROPÓSITO. La trampa de hoy («la columna nueva nace sin permiso»,
-- 20260908T1530) muerde donde los grants son POR COLUMNA, como en `personas`: la columna que se
-- suma después queda sin permiso y la vista entera responde «permission denied». En una tabla
-- propia el grant de tabla es justamente lo que impide que eso vuelva a pasar.
--
-- EL INSERT SÍ ES POR COLUMNA, y ahí la restricción es el punto: `authenticated` sólo puede aportar
-- `persona_id` y `texto`. La firma y la hora las pone la base. Un intento de mandar `creado_por` no
-- llega siquiera a la policy: lo rechaza el grant.
grant select on public.persona_nota to authenticated;
grant insert (persona_id, texto) on public.persona_nota to authenticated;
-- `service_role` necesita los suyos aparte: PostgREST no hereda nada del rol `postgres`. Se le da
-- lo mismo que a `authenticated` —ni update ni delete—: el worker tampoco reescribe una anotación.
grant select on public.persona_nota to service_role;
grant insert (persona_id, texto) on public.persona_nota to service_role;

comment on table public.persona_nota is
  'ANOTACIONES del empleador sobre una persona: hechos con fecha y firma. No se editan ni se borran '
  '(no hay policy de update/delete): para corregir se agrega otra. Distinta de personas.notas, que '
  'es el texto libre del legajo y se pisa entero al editar la ficha.';
comment on column public.persona_nota.creado_por is
  'auth.uid() de quien la escribió, puesto por DEFAULT y exigido por la policy. No viaja en el '
  'formulario ni tiene grant de insert: sería falsificable.';
comment on column public.persona_nota.creado_en is
  'Cuándo se anotó. Es el orden de la lista —la última arriba— y la mitad del valor del registro.';
