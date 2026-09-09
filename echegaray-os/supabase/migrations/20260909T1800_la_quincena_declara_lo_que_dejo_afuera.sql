-- 20260909T1800 · UNA QUINCENA PARCIAL TIENE QUE PODER DECIRLO EN LA BASE
--
-- `liquidacion-cargar-jornales.mjs` cargó 16 quincenas cerradas de 2026 y dejó $7.132.250 afuera:
-- seis personas de la planilla que no existen en `public.personas` y que el dueño decidió no dar de
-- alta (09/09/2026, «son inactivos los que no están en esta quincena»). Ese faltante hoy sólo vive
-- en la consola de la corrida. Quien mire Postgres ve un total corto SIN NINGUNA MARCA de que lo es
-- — y un total corto se lee exactamente igual que uno completo.
--
-- ═══ POR QUÉ EN LA CABECERA Y NO EN UNA TABLA DE EXCLUIDOS ═══
--
-- Porque lo excluido NO TIENE persona_id: es justamente lo que le falta. Una tabla con FK a
-- `personas` no puede guardarlo, y una tabla sin FK sería un padrón paralelo de gente que el dueño
-- decidió no dar de alta. `excluidas` es un jsonb de {nombre, importe}: no pretende ser identidad,
-- es la constancia de un nombre escrito en un papel y del importe que ese papel le pagó.
--
-- ═══ EL MONTO VA APARTE DEL JSON A PROPÓSITO ═══
--
-- `monto_excluido` es el número que decide (se suma, se compara con el total del Sheet) y tiene que
-- poder consultarse sin abrir el json. El json es el detalle que explica de dónde sale.

alter table public.liquidacion_quincena
  add column if not exists monto_excluido numeric,
  add column if not exists excluidas      jsonb,
  add column if not exists observacion    text;

comment on column public.liquidacion_quincena.monto_excluido is
  'Plata que la fuente pagó en esta quincena y que NO entró como línea. NULL = nadie lo midió todavía; 0 = se midió y no faltó nada. La diferencia importa: un NULL leído como 0 afirma que la quincena está completa.';
comment on column public.liquidacion_quincena.excluidas is
  'Detalle de lo que quedó afuera: [{"nombre":..., "importe":...}]. Sin persona_id porque la ausencia de persona ES el motivo de la exclusión.';
comment on column public.liquidacion_quincena.observacion is
  'Por qué esta quincena entró como entró, en una línea, escrita por quien la cargó.';

-- MONTO SIN DETALLE ES UN NÚMERO SIN ORIGEN. Si se declara plata afuera, tiene que constar de quién.
alter table public.liquidacion_quincena
  drop constraint if exists liquidacion_quincena_excluido_con_detalle;
alter table public.liquidacion_quincena
  add constraint liquidacion_quincena_excluido_con_detalle check (
    coalesce(monto_excluido, 0) = 0
    or (excluidas is not null and jsonb_typeof(excluidas) = 'array' and jsonb_array_length(excluidas) > 0)
  );
