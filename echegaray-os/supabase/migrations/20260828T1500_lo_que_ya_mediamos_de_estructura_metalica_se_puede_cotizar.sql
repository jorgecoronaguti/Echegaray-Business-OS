-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE YA MEDIMOS DE ESTRUCTURA METÁLICA SE PUEDE COTIZAR — 6 partidas, 9 mediciones, cero precios
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `public.rendimiento_historico` guarda 9 ejecuciones reales de ECSAS que salen de «Horas
-- Hombre.xlsm», hoja oculta `DESCRIPCION DE TAREAS`, y que llevaban desde el 22/08 con
-- `tarea_tipo_id` en NULL. Una medición sin tarea no es evidencia: es una fila. No la lee el
-- aprendizaje, no la lee `rendimiento_contra_lo_cotizado`, no la ve ninguna cotización.
--
-- Esta migración les da la etiqueta que las vuelve utilizables, creando las partidas que faltaban.
--
-- ═══ 1 · LA BASE MAESTRA SÍ TENÍA ESTRUCTURA METÁLICA — LO QUE NO TENÍA ERA EL MONTAJE ═══
--
-- La lectura previa decía que la única partida metálica era T1110 CERCHA. No es así: el catálogo
-- ya trae T1075 y T1111 (TECHO METÁLICO), T1075.1 y T1111.0 (panel autoportante), T1075.2 y
-- T1111.1 (columnas metálicas), T1110.1 (rigidizador de cerchas) y T1124.1 (cerramiento vertical).
--
-- Las nueve, sin excepción, son partidas LLAVE EN MANO: su análisis lleva el perfil, la chapa, el
-- electrodo, el disco, el esmalte y el thinner además de las horas. Ninguna cotiza mano de obra
-- sola.
--
-- Lo que las 9 mediciones describen es exactamente lo otro: **trabajo de montaje sin material**.
-- Son estudios de HH puros —cuántas horas, con qué cuadrilla, con qué equipo— sin una sola línea de
-- insumo. Y es un modo de contratación real, el mismo que el motor de cotización ya pregunta solo
-- cuando mira un galpón: «¿provisión y montaje llave en mano, o sólo el montaje con material del
-- cliente?». Para la segunda respuesta el catálogo no tenía NADA.
--
-- Por eso estas seis no se pisan con las que ya están: no son otra forma de cotizar la misma
-- columna, son el otro alcance. El nombre lo dice y es lo único que las separa —MONTAJE, ARMADO,
-- PINTURA—, así que el nombre es acá un dato técnico y no una etiqueta.
--
-- ═══ 2 · UNA PARTIDA POR PROCESO MEDIDO, Y LA RAZÓN NO ES DE GUSTO ═══
--
-- La tentación era una partida por ELEMENTO —«columna metálica»— con el armado, el montaje y la
-- pintura adentro como procesos, que es como lo escribe el catálogo llave en mano. No se puede, y
-- el motivo es que rompería los controles que ya existen:
--
--   `rendimiento_contra_lo_cotizado` y `conocimiento-aprender.mjs` agrupan por TAREA y promedian
--   `hs_unitarias`. Con las cuatro observaciones de correa colgando de una sola partida, el
--   promedio daría 6,42 h/correa —el promedio de armar, colocar y pintar— contra un análisis de
--   13,66, y el control diría «cotizamos largo» sobre un número que no describe ningún trabajo.
--
-- Un control validado contra información que no es la suya no avisa: miente. Con una partida por
-- proceso, cada fila de `rendimiento_historico` mide la partida ENTERA y el promedio significa algo.
--
-- Y el corte comercial cae en el mismo lugar: el armado en taller y la colocación en altura los
-- hacen cuadrillas distintas, en lugares distintos, con equipos distintos —1 oficial + 1 ayudante
-- con máquina contra 3 + 3 con plataforma y andamio, según anotó el propio libro—. La pintura,
-- además, ya se cotiza suelta en este catálogo (T1055, T1088, T1103.1): no es una invención.
--
-- ═══ 3 · LA UNIDAD ES LA QUE MEDIMOS, Y ESO CUESTA UN ELEMENTO ═══
--
-- Las nueve mediciones tienen por denominador la PIEZA: 16 vigas, 10 columnas, 24 correas. El
-- catálogo ya cotiza columnas metálicas por unidad (T1075.2, T1111.1), así que UN no es exótico acá.
--
-- Pero los planos computan la estructura metálica por METRO. Medido sobre Quattropani: con estas
-- seis partidas en ML, «Viga metálica 2C200» (66,72 m) pasaría de hueco a MAPEADA contra
-- T1182 y la cobertura de cotización subiría de 7 a 8 elementos.
--
-- **No se hace.** Para publicar h/ml haría falta el largo de las vigas medidas —de las 16 «VM 460»
-- y las 8 «PNC 200»— y «Horas Hombre.xlsm» nunca tuvo esa columna. Un h/ml supuesto es exactamente
-- la platea de 50 cm: un número redondo, con su análisis y su respaldo, que afirma algo que nadie
-- midió. La cobertura que se gana así es la más cara que existe.
--
-- Se deja el hueco con la pregunta escrita: **¿cuánto medían las vigas y las columnas de esas
-- mediciones?** Con ese dato las seis partidas se pueden reexpresar en ML sin inventar nada.
--
-- Tampoco entran en kg, que es como suele cotizarse la estructura metálica: exigiría el peso por
-- metro de cada perfil, que el plano no da y el libro tampoco.
--
-- ═══ 4 · SIN PRECIO, Y CON EL HUECO DICHO ═══
--
-- No se inventa un precio para crear una partida. La MANO DE OBRA sale entera de las mediciones
-- —las horas repartidas entre oficial y ayudante según la cuadrilla que cada observación anotó, no
-- según un supuesto— y la carga social acompaña 1:1, que es lo que hacen las partidas metálicas del
-- catálogo (T1075.2, T1110, T1124.1).
--
-- MATERIALES y EQUIPOS quedan como hueco declarado en la descripción de cada partida, con el
-- equipo que cada medición sí anotó (grúa, autoelevador, tijera 4x4, plataforma 4x4, andamio). El
-- catálogo ya tiene con qué cotizarlos aparte —T1144 puntales, T1144.1 andamios, T1149 movilización
-- de máquinas— y elegir cuál es una decisión, no un default.

