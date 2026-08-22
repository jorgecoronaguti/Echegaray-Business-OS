-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CASCADA COMERCIAL ES LA DEL LIBRO — con sus bases, su orden y sus parámetros versionados
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `cotizacion_cascada` calculaba una cascada RAZONABLE Y DISTINTA de la que la empresa usa para
-- ofertar. La del OS: indirectos y GG sobre el costo directo, margen y financiero sobre el costo
-- total, impuestos sobre el subtotal. La del XLSM `Planilla para Cotizar (2).xlsm`, hoja
-- `Presupuesto`, bloque `B62:H89`, leída fórmula por fórmula:
--
--     COSTO DIRECTO
--   + GASTOS GENERALES  27 %   sobre el costo directo          → COSTO INDUSTRIAL
--   + BENEFICIO         22 %   sobre el COSTO INDUSTRIAL
--   + FINANCIERO      7 % × 0,5 sobre el COSTO INDUSTRIAL       (no incluye el beneficio, medio período)
--   + IIBB + LOTE HOGAR 2,4 %  sobre INDUSTRIAL + BENEFICIO
--   + GANANCIAS          2 %   sobre INDUSTRIAL + BENEFICIO
--   = SUBTOTAL
--   + IMPUESTO AL CHEQUE 1,2 % sobre el SUBTOTAL acumulado
--   = VENTA SIN IVA            coeficiente 1,68197
--   + IVA               21 %   sobre la venta sin IVA
--   = VENTA FINAL              coeficiente 2,03518
--
-- Los porcentajes NO se suman linealmente (27+22+3,5+2,4+2+1,2 = 58,1 % daría 1,581) porque hay
-- TRES BASES distintas y dos composiciones en cascada. Forma cerrada, demostrada:
--
--     coef_sin_IVA = (1+gg) × [ (1+ben) × (1+iibb+gan) + fin×factor ] × (1+cheque)
--
-- La diferencia con lo que el OS publicaba no es de estilo: el coeficiente real de la empresa es
-- **1,682 sin IVA** y el default que ofrecía la pantalla daba **1,4287**. Cotizar con el segundo es
-- regalar 18 puntos de precio en cada oferta.
--
-- ═══ EL 12/6/17/0/3,5 ERA UN `defaultValue` DE REACT ═══
--
-- Los porcentajes vivían con `DEFAULT 0` en la tabla y los valores «de la empresa» estaban tipeados
-- en `CamposPresupuesto.tsx:20`. Una decisión empresarial no puede vivir en un componente de
-- pantalla: no tiene historial, no se puede consultar desde el chat, y cambia cuando alguien edita
-- un archivo `.tsx`. Ahora viven en `parametro_comercial`, versionados, con fuente y con vigencia.
--
-- ═══ EL SEED NO ES INVENTAR ═══
--
-- Los ocho valores de la versión 1 son los que están tipeados en el libro con el que la empresa
-- cotiza hoy, verificados por réplica ejecutable: 6 de 6 casos con diferencia $0,00 contra los
-- valores cacheados del XLSM. Es el estándar VIGENTE DEMOSTRADO, no un supuesto — y queda
-- versionado y editable, que es lo que lo distingue de un número tipeado en el front.
--
-- Lo único NORMATIVO de la cascada es el IVA. Los otros siete son DECISIÓN EMPRESARIAL. Y una
-- advertencia que viaja con el dato: el 2,4 % de IIBB + Lote Hogar está tipeado en el libro y NO se
-- verificó contra la DGR de San Juan — la fuente lo dice y no se disimula.
--
-- ═══ BENEFICIO ES MARKUP SOBRE COSTO, NO MARGEN SOBRE PRECIO ═══
--
-- El 22 % se aplica SOBRE EL COSTO INDUSTRIAL. El margen resultante sobre el precio de venta es
-- otro número y más chico. La vista publica los dos y los llama distinto a propósito: confundirlos
-- es el error más caro de una presupuestación.

