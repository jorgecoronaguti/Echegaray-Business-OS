-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA POLÍTICA COMERCIAL SE REFERENCIA POR VERSIÓN, Y EL INDIRECTO TIENE ESTRUCTURA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ADITIVA: seis tablas nuevas, tres columnas nuevas sobre una tabla VACÍA, y ni una sola columna
-- eliminada. `cotizaciones` conserva sus ocho porcentajes copiados y `parametro_comercial` sigue
-- exactamente igual: lo que está andando hoy sigue andando.
--
-- ═══ POR QUÉ REFERENCIA Y NO COPIA ═══
--
-- `cotizaciones` copia los ocho porcentajes a columnas propias. La copia resuelve un problema real
-- —una obra negocia distinto sin obligar a versionar la política de la empresa— y crea otro: ocho
-- números sueltos en una fila NO dicen qué se negoció ni quién lo autorizó. Sobre 64 cotizaciones
-- históricas medidas, los porcentajes difieren entre obras y no hay una línea que explique por qué.
--
-- Acá la cotización guarda dos cosas: la REFERENCIA a la versión y sus OVERRIDES con autor, motivo y
-- evidencia. El resultado numérico es idéntico al de copiar, y además contesta «¿de dónde salió este
-- 19 %?». La copia queda como está: las dos conviven hasta que el dueño decida retirarla, y mientras
-- tanto un test compara que digan lo mismo.
--
-- ═══ POR QUÉ UNA VERSIÓN PUBLICADA NO SE PUEDE EDITAR ═══
--
-- Si se pudiera, «la cotización referencia la v1» no garantizaría nada: alguien edita la v1 y el
-- precio de una oferta ya emitida cambia solo. La inmutabilidad NO la puede dar el código —`pg.mjs`
-- escribe con el pool del servidor, sin RLS—: la da la policy de UPDATE, que sólo deja tocar lo que
-- está en BORRADOR. Para cambiar una política publicada se crea la siguiente.
--
-- ═══ QUÉ ENCONTRÓ ESTA MIGRACIÓN AL MIRAR LO QUE YA EXISTE ═══
--
-- · `indirecto_concepto` (creada el 29/08) tiene **0 filas**, así que `indirectos()` devuelve
--   FALTA_DATO en toda corrida real desde que existe.
-- · Y no tenía DENOMINADOR: guarda `monto_anual` y no el costo directo anual sobre el que se
--   prorratea. Con montos y sin denominador el porcentaje no se puede calcular por más conceptos
--   que se carguen. Ahora el denominador vive en `indirecto_estructura`.
-- · `monto_anual` era NOT NULL, o sea que un concepto cuyo monto nadie midió sólo se podía declarar
--   mintiendo que vale 0 — el mismo cero que el hallazgo INDIRECTO_SIEMPRE_EN_CERO marca en 29
--   conceptos sobre 64 cotizaciones. Se relaja: NULL es el hueco, 0 es la decisión.

-- ── 1 · LA POLÍTICA, VERSIONADA ───────────────────────────────────────────────────────────────

create table if not exists public.politica_comercial_version (
  id                    uuid primary key default gen_random_uuid(),
  version               int  not null,
  estado                text not null default 'BORRADOR'
                          check (estado in ('BORRADOR', 'PUBLICADA', 'REEMPLAZADA')),
  vigente               boolean not null default false,
  vigencia_desde        date not null default current_date,
  vigencia_hasta        date,
  fuente                text not null,
  notas                 text,
  publicada_por         uuid default auth.uid(),
  publicada_por_declarado text,
  publicada_en          timestamptz,
  creado_en             timestamptz not null default now(),
  constraint politica_version_unica unique (version),
  constraint politica_vigencia_coherente check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  -- Una política PUBLICADA sin firma no se puede oponer a nadie. El campo declarado existe para la
  -- siembra, que la corre una migración y no una persona: dice quién decidió, no finge un uuid.
  constraint politica_publicada_tiene_firma
    check (estado <> 'PUBLICADA' or publicada_por is not null or publicada_por_declarado is not null),
  constraint politica_vigente_esta_publicada check (not vigente or estado = 'PUBLICADA')
);

