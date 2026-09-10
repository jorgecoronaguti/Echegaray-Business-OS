-- ═══ UNA CONSULTA POR PANTALLA — `/clientes` ═══════════════════════════════════════════════════
--
-- ═══ DE DÓNDE SALEN LOS SEGUNDOS ═══
--
-- Medido el 10/09/2026 (traza `PERF_TRAZA=1`, sesión de Dirección): `/clientes` hace DIEZ viajes a
-- PostgREST en una sola ola. En una base caliente cada uno cuesta 13-23 ms y la pantalla vuela; en
-- producción tarda 10 s. La diferencia no está en las consultas: está en el ARRANQUE EN FRÍO POR
-- CONEXIÓN. Un backend de Postgres que nunca tocó estas vistas anidadas paga ~800 ms cargando el
-- catálogo antes de planificar nada (commit 32969f03, `explain analyze` como `authenticated`).
--
-- Diez consultas en paralelo pueden caer en diez backends distintos del pool de PostgREST, y bajo
-- saturación varios estrenan conexión: diez arranques de ~800 ms compitiendo por la misma CPU. Por
-- eso paralelizar más EMPEORA el problema, y por eso la salida no es una consulta más rápida sino
-- UNA SOLA CONSULTA: un viaje, un backend, un arranque.
--
-- Medido en la misma corrida, en la misma ola de `/obras`: `obra_plan_vs_real` 8.313 ms,
-- `obra_economia` 7.384 ms, `comprobante_compra` 6.388 ms — las mismas vistas que solas cuestan
-- decenas de ms.
--
-- ═══ ESTA FUNCIÓN NO DEFINE NADA: TRANSPORTA ═══
--
-- LA REGLA QUE LA GOBIERNA: la RPC es un CONSUMIDOR de las vistas canónicas, nunca una segunda
-- definición. No suma, no filtra por criterio de negocio, no deriva ningún número. Devuelve LAS
-- MISMAS FILAS Y LAS MISMAS COLUMNAS que hoy piden las diez consultas de PostgREST, en un solo
-- JSON, y quien las interpreta sigue siendo el mismo código TypeScript de siempre
-- (`armarCartera`, `agruparPapeles`, `certificacionDe`…). Si mañana cambia el criterio de «lo
-- cobrado», cambia en `obra_cobranza` y acá no hay nada que tocar — que es exactamente lo que no
-- pasaría si el `sum()` estuviera escrito acá adentro.
--
-- Por eso las columnas van ENUMERADAS con `jsonb_build_object` y no con `to_jsonb(t)`: el ancho de
-- lo que viaja queda escrito, y `src/features/administracion/services/rpc-solo-lee-lo-canonico.test.ts`
-- puede leer este cuerpo y poner rojo el día que alguien meta acá `obra_panel.monto_contratado` —el
-- campo del formulario que la migración 20260910T2110 sacó de la cartera— o cualquier otra fuente
-- que el registro de definiciones prohíbe. Sin ese test, mover las lecturas a SQL sería sacarlas
-- del alcance de `canonico-definiciones.test.ts`, que es estático y no ve adentro de un `rpc()`.
--
-- ═══ SECURITY INVOKER, Y NO ES UN DETALLE ═══
--
-- Corre con los permisos de quien llama, así que la RLS y los porteros (`ve_economia()`) actúan
-- IGUAL que cuando PostgREST leía la vista directo: al jefe de obra `obra_cobranza` le devuelve
-- cero filas y `cliente_economia` también. Un `security definer` acá sería abrirle a cualquiera la
-- economía de la cartera entera detrás de un nombre que suena a optimización.
--
-- Cero filas por RLS NO es un error y no se puede confundir con uno: cada clave del JSON es `[]`
-- cuando no hay nada que ver, y la lectura entera falla —no una clave— cuando falla de verdad.

