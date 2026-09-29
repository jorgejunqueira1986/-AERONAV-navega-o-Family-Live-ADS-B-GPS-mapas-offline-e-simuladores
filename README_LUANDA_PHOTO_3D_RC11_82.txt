AERONAV RC11.82 — LUANDA PHOTO 3D HYBRID

NOVO
- CARRO + Internet + dentro de Luanda: tenta LUANDA PHOTO 3D (Google Photorealistic 3D Tiles via CesiumJS).
- Sem Internet, sem chave, falha de API ou Photo 3D desativado: usa automaticamente LUANDA_3D.pmtiles + LUANDA_TERRAIN_3D.pmtiles.
- VOO permanece separado e não foi alterado.
- Rota ativa AERONAV, Toyota Yaris, POIs guardados e membros Family são desenhados por cima do Photo 3D.
- Créditos Google/fornecedores ficam visíveis.

CONFIGURAÇÃO
1. Google Cloud: ativar Billing e Map Tiles API.
2. Criar uma API key e restringi-la por HTTP referrer ao domínio da AERONAV e por API à Map Tiles API.
3. AERONAV > Mais > Mapas Offline/Centro Offline > Luanda Photo 3D ONLINE.
4. Colar chave > Guardar chave > Testar Luanda Photo 3D.

SEGURANÇA
A chave não fica gravada no código do GitHub; é guardada em localStorage no aparelho. Como qualquer chave usada no browser continua acessível ao cliente, a restrição no Google Cloud é obrigatória.

LIMITAÇÃO
AERONAV não armazena nem transforma os Google Photorealistic 3D Tiles em offline. O modo offline continua exclusivamente com os PMTiles próprios. A cobertura fotorealista em Luanda depende do serviço Google.
