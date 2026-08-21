-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL AVANCE DICE CÓMO SE MIDIÓ Y QUIÉN LO FIRMA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_ejecucion` guarda 242 registros y de cada uno se sabe cuánto y cuándo. No se sabe **con qué
-- método se midió**, **quién lo firmó** (los ejemplos leídos traen `creado_por` en NULL), **qué
-- cuadrilla lo hizo**, ni **con qué evidencia**. Un porcentaje sin eso no se puede interpretar seis
-- meses después: es exactamente el «porcentaje mágico» que el contrato prohíbe.
--
-- Y falta un método. Hoy la actividad puede declarar `cantidad`, `partes` o `manual`. El trabajo
-- repetitivo —hormigón, sobre todo— no se mide bien por ninguno: 80 m³ vertidos no dicen si la
-- armadura está atada, y el porcentaje tipeado a mano tampoco. Se agrega **`pasos`**: la actividad
-- lleva pasos con peso, y el avance es la fracción de peso ejecutado. Los pasos que no se pueden
-- comprimir (curado, fraguado) se marcan como tales: son días fijos, no trabajo que se acelere
-- poniendo más gente.
--
-- `partes` NO se retira aunque el contrato nombre tres métodos. Son 141 actividades que hoy se miden
-- así y significa algo distinto de `cantidad`: es la suma de los avances diarios declarados en la
-- grilla. Sacarlo obligaría a reinterpretar 141 actividades vivas sin que nadie lo haya pedido.
--
-- ═══ EL CRITERIO DEL MÉTODO MANUAL LO EXIGE LA BASE ═══
--
-- La pantalla «Registrar avance» deshabilita la primaria si el método es manual y no hay criterio
-- escrito. Esa regla no puede vivir sólo en el formulario: la misma fila entra por el teléfono, por
-- el parte diario y por una acción masiva. Va como CHECK.

-- ── 1 · los pasos ponderados ──────────────────────────────────────────────────────────────────
create table if not exists public.obra_actividad_paso (
  id                uuid primary key default gen_random_uuid(),
  actividad_id      uuid not null references public.obra_actividad (id) on delete cascade,
  orden             int  not null default 0,
  nombre            text not null,
  peso              numeric not null default 1 check (peso > 0),
  tiempo_tecnico    boolean not null default false,
  dias_tecnicos     numeric check (dias_tecnicos is null or dias_tecnicos >= 0),
  hecho_en          timestamptz,
  hecho_por         uuid,
  creado_en         timestamptz not null default now()
);

create index if not exists obra_actividad_paso_actividad_idx on public.obra_actividad_paso (actividad_id, orden);

-- Los pesos son RELATIVOS y no se exige que sumen 100: el avance es peso_hecho / peso_total. Un
-- CHECK de "suman 100" obligaría a editar todos los pasos en una sola transacción para agregar uno,
-- y dejaría la actividad en estado inválido a mitad de camino. Así no puede quedar inconsistente.
comment on table public.obra_actividad_paso is
  'Los pasos de una actividad medida por pasos ponderados. El peso es relativo: el avance es la '
  'fracción de peso ejecutado, así que agregar o sacar un paso nunca deja la actividad inválida. '
  'tiempo_tecnico marca lo que no se comprime con más gente (curado, fraguado): son días fijos.';

alter table public.obra_actividad_paso enable row level security;

drop policy if exists obra_actividad_paso_select on public.obra_actividad_paso;
create policy obra_actividad_paso_select on public.obra_actividad_paso for select to authenticated
  using (exists (select 1 from public.obra_actividad a where a.id = actividad_id and public.ve_obra(a.obra_id)));

drop policy if exists obra_actividad_paso_write on public.obra_actividad_paso;
create policy obra_actividad_paso_write on public.obra_actividad_paso for all to authenticated
  using (exists (select 1 from public.obra_actividad a where a.id = actividad_id and public.ve_obra(a.obra_id)))
  with check (exists (select 1 from public.obra_actividad a where a.id = actividad_id and public.ve_obra(a.obra_id)));

-- RLS sin GRANT no se evalúa: la policy existe y la tabla igual responde "permission denied".
grant select, insert, update, delete on public.obra_actividad_paso to authenticated;
grant all on public.obra_actividad_paso to service_role;

-- Un contenedor no se mide, así que tampoco lleva pasos.
create or replace function public.paso_no_va_al_contenedor()
returns trigger language plpgsql as $$
declare t text;
begin
  select tipo into t from public.obra_actividad where id = new.actividad_id;
  if t = 'resumen' then
    raise exception 'la actividad % es un contenedor: los pasos van en las actividades que agrupa', new.actividad_id;
  end if;
  return new;
end $$;

drop trigger if exists paso_no_va_al_contenedor_t on public.obra_actividad_paso;
create trigger paso_no_va_al_contenedor_t before insert on public.obra_actividad_paso
  for each row execute function public.paso_no_va_al_contenedor();

-- ── 2 · el cuarto método ──────────────────────────────────────────────────────────────────────
alter table public.obra_actividad drop constraint if exists obra_actividad_metodo_avance_check;
alter table public.obra_actividad add constraint obra_actividad_metodo_avance_check
  check (metodo_avance in ('cantidad', 'pasos', 'partes', 'manual'));

comment on column public.obra_actividad.metodo_avance is
  'cantidad = producción acumulada sobre el objetivo. pasos = fracción de peso ejecutado en '
  'obra_actividad_paso. partes = suma de los avances diarios de la grilla (heredado, 141 '
  'actividades vivas). manual = alguien declara el porcentaje y escribe con qué criterio.';

-- ── 3 · la firma del registro ─────────────────────────────────────────────────────────────────
alter table public.obra_ejecucion add column if not exists metodo       text;
alter table public.obra_ejecucion add column if not exists criterio     text;
alter table public.obra_ejecucion add column if not exists cuadrilla_id uuid references public.cuadrilla (id);
alter table public.obra_ejecucion add column if not exists paso_id      uuid references public.obra_actividad_paso (id) on delete set null;
alter table public.obra_ejecucion add column if not exists evidencia    text[];
alter table public.obra_ejecucion add column if not exists masivo       boolean not null default false;

alter table public.obra_ejecucion alter column creado_por set default auth.uid();

alter table public.obra_ejecucion drop constraint if exists obra_ejecucion_metodo_check;
alter table public.obra_ejecucion add constraint obra_ejecucion_metodo_check
  check (metodo is null or metodo in ('cantidad', 'pasos', 'partes', 'manual'));

-- El criterio del método manual. `metodo is null` son los 242 registros anteriores a esta columna:
-- no se les inventa un método ni se los borra para que cierre una regla que no existía cuando se
-- cargaron.
alter table public.obra_ejecucion drop constraint if exists obra_ejecucion_manual_exige_criterio;
alter table public.obra_ejecucion add constraint obra_ejecucion_manual_exige_criterio
  check (metodo is distinct from 'manual' or (criterio is not null and btrim(criterio) <> ''));

comment on column public.obra_ejecucion.metodo is
  'Con qué método se midió ESTE registro. Es una foto, no una referencia: si mañana la actividad '
  'cambia de método, lo ya registrado sigue diciendo cómo se midió cuando se midió.';
comment on column public.obra_ejecucion.criterio is
  'Obligatorio cuando el método es manual. Es lo que permite entender el porcentaje después.';
comment on column public.obra_ejecucion.masivo is
  'El registro entró por una acción masiva. Se avisa sin bloquear, pero queda dicho: un 75 % '
  'aplicado a veinte actividades a la vez no tiene la misma precisión que uno medido de a uno.';

-- ── 4 · la vista publica el avance por pasos ──────────────────────────────────────────────────
create or replace view public.obra_actividad_control with (security_invoker = true) as
 SELECT a.id AS actividad_id,
    a.id,
    a.obra_id,
    a.codigo,
    a.codigo_padre,
    a.nombre,
    a.tipo,
    a.orden,
    a.seccion,
    a.archivada,
    a.clave,
    a.dias_plan,
    a.dias_real,
    a.editado_a_mano,
    a.fuente_pestana,
    a.creada_en_web,
    a.cuadrilla,
    ( SELECT p.nombre
           FROM obra_actividad p
          WHERE p.obra_id = a.obra_id AND p.codigo = a.codigo_padre AND p.tipo = 'resumen'::text
          ORDER BY p.orden
         LIMIT 1) AS rubro,
    a.estado,
    a.unidad,
    a.cantidad_objetivo,
    a.metodo_avance,
    a.inicio_plan,
    a.fin_plan,
    a.inicio_base,
    a.fin_base,
    a.sellada_en,
    a.inicio_real,
    a.fin_real,
    a.hh_plan,
    a.responsable_id,
    a.cuadrilla_id,
    ( SELECT c.nombre
           FROM cuadrilla c
          WHERE c.id = a.cuadrilla_id) AS cuadrilla_prevista,
    a.comentario,
    a.partida_codigo,
    a.partida_cantidad,
    a.pct,
    a.pct AS avance_declarado,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.ultimo_parte,
    h.hh_real,
    h.hh_extra,
    COALESCE(h.n_imputaciones, 0::bigint)::integer AS n_imputaciones,
    COALESCE(imp.abiertos, 0) AS impedimentos_abiertos,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN
            CASE
                WHEN a.cantidad_objetivo > 0::numeric THEN LEAST(100::numeric, round(COALESCE(e.cantidad_ejecutada, 0::numeric) / a.cantidad_objetivo * 100::numeric, 1))
                ELSE NULL::numeric
            END
            WHEN 'partes'::text THEN LEAST(100::numeric, round(COALESCE(e.avance_partes, 0::numeric), 1))
            WHEN 'pasos'::text THEN
            CASE
                WHEN ps.peso_total > 0::numeric THEN round(COALESCE(ps.peso_hecho, 0::numeric) / ps.peso_total * 100::numeric, 1)
                ELSE NULL::numeric
            END
            ELSE a.pct
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN a.pct IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance,
        CASE
            WHEN COALESCE(imp.abiertos, 0) > 0 THEN 'bloqueada'::text
            ELSE a.estado
        END AS estado_operativo,
        CASE
            WHEN e.cantidad_ejecutada > 0::numeric AND h.hh_real > 0::numeric THEN round(e.cantidad_ejecutada / h.hh_real, 3)
            ELSE NULL::numeric
        END AS productividad,
        CASE
            WHEN a.hh_plan > 0::numeric AND h.hh_real IS NOT NULL THEN round(h.hh_real / a.hh_plan * 100::numeric, 1)
            ELSE NULL::numeric
        END AS consumo_hh_pct,
    a.actividad_padre_id,
    COALESCE(t.n_tareas, 0) AS n_tareas,
    COALESCE(t.n_tareas_hechas, 0) AS n_tareas_hechas,
    COALESCE(ped.n_pedidos, 0) AS n_pedidos,
    COALESCE(nt.n_notas, 0) AS n_notas,
    COALESCE(doc.n_documentos, 0) AS n_documentos,
    COALESCE(eq.n_equipos, 0) AS n_equipos,
    COALESCE(ps.n_pasos, 0) AS n_pasos,
    COALESCE(ps.n_pasos_hechos, 0) AS n_pasos_hechos,
    ps.peso_total AS peso_pasos
   FROM obra_actividad a
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            max(x.fecha) AS ultimo_parte
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS hh_real,
            sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['extra_50'::text, 'extra_100'::text])) AS hh_extra,
            count(*) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS n_imputaciones
           FROM registros_hh r
          WHERE r.actividad_id = a.id) h ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS abiertos
           FROM obra_restriccion x
          WHERE x.actividad_id = a.id AND x.fecha_liberacion IS NULL) imp ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_tareas,
            count(*) FILTER (WHERE x.estado = 'hecha'::text)::integer AS n_tareas_hechas
           FROM obra_actividad x
          WHERE x.actividad_padre_id = a.id AND NOT x.archivada) t ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pedidos
           FROM pedidos_materiales x
          WHERE x.actividad_id = a.id) ped ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_notas
           FROM obra_actividad_nota x
          WHERE x.actividad_id = a.id) nt ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_documentos
           FROM obra_documento x
          WHERE x.actividad_id = a.id) doc ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT x.equipo)::integer AS n_equipos
           FROM obra_ejecucion_equipo x
             JOIN obra_ejecucion p ON p.id = x.ejecucion_id
          WHERE p.actividad_id = a.id) eq ON true;

grant select on public.obra_actividad_control to authenticated;
grant select on public.obra_actividad_control to service_role;
