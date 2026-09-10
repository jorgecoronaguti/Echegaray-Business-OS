-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `public.cliente_economia` — CONTRATADO, FACTURADO, COBRADO Y PENDIENTE DEL CLIENTE, EN UNA VISTA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- PRP `docs/engineering/PRP-REALIDAD-UNICA.md`, conceptos 1-4 · hito H1.
--
-- ═══ LAS CINCO DEFINICIONES DE «CONTRATADO DEL CLIENTE» QUE HABÍA EL 10/09/2026 ═══
--
--   `/clientes` (TablaClientes)      Σ obra_economia_cartera de las obras ACTIVAS, sumada en el navegador
--   ficha (ListasClienteV2)          ídem, con fallback a obra_panel.monto_contratado por obra
--   panel lateral (PanelCliente)     cliente_panel.contratado = Σ obra_panel.monto_contratado (el
--                                    campo del FORMULARIO, que nadie carga: en Messina daba los
--                                    $31,8 M de las cinco obras CERRADAS)
--   esquema de pago (pantalla 32)    contratoEnCurso(): Σ economía con respaldo del formulario
--   portal (contratoDeCertificados)  `null` — «lo contratado sale de obra_panel, que el cliente no lee»
--
-- Cinco lugares que suman lo mismo de cuatro maneras. Cada uno se arregló por separado al menos una
-- vez y el siguiente volvió a nacer torcido: por eso lo que se agrega no es una pantalla más sino
-- UNA vista, y un test que pone rojo cuando alguien vuelve a leer las viejas
-- (`src/shared/definiciones/canonico-definiciones.test.ts`).
--
-- ═══ POR QUÉ EL CONTRATADO SALE DE UNA FUNCIÓN Y NO DEL CUERPO DE LA VISTA ═══
--
-- El portal del cliente NO puede leer esta vista: corre con el rol `cliente`, que no pasa
-- `ve_economia()` ni tiene policy sobre `cobranzas`. Si el «Contrato en curso» del portal se
-- calculara aparte, en un mes serían SEIS definiciones en vez de cinco.
--
-- `public.contratado_de_cliente(cliente, solo_en_curso)` es la única definición, y lleva su portero
-- ADENTRO —el mismo patrón que `contratado_de_obra()` desde 20260819T5000—: la ve Administración,
-- la ve el propio cliente sobre SU cliente_id, y a cualquier otro rol le devuelve NULL. La vista la
-- llama para la web y `cliente_economia_para_portal()` la llama para el portal. Un cambio de
-- criterio se hace una vez y aterriza en las dos caras el mismo día.
--
-- ═══ QUÉ VENTANA TIENE CADA NÚMERO (Y POR QUÉ NO SE LLAMAN TODOS IGUAL) ═══
--
-- La decisión D2 del PRP —90 días o acumulado— está ABIERTA y esta migración NO la toma: publica lo
-- que la cuenta corriente ya calcula, con la ventana escrita en el nombre. Una columna llamada
-- `facturado` a secas es exactamente el conflicto #2 del inventario: dos caras suman lo mismo
-- creyendo que hablan de la misma ventana.
--
--   `facturado_90d`, `cobrado_90d`        VENTANA de 90 días. Provisorias hasta D2.
--   `cobrado_total`, `cobrado_neto_total` ACUMULADO. Lo único restable de un contrato.
--   `vencido`, `por_vencer`, `saldo`      acumulados, sin ventana (definición de la columna U del Sheet).
--
-- `pendiente_contractual = contratado − cobrado_neto_total`, y con el NETO a propósito: el
-- contratado sale de la venta SIN IVA (`ventaViva` suma la columna de neto de Cobranzas) y
-- `cobrado_total` lleva IVA. Restar bruto de neto daría clientes que «cobraron más de lo que
-- contrataron». NULL si falta cualquiera de los dos: un cliente sin ninguna fila en Cobranzas no
-- cobró $0, no se sabe.
--
-- ═══ QUÉ OBRAS ENTRAN ═══
--
-- Las de `obra_panel`, que ya deja afuera las FUSIONADAS (20260910T1900): «BSA - Planta» y «ME - BSA»
-- son la misma obra y su contrato se contaría dos veces. `contratado` suma TODAS las no fusionadas;
-- `contratado_en_curso` sólo las `activa` — es el número que las pantallas muestran hoy y el que
-- cierra contra la suma de las filas de obra que se dibujan debajo.

-- ── 1 · LA ÚNICA DEFINICIÓN DEL CONTRATADO DE UN CLIENTE ───────────────────────────────────────
create or replace function public.contratado_de_cliente(cliente uuid, solo_en_curso boolean default false)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    -- El mismo portero que `contratado_de_obra()`, más la rama del portal: el cliente logueado ve
    -- SU contrato y ningún otro. `auth.uid() is null` es el orquestador (service_role), que no
    -- tiene rol de aplicación.
    when public.ve_economia() or auth.uid() is null or public.cliente_de_sesion() = cliente
    then (
      select sum(e.contratado)
        from public.obra_canonica oc
        join public.obra_economia_sheet e on e.obra_canonica_id = oc.id
       where oc.cliente_id = cliente
         -- Una obra absorbida en otra sumaría su contrato dos veces.
         and oc.fusionada_en is null
         and (not solo_en_curso or oc.estado = 'activa')
    )
  end
