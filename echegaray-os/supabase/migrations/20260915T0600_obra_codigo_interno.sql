-- EL CÓDIGO INTERNO DE CADA OBRA: `OB-0001`. Corto, único e INMUTABLE.
--
-- El dueño (14/09/2026): «además del nombre agregar un id único de obra interno para no confundirlas».
-- `obra_canonica.id` ya es único, pero es un slug que se parece al nombre (`bsa-planta`,
-- `messina-bsa`, `pisos-120m2`, `messina-pisos-120-rampa`) y ese parecido es justo lo que confunde. El
-- nombre visible cambia (ese mismo día pasó a «CÓDIGO - NOMBRE»); el código no cambia nunca.
--
-- NO REEMPLAZA AL `id`. Las FK, las rutas y los alias siguen apuntando al id: el código es sólo
-- identificación visible y búsqueda. Cambiar la clave de 26 obras y de todo lo que las referencia no
-- agrega nada que el código no dé.
--
-- ═══ CÓMO SE NUMERA ═══
--
-- Por orden de creación (`created_at`, y el `id` como desempate: las cinco primeras nacieron en el
-- mismo insert del 18/07). Una secuencia propia, no `max()+1`: dos altas simultáneas con `max()+1`
-- sacan el mismo número, y con una secuencia no. Los huecos (una alta que falla) se aceptan: un
-- código no es un contador de obras.
--
-- LAS OBRAS DE PRUEBA NO CONSUMEN NÚMEROS REALES. Las que fabrica la suite E2E (`zz-e2e-*`,
-- `ZZE2E-ALTA`, `[PRUEBA E2E]`) van con `ZZ-0001` y su propia secuencia: si tomaran `OB-`, cada
-- corrida de la suite dejaría huecos en la numeración de la empresa y una obra de prueba borrada a
-- mitad de camino se confundiría con una real que falta.
--
-- ═══ POR QUÉ UN TRIGGER Y NO UN DEFAULT ═══
--
-- Un DEFAULT no ve el id ni el nombre, así que no puede separar las de prueba. El trigger de INSERT
-- además IGNORA un código que venga escrito: los códigos salen sólo de la secuencia, así que nadie
-- puede fabricar `OB-0030` a mano y hacer chocar a la alta número 30. El precio, declarado: una obra
-- borrada y restaurada desde un respaldo recibe un código NUEVO.
--
-- Sin cambios de RLS. `obra_canonica` tiene grant de SELECT por columna desde `20260912T1600` (una
-- columna nueva nace cerrada): se concede `codigo` igual que `nombre`. No se concede ni INSERT ni
-- UPDATE: lo escribe sólo el trigger.

-- DDL en horario del dueño: si alguien tiene tomada la tabla, esto falla en 5 s en vez de dejar en
-- cola a toda la app detrás del ACCESS EXCLUSIVE del ALTER.
set local lock_timeout = '5s';

create sequence if not exists public.obra_codigo_seq;
create sequence if not exists public.obra_codigo_prueba_seq;

alter table public.obra_canonica add column if not exists codigo text;

/** Las marcas con que la suite E2E fabrica obras. Una sola definición: backfill y trigger. */
create or replace function public.obra_es_de_prueba(p_id text, p_nombre text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_id, '') ~* '^(zz-?e2e|prueba-e2e)' or coalesce(p_nombre, '') ~* '(zz-?e2e|\[prueba e2e\])'
$$;

-- `security definer`: el alta web corre con el rol de quien la hace, que no tiene USAGE sobre las
-- secuencias ni debe tenerlo (podría quemar números llamando a nextval).
create or replace function public.obra_codigo_nuevo(p_id text, p_nombre text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  n bigint;
  prefijo text;
begin
  if public.obra_es_de_prueba(p_id, p_nombre) then
    n := nextval('public.obra_codigo_prueba_seq'); prefijo := 'ZZ-';
  else
    n := nextval('public.obra_codigo_seq'); prefijo := 'OB-';
  end if;
  -- `lpad` TRUNCA lo que excede el ancho: la obra 10.000 sería «OB-1000». Cuatro dígitos es el mínimo.
  return prefijo || lpad(n::text, greatest(4, length(n::text)), '0');
end $$;
revoke all on function public.obra_codigo_nuevo(text, text) from public, anon, authenticated;

-- ── backfill, en orden de creación ────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select id, nombre from public.obra_canonica where codigo is null order by created_at, id loop
    update public.obra_canonica set codigo = public.obra_codigo_nuevo(r.id, r.nombre) where id = r.id;
  end loop;
end $$;

alter table public.obra_canonica alter column codigo set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'obra_canonica_codigo_unico') then
    alter table public.obra_canonica add constraint obra_canonica_codigo_unico unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'obra_canonica_codigo_formato') then
    alter table public.obra_canonica add constraint obra_canonica_codigo_formato check (codigo ~ '^(OB|ZZ)-[0-9]{4,}$');
  end if;
end $$;

-- ── el código lo pone la base y no se toca ────────────────────────────────────────────────────────
create or replace function public.obra_codigo_guardia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.codigo := public.obra_codigo_nuevo(new.id, new.nombre);
    return new;
  end if;
  if new.codigo is distinct from old.codigo then
    raise exception 'obra_canonica.codigo es inmutable: % no puede pasar a %', old.codigo, new.codigo
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists obra_canonica_codigo_guardia on public.obra_canonica;
create trigger obra_canonica_codigo_guardia
  before insert or update on public.obra_canonica
  for each row execute function public.obra_codigo_guardia();

grant select (codigo) on public.obra_canonica to authenticated, service_role;

comment on column public.obra_canonica.codigo is
  'Código interno visible de la obra (OB-0001; ZZ-0001 las de prueba E2E). Lo asigna el trigger obra_codigo_guardia desde una secuencia propia, por orden de creación, y no se puede modificar. NO es clave: las FK y las rutas usan id.';
