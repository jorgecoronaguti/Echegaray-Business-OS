-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL RECIBO QUE SE ACEPTÓ Y SE IMPRIMIÓ — sellado, en el legajo de la persona
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 22/09/2026, textual: *«en liquidacion de horas, el recibo tiene q decir total de hs y total
-- depositado y total efectivo. no puede quedar evidencia de blanco o negro y deben ir guardandose en los
-- legajos correspondientes, si se pone aceptar e imprimr, funciones q no estan ahora»*.
--
-- La primera mitad —qué dice el papel— se hizo en `reciboDeLaQuincena.ts` y `cuadro/ArmarRecibo.tsx`. Ésta
-- es la segunda: que al ACEPTAR quede guardado, se vea desde la ficha y se pueda reimprimir IGUAL.
--
-- ═══ POR QUÉ UNA TABLA PROPIA Y NO UNA FILA EN `documentacion_legajo` ═══
--
-- `documentacion_legajo` es el índice de PAPELES QUE VIVEN EN DRIVE: su clave útil es `drive_file_id` y no
-- tiene dónde poner una cifra. Un recibo emitido acá todavía no tiene archivo —el PDF lo genera el diálogo
-- de impresión del navegador, en la máquina de quien imprime, y la app no lo ve—. Meterlo ahí obligaría a
-- inventar un `drive_file_id` que no existe y a guardar los importes en el nombre del documento.
--
-- Lo que hay que sellar son LAS CIFRAS, no un archivo: por eso una tabla propia. **SUBIR EL PDF A DRIVE Y
-- ENGANCHARLO AL LEGAJO DE DRIVE QUEDA PARA UNA ETAPA SIGUIENTE, Y NO ESTÁ HECHO ACÁ**: se declara para que
-- nadie lea esta tabla como «el recibo está archivado en Drive». No lo está.
--
-- ═══ SELLADO: LA REIMPRESIÓN NO RECALCULA ═══
--
-- `renglones` guarda el papel ENTERO tal como salió —cada rótulo y cada importe, en orden—, y `horas`,
-- `banco`, `efectivo` y `total` repiten arriba las cifras que la ficha necesita listar sin abrir el jsonb.
-- Volver a calcularlo el mes que viene daría OTRO papel: las horas se corrigen, el $/h cambia, un adelanto
-- se carga tarde. Lo que la persona firmó es lo que decía el papel ese día, y eso es lo que se reimprime.
-- Por la misma razón viajan `nombre` y `categoria` como TEXTO: una persona recategorizada no puede cambiar
-- retroactivamente la categoría de un recibo que ya firmó.
--
-- ═══ NADA DE BLANCO NI NEGRO, TAMBIÉN EN LO GUARDADO ═══
--
-- El papel no lo dice (dueño) y lo guardado tampoco puede decirlo: se imprime y se exporta igual. El CHECK
-- `recibo_sin_blanco_ni_negro` rechaza la fila si esas palabras aparecen en los RÓTULOS del papel. Mira
-- `renglones` y NO `nombre`: Blanco es un apellido corriente, y un CHECK que rebota a una persona por
-- llamarse como se llama es un defecto, no un control.
--
-- ═══ DOS VECES LA MISMA QUINCENA: SE PERMITE ═══
--
-- Sin único por (persona, quincena). Se reimprime por muchos motivos legítimos —el papel se perdió, se
-- corrigieron las horas, se pagó el saldo— y cada emisión es un HECHO distinto que queda. La ficha ordena
-- por `emitido_en` y marca cuál es el último (`recibo_liquidacion_emitido.es_ultimo`). Borrar el anterior
-- sería perder la prueba de qué se le entregó a la persona.
--
-- ═══ QUIÉN ═══
--
-- Lee y escribe `liquida_sueldos()`: dirección y administración, la MISMA puerta que abre el panel donde se
-- arma el recibo. No hace falta un permiso nuevo y no se usa `es_administracion()`, que incluye al jefe de
-- obra: acá hay importes de sueldo. Escribe sólo `registrar_recibo_liquidacion`, `security definer`, y la
-- tabla no tiene ninguna policy de escritura. `emitido_por` lo pone la función con `auth.uid()`: no viaja
-- desde el formulario, así que la firma no es falsificable.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.recibo_liquidacion (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references public.personas(id) on delete restrict,
  -- La quincena que encabeza el papel, por sus dos extremos. No se deriva de la fecha de emisión: un recibo
  -- se imprime días después, y hasta se reimprime meses después.
  quincena_desde  date not null,
  quincena_hasta  date not null,
  -- Lo que decía el papel de la persona, congelado. Ver el encabezado.
  nombre          text not null,
  categoria       text,
  -- El TOTAL de horas de la quincena. Null = el papel no las decía (mensual, o quincena sin horas): nunca 0.
  horas           numeric(10,2),
  banco           numeric(14,2),
  efectivo        numeric(14,2),
  -- Banco + efectivo, tal como se imprimió. Null si el papel no cerró un total (algún medio sin dato).
  total           numeric(14,2),
  -- EL PAPEL ENTERO: { horas: [...], medios: [...] }, cada renglón con su rótulo, su importe y si es sub.
  renglones       jsonb not null,
  emitido_en      timestamptz not null default now(),
  emitido_por     uuid,
  constraint recibo_quincena_ordenada check (quincena_hasta >= quincena_desde),
  constraint recibo_renglones_es_objeto check (jsonb_typeof(renglones) = 'object'),
  constraint recibo_sin_blanco_ni_negro check (renglones::text !~* '(blanco|negro|blanca|negra)')
);
create index if not exists recibo_liquidacion_persona_idx
  on public.recibo_liquidacion (persona_id, quincena_desde desc, emitido_en desc);