$$;

comment on function public.contratado_de_cliente(uuid, boolean) is
  'ÚNICA definición de lo CONTRATADO de un cliente: suma de obra_economia_sheet.contratado (lo que '
  'publica la pestaña OBRAS del Flujo de Caja) de sus obras NO FUSIONADAS. Con solo_en_curso, sólo '
  'las activas. NULL —nunca 0— si ninguna tiene precio en OBRAS: un cero diría que el cliente '
  'contrató nada. Lleva el portero adentro, como contratado_de_obra(): Administración, el orquestador '
  'y el PROPIO cliente del portal; cualquier otro rol recibe NULL.';

revoke all on function public.contratado_de_cliente(uuid, boolean) from public;
grant execute on function public.contratado_de_cliente(uuid, boolean) to authenticated, service_role;

-- ── 2 · LA VISTA ───────────────────────────────────────────────────────────────────────────────
--
-- `security_invoker = true`: se evalúa con los permisos de quien consulta, así que la RLS de
-- `cobranzas` (Administración) y la de `obra_canonica` siguen valiendo. Sin esto, la vista sería la
-- puerta de atrás que las saltea.
--
-- Y ADEMÁS `where ve_economia()`, como `obra_cobranza`: un jefe de obra con invoker a secas leería
-- CERO filas de cobranzas y esta vista le publicaría `cobrado 0` — un cero calculado sobre una
-- ausencia. Con el WHERE recibe cero FILAS, que es «no te corresponde», no «no cobró nada».
drop view if exists public.cliente_economia;
create view public.cliente_economia
with (security_invoker = true) as
with obras as (
  select op.cliente_id,
         op.obra_id,
         op.estado,
         op.costo_real,
         e.contratado
    from public.obra_panel op
    left join public.obra_economia_cartera e on e.obra_canonica_id = op.obra_id
   where op.cliente_id is not null
), por_cliente as (
  select cliente_id,
         count(*) filter (where estado = 'activa')::int          as n_obras_en_curso,
         count(*) filter (where estado = 'cerrada')::int         as n_obras_cerradas,
         count(*) filter (where contratado is not null)::int     as n_obras_con_precio,
         count(*) filter (where contratado is null)::int         as n_obras_sin_precio,
         -- El costo imputado de TODAS sus obras no fusionadas. Es el mismo agregado que publicaba
         -- `cliente_panel.costo_real`, que desde esta migración ya no existe.
         sum(costo_real)                                         as costo_real
    from obras
   group by cliente_id
)
select
  c.id                                        as cliente_id,
  c.slug,
  c.nombre_comercial,

  -- CONTRATADO — de la función, no del cuerpo: la misma que usa el portal.
  public.contratado_de_cliente(c.id)          as contratado,
  public.contratado_de_cliente(c.id, true)    as contratado_en_curso,

  -- Sin obras el conteo es 0 de verdad: se leyó `obra_panel` y no hay ninguna.
  coalesce(p.n_obras_en_curso, 0)             as n_obras_en_curso,
  coalesce(p.n_obras_cerradas, 0)             as n_obras_cerradas,
  coalesce(p.n_obras_con_precio, 0)           as n_obras_con_precio,
  coalesce(p.n_obras_sin_precio, 0)           as n_obras_sin_precio,
  p.costo_real,

  -- VENTANA DE 90 DÍAS · provisorias hasta la decisión D2 del PRP.
  cc.facturado_90d,
  cc.cobrado_90d,
  -- ACUMULADOS.
  cc.cobrado_total,
  cc.cobrado_neto_total,
  cc.saldo,
  cc.vencido,
  cc.por_vencer,
  cc.comprobantes_pendientes,
  cc.fondo_reparo,

  case
    when public.contratado_de_cliente(c.id) is not null and cc.cobrado_neto_total is not null
    then public.contratado_de_cliente(c.id) - cc.cobrado_neto_total
  end                                         as pendiente_contractual
from public.clientes c
left join por_cliente p                        on p.cliente_id = c.id
left join public.cliente_cuenta_corriente cc   on cc.cliente_id = c.id
where public.ve_economia();

