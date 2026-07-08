-- Sección 11 del ciclo "operabilidad real": cobranzas y pagos dejan de ser solo
-- números en una pantalla -- una excepción material se convierte en trabajo
-- (backlog_autonomo) sin que nadie tenga que abrir Caja u Obligaciones primero.
-- Aplica materialidad ($500.000, mismo orden de magnitud que los gastos reales ya
-- cargados en este ciclo) para no generar ruido -- una cobranza o pago menor no
-- necesita una intervención autónoma.
create or replace function detectar_cobranza_vencida()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Cobranza vencida: ' || m.concepto,
    'Esperada el ' || m.fecha_esperada || ' ($' || m.monto || '), todavía sin cobrar.',
    'movimientos_caja (detección automática, pg_cron)',
    'observado',
    case when m.monto > 5000000 then 'alta' else 'media' end,
    'alta',
    'bajo',
    'Contactar al cliente y confirmar fecha real de cobro antes de que afecte el forecast de caja.',
    'C',
    'abierto',
    'movimientos_caja',
    m.id
  from movimientos_caja m
  where m.tipo = 'cobro'
    and m.estado = 'proyectado'
    and m.fecha_esperada < current_date
    and m.monto >= 500000
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'movimientos_caja' and b.origen_id = m.id and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_pago_critico()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Pago crítico: ' || r.concepto,
    'Vence el ' || r.fecha_vencimiento || ', saldo pendiente $' || r.saldo_pendiente || '.',
    'obligacion_resumen (detección automática, pg_cron)',
    'observado',
    case when r.fecha_vencimiento < current_date then 'alta' else 'media' end,
    case when r.fecha_vencimiento < current_date then 'alta' else 'media' end,
    'bajo',
    case
      when r.fecha_vencimiento < current_date
        then 'Pagar o renegociar ya -- esta obligación está vencida.'
      else 'Confirmar que la caja cubre este pago dentro de los próximos 7 días, o anticipar una cobranza.'
    end,
    'C',
    'abierto',
    'obligaciones',
    r.obligacion_id
  from obligacion_resumen r
  where r.saldo_pendiente >= 500000
    and r.fecha_vencimiento is not null
    and r.fecha_vencimiento <= current_date + 7
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'obligaciones' and b.origen_id = r.obligacion_id and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_senales_criticas_transversales()
returns void
language sql
set search_path = public
as $$
  select detectar_acciones_vencidas();
  select detectar_fuentes_criticas_atrasadas();
  select detectar_deterioro_margen_obra();
  select detectar_exceso_hh_obra();
  select detectar_cobranza_vencida();
  select detectar_pago_critico();
$$;