-- ── 1 · las seis partidas ─────────────────────────────────────────────────────────────────────
insert into public.tarea_tipo (codigo, nombre, unidad, division, metodo_medicion, descripcion, origen)
values
  ('T1180', 'MONTAJE DE COLUMNA METALICA', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de izaje, aplome, fijación y soldadura de una columna metálica de perfil, '
   'ya provista y armada. INCLUYE: recepción y presentación de la pieza, izaje, aplome, nivelación, '
   'soldadura de unión y control. EXCLUYE Y NO ESTÁ COTIZADO: la provisión del perfil, los '
   'consumibles de soldadura y corte, el equipo de izaje (las dos mediciones usaron GRÚA y TIJERA '
   '4X4), la pintura de protección (es T1181) y el armado en taller (NO MEDIDO). ATRIBUTO QUE LA '
   'SEPARA DE SU VECINA: es SÓLO MONTAJE — T1075.2 y T1111.1 cotizan la columna llave en mano, con '
   'perfil, electrodo y esmalte adentro. LÍMITE DECLARADO: las dos observaciones dicen «CMP - 6M» y '
   'las secciones 320x400 y PNC 200; el rendimiento vale para columnas de ese porte, y el largo de '
   '6 m es lo que dice el rótulo, no un dato medido.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A6:G6 y A11:G11 · partida creada por el OS 2026-08-28'),

  ('T1181', 'PINTURA DE COLUMNA METALICA', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de preparación de superficie y aplicación de protección anticorrosiva '
   'sobre una columna metálica ya montada. INCLUYE: limpieza de superficie, aplicación y retoque. '
   'EXCLUYE Y NO ESTÁ COTIZADO: la pintura, el diluyente, los rodillos y el medio de acceso (la '
   'medición usó ANDAMIO). ATRIBUTO QUE LA SEPARA DE SU VECINA: es la pintura de una columna '
   'ESTRUCTURAL por unidad — T1055 pinta carpintería metálica por m2 y T1088 es epoxi por m2. '
   'LÍMITE DECLARADO: UNA sola observación (9 columnas, sección 320x400). Es un dato, no un '
   'estándar: la segunda obra lo confirma o lo corrige.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A7:G7 · partida creada por el OS 2026-08-28'),

  ('T1182', 'MONTAJE DE VIGA METALICA', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de izaje, presentación, nivelación y soldadura de una viga metálica de '
   'perfil, ya provista y armada. INCLUYE: recepción, izaje, presentación sobre apoyos, nivelación, '
   'soldadura de unión y control. EXCLUYE Y NO ESTÁ COTIZADO: la provisión del perfil, los '
   'consumibles, el equipo de izaje (las mediciones usaron GRÚA + AUTOELEVADOR y TIJERA 4X4), la '
   'pintura de protección (NO MEDIDA para viga) y el armado en taller (NO MEDIDO). ATRIBUTO QUE LA '
   'SEPARA DE SU VECINA: una viga de alma llena NO es una cercha — T1110 cotiza cercha reticulada '
   'por metro, con caño y esmalte adentro. LÍMITE DECLARADO: las dos observaciones difieren 40% '
   'entre sí (16,0 y 24,0 h/viga, secciones VM 460 y PNC 200) y el promedio tapa esa diferencia; '
   'con dos muestras no se sabe si la explica la sección, el largo o el equipo.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A5:G5 y A8:G8 · partida creada por el OS 2026-08-28'),

  ('T1183', 'ARMADO DE CORREA METALICA', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de corte, presentación y soldadura de una correa metálica antes de su '
   'colocación. INCLUYE: corte a medida, preparación de extremos y soldadura de armado. EXCLUYE Y '
   'NO ESTÁ COTIZADO: la provisión del perfil, los consumibles de corte y soldadura, y la máquina '
   'que la medición anotó sin especificar. ATRIBUTO QUE LA SEPARA DE SU VECINA: es el armado de la '
   'pieza, NO su colocación en el techo (eso es T1184) — las dos las hacen cuadrillas distintas: '
   '1 oficial + 1 ayudante acá, 3 + 3 allá. LÍMITE DECLARADO: UNA sola observación (35 correas, '
   'PNC 80). Es un dato, no un estándar.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A10:H10 · partida creada por el OS 2026-08-28'),

  ('T1184', 'COLOCACION DE CORREA METALICA DE TECHO', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de colocación en altura de una correa metálica ya armada sobre la '
   'estructura principal. INCLUYE: acomodado, punteado y resoldado —así lo describe la medición—, y '
   'el control de alineación. EXCLUYE Y NO ESTÁ COTIZADO: la provisión del perfil, los consumibles y '
   'los medios de acceso (la medición usó PLATAFORMA 4X4 y ANDAMIO). ATRIBUTO QUE LA SEPARA DE SU '
   'VECINA: es la colocación de la CORREA, no la cubierta — T1111 y T1075 cotizan el techo metálico '
   'por m2 con la chapa y el perfil adentro, y una correa cotizada como cerramiento vertical '
   '(T1124.1) arrastra 4,2 m2 de chapa por metro que nadie pidió. LÍMITE DECLARADO: UNA sola '
   'observación (24 correas, PNC 140). Es un dato, no un estándar.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A4:G4 · partida creada por el OS 2026-08-28'),

  ('T1185', 'PINTURA DE CORREA METALICA', 'UN', 'ESTRUCTURA METALICA', 'cantidad',
   'ALCANCE: mano de obra de preparación de superficie y aplicación de protección anticorrosiva '
   'sobre una correa metálica. INCLUYE: limpieza de superficie, aplicación y retoque. EXCLUYE Y NO '
   'ESTÁ COTIZADO: la pintura, el diluyente y los elementos de aplicación; ninguna de las dos '
   'observaciones anotó equipo, y eso significa que no se observó, no que no hizo falta. ATRIBUTO '
   'QUE LA SEPARA DE SU VECINA: pinta la CORREA por unidad — T1181 pinta la columna, T1055 pinta '
   'carpintería por m2. LÍMITE DECLARADO: dos observaciones de secciones distintas (PNC 80 y PNC '
   '140) que coinciden dentro del 8,3%; que coincidan NO prueba que la sección no importe, prueba '
   'que en esas dos no se notó.',
   'Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A2:G2 y A3:G3 · partida creada por el OS 2026-08-28')