comment on view public.cliente_economia is
  'LA ECONOMÍA DEL CLIENTE EN UNA SOLA VISTA (PRP-REALIDAD-UNICA H1): contratado (función '
  'contratado_de_cliente, sobre obra_economia_sheet, obras no fusionadas), facturado y cobrado '
  '(cliente_cuenta_corriente, sobre cobranzas con el predicado es_cobrada), vencido, por vencer y '
  'pendiente_contractual = contratado - cobrado_neto_total (neto contra neto: el contratado no lleva '
  'IVA). PROVISORIO: facturado_90d y cobrado_90d conservan la ventana de 90 días que la cuenta '
  'corriente ya usaba porque la decisión D2 del PRP (90 días vs acumulado) sigue abierta; la ventana '
  'va en el nombre para que ninguna cara la suponga. NULL nunca es 0. WHERE ve_economia(): a quien no '
  've la plata le devuelve cero filas, no ceros.';

grant select on public.cliente_economia to authenticated;
grant select on public.cliente_economia to service_role;

-- ── 3 · LA PUERTA DEL PORTAL ───────────────────────────────────────────────────────────────────
--
-- El rol `cliente` no puede leer `cliente_economia` (no pasa ve_economia() ni la policy de
-- cobranzas), y NO se le abre: lo que ve el cliente de su cobro sale de `certificado_cliente` y
-- `esquema_pago`, que ya tienen su rama `es_cliente()`. Lo único que le falta al portal es el
-- DENOMINADOR de la barra: cuánto se le contrató.
--
-- Sin parámetro y a propósito. La firma del PRP decía `cliente_economia_para_portal(cliente_id)`;
-- un `security definer` que acepta el cliente_id a mirar es una función que hay que acordarse de
-- gatear en cada llamada. Acá el cliente lo pone la SESIÓN (`cliente_de_sesion()`), así que no hay
-- parámetro que falsificar: un cliente no puede pedir el contrato de otro ni equivocándose.
create or replace function public.cliente_economia_para_portal()
returns table (contratado numeric, contratado_en_curso numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.contratado_de_cliente(public.cliente_de_sesion()),
         public.contratado_de_cliente(public.cliente_de_sesion(), true)
   where public.cliente_de_sesion() is not null
$$;

comment on function public.cliente_economia_para_portal() is
  'Lo contratado del cliente LOGUEADO en el portal, de la misma función que usa cliente_economia '
  '(contratado_de_cliente): el «Contrato en curso» de la pantalla 29 deja de ser null sin abrirle al '
  'cliente ni cobranzas ni la vista interna. Sin acceso vigente devuelve CERO filas, no una fila de '
  'nulls: «no sos cliente del portal» y «tu contrato no tiene precio cargado» son dos respuestas '
  'distintas.';

revoke all on function public.cliente_economia_para_portal() from public;
grant execute on function public.cliente_economia_para_portal() to authenticated, service_role;

-- ── 4 · `cliente_panel` PIERDE LO ECONÓMICO ────────────────────────────────────────────────────
--
-- `contratado` sumaba `obra_panel.monto_contratado` —el campo del formulario de la obra— y
-- `costo_real` sumaba `obra_panel.costo_real`. El primero es una SEGUNDA definición del contratado y
-- por eso se va: mientras la columna exista, alguien la va a leer, y el test canónico no puede
-- prohibir lo que la base sigue ofreciendo. El segundo se muda a `cliente_economia.costo_real`, que
-- es donde vive lo económico del cliente desde hoy — no se pierde, cambia de puerta.
--
-- El resto del cuerpo es idéntico al de 20260822T6230.
drop view if exists public.cliente_panel;
create view public.cliente_panel with (security_invoker = true) as
select
  c.id                                 as cliente_id,
  c.slug,
  c.nombre_comercial,
  c.razon_social,
  c.cuit,
  c.direccion,
  c.telefono,
  c.email,
  c.responsable_id,
  p.nombre                             as responsable_nombre,
  c.drive_carpeta_id,
  c.activo,
  c.notas,
  count(op.obra_id)::integer           as n_obras,
  count(op.obra_id) filter (where op.estado = 'activa')::integer as n_obras_activas,
  sum(op.restricciones_abiertas)::integer as restricciones_abiertas,
  max(op.avance_sincronizado_en)       as avance_sincronizado_en,
  (select count(*)::integer from public.cliente_contacto ct where ct.cliente_id = c.id) as n_contactos,
  (select count(*)::integer from public.cliente_documento cd where cd.cliente_id = c.id) as n_documentos
from public.clientes c
left join public.perfiles p on p.id = c.responsable_id
left join public.obra_panel op on op.cliente_id = c.id
group by c.id, c.slug, c.nombre_comercial, c.razon_social, c.cuit, c.direccion, c.telefono, c.email,
         c.responsable_id, p.nombre, c.drive_carpeta_id, c.activo, c.notas;

comment on view public.cliente_panel is
  'La ficha del cliente SIN economía: identidad, responsable, conteos y papeles. `contratado` y '
  '`costo_real` se retiraron el 10/09/2026 (PRP-REALIDAD-UNICA H1) — el primero era una segunda '
  'definición del contratado (sumaba obra_panel.monto_contratado, el campo del formulario que nadie '
  'carga) y el segundo se mudó a cliente_economia.costo_real.';

grant select on public.cliente_panel to authenticated, service_role;
