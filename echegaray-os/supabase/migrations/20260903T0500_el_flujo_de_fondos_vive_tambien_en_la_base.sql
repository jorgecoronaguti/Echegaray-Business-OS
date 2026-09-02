-- EL FLUJO DE FONDOS DEJA DE VIVIR SÓLO EN EL SHEET.
--
-- Pedido del dueño (02/09/2026): *"necesito que lleves toda la información del sheet flujo de fondos
-- a bd supabase ordenada de la mejor manera porque voy a armar una página de analíticas que va a
-- consumir directamente de la bd que se actualiza del contenido de ese sheet"*.
--
-- ═══ LA FUENTE NO ES LA PESTAÑA DIBUJADA ═══
--
-- `Cash Flow Mensual` y `Cash Flow Semanal` son OUTPUTS: cada celda es un SUMPRODUCT sobre
-- `_MOVIMIENTOS`, el libro canónico. Scrapear el cuadro sería copiar el resultado de una definición
-- que ya existe en el repositorio, y el día que la definición cambie habría dos verdades. Lo que se
-- persiste es el LIBRO fila a fila, y los períodos se calculan con las MISMAS funciones que arman las
-- fórmulas de la hoja (`terminosDeMedida` / `terminosDeRubro`, en lib/cash-flow-medidas.mjs). Una
-- definición, dos materializaciones.
--
-- ═══ POR QUÉ TRES TABLAS Y NO UNA ═══
--
-- Son tres granos distintos y la página de analíticas los pide por separado:
--   · `flujo_corrida`    · una fila por foto. Es la que dice CUÁL es la verdad de hoy (`vigente`).
--   · `flujo_movimiento` · el detalle, para "¿de dónde sale este número?" y para filtrar por obra,
--                          cliente, proveedor o rubro sin recalcular nada.
--   · `flujo_periodo`    · el agregado ya resuelto, que es lo que dibuja un gráfico sin barrer 5.000
--                          filas en el navegador.
--   · `flujo_asimetria`  · los hallazgos del auditor de asimetría, que hoy sólo existían en un log.
--
-- ═══ POR QUÉ MENSUAL Y SEMANAL EN UNA SOLA TABLA ═══
--
-- Porque la pantalla va a tener un selector de granularidad y la comparación mes-contra-semanas es
-- una consulta, no un UNION escrito a mano en el cliente. Dos tablas idénticas salvo el largo de la
-- ventana obligan a duplicar cada consulta, cada índice y cada policy — y a que alguien se acuerde de
-- tocar las dos. La granularidad es un DATO de la fila, no un nombre de tabla.
--
-- ═══ CADA CORRIDA REEMPLAZA LA FOTO, NINGUNA BORRA LA HISTORIA ═══
--
-- Una proyección que cambia sin dejar rastro no se puede auditar: la pregunta "¿por qué en agosto
-- decíamos que noviembre cerraba en $40M?" no tiene respuesta si la foto anterior se pisó. Cada
-- corrida es una fila de `flujo_corrida` con su firma; `vigente` marca UNA sola, con índice único
-- parcial para que la base no pueda tener dos. Las analíticas leen `where vigente`; una comparación
-- entre corridas es la misma consulta sin ese filtro.

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · LA CORRIDA — la foto y su firma
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.flujo_corrida (
  id             uuid primary key default gen_random_uuid(),
  corrida_en     timestamptz not null default now(),
  -- El serial de Sheets del día de corte con el que se armó el libro. Va acá y no derivado de
  -- `corrida_en` porque el corte es una decisión del generador, no la hora del proceso: un pipeline
  -- que corre a las 00:10 con el corte de ayer tiene que poder decirlo.
  corte_serial   integer,
  -- LA FIRMA DEL LIBRO. sha256 sobre las filas canónicas ordenadas. Es lo que permite contestar
  -- "¿cambió algo desde la corrida anterior?" sin comparar 5.000 filas — y es la condición de
  -- idempotencia del escritor: misma firma, no nace una corrida nueva.
  firma          text not null,
  movimientos    integer not null,
  -- LOS TOTALES DE CONTROL. No son un resumen decorativo: son contra lo que se verifica que la
  -- escritura aterrizó entera. Un total que no cuadra contra la suma del detalle es una carga rota,
  -- y sin guardarlo no hay contra qué compararla.
  neto           numeric(16,2) not null,
  neto_real      numeric(16,2) not null,
  neto_pendiente numeric(16,2) not null,
  -- De dónde salió la foto. Un número de plata sin decir de dónde vino no se puede defender.
  fuente         text not null,
  vigente        boolean not null default false,

  constraint flujo_corrida_firma_no_vacia check (length(btrim(firma)) > 0),
  constraint flujo_corrida_fuente_no_vacia check (length(btrim(fuente)) > 0),
  constraint flujo_corrida_movimientos_no_negativos check (movimientos >= 0)
);

