-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL DUPLICADO POSIBLE SE DETECTA, NO SE DECIDE — y la decisión de una persona queda escrita
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La pantalla 24 · Compras necesita dos cosas que `comprobantes_arca` no tenía:
--
--   1 · saber si un comprobante PUEDE ser el mismo gasto que otro ya capturado, y
--   2 · poder guardar que una persona lo miró y decidió.
--
-- Hoy el estado de control vivía en ningún lado: la única forma de "resolver" un duplicado era
-- acordarse. Un estado en memoria del navegador se pierde al recargar y hace que la misma pantalla
-- le conteste distinto a dos personas — eso no es un control, es una impresión.
--
-- ═══ POR QUÉ ESTO NO ES `sinComprobantesRepetidos()` OTRA VEZ ═══
--
-- `orquestador/lib/arca-duplicados.mjs` ya deduplica el libro, y su clave es la IDENTIDAD FISCAL:
-- tipo + CUIT + punto de venta + número + importe. Eso saca de la lista al MISMO comprobante bajado
-- dos veces (re-sync). Es un defecto de la réplica y se resuelve solo, sin preguntarle a nadie.
--
-- Lo de acá es otra pregunta, y es una que NO se puede contestar sola: dos comprobantes con NÚMEROS
-- DISTINTOS —y por lo tanto con CAE distinto, o sea fiscalmente dos papeles legítimos— por el mismo
-- proveedor, el mismo importe y a pocos días. Eso puede ser el proveedor facturando dos veces lo
-- mismo, la misma compra entrando por dos vías… o dos compras iguales de verdad (dos viajes de
-- áridos del mismo camión salen igual). Por eso la vista se llama POSIBLE duplicado, por eso no
-- borra nada, y por eso la pantalla sólo ofrece comparar, confirmar o dejar en revisión.
--
-- El re-sync se EXCLUYE explícitamente: mismo punto de venta + mismo número es el caso que ya
-- resuelve la deduplicación de arriba. Acusar de duplicado a lo que es un defecto de la réplica
-- mandaría a una persona a investigar un problema que no existe.
--
-- ═══ EL SIGNO — LA TRAMPA YA PAGADA EN ESTA CASA ═══
--
-- `orquestador/lib/comprobante-arca.mjs`, 21/07: buscando facturas faltantes aparecieron PARES del
-- mismo proveedor, el mismo día, con importes casi idénticos. Parecía facturación duplicada. Uno
-- era tipo 1 (Factura A) y el otro tipo 3 (Nota de Crédito A): nunca hubo duplicado, había una
-- columna que nadie leía. Una nota de crédito NO es duplicado de la factura que anula — es su
-- contrario. Si esta vista no mirara el signo, marcaría como duplicada cada anulación del año.
--
-- Por eso el signo vive en una FUNCIÓN de la base y no repetido en el `where`: la misma regla que
-- `signo()` en JavaScript, del mismo lado del que se lee. El test
-- `comprobante-duplicado.pg.test.mjs` compara las dos listas código por código, así que agregar un
-- código en un lado y olvidarlo en el otro se pone rojo — no se descubre en un cuadro de IVA.

-- ── 1 · el signo, en la base ───────────────────────────────────────────────────────────────────
--
-- DEVUELVE NULL A PROPÓSITO cuando el código no se conoce. Es el mismo contrato que el módulo de
-- JavaScript: un tipo desconocido tratado como positivo es el bug que originó todo esto. Acá, un
-- null hace que el comprobante NO se empareje con nadie — fallar cerrado es no acusar.
create or replace function public.comprobante_signo(tipo text)
returns smallint
language sql
immutable
as $$
  select case
    -- RESTAN: notas de crédito en todas sus variantes.
    when btrim(coalesce(tipo, '')) in
      ('3','8','13','21','41','53','110','112','113','114','119','203','208','213') then -1::smallint
    -- SUMAN: facturas, tiques, notas de débito y crédito electrónico.
    when btrim(coalesce(tipo, '')) in
      ('1','2','6','7','11','12','19','20','39','40','51','52','81','82','83','109','111','118',
       '201','202','206','207','211','212') then 1::smallint
    else null
  end
$$;

