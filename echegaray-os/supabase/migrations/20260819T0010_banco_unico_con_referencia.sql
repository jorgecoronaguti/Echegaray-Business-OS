-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ÍNDICE ÚNICO DEL BANCO NO MIRABA LA REFERENCIA, Y PERDIÓ UN MOVIMIENTO REAL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ CÓMO APARECIÓ (18/08/2026) ═══
--
-- El extracto del día traía cinco movimientos. El importador cargó CUATRO y avisó *"1 los rechazó el
-- índice único: ya estaban"*. No estaban: eran dos pagos de servicios al IERIC del mismo día, por el
-- mismo importe ($13.191,19), con el mismo texto de concepto — y con REFERENCIAS DISTINTAS del banco
-- (44452522 y 71749054). Son dos operaciones, no una repetida.
--
--     banco_movimientos_unico (cuenta, fecha, concepto, importe, coalesce(saldo_despues, 0))
--
-- La quinta columna era lo único que podía distinguirlas, y en la sección "Movimientos del Día" del
-- extracto el saldo corrido VIENE VACÍO: los dos entraron con `saldo_despues = NULL`, el `coalesce`
-- los volvió 0 a los dos, y las cinco columnas quedaron idénticas.
--
-- El daño no es perder $13.191: es que la cadena de saldos deja de cerrar y a partir de ahí ningún
-- control del banco vale. Y el modo de falla es el peor: el importador informa ÉXITO.
--
-- ═══ LA CURA: LA CLAVE DEL BANCO ENTRA A LA CLAVE ═══
--
-- `orquestador/lib/banco-importar.mjs` ya deduplica por `(referencia, importe)` — la lección
-- "Referencia del banco = la clave", que se aprendió cuando el saldo corrido como clave dejó entrar
-- 68 duplicados. El índice de la base se había quedado con el criterio viejo, así que la aplicación y
-- la base decidían distinto sobre la misma fila. Dos criterios para la misma pregunta.
--
-- `coalesce(referencia, '')`: las filas sin referencia —capturas de pantalla, la semilla de 127
-- movimientos que se cargó desde el código— siguen dedupliándose por fecha + concepto + importe +
-- saldo, exactamente como hasta hoy. Un índice único sobre una columna que acepta NULL no restringe
-- nada (ya vivió sobre 206 NULLs sin quejarse una vez): por eso el coalesce y no la columna pelada.

drop index if exists public.banco_movimientos_unico;

create unique index banco_movimientos_unico
  on public.banco_movimientos (
    cuenta,
    fecha,
    concepto,
    importe,
    coalesce(saldo_despues, 0),
    coalesce(referencia, '')
  );

comment on index public.banco_movimientos_unico is
  'La referencia del banco es parte de la clave: dos movimientos del mismo día, mismo concepto y '
  'mismo importe son DOS operaciones si el banco les dio referencias distintas.';
