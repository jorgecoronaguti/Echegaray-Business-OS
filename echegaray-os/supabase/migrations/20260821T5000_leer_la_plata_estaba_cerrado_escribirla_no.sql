-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LEER LA PLATA ESTABA CERRADO; ESCRIBIRLA, NO — §25
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La 2900 cerró la LECTURA del legajo enumerando lo que se abre, y la 3100/3400 hicieron lo mismo
-- con el precio de cotizaciones y subcontratos. Ninguna de las tres miró el otro verbo. Medido
-- contra la base el 21/08/2026:
--
--   · `personas`         → authenticated tiene `awdxtm` de tabla: INSERT y UPDATE sobre TODAS las
--                          columnas, `retribucion_pactada` incluida (attacl NULL).
--   · `obras`            → ídem, `monto_contratado` incluido, y `obras_update` ni siquiera tiene
--                          WITH CHECK: la fila se puede mover a un estado que la policy no admite.
--   · `obra_canonica`    → ídem, `monto_contratado` incluido.
--
-- Y las policies de las tres pasan por `es_administracion()` / `current_rol() in (...)`, que
-- INCLUYEN al jefe de obra. O sea el defecto exacto, en su forma más incómoda: **el jefe de obra no
-- puede leer el sueldo pactado ni el monto contratado, pero puede sobrescribirlos**. Un PATCH a
-- `/rest/v1/personas?id=eq.<x>` con `{"retribucion_pactada": 1}` entraba, y la respuesta ni siquiera
-- necesitaba devolver el valor para que el daño quedara hecho.
--
-- ═══ POR QUÉ GRANT POR COLUMNA Y ADEMÁS UNA FUNCIÓN ═══
--
-- El GRANT de columna es el único mecanismo que corta el verbo sin depender de que la policy esté
-- bien escrita — es el patrón que la 3400 usó para `subcontrato.precio_contratado` y el que la 2900
-- usó para la lectura. Pero NO distingue roles dentro de `authenticated`: si se lo saco al jefe, se
-- lo saco también a Dirección. Por eso la vía legítima vuelve por una función `security definer`
-- con el portero explícito, igual que `contratado_de_obra()` hace del lado de la lectura.
--
-- El criterio de la 2900 se mantiene y se extiende a los dos verbos nuevos: **se enumera lo que se
-- ABRE, no lo que se cierra**. Una columna nueva nace sin poder escribirse. (REVOKE sobre la tabla
-- también revoca los privilegios de columna de ese mismo verbo, así que los tres `update` de
-- columna que `obra_canonica` ya tenía —`jornada_horas`, `dias_habiles`, `radio_obra_metros`— se
-- vuelven a conceder abajo de forma explícita.)
--
-- ═══ LO QUE NO SE TOCA ═══
--
-- `service_role` conserva la fila entera: el orquestador escribe por ahí y no pasa por policies.
-- Los GRANT de SELECT que puso la 2900 quedan intactos — revocar `insert, update` no toca `select`.

-- ── 1 · personas: el legajo se escribe menos la retribución ───────────────────────────────────
revoke insert, update on public.personas from authenticated;

grant insert (
  id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
  contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso, en_la_empresa,
  legajo, convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion,
  art, obra_social, documentacion_relevada, drive_folder_id, notas, creado_por, actualizado_por
), update (
  nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
  contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso, en_la_empresa,
  legajo, convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion,
  art, obra_social, documentacion_relevada, drive_folder_id, notas, actualizado_por
) on public.personas to authenticated;

comment on table public.personas is
  'Legajo. `authenticated` LEE sólo las columnas operativas (2900) y desde la 5000 ESCRIBE sólo las '
  'que están enumeradas en su GRANT: `retribucion_pactada` no está en ninguna de las dos listas. '
  'Se fija con fijar_retribucion(), que exige ve_economia(). Una columna nueva nace cerrada en los '
  'dos verbos.';

-- ── 2 · obras y obra_canonica: todo menos el monto contratado ─────────────────────────────────
revoke insert, update on public.obras from authenticated;

grant insert (id, cliente_id, nombre, estado, fecha_inicio, fecha_fin_objetivo,
              creado_por, actualizado_por),
      update (cliente_id, nombre, estado, fecha_inicio, fecha_fin_objetivo, actualizado_por)
   on public.obras to authenticated;

revoke insert, update on public.obra_canonica from authenticated;

grant insert (id, nombre, estado, tipo, cliente_texto, cliente_id, etapa, ubicacion, jefe_obra,
              fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real,
              drive_carpeta_id, orden, jornada_horas, dias_habiles, radio_obra_metros),
      update (nombre, estado, tipo, cliente_texto, cliente_id, etapa, ubicacion, jefe_obra,
              fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real,
              drive_carpeta_id, orden, jornada_horas, dias_habiles, radio_obra_metros)
   on public.obra_canonica to authenticated;