comment on function public.comprobante_signo(text) is
  'Espejo en SQL de signo() de orquestador/lib/comprobante-arca.mjs: +1 suma, -1 resta (nota de '
  'crédito), NULL si el código no se conoce. NULL no es 0: es "no lo sé", y quien llama decide. '
  'comprobante-duplicado.pg.test.mjs compara las dos listas para que no puedan separarse.';

-- ── 2 · la letra, que también decide si dos papeles son comparables ────────────────────────────
--
-- Una Factura A y una Factura B del mismo importe no son el mismo comprobante repetido: son dos
-- circuitos fiscales distintos. La letra se saca del mismo código de ARCA y se exige igual para
-- emparejar. Los tiques SIN letra —83 «Tique», 110 «Tique Nota de Crédito»— devuelven NULL y por lo
-- tanto no se emparejan con nadie: sin letra no se puede afirmar compatibilidad, y afirmarla sería
-- adivinar en la dirección de acusar.
create or replace function public.comprobante_letra(tipo text)
returns text
language sql
immutable
as $$
  select case btrim(coalesce(tipo, ''))
    when '1' then 'A' when '2' then 'A' when '3' then 'A' when '81' then 'A' when '112' then 'A'
    when '201' then 'A' when '202' then 'A' when '203' then 'A'
    when '6' then 'B' when '7' then 'B' when '8' then 'B' when '82' then 'B' when '113' then 'B'
    when '206' then 'B' when '207' then 'B' when '208' then 'B'
    when '11' then 'C' when '12' then 'C' when '13' then 'C' when '109' then 'C' when '111' then 'C'
    when '114' then 'C' when '211' then 'C' when '212' then 'C' when '213' then 'C'
    when '51' then 'M' when '52' then 'M' when '53' then 'M' when '118' then 'M' when '119' then 'M'
    when '19' then 'E' when '20' then 'E' when '21' then 'E'
    when '39' then 'T' when '40' then 'T' when '41' then 'T'
    else null
  end
$$;

comment on function public.comprobante_letra(text) is
  'La letra del comprobante (A/B/C/M/E/T) derivada del código de ARCA. NULL para los tiques sin '
  'letra y para todo código desconocido: sin letra no hay compatibilidad que afirmar.';

-- ── 2b · el nombre del tipo, para que la pantalla no tenga su propia tabla de códigos ──────────
--
-- «Factura A» no se puede derivar del signo ni de la letra: una factura y una nota de débito suman
-- las dos. Es una tabla, y una tabla de códigos copiada es una tabla de códigos que se separa. La
-- web es TypeScript y no puede importar `orquestador/lib/comprobante-arca.mjs`, así que la traducción
-- entra por la base —que es la fuente que las dos caras ya comparten— y el test la compara contra
-- `NOMBRE` código por código.
--
-- Un código que no está NO se adivina: se dice «tipo N (desconocido)», textual como en JavaScript.
-- La pantalla lo muestra como «Sin clasificar», que es exactamente lo que es.
create or replace function public.comprobante_nombre_tipo(tipo text)
returns text
language sql
immutable
as $$
  select coalesce(
    case btrim(coalesce(tipo, ''))
      when '1' then 'Factura A' when '2' then 'Nota de Débito A' when '3' then 'Nota de Crédito A'
      when '6' then 'Factura B' when '7' then 'Nota de Débito B' when '8' then 'Nota de Crédito B'
      when '11' then 'Factura C' when '12' then 'Nota de Débito C' when '13' then 'Nota de Crédito C'
      when '51' then 'Factura M' when '52' then 'Nota de Débito M' when '53' then 'Nota de Crédito M'
      when '81' then 'Tique Factura A' when '82' then 'Tique Factura B' when '83' then 'Tique'
      when '109' then 'Tique C' when '111' then 'Tique Factura C'
      when '112' then 'Tique Nota de Crédito A' when '113' then 'Tique Nota de Crédito B'
      when '114' then 'Tique Nota de Crédito C'
      when '201' then 'Factura de Crédito Electrónica MiPyME A'
      when '202' then 'Nota de Débito FCE MiPyME A'
      when '203' then 'Nota de Crédito FCE MiPyME A'
      else null
    end,
    'tipo ' || coalesce(tipo, '') || ' (desconocido)'
  )
$$;

