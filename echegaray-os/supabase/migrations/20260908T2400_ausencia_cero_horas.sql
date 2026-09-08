-- 20260908T2400 · UNA AUSENCIA SIN MOTIVO VALE CERO HORAS, Y LA BASE TIENE QUE PODER GUARDARLO
--
-- El dueño, 08/09/2026 18:50, textual: *«no quiero que al momento de hacer una liquidación de hs las
-- ausencias y licencias sean un conflicto de hs que se suman y que no. Ausencia sin motivo es cero
-- hs. Arreglá eso»*.
--
-- ═══ EL CHECK ERA LA CAUSA, NO UN OBSTÁCULO ═══
--
-- `registros_hh.horas` nació con `check (horas > 0)` (migración 20260707114348). Es correcto para una
-- hora de trabajo: una fila de cero horas trabajadas no es un hecho, es ruido. Pero cuando el
-- 08/09/2026 la ausencia pasó a vivir en esta misma tabla, ese CHECK dejó de ser una defensa y se
-- convirtió en una regla de negocio que nadie decidió: **toda ausencia tenía que llevar horas**, así
-- que el que faltó sin avisar quedaba con la misma jornada cargada que el que tenía parte médico.
-- El código lo dice en tres archivos distintos —«no se usa 0: `registros_hh` exige `horas > 0`»—:
-- una restricción de base estaba escribiendo la política de liquidación de la empresa.
--
-- ═══ POR QUÉ LA EXCEPCIÓN ES SÓLO PARA AUSENCIA Y LICENCIA ═══
--
-- Porque son los dos únicos `tipo_hora` que describen un día NO trabajado. Un `normal` de 0 horas o
-- un `extra_50` de 0 horas siguen siendo ruido y siguen prohibidos: si alguien no trabajó, la fila
-- que corresponde es la ausencia, no un trabajo de cero.
--
-- Quién decide el cero: `src/features/administracion/services/liquidacionDeAusencias.ts`
-- (`horasDeAusencia`), que es donde vive la tabla motivo → paga / no paga. La base sólo deja de
-- impedirlo; no elige por nadie.
--
-- NO CAMBIA NINGÚN GRANT NI NINGUNA POLICY: quien podía escribir una ausencia de 9 horas es
-- exactamente quien puede escribir una de 0. Los lectores de HH de obra no se mueven: ya contaban
-- sólo las trabajadas (`20260907T2300_una_ausencia_no_es_trabajo_en_las_vistas`), así que una
-- ausencia de 0 no cambia un solo número de plan contra real.

alter table public.registros_hh drop constraint if exists registros_hh_horas_check;

alter table public.registros_hh add constraint registros_hh_horas_check
  check (horas > 0 or (tipo_hora in ('ausencia', 'licencia') and horas = 0));

comment on column public.registros_hh.horas is
  'Horas del día. > 0 siempre, salvo una ausencia o licencia que no se paga: ésa vale 0 (dueño, 08/09/2026: «ausencia sin motivo es cero hs»). Qué motivo paga lo decide horasDeAusencia() en liquidacionDeAusencias.ts.';
