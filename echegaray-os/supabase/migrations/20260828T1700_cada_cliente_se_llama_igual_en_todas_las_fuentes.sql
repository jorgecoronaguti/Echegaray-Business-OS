-- EL MISMO CLIENTE, UN SOLO NOMBRE — pase por donde pase.
--
-- POR QUÉ EXISTE (28/08/2026). Cada sistema le pone otro rótulo al mismo cliente: JORNALES escribe
-- «JAVIER SANCHEZ», Compras escribe «San Francisco», el OS lo llama `san-francisco`. Ninguna fuente
-- usa los dos nombres, así que el cruce NO sale de los datos: sale de una decisión que el dueño ya
-- tomó el 24/08/2026 y que estaba enterrada en una nota de cobranzas.
--
-- Consecuencia medida: un informe de costos por obra contestó «no se pudo atribuir» la mano de obra,
-- y al rehacerlo se volvió a deducir la equivalencia desde cero y se entregó como «inferencia mía,
-- confirmame». El dueño: «no estás usando la memoria, esto es algo sabido de hace mucho». Deducir
-- dos veces lo mismo no es prudencia: es hacerle contestar dos veces la misma pregunta.
--
-- Por eso vive en Postgres y no en una constante del código: lo consumen varias caras (el bot, los
-- scripts del orquestador, la web) y un concepto crítico se define UNA vez.
--
-- LO QUE ESTA TABLA NO ES: no es un diccionario de sinónimos que alguien pueda ampliar de memoria.
-- Cada fila lleva QUIÉN lo decidió y CUÁNDO. Un rótulo nuevo que aparezca en una fuente y no esté
-- acá se reporta como DESCONOCIDO —nunca se adivina por parecido— porque «MESSINA» y «MESSINAS»
-- se parecen, y en la planilla real son la diferencia entre $ 1.333.000 y cero.

create table if not exists public.cliente_alias (
  fuente            text not null check (fuente in ('JORNALES', 'COMPRAS', 'OS', 'DRIVE')),
  rotulo            text not null,                 -- tal cual está escrito en la fuente
  rotulo_clave      text not null,                 -- normalizado: sin acentos, sin dobles espacios, en mayúsculas
  cliente_canonico  text not null,
  decidido_por      text not null,
  decidido_en       date not null,
  nota              text,
  primary key (fuente, rotulo_clave)
);

comment on table public.cliente_alias is
  'Cómo se llama cada cliente en cada fuente. Un rótulo que no esté acá es DESCONOCIDO, nunca se resuelve por parecido: MESSINA y MESSINAS difieren en una letra y en $ 1.333.000.';
comment on column public.cliente_alias.rotulo_clave is
  'Clave de comparación normalizada. La escritura original se conserva en `rotulo` porque es lo que el jefe de obra reconoce.';
comment on column public.cliente_alias.decidido_por is
  'Quién resolvió la equivalencia. Sin esto, la tabla se vuelve un diccionario que cualquiera amplía de memoria.';