create unique index if not exists politica_comercial_una_vigente
  on public.politica_comercial_version (vigente) where vigente;

comment on table public.politica_comercial_version is
  'Las versiones de la política comercial de la empresa. Una cotización REFERENCIA una versión y '
  'guarda aparte sus overrides: así el precio de una oferta emitida no cambia cuando la empresa '
  'cambia su política, y además se puede contestar qué se negoció y quién lo autorizó. Una versión '
  'PUBLICADA es INMUTABLE — la policy de UPDATE sólo deja tocar BORRADOR.';

create table if not exists public.politica_comercial_componente (
  id                    uuid primary key default gen_random_uuid(),
  politica_version_id   uuid not null references public.politica_comercial_version (id) on delete cascade,
  concepto              text not null
                          check (concepto in ('BENEFICIO','RIESGO','CONTINGENCIA','FINANCIACION','IMPUESTOS','OTROS')),
  clave                 text not null,
  -- NULLABLE A PROPÓSITO: «la empresa no decidió este número» NO es «este número es cero». Riesgo y
  -- contingencia entran así, y un 0 ahí diría que la empresa no cobra riesgo, que es otra cosa.
  valor                 numeric check (valor is null or valor >= 0),
  normativo             boolean not null default false,
  fuente                text not null,
  estado                text not null default 'CONFIRMADO'
                          check (estado in ('CONFIRMADO','EXTRAIDO','CALCULADO','PROPUESTO','FALTA_DATO','CONFLICTO')),
  conflicto             text,
  notas                 text,
  constraint politica_componente_unico unique (politica_version_id, clave),
  -- Un conflicto no se resuelve cambiándole el rótulo al estado.
  constraint politica_conflicto_coherente check ((conflicto is null) = (estado <> 'CONFLICTO'))
);

comment on column public.politica_comercial_componente.valor is
  'NULL ≠ 0. Un componente sin valor es una decisión que la empresa no tomó; un 0 es la decisión de '
  'no cobrar ese concepto. El motor los distingue y ninguno de los dos se convierte en el otro.';
comment on column public.politica_comercial_componente.clave is
  'pct_gastos_generales NO es una clave de acá: el indirecto se CALCULA sobre indirecto_estructura y '
  'entra a la cascada como resultado, no como decisión comercial.';

-- ── 2 · LA COTIZACIÓN REFERENCIA UNA VERSIÓN ──────────────────────────────────────────────────

create table if not exists public.cotizacion_politica_ref (
  cotizacion_id         uuid primary key references public.cotizaciones (id) on delete cascade,
  politica_version_id   uuid not null references public.politica_comercial_version (id),
  -- El NÚMERO además del id, para que la referencia se lea sin un join y para que un cambio de id
  -- no pueda repuntar la cotización a otra versión sin dejar rastro.
  version               int not null,
  congelada_en          timestamptz,
  creado_en             timestamptz not null default now()
);

comment on table public.cotizacion_politica_ref is
  'A qué versión de la política se apoya esta cotización. Se resuelve POR NÚMERO, nunca por «la '
  'vigente»: ese atajo haría que publicar una política nueva reescribiera el precio de cada oferta '
  'ya emitida.';

create table if not exists public.cotizacion_politica_override (
  id                    uuid primary key default gen_random_uuid(),
  cotizacion_id         uuid not null references public.cotizaciones (id) on delete cascade,
  clave                 text not null,
  valor                 numeric not null check (valor >= 0),
  -- LOS CUATRO SIN LOS QUE NO SE APLICA. No es formalismo: el 27 % de gastos generales llegó a la
  -- base sin ninguno de los cuatro y hoy nadie puede decir quién redondeó el 26,98 % ni por qué.
  autorizado_por        uuid not null default auth.uid(),
  motivo                text not null check (length(btrim(motivo)) > 0),
  evidencia             text not null check (length(btrim(evidencia)) > 0),
  fecha                 date not null default current_date,
  creado_en             timestamptz not null default now(),
  constraint override_unico_por_clave unique (cotizacion_id, clave)
);

