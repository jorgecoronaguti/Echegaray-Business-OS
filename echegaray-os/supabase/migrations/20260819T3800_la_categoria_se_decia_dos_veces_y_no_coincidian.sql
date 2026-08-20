-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CATEGORÍA SE DECÍA DOS VECES Y LAS DOS NO COINCIDÍAN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- En el listado, «GONZALEZ TOBARES JUAN GUILLERMO» decía OFICIAL debajo del nombre y Ayudante en la
-- columna CATEGORÍA. Igual RETA (Oficial/Ayudante), PASTRAN y QUIROGA SEBASTIAN (Oficial
-- especializado/Oficial). No era una repetición fea: eran DOS RESPUESTAS DISTINTAS AL MISMO HECHO.
--
-- ═══ POR QUÉ PASÓ ═══
--
-- El CARGO de la nómina —AYUDANTE, MEDIO OFICIAL, OFICIAL, OFICIAL ESPECIALIZADO— NO es un puesto:
-- ES la categoría de la escala de UOCRA. Se cargó en `puesto` como si fuera otra cosa, y después la
-- libreta del IERIC llenó `categoria` con la categoría DEL INGRESO. Quien ascendió desde que entró
-- —que es lo normal— quedó con las dos versiones puestas, la vieja y la nueva, sin nada que dijera
-- cuál manda.
--
-- ═══ CUÁL MANDA ═══
--
-- La NÓMINA VIGENTE: es con lo que se liquida hoy. La libreta dice con qué categoría se lo dio de
-- alta, que para quien sigue trabajando es historia — y para los 45 que ya no están es lo único que
-- hay, y ahí sí queda.
--
-- `puesto` se queda SÓLO cuando dice algo que la categoría no dice. «JEFE DE OBRA» no está en la
-- escala del convenio y es un puesto de verdad; «OFICIAL» al lado de categoría Oficial es ruido.
--
-- Y `especialidad` venía con la categoría pegada adelante en algunas libretas —«AYUDANTE / ALBAÑIL»,
-- «OFICIAL / SOLDADOR»—: se le saca, porque el oficio es lo que hace distinta a esa columna.

begin;

-- 1 · El CARGO de la nómina es la categoría, salvo que no esté en la escala del convenio.
update public.personas set categoria = case upper(trim(puesto))
    when 'OFICIAL ESPECIALIZADO' then 'oficial_especializado'
    when 'MEDIO OFICIAL'         then 'medio_oficial'
    when 'OFICIAL'               then 'oficial'
    when 'AYUDANTE'              then 'ayudante'
  end
 where en_la_empresa
   and upper(trim(coalesce(puesto, ''))) in
       ('OFICIAL ESPECIALIZADO', 'MEDIO OFICIAL', 'OFICIAL', 'AYUDANTE');

-- 2 · El puesto que sólo repite la categoría no aporta nada y contradecía.
update public.personas set puesto = null
 where upper(trim(coalesce(puesto, ''))) in
       ('OFICIAL ESPECIALIZADO', 'MEDIO OFICIAL', 'OFICIAL', 'AYUDANTE');

-- 3 · Los tres códigos de un import viejo que nunca fueron una categoría.
update public.personas set categoria = null where categoria in ('004212', '6E60', '1591');

-- 4 · El oficio, sin la categoría pegada adelante.
update public.personas
   set especialidad = nullif(trim(regexp_replace(especialidad,
       '^(AYUDANTE|MEDIO OFICIAL|OFICIAL ESPECIALIZADO|OFICIAL)\s*/\s*', '', 'i')), '')
 where especialidad ~* '^(AYUDANTE|MEDIO OFICIAL|OFICIAL ESPECIALIZADO|OFICIAL)\s*/';

commit;