comment on function public.comprobante_nombre_tipo(text) is
  'Espejo en SQL de nombreTipo() de orquestador/lib/comprobante-arca.mjs. Existe para que la web no '
  'se escriba su propia tabla de códigos de ARCA; el test las compara para que no se separen.';

-- ── 3 · el estado de control: lo que una persona decidió sobre el papel ────────────────────────
--
-- Tres valores y ninguno más. `sin_revisar` es lo que llega de ARCA —el default tiene que ser la
-- ausencia de juicio humano, nunca "está bien"—; `confirmado` es alguien diciendo que el papel es
-- correcto (y con eso el aviso de posible duplicado deja de pedir trabajo); `en_revision` es alguien
-- diciendo "no decido ahora", que es una respuesta válida y tiene que sobrevivir a la recarga.
--
-- CONFIRMAR NO ES IMPUTAR. Son dos hechos distintos y se guardan aparte: `obra_texto` sigue siendo
-- quién paga el gasto, `estado_control` es si el papel se miró. Un comprobante confirmado sin obra
-- sigue siendo trabajo pendiente, y la pantalla lo dice.
alter table public.comprobantes_arca
  add column if not exists estado_control     text not null default 'sin_revisar',
  add column if not exists estado_control_por text,
  add column if not exists estado_control_en  timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'comprobantes_arca_estado_control_check'
  ) then
    alter table public.comprobantes_arca
      add constraint comprobantes_arca_estado_control_check
      check (estado_control in ('sin_revisar', 'confirmado', 'en_revision'));
  end if;
end $$;

comment on column public.comprobantes_arca.estado_control is
  'Qué decidió una PERSONA sobre este papel: sin_revisar (default, nadie lo miró) · confirmado '
  '(está bien) · en_revision (marcado para volver). No dice nada sobre la imputación a obra: eso es '
  'obra_texto y es otro hecho.';

create index if not exists comprobantes_arca_estado_control
  on public.comprobantes_arca (estado_control)
  where estado_control <> 'sin_revisar';

-- El cruce de duplicados empareja por CUIT NORMALIZADO e importe redondeado, no por las columnas
-- crudas: sin un índice sobre esas dos expresiones, la vista no puede usar ninguno de los que hay y
-- cada consulta compara el libro entero contra sí mismo. Con 632 comprobantes no se nota; el índice
-- existe para cuando sean 6.000.
create index if not exists comprobantes_arca_emisor_importe on public.comprobantes_arca
  ((regexp_replace(coalesce(emisor_cuit, ''), '\D', '', 'g')), (round(coalesce(imp_total, 0), 2)));

-- NO HACE FALTA UN GRANT NUEVO, Y ESTO SE ESCRIBE PORQUE LA PREGUNTA VUELVE. La 20260716140000 dio
-- `grant select on public.comprobantes_arca` y la 20260716360000 `grant update` — los dos a nivel
-- TABLA, no por columna, así que las columnas nuevas nacen alcanzadas. Cuando el grant es por
-- columna pasa lo contrario: la columna nueva nace sin permiso y la web la lee vacía sin un solo
-- error. El test lo verifica escribiendo como `authenticated`, no leyendo esta línea.

