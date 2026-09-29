AERONAV RC11.81 — LUANDA 3D PROTOMAPS SCHEMA FIX

Correção estrutural do mapa Luanda 3D.

O LUANDA_3D.pmtiles é um extracto Protomaps Basemap v4 e usa estas source-layers:
- earth
- landcover
- landuse
- water
- boundaries
- buildings
- roads
- places
- pois

RC11.79/80 tratavam o extracto como Shortbread (streets, land, water_polygons, etc.), causando mapa escuro sem ruas/edifícios.

RC11.81:
- usa roads para todas as estradas;
- usa buildings com height/min_height para extrusão 3D;
- usa water para mar/rios;
- usa earth/landcover/landuse para solo;
- usa places/pois e nomes das roads para etiquetas;
- mantém LUANDA_TERRAIN_3D.pmtiles apenas como DEM de elevação;
- mantém VOO, Family, Mathia e Wendler intactos.

Não é necessário reinstalar os PMTiles já guardados no dispositivo.