comment on column public.obra_canonica.monto_contratado is
  'El precio del contrato. No es escribible por PostgREST desde la 5000: entra por '
  'fijar_monto_contratado(), que exige ve_economia(). Se lee por contratado_de_obra() o por las '
  'vistas que ya llevan su portero.';

-- ── 3 · la policy de obras_update no tenía WITH CHECK ─────────────────────────────────────────
-- Sin WITH CHECK, el USING sólo decide qué filas se pueden tocar: la fila RESULTANTE no se
-- verifica. Es la misma polaridad floja que la 2900 corrigió en `registros_hh`. Acá el predicado no
-- depende de la fila, así que hoy no hay una fuga demostrable — pero el día que dependa, el agujero
-- ya está abierto y nadie lo va a ver. Se iguala a `obra_canonica_update`, que sí lo tiene.
drop policy if exists obras_update on public.obras;
create policy obras_update on public.obras
  for update to authenticated
  using (public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
  with check (public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']));

-- ── 4 · la vía legítima: dos funciones con portero económico ──────────────────────────────────
--
-- `security definer` para poder escribir la columna revocada, y por eso el portero va ADENTRO y en
-- la primera línea. A diferencia de `contratado_de_obra()` —que deja pasar `auth.uid() is null`
-- para que el orquestador LEA— acá el sin-sesión NO pasa: una escritura de plata sin autor no se
-- audita, y el orquestador tiene `service_role` para escribir directo si alguna vez lo necesita.

create or replace function public.fijar_retribucion(p_persona_id uuid, p_monto numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_valor numeric;
begin
  if not public.ve_economia() then
    raise exception 'La retribución pactada la fija Dirección o Administración' using errcode = '42501';
  end if;
  if p_monto is not null and p_monto < 0 then
    raise exception 'La retribución pactada no puede ser negativa' using errcode = '22023';
  end if;
  update public.personas set retribucion_pactada = p_monto
   where id = p_persona_id
  returning retribucion_pactada into v_valor;
  if not found then
    raise exception 'No existe esa persona' using errcode = 'P0002';
  end if;
  return v_valor;
end;
$$;

comment on function public.fijar_retribucion(uuid, numeric) is
  'Única vía de escritura de personas.retribucion_pactada desde la web. Devuelve lo escrito (leído '
  'del RETURNING, no del argumento) para que quien llama verifique el efecto y no el 204. NULL es '
  'un valor válido: significa sin pactar, y no es lo mismo que cero.';

create or replace function public.fijar_monto_contratado(p_obra_id text, p_monto numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_valor numeric;
begin
  if not public.ve_economia() then
    raise exception 'El monto contratado lo fija Dirección o Administración' using errcode = '42501';
  end if;
  if p_monto is not null and p_monto < 0 then
    raise exception 'El monto contratado no puede ser negativo' using errcode = '22023';
  end if;
  update public.obra_canonica set monto_contratado = p_monto
   where id = p_obra_id
  returning monto_contratado into v_valor;
  if not found then
    raise exception 'No existe esa obra' using errcode = 'P0002';
  end if;
  return v_valor;
end;
$$;

-- ═══ POR QUÉ NO ESCRIBE TAMBIÉN `obras.monto_contratado` ═══
--
-- `obras` es el eje legacy: 4 filas contra 17 de `obra_canonica`, sin un solo escritor en `src/` ni
-- en `orquestador/` (se buscó: la única lectura es `reportes/services/generadores.ts`, que no pide
-- el monto) y sin trigger que las sincronice. Espejarlo acá sería inventar un segundo escritor para
-- una tabla que nadie mantiene y que ya tiene sus 4 montos cargados: dos definiciones del contrato
-- conviviendo, que es exactamente lo que REALIDAD ÚNICA prohíbe. Queda declarado: `obras` mantiene
-- su valor histórico y deja de ser escribible; el contrato vivo es `obra_canonica`.
comment on function public.fijar_monto_contratado(text, numeric) is
  'Única vía de escritura de obra_canonica.monto_contratado desde la web. NO espeja obras (eje '
  'legacy sin escritores ni trigger de sincronización). Devuelve lo escrito, no el argumento.';

revoke execute on function public.fijar_retribucion(uuid, numeric) from public, anon;
revoke execute on function public.fijar_monto_contratado(text, numeric) from public, anon;
grant execute on function public.fijar_retribucion(uuid, numeric) to authenticated, service_role;
grant execute on function public.fijar_monto_contratado(text, numeric) to authenticated, service_role;
