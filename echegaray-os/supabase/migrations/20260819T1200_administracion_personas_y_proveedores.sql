-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADMINISTRACIÓN GESTIONA PERSONAS Y PROVEEDORES SIN ENTRAR A SUPABASE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño (19/08/2026), textual: *"El usuario Administración debe poder gestionar datos normales
-- sin entrar a Supabase, SQL o código"* y, sobre proveedores, *"Proveedor debe ser entidad canónica
-- administrable y evitar duplicados por texto libre"* · *"No inventar imputaciones"*.
--
-- ═══ LO QUE SE MIDIÓ EN LA BASE ANTES DE ESCRIBIR ESTO (19/08/2026) ═══
--
--   personas          30 filas · 30 sin fecha_egreso · categoria: 27 NULL + '1591' + '6E60' + '004212'
--   proveedores       36 filas · 22 con CUIT (los 22 de 11 dígitos limpios y con DV válido)
--                     sin único por CUIT, sin único por nombre, sin duplicados hoy
--   compras            0 filas  ← la tabla canónica de compras está VACÍA
--   costos_obra      845 filas · origen='compras_sheet' · 112 nombres de proveedor distintos
--                     33 con canónico por coincidencia exacta · 79 PENDIENTES (284 comprobantes)
--
-- Dos cosas que el encargo daba por ciertas y la base desmiente, y que cambian el diseño:
--
--   1. NO EXISTE un CHECK de categorías UOCRA sobre `personas.categoria`. Y no se crea acá: tres
--      filas reales tienen '1591', '6E60' y '004212' —códigos mal importados, no categorías— y un
--      CHECK las rechazaría, obligando a EDITAR DATOS REALES para que corra la migración. Las cuatro
--      categorías del convenio se ofrecen en la pantalla; el dato viejo se muestra tal cual, marcado
--      como fuera de convenio, y lo corrige una persona. Cerrar el dominio es una decisión del dueño
--      sobre esas tres filas, no un efecto colateral de una migración.
--
--   2. El vínculo proveedor↔compra NO vive en `compras` (vacía) sino en `costos_obra.proveedor`,
--      que es TEXTO LIBRE espejo de `Compras!E` del Sheet. Por eso la vista de resolución se arma
--      sobre `costos_obra` y no sobre `compras`.
--
-- ═══ POR QUÉ NO HAY EMPAREJAMIENTO AUTOMÁTICO POR PARECIDO ═══
--
-- Entre los 112 nombres del Sheet están "SUELDOS" (58 comprobantes), "ARCA" (34), "SINDICATOS" (24)
-- y "BANCO" (12): no son proveedores. Un emparejador por similitud los habría colgado del proveedor
-- de nombre más cercano y el costo de obra habría quedado imputado a alguien que nunca facturó eso.
-- Acá sólo se vincula con coincidencia EXACTA del texto normalizado, o porque una persona lo
-- resolvió. Todo lo demás es PENDIENTE. La regla vive en `orquestador/lib/proveedor-identidad.mjs`
-- y esta migración es su contraparte SQL: las dos tienen que decir lo mismo.

-- ── 1 · LA DEFINICIÓN ÚNICA DE IDENTIDAD, DEL LADO DE POSTGRES ──────────────────────────────────
--
-- `immutable` no es decorativo: sin eso no se pueden usar en un índice único, que es lo único que
-- IMPIDE el duplicado de verdad. Una validación que sólo vive en el formulario la esquiva cualquier
-- carga por API, por script o por el sincronizador del Sheet.

create or replace function public.normalizar_cuit(valor text)
returns text language sql immutable parallel safe as $$
  select nullif(regexp_replace(coalesce(valor, ''), '\D', '', 'g'), '')
$$;

comment on function public.normalizar_cuit(text) is
  'El CUIT es su serie de dígitos. Espejo exacto de normalizarCuit() en proveedor-identidad.mjs.';

-- Mayúsculas, bordes recortados y espacios internos colapsados. NADA MÁS: sacar acentos o sufijos
-- societarios agregaría reglas que pueden divergir del .mjs y volver a partir la identidad en dos.
create or replace function public.normalizar_nombre_proveedor(valor text)
returns text language sql immutable parallel safe as $$
  select nullif(upper(btrim(regexp_replace(coalesce(valor, ''), '\s+', ' ', 'g'))), '')
$$;

comment on function public.normalizar_nombre_proveedor(text) is
  'Espejo exacto de normalizarNombreProveedor() en proveedor-identidad.mjs.';

