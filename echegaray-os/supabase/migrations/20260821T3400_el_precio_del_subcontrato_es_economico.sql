-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PRECIO DEL SUBCONTRATO ES ECONÓMICO — y la implementación por fin dice lo que la 2500 declaró
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La migración 2500 escribió la intención en su propio encabezado: «el precio y los montos son
-- económicos y viven en columnas que sólo salen por la vista, que a su vez sólo abre para quien ve
-- economía». Pero implementó otra cosa: GRANT de tabla completa a `authenticated` y policy por
-- `ve_obra()` — y `ve_obra()` es verdadera para el jefe de obra en TODAS las obras. Resultado:
-- `subcontrato.precio_contratado` y `subcontrato_aporte.monto` eran legibles Y escribibles por
-- PostgREST para un rol sin permiso económico. La misma clase de defecto que la 3100 corrigió para
-- `cotizaciones`. Hoy las tablas están vacías: se corrige la estructura antes del primer dato.
--
-- El cierre es el mismo patrón de la 3000 (GRANT por columna):
--   · la tabla abre para `authenticated` SIN las columnas de plata;
--   · la plata sale sólo por `subcontrato_costo`, que deja de ser invoker y pone sus dos porteros
--     (`ve_obra` + `ve_economia`) en el WHERE — sin invoker porque con el GRANT de columna
--     revocado, una vista invoker fallaría también para Dirección;
--   · escribir el precio queda, por ahora, del lado del servicio: ninguna pantalla lo escribe
--     todavía (la pantalla 10 de subcontratos no existe aún) y cuando exista tendrá que entrar por
--     una función con portero económico, no por un PATCH a la tabla.

-- ── 1 · la tabla abre sin la plata ────────────────────────────────────────────────────────────
revoke select, insert, update on public.subcontrato from authenticated;
grant select (id, obra_id, proveedor_id, proveedor_texto, nombre, alcance, cantidad, unidad,
              moneda, fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real,
              estado, responsable_id, documentacion_ok, notas, creado_en, creado_por),
      insert (id, obra_id, proveedor_id, proveedor_texto, nombre, alcance, cantidad, unidad,
              moneda, fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real,
              estado, responsable_id, documentacion_ok, notas, creado_por),
      update (proveedor_id, proveedor_texto, nombre, alcance, cantidad, unidad,
              moneda, fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real,
              estado, responsable_id, documentacion_ok, notas)
   on public.subcontrato to authenticated;

revoke select, insert, update on public.subcontrato_aporte from authenticated;
grant select (id, subcontrato_id, tipo, descripcion, cantidad, unidad, fecha, registros_hh_id,
              creado_en, creado_por),
      insert (id, subcontrato_id, tipo, descripcion, cantidad, unidad, fecha, registros_hh_id,
              creado_por),
      update (tipo, descripcion, cantidad, unidad, fecha, registros_hh_id)
   on public.subcontrato_aporte to authenticated;

-- ── 2 · la plata sale por la vista, con sus dos porteros escritos ─────────────────────────────
-- Sin `security_invoker`: corre como su dueño para poder leer las columnas revocadas, y POR ESO
-- lleva los dos porteros en el WHERE — quien no ve economía no recibe ni una fila.
create or replace view public.subcontrato_costo with (security_invoker = false) as
select s.id as subcontrato_id,
       s.obra_id,
       s.nombre,
       s.estado,
       s.cantidad,
       s.unidad,
       s.precio_contratado,
       coalesce(s.proveedor_texto, pr.razon_social)                          as proveedor,
       coalesce(ap.aportes, 0)                                              as aportes,
       coalesce(s.precio_contratado, 0) + coalesce(ap.aportes, 0)           as costo_real,
       ap.n_aportes,
       coalesce(hh.horas, 0)                                                as hh_propias_de_apoyo,
       coalesce(ex.n_personas, 0)                                           as personas_externas,
       coalesce(ex.sin_art, 0)                                              as externas_sin_art,
       s.documentacion_ok,
       case when s.cantidad > 0 and s.precio_contratado is not null
            then round(s.precio_contratado / s.cantidad, 2) end             as precio_unitario
  from public.subcontrato s
  left join public.proveedores pr on pr.id = s.proveedor_id
  left join lateral (select sum(a.monto) as aportes, count(*)::int as n_aportes
                       from public.subcontrato_aporte a
                      where a.subcontrato_id = s.id) ap on true
  left join lateral (select sum(r.horas) as horas
                       from public.subcontrato_aporte a
                       join public.registros_hh r on r.id = a.registros_hh_id
                      where a.subcontrato_id = s.id) hh on true
  left join lateral (select count(*)::int as n_personas,
                            count(*) filter (where e.art_vigente_hasta is null
                                                or e.art_vigente_hasta < current_date)::int as sin_art
                       from public.persona_externa e
                      where e.subcontrato_id = s.id and e.activo) ex on true
 where public.ve_obra(s.obra_id)
   and public.ve_economia();

comment on view public.subcontrato_costo is
  'Costo real del paquete = contratado + aportes de ECSAS. Corre como dueño (las columnas de plata '
  'están revocadas por GRANT de columna) y por eso sus porteros van en el WHERE: ve_obra + '
  've_economia. Quien no ve economía no recibe filas — igual que cotizaciones desde la 3100.';