comment on table public.cotizacion_politica_override is
  'Lo que ESTA cotización negoció sobre la política que referencia, con autor, motivo, evidencia y '
  'fecha. Sin los cuatro la fila no entra: los CHECK y el NOT NULL lo imponen en la base, no en una '
  'convención de JavaScript. El IVA no puede estar acá — es normativo y lo bloquea el trigger.';

-- El IVA es lo único normativo de la cascada: no se negocia por cotización. Si cambió la alícuota,
-- cambia la política de la empresa, que es otra acción con otro permiso.
create or replace function public.cot_override_no_normativo() returns trigger
language plpgsql as $$
begin
  if new.clave in ('pctIva', 'pct_iva') then
    raise exception 'el IVA es NORMATIVO: no se negocia por cotización. Si cambió la alícuota, cambia la política de la empresa';
  end if;
  return new;
end $$;

drop trigger if exists cot_override_no_normativo_trg on public.cotizacion_politica_override;
create trigger cot_override_no_normativo_trg
  before insert or update on public.cotizacion_politica_override
  for each row execute function public.cot_override_no_normativo();

-- ── 3 · LA ESTRUCTURA DE INDIRECTOS ───────────────────────────────────────────────────────────

create table if not exists public.indirecto_estructura (
  id                    uuid primary key default gen_random_uuid(),
  version               int not null,
  vigente               boolean not null default false,
  vigencia_desde        date not null default current_date,
  -- EL DENOMINADOR QUE FALTABA. Sin él, `monto_anual` no se puede convertir en porcentaje y el
  -- indirecto no se calcula por más conceptos que se carguen. NULLABLE porque hoy NO se conoce:
  -- ponerle un número para que la cuenta cierre sería fabricar la base del precio de la empresa.
  costo_directo_anual   numeric check (costo_directo_anual is null or costo_directo_anual > 0),
  fuente                text not null,
  notas                 text,
  creado_en             timestamptz not null default now(),
  constraint indirecto_estructura_version_unica unique (version)
);

create unique index if not exists indirecto_estructura_una_vigente
  on public.indirecto_estructura (vigente) where vigente;

comment on column public.indirecto_estructura.costo_directo_anual is
  'El costo directo anual de la empresa: el denominador del prorrateo. En NULL mientras no se mida. '
  'Con montos anuales y sin denominador el porcentaje NO se calcula, y el motor lo dice en vez de '
  'repartir la estructura de un año entero sobre una obra sola.';

-- `indirecto_concepto` existe desde la 20260829T1200 con 0 filas y nada la consume: se amplía en vez
-- de duplicarla, que sería crear dos definiciones del mismo concepto.
alter table public.indirecto_concepto add column if not exists estructura_id uuid references public.indirecto_estructura (id) on delete cascade;
alter table public.indirecto_concepto add column if not exists bloque text not null default 'EMPRESA';
alter table public.indirecto_concepto add column if not exists base   text not null default 'PRORRATEO_ANUAL';
alter table public.indirecto_concepto add column if not exists pct    numeric;
alter table public.indirecto_concepto add column if not exists monto  numeric;

-- ═══ EL NOT NULL DE `monto_anual` OBLIGABA A MENTIR ═══
-- Un concepto cuyo monto nadie midió sólo se podía declarar poniéndole 0, y un 0 es una afirmación
-- distinta: «esta obra no lleva agua de construcción» no es «nadie cargó cuánto sale el agua». La
-- tabla está vacía, así que relajarlo no toca ningún dato.
alter table public.indirecto_concepto alter column monto_anual drop not null;

