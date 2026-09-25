-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS PAPELES COMERCIALES DE LA OBRA (cotizaciones, contratos, OC, facturas, certificados, recibos del
-- cliente) SON DE ADMINISTRACIÓN; EL JEFE SIGUE VIENDO PLANOS, SEGURIDAD Y LO TÉCNICO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 25/09/2026 con la sesión de ingenieria@ (jefe): el catálogo de Drive le devolvía 207
-- archivos, y la carpeta de cada obra es `administracion/PRESUPUESTOS - CLIENTES/<cliente>/…` — con
-- «COTIZACION INTERNA», «Cotizacion APROBADA», «CONTRATO DE OBRA…», «OC - FACTURAS/Orden de Pago»,
-- «CERTIFICADOS/Recibo 17», «Precios de Referencia». `obra_documento` le mostraba las 12 cotizaciones
-- internas, las 9 cotizaciones y las órdenes de compra vinculadas. El dueño: el jefe NUNCA ve precios
-- de venta ni Presupuestos.
--
-- `papel_comercial(ruta, nombre)` decide por el camino DENTRO de la carpeta del cliente (la raíz
-- «PRESUPUESTOS - CLIENTES» es de todas las obras y no dice nada) y por el nombre. Es una regla por
-- nombres, no por contenido: un plano que se llame «Cotización» se esconde de más, nunca de menos al
-- revés — un papel comercial con nombre neutro queda visible. Por eso los papeles NUEVOS deberían
-- clasificarse con `obra_documento.rol` (cotizacion, cotizacion_interna, orden_compra…), que se filtra
-- por rol además de por nombre.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace function public.papel_comercial(p_ruta text, p_nombre text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (regexp_replace(coalesce(p_ruta, ''), '^administracion/PRESUPUESTOS - CLIENTES/', '', 'i') || ' ' || coalesce(p_nombre, ''))
    ~* '(cotiz|presupuest|contrato|factura|certificad|orden de (pago|compra)|(^|[/ _-])oc([ /_.-]|$)|o_p_[0-9]|recibo|adicional|precio|remito|liquidaci|sueldo)'
$$;
comment on function public.papel_comercial(text, text) is
  'true si la ruta (dentro de la carpeta del cliente) o el nombre dicen cotización, presupuesto, contrato, OC, factura, '
  'certificado, recibo, adicional o precio. Lo usa la RLS de obra_papel / obra_documento y drive_file_ids_vinculados (20260926T0006).';
revoke all on function public.papel_comercial(text, text) from public, anon;
grant execute on function public.papel_comercial(text, text) to authenticated, service_role;

-- Un papel registrado en `obra_documento` no guarda su ruta: se mira en el catálogo de Drive. SECURITY DEFINER
-- porque el catálogo que ve el jefe ya viene filtrado (no vería la fila y el papel pasaría como «neutro»).
create or replace function public.drive_papel_comercial(p_drive_file_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.drive_index di
                  where di.drive_file_id = p_drive_file_id and public.papel_comercial(di.path, di.name))
$$;
revoke all on function public.drive_papel_comercial(text) from public, anon;
grant execute on function public.drive_papel_comercial(text) to authenticated, service_role;

drop policy if exists papel_comercial_solo_administracion on public.obra_papel;
create policy papel_comercial_solo_administracion on public.obra_papel as restrictive for select to authenticated
  using ((select public.ve_economia()) or not public.papel_comercial(ruta, nombre));

drop policy if exists papel_comercial_solo_administracion on public.obra_documento;
create policy papel_comercial_solo_administracion on public.obra_documento as restrictive for select to authenticated
  using ((select public.ve_economia())
         or (coalesce(rol, '') not in ('cotizacion', 'cotizacion_interna', 'orden_compra', 'resumen_recotizacion', 'contrato', 'factura', 'certificado')
             and not public.papel_comercial(null, nombre)
             and not public.drive_papel_comercial(drive_file_id)));

-- El catálogo de Drive que ve quien no es Administración: los papeles de SU legajo, los de las obras que
-- ve —sin los comerciales— y los del cliente sólo para Administración (0001).
create or replace function public.drive_file_ids_vinculados()
 returns setof text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select d.drive_file_id
    from public.documentacion_legajo d
   where d.drive_file_id is not null
     and public.mi_persona_id() is not null
     and d.persona_id = public.mi_persona_id()
  union
  select od.drive_file_id
    from public.obra_documento od
   where od.drive_file_id is not null
     and public.ve_obra(od.obra_id)
     and (public.ve_economia()
          or (coalesce(od.rol, '') not in ('cotizacion', 'cotizacion_interna', 'orden_compra', 'resumen_recotizacion', 'contrato', 'factura', 'certificado')
              and not public.papel_comercial(null, od.nombre)
              and not public.drive_papel_comercial(od.drive_file_id)))
  union
  select cd.drive_file_id
    from public.cliente_documento cd
   where cd.drive_file_id is not null
     and public.ve_economia()
  union
  select d.drive_file_id
    from public.obra_canonica o
    join public.drive_index c
      on c.drive_file_id = o.drive_carpeta_id
     and not coalesce(c.trashed, false)
    join public.drive_index d
      on not d.is_folder
     and d.path like replace(replace(c.path, '\', '\\'), '_', '\_') || '/%'
   where o.drive_carpeta_id is not null
     and public.ve_obra(o.id)
     and (public.ve_economia() or not public.papel_comercial(d.path, d.name))
$function$;
