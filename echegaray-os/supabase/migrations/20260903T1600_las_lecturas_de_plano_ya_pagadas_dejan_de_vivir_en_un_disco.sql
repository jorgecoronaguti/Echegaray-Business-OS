-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS LECTURAS DE PLANO YA PAGADAS DEJAN DE VIVIR EN EL DISCO DE UNA MÁQUINA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÉ. Cada interpretación de una lámina o de una vista recortada es UNA llamada de visión con
-- capacidad COMPLEX que ya se cobró. `lib/plano/pipeline.mjs` las guardaba en
-- `~/.cache/echegaray-planos`: medido el 03/09/2026, 135 archivos y 1,5 MB. Ese lugar tiene tres
-- defectos, y ninguno es de rendimiento:
--
--   1. Es el HOME del proceso. Si cambia la máquina, el usuario del worker o el contenedor, el
--      caché queda inalcanzable y LA MISMA cotización se vuelve a pagar entera.
--   2. No lo comparte nadie: el worker 24×7, un script suelto y la web calientan tres cachés.
--   3. No se puede mirar sin SSH. «¿Qué planos ya tenemos leídos?» no tenía respuesta consultable.
--
-- ═══ LA LLAVE NO CAMBIA, Y ESO ES EL PUNTO ═══
--
-- `llave` es exactamente la que producía `llaveDeCache(bytes)` en `lib/plano/interpretar.mjs`: el
-- prefijo de versión más el sha256 del CONTENIDO — más el sufijo `:medicion` para la segunda pasada
-- y el prefijo `v3region:` para una vista recortada. Es el nombre del archivo de disco sin `.json`.
-- Conservarla es lo que permite que los 135 archivos que ya existen se promuevan solos: la primera
-- vez que cada plano se vuelva a cotizar, `cacheDeLecturas.leer()` lo encuentra en el disco y lo
-- inserta acá. No hay script de migración que haya que acordarse de correr.
--
-- ═══ POR QUÉ EN `orq` Y NO EN `public` ═══
--
-- Esto no lo lee ninguna pantalla: lo lee el motor. `orq` no está expuesto a PostgREST (ver
-- 20260902T1100), que es exactamente lo que corresponde para un caché interno. La web ve el
-- progreso en `public.cotizacion_lectura`, no acá.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN ═══
--
-- No se aplica sola — la aplica el dueño desde el árbol principal. Y no puede romper el pipeline:
-- mientras no esté aplicada, toda lectura y toda escritura del caché fallan, se capturan, y el
-- caché sigue siendo el de disco de siempre. Un caché que decide si el pipeline funciona no es un
-- caché: es una dependencia.

create table if not exists orq.plano_lectura_cache (
  llave          text primary key,             -- <version>:<sha256 del contenido>[:medicion] | v3region:<sha256>
  valor          jsonb not null,               -- exactamente lo que se guardaba en <llave>.json
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table orq.plano_lectura_cache is
  'Interpretaciones de lámina y de vista recortada ya pagadas al modelo, por hash de CONTENIDO. '
  'Reemplaza ~/.cache/echegaray-planos, que moría con la máquina. Es caché, no fuente: se puede '
  'vaciar entero sin perder ningún dato de negocio — sólo se vuelve a pagar la lectura.';

comment on column orq.plano_lectura_cache.llave is
  'La misma llave que produce llaveDeCache(bytes) en lib/plano/interpretar.mjs. NO se cambia: es '
  'el nombre de los archivos de disco que se promueven solos la primera vez que se los lee.';

create index if not exists plano_lectura_cache_creado on orq.plano_lectura_cache (creado_en desc);

-- RLS aunque el esquema `orq` no esté expuesto a PostgREST — mismo criterio que orq.xsas_adjunto.
-- Sin policy, una tabla nueva falla en silencio (lección pagada en este repo).
alter table orq.plano_lectura_cache enable row level security;
drop policy if exists plano_lectura_cache_servicio on orq.plano_lectura_cache;
create policy plano_lectura_cache_servicio on orq.plano_lectura_cache
  for all to service_role using (true) with check (true);
