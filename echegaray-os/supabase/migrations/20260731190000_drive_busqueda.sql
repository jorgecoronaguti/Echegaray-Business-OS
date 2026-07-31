-- ============================================================================
-- BÚSQUEDA SOBRE EL ÍNDICE DE DRIVE — el almacenamiento que le faltaba.
--
-- `public.drive_index` ya existe desde 20260716120000 y ya tiene el catálogo entero
-- (~2.465 filas, lo llena scripts/indexar-drive.mjs cada 6 h). Lo que no tenía era la
-- forma COMPARABLE de cada archivo: el nombre "Vision / Tracción" no se parece en nada,
-- carácter por carácter, a lo que una persona escribe ("pasame vision traccion"), y por eso
-- un `name contains` contra Drive contestaba "no existe" siendo literalmente cierto.
--
-- Se EXTIENDE la tabla que existe. No se crea un índice paralelo: dos catálogos del mismo
-- Drive terminan diciendo cosas distintas, que es exactamente lo que la regla contra la
-- duplicación del repo prohíbe.
--
-- Todo lo de acá es DETERMINÍSTICO: los tokens los calcula
-- orquestador/lib/drive-busqueda/normalizar.mjs, sin IA y sin red. La misma entrada da
-- siempre la misma salida, y por eso el índice se puede reconstruir de cero cuando haga falta.
--
-- Aditiva y reversible: no borra ni renombra nada de lo que ya estaba.
-- ============================================================================

-- ── 1. LAS COLUMNAS COMPARABLES DE CADA ARCHIVO ──────────────────────────────
-- `tokens` es el corazón: la lista de palabras canónicas del nombre + la ruta, ya sin
-- acentos, sin extensión, en singular y con los sinónimos resueltos. El buscador tokeniza
-- la consulta con EL MISMO módulo y cruza `tokens && array[...]`. Si las dos puntas no
-- normalizan igual, el índice y la consulta hablan idiomas distintos.
--
-- `hash` es la huella de lo indexable (nombre + ruta + fecha + mime). Existe para no
-- reescribir 2.465 filas cada 6 horas: si el hash no cambió, el archivo no cambió en nada
-- que la búsqueda pueda ver, y la fila se deja en paz.
--
-- `actualizado_at` es DISTINTO de `indexed_at`: `indexed_at` dice "lo vi en esta corrida",
-- `actualizado_at` dice "cambió". Sin los dos no se puede distinguir un archivo que nadie
-- toca hace un año de uno que el indexador dejó de ver (candidato a borrado).
alter table public.drive_index
  add column if not exists nombre_norm    text,
  add column if not exists path_norm      text,
  add column if not exists tokens         text[] not null default '{}',
  add column if not exists owner_email    text,
  add column if not exists hash           text,
  add column if not exists actualizado_at timestamptz;

-- GIN sobre el arreglo: es el índice que hace usable `tokens && array['flujo','caja']`.
-- Sin él, cada búsqueda es un seq scan sobre el catálogo entero.
create index if not exists drive_index_tokens_gin on public.drive_index using gin (tokens);
-- Btree sobre el nombre normalizado: la coincidencia exacta y el prefijo (`like 'flujo%'`),
-- que el ranking usa para poner primero al archivo que se llama así, no al que lo menciona.
create index if not exists drive_index_nombre_norm_idx on public.drive_index (nombre_norm);
create index if not exists drive_index_owner_idx on public.drive_index (lower(owner_email));

comment on column public.drive_index.tokens is
  'Palabras canónicas del nombre + la ruta, calculadas por orquestador/lib/drive-busqueda/normalizar.mjs (tokensDeArchivo). El buscador tokeniza la consulta con el MISMO módulo: si divergen, no se encuentran nunca.';
comment on column public.drive_index.hash is
  'Huella sha1 corta de (name|path|modified_time|mime_type). Si no cambió, el indexador no reescribe la fila.';
comment on column public.drive_index.actualizado_at is
  'Cuándo cambió el archivo. Distinto de indexed_at, que es cuándo se lo vio por última vez.';

-- ── 2. EL DICCIONARIO DE SINÓNIMOS, CONFIGURABLE ─────────────────────────────
-- El diccionario de fábrica vive en el código (SINONIMOS) porque el indexador y el buscador
-- lo necesitan aunque la base esté caída. Esta tabla lo EXTIENDE sin tocar código: cuando
-- alguien pide "el cash" y quiere decir "caja", eso se agrega acá y las dos puntas lo
-- levantan con `cargarSinonimos`.
--
-- `origen` separa lo que se sembró de lo que se aprendió del uso: una variante 'aprendido'
-- que resultó mala se puede sacar sin arrastrarse la semilla.
create table if not exists public.drive_alias (
  id        bigint generated always as identity primary key,
  canonico  text not null,
  variante  text not null,
  origen    text not null default 'manual' check (origen in ('semilla','aprendido','manual')),
  creado_at timestamptz not null default now(),
  unique (canonico, variante)
);
create index if not exists drive_alias_variante_idx on public.drive_alias (variante);

comment on table public.drive_alias is
  'Sinónimos de búsqueda de Drive: forma canónica ← variante. Extiende (no reemplaza) el diccionario SINONIMOS del código, que es el de fábrica.';