alter table public.indirecto_concepto drop constraint if exists indirecto_concepto_bloque_valido;
alter table public.indirecto_concepto add  constraint indirecto_concepto_bloque_valido check (bloque in ('OBRA','EMPRESA'));
alter table public.indirecto_concepto drop constraint if exists indirecto_concepto_base_valida;
alter table public.indirecto_concepto add  constraint indirecto_concepto_base_valida check (base in ('PRORRATEO_ANUAL','PCT_COSTO_DIRECTO','MONTO_POR_OBRA'));
-- El valor tiene que ir en el campo de SU base. Sin esto, un concepto declara base porcentual y trae
-- un monto anual, y el cálculo lo ignora en silencio.
alter table public.indirecto_concepto drop constraint if exists indirecto_concepto_valor_en_su_campo;
alter table public.indirecto_concepto add  constraint indirecto_concepto_valor_en_su_campo check (
  (base = 'PRORRATEO_ANUAL'    and pct is null   and monto is null)
  or (base = 'PCT_COSTO_DIRECTO'  and monto_anual is null and monto is null)
  or (base = 'MONTO_POR_OBRA'     and monto_anual is null and pct is null));

comment on column public.indirecto_concepto.base is
  'Sobre qué se apoya el monto. La hoja GG del libro tiene DOS bloques con bases distintas: los '
  'gastos comunes de obra van en $ (meses de obrador, raciones de comida) y los gastos generales de '
  'la empresa en % del costo directo. Es la misma columna del Excel con dos significados, y sin este '
  'campo se promedian meses con porcentajes.';

-- ── 4 · EL INDIRECTO DE UNA COTIZACIÓN: CALCULADO Y APLICADO, LOS DOS ─────────────────────────

create table if not exists public.cotizacion_indirecto (
  cotizacion_id         uuid primary key references public.cotizaciones (id) on delete cascade,
  estructura_id         uuid references public.indirecto_estructura (id),
  pct_calculado         numeric check (pct_calculado is null or pct_calculado >= 0),
  pct_aplicado          numeric check (pct_aplicado  is null or pct_aplicado  >= 0),
  override_actor        uuid,
  override_motivo       text,
  override_evidencia    text,
  override_fecha        date,
  creado_en             timestamptz not null default now(),
  -- O no hay override, o están los CUATRO. Un porcentaje sin quién, por qué, cuándo y contra qué no
  -- se puede defender, y es exactamente como el 27 % llegó a la tabla.
  constraint indirecto_override_completo check (
    (override_actor is null and override_motivo is null and override_evidencia is null and override_fecha is null)
    or (override_actor is not null and override_motivo is not null and override_evidencia is not null and override_fecha is not null)),
  -- El aplicado sólo puede diferir del calculado si hay override. Sin esto, el campo `pct_aplicado`
  -- sería un lugar más donde tipear un porcentaje sin explicarlo.
  constraint indirecto_aplicado_explicado check (
    pct_aplicado is null or pct_calculado is null or pct_aplicado = pct_calculado or override_actor is not null)
);

comment on table public.cotizacion_indirecto is
  'El indirecto CALCULADO y el APLICADO de una cotización, los dos, siempre. La diferencia entre '
  'ellos es una decisión que se puede mirar: una obra que aplica menos indirecto del que su '
  'estructura explica parece rentable y no lo es.';

-- ── 5 · LA VIGENCIA DE UN SUBCONTRATO, POR TIPO ───────────────────────────────────────────────
-- El 180 plano salía de `dias_precio_aceptable`, que es el corte de un PRECIO DE LISTA. Un
-- subcontrato es una OFERTA de un tercero y declara su propia validez. Cuando el documento la
-- declara, manda el documento; cuando no, hace falta un default POR TIPO — y los defaults por tipo
-- NO están medidos, así que se siembra sólo el general y las filas por tipo las decide el dueño.
create table if not exists public.subcontrato_vigencia_default (
  tipo                  text primary key,
  dias                  int not null check (dias > 0),
  fuente                text not null,
  estado                text not null default 'PROPUESTO'
                          check (estado in ('CONFIRMADO','PROPUESTO','FALTA_DATO')),
  notas                 text,
  creado_en             timestamptz not null default now()
);

