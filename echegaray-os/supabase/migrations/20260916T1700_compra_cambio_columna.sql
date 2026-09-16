-- LOS PAGOS DE UNA FILA DE COMPRAS SE MARCAN EN LA APP Y VIAJAN AL SHEET POR LA COLA QUE YA EXISTE.
--
-- ═══ EL PEDIDO (dueño, 16/09/2026), TEXTUAL ═══
--
-- «tenés que replicar las funciones de pagado y montos o montos parciales que tiene la pestaña
-- Compras del Sheet Flujo de Fondos en Compras de app.ecsas.com.ar y en Proveedores […] para que las
-- pueda usar directamente en la app, esto impacte en Supabase y quede reflejado también en el Sheet;
-- y al revés también».
--
-- ═══ POR QUÉ SE EXTIENDE `compra_obra_cambio` Y NO SE CREA UNA TABLA HERMANA ═══
--
-- Es la misma decisión —y por el mismo motivo— que tomó 20260915T2210 cuando Cobranzas necesitó su
-- propia columna «Obra»: una segunda tabla con las mismas dieciocho columnas obligaría al worker a
-- repetir cada UPDATE con el nombre de tabla interpolado, y a tener dos arriendos (`tomado_at`), dos
-- reciclados de colgados y dos contadores de intentos. Con `tipo` en la misma tabla, el worker sigue
-- tomando **el cambio más viejo sea del tipo que sea** y decide por `tipo` qué bisturí planifica.
--
-- Y hay un motivo más fuerte que la prolijidad: EL ORDEN. Si la obra de la fila 806 y el pago de la
-- fila 806 viven en dos colas distintas, nada garantiza en qué orden llegan al Sheet, y las dos
-- releen la misma fila para probar su identidad. Una sola cola ordenada por `creado_at` lo resuelve
-- sin coordinación.
--
-- ═══ POR QUÉ `celdas jsonb` Y NO UNA COLUMNA `columna text` ═══
--
-- Un pago NO es una celda: son entre dos y cuatro (Monto Pagado / Monto Parcial 2, Fecha prevista de
-- pago 2, Total o Parcial, Estado, Tipo pago). Con una fila de cola por celda, el worker las
-- escribiría de a una y entre la primera y la última la fila del Sheet diría «Estado = Pagado» con
-- «Monto Pagado» todavía en cero: la fórmula `Estado pago` dibujaría «✓ Pagado» sobre una fila sin
-- plata, y el sync que corre cada 10 minutos podría fotografiar justo ese estado. Con `celdas` el
-- worker manda UN `batchUpdateValues` con todos los rangos y relee todos antes de cerrar.
--
-- ═══ LAS TRES COLUMNAS QUE NUNCA SE ESCRIBEN, Y ACÁ SE HACE ESTRUCTURAL ═══
--
--   · `Monto Parcial 1` es la fórmula `=T-O` en 716 de sus 717 celdas con contenido.
--   · `Estado pago` es el semáforo, fórmula por fila.
--   · `Saldo pendiente (OS)` es una ARRAYFORMULA anclada en la fila 4: un valor encima MATA la
--     columna entera desde ahí, y de esa columna cuelga toda la pestaña Proveedores.
--
-- El núcleo puro (`orquestador/lib/pagos-de-compra.mjs`) ya las excluye, pero un control que vive
-- sólo en el código que produce el dato no es un control. `compra_pago_rotulo_valido` las rechaza
-- desde la base: aunque la app llegara con una celda derivada, la RPC no la encola.
--
-- ═══ QUÉ NO HACE LA BASE, Y POR QUÉ ═══
--
-- NO recalcula la aritmética de los tramos. Esa cuenta —`IF(ABS(T+W-O)<1;"Pagado";…)`— es la de la
-- planilla y vive UNA vez, en `pagos-de-compra.mjs`, que es lo que la acción del servidor ejecuta.
-- Reescribirla en plpgsql sería una segunda definición del mismo concepto. Lo que la base sí hace es
-- lo que el código que produce el número no puede hacer sobre sí mismo: verificar los INVARIANTES
-- (no se paga más que el total, el estado es uno de los tres que la fórmula produce, los rótulos son
-- de entrada) y que la fila no haya cambiado desde que la pantalla la miró.
--
-- ═══ RLS ═══
-- Ninguna policy se toca. La cola sigue con RLS, SELECT para administración y escritura sólo por las
-- RPC `security definer`, que chequean `es_administracion()` adentro. Las columnas nuevas de
-- `compra_sheet` no existen: los pagos escriben columnas que ya están y ya tienen su grant.
--
-- ORDEN: única migración de este trabajo. Después, reiniciar `echegaray-compras-obra-cola.timer`.

