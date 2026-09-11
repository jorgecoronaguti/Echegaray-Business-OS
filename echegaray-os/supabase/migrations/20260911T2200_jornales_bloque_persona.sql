-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESPEJO DEL BLOQUE DE JORNALES · PARA QUE LA PANTALLA PUEDA DECIR SI COINCIDE CON LA PLANILLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ QUÉ PROBLEMA RESUELVE, Y POR QUÉ NO ALCANZA `registros_hh` ═══
--
-- El dueño, 11/09/2026, tres veces: «tengo que seguir usando Sheet JORNALES». La vista «Quincena»
-- ya dibuja su bloque con datos de `registros_hh`. Lo que falta para que pueda SOLTAR la planilla es
-- poder ver, persona por persona, que la base dice lo mismo que el Sheet. Sin ese cotejo la pantalla
-- calcula bien y él no tiene cómo saberlo, así que abre las dos.
--
-- `registros_hh` no sirve para cotejar contra sí mismo: es la TRADUCCIÓN de la planilla que hace
-- `jornales-a-registros-hh.mjs` —celda → fila con obra resuelta y `tipo_hora`—. Compararla contra
-- una suma calculada por el mismo código sería validar un control contra la información que produce:
-- diría «coincide» siempre, incluso el día que el parser se coma una celda.
--
-- Esta tabla guarda lo OTRO: la foto del bloque tal como está escrito, incluido el total que la
-- PROPIA PLANILLA calcula en su columna «TOTAL SEMANA», y su cadena de pago entera. Son cifras de
-- origen independiente, y por eso la comparación significa algo.
--
-- ═══ POR QUÉ UNA TABLA Y NO UNA LECTURA EN VIVO DEL SHEET ═══
--
-- Porque la web no puede leer Google. `orquestador/lib/google.mjs` necesita la clave de la cuenta de
-- servicio en disco y en Vercel esa credencial no existe (ya documentado en
-- `obras/services/actionsDocumentos.ts`, que por lo mismo encola en vez de escribir el Sheet), y el
-- camino del token del dueño (`google-oauth.mjs`) entra a Postgres con `pg` por conexión directa —
-- meterlo en el runtime de Next abriría un pool por instancia al lado del que administra Supabase.
--
-- Así que se hace como TODOS los demás espejos de este OS: un script en la VM lee la fuente y
-- escribe la tabla; la web lee la tabla. Igual que `compra_sheet` (Compras), `documentacion_legajo`
-- (Drive) y `drive_index`. Es además lo que manda REALIDAD ÚNICA: un concepto que consumen varias
-- caras vive en Postgres.
--
-- ═══ LA CLAVE ES ESTRUCTURAL, NO EL NOMBRE ═══
--
-- (pestaña, fila del encabezado del bloque, fila de la persona). El nombre NO identifica: dos
-- homónimos en la misma quincena colapsarían en una fila y el espejo publicaría las horas de uno a
-- nombre de los dos. Es la misma decisión que `ref` en `trabajadoresDeBloque`, tomada por un defecto
-- ya medido en el archivo real.
--
-- ═══ `persona_id` ES NULLABLE A PROPÓSITO ═══
--
-- Quien aparece en la planilla y no empareja con el padrón viaja igual, con el nombre crudo y sin
-- persona. Es lo que permite que la pantalla escriba «3 de la planilla sin persona en el padrón».
-- Tirar esas filas haría que el bloque pareciera más chico y que el cotejo del resto diera bien
-- mientras alguien queda sin liquidar. Y NO se crea a nadie: el padrón no lo escribe un espejo.
--
-- ═══ QUIÉN ESCRIBE: NADIE CON SESIÓN ═══
--
-- El único escritor es `orquestador/scripts/jornales-espejo-bloques.mjs`, que entra por conexión
-- directa como dueño de la tabla (`rolbypassrls`). Una escritura desde la web no sólo estaría mal
-- permitida: DESAPARECERÍA en la próxima corrida del timer, y un permiso cuyo efecto se evapora es
-- peor que no tenerlo porque el que lo usó cree que guardó. Es la misma lección de `costos_obra`
-- (`20260820T4000`). RLS NO ES GRANT: se conceden y se niegan los dos.

