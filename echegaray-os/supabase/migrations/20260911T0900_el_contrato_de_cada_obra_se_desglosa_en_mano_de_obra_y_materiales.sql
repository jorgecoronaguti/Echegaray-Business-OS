-- ═══ EL CONTRATO DE CADA OBRA SE DESGLOSA EN MANO DE OBRA Y MATERIALES ═══════════════════════════
--
-- Dueño, 11/09/2026: «te pedí monto contratado, materiales, mano de obra y avance de cobro con
-- barra de progreso» y «todo eso ya debe estar en Supabase como he solicitado». Hasta hoy el OS
-- tenía UN número por obra —`obra_economia_sheet.contratado`, lo que publica la pestaña OBRAS— y
-- los desgloses vivían sólo en los papeles: el contrato de Quattropani dice «U$S 63.000 + IVA» de
-- mano de obra y «$ 44.110.169,31» de fondo de materiales; las OC y los presupuestos de Messina y
-- San Francisco itemizan los suyos. Con un solo número, la pantalla medía el cobro de Quattropani
-- contra la mano de obra sola y publicaba «94 %» sobre un contrato que en realidad va al 65 %.
--
-- Nace `public.obra_contrato`: UNA fila por obra, los dos componentes en su moneda, y el papel del
-- que salieron (drive_file_id + cita textual). Es la realidad única del desglose: la pantalla
-- Clientes lo lee de `obra_economia_cartera`, que lo valúa en pesos con el mismo `tc_vigente()` que
-- ya valúa el contratado. NULL —nunca 0— cuando el papel no desglosa.

create table if not exists public.obra_contrato (
  obra_id             text primary key references public.obra_canonica(id) on delete cascade,
  mano_obra           numeric,
  mano_obra_moneda    text not null default 'ARS' check (mano_obra_moneda in ('ARS', 'USD')),
  materiales          numeric,
  materiales_moneda   text not null default 'ARS' check (materiales_moneda in ('ARS', 'USD')),
  -- Los importes son NETOS (sin IVA), como `contratado`. Si el papel los da con IVA, se cargan netos
  -- y se deja dicho en `nota`.
  fuente_tipo         text not null check (fuente_tipo in ('contrato', 'oc', 'presupuesto', 'cotizacion')),
  fuente_drive_id     text,
  fuente_nombre       text,
  cita                text,
  nota                text,
  cargado_en          timestamptz not null default now(),
  cargado_por         text,
  constraint obra_contrato_algo_desglosado check (mano_obra is not null or materiales is not null)
);

comment on table public.obra_contrato is
  'El desglose contractual del precio de cada obra en mano de obra y materiales, en la moneda del '
  'papel, con el documento y la cita que lo respaldan. Fuente única del desglose (11/09/2026). Los '
  'importes son netos. NULL cuando el papel no desglosa ese componente; nunca 0.';

alter table public.obra_contrato enable row level security;

drop policy if exists obra_contrato_lee_quien_ve_economia on public.obra_contrato;
create policy obra_contrato_lee_quien_ve_economia on public.obra_contrato
  for select to authenticated using ((select public.ve_economia()));

grant select on public.obra_contrato to authenticated;
grant all on public.obra_contrato to service_role;

-- ── La vista de la cartera lo valúa y lo publica ────────────────────────────────────────────────
--
-- `create or replace` con las columnas nuevas AL FINAL: Postgres lo acepta y las vistas y la RPC
-- que la leen siguen viendo las suyas en el mismo orden.