-- ── 4 · la vista: el posible duplicado, señalado sobre el MÁS NUEVO ────────────────────────────
--
-- Una fila por PAR, no dos. La fila se cuelga del comprobante más nuevo y apunta al más viejo, que
-- es como se lee: «este que acaba de entrar se parece a aquel que ya estaba». Simétrica contaría
-- cada par dos veces y el KPI diría el doble de lo que hay.
--
-- Los seis filtros, y qué defecto evita cada uno:
--   · mismo CUIT (sólo dígitos)  — sin CUIT no se empareja: dos emisores desconocidos con el mismo
--                                  importe son dos compras distintas, y fusionarlas borra una real.
--   · mismo importe ≠ 0          — dos comprobantes en cero no son un duplicado, son dos huecos.
--   · mismo signo, no nulo       — la nota de crédito NO es duplicado de su factura (21/07).
--   · misma letra, no nula       — una A y una B son dos circuitos distintos.
--   · ≤ 35 días                  — cubre el mes y el corte de facturación de un proveedor mensual
--                                  sin llegar a emparejar el mismo consumo de dos meses seguidos.
--   · distinto punto de venta+nº — mismo pv+nº es re-sync de la réplica, no un duplicado.
--   · no es un cargo recurrente  — ver abajo. Es el filtro que decide si esto sirve o se ignora.
--
-- ═══ EL ABONO MENSUAL NO ES UN DUPLICADO — MEDIDO, NO SUPUESTO ═══
--
-- Con los seis filtros de arriba y los datos reales del 21/08, la vista señalaba 34 pares sobre 632
-- comprobantes. Mirándolos uno por uno, la mayoría eran STARLINK, AC SAT, SANITARIOS OD y el alquiler
-- de MEGLIOLI: el MISMO importe exacto, todos los meses, a 28-33 días. No son duplicados, son abonos.
--
-- Una alerta que se enciende todos los meses por lo mismo se apaga sola en la cabeza de quien la
-- mira, y ahí deja de existir el control. Peor: los pares que SÍ importaban —SANCOR con 0 días de
-- distancia, PEREZ GARCIA facturando el mismo importe desde dos puntos de venta distintos con un día
-- de diferencia— quedaban sepultados entre treinta avisos de alquiler.
--
-- El filtro: si el mismo emisor facturó ESE MISMO importe TRES O MÁS veces en todo el libro, es un
-- cargo fijo y no se señala. Con eso los 34 pares bajan a 12, y los 22 que salen son todos abonos.
--
-- LO QUE ESTE FILTRO SE LLEVA PUESTO, Y SE DECLARA: un proveedor facturado tres veces de más por el
-- mismo importe deja de verse. Es el precio de que el aviso siga significando algo, y es reversible
-- —el umbral está en una sola línea—. Con dos apariciones todavía se señala, así que el segundo
-- cobro se ve; el que se pierde es el tercero.
create or replace view public.comprobante_posible_duplicado as
select
  nuevo.id                                                as comprobante_id,
  nuevo.estado_control                                    as estado_control,
  viejo.id                                                as parecido_a_id,
  viejo.tipo_comprobante                                  as parecido_tipo,
  viejo.punto_venta                                       as parecido_punto_venta,
  viejo.numero                                            as parecido_numero,
  viejo.fecha_emision                                     as parecido_fecha,
  viejo.imp_total                                         as parecido_imp_total,
  viejo.obra_texto                                        as parecido_obra_texto,
  abs(nuevo.fecha_emision - viejo.fecha_emision)          as dias_de_distancia
from public.comprobantes_arca nuevo
join public.comprobantes_arca viejo
  on  viejo.tipo_libro = nuevo.tipo_libro
  and nullif(regexp_replace(coalesce(viejo.emisor_cuit, ''), '\D', '', 'g'), '')
    = nullif(regexp_replace(coalesce(nuevo.emisor_cuit, ''), '\D', '', 'g'), '')
  and round(coalesce(viejo.imp_total, 0), 2) = round(coalesce(nuevo.imp_total, 0), 2)
  and round(coalesce(nuevo.imp_total, 0), 2) <> 0
  and public.comprobante_signo(nuevo.tipo_comprobante) is not null
  and public.comprobante_signo(viejo.tipo_comprobante) = public.comprobante_signo(nuevo.tipo_comprobante)
  and public.comprobante_letra(nuevo.tipo_comprobante) is not null
  and public.comprobante_letra(viejo.tipo_comprobante) = public.comprobante_letra(nuevo.tipo_comprobante)
  and viejo.fecha_emision is not null
  and abs(nuevo.fecha_emision - viejo.fecha_emision) <= 35
  and (coalesce(viejo.punto_venta, ''), coalesce(viejo.numero, ''))
   is distinct from (coalesce(nuevo.punto_venta, ''), coalesce(nuevo.numero, ''))
  -- el más viejo primero; empate de fecha lo desempata el orden de llegada y después el id, para
  -- que el par siempre se cuelgue del mismo lado aunque los dos hayan entrado el mismo día
  and (viejo.fecha_emision, viejo.created_at, viejo.id) < (nuevo.fecha_emision, nuevo.created_at, nuevo.id)