-- ── 3. EL APRENDIZAJE DEL USO ────────────────────────────────────────────────
-- Responde una sola pregunta, y por eso la clave es (consulta_norm, drive_file_id):
-- "para esta consulta, qué archivo se aceptó y cuántas veces". Es el desempate del ranking
-- cuando dos archivos puntúan parecido — si la última vez que alguien pidió "flujo de caja"
-- terminó abriendo ESTE, la próxima va primero.
--
-- No guarda quién preguntó ni el texto crudo: la consulta se guarda ya normalizada, así
-- "pasame el flujo de caja" y "flujo caja porfa" son la misma fila y acumulan juntas.
create table if not exists public.drive_busqueda_uso (
  id            bigint generated always as identity primary key,
  consulta_norm text not null,
  drive_file_id text not null,
  veces         int  not null default 1,
  ultima_at     timestamptz not null default now(),
  unique (consulta_norm, drive_file_id)
);
-- El orden de lectura real: dada una consulta, los más aceptados primero.
create index if not exists drive_busqueda_uso_consulta_idx
  on public.drive_busqueda_uso (consulta_norm, veces desc, ultima_at desc);

comment on table public.drive_busqueda_uso is
  'Aprendizaje del buscador de Drive: para una consulta normalizada, qué archivo se aceptó y cuántas veces. Se suma con on conflict do update set veces = veces + 1.';

-- ── 4. RLS — mismo patrón que drive_index ────────────────────────────────────
-- Lectura para `authenticated` (la web muestra resultados), escritura sólo `service_role`
-- (el indexador y el worker). Nadie escribe el catálogo desde el navegador.
alter table public.drive_alias        enable row level security;
alter table public.drive_busqueda_uso enable row level security;

grant select on public.drive_alias        to authenticated;
grant select on public.drive_busqueda_uso to authenticated;
grant select, insert, update, delete on public.drive_alias        to service_role;
grant select, insert, update, delete on public.drive_busqueda_uso to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='drive_alias' and policyname='drive_alias_read') then
    create policy drive_alias_read on public.drive_alias for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='drive_alias' and policyname='drive_alias_srv') then
    create policy drive_alias_srv on public.drive_alias for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='drive_busqueda_uso' and policyname='drive_busqueda_uso_read') then
    create policy drive_busqueda_uso_read on public.drive_busqueda_uso for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='drive_busqueda_uso' and policyname='drive_busqueda_uso_srv') then
    create policy drive_busqueda_uso_srv on public.drive_busqueda_uso for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── 5. SEMILLA DEL DICCIONARIO ───────────────────────────────────────────────
-- Es el SINONIMOS del código volcado a la base, para que el diccionario de fábrica y el
-- configurable arranquen diciendo lo mismo. `on conflict do nothing`: re-aplicar la
-- migración no pisa una variante que alguien haya reclasificado a mano.
insert into public.drive_alias (canonico, variante, origen) values
  ('flujo','flujo','semilla'),
  ('flujo','flujos','semilla'),
  ('flujo','cashflow','semilla'),
  ('flujo','cash','semilla'),
  ('flujo','cf','semilla'),
  ('caja','caja','semilla'),
  ('caja','cash','semilla'),
  ('caja','tesoreria','semilla'),
  ('vision','vision','semilla'),
  ('traccion','traccion','semilla'),
  ('estrategia','estrategia','semilla'),
  ('estrategia','estrategico','semilla'),
  ('estrategia','estrategica','semilla'),
  ('estrategia','strategy','semilla'),
  ('personal','personal','semilla'),
  ('personal','rrhh','semilla'),
  ('personal','rh','semilla'),
  ('personal','gente','semilla'),
  ('personal','empleados','semilla'),
  ('jornal','jornal','semilla'),
  ('jornal','jornales','semilla'),
  ('jornal','sueldo','semilla'),
  ('jornal','sueldos','semilla'),
  ('jornal','salario','semilla'),
  ('jornal','salarios','semilla'),
  ('obra','obra','semilla'),
  ('obra','obras','semilla'),
  ('avance','avance','semilla'),
  ('avance','avances','semilla'),
  ('avance','curva','semilla'),
  ('gasto','gasto','semilla'),
  ('gasto','gastos','semilla'),
  ('gasto','egreso','semilla'),
  ('gasto','egresos','semilla'),
  ('presupuesto','presupuesto','semilla'),
  ('presupuesto','presupuestos','semilla'),
  ('presupuesto','cotizacion','semilla'),
  ('presupuesto','cotizaciones','semilla'),
  ('cobranza','cobranza','semilla'),
  ('cobranza','cobranzas','semilla'),
  ('cobranza','cobro','semilla'),
  ('cobranza','cobros','semilla'),
  ('proveedor','proveedor','semilla'),
  ('proveedor','proveedores','semilla'),
  ('factura','factura','semilla'),
  ('factura','facturas','semilla'),
  ('factura','facturacion','semilla'),
  ('certificado','certificado','semilla'),
  ('certificado','certificados','semilla'),
  ('certificado','certificacion','semilla'),
  ('certificado','certificaciones','semilla'),
  ('banco','banco','semilla'),
  ('banco','bancario','semilla'),
  ('banco','extracto','semilla'),
  ('banco','santander','semilla'),
  ('cheque','cheque','semilla'),
  ('cheque','cheques','semilla'),
  ('cheque','echeq','semilla'),
  ('impuesto','impuesto','semilla'),
  ('impuesto','impuestos','semilla'),
  ('impuesto','iva','semilla'),
  ('impuesto','afip','semilla'),
  ('impuesto','arca','semilla'),
  ('contrato','contrato','semilla'),
  ('contrato','contratos','semilla'),
  ('balance','balance','semilla'),
  ('balance','balances','semilla'),
  ('daily','daily','semilla'),
  ('daily','diaria','semilla'),
  ('daily','diario','semilla'),
  ('control','control','semilla'),
  ('control','controles','semilla'),
  ('control','seguimiento','semilla')
on conflict (canonico, variante) do nothing;