comment on table public.recibo_liquidacion is
  'Los recibos de quincena que se aceptaron e imprimieron, con las cifras SELLADAS: la reimpresión no '
  'recalcula. Sin blanco ni negro, igual que el papel. El PDF no se guarda: queda en la máquina de quien '
  'imprime. Escribe sólo registrar_recibo_liquidacion.';

alter table public.recibo_liquidacion enable row level security;
revoke all on public.recibo_liquidacion from anon, public;
revoke insert, update, delete on public.recibo_liquidacion from authenticated;
grant select on public.recibo_liquidacion to authenticated;
drop policy if exists recibo_liquidacion_select on public.recibo_liquidacion;
-- `(select public.liquida_sueldos())` y no la llamada pelada: envuelta, el planificador la evalúa UNA vez
-- por consulta (initplan) y no una por fila. Es el patrón del resto de las policies del repo.
create policy recibo_liquidacion_select on public.recibo_liquidacion
  for select to authenticated using ((select public.liquida_sueldos()));

-- ── LO QUE MIRA LA FICHA: el historial, con el último marcado ────────────────────────────────────
-- `es_ultimo` es por (persona, quincena): de la misma quincena vale el que se emitió al final, y los
-- anteriores quedan visibles porque también se entregaron.
create or replace view public.recibo_liquidacion_emitido with (security_invoker = true) as
  select r.*,
         row_number() over (partition by r.persona_id, r.quincena_desde
                            order by r.emitido_en desc, r.id desc) = 1 as es_ultimo
    from public.recibo_liquidacion r;
grant select on public.recibo_liquidacion_emitido to authenticated;

-- ── ACEPTAR: REGISTRAR EL RECIBO EMITIDO ────────────────────────────────────────────────────────
-- Devuelve el id. Quien llama LEE la fila de vuelta antes de afirmar que guardó: un acuse no es evidencia.
create or replace function public.registrar_recibo_liquidacion(
  p_persona uuid, p_desde date, p_hasta date, p_nombre text, p_renglones jsonb,
  p_categoria text default null, p_horas numeric default null, p_banco numeric default null,
  p_efectivo numeric default null, p_total numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'hace falta un usuario logueado' using errcode = '42501';
  end if;
  if not public.liquida_sueldos() then
    raise exception 'sólo dirección y administración emiten recibos' using errcode = '42501';
  end if;
  if not exists (select 1 from personas where id = p_persona) then
    raise exception 'la persona no existe' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'el recibo tiene que decir a nombre de quién es' using errcode = 'P0001';
  end if;
  -- UN PAPEL VACÍO NO SE EMITE: si no dice ni horas ni medios, no hay nada que la persona firme.
  if coalesce(jsonb_array_length(p_renglones -> 'horas'), 0)
   + coalesce(jsonb_array_length(p_renglones -> 'medios'), 0) = 0 then
    raise exception 'el recibo no dice nada: no se emite' using errcode = 'P0001';
  end if;
  insert into recibo_liquidacion (persona_id, quincena_desde, quincena_hasta, nombre, categoria,
                                  horas, banco, efectivo, total, renglones, emitido_por)
  values (p_persona, p_desde, p_hasta, trim(p_nombre), nullif(trim(p_categoria), ''),
          p_horas, p_banco, p_efectivo, p_total, p_renglones, auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
