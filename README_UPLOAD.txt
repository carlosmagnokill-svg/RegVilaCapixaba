DASHBOARD EBD — versão GitHub Pages

ARQUIVOS PARA ENVIAR À RAIZ DO REPOSITÓRIO:
- index.html
- styles.css
- app.js
- .nojekyll

ARQUIVOS QUE JÁ DEVEM ESTAR NA RAIZ:
- BATISMO.csv
- FREQUENCIA_EBD.csv
- logo_ICM_BRANCO.png
- logo_ICM_VERMELHO.png

O dashboard lê os CSVs diretamente com:
fetch('./BATISMO.csv')
fetch('./FREQUENCIA_EBD.csv')

PUBLICAÇÃO:
Settings > Pages > Deploy from a branch > main > /(root)

ENDEREÇO ESPERADO:
https://carlosmagnokill-svg.github.io/RegVilaCapixaba/

IMPORTANTE:
- Não renomeie os arquivos sem atualizar app.js e index.html.
- A atualização dos CSVs refletirá no dashboard após o cache do navegador/GitHub Pages expirar.
- O Chart.js e o Papa Parse são carregados por CDN.


NOVO RECURSO:
- Botão "Baixar relatório" no cabeçalho.
- Gera PDF A4 horizontal com o dashboard completo no estado atual dos filtros.
- O botão não aparece dentro do PDF.
- Bibliotecas usadas via CDN: html2canvas e jsPDF.


CORREÇÃO DO BOTÃO PDF:
- Ação onclick explícita.
- Cache busting aplicado aos arquivos CSS e JS.
- Se html2canvas/jsPDF não carregarem, o botão abre automaticamente a impressão do navegador.
- Na impressão, escolha "Salvar como PDF" e orientação "Paisagem".
Versão: 1784556471


CORREÇÃO: detecção automática de qual CSV contém frequência e qual contém batismos. Versão 1784660960.