create or replace view public.obra_economia_cartera with (security_invoker = false) as
select e.obra_canonica_id,
       e.obra_clave,
       case when public.ve_economia() or auth.uid() is null
            then public.contratado_valuado(e.contratado, e.contratado_usd) end as contratado,
       case when public.ve_economia() or auth.uid() is null then e.contratado_usd end as contratado_usd,
       e.costo_mo,
       e.costo_materiales,
       case when public.ve_economia() or auth.uid() is null
            then case when e.contratado_usd is not null and public.tc_vigente() is not null
                           and e.costo_mo is not null and e.costo_materiales is not null
                      then public.contratado_valuado(e.contratado, e.contratado_usd)
                           - e.costo_mo - e.costo_materiales
                      else e.margen end end as margen,
       e.plazo_desde,
       e.plazo_hasta,
       e.origen,
       e.leido_en,
       e.referencia,
       e.nota,
       e.oc_civa_ventana,
       e.oc_civa_historico,
       e.oc_n_ventana,
       e.oc_n_historico,
       public.tc_vigente() as tipo_cambio,
       -- ═══ EL DESGLOSE DEL CONTRATO, VALUADO EN PESOS CON EL MISMO DÓLAR QUE EL CONTRATADO ═══
       case when public.ve_economia() or auth.uid() is null
            then case when c.mano_obra_moneda = 'USD'
                      then public.contratado_valuado(null, c.mano_obra) else c.mano_obra end end
         as contrato_mano_obra,
       case when public.ve_economia() or auth.uid() is null
            then case when c.mano_obra_moneda = 'USD' then c.mano_obra end end as contrato_mano_obra_usd,
       case when public.ve_economia() or auth.uid() is null
            then case when c.materiales_moneda = 'USD'
                      then public.contratado_valuado(null, c.materiales) else c.materiales end end
         as contrato_materiales,
       case when public.ve_economia() or auth.uid() is null
            then case when c.materiales_moneda = 'USD' then c.materiales end end as contrato_materiales_usd,
       -- EL TOTAL DEL CONTRATO cuando hay desglose: mano de obra + materiales, los dos en pesos de
       -- hoy. Es contra ESTO que se mide el cobro. Sin desglose, NULL: la pantalla vuelve a
       -- `contratado`, que es el precio único que publica OBRAS.
       case when public.ve_economia() or auth.uid() is null
            then case when c.obra_id is null then null
                      else coalesce(case when c.mano_obra_moneda = 'USD'
                                         then public.contratado_valuado(null, c.mano_obra) else c.mano_obra end, 0)
                         + coalesce(case when c.materiales_moneda = 'USD'
                                         then public.contratado_valuado(null, c.materiales) else c.materiales end, 0)
                 end end as contrato_total,
       c.fuente_tipo     as contrato_fuente,
       c.fuente_drive_id as contrato_fuente_drive_id,
       c.fuente_nombre   as contrato_fuente_nombre,
       c.cita            as contrato_cita
  from public.obra_economia_sheet e
  left join public.obra_contrato c on c.obra_id = e.obra_canonica_id;

comment on view public.obra_economia_cartera is
  'La economía de cada obra para las pantallas. Desde el 10/09/2026 el contratado en dólares se '
  'valúa acá con public.tc_vigente() —no en el sync— y viaja con `referencia` (el papel que lo '
  'respalda), `nota` (la discrepancia declarada contra las OC cargadas) y los dos totales de OC: '
  'la ventana del año y el histórico de la obra fusionada, que NO se suman entre sí. Desde el '
  '11/09/2026 trae además el desglose del contrato (`obra_contrato`): mano de obra y materiales '
  'valuados en pesos, su moneda de origen, el total contractual y el papel que lo respalda.';

grant select on public.obra_economia_cartera to authenticated;
grant select on public.obra_economia_cartera to service_role;

-- ── La RPC de la pantalla lo transporta ─────────────────────────────────────────────────────────

