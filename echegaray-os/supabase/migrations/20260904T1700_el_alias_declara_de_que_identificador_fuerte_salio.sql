-- DE DÓNDE SALIÓ UN ALIAS: EL IDENTIFICADOR FUERTE QUE LO AUTORIZA.
--
-- Un alias verificado es la señal más poderosa del resolver: hace que «DUPEC» sea
-- «DUBOS UGARTE PEDRO LUIS RAUL» sin que ningún modelo tenga que adivinarlo. Justamente por eso no
-- puede existir un alias verificado del que no se sepa QUIÉN lo autorizó y CON QUÉ.
--
-- Hasta ahora `verificado_por` guardaba una persona. El sembrado desde el CUIT no tiene persona:
-- lo autoriza el identificador fiscal compartido por las dos fuentes. Esa distinción importa el día
-- que haya que deshacer una fusión — «lo confirmó Administración» y «los dos comprobantes traen el
-- mismo CUIT» se auditan distinto y se revierten distinto.
--
-- NULL significa «no salió de un identificador fuerte»: o lo escribió una persona, o vino de ARCA.

alter table public.ml_entidad_alias
  add column if not exists identificador_fuerte text;

comment on column public.ml_entidad_alias.identificador_fuerte is
  'El identificador que autoriza este alias (p. ej. el CUIT compartido por las dos fuentes). NULL = lo autorizó una persona, no un dato.';

create index if not exists ml_alias_identificador_idx
  on public.ml_entidad_alias (identificador_fuerte)
  where identificador_fuerte is not null;
