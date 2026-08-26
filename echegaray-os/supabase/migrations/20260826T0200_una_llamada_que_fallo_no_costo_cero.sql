-- UNA LLAMADA QUE FALLÓ NO COSTÓ CERO: COSTÓ UN NÚMERO QUE NO CONOCEMOS.
--
-- `orq.chat_cost.usd` era `not null`, y eso rompía justo el caso que la migración anterior vino a
-- registrar. Cuando la API devuelve un error no manda `usage`, así que no hay con qué estimar el
-- costo: el insert llegaba con `usd = null`, violaba la restricción, y el `catch` de la telemetría
-- se lo comía en silencio. Resultado: **las llamadas fallidas no quedaban registradas en ninguna
-- parte**, que es exactamente lo contrario de lo que se quería — el registro se veía perfecto
-- justo cuando el proveedor estaba fallando.
--
-- Se detectó el 25/08/2026 probando la degradación contra la base real con un proveedor que
-- devuelve 402. La degradación funcionaba; el registro del fallo, no.
--
-- POR QUÉ NULL Y NO 0: un 0 afirma que la llamada no costó nada, y no es cierto — consumió los
-- tokens de entrada, sólo que el proveedor no dice cuántos. Es la regla de oro del OS: un cero es
-- una afirmación, un vacío es una ausencia. `lib/budget.mjs` ya suma con `coalesce(sum(usd), 0)` y
-- `sum()` ignora los nulls, así que el gasto del día no cambia.

alter table orq.chat_cost alter column usd drop not null;

comment on column orq.chat_cost.usd is
  'Costo estimado en USD. NULL = no se pudo estimar (la llamada falló y no vino `usage`, o el '
  'modelo no está en la tabla de precios). NUNCA se pone 0 para rellenar: 0 afirma que fue gratis.';
