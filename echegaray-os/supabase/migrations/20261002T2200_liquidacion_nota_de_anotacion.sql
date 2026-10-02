-- LIQUIDACIÓN DE HORAS · UNA NOTA POR ANOTACIÓN DEL PUNTO AMARILLO (dueño, 02/10/2026)
--
-- Textual: «en el lugar que dice "nota" en el hover del punto amarillo si le hago click dejame escribir una nota».
--
-- ═══ DE QUÉ CUELGA LA NOTA ═══
--
-- Cada renglón del cuadro sale de UNA fila de `liquidacion_cambio` (el log, sólo lo escribe el trigger y nadie lo
-- corrige: es inmutable) y, cuando esa fila agregó varios pagos de una suma («=51000+60000»), de la POSICIÓN del pago
-- dentro de lo que ESA fila agregó. Clave: (cambio_id, posicion). Un pago nuevo es otra fila del log, con otro id: no
-- corre a las notas de los pagos anteriores. Reescribir la cuenta en otro orden también es otra fila (se lee como
-- corrección): las notas viejas siguen en sus renglones viejos.
--
-- LÍMITE DECLARADO: la posición la calcula la app al partir la cuenta. Si esa lectura cambiara, la posición podría
-- apuntar a otro pago. Por eso la nota guarda también el IMPORTE del pago al que se escribió: la pantalla la muestra
-- sólo si el importe coincide; si no, la dice como «escrita para otro importe», nunca en el pago equivocado.
--
-- ═══ ACCESO ═══
--
-- Lee quien liquida (`liquida_sueldos()`, en initplan). Nadie escribe la tabla directo: la única puerta es
-- `liquidacion_nota_guardar`, SECURITY DEFINER, que vuelve a preguntar el permiso adentro y sella autor y momento.
-- RLS no es GRANT: la tabla nace sin privilegios para `authenticated` salvo el SELECT que se da acá.
--
-- NO SE APLICA DESDE UN AGENTE (`.claude/rules/migraciones.md`). Idempotente. Sin begin/commit: los pone
-- `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

create table if not exists public.liquidacion_cambio_nota (
  cambio_id   bigint not null references public.liquidacion_cambio(id) on delete cascade,
  -- 0 en una corrección, una baja o un importe que no es suma; i-ésimo pago agregado por ese cambio en una suma.
  posicion    smallint not null check (posicion between 0 and 99),
  -- El importe del pago al que se le escribió la nota. NULL = el renglón no tenía importe (una baja).
  importe     numeric,
  -- Texto plano de UNA línea. Vacío no existe: borrar la nota borra la fila.
  texto       text not null check (char_length(texto) between 1 and 200 and texto !~ '[\r\n]'),
  escrita_por uuid,
  escrita_en  timestamptz not null default now(),
  primary key (cambio_id, posicion)
);

comment on table public.liquidacion_cambio_nota is
  'Nota escrita a mano sobre una anotación del punto amarillo de Liquidación de horas: una fila de liquidacion_cambio y, en una suma de pagos, la posición del pago que esa fila agregó. Guarda el importe para no mostrarla en otro pago.';

alter table public.liquidacion_cambio_nota enable row level security;
drop policy if exists liquidacion_cambio_nota_lee_admin on public.liquidacion_cambio_nota;
create policy liquidacion_cambio_nota_lee_admin on public.liquidacion_cambio_nota
  for select to authenticated using ((select public.liquida_sueldos()));
-- Los privilegios por defecto reparten DML a `authenticated`: se quita todo y se da sólo la lectura.
revoke all on public.liquidacion_cambio_nota from anon, authenticated;
grant select on public.liquidacion_cambio_nota to authenticated;

create or replace function public.liquidacion_nota_guardar(
  p_cambio_id bigint, p_posicion integer, p_importe numeric, p_texto text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text;
  v_fila  public.liquidacion_cambio_nota;
begin
  if not coalesce(public.liquida_sueldos(), false) then
    raise exception 'Sólo quien liquida sueldos escribe notas de Liquidación.' using errcode = '42501';
  end if;
  if p_posicion is null or p_posicion < 0 or p_posicion > 99 then
    raise exception 'Posición de pago inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.liquidacion_cambio where id = p_cambio_id) then
    raise exception 'La anotación ya no existe.' using errcode = 'P0002';
  end if;
  -- Una línea: saltos y espacios repetidos se vuelven un espacio. Vacío = borrar.
  v_texto := nullif(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), '');
  if v_texto is null then
    delete from public.liquidacion_cambio_nota where cambio_id = p_cambio_id and posicion = p_posicion;
    return jsonb_build_object('texto', null, 'escrita_por', null, 'escrita_en', null);
  end if;
  if char_length(v_texto) > 200 then
    raise exception 'La nota pasa de 200 caracteres.' using errcode = '22001';
  end if;
  insert into public.liquidacion_cambio_nota (cambio_id, posicion, importe, texto, escrita_por, escrita_en)
  values (p_cambio_id, p_posicion, p_importe, v_texto, auth.uid(), now())
  on conflict (cambio_id, posicion) do update
    set texto = excluded.texto, importe = excluded.importe, escrita_por = excluded.escrita_por, escrita_en = excluded.escrita_en
  returning * into v_fila;
  return jsonb_build_object('texto', v_fila.texto, 'escrita_por', v_fila.escrita_por, 'escrita_en', v_fila.escrita_en);
end;
$$;

revoke all on function public.liquidacion_nota_guardar(bigint, integer, numeric, text) from public, anon;
grant execute on function public.liquidacion_nota_guardar(bigint, integer, numeric, text) to authenticated;

notify pgrst, 'reload schema';
