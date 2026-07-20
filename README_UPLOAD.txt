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
