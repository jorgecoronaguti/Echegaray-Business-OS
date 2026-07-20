-- ÍNDICES ECONÓMICOS — regla de oro del dueño (20/07): "en las proyecciones siempre considerar
-- inflación, aumentos, etc. (datos que se deben buscar en la web), hacerlo automático y autónomo".
--
-- POR QUÉ IMPORTA ACÁ Y NO ES UN ADORNO: con 30% de inflación anual proyectada, una quincena de
-- jornales de $7,95M en agosto no cuesta $7,95M en diciembre. Proyectar a valores de hoy subestima
-- la caja que hace falta justo en los meses en que menos margen hay para equivocarse. Y en
-- construcción el jornal no sigue al IPC: sigue a la PARITARIA UOCRA, que es otro número y llega en
-- otras fechas. Por eso se guardan como índices SEPARADOS y cada proyección elige el que le toca.
--
-- REGLA DE CONFIANZA: todo valor guarda su FUENTE y la fecha en que se leyó. Un índice sin fuente no
-- se puede volver a verificar, y una proyección que se apoya en un número sin origen es una
-- opinión con formato de planilla.

create table if not exists public.indice_economico (
  id            uuid primary key default gen_random_uuid(),
  indice        text not null,            -- 'ipc' (precios) · 'uocra' (jornal de convenio)
  periodo       text not null,            -- 'YYYY-MM' al que aplica
  variacion     numeric not null,         -- variación MENSUAL en fracción (0.018 = 1,8%)
  -- 'dato' = ya publicado y firme · 'proyeccion' = expectativa de mercado o paritaria no cerrada.
  tipo          text not null default 'proyeccion' check (tipo in ('dato', 'proyeccion')),
  fuente        text not null,
  url           text,
  leido_en      timestamptz not null default now(),
  unique (indice, periodo, tipo)
);
comment on table public.indice_economico is
  'Inflación y aumentos de convenio por mes, con su fuente. Alimenta TODA proyección del OS: sin esto se proyecta a valores de hoy y se subestima la caja de los meses que vienen.';
comment on column public.indice_economico.variacion is
  'Variación MENSUAL en fracción, no acumulada ni en porcentaje. 1,8% se guarda como 0.018.';

create index if not exists indice_economico_idx on public.indice_economico (indice, periodo);

-- El factor ACUMULADO desde hoy hasta cada mes: es lo que multiplica una proyección.
-- Se calcula acá y no en cada planilla para que no existan dos versiones del mismo ajuste.
create or replace view public.factor_ajuste as
  select indice,
         periodo,
         tipo,
         variacion,
         exp(sum(ln(1 + variacion)) over (partition by indice order by periodo))::numeric(12, 6) as factor_acumulado,
         fuente
    from public.indice_economico
   order by indice, periodo;

comment on view public.factor_ajuste is
  'Factor acumulado por índice y mes. Multiplicar una proyección a valores de hoy por este factor la lleva a pesos de ese mes.';