where nuevo.fecha_emision is not null
  -- EL ABONO MENSUAL NO SE SEÑALA. Tres o más veces el mismo importe del mismo emisor es un cargo
  -- fijo (alquiler, internet, seguro), no una compra repetida. El umbral vive en esta línea y en
  -- ningún otro lado: subirlo o bajarlo es una decisión de una sola edición.
  and (
    select count(*) from public.comprobantes_arca r
    where r.tipo_libro = nuevo.tipo_libro
      and nullif(regexp_replace(coalesce(r.emisor_cuit, ''), '\D', '', 'g'), '')
        = nullif(regexp_replace(coalesce(nuevo.emisor_cuit, ''), '\D', '', 'g'), '')
      and round(coalesce(r.imp_total, 0), 2) = round(coalesce(nuevo.imp_total, 0), 2)
  ) < 3;

comment on view public.comprobante_posible_duplicado is
  'Pares de comprobantes que PUEDEN ser el mismo gasto: mismo emisor, mismo importe, mismo signo y '
  'misma letra, a 35 días o menos, con número distinto. La fila se cuelga del más nuevo. No decide '
  'nada: dos compras iguales de verdad existen. La resolución es humana y queda en estado_control.';

-- La vista hereda la RLS de `comprobantes_arca` (`security_invoker`), así que no abre ni una fila
-- que la tabla no abriera ya. Sin el grant, PostgREST devuelve 404 y Next lo muestra como pantalla
-- vacía: una policy sin grant no es un permiso.
alter view public.comprobante_posible_duplicado set (security_invoker = on);
grant select on public.comprobante_posible_duplicado to authenticated;

-- ── 5 · el libro de COMPRAS, ya traducido — lo que lee la pantalla 24 ──────────────────────────
--
-- La pantalla no lee `comprobantes_arca`: lee esta vista. Tres cosas se definen acá una sola vez en
-- vez de una vez por consumidor:
--
--   · QUÉ ES UNA COMPRA. `tipo_libro = 'R'` (recibidos) estaba escrito como constante en
--     `costosObraService.ts` y habría que volver a escribirlo en cada pantalla nueva.
--   · CÓMO SE LLAMA EL PAPEL. El código de ARCA traducido, sin tabla copiada en el front.
--   · SI TIENE UN PARECIDO. El `exists` contra la vista de duplicados: sin esto la web tendría que
--     traerse los pares y volver a cruzarlos en memoria, que es una segunda definición de
--     «duplicado» esperando a discrepar con la primera.
--
-- El IMPORTE SE PUBLICA COMO ESTÁ EN EL PAPEL y el signo va aparte. Multiplicarlo acá escondería el
-- caso que importa: cuando el tipo no se conoce el signo es NULL, y un NULL multiplicado borraría el
-- número en vez de marcarlo. La pantalla muestra el importe y dice que el papel no se pudo clasificar.
create or replace view public.comprobante_compra as
select
  c.id,
  c.fecha_emision,
  c.tipo_comprobante,
  public.comprobante_nombre_tipo(c.tipo_comprobante) as tipo_nombre,
  public.comprobante_letra(c.tipo_comprobante)       as letra,
  public.comprobante_signo(c.tipo_comprobante)       as signo,
  c.punto_venta,
  c.numero,
  nullif(btrim(coalesce(c.punto_venta, '') || '-' || coalesce(c.numero, ''), '-'), '') as comprobante,
  c.cae,
  c.emisor_cuit,
  c.emisor_nombre,
  c.moneda,
  c.imp_total,
  c.neto_gravado,
  c.neto_no_gravado,
  c.exento,
  c.total_iva,
  c.otros_tributos,
  c.iva_por_alicuota,
  c.periodo,
  c.origen,
  c.created_at,
  c.obra_texto,
  c.obra_asignada_por,
  c.obra_asignada_en,
  c.estado_control,
  c.estado_control_por,
  c.estado_control_en,
  exists (
    select 1 from public.comprobante_posible_duplicado d where d.comprobante_id = c.id
  ) as tiene_posible_duplicado
from public.comprobantes_arca c
where c.tipo_libro = 'R';

comment on view public.comprobante_compra is
  'El libro de COMPRAS de ARCA como lo lee la pantalla 24: tipo_libro=R, el código traducido, el '
  'signo, y si el comprobante tiene un parecido sin resolver. No agrega ni una fila que '
  'comprobantes_arca no publique ya.';

alter view public.comprobante_compra set (security_invoker = on);
grant select on public.comprobante_compra to authenticated;
