-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA DEUDA OPERATIVA Y LA DEUDA DE PRECIO SON DOS COSAS — Y UNA VISTA NO PUEDE CAMBIAR DE
-- SIGNIFICADO SEGÚN QUIÉN LA MIRE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `analisis_incompleto` mezclaba cuatro criterios y uno de ellos —«líneas con recurso sin precio»—
-- sale de `recurso_precio`, que sólo abre para `ve_economia()`. Consecuencia medida hoy, la MISMA
-- vista contra la MISMA base:
--
--     leída por dirección      33 «mano de obra sin carga social» · 26 «sin rendimiento»
--     leída por un jefe de obra 166 «líneas con recurso sin precio» · 33 «sin carga social»
--
-- Para el jefe, la RLS vacía `recurso_precio`, así que **toda** tarea parece no tener precio; y
-- como el `CASE` devuelve el primer criterio que da, las 26 con deuda de rendimiento —que es
-- justamente la que a él le importa, porque sin rendimiento no hay HH ni plazo— **desaparecen de
-- la lista**. La vista no le mentía: le contestaba otra pregunta sin avisar.
--
-- No es un problema de permisos: es un problema de diseño. Un criterio operativo y uno económico no
-- van en la misma columna. Se parten:
--
--   `analisis_incompleto`   → SÓLO deuda operativa. La lee cualquiera y dice lo mismo para todos.
--   `analisis_sin_precio`   → la deuda de precio. Es económica y sólo abre para quien ve economía.
--
-- El nombre viejo se conserva porque ya hay pantallas leyéndolo, y su significado se ACOTA, que es
-- la dirección segura: antes decía de más.

create or replace view public.analisis_incompleto with (security_invoker = true) as
select codigo, nombre, unidad, division, n_lineas, n_lineas_sin_precio, hs_unitarias,
       case
         when n_lineas = 0                                  then 'sin análisis'
         when tiene_mano_obra and not tiene_cargas_sociales  then 'mano de obra sin carga social'
         when hs_unitarias is null or hs_unitarias = 0       then 'sin rendimiento: no aporta HH'
       end as falta
  from public.analisis_costo
 where vigente
   and (n_lineas = 0
        or (tiene_mano_obra and not tiene_cargas_sociales)
        or hs_unitarias is null or hs_unitarias = 0);

comment on view public.analisis_incompleto is
  'La deuda OPERATIVA de la base maestra: sin análisis, mano de obra sin carga social, sin '
  'rendimiento. Los tres se calculan desde las líneas y el tipo de recurso, sin tocar un solo '
  'precio — por eso dice lo mismo para dirección y para un jefe de obra. La deuda de PRECIO vive '
  'en analisis_sin_precio, que es económica.';

create or replace view public.analisis_sin_precio with (security_invoker = true) as
select codigo, nombre, unidad, division, n_lineas, n_lineas_sin_precio, precio_mas_viejo,
       costo_directo
  from public.analisis_costo
 -- `ve_economia()` va en el WHERE y no se deja al RLS de `recurso_precio`: la vista es
 -- security_invoker, así que para quien no ve precios TODAS las líneas parecen no tenerlo y la
 -- vista devolvía las 199 tareas como deuda. Contestar mal es peor que no contestar — con el
 -- filtro devuelve CERO, y cero acá significa «no te corresponde», no «no hay deuda».
 where vigente and n_lineas_sin_precio > 0 and public.ve_economia();

comment on view public.analisis_sin_precio is
  'Las tareas cuyo costo está incompleto porque algún recurso no tiene precio cargado. Es '
  'ECONÓMICA: el propio WHERE exige ve_economia(). Sin ese filtro, a quien no ve precios le '
  'devolvía las 199 tareas —porque con la RLS vacía toda línea parece sin precio—, que es contestar '
  'mal en vez de no contestar. La deuda que sí le toca se la responde analisis_incompleto.';

grant select on public.analisis_incompleto, public.analisis_sin_precio to authenticated;
grant select on public.analisis_incompleto, public.analisis_sin_precio to service_role;

-- ── la tarea tipo puede declarar su plantilla de secuencia ────────────────────────────────────
-- Se emparejaba por `division` contra el NOMBRE de la plantilla, y `tarea_tipo.division` está en
-- NULL en las 199: la solapa Secuencia decía «no tiene plantilla asignada» siempre, para todas.
-- Emparejar por texto dos cosas que no se declararon iguales no es un vínculo, es una coincidencia.
alter table public.tarea_tipo add column if not exists plantilla_id uuid
  references public.plantilla_secuencia (id) on delete set null;

comment on column public.tarea_tipo.plantilla_id is
  'La plantilla de secuencia con la que esta tarea se descompone al convertirla en plan. NULL es '
  'válido y frecuente: no toda tarea tipo tiene pasos. Antes se adivinaba emparejando `division` '
  'con el nombre de la plantilla, y `division` está vacía en las 199 tareas que trajo el libro.';
