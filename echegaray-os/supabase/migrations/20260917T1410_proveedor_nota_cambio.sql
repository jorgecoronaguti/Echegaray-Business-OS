-- LA NOTA «QUÉ HACER» SE EDITA EN LA APP Y VIAJA AL SHEET POR UNA COLA — y si el Sheet cambió, gana él.
--
-- ═══ POR QUÉ UNA TABLA HERMANA Y NO `tipo = 'nota'` EN `compra_obra_cambio` ═══
--
-- 20260916T1700 extendió `compra_obra_cambio` con `tipo` para los pagos, y el motivo fuerte era el
-- ORDEN: la obra y el pago de la fila 806 releen la misma fila del Sheet y tienen que llegar en orden.
-- Una nota no comparte nada de eso: no tiene fila de Compras (la columna `fila` es NOT NULL y el
-- proveedor no tiene renglón fijo — la dinámica lo mueve), no tiene `pestana` de Compras ni Cobranzas,
-- y escribe en OTRA pestaña. Meterla ahí obligaría a relajar dos NOT NULL y un CHECK que hoy protegen
-- a los pagos.
--
-- Y hay un riesgo concreto: el worker desplegado hoy toma el pendiente más viejo SEA DEL TIPO QUE SEA
-- y todo lo que no es `pago` lo planifica como una OBRA. Si esta migración llegara antes que el código
-- nuevo, una nota encolada ahí sería interpretada como una asignación de obra. En una tabla aparte, el
-- worker viejo ni la ve.
--
-- ═══ LA BASE NO CAMBIA LA NOTA AL PEDIRLA ═══
--
-- A diferencia del pago —que proyecta en `compra_sheet` para no mostrar un saldo viejo bajo su ✓—, acá
-- `proveedor_notas` NO se toca al encolar. La decisión del dueño es que ante un conflicto gana SU
-- edición en el Sheet: si la base adelantara la nota de la app, la sonda que trae las ediciones del
-- Sheet compararía contra un texto que el Sheet nunca tuvo. La pantalla muestra el pedido como
-- «esperando al Sheet» leyendo esta cola, y la nota cambia cuando el worker la escribió y la releyó.
--
-- ═══ EL CONFLICTO SE PRUEBA DOS VECES ═══
--
--   · AL PEDIR: `p_anterior` es la nota que la pantalla mostraba. Si la base ya dice otra cosa (la
--     sonda trajo una edición del Sheet mientras se tipeaba), se rechaza con el texto actual.
--   · AL APLICAR: el worker vuelve a comparar contra la base, contra la auxiliar y contra la celda
--     visible de Proveedores (una edición del dueño que la sonda todavía no trajo). Ver
--     `orquestador/comunicacion/compras/cola-nota.mjs`.
--
-- ORDEN: después de 20260917T1400. Después, desplegar el código y reiniciar
-- `echegaray-compras-obra-cola.timer` (el mismo worker vacía las dos colas).

set local lock_timeout = '2s';

create table if not exists public.proveedor_nota_cambio (
  id                uuid primary key default gen_random_uuid(),
  -- La clave normalizada de `proveedor_notas` (claveProv: sin tildes, minúsculas, espacios colapsados).
  clave             text not null check (clave <> '' and clave = lower(clave)),
  -- La grafía de Compras que muestra la dinámica: es con la que la búsqueda de la D encuentra la nota.
  proveedor         text not null check (btrim(proveedor) <> ''),
  -- Lo que la pantalla mostraba. '' = no había nota.
  nota_anterior     text not null default '',
  -- Lo pedido. '' = borrar la nota.
  nota_nueva        text not null default '' check (char_length(nota_nueva) <= 500 and left(nota_nueva, 1) <> '='),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'procesando', 'aplicado', 'rechazado', 'error')),
  motivo            text,
  intentos          integer not null default 0,
  leido_de_vuelta   text,
  -- app = un pedido de la app. sheet = una constancia de la sonda o del pipeline: borrados que el Sheet
  -- muestra y no se aplicaron (más de dos a la vez). Se crea ya `rechazado`: no hay nada que escribir,
  -- hay algo que la app tiene que mostrar como conflicto.
  origen            text not null default 'app' check (origen in ('app', 'sheet')),
  pedido_por        uuid,
  pedido_por_nombre text,
  creado_at         timestamptz not null default now(),
  tomado_at         timestamptz,
  aplicado_at       timestamptz
);

