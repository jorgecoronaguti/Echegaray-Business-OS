-- EL CENTINELA DEL CONTEO — cuándo apareció cada valor que una persona tipeó, visto por el OS.
--
-- POR QUÉ (15/08/2026). El dueño: *"la carga del saldo de caja en pesos (no en banco) es manual, pero
-- el sheet tiene q poder contemplar el momento (timestamp) en el q se hizo la carga"* y después *"usa
-- el registro interno del sheet para detectar exactamente cuando se puso de manera manual ese monto"*.
--
-- No hay ningún registro interno que sirva: `listarRevisiones` sobre el Cash Flow devuelve DOS
-- revisiones, las dos de la cuenta de servicio, la más vieja del propio día — Drive poda el historial
-- de los archivos nativos y la API v3 no publica el que se ve en la interfaz. El único instante que el
-- OS puede afirmar de primera mano es EL DE SU PROPIA LECTURA, y por eso este registro existe: cada
-- corrida mira la celda y anota qué valor vio. Cuando el valor cambia, ese instante es el borde
-- derecho del momento del conteo, y el borde izquierdo es la corrida anterior que todavía lo vio viejo.
--
-- ═══ POR QUÉ NO SIRVE `sheet_huella_celda`, QUE YA EXISTE Y TIENE `escrito_en` ═══
--
-- Por dos razones estructurales, no por comodidad:
--   1. Guarda la FORMA, no el valor: un importe se enmascara a `<$>`. "$4.320.000" y "$12.000.000"
--      tienen la MISMA huella, así que un cambio de conteo es literalmente invisible ahí.
--   2. Sólo registra las celdas que ESCRIBE un generador. La celda del conteo la tipea el dueño: no
--      tiene huella y no puede tenerla sin que el generador se apropie de su celda de carga.
--
-- ═══ EL MODELO: UNA FILA POR RACHA, NO UNA POR CORRIDA ═══
--
-- Una fila por cada valor distinto que la celda tuvo, con el instante en que se lo vio por primera vez
-- (`visto_desde`) y la última corrida que lo confirmó (`visto_hasta`). Una fila por corrida daría doce
-- filas por día por celda sin agregar un solo dato: lo que informa es el CAMBIO.
--
-- `concepto` es el nombre de lo observado: un rango con nombre (`CAJA_ARQUEO_ARS`) o una celda
-- (`Compras!T125`). El mismo mecanismo sirve para el conteo y para las celdas de importe de las
-- fuentes que descargan el cajón — ver caja-carga-tardia.mjs.

create table if not exists public.caja_conteo_observado (
  file_id         text not null,
  concepto        text not null,
  valor           numeric not null,
  -- EL ANCLA. Instante en que esta corrida vio este valor por PRIMERA vez. No es el momento del
  -- conteo: es su borde derecho, y el izquierdo es `previo_visto_en`. Decirlo como intervalo es la
  -- diferencia entre informar y fabricar precisión.
  visto_desde     timestamptz not null,
  visto_hasta     timestamptz not null,
  corridas        int not null default 1,
  valor_previo    numeric,
  previo_visto_en timestamptz,
  -- LA CLAVE LLEVA `visto_desde` Y NINGUNA COLUMNA NULABLE. Un índice único sobre columnas que
  -- aceptan NULL no restringe nada — en este repo ya vivió uno sobre 206 NULLs sin quejarse.
  primary key (file_id, concepto, visto_desde)
);

create index if not exists caja_conteo_observado_ultima
  on public.caja_conteo_observado (file_id, concepto, visto_desde desc);

comment on table public.caja_conteo_observado is
  'Centinela de celdas que tipea una persona: qué valor vio el OS y desde cuándo. El momento del conteo es el intervalo (previo_visto_en, visto_desde]; su ancho es el período del timer, no una precisión real.';
comment on column public.caja_conteo_observado.visto_desde is
  'Primera corrida que vio ESTE valor. Es el ancla del cálculo de efectivo: los movimientos posteriores descargan el cajón desde acá.';
comment on column public.caja_conteo_observado.previo_visto_en is
  'Última corrida que vio el valor ANTERIOR. Borde izquierdo del intervalo en que se tipeó el conteo. NULL = no hay marca previa: el intervalo queda abierto y se dice así.';

alter table public.caja_conteo_observado enable row level security;
drop policy if exists caja_conteo_observado_service on public.caja_conteo_observado;
create policy caja_conteo_observado_service on public.caja_conteo_observado
  for all to service_role using (true) with check (true);