set local lock_timeout = '5s';

-- ─── 1 · la cola sabe de qué tipo es cada cambio ────────────────────────────────────────────────
alter table public.compra_obra_cambio
  add column if not exists tipo text not null default 'obra',
  add column if not exists celdas jsonb,
  add column if not exists previo jsonb;

alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_tipo_chk;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_tipo_chk
  check (tipo in ('obra', 'pago'));

-- Un pago sin celdas no es un pago: sería una fila de cola que el worker toma y no sabe qué escribir.
alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_pago_con_celdas;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_pago_con_celdas
  check (tipo <> 'pago' or (jsonb_typeof(celdas) = 'array' and jsonb_array_length(celdas) > 0));

-- Un pago es siempre de Compras: Cobranzas no tiene tramos de pago.
alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_pago_es_compras;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_pago_es_compras
  check (tipo <> 'pago' or pestana = 'Compras');

comment on column public.compra_obra_cambio.tipo is
  'obra = una celda de la columna Obra (valor_anterior/valor_nuevo). pago = varias celdas de los tramos de pago (celdas).';
comment on column public.compra_obra_cambio.celdas is
  'Array de {rotulo, especie, valor, anterior, escribir} de orquestador/lib/pagos-de-compra.mjs. El worker no recalcula: escribe esto.';
comment on column public.compra_obra_cambio.previo is
  'Los campos de pago de compra_sheet ANTES del cambio. Es con lo que se deshace y con lo que el sync detecta un conflicto.';

create index if not exists compra_obra_cambio_pago_vivo_idx
  on public.compra_obra_cambio (fila) where tipo = 'pago' and estado in ('pendiente', 'procesando');

-- ─── 2 · qué rótulo puede escribir un pago ───────────────────────────────────────────────────────
-- LA LISTA ES CORTA Y ESTÁ ACÁ A PROPÓSITO: es el control que sobrevive a un defecto de la app.
create or replace function public.compra_pago_rotulo_valido(p_rotulo text)
returns boolean
language sql
immutable
as $$
  select btrim(coalesce(p_rotulo, '')) in (
    'Tipo pago', 'Total o Parcial', 'Monto Pagado', 'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado'
  );
$$;

comment on function public.compra_pago_rotulo_valido(text) is
  'Las seis celdas de ENTRADA de un pago. Monto Parcial 1 (=T-O), Estado pago (fórmula) y Saldo pendiente (OS) '
  '(ARRAYFORMULA anclada en la fila 4) quedan afuera: escribirlas rompe la fila o la columna entera.';

-- ─── 3 · ¿la fila sigue diciendo lo que la pantalla vio? ────────────────────────────────────────
-- Devuelve el texto de la diferencia, o null. Va ANTES de la RPC que la llama: el validador de
-- plpgsql no resuelve nombres de función, así que un orden al revés sólo fallaría en producción.
create or replace function public.compra_pago_difiere(p_fila public.compra_sheet, p_esperado jsonb)
returns text
language sql
stable
as $$
  select case
    when p_esperado is null then null
    when abs(coalesce(p_fila.monto_pagado, 0) - coalesce((p_esperado ->> 'monto_pagado')::numeric, 0)) > 0.01
      then format('«Monto Pagado» ahora dice %s', coalesce(p_fila.monto_pagado, 0))
    when abs(coalesce(p_fila.monto_parcial_2, 0) - coalesce((p_esperado ->> 'monto_parcial_2')::numeric, 0)) > 0.01
      then format('«Monto Parcial 2» ahora dice %s', coalesce(p_fila.monto_parcial_2, 0))
    when coalesce(p_fila.estado, '') is distinct from coalesce(p_esperado ->> 'estado', '')
      then format('«Estado» ahora dice «%s»', coalesce(p_fila.estado, 'vacío'))
    when coalesce(p_fila.pago_total_o_parcial, '') is distinct from coalesce(p_esperado ->> 'pago_total_o_parcial', '')
      then format('«Total o Parcial» ahora dice «%s»', coalesce(p_fila.pago_total_o_parcial, 'vacío'))
    else null
  end;
