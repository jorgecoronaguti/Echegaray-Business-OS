-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- QUÉ SE PARECE A QUÉ EN LA BASE MAESTRA, Y DE DÓNDE SALE CADA CUADRILLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ADITIVA: dos tablas nuevas y tres columnas con default sobre una tabla que hoy tiene 0 filas.
-- No borra, no reescribe ninguna vista y no cambia el resultado de ninguna consulta existente.
--
-- ── 1 · POR QUÉ UN VEREDICTO SE GUARDA AUNQUE DIGA «NO» ────────────────────────────────────────
--
-- La corrida del 2026-08-31 sobre las 205 tareas encontró SEIS pares candidatos y fusionó CERO.
-- Sin esta tabla ese trabajo se pierde: la corrida siguiente vuelve a levantar los mismos seis
-- pares, alguien vuelve a compararlos, y la tercera vez alguien con menos paciencia los fusiona.
-- Un «no son lo mismo, y estos son los cinco hechos por los que lo sé» es un activo, no un
-- descarte.
--
-- El veredicto se guarda CON SUS EJES. `evidencia` no es un comentario: es el objeto que produjo
-- `xsas-basemaestra-duplicados.mjs`, con unidad / nombre / composición / recursos / costo / HH /
-- contexto y el solapamiento medido. Dentro de seis meses «NO_DUPLICADO» solo no se puede releer.
--
-- ── 2 · POR QUÉ ES INMUTABLE, IGUAL QUE base_maestra_decision ──────────────────────────────────
--
-- Sin GRANT ni policy de UPDATE/DELETE. Decidir distinto mañana es OTRA fila sobre el mismo par y
-- gana por `decidido_en`. Que alguien haya cambiado de opinión es información (§21).
--
-- ── 3 · POR QUÉ LA FUSIÓN NO BORRA NADA, Y POR QUÉ SU REVERSA SE GUARDA ANTES ──────────────────
--
-- Fusionar dos tareas maestras es desactivar una y dejar de publicar su análisis. Nunca es un
-- DELETE: `cotizacion_partida` referencia `tarea_tipo_id`, y una cotización congelada que apunta a
-- una fila borrada deja de poder explicarse. Y la reversa —qué valores tenían `activo` y `vigente`
-- ANTES— se escribe en la misma fila que la fusión, en el mismo instante. Una reversa que se deduce
-- después de aplicar no es una reversa: es la esperanza de que nada más haya cambiado.
--
-- Deshacer NO borra la fila de la fusión: inserta otra con accion = 'DESHACER'. La historia queda.
--
-- ── 4 · POR QUÉ LA CUADRILLA NECESITA PROCEDENCIA ─────────────────────────────────────────────
--
-- `analisis_cuadrilla` (0 filas al 2026-08-31, las 205 tareas sin cuadrilla) no tiene dónde decir
-- de dónde salió la fila. Y hay una diferencia que decide plazos: una cuadrilla OBSERVADA en obra
-- —`Horas Hombre.xlsm · DESCRIPCION DE TAREAS`, 11 observaciones reales— no vale lo mismo que una
-- que alguien tipeó. Sin `fuente` y `estado`, la primera cuadrilla cargada se vuelve norma sin que
-- nadie la haya aprobado. El default es CANDIDATO por la misma razón que `analisis.estado` es
-- HISTORICO: marcar VALIDADO sería afirmar una revisión que no ocurrió.

-- ── 1 · el veredicto sobre un par ─────────────────────────────────────────────────────────────

create table if not exists public.base_maestra_relacion (
  id uuid primary key default gen_random_uuid(),
  -- Texto y no FK: un veredicto sobre un par sigue siendo cierto si mañana una de las dos se
  -- desactiva, y el código es lo que la persona reconoce.
  codigo_a text not null,
  codigo_b text not null,
  veredicto text not null check (veredicto in
    ('DUPLICADO_CONFIRMADO', 'VARIANTE', 'RELACIONADO', 'NO_DUPLICADO', 'FALTA_DATO')),
  -- Qué regla del clasificador disparó. Sin esto, dos veredictos iguales por motivos distintos se
  -- ven idénticos.
  regla text not null,
  por_que text not null,
  -- Los ejes comparados, tal como los devolvió el clasificador.
  evidencia jsonb not null,
  -- Qué criterio trajo el par a la mesa: NOMBRE, COMPOSICION o los dos.
  criterios text[] not null default '{}',
  -- Qué corrida lo produjo, para poder repetirla y comparar.
  corrida text,
  decidido_por uuid default auth.uid(),
  decidido_en timestamptz not null default now(),
  -- El orden del par no puede depender de quién lo escribió, o el mismo par entra dos veces.
  constraint base_maestra_relacion_par_ordenado check (codigo_a < codigo_b)
);

create index if not exists base_maestra_relacion_par
  on public.base_maestra_relacion (codigo_a, codigo_b, decidido_en desc);

comment on table public.base_maestra_relacion is
  'Que se parece a que en la Base Maestra, y por que. La corrida del 2026-08-31 sobre 205 tareas '
  'levanto 6 pares candidatos y fusiono 0: sin esta tabla, la corrida siguiente vuelve a levantar '
  'los mismos 6. INMUTABLE: decidir distinto manana es otra fila y gana por decidido_en.';