on conflict (codigo) do nothing;

-- ── 2 · el análisis vigente de cada una ───────────────────────────────────────────────────────
-- Sin análisis vigente la partida NO existe para el motor de cotización: `baseMaestra()` filtra por
-- `exists (select 1 from analisis ... vigente)`. Una tarea sin APU es un nombre, no un precio.
insert into public.analisis (tarea_tipo_id, version, vigente, motivo)
select tt.id, 1, true,
       'Mano de obra medida en ejecución real de ECSAS («Horas Hombre.xlsm», hoja DESCRIPCION DE '
       'TAREAS). Las horas se reparten entre oficial y ayudante con la cuadrilla que cada '
       'observación anotó. SIN MATERIALES NI EQUIPOS: la partida es de montaje, no llave en mano.'
  from public.tarea_tipo tt
 where tt.codigo in ('T1180', 'T1181', 'T1182', 'T1183', 'T1184', 'T1185')
   and not exists (select 1 from public.analisis a where a.tarea_tipo_id = tt.id);

-- ── 3 · la composición: horas medidas, repartidas por la cuadrilla observada ───────────────────
-- Los valores salen de `orquestador/lib/rendimiento-observado.mjs` aplicado a las 9 filas reales.
-- La carga social acompaña 1:1 a su categoría, que es lo que hacen T1075.2, T1110 y T1124.1.
with linea (codigo, recurso, cantidad, orden) as (values
  -- T1180 · promedio de 32,0 (2 of + 2 ay) y 28,8 (4 of + 2 ay) = 30,4 h/columna
  ('T1180', '0',   17.600, 0), ('T1180', '2',   12.800, 1),
  ('T1180', '256', 17.600, 2), ('T1180', '257', 12.800, 3),
  -- T1181 · 32,0 h/columna con 2 of + 4 ay
  ('T1181', '0',   10.667, 0), ('T1181', '2',   21.333, 1),
  ('T1181', '256', 10.667, 2), ('T1181', '257', 21.333, 3),
  -- T1182 · promedio de 16,0 (2 of + 2 ay) y 24,0 (1 of + 3 ay) = 20,0 h/viga
  ('T1182', '0',    7.000, 0), ('T1182', '2',   13.000, 1),
  ('T1182', '256',  7.000, 2), ('T1182', '257', 13.000, 3),
  -- T1183 · 3,657 h/correa con 1 of + 1 ay
  ('T1183', '0',    1.829, 0), ('T1183', '2',    1.829, 1),
  ('T1183', '256',  1.829, 2), ('T1183', '257',  1.829, 3),
  -- T1184 · 10,0 h/correa con 3 of + 3 ay
  ('T1184', '0',    5.000, 0), ('T1184', '2',    5.000, 1),
  ('T1184', '256',  5.000, 2), ('T1184', '257',  5.000, 3),
  -- T1185 · promedio de 5,76 (1 of + 2 ay) y 6,261 (2 of + 4 ay) = 6,011 h/correa
  ('T1185', '0',    2.003, 0), ('T1185', '2',    4.007, 1),
  ('T1185', '256',  2.003, 2), ('T1185', '257',  4.007, 3)
)
insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden, nota)
select a.id, r.id, l.cantidad, l.orden,
       'medido en obra · Horas Hombre.xlsm'
  from linea l
  join public.tarea_tipo tt on tt.codigo = l.codigo
  join public.analisis a    on a.tarea_tipo_id = tt.id and a.vigente
  join public.recurso r     on r.codigo = l.recurso
 where not exists (select 1 from public.analisis_linea x where x.analisis_id = a.id and x.recurso_id = r.id);

