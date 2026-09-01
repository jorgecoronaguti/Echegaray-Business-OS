-- ============================================================================
-- UNA LLAMADA AL RAZONADOR TIENE QUE DECIR POR QUÉ HIZO FALTA.
--
-- POR QUÉ. `orq.xsas_requests` ya contesta CUÁNTO necesita un modelo: medido sobre los 167 pedidos
-- del 27 y 28/08, 157 se resolvieron sin uno (94,0%). Lo que no contestaba es la pregunta que sigue
-- y es la que hace bajar el número: de esos 10, ¿cuáles necesitaban de verdad razonar y cuáles son
-- una tool que falta? Sin esa columna la única explicación era prosa suelta en `degradacion`, que
-- había en 1 de los 10.
--
-- EL CONJUNTO ES CERRADO A PROPÓSITO. `DEFAULT`, `FALLBACK` y `UNKNOWN` no son razones: son la
-- ausencia de una. Lo que no se puede explicar entra como `SIN_JUSTIFICAR`, que no es un estado
-- válido sino un HALLAZGO — es exactamente la fila que hay que ir a mirar. Un CHECK que aceptara
-- cualquier texto dejaría que el motivo se degrade a «porque sí» sin que nadie lo note.
--
-- NULL = no hubo escalación. Es el caso masivo y no se rellena con nada.
-- ============================================================================

alter table orq.xsas_requests
  add column if not exists reasoner_required_reason text;

alter table orq.xsas_requests
  drop constraint if exists xsas_requests_razon_razonador;

alter table orq.xsas_requests
  add constraint xsas_requests_razon_razonador check (
    reasoner_required_reason is null or reasoner_required_reason in (
      'AMBIGUOUS_INTENT',        -- el ruteo no reconoció qué se pidió
      'UNSTRUCTURED_REASONING',  -- se sabe el dominio; la respuesta es criterio en palabras
      'CONFLICT',                -- dos fuentes o dos criterios se contradicen
      'MISSING_RULE',            -- la skill aplica y NO hay tool ejecutable — candidato a código
      'NOVEL_PROBLEM',           -- no hay capacidad ni conocimiento que lo cubra
      'GENERATIVE_CONTENT',      -- hay que escribir algo, no calcularlo
      'SIN_JUSTIFICAR'           -- no pudo explicarse. Hallazgo, no estado válido
    )
  );

-- El índice que contesta «¿qué escalaciones son una tool que falta?» sin recorrer la tabla entera.
create index if not exists xsas_requests_razon
  on orq.xsas_requests (reasoner_required_reason, creado_en desc)
  where reasoner_required_reason is not null;

comment on column orq.xsas_requests.reasoner_required_reason is
  'Por qué este pedido necesitó el razonador. NULL = no escaló. MISSING_RULE y SIN_JUSTIFICAR son candidatos a convertirse en código.';