-- UNA SOLA VIGENTE, IMPUESTO POR LA BASE. Dejarlo en manos del escritor significa que un proceso
-- interrumpido entre el `update` y el `insert` deja dos fotos vigentes y las analíticas suman dos
-- veces el año entero. El índice parcial lo hace imposible.
-- Se indexa `vigente` y no una constante: la columna es booleana y el predicado ya deja sólo las
-- verdaderas, así que el índice tiene a lo sumo una entrada. Una expresión constante haría lo mismo
-- pero depende de que el planner la acepte, y una migración no es lugar para una apuesta.
create unique index if not exists flujo_corrida_una_vigente
  on public.flujo_corrida (vigente) where vigente;
create index if not exists flujo_corrida_reciente on public.flujo_corrida (corrida_en desc);
create index if not exists flujo_corrida_firma on public.flujo_corrida (firma);

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · EL LIBRO, FILA A FILA
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.flujo_movimiento (
  corrida_id     uuid not null references public.flujo_corrida(id) on delete cascade,
  -- LA CLAVE DE DEDUPLICACIÓN DEL LIBRO (`claveDe`, lib/libro-movimientos.mjs) es la identidad del
  -- movimiento, no un uuid nuevo: `echeq:313:S`, `banco:REF-4471`, `comp:30712...:25483:S`. Con ella
  -- el upsert por corrida es idempotente y —además— se puede seguir el MISMO movimiento entre dos
  -- corridas para ver cuándo pasó de PROYECTADO a REAL. Un uuid por fila haría esa pregunta imposible.
  clave          text not null,

  -- ═══ LA FECHA VA DOS VECES, Y NO ES REDUNDANCIA ═══
  -- `fecha` es lo que consulta la analítica (BETWEEN, date_trunc, ejes de tiempo). `fecha_serial` es
  -- el número tal como está en la celda: es lo que permite volver a la fila del Sheet y verificarla.
  -- Guardar sólo la date rompe la trazabilidad; guardar sólo el serial obliga a convertir en cada query.
  fecha          date not null,
  fecha_serial   integer not null,

  -- `+1` entra, `-1` sale. El importe se guarda SIEMPRE POSITIVO y el signo aparte — misma invariante
  -- que el libro: guardar "-45.695" y además un signo es tener el mismo hecho dos veces, y el día que
  -- uno de los dos se invierta la suma da un número plausible y equivocado.
  signo          smallint not null,
  importe        numeric(16,2) not null,
  -- `importe` SIEMPRE en pesos; `moneda` describe el ORIGEN. La invariante es
  -- `importe = importe_origen × tipo_cambio`. Leerlo al revés hace que una vista valúe dos veces.
  moneda         text not null default 'ARS',
  importe_origen numeric(16,2),
  tipo_cambio    numeric(14,6),

  concepto       text not null default '',
  rubro          text not null,
  actividad      text not null,
  estado         text not null,
  instrumento    text not null,
  contraparte    text not null default '',
  cuit           text not null default '',
  comprobante    text not null default '',
  obra           text not null default '',
  cliente        text not null default '',
  -- De qué pestaña y de qué fila salió. Es la respuesta a "¿de dónde sale esto?" sin abrir el Sheet.
  origen_pestana text not null,
  origen_fila    integer,

  primary key (corrida_id, clave),

  constraint flujo_movimiento_signo check (signo in (1, -1)),
  -- El importe es MAGNITUD: negativo acá significa que alguien guardó el signo dos veces.
  constraint flujo_movimiento_importe_no_negativo check (importe >= 0),
  -- El estado es la regla absoluta del criterio percibido. Un quinto estado inventado por un extractor
  -- nuevo entraría mudo y las medidas lo dejarían fuera de las dos columnas sin dar un error.
  constraint flujo_movimiento_estado check (estado in ('REAL', 'COMPROMETIDO', 'PROYECTADO', 'VENCIDO')),
  constraint flujo_movimiento_actividad check (actividad in ('operativa', 'inversion', 'financiacion')),
  constraint flujo_movimiento_origen check (length(btrim(origen_pestana)) > 0)
);

