-- Línea "obra piloto" (2026-07-08): Pisos tenía HH real cargada (registros_hh, 19 filas,
-- JORNALES) pero costos_reales estaba vacío -- exactamente el caso que el CLAUDE.md
-- raíz prohíbe aceptar como económicamente confiable. Se cruzó cada fila real de
-- registros_hh con el $/hora real de cada trabajador en JORNALES (hoja "Obreros 26",
-- bloques quincenales jun-jul 2026, columna $ HORA) -- no se estima una tarifa
-- promedio, se usa la tarifa real de cada persona.
--
-- Un costos_reales por trabajador/semana (no un agregado) para preservar la
-- trazabilidad real que ya tiene JORNALES (una tarifa distinta por persona) y para que
-- cada fila de registros_hh pueda apuntar a su propio costo real vía costo_real_id.
--
-- estado='comprometido' (no 'pagado'): las semanas ya transcurrieron y JORNALES es el
-- cálculo real de sueldo, pero no hay todavía un movimiento_caja real que confirme el
-- pago -- no se asume, se declara el estado conservador.
with tarifas(trabajador, tarifa) as (
  values
    ('Bronia Rodrigo', 5100),
    ('Gonzalez Carlos', 4000),
    ('Gonzalez Emiliano', 4000),
    ('Gonzalez Juan', 5000),
    ('Gonzalez Valentin', 4000),
    ('Navarro Matias', 5100),
    ('Quiroga Alexander', 4300),
    ('Tello Juan', 5100)
),
nuevos_costos as (
  insert into costos_reales (obra_id, concepto, monto, fecha, estado, fuente_legacy, notas)
  select
    rh.obra_id,
    'Mano de obra real - ' || rh.trabajador_o_cuadrilla || ' - semana ' || rh.fecha_inicio_semana,
    rh.horas * t.tarifa,
    rh.fecha_inicio_semana,
    'comprometido',
    'JORNALES',
    'HH real (' || rh.horas || 'hs) x $/hora real de JORNALES (hoja Obreros 26, $' || t.tarifa || '/hora). Semana ya transcurrida sin movimiento_caja real confirmado -- estado comprometido, no pagado.'
  from registros_hh rh
  join tarifas t on t.trabajador = rh.trabajador_o_cuadrilla
  where rh.obra_id = '85653d8c-e388-443d-80ad-46bf5103dc46'
    and rh.costo_real_id is null
  returning id, concepto
)
update registros_hh rh
set costo_real_id = nc.id
from nuevos_costos nc
where rh.obra_id = '85653d8c-e388-443d-80ad-46bf5103dc46'
  and nc.concepto = 'Mano de obra real - ' || rh.trabajador_o_cuadrilla || ' - semana ' || rh.fecha_inicio_semana
  and rh.costo_real_id is null;
