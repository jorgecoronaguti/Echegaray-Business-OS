-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OBRAS OPERA, ADMINISTRACIÓN ADMINISTRA — Y EL TOTAL COMERCIAL NO SALE DE LA BASE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL PEDIDO, TEXTUAL (19/08/2026) ═══
--
--   *"La política anterior quedó DEMASIADO restrictiva. La diferencia principal NO es que Obras
--   tenga que trabajar a ciegas."* · *"Un usuario Obras debe poder consultar clientes, contactos,
--   personas, proveedores, certificados, compras, pedidos, herramientas, movimientos, documentos,
--   facturación/cobranzas y demás información relacionada necesaria."* · *"VER INFORMACIÓN
--   OPERATIVA ≠ ADMINISTRAR EL MAESTRO."*
--
--   Y la única línea que no se cruza: *"Un usuario Obras NO puede conocer: monto total presupuestado
--   de la obra; monto total contratado de la obra; margen calculado usando esos montos; **ningún
--   indicador/campo que permita deducir directamente ese total**."*
--
-- ═══ LO QUE ESTA MIGRACIÓN ENCONTRÓ ABIERTO, MEDIDO CON EL TOKEN DEL JEFE DE OBRA ═══
--
-- Antes de escribir una línea se le preguntó a PostgREST con el token real de `qa.jefe.obra`, que es
-- lo que puede hacer cualquiera con las devtools abiertas. Resultado:
--
--   `GET /rest/v1/presupuestos?select=monto_presupuestado,margen_esperado`
--        → 200 · 2 filas · **CON VALOR**.  ← FUGA REAL, no hipotética.
--
-- La policy decía `using (true)`. El enmascarado de la migración T0400 vivía en las VISTAS
-- `obra_panel` / `obra_plan_vs_real`, y la tabla de abajo estaba abierta de par en par. Un dato
-- protegido en la vista y libre en su tabla no está protegido: está disimulado.
--
--   `GET /rest/v1/obra_canonica?select=monto_contratado` → 200 · null.
--
-- Ese `null` NO era enmascarado: es que las ocho obras tienen el contrato sin cargar. El día que se
-- cargue el primero, esa consulta lo devuelve. Segunda fuga, latente y peor: no se habría notado.
--
-- ═══ POR QUÉ EL `CASE` DE LA VISTA NO ALCANZA, Y POR QUÉ TAMPOCO ALCANZA LA RLS ═══
--
-- La RLS decide QUÉ FILAS, nunca QUÉ COLUMNAS. Contra un dato que es una columna, una policy no
-- puede hacer nada: o la fila entera se ve o no se ve. Y la fila entera TIENE que verse — un jefe de
-- obra necesita su obra.
--
-- El instrumento que sí corta por columna es el GRANT por columna. Con una trampa que hay que decir:
-- en Supabase **todos los usuarios logueados son el mismo rol de Postgres (`authenticated`)**, así
-- que un `revoke` por columna se lo aplica también a Administración. Por eso el arreglo tiene dos
-- mitades y las dos son necesarias:
--
--   1. `authenticated` pierde SELECT sobre la columna comercial. NADIE la lee cruda. Ni el jefe de
--      obra, ni Administración, ni un script que entre por PostgREST con un token de usuario.
--   2. La vista la recupera llamando a una FUNCIÓN `security definer` que corre como su dueño y
--      pregunta `es_administracion()` antes de devolver el número.
--
-- Resultado: existe UN solo camino hacia el monto contratado —la función— y ese camino tiene el
-- portero adentro. No hay una segunda puerta que alguien pueda olvidarse de cerrar, que es
-- exactamente el defecto que se pagó en `cliente_panel` (un `create or replace view` sin repetir
-- `security_invoker` la dejó corriendo como su dueño) y en las cuatro policies `for all`.
--
-- Efecto lateral declarado: `select *` sobre `obra_canonica`, `presupuestos` y `personas` con un
-- token de usuario ahora devuelve `42501`. Se verificó que ningún archivo de `src/` hace `select('*')`
-- sobre esas tres tablas. Y el modo de falla es el bueno: falla ruidoso y cerrado, no silencioso y
-- abierto. `orq_*` y el orquestador entran como `postgres` por conexión directa y no se tocan.