comment on table public.subcontrato_vigencia_default is
  'Cuántos días vale la cotización de un subcontratista cuando el documento no lo dice, por tipo de '
  'trabajo. Un tipo sin fila cae en GENERAL y el motor DECLARA que ese vencimiento es un supuesto: '
  'no se inventan defaults por tipo que nadie midió.';

-- ── 6 · LA SIEMBRA — de lo que YA está en la base, no de números nuevos ────────────────────────

insert into public.politica_comercial_version
  (version, estado, vigente, vigencia_desde, fuente, publicada_por_declarado, publicada_en, notas)
select 1, 'PUBLICADA', true, pc.vigencia_desde,
       pc.fuente,
       'siembra desde parametro_comercial v' || pc.version || ' — los porcentajes con los que la empresa YA cotiza. PENDIENTE de firma explícita del dueño.',
       now(),
       'No hay números nuevos acá: son los ocho de parametro_comercial vigente, reorganizados en los '
       'seis conceptos del programa. Riesgo y contingencia entran en NULL porque el libro NO los '
       'tiene: hoy están implícitos adentro del 22 % de beneficio y nadie puede decir cuánto de ese '
       '22 es ganancia y cuánto es colchón.'
  from public.parametro_comercial pc
 where pc.vigente
   and not exists (select 1 from public.politica_comercial_version);

insert into public.politica_comercial_componente (politica_version_id, concepto, clave, valor, normativo, fuente, estado)
select v.id, x.concepto, x.clave, x.valor, x.normativo, coalesce(x.fuente, pc.fuente), x.estado
  from public.politica_comercial_version v
  join public.parametro_comercial pc on pc.vigente
  cross join lateral (values
    ('BENEFICIO',    'pctBeneficio',      pc.pct_beneficio,     false, null::text, 'CONFIRMADO'),
    ('FINANCIACION', 'pctFinanciero',     pc.pct_financiero,    false, null, 'CONFIRMADO'),
    ('FINANCIACION', 'factorFinanciero',  pc.factor_financiero, false, 'medio período: qué fracción del plazo de cobro se financia', 'CONFIRMADO'),
    ('IMPUESTOS',    'pctIibb',           pc.pct_iibb,          false, 'IIBB + Lote Hogar tipeado en el libro · NO verificado contra la DGR de San Juan', 'CONFIRMADO'),
    ('IMPUESTOS',    'pctGanancias',      pc.pct_ganancias,     false, 'proxy de costeo, NO la alícuota de Ganancias', 'CONFIRMADO'),
    ('IMPUESTOS',    'pctCheque',         pc.pct_cheque,        false, null, 'CONFIRMADO'),
    ('IMPUESTOS',    'pctIva',            pc.pct_iva,           true,  'Ley de IVA · alícuota general. Lo único NORMATIVO de la cascada', 'CONFIRMADO'),
    ('RIESGO',       'pctRiesgo',         null,                 false, 'la cascada del libro NO tiene escalón de riesgo: hoy está implícito en el beneficio', 'FALTA_DATO'),
    ('CONTINGENCIA', 'pctContingencia',   null,                 false, 'la cascada del libro NO tiene escalón de contingencia: hoy está implícita en el beneficio', 'FALTA_DATO')
  ) as x(concepto, clave, valor, normativo, fuente, estado)
 where v.version = 1
   and not exists (select 1 from public.politica_comercial_componente c where c.politica_version_id = v.id);

-- El margen objetivo entra CON su conflicto. No se elige entre 17 y 12: elegir fabricaría una regla
-- que la empresa no decidió, y el valor que saliera parecería una decisión del dueño.
insert into public.politica_comercial_componente (politica_version_id, concepto, clave, valor, fuente, estado, conflicto)
select v.id, 'OTROS', 'margenObjetivoPct', null,
       'parametro_operativo.margen_objetivo_pct · migración 20260829T1400',
       'CONFLICTO',
       'El código productivo (ListaPresupuestos.tsx:58) usa 17 % y el handoff de diseño de la cartera (pantalla 14) dice 12 %. No hay evidencia de cuál decidió el dueño. Hasta que lo decida, el OS NO juzga un presupuesto contra este umbral.'
  from public.politica_comercial_version v
 where v.version = 1
   and not exists (select 1 from public.politica_comercial_componente c
                    where c.politica_version_id = v.id and c.clave = 'margenObjetivoPct');