comment on column public.base_maestra_relacion.veredicto is
  'FALTA_DATO no es un empate: es una pregunta con destinatario. Se usa cuando todo lo medible '
  'coincide y lo unico que separa a las dos tareas es una declaracion que nadie hizo.';

-- ── 2 · la fusión, con su reversa escrita antes de aplicarla ──────────────────────────────────

create table if not exists public.base_maestra_fusion (
  id uuid primary key default gen_random_uuid(),
  accion text not null check (accion in ('FUSIONAR', 'DESHACER')),
  -- Para un DESHACER, cuál fusión se está revirtiendo.
  revierte_a uuid references public.base_maestra_fusion (id),
  codigo_sobrevive text not null,
  codigo_absorbido text not null,
  relacion_id uuid references public.base_maestra_relacion (id),
  -- El estado EXACTO de lo tocado antes de tocarlo. Es la reversa, y se guarda antes.
  estado_previo jsonb not null,
  por_que text not null,
  ejecutado_por uuid default auth.uid(),
  ejecutado_en timestamptz not null default now(),
  constraint base_maestra_fusion_no_se_absorbe_sola check (codigo_sobrevive <> codigo_absorbido)
);

create index if not exists base_maestra_fusion_absorbido
  on public.base_maestra_fusion (codigo_absorbido, ejecutado_en desc);

comment on table public.base_maestra_fusion is
  'El registro de que se fusiono con que y como se deshace. Fusionar NUNCA borra: desactiva la '
  'tarea absorbida y deja de publicar su analisis, porque cotizacion_partida referencia '
  'tarea_tipo_id y una cotizacion congelada que apunta a una fila borrada deja de poder '
  'explicarse. Deshacer no borra esta fila: inserta otra con accion = DESHACER.';

comment on column public.base_maestra_fusion.estado_previo is
  'La reversa, capturada ANTES de aplicar. Una reversa que se deduce despues no es una reversa.';

-- ── 3 · de dónde sale cada cuadrilla ──────────────────────────────────────────────────────────

alter table public.analisis_cuadrilla
  add column if not exists fuente text;

alter table public.analisis_cuadrilla
  add column if not exists estado text not null default 'CANDIDATO';

alter table public.analisis_cuadrilla
  add column if not exists evidencia jsonb;

alter table public.analisis_cuadrilla
  drop constraint if exists analisis_cuadrilla_estado_valido;

alter table public.analisis_cuadrilla
  add constraint analisis_cuadrilla_estado_valido
  check (estado in ('VALIDADO', 'HISTORICO', 'CANDIDATO'));

comment on column public.analisis_cuadrilla.fuente is
  'De donde salio esta cuadrilla. Las cargadas por xsas-basemaestra-auditar.mjs llevan el prefijo '
  'xsas-basemaestra: es lo que hace que la carga sea reversible con un solo delete.';

comment on column public.analisis_cuadrilla.estado is
  'CANDIDATO por default y por la misma razon que analisis.estado es HISTORICO: marcar VALIDADO '
  'seria afirmar una revision que no ocurrio. Una cuadrilla OBSERVADA en obra y una que alguien '
  'tipeo no valen lo mismo, y sin esta columna se ven identicas.';

comment on column public.analisis_cuadrilla.evidencia is
  'Las observaciones literales que sostienen la fila: cantidad, HH, personas y de que celda de que '
  'planilla salieron. Una cuadrilla sin evidencia es un numero que nadie puede discutir.';

-- ── 4 · quién ve qué ──────────────────────────────────────────────────────────────────────────
-- Lectura abierta a authenticated: un jefe de obra tiene que poder ver por que dos tareas quedaron
-- separadas y con cuanta gente se midio su rendimiento. Nada de esto es economico — los precios
-- siguen detras de ve_economia() donde ya estaban.

alter table public.base_maestra_relacion enable row level security;
alter table public.base_maestra_fusion   enable row level security;

drop policy if exists base_maestra_relacion_lee on public.base_maestra_relacion;
create policy base_maestra_relacion_lee on public.base_maestra_relacion
  for select to authenticated using (true);

-- Nadie decide en nombre de otro, misma regla que base_maestra_decision.
drop policy if exists base_maestra_relacion_escribe on public.base_maestra_relacion;
create policy base_maestra_relacion_escribe on public.base_maestra_relacion
  for insert to authenticated with check (decidido_por = (select auth.uid()));

drop policy if exists base_maestra_fusion_lee on public.base_maestra_fusion;
create policy base_maestra_fusion_lee on public.base_maestra_fusion
  for select to authenticated using (true);

-- Fusionar tiene efecto economico: cambia que analisis publica precio. Solo economia.
drop policy if exists base_maestra_fusion_escribe on public.base_maestra_fusion;
create policy base_maestra_fusion_escribe on public.base_maestra_fusion
  for insert to authenticated with check (public.ve_economia() and ejecutado_por = (select auth.uid()));

-- Una policy sin GRANT es permission denied; un GRANT sin policy tampoco alcanza. Los dos, y sin
-- update/delete a proposito.
revoke update, delete on public.base_maestra_relacion from authenticated;
revoke update, delete on public.base_maestra_fusion   from authenticated;
grant select, insert on public.base_maestra_relacion to authenticated;
grant select, insert on public.base_maestra_fusion   to authenticated;
grant all on public.base_maestra_relacion, public.base_maestra_fusion to service_role;
