-- CUANDO EL SISTEMA CONSIGUE UN PRECIO SOLO, TIENE QUE PODER MOSTRAR DE DONDE LO SACO.
--
-- === POR QUE ESTA TABLA Y NO UNA COLUMNA MAS EN recurso_precio ===
--
-- `recurso_precio` guarda QUE precio tiene un recurso. Esta tabla guarda POR QUE. Son dos preguntas
-- distintas y viven distinto en el tiempo: el precio se pisa cuando llega uno nuevo, la decision de
-- haberlo elegido no se pisa nunca. Meter la evidencia como columnas de `recurso_precio` la haria
-- desaparecer en el proximo update, que es exactamente lo contrario de lo que el paso 10 del
-- programa pide ("conservar evidencia").
--
-- === LO QUE ESTA TABLA NO ES ===
--
-- No es la fuente del precio. La fuente sigue siendo `recurso_precio`. Esta es el CUADERNO: que
-- fuentes se probaron, cual gano, cuales se descartaron y por que, que vigencia se derivo y con que
-- deriva. Sin eso, "el sistema actualizo 40 precios solo" es una afirmacion sin evidencia, y una
-- afirmacion sin evidencia adjunta no esta pendiente: esta incumplida.
--
-- === POR QUE NO HAY UPDATE ===
--
-- Es la misma leccion que `cotizacion_override_precio` (20260829T2300): una decision registrada es un
-- HECHO. Si manana el sistema decide otra cosa, eso es otro hecho y va otra fila. Reescribir el
-- motivo por el que se asumio un precio borra la unica traza que permite auditar la autonomia.
-- Aca eso se hace cumplir en la BASE: hay grant de select e insert, y no hay de update ni delete.
-- No es una convencion del codigo, es un `permission denied` (42501).

create table if not exists public.recurso_precio_resolucion (
  id              uuid primary key default gen_random_uuid(),
  recurso_id      uuid references public.recurso (id) on delete cascade,
  recurso_codigo  text not null,
  -- El resultado: VIGENTE | ACTUALIZADO | NECESITA_HUMANO | SIN_PRECIO. Es texto y no un enum a
  -- proposito: el enum obliga a una migracion cada vez que el motor aprende un caso nuevo, y el
  -- CHECK de abajo ya impide que entre cualquier cosa.
  resultado       text not null,
  -- === valor NULLABLE Y CON CHECK: SIN_PRECIO NUNCA ES CERO ===
  -- Esta es la regla del programa puesta donde no se puede esquivar. Una fila SIN_PRECIO con un
  -- valor, o una fila resuelta con valor 0, no entran: la base las rechaza.
  valor           numeric,
  moneda          text,
  fuente          text,
  detalle_fuente  text,
  fecha_precio    date,
  vigencia_dias   integer,
  vence_el        date,
  origen_deriva   text,
  resuelto_en     text,
  materialidad    numeric,
  evidencia       jsonb,
  provenance      jsonb not null,
  por_que         text not null,
  decidido_en     timestamptz not null default now(),
  constraint recurso_precio_resolucion_resultado_conocido
    check (resultado in ('VIGENTE', 'ACTUALIZADO', 'NECESITA_HUMANO', 'SIN_PRECIO')),
  constraint recurso_precio_resolucion_sin_precio_no_es_cero
    check ((resultado = 'SIN_PRECIO' and valor is null) or (resultado <> 'SIN_PRECIO' and valor > 0)),
  -- Una resolucion sin moneda al lado de un valor es un numero sin unidad.
  constraint recurso_precio_resolucion_valor_lleva_moneda
    check (valor is null or moneda is not null)
);

comment on table public.recurso_precio_resolucion is
  'El cuaderno de la resolucion autonoma de precios: que fuentes se probaron, cual gano, cuales se '
  'descartaron y por que. NO es la fuente del precio (esa es recurso_precio): es la evidencia de '
  'como se decidio. Sin update ni delete: una decision registrada es un hecho.';

comment on column public.recurso_precio_resolucion.valor is
  'NULL cuando el resultado es SIN_PRECIO. NUNCA cero: un CHECK lo impide. Un subcontrato sin '
  'cotizar no cuesta $0, cuesta lo que va a costar y todavia no se sabe.';

comment on column public.recurso_precio_resolucion.provenance is
  'El recorrido completo de la cascada (INTERNO, COMPRA_ECSAS, COMPARABLE, WEB) con el estado de '
  'cada paso, los candidatos descartados con su motivo, la materialidad y el cotejo de outlier.';

create index if not exists recurso_precio_resolucion_por_recurso
  on public.recurso_precio_resolucion (recurso_codigo, decidido_en desc);
create index if not exists recurso_precio_resolucion_pendientes
  on public.recurso_precio_resolucion (resultado, decidido_en desc)
  where resultado in ('NECESITA_HUMANO', 'SIN_PRECIO');

alter table public.recurso_precio_resolucion enable row level security;

drop policy if exists recurso_precio_resolucion_lectura on public.recurso_precio_resolucion;
drop policy if exists recurso_precio_resolucion_alta on public.recurso_precio_resolucion;

-- Un precio es economia: lo ve quien ve economia. El `(select ...)` no es cosmetico -- envuelto asi
-- el portero corre UNA vez por consulta (initplan) y no una vez por fila.
create policy recurso_precio_resolucion_lectura on public.recurso_precio_resolucion for select to authenticated
  using ((select public.ve_economia()));

-- Escribir una resolucion mueve el costo de una oferta: es COMMERCIAL_WRITE, la misma exigencia que
-- firmar un override de precio vencido.
create policy recurso_precio_resolucion_alta on public.recurso_precio_resolucion for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE')));

-- RLS NO ES GRANT: sin esto la policy existe y la consulta devuelve `permission denied`.
grant select, insert on public.recurso_precio_resolucion to authenticated;
grant all on public.recurso_precio_resolucion to service_role;