-- La estructura de indirectos v1: el CATÁLOGO real de la hoja GG, con su celda, y SIN montos. Los
-- rótulos y las celdas están medidos sobre 64 cotizaciones reales; los importes de la empresa no
-- están en el OS y ponerles un número sería inventarlos. El catálogo vacío es honesto y útil: dice
-- exactamente qué hay que ir a buscar.
insert into public.indirecto_estructura (version, vigente, costo_directo_anual, fuente, notas)
select 1, true, null,
       'Planilla para Cotizar (2).xlsm · hoja GG · rótulos y celdas medidos sobre 64 cotizaciones en datos/conocimiento/hallazgos-cotizaciones.json',
       'Los CONCEPTOS son reales y están citados por celda. Los MONTOS no: el OS no tiene los gastos '
       'de estructura de la empresa (viven en el P&L, pendiente de integrar) ni el costo directo '
       'anual. Mientras falten, el indirecto calculado es NULL y el aplicado es un override — que es '
       'exactamente lo que la empresa hace hoy sin registrarlo.'
 where not exists (select 1 from public.indirecto_estructura);

insert into public.indirecto_concepto (estructura_id, version, vigente, concepto, bloque, base, pct, monto_anual, monto, fuente, notas)
select e.id, 1, true, x.concepto, x.bloque, x.base, null, null, null, x.fuente, x.notas
  from public.indirecto_estructura e
  cross join lateral (values
    ('Gastos administrativos con amort. y mant. de bienes de uso administrativos', 'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B54', 'el rótulo promete 4 % de CD y la planilla aplica 2 % en 49 de las cotizaciones medidas'),
    ('Costos financieros y mantenimiento de bancos',                               'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B55', 'el rótulo promete 0,2 % de CD; aplicado 1 % · 0,5 % · 0 según la obra'),
    ('Gastos contables',                                                           'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B57', 'el rótulo promete 0,6 % de CD; aplicado entre 1 % y 5 %'),
    ('Mantenimiento y amortización de vehículos',                                  'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B59', 'el rótulo promete 1 % de CD y se aplicó 0'),
    ('Alquiler de oficina y servicios',                                            'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B60', 'el rótulo promete 1,2 % de CD; aplicado 1,5 % · 3 % · 0,1 % · 2 % · 1 %'),
    ('Librería',                                                                   'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B61', 'el rótulo promete 0,15 % de CD; aplicado 1 % · 0,5 %'),
    ('Amortización de máquinas y herramientas',                                    'EMPRESA', 'PCT_COSTO_DIRECTO', 'hoja GG · B31', 'el rótulo promete 0,5 % de CD y se aplicó 3 %'),
    ('Matrículas profesionales',                                                   'EMPRESA', 'PRORRATEO_ANUAL',   'hoja GG · B62', 'cotizado en $ 0 en las 64 cotizaciones medidas'),
    ('Obrador y gastos comunes de obra',                                           'OBRA',    'MONTO_POR_OBRA',    'hoja GG · bloque «Gastos Comunes de obra» filas 14-51', 'la columna G guarda una CANTIDAD (meses de baño químico, raciones de comida), no un porcentaje'),
    ('Personal de conducción de obra (capataz, encargado de depósito)',            'OBRA',    'MONTO_POR_OBRA',    'hoja GG · H37-H38', 'cotizado en $ 0 en las 64 cotizaciones medidas: o no se necesita nunca, o se está regalando'),
    ('Seguridad e higiene (programa y honorarios de prevencionista)',              'OBRA',    'MONTO_POR_OBRA',    'hoja GG · H41', 'cotizado en $ 0 en las 64 cotizaciones medidas'),
    ('Personal de oficina técnica',                                                'OBRA',    'MONTO_POR_OBRA',    'hoja GG · H42', 'cotizado en $ 0 en las 64 cotizaciones medidas'),
    ('Derechos, aranceles y aprobaciones (Municipalidad, OSSE, DPV, Energía SJ)',  'OBRA',    'MONTO_POR_OBRA',    'hoja GG · H17-H30', 'cotizado en $ 0 en las 64 cotizaciones medidas'),
    ('Ensayos y revisión de cálculo estructural',                                  'OBRA',    'MONTO_POR_OBRA',    'hoja GG · H19 y H45', 'cotizado en $ 0 en 63 de 64 cotizaciones medidas')
  ) as x(concepto, bloque, base, fuente, notas)
 where e.version = 1
   and not exists (select 1 from public.indirecto_concepto c where c.estructura_id = e.id);