-- LOS ÍNDICES SON LOS DE LAS PREGUNTAS QUE VA A HACER LA PANTALLA, no "uno por columna". Todos
-- arrancan por `corrida_id` porque toda consulta de analíticas filtra por la foto vigente primero.
create index if not exists flujo_movimiento_fecha on public.flujo_movimiento (corrida_id, fecha);
create index if not exists flujo_movimiento_rubro on public.flujo_movimiento (corrida_id, rubro, fecha);
create index if not exists flujo_movimiento_estado on public.flujo_movimiento (corrida_id, estado, fecha);
-- Parciales: la enorme mayoría de las filas no tiene obra ni cliente, y un índice sobre columnas casi
-- siempre vacías es peso muerto que además no sirve para el filtro que sí importa.
create index if not exists flujo_movimiento_obra on public.flujo_movimiento (corrida_id, obra, fecha)
  where obra <> '';
create index if not exists flujo_movimiento_cliente on public.flujo_movimiento (corrida_id, cliente, fecha)
  where cliente <> '';

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · EL PERÍODO — mensual y semanal en la misma tabla
-- ══════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.flujo_periodo (
  id                 uuid primary key default gen_random_uuid(),
  corrida_id         uuid not null references public.flujo_corrida(id) on delete cascade,
  granularidad       text not null,
  -- `periodo_fin` es EXCLUIDO, el mismo criterio que `terminoLibro` en todo el repo. Un movimiento no
  -- puede caer en dos períodos, y las semanas que parten un mes siguen sumando exacto.
  periodo_inicio     date not null,
  periodo_fin        date not null,

  -- ═══ EL NIVEL: EL TOTAL DEL PERÍODO O LA APERTURA DE UN RUBRO ═══
  --
  -- El total NO es la suma de los rubros: es el libro entero de esa ventana, y "Otros" se DESPEJA de
  -- la resta. Así, un rubro que el libro empiece a emitir mañana aparece en "Otros" y se ve, en vez de
  -- desaparecer del cuadro mientras el total cierra consigo mismo.
  nivel              text not null,
  rubro              text,

  ingreso_real       numeric(16,2) not null default 0,
  ingreso_proyectado numeric(16,2) not null default 0,
  egreso_real        numeric(16,2) not null default 0,
  egreso_proyectado  numeric(16,2) not null default 0,
  -- `resultado = ingresos − egresos` de las cuatro medidas. Se guarda calculado y no como columna
  -- generada porque quien decide qué entra en el resultado es `MEDIDAS.signoNeto`, en el repositorio.
  resultado          numeric(16,2) not null default 0,

  -- ═══ LOS SALDOS SON NULLABLE Y NO ES UN OLVIDO ═══
  --
  -- Un saldo es un STOCK anclado en el saldo declarado de CAJA, no un flujo del libro. La vista
  -- mensual lo publica en los rangos con nombre CF_INICIO/CF_CIERRE; la semanal no publica ninguno.
  -- Un 0 se leería como "la empresa cerró el período sin plata" — una afirmación que nadie hizo.
  saldo_inicio       numeric(16,2),
  saldo_cierre       numeric(16,2),

  constraint flujo_periodo_granularidad check (granularidad in ('mes', 'semana')),
  constraint flujo_periodo_nivel check (nivel in ('total', 'rubro')),
  -- El nivel y el rubro son el mismo hecho dicho dos veces: que no puedan contradecirse.
  constraint flujo_periodo_rubro_coherente check ((nivel = 'total') = (rubro is null)),
  constraint flujo_periodo_ventana check (periodo_fin > periodo_inicio),
  -- Un saldo sólo tiene sentido en la fila total: un "saldo de Materiales Civil" no existe.
  constraint flujo_periodo_saldo_solo_en_total
    check (nivel = 'total' or (saldo_inicio is null and saldo_cierre is null))
);

-- `coalesce(rubro,'')` en vez de incluir `rubro` a secas: NULL nunca es igual a NULL, así que un
-- índice único con la columna nullable dejaría entrar dos filas total del mismo período.
create unique index if not exists flujo_periodo_unico
  on public.flujo_periodo (corrida_id, granularidad, periodo_inicio, coalesce(rubro, ''));
