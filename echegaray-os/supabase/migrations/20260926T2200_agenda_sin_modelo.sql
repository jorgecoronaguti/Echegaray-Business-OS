-- AGENDA SIN MODELO (26/09/2026). Cada recurrencia nombra la herramienta propia que corre; el
-- worker la ejecuta directo, sin pasar por el motor interactivo (Claude). Una recurrencia sin
-- herramienta no se corre: no hay más «directiva en lenguaje natural» que la interprete un modelo.
alter table orq.schedules add column if not exists herramienta text;
alter table orq.schedules add column if not exists entrada jsonb not null default '{}'::jsonb;
comment on column orq.schedules.herramienta is 'nombre de la tool propia (lib/tools) que corre la recurrencia, sin modelo; null = no se corre';