create or replace function public.pantalla_clientes()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(

    -- QUIÉN MIRA. Es la misma fila que `getPerfilActual` lee de `perfiles` por `auth.uid()`; viene
    -- acá para no gastar un viaje entero en averiguar lo que el token ya identificó. `(select …)`
    -- alrededor de `auth.uid()` la vuelve un InitPlan: se evalúa una vez, no una por fila.
    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- EL MAESTRO DE CLIENTES (`getClientes`). `cliente_panel` ya no publica economía: lo
    -- contratado y lo cobrado del cliente salen de `cliente_economia`, más abajo.
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

    -- LAS OBRAS EN EJECUCIÓN (`getObrasDeLaCartera`). SIN `monto_contratado`, igual que la consulta
    -- que reemplaza: el precio de la obra sale de `obra_economia_cartera` y de ninguna otra parte.
    'obras_activas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'avance_pct', o.avance_pct,
                                  'jefe_obra', o.jefe_obra)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
       where o.estado = 'activa'
    ),

    -- TODAS SUS OBRAS, CERRADAS INCLUIDAS (`getObrasPorCliente`): el panel lateral las dibuja, y
    -- `sinRepartir` las necesita para saber si un cobro sin obra cae en una obra bolsa cerrada.
    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
    ),

    -- LO COBRADO POR OBRA (`getCobradoPorObra`), criterio PERCIBIDO y NETO. `imputacion` dice cómo
    -- llegó el cobro a esa obra. Que esta función compile y corra ES la prueba de que la columna
    -- existe: el sondeo tolerante que la aplicación hacía en cada render —dos viajes seriales, el
    -- primero entero para cobrar un 42703— deja de tener sentido cuando la ausencia de la columna
    -- ya no se puede dar en silencio.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', k.obra_id, 'cobrado_neto', k.cobrado_neto,
                                  'imputacion', k.imputacion)), '[]'::jsonb)
        from public.obra_cobranza k
    ),

    -- LOS CERTIFICADOS DE LA CARTERA (`getCertificadosDeLaCartera`): sólo las cuatro fechas y el
    -- número. Los MONTOS no se piden — la cartera no los dibuja, y lo facturado del cliente tiene
    -- su canónica en `cliente_economia`.
    'certificados', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
                                  'fecha_certificacion', t.fecha_certificacion,
                                  'fecha_facturacion', t.fecha_facturacion,
                                  'fecha_cobranza', t.fecha_cobranza)
               order by t.fecha_certificacion asc), '[]'::jsonb)
        from public.certificados t
    ),

    -- LOS PAPELES DEL CLIENTE (`getPapelesDeLaCartera`): OC, OP, retenciones y facturas bajadas de
    -- Gmail. Sólo las vigentes: la baja es lógica.
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

    -- LO QUE OBRAS PUBLICA POR OBRA (`getEconomiaDeObras`): la canónica del precio de una obra.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'costo_mo', e.costo_mo, 'costo_materiales', e.costo_materiales,
                                  'margen', e.margen, 'origen', e.origen)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- QUIÉN TIENE EL CONTRATO CARGADO (`getContratosDeLaCartera`). Es un PAPEL, no un monto.
    'contratos', (
      select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
        from public.cliente_documento d
       where d.rol = 'contrato'
    ),

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE (`getEconomiaDeClientes`), sumado por la base. Es la
    -- fuente única: la fila del cliente no vuelve a sumar las de abajo.
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
$$;

comment on function public.pantalla_clientes() is
  'LAS DIEZ LECTURAS DE /clientes EN UN SOLO VIAJE. Transporta, no define: devuelve las mismas '
  'filas y columnas que pedían las diez consultas de PostgREST, y quien las interpreta sigue siendo '
  'armarCartera en TypeScript. security invoker: la RLS y ve_economia() recortan igual que antes — '
  'al jefe de obra cobrado_por_obra y economia_clientes le vuelven [] y la pantalla no dibuja la '
  'columna. El motivo es el arranque en frío por conexión (~800 ms de catálogo por backend nuevo), '
  'que se pagaba diez veces en paralelo y ahora se paga una.';

-- SIN GRANT, LA POLICY NO ALCANZA: una función sin `execute` devuelve «permission denied» y la
-- pantalla se ve exactamente igual que si la RPC no existiera.
revoke all on function public.pantalla_clientes() from public;
grant execute on function public.pantalla_clientes() to authenticated, service_role;

-- PostgREST cachea el esquema al arrancar: sin esto la función existe en la base y `rpc()` sigue
-- devolviendo PGRST202 hasta el próximo reinicio.
notify pgrst, 'reload schema';