grant execute on function public.normalizar_cuit(text) to authenticated;
grant execute on function public.normalizar_nombre_proveedor(text) to authenticated;

-- ── 2 · EL PROVEEDOR COMO ENTIDAD ADMINISTRABLE ─────────────────────────────────────────────────
--
-- `activo` en vez de borrar: un proveedor con 190 comprobantes atrás no se elimina, se saca de la
-- lista operativa. Borrarlo dejaría 190 costos de obra apuntando al vacío.
alter table public.proveedores
  add column if not exists activo boolean not null default true,
  add column if not exists razon_social text,
  add column if not exists notas text;

comment on column public.proveedores.razon_social is
  'La razón social formal, cuando difiere del nombre con el que se lo conoce en obra.';
comment on column public.proveedores.activo is
  'Archivado = false. No se borra: los costos de obra ya cargados lo siguen referenciando.';

-- El CUIT se guarda normalizado o no se guarda. Los 22 cargados ya cumplen: verificado 19/08/2026.
alter table public.proveedores drop constraint if exists proveedores_cuit_formato;
alter table public.proveedores add constraint proveedores_cuit_formato
  check (cuit is null or cuit ~ '^[0-9]{11}$');

-- ═══ EL ÚNICO PARCIAL, Y POR QUÉ LLEVA EL `where` ═══
--
-- Un índice único sobre una columna que acepta NULL no restringe los NULL: en este repo uno vivió
-- sobre 206 NULLs sin quejarse nunca. Acá hay 14 proveedores sin CUIT y tienen que poder convivir,
-- así que la unicidad se declara SÓLO donde hay dato. Sin el `where`, esto no fallaría al crearse
-- —fallaría al no impedir nada, que es peor.
create unique index if not exists proveedores_cuit_unico
  on public.proveedores (cuit) where cuit is not null;

-- El duplicado por texto libre es el problema que el dueño nombró. Dos proveedores cuyo nombre
-- normaliza igual son el mismo proveedor cargado dos veces.
create unique index if not exists proveedores_nombre_unico
  on public.proveedores (public.normalizar_nombre_proveedor(nombre));

-- ── 3 · DÓNDE SE ESCRIBE LA DECISIÓN DE UNA PERSONA ─────────────────────────────────────────────
--
-- Esta tabla NO es un caché del emparejamiento: es el registro de lo que alguien DECIDIÓ sobre un
-- texto que el Sheet trae suelto. Por eso guarda quién y cuándo — es el respaldo de una imputación
-- de costo, y si mañana el número no cierra hay que poder preguntarle a alguien por qué dijo que
-- "FEMENIA" era ese proveedor.
--
-- `no_es_proveedor` es un resultado de primera clase, no un descarte: "SUELDOS" y "ARCA" tienen que
-- poder salir de la lista de trabajo sin que se les invente un proveedor. Sin este estado, la lista
-- de pendientes nunca llega a cero y deja de mirarse.
create table if not exists public.proveedor_alias (
  id uuid primary key default gen_random_uuid(),
  nombre_norm text not null,
  nombre_origen text not null,
  proveedor_id uuid references public.proveedores(id) on delete cascade,
  estado text not null default 'vinculado' check (estado in ('vinculado', 'no_es_proveedor')),
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles(id) default auth.uid(),
  actualizado_en timestamptz not null default now(),
  -- Un alias vinculado SIN proveedor sería un vínculo a la nada, y volvería a mostrarse como
  -- pendiente para siempre. El estado y el destino tienen que ser coherentes o la fila no entra.
  constraint proveedor_alias_coherente check (
    (estado = 'vinculado' and proveedor_id is not null) or
    (estado = 'no_es_proveedor' and proveedor_id is null)
  )
);

-- Un texto del Sheet se resuelve UNA vez. Sin esto, dos personas podrían mandarlo a dos proveedores
-- distintos y el costo quedaría duplicado en los dos.
create unique index if not exists proveedor_alias_nombre_unico
  on public.proveedor_alias (nombre_norm);

comment on table public.proveedor_alias is
  'Resolución MANUAL de un nombre de texto libre del Sheet a un proveedor canónico. Nunca la escribe un emparejador automático.';

