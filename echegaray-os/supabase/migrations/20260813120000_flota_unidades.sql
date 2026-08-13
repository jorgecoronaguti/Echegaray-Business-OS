-- GENERADO por orquestador/scripts/generar-migracion-flota.mjs — NO EDITAR A MANO.
-- La fuente es orquestador/lib/flota-unidades.mjs. Para cambiar algo: se cambia el catálogo y se
-- vuelve a generar. Un test verifica que este archivo esté al día con el catálogo.
--
-- QUÉ RESUELVE. `public.equipos` ya existía (6 vehículos sembrados desde la carpeta VEHICULOS de
-- Drive) pero le faltaba todo lo que hace falta para imputar un costo: las máquinas (Bobcat,
-- autoelevador), la distinción entre unidad propia y alquilada, y sobre todo los ALIAS — las formas
-- en que el dueño escribe cada unidad en el tique, que son el único puente entre el gasto y la
-- unidad. Sin alias, el costo por unidad se calcula con un CASE improvisado distinto cada vez.
--
-- NO IMPUTA A OBRA. El 18/07 el dueño fijó "Vehículos" y "Crédito Prendario" como costo INDIRECTO:
-- la obra que la vista devuelve es DÓNDE SE USÓ la unidad, no a qué obra se carga la plata.

-- ── 1 · equipos: las columnas que faltaban ──
alter table public.equipos add column if not exists clave text;
alter table public.equipos add column if not exists serie text;
alter table public.equipos add column if not exists fuente_evidencia text;
-- El check original sólo admitía vehiculo/maquinaria/herramienta_mayor: no tenía dónde poner una
-- minicargadora propia ni una plataforma alquilada, que es la mitad del costo de flota del año.
alter table public.equipos drop constraint if exists equipos_tipo_check;
alter table public.equipos add constraint equipos_tipo_check
  check (tipo in ('vehiculo', 'maquina', 'maquinaria', 'herramienta_mayor', 'equipo_menor', 'alquilada'));

-- Las 6 filas que ya existen se enganchan por patente (y el camión por nombre: se sembró sin
-- patente porque su RTO no se había leído todavía).
update public.equipos e set clave = c.clave
  from (values
  ('ford-f100', 'Ford F100', 'vehiculo', 'AXH205', null, 'administracion/VEHICULOS/FORD F100 AXH205 (cédula verde, título, RTO marzo 26)'),
  ('ford-xls', 'Ford Ranger XLS', 'vehiculo', 'AG503PV', null, 'administracion/VEHICULOS/FORD XLS AG503PV (Drive) + tabla public.equipos'),
  ('hilux-nmn898', 'Toyota Hilux NMN898', 'vehiculo', 'NMN898', null, 'administracion/VEHICULOS/TOYOTA HILUX NMN 898 (título) + tabla public.equipos'),
  ('hilux-eea885', 'Toyota Hilux EEA885', 'vehiculo', 'EEA885', null, 'administracion/VEHICULOS/TOYOTA HILUX EEA-885 (título, RTO, ÚNICA póliza archivada)'),
  ('hilux-ad119yo', 'Toyota Hilux AD119YO', 'vehiculo', 'AD119YO', null, 'administracion/VEHICULOS/TOYOTA HILUX AD119YO (cédula verde + RTO, título)'),
  ('camion-608d', 'Camión Mercedes Benz 608D', 'vehiculo', 'VOI440', null, 'administracion/VEHICULOS/Mercedes 608D/RTO - VOI440 Marzo 26.pdf (nombre de archivo)'),
  ('bobcat-s650', 'Minicargadora Bobcat S650', 'maquina', null, 'A3NV25954', 'factura Gruas San Blas 31/07/2026 (remitos OTX 00018-14201, PSX 00010-59693/58047)'),
  ('autoelevador', 'Autoelevador', 'maquina', null, null, 'comprobantes de combustible (Barcelo / Nuevo Cuyo / Villa del Pino) — sin documentación registral vista'),
  ('tijera', 'Plataforma tijera 4x4 (alquilada a DUPEC)', 'alquilada', null, null, 'facturas DUPEC "ALQUILER TIJERA 4X4" + tiques de combustible ("TIJERA", "TIJE / AUTOELEVADOR")'),
  ('cortadora-pisos', 'Cortadora de pisos', 'equipo_menor', null, null, 'comprobantes de combustible ("CORTADORA DE PISOS", "Combustible para cortadora")'),
  ('canguro', 'Compactador canguro', 'equipo_menor', null, null, 'comprobantes de combustible ("Combustible para canguro")'),
  ('vibro', 'Vibrocompactador', 'equipo_menor', null, null, 'comprobante de combustible del 03/06/2026 ("Nafta para Vibro")'),
  ('excavadora-alquilada', 'Mini excavadora (alquilada a DUPEC)', 'alquilada', null, null, 'facturas DUPEC (Wacker Neuson ET35 / EZ17) — equipo de tercero, no de la empresa')
  ) as c(clave, nombre, tipo, patente, serie, fuente)
 where e.clave is null and e.patente_o_identificador = c.patente;
