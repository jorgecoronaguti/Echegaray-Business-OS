-- LIQUIDACIÓN DE HORAS · EL PUNTO ÁMBAR PASA A SER UN LOG (dueño, 01/10/2026)
--
-- Textual: «ese punto amarillo q indica modif a mano en liq de hs quiero q funcione como un log en donde me
-- muestre las fechas y los inputs q se hicieron cdo le haga hover».
--
-- ═══ POR QUÉ UN TRIGGER Y NO UNA RPC NI UN INSERT DESDE LA APP ═══
--
-- Las celdas manuales de `liquidacion_linea` (`*_manual`, `pagado_banco`, `pagado_efectivo`) las escriben CINCO
-- caminos distintos: la celda de la pantalla (`guardarCeldaLiquidacion`, con y sin `esperado` de deshacer), la marca
-- «pagada» y su deshacer, y las RPC del adelanto rendido desde el chat y del pago en efectivo a cuenta. Una RPC
-- «de historial» exigiría reescribir los cinco y el sexto, el día que exista, nacería sin log. Un insert desde la app
-- después de la escritura no es atómico: una celda guardada y un log perdido son exactamente el dato que el dueño
-- quiere ver. El trigger AFTER ve la fila vieja y la nueva en la MISMA transacción, venga de donde venga la escritura.
--
-- ═══ EL AUTOR: LA ESCRITURA VA CON LA CLAVE DE SERVICIO ═══
--
-- `guardarCeldaLiquidacion` escribe con `createAdminClient()` para no abrirle UPDATE a `authenticated`: dentro del
-- trigger `auth.uid()` es NULL. Por eso la app sella dos columnas nuevas en la MISMA escritura (`escribio_id`,
-- `escribio_en`) y el trigger sólo toma el autor si `escribio_en` CAMBIÓ en esta escritura. Sin esa condición, una
-- escritura posterior de otro camino (el chat, una sincronización) heredaría el nombre del último que tipeó desde la
-- pantalla: es el defecto que se evita. Sin sello y sin sesión el autor queda NULL y la pantalla dice «sin autor
-- registrado»; no se inventa un usuario de sistema. Si hay sesión (`auth.uid()` no nulo), manda la sesión.
-- Alternativa descartada: `set_config('app.autor', …)` — cada llamada de PostgREST es su propia transacción, el valor
-- no llegaría al trigger.
--
-- ═══ NO SE FABRICA PASADO ═══
--
-- Los manuales que ya existen no tienen historia: `actualizado_en` de la línea no dice quién ni qué celda tocó. Esta
-- migración deja UNA fila `tipo = 'base'` por cada manual existente, con el valor de hoy y `autor` NULL, y la
-- pantalla la dibuja como «sin registro anterior al <día>». El día es el de esta migración: es cuándo empezó el log.
--
-- ═══ ACCESO ═══
--
-- RLS con la puerta del módulo (`liquida_sueldos()`: dirección y administración; jefe de obra NO), igual que
-- `liquidacion_linea`. `authenticated` sólo lee: el log lo escribe el trigger (SECURITY DEFINER) y nadie lo corrige
-- desde la web. `service_role` conserva el acceso total que tiene toda tabla de esta base.
--
-- NO SE APLICA DESDE UN AGENTE (`.claude/rules/migraciones.md`). Es idempotente: se puede volver a correr.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · QUÉ COLUMNAS SON «A MANO», DICHO UNA SOLA VEZ
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- columna de base → clave de `formulas` (el nombre del campo en la app: `COLUMNA_DE` de liquidacionOverrides.ts).
create or replace function public.liquidacion_columnas_manuales()
returns jsonb
language sql immutable
set search_path to 'public', 'pg_temp'
as $f$
  select '{
    "horas_manual": "horas",
    "cobra_manual": "cobra",
    "adelanto_manual": "adelanto",
    "ya_transferido_manual": "yaTransferido",
    "por_banco_manual": "porBanco",
    "en_efectivo_manual": "enEfectivo",
    "total_manual": "total",
    "horas_recibo_manual": "horasRecibo",
    "valor_hora_recibo_manual": "valorHoraRecibo",
    "negro_manual": "negro",
    "horas_negro_manual": "horasNegro",
    "pagado_banco": "pagadoBanco",
    "pagado_efectivo": "pagadoEfectivo"
  }'::jsonb
$f$;
revoke all on function public.liquidacion_columnas_manuales() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · EL SELLO DE AUTOR QUE VIAJA CON LA ESCRITURA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.liquidacion_linea
  add column if not exists escribio_id uuid,
  add column if not exists escribio_en timestamptz;
comment on column public.liquidacion_linea.escribio_id is
  'Quién escribió por última vez una celda desde la pantalla (la escritura va con la clave de servicio y auth.uid() es NULL). Sólo vale junto con escribio_en: el trigger lo toma si escribio_en cambió en ESA escritura.';