-- ── 4 · LA LISTA DE TRABAJO: QUÉ FALTA RESOLVER ─────────────────────────────────────────────────
--
-- ═══ POR QUÉ LA VISTA FILTRA POR `es_administracion()` EN SU PROPIO WHERE ═══
--
-- Una vista NO TIENE RLS: no se le puede poner una policy. Con `security_invoker = true` hereda las
-- policies de las tablas que lee (`costos_obra` ya filtra por obra), pero eso sólo acota las FILAS
-- según la obra, no cierra la sección a Administración. El cierre va adentro del `where`, y con la
-- función que ya existe. Sin `security_invoker`, además, la vista correría como su dueño y saltaría
-- el RLS de `costos_obra` — el agujero exacto que documentó
-- `20260818T2330_usuario_obra_y_rls_por_obra.sql`.
create or replace view public.proveedor_nombre_pendiente
with (security_invoker = true) as
with nombres as (
  select
    public.normalizar_nombre_proveedor(c.proveedor) as nombre_norm,
    min(btrim(c.proveedor)) as nombre_origen,
    count(*) as comprobantes,
    sum(coalesce(c.total, 0)) as total,
    min(c.fecha) as primera_fecha,
    max(c.fecha) as ultima_fecha
  from public.costos_obra c
  where public.normalizar_nombre_proveedor(c.proveedor) is not null
  group by 1
)
select
  n.nombre_norm,
  n.nombre_origen,
  n.comprobantes,
  n.total,
  n.primera_fecha,
  n.ultima_fecha
from nombres n
-- Coincidencia EXACTA con un canónico: no es un pendiente, ya tiene dueño.
left join public.proveedores p
  on public.normalizar_nombre_proveedor(p.nombre) = n.nombre_norm
-- Ya resuelto a mano (vinculado o marcado como "no es un proveedor").
left join public.proveedor_alias a
  on a.nombre_norm = n.nombre_norm
where p.id is null
  and a.id is null
  and public.es_administracion();

comment on view public.proveedor_nombre_pendiente is
  'Nombres de Compras!E (espejo costos_obra) sin proveedor canónico. Se resuelven a mano: el OS nunca los vincula por parecido.';

-- El espejo de lo ya resuelto, para poder auditar y deshacer una vinculación equivocada.
create or replace view public.proveedor_nombre_resuelto
with (security_invoker = true) as
with nombres as (
  select
    public.normalizar_nombre_proveedor(c.proveedor) as nombre_norm,
    count(*) as comprobantes,
    sum(coalesce(c.total, 0)) as total
  from public.costos_obra c
  where public.normalizar_nombre_proveedor(c.proveedor) is not null
  group by 1
)
select
  n.nombre_norm,
  n.comprobantes,
  n.total,
  coalesce(a.estado, 'vinculado') as estado,
  coalesce(a.proveedor_id, p.id) as proveedor_id,
  coalesce(pa.nombre, p.nombre) as proveedor_nombre,
  -- De dónde salió el vínculo: cambia cuánto se le cree y quién lo puede deshacer.
  case when a.id is not null then 'resolucion_manual' else 'exacto' end as via,
  a.id as alias_id
from nombres n
left join public.proveedores p
  on public.normalizar_nombre_proveedor(p.nombre) = n.nombre_norm
left join public.proveedor_alias a on a.nombre_norm = n.nombre_norm
left join public.proveedores pa on pa.id = a.proveedor_id
where (p.id is not null or a.id is not null)
  and public.es_administracion();

comment on view public.proveedor_nombre_resuelto is
  'Nombres del Sheet que YA tienen destino, y por qué vía. Sirve para deshacer una vinculación equivocada.';

-- ── 5 · EL PLANTEL QUE LA OBRA NECESITA, SIN EL LEGAJO QUE NO LE CORRESPONDE ────────────────────
--
-- ═══ ESTA VISTA EXISTE PARA PODER CERRAR `personas` SIN ROMPER LA OBRA ═══
--
-- Hasta hoy `personas_select` decía `true`: cualquier autenticado —incluido un jefe de obra— leía
-- por PostgREST el legajo COMPLETO, con `retribucion_pactada`, `cuil`, `dni`, `fecha_nacimiento`,
-- `art` y `obra_social`. Eso no es un permiso amplio, es una fuga de datos personales y salariales.
--
-- Pero cerrar `personas` a Administración a secas rompe `TabPersonal` de la obra, que necesita los
-- nombres para asignar gente. Por eso el corte es por COLUMNA y no por tabla: esta vista publica lo
-- estrictamente operativo —quién es, qué categoría, qué especialidad, si sigue en el plantel— y
-- nada más. `security_invoker = false` es DELIBERADO acá: la vista tiene que poder leer la tabla
-- cerrada para publicar el subconjunto. Es el único lugar donde eso está permitido en este módulo,
-- y lo que lo hace seguro es que la lista de columnas es fija y no incluye ningún dato sensible.
create or replace view public.persona_plantel
with (security_invoker = false) as
select
  p.id,
  p.nombre_completo,
  p.categoria,
  p.especialidad,
  p.fecha_egreso
