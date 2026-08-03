-- ============================================================================
-- EL ANCHO DE UNA TASA LO DECIDE LA PANTALLA, NO LO QUE UNA TASA "DEBERÍA" MEDIR.
--
-- `tasa_valor numeric(12,8)` admite hasta 9.999,99999999 — o sea una tasa de
-- 999.999,99%. Sonaba holgadísimo. La pantalla real de Balanz publicó esto el
-- 03/08/2026, verificado sobre la sesión viva:
--
--   ON PLAZA LOGISTICA CL.4 04/03/29 UVA (ZPC4O) · precio 0,37 · TIR 957.395.119,965
--
-- Es una TIR absurda —la fabrica el bróker al calcular contra un precio del
-- 18/06/2026 sobre un papel que casi no opera—, pero es EL DATO QUE LA PANTALLA
-- PUBLICA, y el histórico de mercado existe justamente para poder auditar
-- después con qué dato se decidió. Guardar el insumo tal cual es la regla; la
-- que no se cumplía era la de poder guardarlo.
--
-- ═══ QUÉ COSTABA ═══
--
-- El insert de esa observación tiraba `numeric field overflow` y se llevaba
-- puesta la corrida ENTERA: `guardarInstrumentos` corre antes que
-- `guardarRecomendaciones` y que `cerrarCorrida`, así que la corrida
-- f8849d89-15fb-424f-831a-77163990c506 (03/08/2026 13:33 UTC) quedó `en_curso`
-- para siempre, sin posición, sin ventanas y sin cierre. Una fila mala de 1.108
-- borraba el análisis de caja completo, que estaba bien hecho.
--
-- ═══ POR QUÉ SÓLO ESTAS TRES COLUMNAS ═══
--
-- Las de PLATA (`caja_*`, `monto_maximo`) son `numeric(16,2)`: llegan hasta
-- 99.999.999.999.999,99. La caja real de la empresa se mueve entre $100M y
-- $400M — cinco órdenes de magnitud por debajo del techo. Ensancharlas
-- "por las dudas" sería tapar que el diagnóstico fue preciso. Lo mismo con
-- `precio numeric(18,6)`: el máximo jamás observado es 164.275.
--
-- Las tres que se ensanchan son las que viven en la escala de una TASA y las
-- que se derivan de ella:
--   · observaciones.tasa_valor                → el insumo crudo del bróker;
--   · recomendaciones.rendimiento_neto_periodo → la misma escala un paso después,
--     porque si no, el mismo desborde reaparece al recomendar;
--   · recomendaciones.ganancia_neta_estimada   → monto × tasa. Con una tasa de
--     9,6e8 y un monto de $1e8 el producto pide 17 dígitos enteros y
--     `numeric(16,2)` sólo tiene 14.
--
-- ADITIVA Y SIN PÉRDIDA: los tres cambios ENSANCHAN. Ningún valor guardado se
-- trunca ni se redondea, y la escala decimal no se toca.
--
-- LO QUE ESTA MIGRACIÓN NO ARREGLA, Y HAY QUE DECIRLO: que el OS acepte una TIR
-- de 95.739.511.996% como tasa esperada. Hoy no lo muerde porque `on` no es apta
-- para tesorería (`instrumentos.mjs` → CATEGORIAS), pero ninguna validación pone
-- techo a una tasa: el día que una Lecap ilíquida publique un disparate así, va a
-- ganar el ranking sola. Eso es criterio financiero y se decide arriba, no acá.
-- ============================================================================

do $$
begin
  -- Idempotente por el TIPO REAL de la columna, no por un flag: si ya está
  -- ancha, no se toca. Una migración que se aplica dos veces no puede fallar.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'tesoreria' and table_name = 'observaciones'
       and column_name = 'tasa_valor' and numeric_precision = 12
  ) then
    alter table tesoreria.observaciones alter column tasa_valor type numeric(20,8);
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'tesoreria' and table_name = 'recomendaciones'
       and column_name = 'rendimiento_neto_periodo' and numeric_precision = 12
  ) then
    alter table tesoreria.recomendaciones alter column rendimiento_neto_periodo type numeric(20,8);
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'tesoreria' and table_name = 'recomendaciones'
       and column_name = 'ganancia_neta_estimada' and numeric_precision = 16
  ) then
    alter table tesoreria.recomendaciones alter column ganancia_neta_estimada type numeric(20,2);
  end if;
end $$;

comment on column tesoreria.observaciones.tasa_valor is
  'Tasa publicada por el bróker, en fracción (0,4512 = 45,12%). numeric(20,8) porque la pantalla real publica TIR de hasta 9,6e8 en papeles ilíquidos: el histórico guarda el insumo tal cual, no una versión saneada.';