comment on column public.liquidacion_linea.escribio_en is
  'Marca de la escritura de pantalla. Cambia en cada guardado; el trigger de historial la usa para saber que escribio_id es de esta escritura y no de una anterior.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · EL LOG
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.liquidacion_cambio (
  id              bigint generated always as identity primary key,
  liquidacion_id  uuid not null references public.liquidacion_quincena(id) on delete cascade,
  persona_id      uuid not null references public.personas(id) on delete cascade,
  -- La columna de `liquidacion_linea` que cambió (`por_banco_manual`…); la pantalla la traduce a su celda.
  columna         text not null,
  -- `base` = el valor que ya había al activar el registro. No es un cambio de nadie.
  tipo            text not null default 'cambio' check (tipo in ('cambio', 'base')),
  -- NULL en `antes` = no había nada escrito (era el cálculo). NULL en `despues` = se vació: VUELVE EL CÁLCULO, no es cero.
  antes           numeric,
  despues         numeric,
  -- La cuenta tal como se escribió («=340909,09+197272,73»). El número es lo que se paga; la cuenta lo explica.
  formula_antes   text,
  formula_despues text,
  -- NULL = sin sesión ni sello (chat, sincronización) o fila `base`. No se inventa un usuario de sistema.
  autor           uuid,
  en              timestamptz not null default now()
);

create index if not exists liquidacion_cambio_por_quincena
  on public.liquidacion_cambio (liquidacion_id, persona_id, columna, en desc);
-- UNA `base` por celda: volver a correr la migración no duplica el punto de partida.
create unique index if not exists liquidacion_cambio_base_unica
  on public.liquidacion_cambio (liquidacion_id, persona_id, columna) where tipo = 'base';

comment on table public.liquidacion_cambio is
  'Log de cada celda escrita a mano en Liquidación de horas: valor anterior y nuevo, cuenta si la hubo, autor y momento. Lo escribe el trigger de liquidacion_linea en la misma transacción. Los manuales previos a la activación tienen una sola fila tipo base.';

alter table public.liquidacion_cambio enable row level security;
drop policy if exists liquidacion_cambio_lee_admin on public.liquidacion_cambio;
create policy liquidacion_cambio_lee_admin on public.liquidacion_cambio
  for select to authenticated using (public.liquida_sueldos());
-- Los privilegios por defecto reparten DML a `authenticated`: se quita antes de dar sólo lo que se quiere.
revoke all on public.liquidacion_cambio from anon, authenticated;
grant select on public.liquidacion_cambio to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · EL TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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
  v_col    text;
  v_campo  text;
  v_antes  numeric;
  v_despues numeric;
  v_fa     text;
  v_fd     text;
begin
  -- EL SELLO VALE SÓLO SI ES DE ESTA ESCRITURA (ver cabecera). En un INSERT no hay fila anterior que lo contradiga.
  if v_autor is null and (tg_op = 'INSERT' or new.escribio_en is distinct from old.escribio_en) then
    v_autor := new.escribio_id;
  end if;
  -- «Marcar pagada» ya sella quién y cuándo en la propia línea (`pagada_por`): es el autor de los dos importes que completa.
  if v_autor is null and tg_op = 'UPDATE' and (v_nuevo ->> 'pagada_en') is distinct from (v_viejo ->> 'pagada_en') then
    v_autor := nullif(v_nuevo ->> 'pagada_por', '')::uuid;
  end if;

  for v_col, v_campo in select key, value from jsonb_each_text(public.liquidacion_columnas_manuales()) loop
    v_antes   := nullif(v_viejo ->> v_col, '')::numeric;
    v_despues := nullif(v_nuevo ->> v_col, '')::numeric;
    v_fa      := nullif(v_viejo -> 'formulas' ->> v_campo, '');
    v_fd      := nullif(v_nuevo -> 'formulas' ->> v_campo, '');
    -- Cambia el número O la cuenta: escribir «=100+40» sobre un 140 ya guardado no mueve el número y sí la explicación.
    if v_antes is distinct from v_despues or v_fa is distinct from v_fd then
      insert into public.liquidacion_cambio
        (liquidacion_id, persona_id, columna, tipo, antes, despues, formula_antes, formula_despues, autor)
      values (new.liquidacion_id, new.persona_id, v_col, 'cambio', v_antes, v_despues, v_fa, v_fd, v_autor);
    end if;
  end loop;
  return null;
end
$f$;
revoke all on function public.liquidacion_linea_anotar_cambios() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5 · EL PUNTO DE PARTIDA DE LO QUE YA ESTÁ ESCRITO (ANTES del trigger: estas filas no son cambios)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into public.liquidacion_cambio
  (liquidacion_id, persona_id, columna, tipo, antes, despues, formula_despues, autor)
select l.liquidacion_id, l.persona_id, m.key, 'base', null,
       (to_jsonb(l) ->> m.key)::numeric,
       nullif(to_jsonb(l) -> 'formulas' ->> m.value, ''),
       null
  from public.liquidacion_linea l
 cross join lateral jsonb_each_text(public.liquidacion_columnas_manuales()) m
 where to_jsonb(l) ->> m.key is not null
on conflict do nothing;

-- AFTER y por fila: ve la fila definitiva (con los DEFAULT y los CHECK ya pasados) y no cambia lo que se guarda.
drop trigger if exists liquidacion_linea_historial on public.liquidacion_linea;
create trigger liquidacion_linea_historial
  after insert or update on public.liquidacion_linea
  for each row execute function public.liquidacion_linea_anotar_cambios();