$$;

-- ─── 4 · la puerta de la app ─────────────────────────────────────────────────────────────────────
-- `p_esperado` = los campos de pago tal como la pantalla los mostraba. `p_celdas` y `p_proyeccion`
-- salen del núcleo puro. Devuelve {ok, cambio_id} o {ok:false, error}.
create or replace function public.compra_pago_registrar(
  p_fila integer, p_accion text, p_celdas jsonb, p_proyeccion jsonb, p_esperado jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f       public.compra_sheet%rowtype;
  v_c       jsonb;
  v_pagado  numeric := coalesce((p_proyeccion ->> 'monto_pagado')::numeric, 0);
  v_par2    numeric := coalesce((p_proyeccion ->> 'monto_parcial_2')::numeric, 0);
  v_estado  text    := nullif(btrim(coalesce(p_proyeccion ->> 'estado', '')), '');
  v_id      uuid;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para registrar pagos de compras');
  end if;
  if coalesce(p_accion, '') not in ('total', 'parcial', 'deshacer') then
    return jsonb_build_object('ok', false, 'error', 'acción desconocida');
  end if;
  if jsonb_typeof(p_celdas) is distinct from 'array' or jsonb_array_length(p_celdas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'el pedido no trae ninguna celda para escribir');
  end if;

  -- FOR UPDATE: dos pantallas que vieron la misma fila no pueden pasar las dos el control de `esperado`.
  select * into v_f from public.compra_sheet where fila = p_fila for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'esa fila ya no está en Compras');
  end if;
  if v_f.anulada then
    return jsonb_build_object('ok', false, 'error', 'la fila está anulada: no se le registra un pago');
  end if;

  -- LA FILA TIENE QUE SER LA QUE LA PANTALLA MIRÓ. Si el sync trajo un cambio del Sheet en el medio,
  -- pisarlo sería resolver en silencio un conflicto entre dos personas.
  if public.compra_pago_difiere(v_f, p_esperado) is not null then
    return jsonb_build_object('ok', false, 'error',
      format('el pago de la fila %s cambió mientras la mirabas: %s', p_fila, public.compra_pago_difiere(v_f, p_esperado)));
  end if;

  -- Una sola escritura en vuelo por fila: dos pagos encolados a la vez llegarían al Sheet con la
  -- segunda huella calculada sobre una fila que la primera todavía no cambió.
  if exists (select 1 from public.compra_obra_cambio
              where fila = p_fila and tipo = 'pago' and estado in ('pendiente', 'procesando')) then
    return jsonb_build_object('ok', false, 'error',
      'esta fila ya tiene un pago esperando que el Sheet lo confirme: esperá a que se aplique o deshacelo');
  end if;

  -- ═══ LOS INVARIANTES. Son de la base porque el control no se valida contra lo que él produce ═══
  if v_estado is null or v_estado not in ('Pagado', 'Pendiente', 'Revisar') then
    return jsonb_build_object('ok', false, 'error', 'el estado proyectado no es uno de los que calcula la planilla');
  end if;
  if v_pagado < 0 or v_par2 < 0 then
    return jsonb_build_object('ok', false, 'error', 'un tramo de pago no puede ser negativo');
  end if;
  if v_pagado + v_par2 > coalesce(v_f.total, 0) + 1 then
    return jsonb_build_object('ok', false, 'error',
      format('los tramos suman %s y el comprobante es de %s: no se paga más que el total', v_pagado + v_par2, v_f.total));
  end if;
  for v_c in select jsonb_array_elements(p_celdas) loop
    if not public.compra_pago_rotulo_valido(v_c ->> 'rotulo') then
      return jsonb_build_object('ok', false, 'error',
        format('«%s» no es una celda de entrada de pago: es una fórmula del Sheet y no se escribe', v_c ->> 'rotulo'));
    end if;
  end loop;

  -- ═══ EL EFECTO INMEDIATO EN LA APP ═══
  -- `estado_pago`, `monto_parcial_1` y `saldo_pendiente` son DERIVADAS: en el Sheet las calcula él.
  -- Acá se guarda la proyección para que la pantalla no muestre un saldo viejo debajo de su propio ✓;
  -- el sync siguiente las reemplaza por lo que el Sheet realmente calculó. `saldo_pendiente` sólo se
  -- toca cuando el núcleo pudo probar el flag comercial (si no, viene null y se deja la de antes).
  update public.compra_sheet set
    tipo_pago            = coalesce(p_proyeccion ->> 'tipo_pago', tipo_pago),
    pago_total_o_parcial = coalesce(p_proyeccion ->> 'pago_total_o_parcial', pago_total_o_parcial),
    monto_pagado         = v_pagado,
    monto_parcial_2      = v_par2,
    monto_parcial_1      = coalesce((p_proyeccion ->> 'monto_parcial_1')::numeric, monto_parcial_1),
    fecha_prevista_2     = coalesce((p_proyeccion ->> 'fecha_prevista_2')::date, fecha_prevista_2),
    estado               = v_estado,
    estado_pago          = coalesce(nullif(p_proyeccion ->> 'estado_pago', ''), estado_pago),
    saldo_pendiente      = coalesce((p_proyeccion ->> 'saldo_pendiente')::numeric, saldo_pendiente)
  where fila = p_fila;

  insert into public.compra_obra_cambio
    -- `valor_nuevo` lleva la ACCIÓN ('total'|'parcial'|'deshacer'): es lo que el log del worker
    -- necesita decir de un cambio cuyo contenido vive en `celdas`.
    (fila, clave, sheet_id, pestana, tipo, celdas, previo, valor_anterior, valor_nuevo, origen, pedido_por)
  values
    (p_fila, v_f.clave, v_f.sheet_id, 'Compras', 'pago', p_celdas, p_esperado,
     null, p_accion, 'app', (select auth.uid()))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'cambio_id', v_id, 'estado', v_estado);