create index if not exists flujo_periodo_serie
  on public.flujo_periodo (corrida_id, granularidad, nivel, periodo_inicio);

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · LOS HALLAZGOS DEL AUDITOR DE ASIMETRÍA
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- `cash-flow-asimetria.mjs` detecta los meses donde el cuadro proyecta la cuadrilla y no proyecta ni
-- el material de obra ni el cobro que los paga. Hasta hoy sus hallazgos existían en la salida de una
-- corrida y se perdían con el log. Persistidos, la pantalla puede mostrar "en noviembre faltan $48,3M
-- de material estimado" al lado del mes que lo tiene — que es donde la advertencia sirve para decidir.

create table if not exists public.flujo_asimetria (
  id                  uuid primary key default gen_random_uuid(),
  corrida_id          uuid not null references public.flujo_corrida(id) on delete cascade,
  tipo                text not null,
  periodo_inicio      date not null,
  jornales            numeric(16,2),
  -- ESTIMACIÓN declarada, nunca un hecho: es el ratio material/jornal OBSERVADO aplicado a los
  -- jornales del mes. `null` es "no se pudo estimar" y no es lo mismo que 0, que es "no falta nada".
  material_estimado   numeric(16,2),
  ratio               numeric(14,6),
  nomina              numeric(16,2),
  ingreso_proyectado  numeric(16,2),
  cobertura           numeric(14,6),
  faltante            numeric(16,2),

  constraint flujo_asimetria_tipo check (tipo in ('obra-sin-material', 'cobro-no-cubre-nomina'))
);

create unique index if not exists flujo_asimetria_unico
  on public.flujo_asimetria (corrida_id, tipo, periodo_inicio);

-- ══════════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · RLS · el flujo de fondos es la economía de la empresa
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Ver el flujo de fondos es ver cuánto entra, cuánto sale y a quién se le paga: es exactamente lo que
-- `ve_economia()` gobierna. Un jefe de obra NO lo ve.
--
-- LA POLICY SIN GRANT NO ALCANZA: en este repo una policy sin su grant devuelve «denied» y la pantalla
-- lo muestra como un 404 — el modo de falla más confuso que tiene la web.
--
-- EL PORTERO VA ENVUELTO EN `(select ...)`: así Postgres lo evalúa UNA vez por consulta (InitPlan) en
-- vez de una vez por fila. Sobre `flujo_movimiento`, que son miles de filas por corrida, la diferencia
-- entre las dos formas es la diferencia entre una pantalla que abre y una que no.

alter table public.flujo_corrida    enable row level security;
alter table public.flujo_movimiento enable row level security;
alter table public.flujo_periodo    enable row level security;
alter table public.flujo_asimetria  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['flujo_corrida', 'flujo_movimiento', 'flujo_periodo', 'flujo_asimetria'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_lee_economia') then
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select public.ve_economia()))',
        t || '_lee_economia', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_srv') then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true)',
        t || '_srv', t);
    end if;
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    -- NADIE ESCRIBE A MANO. Estas cuatro tablas son la materialización de un pipeline: una fila
    -- editada desde la web sería una cifra que no sale de ninguna fuente y que la corrida siguiente
    -- pisa sin avisar. Se corrige el generador, nunca la tabla.
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

comment on table public.flujo_corrida is
  'Una fila por foto del Flujo de Fondos materializada desde el pipeline. `vigente` marca la verdad de hoy (índice único parcial: no puede haber dos). `firma` es el sha256 del libro — misma firma, no nace corrida nueva.';
comment on table public.flujo_movimiento is
  'El libro canónico `_MOVIMIENTOS` fila a fila, por corrida. Identidad = la clave de deduplicación del libro, así que el mismo movimiento se puede seguir entre corridas. Importe SIEMPRE positivo; el signo aparte.';
comment on table public.flujo_periodo is
  'El agregado ya resuelto por período: mensual Y semanal en una tabla (`granularidad`). `nivel=total` es el libro entero de la ventana; `nivel=rubro` es su apertura, y "Otros" se despeja de la resta. Saldos sólo en la fila total y sólo cuando la vista los publica.';
comment on table public.flujo_asimetria is
  'Los hallazgos del auditor de asimetría de la proyección: meses que proyectan la cuadrilla sin proyectar el material de obra ni el cobro que la paga. `material_estimado` es una ESTIMACIÓN declarada, no un hecho.';
