-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE EXISTE PARA PROBAR NO SE MUESTRA · Y UNA BAJA CON PAPEL TIENE FECHA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 07/09/2026: «que la sección Personal esté correcta, revisá la carpeta de Drive y
-- corregí absolutamente todo». Auditoría cruzada Drive ↔ Postgres ↔ pantalla. Tres defectos que se
-- corrigen acá porque los tres son de datos o de vista, no de React.
--
-- ═══ 1. CUATRO PERSONAS FICTICIAS EN LA PANTALLA DE PRODUCCIÓN ═══
--
-- La migración 20260822T6400 creó `es_prueba` para que «un fixture pueda marcar lo que crea y el
-- producto no lo muestre aunque la limpieza falle». Hoy no se cumple en NINGUNO de los dos frentes:
-- tres de los cuatro registros de prueba tienen `es_prueba=false`, y `persona_directorio` ni
-- siquiera mira la columna. Resultado medido hoy: abrir «Inactivos» mezcla 4 personas inventadas con
-- los ex-empleados reales. Se arregla en los dos lados a la vez — marcar sin filtrar no muestra
-- menos, y filtrar sin marcar deja tres adentro.
--
-- ═══ 2. SIETE BAJAS CON EL PAPEL EN DRIVE Y SIN FECHA EN LA BASE ═══
--
-- Siete personas ya inactivas tienen «BAJA 12-08-2026.pdf» en su carpeta de Drive, con la fecha
-- legible en el nombre, y `fecha_egreso IS NULL`. El motor `fechaDelArchivo()` SABE leer esa fecha,
-- pero el sincronizador sólo la usa para `documentacion_legajo.fecha_documento` y nunca la sube a
-- `personas`. No se está infiriendo nada: la fecha está escrita en el documento de baja.
--
-- Se toca SÓLO a quien ya está fuera de la empresa Y no tiene fecha: si alguien cargó una distinta,
-- la suya manda y esta migración no la ve.
--
-- ═══ 3. UNA CATEGORÍA QUE NO MATCHEA CON NINGÚN FILTRO POR ESCRIBIRSE EN MAYÚSCULAS ═══
--
-- `AYUDANTE` (1 persona) contra `ayudante` (17). `etiquetaCategoria()` no normaliza, así que esa
-- fila se lee literal «AYUDANTE» y no entra en ningún filtro por categoría de convenio. El catálogo
-- de `CATEGORIAS_UOCRA` es en minúscula: esa es la grafía canónica.

-- ── 1 · las de prueba, marcadas ────────────────────────────────────────────────────────────────
update public.personas
   set es_prueba = true
 where es_prueba is not true
   and (nombre_completo ilike '%E2E%' or nombre_completo ilike '[PRUEBA%');

-- ── 1 · y la vista deja de publicarlas ─────────────────────────────────────────────────────────
create or replace view public.persona_directorio
with (security_invoker = true) as
select p.id, p.nombre_completo, p.categoria, p.especialidad, p.puesto,
       p.fecha_ingreso, p.fecha_egreso,
       ci.cuadrilla_id, cu.nombre as cuadrilla,
       a.obra_id as obra_actual_id, oc.nombre as obra_actual,
       a.rol as rol_en_obra, a.desde as asignada_desde,
       p.en_la_empresa
  from public.personas p
  left join public.cuadrilla_integrante ci on ci.persona_id = p.id and ci.hasta is null
  left join public.cuadrilla cu on cu.id = ci.cuadrilla_id
  left join lateral (
    select oa.obra_id, oa.rol, oa.desde
      from public.obra_asignacion oa
     where oa.persona_id = p.id and public.asignacion_vigente(oa.desde, oa.hasta)
     order by oa.desde desc nulls last, oa.creado_en desc
     limit 1) a on true
  left join public.obra_canonica oc on oc.id = a.obra_id
 -- LO ÚNICO QUE CAMBIA. `is not true` y no `= false`: un NULL en esa columna es una fila que nadie
 -- declaró como prueba, o sea una persona real, y tiene que seguir viéndose.
 where p.es_prueba is not true;

comment on view public.persona_directorio is
  'El plantel como lo lista la pantalla: sin PII (ni DNI, ni CUIL, ni teléfono, ni retribución) y sin lo que existe sólo para probar. Un concepto derivado — la cuadrilla y la obra salen de la pertenencia y la asignación VIGENTES, no se guardan en la persona.';

-- UNA VISTA RECREADA NACE SIN PERMISO Y RLS NO ES GRANT: sin esto PostgREST devuelve «permission
-- denied» y Next lo muestra como un 404 mudo.
grant select on public.persona_directorio to authenticated;

-- ── 2 · la fecha de egreso que el papel ya dice ────────────────────────────────────────────────
update public.personas
   set fecha_egreso = date '2026-08-12'
 where en_la_empresa is false
   and fecha_egreso is null
   and nombre_completo in (
     'CASTRO JUAN MARCELO', 'MORENO JULIO MIGUEL', 'QUIROZ FACUNDO MIGUEL',
     'CASTRO GALVAN GERSON ULISES', 'DIAZ RAMON ORLANDO', 'AVILA ALEJANDRO LUIS',
     'FLORES ALEJANDRO NAZARENO');

-- ── 3 · la categoría, en la grafía del catálogo ────────────────────────────────────────────────
update public.personas
   set categoria = lower(categoria)
 where categoria is not null
   and categoria <> lower(categoria)
   and lower(categoria) in ('oficial_especializado', 'oficial', 'medio_oficial', 'ayudante');