end;
$$;

-- ─── 5 · cancelar un pago que todavía no llegó al Sheet ─────────────────────────────────────────
-- Deshacer un pago YA APLICADO es encolar el plan inverso (lo arma el núcleo puro y entra por
-- `compra_pago_registrar` con accion='deshacer'). Deshacer uno que todavía está en cola es otra cosa:
-- no hay nada que revertir en el Sheet, alcanza con cerrar el pedido y devolver la réplica a `previo`.
create or replace function public.compra_pago_cancelar(p_fila integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_p jsonb;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para cancelar pagos de compras');
  end if;
  select * into v_c from public.compra_obra_cambio
   where fila = p_fila and tipo = 'pago' and estado = 'pendiente'
   order by creado_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no hay un pago en cola para esta fila (puede que el worker ya lo haya escrito)');
  end if;
  v_p := coalesce(v_c.previo, '{}'::jsonb);
  update public.compra_sheet set
    tipo_pago            = v_p ->> 'tipo_pago',
    pago_total_o_parcial = v_p ->> 'pago_total_o_parcial',
    monto_pagado         = coalesce((v_p ->> 'monto_pagado')::numeric, 0),
    monto_parcial_2      = coalesce((v_p ->> 'monto_parcial_2')::numeric, 0),
    monto_parcial_1      = coalesce((v_p ->> 'monto_parcial_1')::numeric, monto_parcial_1),
    fecha_prevista_2     = (v_p ->> 'fecha_prevista_2')::date,
    estado               = v_p ->> 'estado',
    estado_pago          = v_p ->> 'estado_pago',
    saldo_pendiente      = coalesce((v_p ->> 'saldo_pendiente')::numeric, saldo_pendiente)
  where fila = p_fila;
  update public.compra_obra_cambio
     set estado = 'rechazado', motivo = 'cancelado desde la app antes de que el worker lo escribiera'
   where id = v_c.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.compra_pago_registrar(integer, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.compra_pago_cancelar(integer) from public, anon;
grant execute on function public.compra_pago_registrar(integer, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.compra_pago_cancelar(integer) to authenticated;

comment on function public.compra_pago_registrar(integer, text, jsonb, jsonb, jsonb) is
  'La app registra un pago (total, parcial o deshacer) de una fila de Compras: verifica invariantes y que la '
  'fila no haya cambiado, guarda la proyección en compra_sheet y encola las celdas para el Sheet.';
