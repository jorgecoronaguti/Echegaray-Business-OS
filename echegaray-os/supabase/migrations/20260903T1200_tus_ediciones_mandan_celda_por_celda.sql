-- TUS EDICIONES MANDAN, CELDA POR CELDA — el registro que le faltaba a la propiedad por celda.
--
-- POR QUÉ (03/09). El dueño: «el sheet flujo de fondos es un documento vivo autónomo y automático; lo
-- único que requiero siempre es que mis ediciones en el archivo sean las que manden y siempre se
-- respeten», y después precisó qué cuenta como edición: «todo lo que escribo, borro, modifico, agrego,
-- saco, edito de diseño, cambio de lugar, copio y pego».
--
-- Todo lo que había decidía por PESTAÑA (candado, auto-candado, firma): o congelaba la pestaña entera
-- o la pisaba entera. Esta migración habilita el estado del medio — la pestaña se sigue rehaciendo
-- sola y la celda que él tocó no se toca — con las dos evidencias que faltaban.

-- ── 1. LA HUELLA GUARDA EL VALOR EXACTO, NO SÓLO LA FORMA ──
--
-- `sheet_huella_celda.forma` es el contenido ENMASCARADO: por diseño `$500.000` y `$750.000` son las
-- dos `<$>`. Con eso es imposible ver que el dueño cambió un importe de una celda que el OS escribió,
-- y ese caso —«modifico»— es el primero que él nombró. Nace NULL en las huellas ya escritas: sobre
-- ésas no se afirma nada y el comportamiento no cambia. La protección se enciende celda por celda, a
-- medida que el OS reescribe, en vez de congelar de golpe un archivo entero sobre un registro que
-- todavía no la puede sostener.
alter table public.sheet_huella_celda add column if not exists valor text;

comment on column public.sheet_huella_celda.valor is
  'El contenido EXACTO (render FORMULA) que el OS dejó en la celda. Junto a `forma` es lo que permite distinguir "cambió porque lo recalculé" de "lo cambiaste vos". NULL en las huellas anteriores al 03/09: sin valor sellado no se afirma que la celda haya sido editada.';

-- ── 2. LA HUELLA DEL FORMATO, POR RANGO ──
--
-- `sheet_tab_firma.firma_formato` ya existía y es POR PESTAÑA: alcanzaba para detectar «me tocaste un
-- formato» y no para saber CUÁL, así que protegerla congelaba el mantenimiento visual entero. Acá la
-- unidad es el RANGO del request que el OS aplica: recuerda qué formato dejó en cada rango, y antes de
-- re-aplicarlo compara. Si ese rango cambió, ese request no entra; los demás sí.
create table if not exists public.sheet_huella_formato (
  file_id     text        not null,
  pestana     text        not null,
  rango_a1    text        not null,   -- "A1:B2", o "COLUMNS:1-4" para anchos, o "*" para la pestaña
  tipo        text        not null,   -- celda | merge | ancho | alto | pestana
  huella      text        not null,   -- hash del formato ENTRADO (userEnteredFormat) de ese rango
  aplicado_en timestamptz not null default now(),
  primary key (file_id, pestana, rango_a1, tipo)
);

comment on table public.sheet_huella_formato is
  'Qué formato dejó el OS en cada rango que formatea. Antes de re-aplicar un repeatCell/updateBorders/merge/ancho se lee el formato vivo y se compara: si difiere, lo cambió el dueño y no se re-aplica. La huella se sella RELEYENDO lo que quedó, nunca hasheando el request que se mandó.';

alter table public.sheet_huella_formato enable row level security;
drop policy if exists sheet_huella_formato_service on public.sheet_huella_formato;
create policy sheet_huella_formato_service
  on public.sheet_huella_formato for all to service_role using (true) with check (true);

-- ── 3. LO RESPETADO SE PUEDE MIRAR ──
--
-- Cada celda que el OS decide no pisar se registra en `sheet_reconciliacion_celda` con
-- accion='respetada' y estado='registrada'. 'registrada' y no 'activa' a propósito: una celda 'activa'
-- la RE-INYECTA el choke point sobre lo que produce el generador, y eso es otra decisión —adoptar el
-- valor del dueño como propio— que acá nadie tomó. Acá sólo queda constancia de que no se la pisó.
create index if not exists sheet_reconciliacion_celda_respetadas
  on public.sheet_reconciliacion_celda (file_id, pestana, detectado_en desc) where accion = 'respetada';
