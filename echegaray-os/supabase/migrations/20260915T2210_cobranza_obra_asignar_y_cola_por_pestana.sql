-- LA PUERTA DE ESCRITURA DE LA COLUMNA «Obra» DE COBRANZAS (H), Y UNA SOLA COLA PARA LAS DOS PESTAÑAS.
--
-- ═══ POR QUÉ (dueño, 15/09/2026: «completalas como corresponde») ═══
--
-- El relleno de la columna Obra (Compras L · Cobranzas H) se escribe fila por fila por la MISMA puerta
-- que usa la app: la RPC valida el rótulo contra el catálogo, guarda en la réplica y encola; el worker
-- (`comunicacion/compras/cola-obra.mjs`) escribe UNA celda del Sheet y la relee. Compras ya tenía esa
-- puerta (`compra_obra_asignar`, 20260915T0700). Cobranzas no tenía ninguna: esta migración le da la
-- suya, espejo de la de Compras.
--
-- ═══ UNA COLA, NO DOS ═══
--
-- `compra_obra_cambio` gana la columna `pestana` ('Compras' | 'Cobranzas'). Una segunda tabla con las
-- mismas dieciséis columnas obligaría al worker a repetir cada UPDATE con el nombre de tabla
-- interpolado; con la columna, el worker toma el cambio más viejo sea de la pestaña que sea y decide
-- por `pestana` qué encabezado leer y qué huella comparar. Las filas viejas quedan como 'Compras'.
--
-- ═══ LA HUELLA DE UNA FILA DE COBRANZAS ═══
--
-- El ID de Cobranzas también es una posición (`=IF(C5="";"";ROW()-4)`), y 51 de las 90 filas de 2026 no
-- tienen N° de comprobante: la huella no puede ser sólo ese número. `clave` guarda
-- «comprobante|Obra / Cliente|total» tal como lo arma `huellaDeCobranza` en
-- `lib/bisturi-cobranzas-obra.mjs`; el worker relee las tres celdas y compara. El total es el nativo
-- de la fila (`total_bruto_origen`): `total_bruto` puede estar valuado a pesos y la celda dice dólares.
--
-- ═══ «Sin obra – SAN FRANCISCO» ═══
--
-- El desplegable real ofrece el cliente CANÓNICO en mayúsculas y `obra_celda_resolver` comparaba contra
-- `cliente_texto` crudo: 20260915T2200_sin_obra_cliente_sin_mayusculas.sql (main, ya aplicada) lo
-- resuelve sin distinguir mayúsculas. Esta migración NO redefine el resolver: una sola definición.
-- El espejo JS (`validarValorDeObra`, que usa el worker) aplica la misma regla desde este commit.
--
-- ═══ RLS ═══
-- Ninguna policy se toca. La cola sigue con RLS y sólo SELECT para administración; la inserción es de
-- la RPC (`security definer`) que chequea `es_administracion()` adentro.

set local lock_timeout = '5s';

-- ─── 1 · la cola sabe de qué pestaña es cada cambio ─────────────────────────────────────────────
alter table public.compra_obra_cambio
  add column if not exists pestana text not null default 'Compras';
alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_pestana_chk;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_pestana_chk
  check (pestana in ('Compras', 'Cobranzas'));
comment on column public.compra_obra_cambio.pestana is
  'Compras (fila de compra_sheet, clave = clave del comprobante) o Cobranzas (fila = sheet_id + 4, clave = «comprobante|cliente|total»).';

-- ─── 2 · la puerta de Cobranzas ──────────────────────────────────────────────────────────────────
-- `p_fila` es la fila FÍSICA de la pestaña (datos desde la 5): `public.cobranzas` no guarda la fila,
-- guarda `sheet_id` = ROW()-4 como texto. Misma firma que `compra_obra_asignar` para que el relleno y
-- la app las llamen igual.
create or replace function public.cobranza_obra_asignar(p_fila integer, p_valor text, p_esperado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila    record;
  v_valor   text := nullif(btrim(coalesce(p_valor, '')), '');
  v_res     jsonb;
  v_clave   text;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para imputar cobranzas');
  end if;
  if p_fila is null or p_fila < 5 then
    return jsonb_build_object('ok', false, 'error', format('la fila %s no es un renglón de datos de Cobranzas (empiezan en la 5)', p_fila));
  end if;
  -- FOR UPDATE: dos pantallas que vieron la misma celda no pueden pasar las dos el control de `esperado`.
  select sheet_id, numero_comprobante, obra_cliente, coalesce(total_bruto_origen, total_bruto) as total, obra_celda
    into v_fila
    from public.cobranzas where sheet_id = (p_fila - 4)::text for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'esa fila ya no está en Cobranzas');
  end if;
  if coalesce(v_fila.obra_celda, '') is distinct from coalesce(nullif(btrim(p_esperado), ''), '') then
    return jsonb_build_object('ok', false, 'error',
      format('la obra de la fila %s cambió mientras la mirabas: ahora dice «%s»', p_fila, coalesce(v_fila.obra_celda, 'vacía')));
  end if;
  v_res := public.obra_celda_resolver(v_valor);
  if v_res ? 'error' then
    return jsonb_build_object('ok', false, 'error', v_res ->> 'error');
  end if;

  update public.cobranzas
     set destino = v_res ->> 'destino', obra_id = v_res ->> 'obra_id', obra_celda = v_valor
   where sheet_id = (p_fila - 4)::text;
  -- La huella, con la MISMA forma que `huellaDeCobranza` (lib/bisturi-cobranzas-obra.mjs).
  v_clave := concat_ws('|', coalesce(btrim(v_fila.numero_comprobante), ''), coalesce(btrim(v_fila.obra_cliente), ''),
                       coalesce(round(v_fila.total)::text, ''));
  insert into public.compra_obra_cambio (pestana, fila, clave, sheet_id, valor_anterior, valor_nuevo, origen, pedido_por)
  values ('Cobranzas', p_fila, v_clave, p_fila - 4, v_fila.obra_celda, v_valor, 'app', (select auth.uid()));
  return jsonb_build_object('ok', true, 'destino', v_res ->> 'destino', 'obra_id', v_res ->> 'obra_id');
end;
$$;

revoke all on function public.cobranza_obra_asignar(integer, text, text) from public, anon;
grant execute on function public.cobranza_obra_asignar(integer, text, text) to authenticated;

comment on function public.cobranza_obra_asignar(integer, text, text) is
  'La app (o el relleno) imputa la obra de una fila de Cobranzas: guarda en cobranzas y encola la escritura '
  'de la columna Obra (H) en compra_obra_cambio con pestana = Cobranzas. `p_esperado` = lo que se mostraba; si cambió, no se pisa.';