create or replace function public.pantalla_clientes()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    'clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'cliente_id', c.cliente_id, 'slug', c.slug,
                 'nombre_comercial', c.nombre_comercial, 'razon_social', c.razon_social,
                 'cuit', c.cuit, 'direccion', c.direccion, 'telefono', c.telefono,
                 'email', c.email, 'responsable_id', c.responsable_id,
                 'responsable_nombre', c.responsable_nombre, 'drive_carpeta_id', c.drive_carpeta_id,
                 'activo', c.activo, 'notas', c.notas, 'n_obras', c.n_obras,
                 'n_obras_activas', c.n_obras_activas,
                 'restricciones_abiertas', c.restricciones_abiertas,
                 'avance_sincronizado_en', c.avance_sincronizado_en,
                 'n_contactos', c.n_contactos, 'n_documentos', c.n_documentos)
               order by c.n_obras_activas desc, c.nombre_comercial asc), '[]'::jsonb)
        from public.cliente_panel c
    ),

    'obras_activas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'avance_pct', o.avance_pct,
                                  'jefe_obra', o.jefe_obra)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
    ),

    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
    ),

    'certificados', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
                                  'fecha_certificacion', t.fecha_certificacion,
                                  'fecha_facturacion', t.fecha_facturacion,
                                  'fecha_cobranza', t.fecha_cobranza)
               order by t.fecha_certificacion asc), '[]'::jsonb)
        from public.certificados t
    ),

    'papeles', (
      select coalesce(jsonb_agg(
               jsonb_build_object('id', r.id, 'cliente_id', r.cliente_id, 'obra_id', r.obra_id,
                                  'tipo', r.tipo, 'numero', r.numero, 'fecha', r.fecha,
                                  'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
                                  'nombre_archivo', r.nombre_archivo,
                                  'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.eliminado_en is null
    ),

    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  -- el desglose del contrato (11/09/2026)
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    'contratos', (
      select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
        from public.cliente_documento d
       where d.rol = 'contrato'
    ),

    'economia_clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('cliente_id', x.cliente_id, 'contratado', x.contratado,
                                  'contratado_en_curso', x.contratado_en_curso,
                                  'n_obras_en_curso', x.n_obras_en_curso,
                                  'n_obras_cerradas', x.n_obras_cerradas,
                                  'n_obras_con_precio', x.n_obras_con_precio,
                                  'n_obras_sin_precio', x.n_obras_sin_precio,
                                  'costo_real', x.costo_real, 'facturado_90d', x.facturado_90d,
                                  'cobrado_90d', x.cobrado_90d, 'cobrado_total', x.cobrado_total,
                                  'cobrado_neto_total', x.cobrado_neto_total, 'saldo', x.saldo,
                                  'vencido', x.vencido, 'por_vencer', x.por_vencer,
                                  'pendiente_contractual', x.pendiente_contractual)), '[]'::jsonb)
        from public.cliente_economia x
    )
  )
$function$;

-- ── Quattropani, leído del contrato firmado (Drive) ─────────────────────────────────────────────
--
-- `CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx` (drive 1glixkTWr5HDDKdzsniqoBJLZias5DLn9, modificado
-- 27/07/2026). Mano de obra: «U$S 63.000 + IVA», ajuste alzado. Materiales: fondo administrado de
-- «$ 44.110.169,31» (cláusula 4; la cláusula 2 lo escribe en letras como cuarenta y ocho millones
-- doscientos mil y en número como 44.110.169,31 — manda el número, que se repite, y la
-- contradicción queda dicha en `nota` para que la resuelva el dueño).

insert into public.obra_contrato
  (obra_id, mano_obra, mano_obra_moneda, materiales, materiales_moneda, fuente_tipo,
   fuente_drive_id, fuente_nombre, cita, nota, cargado_por)
values
  ('quattropani', 63000, 'USD', 44110169.31, 'ARS', 'contrato',
   '1glixkTWr5HDDKdzsniqoBJLZias5DLn9', 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx',
   'Precio de mano de obra: U$S 63.000 + IVA, ajuste alzado. Materiales: fondo administrado de $ 44.110.169,31 (cláusula 4), Anexo II.',
   'La cláusula 2 escribe el fondo en letras como «cuarenta y ocho millones doscientos mil» y en número como $ 44.110.169,31; la cláusula 4 repite 44.110.169,31 en letras y número. Se carga 44.110.169,31. Entrepiso y escalera excluidos.',
   'Claude Code · lectura del docx 11/09/2026')
on conflict (obra_id) do nothing;
