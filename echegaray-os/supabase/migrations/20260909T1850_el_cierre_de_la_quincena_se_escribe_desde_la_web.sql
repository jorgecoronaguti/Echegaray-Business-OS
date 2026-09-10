-- 20260909T1850 · EL CIERRE DE LA QUINCENA SE ESCRIBE DESDE LA WEB
--
-- R6 existía en TypeScript y en la base, pero no había forma de que la pantalla lo ejecutara:
-- `sellarLineas` y `avisoDeReapertura` estaban probados, las columnas del sello existían desde
-- 20260909T1710 — y `authenticated` sólo tenía `update (actualizado_en, efectivo_redondeado)` sobre
-- `liquidacion_linea`. El botón «Cerrar y sellar» no estaba desconectado por olvido: no tenía a
-- dónde escribir.
--
-- ═══ LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO (09/09/2026, contra la base real) ═══
--
--   liquidacion_linea      authenticated: insert (tabla), select (tabla), update (SÓLO
--                          actualizado_en, efectivo_redondeado)          ← el bloqueo
--   liquidacion_quincena   authenticated: insert, select, update de TABLA (estado, cerrada_en y
--                          cerrada_por YA eran actualizables)            ← el bloqueo NO estaba acá
--   liquidacion_reapertura authenticated: insert + select, con policy `liquida_sueldos()`
--                          y `revoke update, delete`                     ← ya estaba entero
--
-- Los `grant` de la cabecera y de la reapertura se repiten igual, explícitos e idempotentes: que un
-- permiso esté hoy por herencia de un grant de tabla no es lo mismo que estar declarado, y la
-- próxima persona que lea este módulo no debería tener que preguntárselo a la base.
--
-- ═══ POR QUÉ SÓLO LAS CUATRO COLUMNAS DEL SELLO, Y NO `cobra` NI `total` ═══
--
-- 20260909T1710 dejó el UPDATE acotado a propósito: aunque alguien con sesión válida llame a
-- PostgREST a mano, no puede reescribir los importes de una línea que ya existe. Eso se conserva.
-- Lo que el cierre necesita escribir con la sesión es exactamente el sello —qué valor hora, qué
-- categoría y qué convenio se usaron, y cuándo se congelaron—, y ésas son las cuatro. La foto de
-- plata la sigue escribiendo el servidor, igual que `guardarCeldaLiquidacion`.
--
-- `valor_hora` entra en la lista porque es el sello (R6: «el valor hora usado»), y su exposición es
-- acotada: mientras la quincena está ABIERTA la pantalla no lee esa columna —recalcula desde
-- `persona_tarifa`—, y una vez CERRADA la policy `liquidacion_linea_edita_abierta` ya no deja
-- tocarla. La ventana de escritura es la misma que la del cierre.
--
-- ═══ EL ORDEN NO ES UNA PREFERENCIA: LO IMPONE LA POLICY ═══
--
-- `liquidacion_linea_edita_abierta` exige `q.estado = 'abierta'`. Sellar DESPUÉS de marcar la
-- cabecera deja la quincena cerrada y sin sello, que es la peor de las dos mitades: dice que se
-- pagó y no dice con qué. Sellar primero y marcar después es lo único que la base acepta, y el
-- código lo hace en ese orden por eso, no por costumbre.


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · EL SELLO DE LA LÍNEA
-- ─────────────────────────────────────────────────────────────────────────────────────────────

grant update (valor_hora, categoria_sellada, convenio_sellado, sellado_en, actualizado_en)
  on public.liquidacion_linea to authenticated;

comment on column public.liquidacion_linea.valor_hora is
  'El $/h con el que se liquidó. Mientras la quincena está abierta la pantalla lo recalcula desde '
  'persona_tarifa y no lo lee de acá; al cerrar queda sellado y es contra este número que la '
  'pantalla 11 compara el «$/h hoy».';

-- La lectura ya estaba (grant select de tabla). Se deja escrito que la policy es la que decide
-- QUIÉN, y el grant QUÉ: sin las dos, PostgREST corta en el catálogo y devuelve 403 con message
-- vacío — la trampa que este repo ya pagó con `banco_movimientos`.


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · LA CABECERA SE MARCA CERRADA, CON QUIÉN LA CERRÓ
-- ─────────────────────────────────────────────────────────────────────────────────────────────

grant update (estado, cerrada_en, cerrada_por) on public.liquidacion_quincena to authenticated;
grant select (id, desde, hasta, grupo, estado, cerrada_en, cerrada_por) on public.liquidacion_quincena to authenticated;

comment on column public.liquidacion_quincena.cerrada_por is
  'El perfil que cerró. Un cierre anónimo es una firma que no se puede pedir explicar: cuando '
  'alguien discuta un importe sellado, es a quien hay que preguntarle.';

-- La policy de UPDATE ya existe (`liquidacion_quincena_cierra_admin`, `liquida_sueldos()`), y es la
-- misma para cerrar y para reabrir: reabrir es un UPDATE de estado. Lo que distingue una reapertura
-- de un descierre silencioso NO es una policy, es la fila de `liquidacion_reapertura` que la acción
-- escribe ANTES — por eso se inserta primero y recién después se abre.


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · REABRIR DEJA FIRMA
-- ─────────────────────────────────────────────────────────────────────────────────────────────

grant select, insert on public.liquidacion_reapertura to authenticated;
-- UN HISTORIAL QUE SE PUEDE BORRAR NO ES UN HISTORIAL (se reafirma: un grant de tabla posterior
-- podría haberlo revertido sin que nadie lo note).
revoke update, delete on public.liquidacion_reapertura from authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='liquidacion_reapertura' and policyname='liquidacion_reapertura_lee_admin') then
    create policy liquidacion_reapertura_lee_admin on public.liquidacion_reapertura
      for select to authenticated using ((select public.liquida_sueldos()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='liquidacion_reapertura' and policyname='liquidacion_reapertura_escribe_admin') then
    create policy liquidacion_reapertura_escribe_admin on public.liquidacion_reapertura
      for insert to authenticated with check ((select public.liquida_sueldos()));
  end if;
end $$;

-- RLS: las tres tablas ya la tienen habilitada (20260909T1200 y T1710). Se reafirma porque un
-- `alter table` posterior que la apague dejaría los grants de arriba abiertos a todo `authenticated`
-- —incluido campo— y nada en el código se enteraría.
alter table public.liquidacion_linea      enable row level security;
alter table public.liquidacion_quincena   enable row level security;
alter table public.liquidacion_reapertura enable row level security;
