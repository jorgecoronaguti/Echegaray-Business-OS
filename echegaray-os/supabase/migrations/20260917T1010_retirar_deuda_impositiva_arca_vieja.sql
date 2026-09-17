-- 20260917T1010 · SE RETIRA «Deuda impositiva (ARCA)» $1.982.466 DE `public.obligaciones`
--
-- La fila 7fc8224e-dc09-459b-918b-ca8076667ccb la cargó la carga inicial del 08/07/2026 desde la
-- categoría «ARCA» del resumen viejo del Flujo de Caja, sin vencimiento. La migración 20260916T2000 ya
-- la señaló: es un número del resumen del Sheet que no corresponde a ninguna obligación identificable.
-- Desde el 16/09 la deuda fiscal vive en `impuesto_obligacion` / `impuesto_posicion`, por impuesto y
-- período, con su DDJJ. Mantenerla duplicaba en `obligacion_resumen` una deuda que no existe.
--
-- RETIRO AUTORIZADO POR EL DUEÑO EL 17/09/2026.
--
-- `obligaciones` no tiene estado ni baja lógica (columnas consultadas el 17/09), y ningún
-- `aplicaciones_pago` la referencia (0 filas): se BORRA, con respaldo completo en jsonb antes.
-- Idempotente: si la fila ya no está, no respalda ni borra nada.

set local lock_timeout = '2s';

create table if not exists public.obligaciones_retiradas_respaldo (
  id uuid primary key,
  fila jsonb not null,
  motivo text not null,
  autorizado_por text not null,
  retirada_en timestamptz not null default now()
);

alter table public.obligaciones_retiradas_respaldo enable row level security;
-- Sin políticas: es evidencia para el service role, no dato de pantalla.
revoke all on public.obligaciones_retiradas_respaldo from public, anon, authenticated;

comment on table public.obligaciones_retiradas_respaldo is
  'Filas de public.obligaciones retiradas por migración, completas en jsonb, con motivo y quién lo autorizó.';

insert into public.obligaciones_retiradas_respaldo (id, fila, motivo, autorizado_por)
select o.id, to_jsonb(o),
       'Número del resumen viejo del Flujo de Caja (categoría ARCA, 08/07/2026) sin obligación identificable; '
       || 'la deuda fiscal vive en impuesto_obligacion desde 20260916T2000.',
       'dueño · 17/09/2026'
  from public.obligaciones o
 where o.id = '7fc8224e-dc09-459b-918b-ca8076667ccb'
   and o.concepto = 'Deuda impositiva (ARCA)'
   and o.monto_total = 1982466
   and not exists (select 1 from public.aplicaciones_pago a where a.obligacion_id = o.id)
on conflict (id) do nothing;

delete from public.obligaciones o
 where o.id = '7fc8224e-dc09-459b-918b-ca8076667ccb'
   and exists (select 1 from public.obligaciones_retiradas_respaldo r where r.id = o.id);
