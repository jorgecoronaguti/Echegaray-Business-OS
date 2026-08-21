-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS DEPENDENCIAS SON REALES: CUATRO TIPOS, DEMORA, Y NINGÚN CICLO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_dependencia` existe desde hace tiempo, está bien modelada y tiene **cero filas en las cinco
-- obras con cronograma**. No es un olvido: nadie las dedujo de las fechas, y hacerlo habría sido
-- inventar una secuencia que nadie declaró. Ahora las siembra la conversión, y por primera vez van
-- a existir de verdad — así que conviene que la base no acepte un grafo imposible.
--
-- Lo que se agrega es integridad, no motor:
--
--   · los cuatro tipos declarados y nombrados (FS, SS, FF, SF) con su demora, que puede ser
--     negativa: un lead de −3 días es «empieza tres días antes de que termine la otra»;
--   · una actividad no depende de sí misma, ni de una de otra obra;
--   · **ningún ciclo**. Un ciclo no se ve al cargarlo: se ve cuando el cronograma no converge y
--     nadie entiende por qué, o peor, cuando converge en una fecha inventada.
--
-- El cálculo del cronograma —pases hacia adelante y hacia atrás, holgura, camino crítico— NO va
-- acá. Va en un módulo puro con pruebas, porque es lógica que hay que poder correr sobre casos
-- armados a mano sin una base de datos delante. Lo que la base garantiza es que el grafo sobre el
-- que ese motor trabaja no sea absurdo.

alter table public.obra_dependencia drop constraint if exists obra_dependencia_tipo_check;
alter table public.obra_dependencia add constraint obra_dependencia_tipo_check
  check (tipo in ('FS', 'SS', 'FF', 'SF'));

alter table public.obra_dependencia drop constraint if exists obra_dependencia_no_es_ella_misma;
alter table public.obra_dependencia add constraint obra_dependencia_no_es_ella_misma
  check (origen_id <> destino_id);

create unique index if not exists obra_dependencia_unica
  on public.obra_dependencia (origen_id, destino_id);

create index if not exists obra_dependencia_destino_idx on public.obra_dependencia (destino_id);

comment on column public.obra_dependencia.tipo is
  'FS fin-comienzo · SS comienzo-comienzo · FF fin-fin · SF comienzo-fin. En la pantalla NUNCA se '
  'nombra la sigla: se lee en palabras («empieza cuando termina la armadura», «termina 3 días antes '
  'que…»). El tipo y la demora viven detrás de «cambiar relación».';
comment on column public.obra_dependencia.lag_dias is
  'Demora en días hábiles. Negativa es adelanto: −3 en un FS es «empieza tres días antes de que la '
  'otra termine».';

create or replace function public.dependencia_sin_ciclo()
returns trigger language plpgsql as $$
declare
  a_obra text;
  b_obra text;
begin
  select obra_id into a_obra from public.obra_actividad where id = new.origen_id;
  select obra_id into b_obra from public.obra_actividad where id = new.destino_id;
  if a_obra is null or b_obra is null then
    raise exception 'la dependencia apunta a una actividad que no existe';
  end if;
  if a_obra is distinct from b_obra then
    raise exception 'no se puede vincular una actividad de % con una de %', a_obra, b_obra;
  end if;

  -- ¿el destino ya alcanza al origen? Entonces esta arista cierra el círculo.
  if exists (
    with recursive alcanza as (
      select destino_id as id, 1 as saltos
        from public.obra_dependencia where origen_id = new.destino_id
      union all
      select d.destino_id, a.saltos + 1
        from public.obra_dependencia d
        join alcanza a on a.id = d.origen_id
       where a.saltos < 500
    )
    select 1 from alcanza where id = new.origen_id
  ) then
    raise exception 'esa dependencia cierra un ciclo: la actividad de destino ya lleva, por el camino que sea, hasta la de origen';
  end if;

  return new;
end $$;

drop trigger if exists dependencia_sin_ciclo_t on public.obra_dependencia;
create trigger dependencia_sin_ciclo_t before insert or update on public.obra_dependencia
  for each row execute function public.dependencia_sin_ciclo();

-- La relación, dicha en palabras. La pantalla lee de acá y no arma la frase por su cuenta: si el
-- texto vive en el front, cada pantalla inventa el suyo y dejan de coincidir.
create or replace view public.obra_dependencia_legible with (security_invoker = true) as
select d.id, d.obra_id, d.origen_id, d.destino_id, d.tipo, d.lag_dias,
       o.nombre as origen, t.nombre as destino,
       case d.tipo
         when 'FS' then case when d.lag_dias = 0 then 'empieza cuando termina ' || o.nombre
                             when d.lag_dias > 0 then 'empieza ' || d.lag_dias || ' d después de que termina ' || o.nombre
                             else 'empieza ' || abs(d.lag_dias) || ' d antes de que termine ' || o.nombre end
         when 'SS' then case when d.lag_dias = 0 then 'empieza en paralelo con ' || o.nombre
                             else 'empieza ' || abs(d.lag_dias) || ' d ' || case when d.lag_dias > 0 then 'después' else 'antes' end || ' que ' || o.nombre end
         when 'FF' then case when d.lag_dias = 0 then 'termina junto con ' || o.nombre
                             else 'termina ' || abs(d.lag_dias) || ' d ' || case when d.lag_dias > 0 then 'después' else 'antes' end || ' que ' || o.nombre end
         when 'SF' then 'no puede terminar hasta que empiece ' || o.nombre
       end as relacion
  from public.obra_dependencia d
  join public.obra_actividad o on o.id = d.origen_id
  join public.obra_actividad t on t.id = d.destino_id;

grant select on public.obra_dependencia_legible to authenticated;
grant select on public.obra_dependencia_legible to service_role;
