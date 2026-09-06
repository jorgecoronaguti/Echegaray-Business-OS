-- EL PLAN DE EGRESOS DE UNA OBRA DEJA DE VIVIR EN UN ARCHIVO .JS.
--
-- ═══ QUÉ SE MIDIÓ (05/09/2026) ═══
--
-- `censo-numeros-pegados.mjs OBRAS` cuenta 29 números pegados en una pestaña que el OS calcula. Los
-- 24 de los cuadros 4 y 5 salen de las constantes de `orquestador/lib/obras-datos.mjs` —la
-- transcripción de las explosiones de gasto que el dueño armó en PDF, obra por obra—. Un dato de
-- negocio que sólo existe adentro de un módulo de código no lo puede consultar nadie más que el
-- generador del Sheet: ni la web, ni el chat, ni una consulta SQL. Es exactamente lo que la regla de
-- REALIDAD ÚNICA prohíbe.
--
-- ═══ QUÉ EXISTE HOY QUE HACE ESTO, Y POR QUÉ NO ALCANZA ═══
--
-- Se revisó el esquema vivo antes de crear nada:
--
--   · `public.costos_obra` (940 filas) es el espejo de la pestaña Compras: gasto REAL, ya facturado.
--     Es el otro lado de la comparación, no el plan.
--   · `public.obligaciones` es deuda devengada con vencimiento, también nacida de un comprobante.
--   · `public.proyeccion_egreso` es una VISTA estadística: promedio de los últimos 3 meses por rubro
--     ajustado por IPC. Proyecta el RITMO de la empresa, no el plan declarado de una obra.
--   · `public.obra_material_plan` y `public.obra_actividad_insumo_plan` son el plan TÉCNICO que baja
--     de la cotización: recurso y cantidad por actividad, sin proveedor, sin fecha y sin plata.
--   · `public.obra_economia.costo_objetivo` sale del presupuesto congelado o de las partidas
--     cotizadas: es el costo DIRECTO presupuestado, no el egreso de caja previsto con su fecha.
--
-- Ninguna guarda «qué egreso, de qué obra, a qué proveedor, en qué fecha y por cuánto» declarado por
-- el dueño ANTES de que exista el comprobante. Por eso la tabla es nueva.
--
-- ═══ POR QUÉ LA MANO DE OBRA ES UNA FILA MÁS Y NO UNA COLUMNA ═══
--
-- El costo proyectado de una obra (columna C del cuadro 4) es exactamente la suma de sus materiales
-- previstos (cuadro 5) más su mano de obra con cargas. Verificado en las 7 obras contra el archivo
-- vivo el 05/09: los siete C dan la suma exacta, sin un peso de diferencia. Con la mano de obra como
-- una fila más, el costo proyectado del Sheet pasa a ser UN SUMIFS sobre esta tabla y deja de ser un
-- número pegado — con una columna aparte harían falta dos lecturas y una suma en el medio, que es
-- otra vez un cálculo que envejece.
--
-- ═══ LA PROCEDENCIA NO ES DECORACIÓN ═══
--
-- La carga inicial son los valores que HOY están en el Sheet, que es la única fuente que existe.
-- Cada fila dice de qué celda salió y cuándo se leyó, porque el día que un número no cierre la
-- pregunta va a ser «¿de dónde salió esto?» y la respuesta tiene que estar en la fila, no en el
-- historial de un script.

create table if not exists public.obra_egreso_proyectado (
  id                uuid primary key default gen_random_uuid(),
  -- LA CLAVE ES LA MISMA QUE YA USA LA FUSIÓN DEL CUADRO 5: rótulo + proveedor normalizados
  -- (`claveDeItem` en lib/materiales-fusion.mjs). Una SEGUNDA definición de identidad para el mismo
  -- ítem se desincroniza sin dar error: el ítem dejaría de emparejar y el cuadro mostraría dos
  -- renglones donde hay uno. En el archivo real hay TRES «PLAYÓN DE AZUFRE — Materiales», uno por
  -- proveedor, así que el rótulo solo no identifica nada.
  clave             text not null unique,
  obra_rotulo       text not null,
  -- La clave interna de `obras-datos.mjs` mientras esa lista siga existiendo, y el vínculo con la
  -- obra canónica cuando la obra esté dada de alta en el OS. Las dos NULLABLES a propósito: dos de
  -- las siete obras del cuadro (MAMPOSTERÍA y PLAYÓN DE AZUFRE) todavía no existen en
  -- `obra_canonica`, y exigir el vínculo dejaría su plan afuera — que es peor que tenerlo suelto.
  obra_clave        text,
  obra_canonica_id  text references public.obra_canonica(id),
  tipo              text not null check (tipo in ('material', 'mano_de_obra')),
  concepto          text not null,
  familia           text,
  -- 'sin proveedor' es un valor real del archivo, no un relleno: el dueño declaró el egreso sin
  -- decidir a quién se lo compra. Va como texto y no como NULL porque forma parte de la clave.
  proveedor         text not null default 'sin proveedor',
  -- LA FECHA ES DE DOS ESPECIES Y LAS DOS SON EL DATO. Un egreso en una fecha va en `fecha_estimada`;
  -- uno repartido en cuotas va en `fecha_texto` («10/08 · 10/09»), que es como el dueño lo escribe en
  -- la celda. Aplanar las cuotas a una fecha única perdería el reparto, y explotarlas en filas
  -- perdería la línea que él edita.
  fecha_estimada    date,
  fecha_texto       text,
  monto             numeric(14,2) not null check (monto >= 0),
  nota              text,
  origen_pestana    text not null,
  origen_celda      text,
  origen_fuente     text not null,
  origen_leido_en   timestamptz not null,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- UN MATERIAL SIN CELDA DE ORIGEN ES UN NÚMERO INVENTADO. La fila de mano de obra no tiene celda
  -- propia —se deduce del costo proyectado menos los materiales— y por eso queda exceptuada, con su
  -- deducción escrita en `origen_fuente`.
  constraint obra_egreso_proyectado_material_declara_celda_ck
    check (tipo <> 'material' or origen_celda is not null)
);

comment on table public.obra_egreso_proyectado is
  'El plan de egresos de caja de una obra tal como lo declaró el dueño: materiales ítem por ítem más la mano de obra con cargas. Es el PLAN (antes del comprobante); el gasto real vive en public.costos_obra y no se mezcla. La suma por obra es el «costo proyectado» del cuadro 4 de la pestaña OBRAS.';
comment on column public.obra_egreso_proyectado.clave is
  'rótulo‖proveedor normalizados — la MISMA identidad que usa lib/materiales-fusion.mjs para emparejar el ítem con su fila del Sheet. No se define dos veces.';
comment on column public.obra_egreso_proyectado.origen_celda is
  'La celda del Sheet de la que salió el valor el día de la carga (ej. OBRAS!E45). Sin esto, un número que no cierra no se puede rastrear.';

create index if not exists obra_egreso_proyectado_obra_ix
  on public.obra_egreso_proyectado (obra_rotulo, tipo);
create index if not exists obra_egreso_proyectado_canonica_ix
  on public.obra_egreso_proyectado (obra_canonica_id) where obra_canonica_id is not null;

-- ── RLS + GRANTS. LAS DOS: UNA POLICY SIN GRANT DEVUELVE «PERMISSION DENIED» ─────────────────

alter table public.obra_egreso_proyectado enable row level security;

do $$ begin
  create policy obra_egreso_proyectado_lee on public.obra_egreso_proyectado
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on public.obra_egreso_proyectado to authenticated;
grant select, insert, update, delete on public.obra_egreso_proyectado to service_role;