create table if not exists public.jornales_bloque_persona (
  id uuid primary key default gen_random_uuid(),

  -- ── de dónde salió, que es la identidad ──────────────────────────────────────────────────────
  pestana        text not null,
  -- Fila REAL de la hoja donde está el encabezado de fechas del bloque (1-based, con offset).
  bloque_fila1   int  not null,
  -- Fila REAL de la hoja donde está la persona.
  fila1          int  not null,

  -- ── qué quincena cubre ───────────────────────────────────────────────────────────────────────
  --
  -- MIN y MAX de las fechas del encabezado, no la primera y la última columna: en el archivo real
  -- vienen desordenadas («16/7, 17/7, 18/7, 6/7…») y rotular por posición nombra mal la quincena.
  quincena_desde date not null,
  quincena_hasta date not null,

  -- ── quién ────────────────────────────────────────────────────────────────────────────────────
  persona_id        uuid references public.personas(id) on delete set null,
  nombre_planilla   text not null,
  cliente_planilla  text,
  obra_planilla     text,
  categoria_planilla text,

  -- ── qué dice la planilla ─────────────────────────────────────────────────────────────────────
  --
  -- `horas_por_dia` es `{"2026-09-01": 9, "2026-09-02": null}`. El NULL de adentro NO es cero: es una
  -- celda escrita que no es un número (texto libre, y existe en el archivo). Una celda VACÍA no
  -- genera clave — «todavía no lo cargué» y «no trabajó» son dos afirmaciones distintas y una se
  -- liquida.
  horas_por_dia  jsonb not null default '{}'::jsonb,
  -- El total de horas que la planilla CALCULA en su columna de resumen («DIAS / HORAS»). NULL = esa
  -- columna no tiene rótulo en este bloque y no se adivinó una letra.
  horas          numeric,
  valor_hora     numeric,

  -- ── LA CADENA DE PAGO, CON LOS NOMBRES DE LA APP ─────────────────────────────────────────────
  --
  -- Medido en el archivo real el 11/09/2026 y mapeado POR RÓTULO en `lib/jornales-espejo.mjs`:
  --
  --   cobra           «TOTAL SEMANA»                 (AB en Obreros 26 · Z en Oficina 26)
  --   adelanto        «ADELANTO EFECTIVO» / «ADELANTO» (Z en Obreros · X en Oficina)
  --   ya_transferido  «ADELANTO BANCO / EMBARGOS»    (Y en Obreros · NO EXISTE en Oficina → NULL)
  --   por_banco       «BANCO»                        (X en Obreros · W en Oficina)
  --   en_efectivo     «TOTAL EFECTIVO» / «TOTAL RECIBO» (AA en Obreros · Y en Oficina)
  --
  -- Es lo que el dueño reclamó el 11/09/2026: *«todo lo referente a adelantos de plata no está»*. La
  -- app calculaba COBRA y restaba lo que encontraba en `nomina_adelanto`; los adelantos que él
  -- escribe en la planilla no entraban por ningún lado.
  --
  -- NO HAY COLUMNA «PAGADO EL» en ninguna de las dos pestañas: se buscó y no está, así que no hay
  -- campo. Inventar una fecha de pago sería fabricar un dato.
  cobra          numeric,
  adelanto       numeric,
  ya_transferido numeric,
  por_banco      numeric,
  en_efectivo    numeric,

  -- CUÁNDO SE MIRÓ LA PLANILLA, no cuándo cambió. Se pisa en cada corrida aunque nada cambie: es lo
  -- que el sello de la pantalla publica, y una quincena estable diría «leído hace seis días»
  -- teniéndose leída hace una hora.
  leido_en       timestamptz not null default now(),

  constraint jornales_bloque_persona_ventana check (quincena_desde <= quincena_hasta),
  constraint jornales_bloque_persona_unico unique (pestana, bloque_fila1, fila1)
);

comment on table public.jornales_bloque_persona is
  'ESPEJO del bloque de la planilla JORNALES: lo que el Sheet DICE, sin interpretar. Existe para cotejar contra registros_hh — un control no se valida contra la información que produce. Lo escribe orquestador/scripts/jornales-espejo-bloques.mjs desde la VM; nadie con sesión escribe acá.';
comment on column public.jornales_bloque_persona.horas is
  'El total que la PROPIA PLANILLA calcula en su columna «DIAS / HORAS». NO es la suma de horas_por_dia: si lo fuera, el cotejo compararía el OS contra el OS.';
comment on column public.jornales_bloque_persona.ya_transferido is
  'ADELANTO BANCO / EMBARGOS. Sólo existe en Obreros 26; en Oficina 26 no hay columna y viaja NULL — que no es cero.';
comment on column public.jornales_bloque_persona.persona_id is
  'NULL = el nombre de la planilla no empareja con el padrón. La fila viaja igual para que la pantalla pueda decir cuántos son. No se crea a nadie.';

-- La consulta de la pantalla es siempre por ventana exacta.
create index if not exists jornales_bloque_persona_quincena
  on public.jornales_bloque_persona (quincena_desde, quincena_hasta);
create index if not exists jornales_bloque_persona_persona
  on public.jornales_bloque_persona (persona_id) where persona_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────
--
-- LEER: lo mismo que ve la liquidación. `ve_economia()` es dirección y administración, NO el jefe de
-- obra: esta tabla trae $/h, total, adelanto, banco y efectivo por persona — son sueldos, y el corte
-- es el mismo que el de `persona_tarifa` y `liquidacion_linea`. La pantalla ya esconde la solapa;
-- esto es la cerradura, y también corta una llamada directa a PostgREST.
--
-- ESCRIBIR: nadie. Ni insert, ni update, ni delete. El script entra como dueño de la tabla.
alter table public.jornales_bloque_persona enable row level security;

drop policy if exists jornales_bloque_persona_select on public.jornales_bloque_persona;
create policy jornales_bloque_persona_select on public.jornales_bloque_persona
  for select to authenticated
  -- `(select ...)` y no la llamada suelta: sin envolverla se evalúa POR FILA en vez de una vez
  -- (InitPlan). Con 17 personas no muerde; con el año entero cargado, sí.
  using ((select public.ve_economia()));

revoke all on public.jornales_bloque_persona from authenticated, anon;
grant select on public.jornales_bloque_persona to authenticated;

-- ── LA EVIDENCIA DEL EFECTO, para pegarla al cierre ────────────────────────────────────────────
--
--   select count(*) filas, count(persona_id) con_persona,
--          min(quincena_desde), max(quincena_hasta), max(leido_en)
--     from public.jornales_bloque_persona;
--
--   -- el cotejo, que es para lo que existe: planilla vs base, por persona, en una quincena
--   select j.nombre_planilla, j.horas as planilla,
--          (select sum(r.horas) from public.registros_hh r
--            where r.persona_id = j.persona_id
--              and r.fecha between j.quincena_desde and j.quincena_hasta) as base
--     from public.jornales_bloque_persona j
--    where j.quincena_desde = '2026-09-01' and j.quincena_hasta = '2026-09-15'
--    order by 1;
