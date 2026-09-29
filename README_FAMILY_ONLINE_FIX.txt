AERONAV — FAMILY ONLINE COUNTER FIX (RC11.85)

OBJETIVO
Corrigir o indicador da página inicial que mostrava, por exemplo, "FAMÍLIA 18 online".

CAUSA
O contador antigo fazia:
  (state.family.members || []).filter(m => m.sharing).length

A lista state.family.members contém também linhas técnicas usadas por:
- SOS
- Family Call
- bateria
- Journey/Timeline
- sincronização de rotas
- verificação de administrador
- regras de visibilidade

Essas linhas podiam ter sharing=true e eram contadas como se fossem pessoas.

CORREÇÃO
O contador agora:
1. usa familyUiMembers(), que elimina linhas técnicas e membros duplicados;
2. respeita a visibilidade Family;
3. exige sharing=true;
4. considera online apenas uma atualização direta do membro com menos de 120 segundos.
5. não considera ADS-B/posição alternativa como prova de que o telefone está online.

INSTALAÇÃO
Na RAIZ da aplicação principal, substituir SOMENTE:
- index.html

NÃO substituir:
- sw.js do STABLE RECOVERY / NO GOOGLE
- photo3d-proxy.js
- mathia/
- wendler/
- Family Viewer
- mapas PMTiles

Depois do commit/publicação:
1. Fechar completamente a AERONAV.
2. Abrir novamente.
3. Se ainda aparecer o valor antigo na primeira abertura, fechar e abrir uma segunda vez para o service worker atualizar o index.

VALIDAÇÃO REALIZADA
- O JavaScript inline do index.html foi extraído e validado com node --check: sem erros de sintaxe.
- O patch altera apenas o cálculo do indicador FAMÍLIA na página inicial.