-- ── 4 · las 9 mediciones dejan de ser filas sueltas ───────────────────────────────────────────
-- La asignación se hace por `origen`, que identifica la CELDA exacta del libro y tiene índice único.
-- Por qué cada una va donde va queda escrito en `condiciones`, al lado de lo que ya decía.
with asignacion (origen, codigo, porque) as (values
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A6:G6 · ingesta 2026-08-22', 'T1180',
   'la tarea observada dice «MONTAJE DE CMP - 6M» — montaje de columna metálica, sin material'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A11:G11 · ingesta 2026-08-22', 'T1180',
   'la tarea observada dice «MONTAJE DE CMP - 6M» — montaje de columna metálica, sin material'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A7:G7 · ingesta 2026-08-22', 'T1181',
   'la tarea observada dice «pintura de CMP - 6M» — pintura de columna metálica'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A5:G5 · ingesta 2026-08-22', 'T1182',
   'la tarea observada dice «MONTAJE DE VM» — montaje de viga metálica, sin material'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A8:G8 · ingesta 2026-08-22', 'T1182',
   'la tarea observada dice «MONTAJE DE VM» — montaje de viga metálica, sin material'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A10:H10 · ingesta 2026-08-22', 'T1183',
   'la tarea observada dice «ARMADO DE CORREAS» — armado, no colocación: la cuadrilla es 1 oficial + 1 ayudante y no hay medio de acceso'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A4:G4 · ingesta 2026-08-22', 'T1184',
   'la tarea observada dice «COLOCACION DE CORREAS DE TECHO» y anota plataforma y andamio: es la colocación en altura'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A2:G2 · ingesta 2026-08-22', 'T1185',
   'la tarea observada dice «PINTURA DE CORREAS»'),
  ('Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A3:G3 · ingesta 2026-08-22', 'T1185',
   'la tarea observada dice «PINTURA DE CORREAS»')
)
update public.rendimiento_historico rh
   set tarea_tipo_id = tt.id,
       analisis_id   = a.id,
       condiciones   = rh.condiciones || ' ASIGNADA A ' || tt.codigo || ' ' || tt.nombre ||
                       ' el 2026-08-28: ' || asg.porque ||
                       '. La partida cotiza SÓLO ESTE PROCESO, así que esta observación mide la tarea entera y su promedio es comparable.'
  from asignacion asg
  join public.tarea_tipo tt on tt.codigo = asg.codigo
  join public.analisis a    on a.tarea_tipo_id = tt.id and a.vigente
 where rh.origen = asg.origen
   and rh.tarea_tipo_id is null;