-- ── 1 · LOS MAESTROS SE CONSULTAN. SE ADMINISTRAN DESDE ADMINISTRACIÓN ──────────────────────────
--
-- Cinco tablas que devolvían CERO filas a un jefe de obra: clientes, contactos, documentos del
-- cliente, personas y proveedores. Medido: `clientes → 0`, `proveedores → 0`, `personas → 400`.
-- Un jefe de obra que no puede ver de quién es la obra que dirige ni qué proveedor le entregó el
-- material no está protegido, está impedido.
--
-- La ESCRITURA no se toca: sigue siendo de Administración. Ésa es la línea "ver ≠ administrar".

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using (true);

drop policy if exists cliente_contacto_select on public.cliente_contacto;
create policy cliente_contacto_select on public.cliente_contacto for select to authenticated using (true);

drop policy if exists cliente_documento_select on public.cliente_documento;
create policy cliente_documento_select on public.cliente_documento for select to authenticated using (true);

drop policy if exists proveedores_select on public.proveedores;
create policy proveedores_select on public.proveedores for select to authenticated using (true);

-- PERSONAS: el legajo se abre, pero no entero. `retribucion_pactada` es lo que cobra cada persona, y
-- `dni`/`cuil` son su identidad fiscal. Que un jefe de obra pueda ver el sueldo de todos sus
-- compañeros no es "información necesaria para ejecutar la obra": es un dato personal con efecto
-- laboral, de un eje distinto al que el dueño abrió. Se declara la decisión en vez de tomarla en
-- silencio: **se abre el legajo operativo (nombre, categoría, especialidad, ART, obra social,
-- ingreso) y quedan afuera sueldo y documentos**. Si el dueño quiere abrirlos, es una línea.
drop policy if exists personas_select on public.personas;
create policy personas_select on public.personas for select to authenticated using (true);

-- ── 2 · CERTIFICACIÓN, FACTURACIÓN Y COBRANZA: OPERATIVAS, ACOTADAS A LA OBRA ───────────────────
--
-- *"certificados, compras, pedidos, herramientas, movimientos, documentos, facturación/cobranzas"*.
-- Se abren por obra, no en bloque: lo que se certificó en la obra que dirijo es mi trabajo; lo que
-- se certificó en las otras siete, no.
--
-- `certificados_write` era `for all`, y `for all` INCLUYE SELECT — es la quinta vez que aparece este
-- patrón en el repo. Se parte por comando para que la lectura tenga una sola definición.
drop policy if exists certificados_select on public.certificados;
create policy certificados_select on public.certificados for select to authenticated
  using (public.ve_obra(obra_canonica_id));

drop policy if exists certificados_write on public.certificados;
create policy certificados_insert on public.certificados for insert to authenticated
  with check (public.es_administracion());
create policy certificados_update on public.certificados for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
create policy certificados_delete on public.certificados for delete to authenticated
  using (public.es_administracion());

-- Adicionales y partes semanales decían `using (true)`: las ocho obras para cualquiera. Se acotan.
drop policy if exists adicionales_select on public.adicionales;
create policy adicionales_select on public.adicionales for select to authenticated
  using (public.ve_obra(obra_canonica_id));

drop policy if exists lectura_autenticados on public.actividades_semanales;
create policy actividades_semanales_select on public.actividades_semanales for select to authenticated
  using (public.ve_obra(obra_canonica_id));

-- ── 3 · EL PRESUPUESTO: LA FILA SE ACOTA Y LAS DOS COLUMNAS COMERCIALES SE CIERRAN ──────────────
--
-- Ésta era la fuga medida. La fila se acota a la obra; el monto y el margen salen del alcance de
-- `authenticated` en el paso 4.
drop policy if exists presupuestos_select on public.presupuestos;
create policy presupuestos_select on public.presupuestos for select to authenticated
  using (public.ve_obra(obra_canonica_id));

-- LAS PARTIDAS SON EL PRESUPUESTO DESARMADO: sumarlas devuelve el total. Es literalmente *"un campo
-- que permite deducir directamente ese total"*, así que la tabla entera queda en Administración. Hoy
-- tiene 0 filas: se cierra ahora, antes de que tenga contenido y el arreglo sea una migración de datos.
drop policy if exists partidas_presupuesto_select on public.partidas_presupuesto;
create policy partidas_presupuesto_select on public.partidas_presupuesto for select to authenticated
  using (public.es_administracion());