insert into public.subcontrato_vigencia_default (tipo, dias, fuente, estado, notas)
select 'GENERAL', 180,
       'parametro_operativo.dias_precio_aceptable = 180 · constante DIAS_ACEPTABLE en src/features/base-maestra/services/reglas.ts:110',
       'PROPUESTO',
       'Es el corte de un PRECIO DE LISTA aplicado a una OFERTA de un tercero. Sirve como piso hasta '
       'que el dueño declare los defaults por tipo. Cuando la oferta declara su propia validez, manda '
       'la oferta y este número no se usa.'
 where not exists (select 1 from public.subcontrato_vigencia_default where tipo = 'GENERAL');

-- ── 7 · PERMISOS ──────────────────────────────────────────────────────────────────────────────
-- Las seis son ECONÓMICAS. La lectura exige `ve_economia()`; la escritura de POLÍTICA DE EMPRESA
-- exige además `GLOBAL_POLICY_WRITE`, que sólo tiene Dirección — la auditoría del 29/08 entró como
-- `administracion` y reescribió el margen objetivo a 99, y `ve_economia()` no lo frenó.
--
-- El portero va envuelto en `(select …)` para que corra UNA vez por consulta y no una por fila.

alter table public.politica_comercial_version   enable row level security;
alter table public.politica_comercial_componente enable row level security;
alter table public.cotizacion_politica_ref      enable row level security;
alter table public.cotizacion_politica_override enable row level security;
alter table public.indirecto_estructura         enable row level security;
alter table public.cotizacion_indirecto         enable row level security;
alter table public.subcontrato_vigencia_default enable row level security;

drop policy if exists politica_version_lectura   on public.politica_comercial_version;
drop policy if exists politica_version_alta      on public.politica_comercial_version;
drop policy if exists politica_version_edicion   on public.politica_comercial_version;
create policy politica_version_lectura on public.politica_comercial_version for select to authenticated
  using ((select public.ve_economia()));
create policy politica_version_alta on public.politica_comercial_version for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));
-- ═══ UNA VERSIÓN PUBLICADA ES INMUTABLE ═══
-- El `using` mira la fila COMO ESTÁ: sólo se puede tocar lo que está en BORRADOR. Publicar es el
-- último UPDATE que una versión acepta, y después no hay ninguno más.
create policy politica_version_edicion on public.politica_comercial_version for update to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')) and estado = 'BORRADOR')
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

drop policy if exists politica_componente_lectura on public.politica_comercial_componente;
drop policy if exists politica_componente_alta    on public.politica_comercial_componente;
drop policy if exists politica_componente_edicion on public.politica_comercial_componente;
create policy politica_componente_lectura on public.politica_comercial_componente for select to authenticated
  using ((select public.ve_economia()));
create policy politica_componente_alta on public.politica_comercial_componente for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE'))
              and exists (select 1 from public.politica_comercial_version v
                           where v.id = politica_version_id and v.estado = 'BORRADOR'));
create policy politica_componente_edicion on public.politica_comercial_componente for update to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE'))
         and exists (select 1 from public.politica_comercial_version v
                      where v.id = politica_version_id and v.estado = 'BORRADOR'))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