update public.equipos set clave = 'camion-608d'
 where clave is null and nombre = 'Mercedes Benz 608D';

create unique index if not exists equipos_clave_unique on public.equipos (clave) where clave is not null;

-- ── 2 · el catálogo completo (upsert idempotente por clave) ──
insert into public.equipos (clave, nombre, tipo, patente_o_identificador, serie, fuente_evidencia, fuente_legacy)
select v.clave, v.nombre, v.tipo, v.patente, v.serie, v.fuente, 'flota-unidades.mjs'
  from (values
  ('ford-f100', 'Ford F100', 'vehiculo', 'AXH205', null, 'administracion/VEHICULOS/FORD F100 AXH205 (cédula verde, título, RTO marzo 26)'),
  ('ford-xls', 'Ford Ranger XLS', 'vehiculo', 'AG503PV', null, 'administracion/VEHICULOS/FORD XLS AG503PV (Drive) + tabla public.equipos'),
  ('hilux-nmn898', 'Toyota Hilux NMN898', 'vehiculo', 'NMN898', null, 'administracion/VEHICULOS/TOYOTA HILUX NMN 898 (título) + tabla public.equipos'),
  ('hilux-eea885', 'Toyota Hilux EEA885', 'vehiculo', 'EEA885', null, 'administracion/VEHICULOS/TOYOTA HILUX EEA-885 (título, RTO, ÚNICA póliza archivada)'),
  ('hilux-ad119yo', 'Toyota Hilux AD119YO', 'vehiculo', 'AD119YO', null, 'administracion/VEHICULOS/TOYOTA HILUX AD119YO (cédula verde + RTO, título)'),
  ('camion-608d', 'Camión Mercedes Benz 608D', 'vehiculo', 'VOI440', null, 'administracion/VEHICULOS/Mercedes 608D/RTO - VOI440 Marzo 26.pdf (nombre de archivo)'),
  ('bobcat-s650', 'Minicargadora Bobcat S650', 'maquina', null, 'A3NV25954', 'factura Gruas San Blas 31/07/2026 (remitos OTX 00018-14201, PSX 00010-59693/58047)'),
  ('autoelevador', 'Autoelevador', 'maquina', null, null, 'comprobantes de combustible (Barcelo / Nuevo Cuyo / Villa del Pino) — sin documentación registral vista'),
  ('tijera', 'Plataforma tijera 4x4 (alquilada a DUPEC)', 'alquilada', null, null, 'facturas DUPEC "ALQUILER TIJERA 4X4" + tiques de combustible ("TIJERA", "TIJE / AUTOELEVADOR")'),
  ('cortadora-pisos', 'Cortadora de pisos', 'equipo_menor', null, null, 'comprobantes de combustible ("CORTADORA DE PISOS", "Combustible para cortadora")'),
  ('canguro', 'Compactador canguro', 'equipo_menor', null, null, 'comprobantes de combustible ("Combustible para canguro")'),
  ('vibro', 'Vibrocompactador', 'equipo_menor', null, null, 'comprobante de combustible del 03/06/2026 ("Nafta para Vibro")'),
  ('excavadora-alquilada', 'Mini excavadora (alquilada a DUPEC)', 'alquilada', null, null, 'facturas DUPEC (Wacker Neuson ET35 / EZ17) — equipo de tercero, no de la empresa')
  ) as v(clave, nombre, tipo, patente, serie, fuente)
on conflict (clave) do update set
  nombre = excluded.nombre,
  tipo = excluded.tipo,
  patente_o_identificador = coalesce(excluded.patente_o_identificador, public.equipos.patente_o_identificador),
  serie = excluded.serie,
  fuente_evidencia = excluded.fuente_evidencia;

comment on column public.equipos.fuente_evidencia is
  'De dónde salió el identificador de esta unidad (papel de Drive o comprobante). Sin fuente, el dato no se declara.';

-- ── 3 · los alias: cómo escribe el dueño cada unidad ──
create table if not exists public.equipo_alias (
  alias text not null,
  clase text not null check (clase in ('palabra', 'identificador')),
  equipo_clave text not null,
  primary key (alias, clase)
);
comment on table public.equipo_alias is
  'Texto → unidad de flota. clase=palabra se busca con borde de palabra ("camion" NO matchea "camioneta"); clase=identificador se busca como substring del texto compactado ("AD 119 YO" = "ad119yo").';