insert into public.cliente_alias (fuente, rotulo, rotulo_clave, cliente_canonico, decidido_por, decidido_en, nota) values
  ('JORNALES', 'JAVIER SANCHEZ', 'JAVIER SANCHEZ', 'SAN FRANCISCO', 'dueño', '2026-08-24',
   'San Francisco = Javier Sánchez / IMOTOR. Decisión registrada en las definiciones de Cobranzas del 24/08/2026.'),
  ('COMPRAS',  'San Francisco',  'SAN FRANCISCO',  'SAN FRANCISCO', 'dueño', '2026-08-24', null),
  ('OS',       'san-francisco',  'SAN-FRANCISCO',  'SAN FRANCISCO', 'dueño', '2026-08-24',
   'Galpones, Mampostería, Cancha de Padel. Las otras obras del mismo cliente: pisos-industriales, instalacion-electrica, entrepiso-y-escalera.'),

  ('JORNALES', 'LA ESTRELLA', 'LA ESTRELLA', 'LA ESTRELLA', 'dueño', '2026-08-24', null),
  ('COMPRAS',  'LA ESTRELLA', 'LA ESTRELLA', 'LA ESTRELLA', 'dueño', '2026-08-24', null),
  ('OS',       'la-estrella',  'LA-ESTRELLA', 'LA ESTRELLA', 'dueño', '2026-08-24',
   'La venta vive a nivel sub-obra (le-galpon-9, le-comedor), no a nivel cliente.'),

  ('JORNALES', 'MESSINA',  'MESSINA',  'MESSINA', 'dueño', '2026-08-24', null),
  ('JORNALES', 'MESSINAS', 'MESSINAS', 'MESSINA', 'dueño', '2026-08-24',
   'La planilla escribe las dos formas. El resumen por cliente busca MESSINAS y las filas dicen MESSINA: en la quincena del 17/08 eso dejó $ 1.333.000 fuera del total.'),
  ('COMPRAS',  'MESSINA',  'MESSINA',  'MESSINA', 'dueño', '2026-08-24', null),
  ('OS',       'messina',  'MESSINA',  'MESSINA', 'dueño', '2026-08-24',
   'BSA es obra de Messina, no cliente propio: los 11 comprobantes de BSA de 2026 están todos bajo obra_texto = MESSINA.'),

  ('JORNALES', 'QUATTROPANI', 'QUATTROPANI', 'QUATTROPANI', 'dueño', '2026-08-24', null),
  ('COMPRAS',  'Quattropani - Melisa García SAS', 'QUATTROPANI - MELISA GARCIA SAS', 'QUATTROPANI', 'dueño', '2026-08-24', null),
  ('OS',       'quattropani', 'QUATTROPANI', 'QUATTROPANI', 'dueño', '2026-08-24', 'Salón Comercial.'),

  ('JORNALES', 'ARCOR', 'ARCOR', 'ARCOR', 'dueño', '2026-08-24', null),
  ('COMPRAS',  'ARCOR', 'ARCOR', 'ARCOR', 'dueño', '2026-08-24', null),
  ('OS',       'arcor', 'ARCOR', 'ARCOR', 'dueño', '2026-08-24', null)
on conflict (fuente, rotulo_clave) do nothing;

-- RÓTULOS QUE NO SON UN CLIENTE. Existen en la columna CLIENTE de JORNALES y no hay que
-- atribuirlos a ninguna obra: `z. ENFERMEDAD` son horas pagadas que ninguna obra causó.
-- Se declaran acá para que el motor los separe en vez de inventarles un dueño.
create table if not exists public.rotulo_no_es_cliente (
  fuente       text not null check (fuente in ('JORNALES', 'COMPRAS', 'OS', 'DRIVE')),
  rotulo_clave text not null,
  motivo       text not null,
  primary key (fuente, rotulo_clave)
);

comment on table public.rotulo_no_es_cliente is
  'Rótulos que ocupan la columna de cliente sin serlo. Separarlos NO los borra: su costo existe y se informa aparte.';

insert into public.rotulo_no_es_cliente (fuente, rotulo_clave, motivo) values
  ('JORNALES', 'Z. ENFERMEDAD', 'Horas pagadas por enfermedad. Es costo real de la empresa que ninguna obra causó.')
on conflict (fuente, rotulo_clave) do nothing;

grant select on public.cliente_alias to authenticated;
grant select on public.rotulo_no_es_cliente to authenticated;
alter table public.cliente_alias enable row level security;
alter table public.rotulo_no_es_cliente enable row level security;

drop policy if exists cliente_alias_lectura on public.cliente_alias;
create policy cliente_alias_lectura on public.cliente_alias
  for select to authenticated using (true);

drop policy if exists rotulo_no_es_cliente_lectura on public.rotulo_no_es_cliente;
create policy rotulo_no_es_cliente_lectura on public.rotulo_no_es_cliente
  for select to authenticated using (true);