from public.personas p;

comment on view public.persona_plantel is
  'Subconjunto NO sensible de personas, para que la obra pueda asignar personal sin ver sueldos ni documentos.';

-- ── 6 · RLS: LO QUE ES DE ADMINISTRACIÓN ES DE ADMINISTRACIÓN ───────────────────────────────────
--
-- ═══ `FOR ALL` NO SE USA PARA ESCRITURA, Y ACÁ ESTABA USADO EN LAS DOS TABLAS ═══
--
-- `personas_write` y `proveedores_write` eran `for all`, que INCLUYE SELECT. Hoy no se notaba
-- porque al lado vivía un `select` con `using (true)` y las policies permisivas se suman con OR:
-- el efecto neto de la lectura era "todos". El problema es que al endurecer el SELECT —que es
-- justamente lo que hace esta migración— la policy `for all` habría seguido dejando pasar la
-- lectura a cualquiera con rol de escritura, y el endurecimiento habría sido cosmético. Se parten
-- en INSERT / UPDATE / DELETE explícitos, que es lo que de verdad se quiso decir.

alter table public.proveedor_alias enable row level security;

drop policy if exists "personas_select" on public.personas;
drop policy if exists "personas_write" on public.personas;
drop policy if exists "proveedores_select" on public.proveedores;
drop policy if exists "proveedores_write" on public.proveedores;

-- PERSONAS — el legajo es de Administración. La obra lee `persona_plantel`.
create policy "personas_select" on public.personas
  for select to authenticated using (public.es_administracion());
create policy "personas_insert" on public.personas
  for insert to authenticated with check (public.es_administracion());
create policy "personas_update" on public.personas
  for update to authenticated using (public.es_administracion()) with check (public.es_administracion());
create policy "personas_delete" on public.personas
  for delete to authenticated using (public.es_administracion());

-- PROVEEDORES — ninguna pantalla fuera de Administración lo lee (verificado por grep en src/,
-- 19/08/2026: cero consumidores), así que cerrarlo no deja a nadie sin dato.
create policy "proveedores_select" on public.proveedores
  for select to authenticated using (public.es_administracion());
create policy "proveedores_insert" on public.proveedores
  for insert to authenticated with check (public.es_administracion());
create policy "proveedores_update" on public.proveedores
  for update to authenticated using (public.es_administracion()) with check (public.es_administracion());
create policy "proveedores_delete" on public.proveedores
  for delete to authenticated using (public.es_administracion());

-- LA RESOLUCIÓN DE NOMBRES — puramente administrativa desde el primer día.
drop policy if exists "proveedor_alias_select" on public.proveedor_alias;
drop policy if exists "proveedor_alias_insert" on public.proveedor_alias;
drop policy if exists "proveedor_alias_update" on public.proveedor_alias;
drop policy if exists "proveedor_alias_delete" on public.proveedor_alias;
create policy "proveedor_alias_select" on public.proveedor_alias
  for select to authenticated using (public.es_administracion());
create policy "proveedor_alias_insert" on public.proveedor_alias
  for insert to authenticated with check (public.es_administracion());
create policy "proveedor_alias_update" on public.proveedor_alias
  for update to authenticated using (public.es_administracion()) with check (public.es_administracion());
create policy "proveedor_alias_delete" on public.proveedor_alias
  for delete to authenticated using (public.es_administracion());

-- ── 7 · LOS GRANTS, QUE NO SON LA RLS ───────────────────────────────────────────────────────────
--
-- La policy dice QUÉ FILAS; el grant dice SI PODÉS TOCAR EL OBJETO. Una policy sin su grant devuelve
-- `42501 permission denied`, y Next lo muestra como un 404 — media jornada perdida la última vez.
grant select, insert, update, delete on public.proveedores to authenticated;
grant select, insert, update, delete on public.proveedor_alias to authenticated;
grant select, insert, update, delete on public.personas to authenticated;
grant select on public.proveedor_nombre_pendiente to authenticated;
grant select on public.proveedor_nombre_resuelto to authenticated;
grant select on public.persona_plantel to authenticated;