-- UN SOLO PEDIDO VIVO POR PROVEEDOR: el segundo se compararía contra una nota que el primero todavía
-- no escribió. Es el índice el que lo impide, no un `exists` que dos pedidos simultáneos pasan juntos.
create unique index if not exists proveedor_nota_cambio_vivo_uidx
  on public.proveedor_nota_cambio (clave) where estado in ('pendiente', 'procesando');
create index if not exists proveedor_nota_cambio_cola_idx
  on public.proveedor_nota_cambio (creado_at) where estado = 'pendiente';

alter table public.proveedor_nota_cambio enable row level security;
drop policy if exists proveedor_nota_cambio_select on public.proveedor_nota_cambio;
create policy proveedor_nota_cambio_select on public.proveedor_nota_cambio
  for select to authenticated using ((select public.es_administracion()));
revoke all on public.proveedor_nota_cambio from anon;
revoke insert, update, delete, truncate on public.proveedor_nota_cambio from authenticated;
grant select on public.proveedor_nota_cambio to authenticated;

comment on table public.proveedor_nota_cambio is
  'Pedidos de la app para cambiar la nota «Qué hacer» de un proveedor, y constancias de borrados retenidos del Sheet '
  '(origen sheet). Los pedidos los consume compras-obra-cola.mjs: compara la nota vigente en la base, la D de '
  'Proveedores y la C de _PROVEEDORES_OS contra lo que la app vio, relee la A de la fila antes de escribir y, '
  'ante un conflicto, gana el Sheet.';

create or replace function public.proveedor_nota_pedir(
  p_proveedor text, p_clave text, p_nota text, p_anterior text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota     text := btrim(coalesce(p_nota, ''));
  v_anterior text := btrim(coalesce(p_anterior, ''));
  v_actual   text;
  v_id       uuid;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para editar notas de proveedores');
  end if;
  if btrim(coalesce(p_proveedor, '')) = '' or btrim(coalesce(p_clave, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'falta el proveedor');
  end if;
  if char_length(v_nota) > 500 then
    return jsonb_build_object('ok', false, 'error', 'la nota pasa de 500 caracteres');
  end if;
  -- Una nota que empieza con «=» el Sheet la tomaría como fórmula: dejaría de ser un texto del dueño.
  if left(v_nota, 1) = '=' then
    return jsonb_build_object('ok', false, 'error', 'una nota no puede empezar con «=»: el Sheet la leería como fórmula');
  end if;

  select nota into v_actual from public.proveedor_notas where clave = btrim(p_clave) for update;
  if coalesce(btrim(v_actual), '') <> v_anterior then
    return jsonb_build_object('ok', false, 'conflicto', true, 'actual', coalesce(v_actual, ''),
      'error', format('la nota cambió en el Sheet mientras la editabas; ahora dice «%s»', coalesce(v_actual, '(vacía)')));
  end if;
  if v_nota = v_anterior then
    return jsonb_build_object('ok', true, 'sin_cambio', true);
  end if;

  begin
    insert into public.proveedor_nota_cambio (clave, proveedor, nota_anterior, nota_nueva, pedido_por)
    values (btrim(p_clave), btrim(p_proveedor), v_anterior, v_nota, (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'este proveedor ya tiene una nota esperando que el Sheet la confirme');
  end;
  return jsonb_build_object('ok', true, 'cambio_id', v_id);
end;
$$;

revoke all on function public.proveedor_nota_pedir(text, text, text, text) from public, anon;
grant execute on function public.proveedor_nota_pedir(text, text, text, text) to authenticated;

comment on function public.proveedor_nota_pedir(text, text, text, text) is
  'La app pide cambiar la nota «Qué hacer» de un proveedor. Rechaza si la base ya no dice lo que la pantalla '
  'mostraba (gana el Sheet) y encola en proveedor_nota_cambio. No toca proveedor_notas.';

do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'proveedor_nota_cambio'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    execute format('drop trigger if exists zz_avisar_insert on public.%I', t);
    execute format('drop trigger if exists zz_avisar_update on public.%I', t);
    execute format('drop trigger if exists zz_avisar_delete on public.%I', t);
    execute format(
      'create trigger zz_avisar_insert after insert on public.%I referencing new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_update after update on public.%I referencing old table as viejas new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_delete after delete on public.%I referencing old table as viejas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
  end loop;
end;
$do$;