-- ── 5 · el control deja de poder decir «acierta» cuando no contrastó nada ─────────────────────
--
-- Estas seis partidas nacen con su rendimiento SACADO de las mismas observaciones contra las que
-- `rendimiento_contra_lo_cotizado` las compara. El resultado, medido: «real 30,400 vs cotizado
-- 30,400 · 0,0% · el análisis acierta», seis veces. No acierta nada — se está mirando al espejo.
--
-- Un control que sólo puede decir que sí no es un control. Y la doctrina ya existía al lado:
-- `rendimiento_recomendado` devuelve NULL con una sola obra y dice «muestra chica: es un dato, no
-- una recomendación». Esta vista se la había perdido, y por eso venía diciendo «el análisis
-- acierta» también de T1001 y T1002, que tienen UNA obra cada una.
--
-- La rama nueva va PRIMERA porque manda sobre las demás: sin dos obras que contrastar, el desvío
-- existe como número y no existe como lectura.
create or replace view public.rendimiento_contra_lo_cotizado with (security_invoker = true) as
select r.tarea_tipo_id,
       t.codigo, t.nombre, t.unidad,
       count(*)::int                                 as muestras,
       count(distinct r.obra_id)::int                as obras,
       round(avg(r.hs_unitarias), 3)                 as hs_real_promedio,
       ac.hs_unitarias                               as hs_cotizado,
       case when ac.hs_unitarias > 0
            then round((avg(r.hs_unitarias) - ac.hs_unitarias) / ac.hs_unitarias * 100, 1) end as desvio_pct,
       case
         when ac.hs_unitarias is null                              then 'el análisis no publica rendimiento'
         -- 0 obras es la evidencia importada, que no dice de qué obra salió; 1 obra es una obra.
         -- En los dos casos no hay con qué contrastar, y el desvío de arriba sigue publicándose:
         -- lo que no se publica es una conclusión que la muestra no sostiene.
         when count(distinct r.obra_id) <= 1                        then 'muestra chica: es un dato, no una lectura'
         when avg(r.hs_unitarias) > ac.hs_unitarias * 1.10          then 'cotizamos corto'
         when avg(r.hs_unitarias) < ac.hs_unitarias * 0.90          then 'cotizamos largo'
         else 'el análisis acierta'
       end                                           as lectura
  from public.rendimiento_historico r
  join public.tarea_tipo t on t.id = r.tarea_tipo_id
  left join public.analisis a on a.tarea_tipo_id = t.id and a.vigente
  left join public.analisis_costo ac on ac.analisis_id = a.id
 group by r.tarea_tipo_id, t.codigo, t.nombre, t.unidad, ac.hs_unitarias;

