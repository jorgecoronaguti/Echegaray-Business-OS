-- 20260916T1900 · UN TIQUE DE ARCA SIN CAE ENTRA UNA SOLA VEZ
--
-- ═══ EL DEFECTO (medido el 16/09/2026) ═══
--
-- `comprobantes_arca` es idempotente por `unique (tipo_libro, cae, numero)`. Los tiques y las notas
-- de crédito de controlador fiscal (tipos 81 y 112) no tienen CAE: llegan con `cae` NULL, y en un
-- índice único NULL no choca con NULL. Cada re-ingesta del libro los volvía a insertar:
--
--   767 filas · 150 sin CAE · 15 comprobantes repetidos en 146 filas → 131 filas de más
--   (feb–jul 2026: Trielec ×13 y ×9, Maderas Lliteras ×9, Clavero ×8)
--
-- Todo lo que suma el libro sin filtrar —costos de obra, IVA crédito— quedaba inflado. El filtro de
-- `orquestador/lib/arca-duplicados.mjs` tapaba la vista de un generador que ya no existe; la app lee
-- la tabla directo. El arreglo es en la tabla, no en cada lector.
--
-- ═══ LA IDENTIDAD DE UN COMPROBANTE SIN CAE ═══
--
-- tipo_libro + tipo_comprobante + emisor_cuit + punto_venta + numero. Para ARCA, tipo + punto de
-- venta + número no se repite dentro de un emisor. NO va la fecha ni el importe: si el mismo
-- comprobante reaparece con otro importe, eso no es un comprobante nuevo sino una corrección del
-- mismo, y el `on conflict ... do update` de la ingesta la aplica sobre la fila que ya existe.
--
-- Sin `emisor_cuit` la fila no queda restringida (NULL no choca): es a propósito y es la misma
-- regla que `claveComprobante` — dos tiques sin CUIT con el mismo número son de dos emisores
-- distintos, y fusionarlos borraría una compra real. Hoy no hay ninguno.
--
-- Índice PARCIAL `where cae is null`, y no uno sobre `coalesce(cae,'')` que cubra todo: con CAE la
-- identidad vigente funciona y cambiarla obligaría a revalidar 617 filas que no tienen el defecto.
--
-- ═══ QUÉ SE BORRA Y QUÉ NO ═══
--
-- Se queda la PRIMERA copia (menor `created_at`, desempata `id`). Se borra una copia sólo si es
-- idéntica a la que queda en todo lo que tiene valor: importes, alícuotas, fecha, receptor, nombre,
-- obra asignada y estado de control. Una copia que difiera NO se borra — y entonces el índice único
-- no se puede crear y la migración entera aborta. Falla cerrada: un comprobante con dos versiones
-- tiene que verlo una persona, no resolverlo un DELETE. Al 16/09 las 15 familias son idénticas.
--
-- Nada referencia `comprobantes_arca.id` por FK (consultado en pg_constraint el 16/09); las vistas
-- `comprobante_compra`, `comprobante_posible_duplicado` y `comprobante_sin_registrar` leen la tabla
-- y se corrigen solas.
--
-- El runner (`reconstruir-desde-cero.mjs`) envuelve cada archivo en begin/commit: respaldo, borrado
-- e índice son atómicos. Aplicada a mano, va con `psql -1`.

set local lock_timeout = '2s';

-- ─── 1 · el respaldo de lo que se borra ─────────────────────────────────────────────────────────
create table if not exists public.comprobantes_arca_duplicados_respaldo_20260916 (
  like public.comprobantes_arca including defaults,
  conservada_id uuid not null,
  respaldada_en timestamptz not null default now()
);

alter table public.comprobantes_arca_duplicados_respaldo_20260916 enable row level security;
-- Sin políticas: es evidencia para el service role, no dato de pantalla.
revoke all on public.comprobantes_arca_duplicados_respaldo_20260916 from public, anon, authenticated;

comment on table public.comprobantes_arca_duplicados_respaldo_20260916 is
  'Copias repetidas de comprobantes sin CAE borradas por 20260916T1900. conservada_id = la fila que quedó en comprobantes_arca.';

-- ─── 2 · las copias idénticas, respaldadas y borradas ───────────────────────────────────────────
create temporary table _arca_copia on commit drop as
with fam as (
  select c.*,
         first_value(c.id) over w as conservada_id,
         row_number() over w as orden
    from public.comprobantes_arca c
   where c.cae is null and c.emisor_cuit is not null
  window w as (partition by c.tipo_libro, c.tipo_comprobante, c.emisor_cuit, c.punto_venta, c.numero
               order by c.created_at, c.id)
)
select f.id, f.conservada_id
  from fam f
  join public.comprobantes_arca k on k.id = f.conservada_id
 where f.orden > 1
   and (f.fecha_emision, f.receptor_cuit, f.emisor_nombre, f.moneda, f.neto_gravado, f.neto_no_gravado,
        f.exento, f.total_iva, f.otros_tributos, f.imp_total, f.iva_por_alicuota, f.periodo,
        f.obra_texto, f.estado_control)
       is not distinct from
       (k.fecha_emision, k.receptor_cuit, k.emisor_nombre, k.moneda, k.neto_gravado, k.neto_no_gravado,
        k.exento, k.total_iva, k.otros_tributos, k.imp_total, k.iva_por_alicuota, k.periodo,
        k.obra_texto, k.estado_control);

insert into public.comprobantes_arca_duplicados_respaldo_20260916
select c.*, x.conservada_id, now()
  from public.comprobantes_arca c
  join _arca_copia x on x.id = c.id;

delete from public.comprobantes_arca c
 using _arca_copia x
 where x.id = c.id;

-- ─── 3 · que no vuelva a entrar ─────────────────────────────────────────────────────────────────
-- La ingesta lo usa como destino del `on conflict` (orquestador/lib/arca-duplicados.mjs,
-- `conflictoIngesta`). Si una copia distinta sobrevivió al paso 2, esto falla y aborta todo.
create unique index comprobantes_arca_sin_cae_identidad
  on public.comprobantes_arca (tipo_libro, tipo_comprobante, emisor_cuit, punto_venta, numero)
  where cae is null;