drop policy if exists cot_politica_ref_lectura on public.cotizacion_politica_ref;
drop policy if exists cot_politica_ref_alta    on public.cotizacion_politica_ref;
create policy cot_politica_ref_lectura on public.cotizacion_politica_ref for select to authenticated
  using ((select public.ve_economia()));
create policy cot_politica_ref_alta on public.cotizacion_politica_ref for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE')));

-- El override es APPEND-ONLY y no se puede firmar por otro: `autorizado_por = auth.uid()`. Una
-- autorización que se puede reescribir no es una autorización.
drop policy if exists cot_override_lectura on public.cotizacion_politica_override;
drop policy if exists cot_override_alta    on public.cotizacion_politica_override;
create policy cot_override_lectura on public.cotizacion_politica_override for select to authenticated
  using ((select public.ve_economia()));
create policy cot_override_alta on public.cotizacion_politica_override for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE'))
              and autorizado_por = (select auth.uid()));

drop policy if exists indirecto_estructura_lectura on public.indirecto_estructura;
drop policy if exists indirecto_estructura_escritura on public.indirecto_estructura;
create policy indirecto_estructura_lectura on public.indirecto_estructura for select to authenticated
  using ((select public.ve_economia()));
create policy indirecto_estructura_escritura on public.indirecto_estructura for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

-- La estructura de indirectos es política de empresa: la 20260829T1200 la había dejado en
-- `ve_economia()` a secas, que es el portero que la auditoría atravesó.
drop policy if exists indirecto_concepto_economia on public.indirecto_concepto;
drop policy if exists indirecto_concepto_lectura  on public.indirecto_concepto;
drop policy if exists indirecto_concepto_escritura on public.indirecto_concepto;
create policy indirecto_concepto_lectura on public.indirecto_concepto for select to authenticated
  using ((select public.ve_economia()));
create policy indirecto_concepto_escritura on public.indirecto_concepto for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('GLOBAL_POLICY_WRITE')));

drop policy if exists cot_indirecto_lectura on public.cotizacion_indirecto;
drop policy if exists cot_indirecto_escritura on public.cotizacion_indirecto;
create policy cot_indirecto_lectura on public.cotizacion_indirecto for select to authenticated
  using ((select public.ve_economia()));
create policy cot_indirecto_escritura on public.cotizacion_indirecto for all to authenticated
  using ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE')))
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE')));

drop policy if exists subcontrato_vigencia_lectura on public.subcontrato_vigencia_default;
drop policy if exists subcontrato_vigencia_escritura on public.subcontrato_vigencia_default;
-- La lectura NO se endurece: un jefe de obra necesita saber si la cotización del subcontratista
-- todavía vale, y eso no le dice nada del margen.
create policy subcontrato_vigencia_lectura on public.subcontrato_vigencia_default for select to authenticated
  using (true);
create policy subcontrato_vigencia_escritura on public.subcontrato_vigencia_default for all to authenticated
  using ((select public.cot_permiso('GLOBAL_POLICY_WRITE')))
  with check ((select public.cot_permiso('GLOBAL_POLICY_WRITE')));

-- RLS NO ES GRANT: una policy sin su GRANT devuelve «permission denied», que Next muestra como un
-- 404 y se lee como «no hay datos». Y el DELETE queda AFUERA de todas: una política, una estructura
-- de costos o una autorización no se borran — se versionan.
grant select, insert, update on public.politica_comercial_version    to authenticated;
grant select, insert, update on public.politica_comercial_componente to authenticated;
grant select, insert         on public.cotizacion_politica_ref       to authenticated;
grant select, insert         on public.cotizacion_politica_override  to authenticated;
grant select, insert, update on public.indirecto_estructura          to authenticated;
grant select, insert, update on public.cotizacion_indirecto          to authenticated;
grant select, insert, update on public.subcontrato_vigencia_default  to authenticated;
revoke delete on public.indirecto_concepto from authenticated;

grant all on public.politica_comercial_version, public.politica_comercial_componente,
             public.cotizacion_politica_ref, public.cotizacion_politica_override,
             public.indirecto_estructura, public.cotizacion_indirecto,
             public.subcontrato_vigencia_default to service_role;