comment on view public.rendimiento_contra_lo_cotizado is
  '«Cotizamos corto» es la frase que tiene que llegar a la próxima cotización. El umbral del 10% no '
  'es sagrado: es el punto donde el desvío deja de explicarse por la variabilidad normal de una '
  'obra. Que la lectura viva acá y no en cada pantalla es lo que impide que dos pantallas lean el '
  'mismo desvío de dos maneras. Y con una sola obra NO hay lectura: el desvío se publica igual, '
  'pero la conclusión no, porque un análisis sembrado con la única medición que existe siempre '
  'acierta contra sí mismo.';

-- ── 6 · lo que tiene que ser verdad después, o esto no se aplicó ──────────────────────────────
-- FALLA CERRADO: una migración que «corrió bien» y dejó la mitad de las filas es peor que una que
-- no corrió, porque nadie la vuelve a mirar.
do $$
declare n int;
begin
  select count(*) into n from public.tarea_tipo
   where codigo in ('T1180','T1181','T1182','T1183','T1184','T1185') and unidad = 'UN' and activo;
  if n <> 6 then raise exception 'esperaba 6 partidas metálicas nuevas activas en UN y hay %', n; end if;

  select count(*) into n from public.analisis_costo ac
   join public.tarea_tipo tt on tt.id = ac.tarea_tipo_id
   where tt.codigo in ('T1180','T1181','T1182','T1183','T1184','T1185')
     and ac.vigente and ac.tiene_mano_obra and ac.tiene_cargas_sociales
     and ac.hs_unitarias > 0 and coalesce(ac.costo_materiales, 0) = 0;
  if n <> 6 then raise exception 'esperaba 6 análisis con mano de obra, carga social, rendimiento y CERO materiales; hay %', n; end if;

  select count(*) into n from public.rendimiento_historico
   where origen like 'Horas Hombre.xlsm%' and tarea_tipo_id is null;
  if n <> 0 then raise exception 'quedaron % medición(es) de Horas Hombre.xlsm sin tarea asignada', n; end if;

  -- El rendimiento del análisis TIENE que ser el que se midió. Si alguien edita una línea sin
  -- evidencia, esto se pone rojo la próxima vez que la migración se reproduzca desde cero.
  select count(*) into n from public.analisis_costo ac
   join public.tarea_tipo tt on tt.id = ac.tarea_tipo_id
   where tt.codigo in ('T1180','T1181','T1182','T1183','T1184','T1185') and ac.vigente
     and round(ac.hs_unitarias, 2) <> round((
       select avg(rh.hs_unitarias) from public.rendimiento_historico rh where rh.tarea_tipo_id = tt.id), 2);
  if n <> 0 then raise exception '% partida(s) publican un rendimiento distinto del que midieron sus observaciones', n; end if;
  select count(*) into n from public.rendimiento_contra_lo_cotizado
   where codigo in ('T1180','T1181','T1182','T1183','T1184','T1185') and lectura = 'el análisis acierta';
  if n <> 0 then raise exception '% partida(s) declaran que el análisis acierta contra la única medición que lo produjo', n; end if;
end $$;
