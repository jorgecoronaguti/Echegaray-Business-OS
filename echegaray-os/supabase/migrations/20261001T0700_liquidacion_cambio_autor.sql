-- LIQUIDACIÓN DE HORAS · EL LOG DICE QUIÉN, CUÁNDO Y CÓMO (dueño, 01/10/2026)
--
-- Textual, sobre el punto ámbar: «eso está mal porque no buscaste en el log, ahí debe salir quién cuándo y cómo».
--
-- ═══ QUÉ FALTABA ═══
--
-- `liquidacion_cambio` ya trae antes, después, cuenta, autor y momento (20261001T0200). Le faltaba el CÓMO: de qué
-- camino vino la escritura. Sin eso, un `autor` nulo no se distingue de «escribió el chat» o «escribió una
-- sincronización», y la pantalla sólo podía decir «sin autor registrado». Se agrega `origen`, que el trigger deduce de
-- lo que ve en la misma escritura, sin pedirle nada nuevo a ningún camino:
--
--   pago       cambió `pagada_en`: la marca «pagada» o su deshacer.
--   celda      cambió el sello `escribio_en`: el usuario tecleó la celda en la pantalla.
--   sesion     hubo `auth.uid()` y ningún sello: escritura con la sesión de quien la hizo (p. ej. el cierre de quincena).
--   sin_sello  ni sesión ni sello: el chat (RPC de adelanto/pago a cuenta) o una sincronización. No hay autor que dar.
--
-- ═══ EL AUTOR DE LA ESCRITURA DE PANTALLA ═══
--
-- Medido hoy: 494 filas, todas `base` con autor NULL; ninguna `cambio` todavía (no hubo escritura manual desde que se
-- aplicó el trigger). La escritura de pantalla (`guardarCeldaLiquidacion`) va con la clave de servicio, donde
-- `auth.uid()` es NULL, y por eso el autor viaja en `escribio_id`/`escribio_en` (la app los sella en la MISMA
-- escritura). Faltaba lo mismo en el DESHACER de la marca «pagada», que reponía `pagado_*` sin sello y habría quedado
-- sin autor (`pagada_por` se vacía al deshacer): ahora la app también lo sella y el trigger lo toma.
--
-- ENSAYO (en una copia, NUNCA sobre los datos del dueño): begin; update liquidacion_linea set por_banco_manual = 1,
-- escribio_id = '<perfil>', escribio_en = now() where ...; select columna, autor, origen from liquidacion_cambio order
-- by id desc limit 1; rollback;  → esperado: autor = '<perfil>', origen = 'celda'. Repetir sin tocar escribio_*:
-- origen = 'sin_sello', autor NULL.
--
-- NO SE APLICA DESDE UN AGENTE (`.claude/rules/migraciones.md`). Idempotente.

set local lock_timeout = '5s';

alter table public.liquidacion_cambio add column if not exists origen text;
alter table public.liquidacion_cambio drop constraint if exists liquidacion_cambio_origen_valido;
alter table public.liquidacion_cambio add constraint liquidacion_cambio_origen_valido
  check (origen is null or origen in ('pago', 'celda', 'sesion', 'sin_sello'));
comment on column public.liquidacion_cambio.origen is
  'De qué camino vino el cambio: pago (marca pagada o su deshacer), celda (tecleado en pantalla), sesion (con auth.uid() y sin sello), sin_sello (chat o sincronización). NULL en las filas base.';

create or replace function public.liquidacion_linea_anotar_cambios()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_viejo  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_nuevo  jsonb := to_jsonb(new);
  v_autor  uuid := auth.uid();
  v_sesion boolean := auth.uid() is not null;
  v_sello  boolean := tg_op = 'INSERT' and new.escribio_en is not null
                      or tg_op = 'UPDATE' and new.escribio_en is distinct from old.escribio_en;
  v_pago   boolean := tg_op = 'UPDATE' and (v_nuevo ->> 'pagada_en') is distinct from (v_viejo ->> 'pagada_en');
  v_origen text;
  v_col    text;
  v_campo  text;
  v_antes  numeric;
  v_despues numeric;
  v_fa     text;
  v_fd     text;
begin
  -- EL SELLO VALE SÓLO SI ES DE ESTA ESCRITURA (ver 20261001T0200). Si hay sesión, manda la sesión.
  if v_autor is null and v_sello then
    v_autor := new.escribio_id;
  end if;
  -- «Marcar pagada» ya sella quién y cuándo en la propia línea (`pagada_por`).
  if v_autor is null and v_pago then
    v_autor := nullif(v_nuevo ->> 'pagada_por', '')::uuid;
  end if;
  v_origen := case when v_pago then 'pago' when v_sello then 'celda' when v_sesion then 'sesion' else 'sin_sello' end;

  for v_col, v_campo in select key, value from jsonb_each_text(public.liquidacion_columnas_manuales()) loop
    v_antes   := nullif(v_viejo ->> v_col, '')::numeric;
    v_despues := nullif(v_nuevo ->> v_col, '')::numeric;
    v_fa      := nullif(v_viejo -> 'formulas' ->> v_campo, '');
    v_fd      := nullif(v_nuevo -> 'formulas' ->> v_campo, '');
    if v_antes is distinct from v_despues or v_fa is distinct from v_fd then
      insert into public.liquidacion_cambio
        (liquidacion_id, persona_id, columna, tipo, antes, despues, formula_antes, formula_despues, autor, origen)
      values (new.liquidacion_id, new.persona_id, v_col, 'cambio', v_antes, v_despues, v_fa, v_fd, v_autor, v_origen);
    end if;
  end loop;
  return null;
end
$f$;
revoke all on function public.liquidacion_linea_anotar_cambios() from public, anon, authenticated;