delete from public.equipo_alias;
insert into public.equipo_alias (alias, equipo_clave, clase) values
  ('ford f100', 'ford-f100', 'palabra'),
  ('f 100', 'ford-f100', 'palabra'),
  ('axh205', 'ford-f100', 'identificador'),
  ('fordf100', 'ford-f100', 'identificador'),
  ('ford xls', 'ford-xls', 'palabra'),
  ('xls', 'ford-xls', 'palabra'),
  ('camioneta ford', 'ford-xls', 'palabra'),
  ('ag503pv', 'ford-xls', 'identificador'),
  ('fordxls', 'ford-xls', 'identificador'),
  ('nmn898', 'hilux-nmn898', 'identificador'),
  ('mnm898', 'hilux-nmn898', 'identificador'),
  ('eea', 'hilux-eea885', 'palabra'),
  ('eea885', 'hilux-eea885', 'identificador'),
  ('eea88s', 'hilux-eea885', 'identificador'),
  ('ad119yo', 'hilux-ad119yo', 'identificador'),
  ('camion', 'camion-608d', 'palabra'),
  ('mercedes', 'camion-608d', 'palabra'),
  ('mercedes benz', 'camion-608d', 'palabra'),
  ('608 d', 'camion-608d', 'palabra'),
  ('608d', 'camion-608d', 'identificador'),
  ('voi440', 'camion-608d', 'identificador'),
  ('bobcat', 'bobcat-s650', 'palabra'),
  ('s650', 'bobcat-s650', 'identificador'),
  ('a3nv25954', 'bobcat-s650', 'identificador'),
  ('autoelevador', 'autoelevador', 'palabra'),
  ('auto elevador', 'autoelevador', 'palabra'),
  ('autoelevador', 'autoelevador', 'identificador'),
  ('tijera', 'tijera', 'palabra'),
  ('tije', 'tijera', 'palabra'),
  ('cortadora', 'cortadora-pisos', 'palabra'),
  ('cortadora de pisos', 'cortadora-pisos', 'palabra'),
  ('canguro', 'canguro', 'palabra'),
  ('vibro', 'vibro', 'palabra'),
  ('excavadora', 'excavadora-alquilada', 'palabra'),
  ('mini excavadora', 'excavadora-alquilada', 'palabra'),
  ('retro excavadora', 'excavadora-alquilada', 'palabra'),
  ('retroexcavadora', 'excavadora-alquilada', 'palabra'),
  ('retro', 'excavadora-alquilada', 'palabra');

alter table public.equipo_alias enable row level security;
drop policy if exists equipo_alias_select on public.equipo_alias;
create policy equipo_alias_select on public.equipo_alias for select to authenticated using (true);
drop policy if exists equipo_alias_write on public.equipo_alias;
create policy equipo_alias_write on public.equipo_alias
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));
grant select, insert, update, delete on public.equipo_alias to authenticated;

-- ── 4 · qué unidades nombra un texto ──
-- Devuelve TODAS, nunca "la primera que matchea": con dos unidades nombradas ("50L C/U bobcat y
-- camion") no hay forma de repartir sin los litros de cada una, y darle el 100% a una sería inventar.
create or replace function public.unidades_flota_nombradas(txt text)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% ford f100 %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% f 100 %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%axh205%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%fordf100%' then 'ford-f100' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% ford xls %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% xls %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% camioneta ford %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%ag503pv%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%fordxls%' then 'ford-xls' end,
    case when regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%nmn898%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%mnm898%' then 'hilux-nmn898' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% eea %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%eea885%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%eea88s%' then 'hilux-eea885' end,
    case when regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%ad119yo%' then 'hilux-ad119yo' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% camion %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% mercedes %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% mercedes benz %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% 608 d %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%608d%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%voi440%' then 'camion-608d' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% bobcat %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%s650%' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%a3nv25954%' then 'bobcat-s650' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% autoelevador %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% auto elevador %' or regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', '', 'g') like '%autoelevador%' then 'autoelevador' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% tijera %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% tije %' then 'tijera' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% cortadora %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% cortadora de pisos %' then 'cortadora-pisos' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% canguro %' then 'canguro' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% vibro %' then 'vibro' end,
    case when ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% excavadora %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% mini excavadora %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% retro excavadora %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% retroexcavadora %' or ' ' || regexp_replace(lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '[^a-z0-9]+', ' ', 'g') || ' ' like '% retro %' then 'excavadora-alquilada' end
  ], null);
$$;

comment on function public.unidades_flota_nombradas(text) is
  'Texto de concepto → array de claves de unidad nombradas. 0 = no dice; 1 = atribuible; 2+ = carga compartida, NO se reparte.';

-- ── 5 · la vista que la web y el chat leen ──
-- Sólo atribuye con exactamente una unidad nombrada. El resto queda con equipo_clave null y su
-- causa a la vista: ese renglón es el que mide si la medición sirve, no un residuo a esconder.
create or replace view public.flota_gasto_unidad as
select
  c.id,
  c.fecha,
  c.proveedor,
  c.concepto,
  c.obra_texto,
  c.total,
  u.claves,
  case when array_length(u.claves, 1) = 1 then u.claves[1] end as equipo_clave,
  case
    when array_length(u.claves, 1) = 1 then null
    when array_length(u.claves, 1) > 1 then 'compartido'
    else 'sin_unidad'
  end as causa
from public.costos_obra c
cross join lateral (select public.unidades_flota_nombradas(c.concepto) as claves) u;

comment on view public.flota_gasto_unidad is
  'Cada gasto de Compras con la unidad de flota que nombra. La partición completa (componentes de costo, herencia del prendario, real vs comprometido) vive en orquestador/lib/flota-costos.mjs.';
