-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL NÚMERO DE LEGAJO — LA IDENTIDAD QUE USA LA NÓMINA, Y LA QUE VA A USAR LA LIQUIDACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La pestaña `PERSONAL` de NUEVA ASISTENCIA —la nómina vigente— identifica a cada persona por un
-- número de legajo (5, 66, 84, 81…), y JORNALES liquida por ese número. El módulo, en cambio, sólo
-- tenía el nombre, y el nombre del data room es una fiesta: «GONZALEZ TOBARES, EMILIAN» en la
-- nómina, «GONZALEZ TOBARES EMILIANO» en Drive, «GONZALEZ EMILIANO» en la base. Emparejar por
-- nombre funciona una vez y hay que volver a resolverlo cada vez.
--
-- Con el número, la próxima sincronización es exacta y no adivina nada. Y cuando exista el módulo de
-- liquidación —que va a leer las horas canónicas de `registros_hh`— la clave para cruzar con la
-- nómina va a ser ésta, no el apellido.
--
-- ÚNICO PARCIAL: dos personas no pueden compartir legajo, pero muchas pueden no tenerlo. De los 61
-- legajos del data room, 43 son de gente que ya no está y nunca va a aparecer en la nómina vigente.

alter table public.personas add column if not exists legajo text;

create unique index if not exists personas_legajo_unico
  on public.personas (legajo) where legajo is not null;

comment on column public.personas.legajo is
  'Número de legajo de la nómina (pestaña PERSONAL de NUEVA ASISTENCIA). Es la clave con la que '
  'liquida JORNALES. Puede faltar: quien ya no está no figura en la nómina vigente.';

grant select (legajo) on public.personas to authenticated;