-- ── 1 · los parámetros comerciales, versionados ───────────────────────────────────────────────
create table if not exists public.parametro_comercial (
  id                   uuid primary key default gen_random_uuid(),
  version              int  not null,
  vigente              boolean not null default false,
  vigencia_desde       date not null default current_date,
  vigencia_hasta       date,
  pct_gastos_generales numeric not null check (pct_gastos_generales >= 0),
  pct_beneficio        numeric not null check (pct_beneficio        >= 0),
  pct_financiero       numeric not null check (pct_financiero       >= 0),
  factor_financiero    numeric not null check (factor_financiero    >= 0),
  pct_iibb             numeric not null check (pct_iibb             >= 0),
  pct_ganancias        numeric not null check (pct_ganancias        >= 0),
  pct_cheque           numeric not null check (pct_cheque           >= 0),
  pct_iva              numeric not null check (pct_iva              >= 0),
  fuente               text not null,
  notas                text,
  creado_en            timestamptz not null default now(),
  creado_por           uuid default auth.uid(),
  constraint parametro_comercial_version_unica unique (version),
  constraint parametro_comercial_vigencia_coherente check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

create unique index if not exists parametro_comercial_uno_vigente
  on public.parametro_comercial (vigente) where vigente;

comment on table public.parametro_comercial is
  'Los ocho porcentajes de la cascada comercial, versionados con fuente y vigencia. Siete son '
  'DECISIÓN EMPRESARIAL y uno —el IVA— es normativo. Vivían como defaultValue de un componente de '
  'React: sin historial, invisibles para el chat, y editables por quien tocara el .tsx. '
  'ESTA TABLA ES EL PISO, NO EL TECHO: se confirmó contra «Horas Hombre.xlsm» —un fork más nuevo de '
  'la misma planilla— que los mismos ocho porcentajes se deciden POR OBRA (una obra cotizó con GG '
  '15 % · financiero 3 %×0,5 · IIBB 1,2 % · Ganancias 1 %, coeficiente 1,7769; ORICA con 27 · 7×0,5 '
  '· 2,4 · 2, coeficiente 2,0352). Por eso cada cotización COPIA los ocho a columnas propias en vez '
  'de referenciar la versión: la obra que negocia distinto no necesita una versión nueva del '
  'parámetro, y la que no negocia nada arranca del vigente.';
comment on column public.parametro_comercial.factor_financiero is
  'Qué fracción del período se financia. 0,5 = medio período, que es lo que el libro asume. El costo '
  'financiero es pct_financiero × factor_financiero sobre el costo industrial.';
comment on column public.parametro_comercial.pct_beneficio is
  'MARKUP sobre el costo industrial, NO margen sobre el precio. Un 22 % acá no es un 22 % de margen: '
  'la vista publica margen_sobre_precio_pct aparte y siempre da menos.';

insert into public.parametro_comercial
    (version, vigente, vigencia_desde, pct_gastos_generales, pct_beneficio, pct_financiero,
     factor_financiero, pct_iibb, pct_ganancias, pct_cheque, pct_iva, fuente, notas)
select 1, true, current_date, 0.27, 0.22, 0.07, 0.5, 0.024, 0.02, 0.012, 0.21,
       'Planilla para Cotizar (2).xlsm · hoja Presupuesto B62:H89 · reverse-engineering 21/08/2026',
       'Coeficiente 1,68197 sin IVA · 2,03518 con IVA, verificado con réplica ejecutable (6/6 casos, '
       'diferencia $0,00 contra los valores cacheados del libro). El 27 % de GG es el redondeo a mano '
       'del 26,98 % que calcula la hoja GG. El 2,4 % de IIBB + Lote Hogar está TIPEADO en el libro y '
       'NO se verificó contra la DGR de San Juan. El 2 % de Ganancias es un proxy de costeo, no la '
       'alícuota. El IVA al 21 % es lo único normativo de la lista.'
 where not exists (select 1 from public.parametro_comercial);

-- ── 2 · el presupuesto lleva los ocho, y de qué versión salieron ──────────────────────────────
-- La cascada vieja tenía CINCO porcentajes con otras bases. Se retiran: dejarlos conviviendo daría
-- dos definiciones del precio en la misma fila y, como los dos juegos son plausibles, la fila no
-- diría cuál se usó. `cotizaciones` tiene 0 filas — no hay dato que migrar.
drop view if exists public.cotizacion_cascada;

alter table public.cotizaciones drop column if exists pct_indirectos;
alter table public.cotizaciones drop column if exists pct_gastos_generales;
alter table public.cotizaciones drop column if exists pct_margen;
alter table public.cotizaciones drop column if exists pct_financiero;
alter table public.cotizaciones drop column if exists pct_impuestos;

alter table public.cotizaciones add column if not exists pct_gastos_generales numeric check (pct_gastos_generales is null or pct_gastos_generales >= 0);
alter table public.cotizaciones add column if not exists pct_beneficio        numeric check (pct_beneficio        is null or pct_beneficio        >= 0);
alter table public.cotizaciones add column if not exists pct_financiero       numeric check (pct_financiero       is null or pct_financiero       >= 0);
alter table public.cotizaciones add column if not exists factor_financiero    numeric check (factor_financiero    is null or factor_financiero    >= 0);
alter table public.cotizaciones add column if not exists pct_iibb             numeric check (pct_iibb             is null or pct_iibb             >= 0);
alter table public.cotizaciones add column if not exists pct_ganancias        numeric check (pct_ganancias        is null or pct_ganancias        >= 0);
alter table public.cotizaciones add column if not exists pct_cheque           numeric check (pct_cheque           is null or pct_cheque           >= 0);
alter table public.cotizaciones add column if not exists pct_iva              numeric check (pct_iva              is null or pct_iva              >= 0);
alter table public.cotizaciones add column if not exists parametro_comercial_id uuid
  references public.parametro_comercial (id) on delete set null;

comment on column public.cotizaciones.parametro_comercial_id is
  'De qué versión de los parámetros comerciales se copiaron los ocho porcentajes al crear el '
  'presupuesto. Se COPIAN y no se referencian: si mañana la empresa sube el beneficio al 25 %, la '
  'oferta de hoy tiene que seguir diciendo 22 %. La referencia queda para saber de dónde salieron.';
comment on column public.cotizaciones.pct_iva is
  'Lo único normativo de la cascada. Los otros siete son decisión empresarial y por eso viven en '
  'parametro_comercial, versionados con fuente.';

-- ── 3 · la cascada, con la matemática del libro ───────────────────────────────────────────────
-- Cada escalón tiene NOMBRE y BASE propia. No hay ningún porcentaje aplicado sobre una base que no
-- sea la suya, que es el error que subestima el precio y del que la propia base del OS era ejemplo.
--
-- El OS calcula LIMPIO: el libro redondea seis celdas con `ROUNDUP(x;1)` —siempre a favor del
-- precio— y trabaja con `fullPrecision="0"`. La diferencia acumulada medida sobre la obra ORICA es
-- de $0,34 sobre $187.415.653,40. No se emulan esos redondeos de pantalla: son un artefacto del
-- Excel, no una decisión de la empresa.
create view public.cotizacion_cascada with (security_invoker = true) as
with base as (
  select c.id, c.numero, c.version, c.vigente, c.estado, c.cliente, c.cliente_id, c.obra_nombre,
         c.obra_canonica_id, c.fecha_cotizacion, c.congelada_en, c.convertida_obra_id,
         c.parametro_comercial_id,
         coalesce(c.pct_gastos_generales, 0) as pct_gastos_generales,
         coalesce(c.pct_beneficio,        0) as pct_beneficio,
         coalesce(c.pct_financiero,       0) as pct_financiero,
         coalesce(c.factor_financiero,    0) as factor_financiero,
         coalesce(c.pct_iibb,             0) as pct_iibb,
         coalesce(c.pct_ganancias,        0) as pct_ganancias,
         coalesce(c.pct_cheque,           0) as pct_cheque,
         coalesce(c.pct_iva,              0) as pct_iva,
         coalesce(sum(v.subtotal), 0)                            as costo_directo,
         coalesce(sum(v.hh), 0)                                  as hh_previstas,
         count(v.partida_id)::int                                as n_partidas,
         count(*) filter (where v.sin_analisis)::int              as n_sin_analisis,
         count(*) filter (where v.cantidad is null)::int          as n_sin_computo,
         count(*) filter (where v.sin_precio_de_subcontrato)::int as n_sin_precio_subcontrato
    from public.cotizaciones c
    left join public.cotizacion_partida_valorizada v on v.cotizacion_id = c.id
   group by c.id, c.numero, c.version, c.vigente, c.estado, c.cliente, c.cliente_id, c.obra_nombre,
            c.obra_canonica_id, c.fecha_cotizacion, c.congelada_en, c.convertida_obra_id,
            c.parametro_comercial_id, c.pct_gastos_generales, c.pct_beneficio, c.pct_financiero,
            c.factor_financiero, c.pct_iibb, c.pct_ganancias, c.pct_cheque, c.pct_iva
), industrial as (
  select b.*,
         b.costo_directo * b.pct_gastos_generales                as gastos_generales,
         b.costo_directo * (1 + b.pct_gastos_generales)          as costo_industrial
    from base b
), con_beneficio as (
  select i.*,
         i.costo_industrial * i.pct_beneficio                                 as beneficio,
         i.costo_industrial * i.pct_financiero * i.factor_financiero          as financiero,
         i.costo_industrial * (1 + i.pct_beneficio)                           as base_impuestos
    from industrial i
), con_impuestos as (
  select cb.*,
         cb.base_impuestos * cb.pct_iibb                                      as iibb,
         cb.base_impuestos * cb.pct_ganancias                                 as ganancias,
         cb.base_impuestos * (1 + cb.pct_iibb + cb.pct_ganancias) + cb.financiero as subtotal
    from con_beneficio cb
), con_cheque as (
  select ci.*,
         ci.subtotal * ci.pct_cheque                                          as impuesto_cheque,
         ci.subtotal * (1 + ci.pct_cheque)                                    as venta_sin_iva
    from con_impuestos ci
)
select cc.id, cc.numero, cc.version, cc.vigente, cc.estado, cc.cliente, cc.cliente_id,
       cc.obra_nombre, cc.obra_canonica_id, cc.fecha_cotizacion, cc.congelada_en,
       cc.convertida_obra_id, cc.parametro_comercial_id,
       cc.pct_gastos_generales, cc.pct_beneficio, cc.pct_financiero, cc.factor_financiero,
       cc.pct_iibb, cc.pct_ganancias, cc.pct_cheque, cc.pct_iva,
       cc.costo_directo, cc.hh_previstas, cc.n_partidas, cc.n_sin_analisis, cc.n_sin_computo,
       cc.n_sin_precio_subcontrato,
       cc.gastos_generales,
       cc.costo_industrial,
       cc.beneficio,
       cc.financiero,
       cc.iibb,
       cc.ganancias,
       cc.subtotal,
       cc.impuesto_cheque,
       cc.venta_sin_iva,
       cc.venta_sin_iva * cc.pct_iva                                          as iva,
       cc.venta_sin_iva * (1 + cc.pct_iva)                                    as venta_final,
       -- `precio_venta` es el nombre con el que la cartera y la lista ya leen el precio ofertado.
       -- Es la VENTA SIN IVA: el IVA no es precio de la empresa, es plata de terceros que pasa.
       cc.venta_sin_iva                                                       as precio_venta,
       case when cc.costo_directo > 0 then round(cc.venta_sin_iva / cc.costo_directo, 6) end
                                                                              as coeficiente_sin_iva,
       case when cc.costo_directo > 0 then round(cc.venta_sin_iva * (1 + cc.pct_iva) / cc.costo_directo, 6) end
                                                                              as coeficiente_con_iva,
       -- MARGEN sobre precio, que NO es el beneficio: el beneficio es markup sobre costo.
       case when cc.venta_sin_iva > 0
            then round(cc.beneficio / cc.venta_sin_iva * 100, 2) end          as margen_sobre_precio_pct
  from con_cheque cc;

comment on view public.cotizacion_cascada is
  'La cascada comercial REAL de la empresa, con el orden y las bases del libro con el que se '
  'cotiza: GG sobre costo directo → COSTO INDUSTRIAL → beneficio y financiero sobre el industrial → '
  'IIBB y Ganancias sobre industrial+beneficio → SUBTOTAL → impuesto al cheque sobre el subtotal → '
  'VENTA SIN IVA → IVA → VENTA FINAL. Cada escalón tiene su nombre y su base; ninguno se aplica '
  'sobre una base que no le corresponde. El coeficiente que publica (1,682 sin IVA con los '
  'parámetros vigentes) es el de la empresa, no el 1,4287 que ofrecía el formulario.';

-- ── 4 · la versión nueva se lleva los ocho ────────────────────────────────────────────────────
create or replace function public.nueva_version_de_presupuesto(p_cotizacion_id uuid, p_motivo text default null)
returns uuid language plpgsql security invoker as $$
declare v_nueva uuid; v_vieja record;
begin
  if not public.ve_economia() then
    raise exception 'crear una versión de un presupuesto exige permiso económico';
  end if;
  select * into v_vieja from public.cotizaciones where id = p_cotizacion_id;
  if not found then raise exception 'el presupuesto % no existe', p_cotizacion_id; end if;

  update public.cotizaciones set vigente = false where id = p_cotizacion_id;

  insert into public.cotizaciones
      (cliente, obra_nombre, obra_canonica_id, monto_venta, costo_estimado, margen_pct,
       fecha_cotizacion, estado, notas, origen, numero, version, vigente, cliente_id,
       pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
       pct_iibb, pct_ganancias, pct_cheque, pct_iva, parametro_comercial_id)
  values (v_vieja.cliente, v_vieja.obra_nombre, v_vieja.obra_canonica_id, v_vieja.monto_venta,
          v_vieja.costo_estimado, v_vieja.margen_pct, current_date, 'borrador',
          coalesce(p_motivo, v_vieja.notas), v_vieja.origen, v_vieja.numero, v_vieja.version + 1,
          true, v_vieja.cliente_id,
          v_vieja.pct_gastos_generales, v_vieja.pct_beneficio, v_vieja.pct_financiero,
          v_vieja.factor_financiero, v_vieja.pct_iibb, v_vieja.pct_ganancias, v_vieja.pct_cheque,
          v_vieja.pct_iva, v_vieja.parametro_comercial_id)
  returning id into v_nueva;

  insert into public.cotizacion_partida
      (cotizacion_id, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id,
       analisis_id, metodo_medicion, subcontratada, precio_subcontrato, nota)
  select v_nueva, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id,
         analisis_id, metodo_medicion, subcontratada, precio_subcontrato, nota
    from public.cotizacion_partida where cotizacion_id = p_cotizacion_id;

  return v_nueva;
end $$;

comment on function public.nueva_version_de_presupuesto(uuid, text) is
  'Apaga la versión vigente, crea la siguiente en borrador y le copia las partidas y los OCHO '
  'porcentajes de la cascada — todo en una transacción. NO copia el costo congelado: la versión '
  'nueva se valoriza viva contra la base maestra de hoy.';

-- ── 5 · permisos ──────────────────────────────────────────────────────────────────────────────
-- Los parámetros comerciales son el beneficio de la empresa: son ECONÓMICOS de punta a punta.
alter table public.parametro_comercial enable row level security;

drop policy if exists parametro_comercial_economia on public.parametro_comercial;
create policy parametro_comercial_economia on public.parametro_comercial for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update, delete on public.parametro_comercial to authenticated;
grant all on public.parametro_comercial to service_role;
grant select on public.cotizacion_cascada to authenticated;
grant select on public.cotizacion_cascada to service_role;
grant execute on function public.nueva_version_de_presupuesto(uuid, text) to authenticated;