-- ── 4 · LAS COLUMNAS QUE NADIE LEE CRUDAS ───────────────────────────────────────────────────────
--
-- La lista se calcula del catálogo en vez de escribirse a mano: una columna nueva entra sola. Y lo
-- que NO entra sola es la columna secreta, que está nombrada acá y sólo acá.
--
-- El precio de que se calcule sola: una columna agregada DESPUÉS de esta migración no queda
-- concedida y se vuelve invisible. Por eso existe `vistas-security-invoker.test.mjs`, que compara
-- las columnas de la tabla contra las concedidas y se pone rojo si aparece un hueco que no sea uno
-- de los secretos declarados. Un permiso que falta sin que nadie se entere es la otra mitad del
-- mismo problema.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'obra_canonica'
     and column_name not in ('monto_contratado');
  execute 'revoke select on public.obra_canonica from authenticated';
  execute format('grant select (%s) on public.obra_canonica to authenticated', cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'presupuestos'
     and column_name not in ('monto_presupuestado', 'margen_esperado');
  execute 'revoke select on public.presupuestos from authenticated';
  execute format('grant select (%s) on public.presupuestos to authenticated', cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'personas'
     and column_name not in ('retribucion_pactada', 'dni', 'cuil');
  execute 'revoke select on public.personas from authenticated';
  execute format('grant select (%s) on public.personas to authenticated', cols);
end $$;

-- ── 5 · EL ÚNICO CAMINO AL DATO COMERCIAL, CON EL PORTERO ADENTRO ───────────────────────────────
--
-- `security definer` para que pueda leer la columna que `authenticated` ya no alcanza. `stable`
-- porque lee tablas. `search_path` fijado: sin eso, una función definer es un agujero de escalada.
create or replace function public.contratado_de_obra(p_obra text)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion()
              then (select oc.monto_contratado from public.obra_canonica oc where oc.id = p_obra) end
$$;

comment on function public.contratado_de_obra(text) is
  'El monto contratado de una obra, y NULL si quien pregunta no es Administración. Es el único '
  'camino: authenticated no tiene SELECT sobre obra_canonica.monto_contratado.';

create or replace function public.presupuesto_monto(p_presupuesto uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion()
              then (select p.monto_presupuestado from public.presupuestos p where p.id = p_presupuesto) end
$$;

create or replace function public.presupuesto_margen(p_presupuesto uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.es_administracion()
              then (select p.margen_esperado from public.presupuestos p where p.id = p_presupuesto) end
$$;

revoke execute on function public.contratado_de_obra(text) from public;
revoke execute on function public.presupuesto_monto(uuid) from public;
revoke execute on function public.presupuesto_margen(uuid) from public;
grant execute on function public.contratado_de_obra(text)  to authenticated, service_role;
grant execute on function public.presupuesto_monto(uuid)   to authenticated, service_role;
grant execute on function public.presupuesto_margen(uuid)  to authenticated, service_role;

-- ── 6 · LAS DOS VISTAS, REHECHAS ────────────────────────────────────────────────────────────────
--
-- Se hace `drop` + `create` y no `create or replace`: `replace` exige que cada columna conserve su
-- tipo EXACTO y ya obligó a un `::numeric(14,2)` cosmético la vez pasada. Peor: `create or replace`
-- que no repite `with (security_invoker = true)` **borra la opción** —así se abrió `cliente_panel` y
-- un jefe de obra vio la cartera entera—. Con `drop`+`create` la opción se escribe siempre.
--
-- QUÉ CAMBIA RESPECTO DE T0400, y por qué:
--   · `certificado`, `facturado`, `cobrado` y `pendiente_cobrar` DEJAN de estar enmascarados. El
--     dueño los nombró explícitamente como información operativa. Ninguno revela el contrato:
--     certificar $10M no dice si el contrato es de $12M o de $200M.
--   · `pendiente_certificar` SIGUE enmascarado, y es la distinción fina de todo este archivo: es
--     `contratado − certificado`. Con el certificado a la vista, publicarlo es publicar el contrato
--     con una resta. Es exactamente *"un campo que permite deducir directamente ese total"*.
--   · `monto_contratado`, `monto_presupuestado`, `margen_esperado` y `margen_actual` siguen cerrados.

-- `cliente_panel` cuelga de `obra_panel` y por eso entra en el mismo drop. Se la recrea IGUAL,
-- repitiendo `security_invoker = true` — que es exactamente la opción que un `create or replace`
-- borró el 19/08 y le mostró la cartera entera de cinco clientes a un jefe de obra.
drop view if exists public.cliente_panel;
drop view if exists public.obra_plan_vs_real;
drop view if exists public.obra_panel;

create view public.obra_panel with (security_invoker = true) as
SELECT oc.id AS obra_id,
    oc.nombre,
    oc.cliente_id,
    cl.slug AS cliente_slug,
    COALESCE(cl.nombre, oc.cliente_texto) AS cliente_nombre,
    oc.cliente_texto,
    oc.estado,
    oc.tipo,
    oc.etapa,
    oc.jefe_obra,
    oc.orden,
    public.contratado_de_obra(oc.id) AS monto_contratado,
    oc.fecha_inicio_plan,
    oc.fecha_fin_plan,
    oc.fecha_inicio_real,
    oc.fecha_fin_real,
    oc.drive_carpeta_id,
    ocr.costo_real,
    ocr.n_comprobantes,
        CASE
            WHEN public.contratado_de_obra(oc.id) > 0::numeric AND COALESCE(ocr.costo_real, 0::numeric) > 0::numeric
            THEN round((public.contratado_de_obra(oc.id) - ocr.costo_real) / public.contratado_de_obra(oc.id) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margen_sobre_contratado_pct,
    av.avance_pct,
    av.n_medidas::integer AS n_actividades_medidas,
    av.n_actividades::integer AS n_actividades,
    av.n_sin_planificar::integer AS n_actividades_sin_planificar,
    av.sincronizado_en AS avance_sincronizado_en,
    ( SELECT count(*)::integer
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text) AS restricciones_abiertas,
    ( SELECT count(*)::integer
           FROM obra_restriccion r
          WHERE r.obra_id = oc.id AND r.estado <> 'liberada'::text AND r.fecha_compromiso IS NOT NULL AND r.fecha_compromiso < CURRENT_DATE) AS restricciones_vencidas
   FROM obra_canonica oc
     LEFT JOIN clientes cl ON cl.id = oc.cliente_id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_avance av ON av.obra_id = oc.id;

comment on view public.obra_panel is
  'Una fila por obra. `monto_contratado` y el margen salen de contratado_de_obra(): NULL para quien '
  'no es Administración, y la columna cruda no está al alcance de authenticated.';

create view public.obra_plan_vs_real with (security_invoker = true) as
WITH hh AS (
         SELECT registros_hh.obra_canonica_id AS obra_id,
            sum(registros_hh.horas) AS hh_real
           FROM registros_hh
          WHERE registros_hh.obra_canonica_id IS NOT NULL
          GROUP BY registros_hh.obra_canonica_id
        ), hh_plan AS (
         SELECT obra_actividad.obra_id,
            sum(obra_actividad.hh_plan) AS hh_plan
           FROM obra_actividad
          WHERE obra_actividad.hh_plan IS NOT NULL AND NOT obra_actividad.archivada
          GROUP BY obra_actividad.obra_id
        ), pres AS (
         SELECT DISTINCT ON (presupuestos.obra_canonica_id) presupuestos.obra_canonica_id AS obra_id,
            presupuestos.id AS presupuesto_id,
            public.presupuesto_monto(presupuestos.id)  AS monto_presupuestado,
            presupuestos.costo_directo_presupuestado,
            public.presupuesto_margen(presupuestos.id) AS margen_esperado,
            presupuestos.hh_estimada
           FROM presupuestos
          WHERE presupuestos.obra_canonica_id IS NOT NULL
          ORDER BY presupuestos.obra_canonica_id, (presupuestos.estado = 'aprobado'::text) DESC, presupuestos.version DESC
        ), cert AS (
         SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado,
            sum(certificados.monto_cobrado) AS cobrado
           FROM certificados
          WHERE certificados.obra_canonica_id IS NOT NULL
          GROUP BY certificados.obra_canonica_id
        ), plazo AS (
         SELECT obra_actividad.obra_id,
            min(obra_actividad.inicio_plan) AS inicio_plan,
            max(obra_actividad.fin_plan) AS fin_plan,
            min(obra_actividad.inicio_base) AS inicio_base,
            max(obra_actividad.fin_base) AS fin_base,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.tipo <> 'resumen'::text AND obra_actividad.fin_plan IS NOT NULL AND obra_actividad.fin_plan < CURRENT_DATE AND COALESCE(obra_actividad.pct, 0::numeric) < 100::numeric) AS atrasadas,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.inicio_base IS NOT NULL) AS con_baseline
           FROM obra_actividad
          GROUP BY obra_actividad.obra_id
        )
 SELECT op.obra_id,
    op.nombre,
    op.cliente_id,
    op.cliente_nombre,
    op.estado,
    op.etapa,
    plazo.inicio_plan,
    plazo.fin_plan,
    plazo.inicio_base,
    plazo.fin_base,
        CASE
            WHEN plazo.fin_base IS NOT NULL AND plazo.fin_plan IS NOT NULL THEN plazo.fin_plan - plazo.fin_base
            ELSE NULL::integer
        END AS desvio_plazo_dias,
    plazo.atrasadas::integer AS actividades_atrasadas,
    plazo.con_baseline::integer AS actividades_con_baseline,
    op.avance_pct,
    op.n_actividades_medidas,
    op.n_actividades,
    hh_plan.hh_plan,
    pres.hh_estimada,
    hh.hh_real,
        CASE
            WHEN COALESCE(hh_plan.hh_plan, pres.hh_estimada) > 0::numeric AND hh.hh_real IS NOT NULL THEN round((hh.hh_real - COALESCE(hh_plan.hh_plan, pres.hh_estimada)) / COALESCE(hh_plan.hh_plan, pres.hh_estimada) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_hh_pct,
    pres.presupuesto_id,
    pres.monto_presupuestado,
    pres.costo_directo_presupuestado AS costo_presupuestado,
    op.costo_real,
        CASE
            WHEN pres.costo_directo_presupuestado > 0::numeric AND op.costo_real > 0::numeric THEN round((op.costo_real - pres.costo_directo_presupuestado) / pres.costo_directo_presupuestado * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_costo_pct,
    op.monto_contratado,
    pres.margen_esperado,
        CASE
            WHEN op.monto_contratado > 0::numeric AND op.costo_real > 0::numeric THEN op.monto_contratado - op.costo_real
            ELSE NULL::numeric
        END AS margen_actual,
    cert.certificado,
    cert.facturado,
    cert.cobrado,
    -- EL ÚNICO QUE SIGUE CERRADO DE ESTE BLOQUE: es `contratado − certificado`. Con el certificado a
    -- la vista, publicarlo publica el contrato con una resta de primer grado.
    CASE WHEN public.es_administracion() AND op.monto_contratado IS NOT NULL
         THEN op.monto_contratado - COALESCE(cert.certificado, 0::numeric) END AS pendiente_certificar,
    COALESCE(cert.certificado, 0::numeric) - COALESCE(cert.cobrado, 0::numeric) AS pendiente_cobrar
   FROM obra_panel op
     LEFT JOIN hh ON hh.obra_id = op.obra_id
     LEFT JOIN hh_plan ON hh_plan.obra_id = op.obra_id
     LEFT JOIN pres ON pres.obra_id = op.obra_id
     LEFT JOIN cert ON cert.obra_id = op.obra_id
     LEFT JOIN plazo ON plazo.obra_id = op.obra_id;

comment on view public.obra_plan_vs_real is
  'Plan contra real. Certificación, facturación y cobranza son operativas y se ven por obra. '
  'Contrato, presupuesto, los dos márgenes y `pendiente_certificar` sólo los ve Administración.';

grant select on public.obra_panel, public.obra_plan_vs_real to authenticated, service_role;

create view public.cliente_panel with (security_invoker = true) as
 SELECT c.id AS cliente_id,
    c.slug,
    c.nombre,
    c.cuit,
    c.direccion,
    c.telefono,
    c.email,
    c.responsable_id,
    p.nombre AS responsable_nombre,
    c.drive_carpeta_id,
    c.activo,
    c.notas,
    count(op.obra_id)::integer AS n_obras,
    count(op.obra_id) FILTER (WHERE op.estado = 'activa'::text)::integer AS n_obras_activas,
    sum(op.monto_contratado) AS contratado,
    sum(op.costo_real) AS costo_real,
    sum(op.restricciones_abiertas)::integer AS restricciones_abiertas,
    max(op.avance_sincronizado_en) AS avance_sincronizado_en,
    ( SELECT count(*)::integer FROM cliente_contacto ct WHERE ct.cliente_id = c.id) AS n_contactos,
    ( SELECT count(*)::integer FROM cliente_documento cd WHERE cd.cliente_id = c.id) AS n_documentos
   FROM clientes c
     LEFT JOIN perfiles p ON p.id = c.responsable_id
     LEFT JOIN obra_panel op ON op.cliente_id = c.id
  GROUP BY c.id, c.slug, c.nombre, c.cuit, c.direccion, c.telefono, c.email, c.responsable_id,
           p.nombre, c.drive_carpeta_id, c.activo, c.notas;

comment on view public.cliente_panel is
  'Ficha del cliente con el resumen de sus obras. `contratado` es la suma de obra_panel: para quien '
  'no es Administración esa suma es NULL, porque cada sumando lo es.';

grant select on public.cliente_panel to authenticated, service_role;
