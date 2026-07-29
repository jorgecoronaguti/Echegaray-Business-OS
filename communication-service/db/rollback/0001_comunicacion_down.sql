-- Rollback de PR-3 Communication Layer. Aislado en su schema: cae entero sin
-- tocar nada más. Seguro porque ninguna tabla existente depende de `comunicacion`.
drop schema if exists comunicacion cascade;
