-- DOS OBRAS DEL GANTT DECÍAN UNA FECHA QUE EL SHEET NO DICE (07/09/2026)
--
-- EL PEDIDO DEL DUEÑO, TEXTUAL: *"las obras tienen inicio y fin, quiero que el Gantt refleje esto"*.
--
-- ═══ LO MEDIDO, CONTRA LA BASE PRODUCTIVA, ANTES DE ESCRIBIR UNA LÍNEA ═══
--
-- `node orquestador/scripts/obras-cartera-canonica.mjs --sql` (salida literal, 07/09/2026):
--
--     FECHAS DISTINTAS  PISOS INDUSTRIALES (pisos-industriales)
--         pestaña OBRAS : 2026-08-05 → 2026-09-30
--         obra_canonica : 2026-08-22 → 2026-10-02
--     FECHAS DISTINTAS  ENTREPISO Y ESCALERA (entrepiso-y-escalera)
--         pestaña OBRAS : 2026-08-10 → 2026-08-21
--         obra_canonica : 2026-08-10 → 2026-09-18
--
-- Esas dos barras se dibujaban en `/obras/gantt` con el mismo color y la misma confianza que las
-- otras siete. PISOS INDUSTRIALES arrancaba DIECISIETE DÍAS tarde en la pantalla y ENTREPISO Y
-- ESCALERA terminaba VEINTIOCHO DÍAS tarde. No hubo ningún error en ningún lado: el Gantt no se
-- rompió, mintió.
--
-- ═══ POR QUÉ LA PESTAÑA GANA, Y NO ES UNA PREFERENCIA ═══
--
-- `orquestador/lib/obras-datos.mjs#obrasVendidas` es la transcripción de la pestaña OBRAS del
-- «Flujo de Caja - Cash Flow»: es lo que el dueño mira, y es lo que proyecta los egresos de caja de
-- cada obra. `obra_canonica.fecha_*_plan` es el espejo que alimenta las pantallas. Una fecha de obra
-- es un compromiso con un cliente; el campo de un formulario no le gana a la venta.
--
-- Es además la MISMA regla que ya fijaron `20260907T2000` (que insertó estas diez con exactamente
-- estas fechas) y `20260907T2010` (que archivó las actividades porque su envolvente «le ganaba al
-- Sheet»). Esto no decide nada nuevo: repone lo que esas dos ya habían decidido y que algo posterior
-- —el formulario de la ficha o el generador de cronograma, que escriben las dos columnas— pisó.
--
-- ═══ TRES COSAS QUE ESTA MIGRACIÓN NO HACE, Y NINGUNA ES UN OLVIDO ═══
--
--   · NO reactiva `sf-mamposteria`. El control también la marca —la pestaña la lista y la base la
--     tiene `cerrada`— pero salió de la cartera el 07/09 porque está cobrada entera. Que una obra
--     entre o salga de la cartera lo decide el dueño, no una migración de sincronización.
--   · NO toca `obra_actividad`. Las dos obras tienen CERO actividades (medido), así que
--     `obra_fechas` ya cae al campo declarado y corregirlo alcanza para que la pantalla cambie.
--   · NO agrega una restricción que impida volver a separarse. El control existe y es ejecutable
--     (`orquestador/scripts/obras-cartera-canonica.mjs`, código de salida 1 si difieren, con su
--     lógica probada en `orquestador/lib/obras-cartera-canonica.test.mjs`); un trigger que
--     rechazara editar la fecha en la ficha rompería el alta de una obra que todavía no está en la
--     pestaña, y eso es una decisión de producto.
--
-- SIN `begin`/`commit` PROPIOS: `aplicar-migracion.mjs` envuelve el archivo.

update public.obra_canonica
   set fecha_inicio_plan = '2026-08-05'::date, fecha_fin_plan = '2026-09-30'::date
 where id = 'pisos-industriales';

update public.obra_canonica
   set fecha_inicio_plan = '2026-08-10'::date, fecha_fin_plan = '2026-08-21'::date
 where id = 'entrepiso-y-escalera';

-- ── LA GUARDA MIRA LA VISTA QUE MIRA EL DUEÑO, NO LA TABLA QUE ESCRIBÍ ───────────────────────────
-- Un control nunca se valida contra la misma información que produce. Los `update` de arriba
-- escriben `obra_canonica`; esto lee `obra_plan_vs_real`, que es de donde `/obras/gantt` saca
-- `inicio_plan` y `fin_plan` para dibujar cada barra. Entre una y otra hay dos vistas
-- (`obra_fechas`, `obra_panel`) y un `coalesce` con la envolvente de las actividades: si alguna de
-- las dos obras tuviera una actividad viva, el `update` habría dado «UPDATE 1» y la pantalla
-- seguiría diciendo lo mismo de antes. Eso es exactamente lo que pasó el 07/09 con Salón Comercial.
do $$
declare mal int;
begin
  select count(*) into mal
  from public.obra_plan_vs_real v
  where (v.obra_id = 'pisos-industriales'
          and (v.inicio_plan, v.fin_plan) is distinct from ('2026-08-05'::date, '2026-09-30'::date))
     or (v.obra_id = 'entrepiso-y-escalera'
          and (v.inicio_plan, v.fin_plan) is distinct from ('2026-08-10'::date, '2026-08-21'::date));
  if mal > 0 then
    raise exception 'el Gantt seguiría dibujando otra fecha que la del Sheet en % obra(s)', mal;
  end if;

  -- Y QUE SIGAN SIENDO DIBUJABLES: activas, en la cartera. Un `update` de fechas que dejara la obra
  -- fuera de la cartera arreglaría el dato y borraría la barra.
  if (select count(*) from public.obra_canonica
       where id in ('pisos-industriales', 'entrepiso-y-escalera') and estado = 'activa') <> 2 then
    raise exception 'las dos obras corregidas tienen que seguir activas para que el Gantt las dibuje';
  end if;
end $$;
