-- LA FRESCURA: VOLVÍA A "ATRASADO" Y NUNCA SALÍA, Y ADEMÁS MEDÍA LO QUE NO IMPORTA.
--
-- POR QUÉ (2026-07-23). `recalcular_frescura_fuentes()` sólo escalaba actualizado → atrasado. En
-- todo el código no hay UNA línea que devuelva una fuente a 'actualizado': ni el sync de ARCA, ni el
-- de Sheets, ni el worker. O sea que era un trinquete de una sola vía: una fuente que se atrasa un
-- día queda marcada atrasada para siempre, aunque después sincronice puntualmente todos los días.
--
-- El daño no es cosmético. El Motor de Decisiones abre con "10 fuente(s) crítica(s) con problema de
-- frescura -- las recomendaciones de abajo pueden depender de datos no del todo actualizados". Una
-- alerta que no se puede apagar entrena a la gente a ignorarla, y el día que una fuente se atrase de
-- verdad nadie va a mirar. Una alerta permanente es peor que ninguna alerta.
--
-- LO QUE SE TOCA Y LO QUE NO. La función sigue mirando SÓLO las frecuencias periódicas (diaria,
-- semanal, quincenal, mensual): 'por_evento', 'esporadica' y 'desconocida' no tienen ventana, así
-- que su estado es un juicio humano y no se pisa. Y de los estados, sólo se mueve entre
-- 'actualizado' y 'atrasado': 'error', 'cobertura_parcial', 'conflicto' y 'fuente_no_disponible'
-- también son juicios de una persona sobre la CALIDAD del dato, no sobre su antigüedad.
--
-- ═══ Y LO SEGUNDO: SINCRONIZAR NO ES ESTAR AL DÍA ═══
--
-- El estado se decidía SÓLO por `ultima_sincronizacion_exitosa`, o sea "cuándo lo leí". Caso real:
-- "IVA 2026 (Libro IVA Ventas mensual)" figuraba al día porque se leyó el 26/06 — pero su
-- `cobertura_hasta` es el 31/05. Se leyó hace poco un archivo cuyo contenido termina hace dos meses:
-- falta el libro de junio. Para decidir, lo que importa es HASTA DÓNDE LLEGA EL DATO, no cuándo
-- abrí el archivo.
--
-- Entonces una fuente periódica está al día sólo si sus DOS relojes están dentro de la ventana. Si
-- `cobertura_hasta` es NULL la fuente no declara alcance y sólo manda la sincronización — no se
-- inventa una cobertura que nadie cargó.

-- La ventana de cada frecuencia, en un solo lugar: estaba repetida en cada UPDATE y el día que
-- cambie un umbral hay que acordarse de tocarlo en todos.
create or replace function public.ventana(frecuencia text)
returns interval
language sql
immutable
as $$
  select case frecuencia
    when 'diaria' then interval '2 days'
    when 'semanal' then interval '9 days'
    when 'quincenal' then interval '18 days'
    when 'mensual' then interval '35 days'
  end;
$$;

create or replace function public.recalcular_frescura_fuentes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Se atrasó: la última sincronización exitosa quedó fuera de su ventana.
  update fuentes_datos
  set estado = 'atrasado', updated_at = now()
  where estado = 'actualizado'
    and frecuencia_actualizacion in ('diaria', 'semanal', 'quincenal', 'mensual')
    and ultima_sincronizacion_exitosa is not null
    and (ultima_sincronizacion_exitosa < now() - ventana(frecuencia_actualizacion)
         or (cobertura_hasta is not null and cobertura_hasta < now() - ventana(frecuencia_actualizacion)));

  -- SE PUSO AL DÍA: volvió a sincronizar dentro de su ventana. Esto es lo que faltaba.
  update fuentes_datos
  set estado = 'actualizado', updated_at = now()
  where estado = 'atrasado'
    and frecuencia_actualizacion in ('diaria', 'semanal', 'quincenal', 'mensual')
    and ultima_sincronizacion_exitosa is not null
    and ultima_sincronizacion_exitosa >= now() - ventana(frecuencia_actualizacion)
    and (cobertura_hasta is null or cobertura_hasta >= now() - ventana(frecuencia_actualizacion));
end;
$$;

comment on function public.recalcular_frescura_fuentes() is
  'Mantiene el estado de frescura de las fuentes periódicas en AMBAS direcciones: marca atrasado al salirse de su ventana y devuelve a actualizado al volver a sincronizar dentro de ella. No toca estados que son juicio humano (error, cobertura_parcial, conflicto, fuente_no_disponible) ni frecuencias sin ventana (por_evento, esporadica, desconocida).';
