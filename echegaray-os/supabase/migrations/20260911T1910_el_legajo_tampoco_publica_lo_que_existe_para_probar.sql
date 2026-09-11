-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL LEGAJO TAMPOCO PUBLICA LO QUE EXISTE PARA PROBAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HALLAZGO (QA visual en producción, 11/09/2026) ═══
--
-- «[PRUEBA E2E] QA Campo» —la identidad de nivel campo de `tests/util/identidades.ts`— aparecía en
-- las solapas Convenios y Recibos de Liquidación como una persona más: «18 sin piso» en vez de 17,
-- y un renglón de recibo pendiente a nombre de una cuenta de Playwright.
--
-- ═══ POR QUÉ SE COLABA, SI ESTO YA SE ARREGLÓ EL 07/09 ═══
--
-- `20260907T1600` cerró la puerta correcta para las pantallas que existían: marcó las filas de prueba
-- con `es_prueba = true` y agregó `where p.es_prueba is not true` a **`persona_directorio`**. Plantel,
-- Asistencia, Horas y Pagos leen esa vista y desde entonces no la muestran.
--
-- Convenios y Recibos NO leen `persona_directorio`: leen **`persona_legajo`**, que se creó el
-- 19/08/2026 para otra cosa —ser el único camino de la web a `dni`/`cuil`— y nunca miró la columna.
-- Son dos vistas sobre la misma tabla con dos criterios distintos de quién es una persona, y la que
-- se cree es la que abrió cada pantalla.
--
-- Y hay una segunda razón por la que la marca sola no alcanza: el fixture de E2E CREA esa fila otra
-- vez en cada corrida, con `es_prueba` en su valor por defecto. Un `update` de una sola vez limpia lo
-- de hoy y no lo de mañana. Por eso el criterio va también en la VISTA —que se aplica a lo que entre
-- después— y además en el código (`src/features/administracion/services/identidadDePrueba.ts`), que
-- es la red que funciona mientras esta migración no esté aplicada.
--
-- ═══ LO QUE ESTO NO HACE ═══
--
-- NO da de baja a nadie, no borra una fila y no toca `en_la_empresa`. Los E2E necesitan esa identidad
-- viva: lo único que cambia es que el producto no la publica. Es la misma decisión del 07/09, escrita
-- en la vista que se había quedado afuera.
--
-- ═══ ANTES DE APLICARLA — Y HAY QUE VOLVER A CORRERLO ═══
--
-- Quién queda afuera de `persona_legajo` con el filtro nuevo:
--
--   select id, nombre_completo, email, es_prueba, en_la_empresa
--     from public.personas
--    where es_prueba is true
--       or nombre_completo ilike '[PRUEBA%' or nombre_completo ~ '\mE2E\M'
--       or email ~* '^qa\.[a-z.]+@ecsas\.com\.ar$';
--
-- Si ahí aparece una persona REAL, esta migración NO se aplica: esconder a alguien de la liquidación
-- es peor que mostrar una cuenta de prueba, porque nadie nota a quien falta.

-- ── 1 · las que se crearon después del 07/09, marcadas ─────────────────────────────────────────
--
-- El mismo criterio de `20260907T1600` más el mail de QA, que es la marca que tiene la fila que se
-- colaba: su `nombre_completo` sí empieza con `[PRUEBA`, pero el fixture la recrea sin la marca.
update public.personas
   set es_prueba = true
 where es_prueba is not true
   and (nombre_completo ilike '%E2E%'
        or nombre_completo ilike '[PRUEBA%'
        or email ~* '^qa\.[a-z.]+@ecsas\.com\.ar$');

-- ── 2 · y la vista del legajo deja de publicarlas ──────────────────────────────────────────────
--
-- `security_invoker = false` y el `where public.es_administracion()` se conservan TAL CUAL estaban
-- (`20260819T3400`): esta migración agrega UNA condición y no toca el alcance. Cambiar el invoker acá
-- cerraría el único camino de la web al CUIL sin que nada lo diga.
create or replace view public.persona_legajo with (security_invoker = false) as
  select id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio,
         contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso,
         convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion, art,
         obra_social, drive_folder_id, notas,
         legajo, en_la_empresa
    from public.personas p
   where public.es_administracion()
     -- `is not true` y no `= false`: un NULL es una fila que nadie declaró como prueba, o sea una
     -- persona real, y tiene que seguir viéndose. Mismo criterio que `persona_directorio`.
     and p.es_prueba is not true;

comment on view public.persona_legajo is
  'EL legajo, para la ficha de Administración. Único camino a dni/cuil desde la web: el grant por columna se los niega a authenticated. NO publica retribucion_pactada. NO publica las identidades de prueba (es_prueba), igual que persona_directorio.';

grant select on public.persona_legajo to authenticated;

-- ── 3 · la evidencia del efecto, para pegarla al cierre ────────────────────────────────────────
--
--   select count(*) from public.persona_legajo;                       -- 17, no 18
--   select count(*) from public.persona_legajo where nombre_completo ilike '%E2E%';   -- 0
--   select count(*) from public.personas where es_prueba is true;      -- las de prueba, vivas
