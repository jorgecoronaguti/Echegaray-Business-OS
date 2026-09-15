-- 20260915T2200 · PRESENTISMO: LLEGAR TARDE O IRSE ANTES PIERDE EL 20 % DEL BÁSICO (dueño, 15/09/2026)
--
-- Dueño, textual: «hacelo». Parte de lo que hoy cobra un obrero pasa a llamarse PRESENTISMO:
-- 20 % × (horas de la quincena ÷ 2) × básico UOCRA de su categoría (art. 52 CCT 76/75). Sin ninguna
-- tardanza ni salida temprana en la quincena cobra lo mismo que hoy; con UNA sola pierde el
-- presentismo entero. No hay plata nueva. Rige desde la quincena 16–30/09/2026; lo sellado no se toca.
--
-- Ejemplo aprobado: Agüero, oficial, 16–31/08, 105 h, $627.000. Presentismo = 0,2 × 52,5 × 6.348 =
-- $66.654. Sin marca cobra $627.000; con una, $560.346.
--
-- ═══ QUÉ AGREGA ═══
--
--   1. `asistencia_dia.llego_tarde` y `asistencia_dia.salio_antes`: la marca del jefe, el día que pasa.
--      Es la tabla de la PRESENCIA DECLARADA (20260908T1900) y no `registros_hh`: una tardanza es un hecho
--      sobre la persona ese día, no una hora imputada a una obra. Un CHECK impide marcar tardanza a quien
--      está declarado ausente o de licencia: las dos afirmaciones no pueden ser ciertas a la vez
--      (misma forma que `asistencia_dia_presente_sin_motivo`).
--   2. `liquidacion_linea.presentismo` y `liquidacion_linea.presentismo_perdido`: la foto del sello. El
--      importe en juego y, si se perdió, las fechas de las marcas («17/09, 23/09»). Es lo que hace
--      auditable el descuento después: la regla puede cambiar y el sello dice con qué se pagó.
--
-- ═══ EL BÁSICO NO SE CARGA ACÁ ═══
--
-- `uocra_escala` (20260720110000) YA tiene la escala del CCT 76/75 zona A vigente desde 08/2026, con
-- su fuente (oficial_especializado 7.420 · oficial 6.348 · medio_oficial 5.866 · ayudante 5.399 $/h;
-- construar.com.ar, salarios de septiembre 2026 por zona), y `convenio_escala` (20260909T1720) la tiene
-- copiada con la equivalencia de rótulos que el dueño autorizó el 14/09/2026. La liquidación ya lee
-- ese piso por categoría (`exponerAlPiso` → `pisoVigente`) para el blanco estimado; el presentismo
-- usa EL MISMO número. Crear una tabla `uocra_basico` sería la tercera copia del mismo dato.
--
-- ═══ RLS ═══
--
-- Ninguna policy se toca. `asistencia_dia` concede INSERT/UPDATE por columna y una columna nueva
-- nace SIN permiso (20260908T2300 lo pagó con `origen`): se conceden las dos. `liquidacion_linea`
-- también concede por columna: SELECT para que la web lea la foto; la escribe el sello con la clave
-- de servicio (`escribirFoto`), igual que `cobra` y `total`.

set local lock_timeout = '5s';

-- ── 1 · la marca del jefe ───────────────────────────────────────────────────────────────────────
alter table public.asistencia_dia
  add column if not exists llego_tarde boolean not null default false,
  add column if not exists salio_antes boolean not null default false;

comment on column public.asistencia_dia.llego_tarde is
  'El jefe marcó que llegó tarde ese día. Una sola marca en la quincena pierde el presentismo entero (art. 52 CCT 76/75).';
comment on column public.asistencia_dia.salio_antes is
  'El jefe marcó que se fue antes ese día. Una sola marca en la quincena pierde el presentismo entero (art. 52 CCT 76/75).';

-- Tardanza sólo sobre una presencia: quien no vino no llegó tarde. Segunda cerradura del Zod de la acción.
alter table public.asistencia_dia drop constraint if exists asistencia_dia_tardanza_solo_presente;
alter table public.asistencia_dia add constraint asistencia_dia_tardanza_solo_presente
  check ((not llego_tarde and not salio_antes) or estado = 'presente');

grant select (llego_tarde, salio_antes) on public.asistencia_dia to authenticated;
grant insert (llego_tarde, salio_antes) on public.asistencia_dia to authenticated;
grant update (llego_tarde, salio_antes) on public.asistencia_dia to authenticated;

-- ── 2 · la foto del sello ───────────────────────────────────────────────────────────────────────
alter table public.liquidacion_linea
  add column if not exists presentismo         numeric(14,2),
  add column if not exists presentismo_perdido text;

comment on column public.liquidacion_linea.presentismo is
  'El presentismo en juego al sellar: 20 % × (horas ÷ 2) × básico de la categoría. NULL = no rige (jefe, quincena anterior al 16/09/2026, sin categoría).';
comment on column public.liquidacion_linea.presentismo_perdido is
  'Fechas de las marcas de tardanza o salida temprana que hicieron perder el presentismo («17/09, 23/09»). NULL = no lo perdió.';

grant select (presentismo, presentismo_perdido) on public.liquidacion_linea to authenticated;
