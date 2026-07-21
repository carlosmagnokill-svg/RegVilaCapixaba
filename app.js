const $ = (id) => document.getElementById(id);
const ptNumber = new Intl.NumberFormat('pt-BR');
const pt1 = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1});
const pt2 = new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const MONTHS = ['Todos','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DATA_URLS = {
  arquivo1: './BATISMO.csv',
  arquivo2: './FREQUENCIA_EBD.csv'
};

let FREQ_DATA = [];
let BAPTISM_DATA = [];
let charts = {};

const normalize = s => String(s ?? '').trim().replace(/\s+/g,' ').toUpperCase();
const isoDate = s => new Date(`${s}T12:00:00`);
const fmtDate = d => new Intl.DateTimeFormat('pt-BR').format(d);
const totalPresence = r => Number(r.adult || 0) + Number(r.children || 0);
const weightedRate = rows => {
  const den = rows.reduce((s,r)=>s+Number(r.members||0),0);
  return den ? rows.reduce((s,r)=>s+totalPresence(r),0)/den*100 : 0;
};
const unique = a => [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'pt-BR'));

function parseNumber(value){
  if(value === null || value === undefined || value === '') return 0;
  if(typeof value === 'number') return value;
  let s = String(value).trim().replace('%','');
  if(s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s = s.replace(',','.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseBRDate(value){
  const s = String(value ?? '').trim();
  if(!s) return null;
  const parts = s.split(/[\/\-]/);
  if(parts.length !== 3) return null;
  if(parts[0].length === 4) return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
  return `${parts[2]}-${String(parts[1]).padStart(2,'0')}-${String(parts[0]).padStart(2,'0')}`;
}

async function loadCSV(url){
  const response = await fetch(url, {cache:'no-store'});
  if(!response.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}`);
  const text = await response.text();
  return Papa.parse(text, {header:true, skipEmptyLines:true, transformHeader:h=>String(h).trim()}).data;
}

function pick(row, candidates){
  const keys = Object.keys(row);
  for(const candidate of candidates){
    const found = keys.find(k => normalize(k) === normalize(candidate));
    if(found) return row[found];
  }
  return '';
}

function transformFrequency(rows){
  return rows.map(r => {
    const date = parseBRDate(pick(r,['Data','DATA']));
    return {
      date,
      area: String(pick(r,['Área','Area'])).trim(),
      polo: String(pick(r,['Pólo','Polo'])).trim(),
      church: String(pick(r,['Igreja'])).trim(),
      pastor: String(pick(r,['Pastor'])).trim(),
      members: parseNumber(pick(r,['Memb. Total','Memb Total','Membros Total'])),
      adult: parseNumber(pick(r,['Presença. Adulto','Presença Adulto','Presenca Adulto'])),
      children: parseNumber(pick(r,['Presença. CIAS','Presença CIAS','Presenca CIAS'])),
      freqSource: parseNumber(pick(r,['Frequência %','Frequencia %']))
    };
  }).filter(r => r.date && r.area && r.polo && r.church);
}

function transformBaptism(rows){
  return rows.map(r => ({
    area: String(pick(r,['Área','Area'])).trim(),
    polo: String(pick(r,['Pólo','Polo'])).trim(),
    church: String(pick(r,['Igreja'])).trim(),
    b2025: parseNumber(pick(r,['B.2025','B2025','Batismos 2025'])),
    b2026: parseNumber(pick(r,['B.2026','B2026','Batismos 2026'])),
    m2026: parseNumber(pick(r,['M.2026','M2026'])),
    v2026: parseNumber(pick(r,['V.2026','V2026'])),
    tg2026: parseNumber(pick(r,['TG.2026','TG2026']))
  })).filter(r => r.area || r.polo || r.church);
}

function showLoadError(error){
  console.error(error);
  const target = document.querySelector('.dashboard-shell');
  const alert = document.createElement('div');
  alert.style.cssText = 'margin:12px 0;padding:14px;border-radius:7px;background:#fff1f2;color:#991b1b;border:1px solid #fecdd3;font:600 12px Montserrat,Arial';
  alert.innerHTML = `Não foi possível carregar as bases CSV.<br><small>${error.message}</small>`;
  target.prepend(alert);
}

function fillSelect(el, options, selected, allLabel='Todos'){
  el.innerHTML = '';
  const all = document.createElement('option'); all.value='Todos'; all.textContent=allLabel; el.appendChild(all);
  options.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); });
  el.value = options.includes(selected) || selected === 'Todos' ? selected : 'Todos';
}

function bootstrapFilters(){
  const years = unique(FREQ_DATA.map(r=>String(isoDate(r.date).getFullYear())));
  fillSelect($('yearFilter'), years, years.at(-1) || 'Todos');
  $('monthFilter').innerHTML = MONTHS.map((m,i)=>`<option value="${i===0?'Todos':i}">${m}</option>`).join('');
  $('monthFilter').value='Todos';

  const preferredArea = unique(FREQ_DATA.map(r=>r.area)).find(a=>normalize(a).includes('PORTO DE SANTANA')) || 'Todos';
  fillSelect($('areaFilter'), unique(FREQ_DATA.map(r=>r.area)), preferredArea);
  refreshDependentFilters();

  ['yearFilter','monthFilter','areaFilter','poloFilter','churchFilter'].forEach(id=>{
    $(id).addEventListener('change', ()=>{
      if(id==='areaFilter' || id==='poloFilter') refreshDependentFilters(id);
      render();
    });
  });
}

function refreshDependentFilters(changed){
  const area = $('areaFilter').value || 'Todos';
  const currentPolo = $('poloFilter').value || 'Todos';
  const currentChurch = $('churchFilter').value || 'Todos';
  const baseArea = FREQ_DATA.filter(r=>area==='Todos' || r.area===area);
  fillSelect($('poloFilter'), unique(baseArea.map(r=>r.polo)), changed==='areaFilter'?'Todos':currentPolo);
  const polo = $('poloFilter').value;
  const basePolo = baseArea.filter(r=>polo==='Todos' || r.polo===polo);
  fillSelect($('churchFilter'), unique(basePolo.map(r=>r.church)), changed ? 'Todos' : currentChurch);
}

function selectedRows(){
  const year=$('yearFilter').value, month=$('monthFilter').value, area=$('areaFilter').value, polo=$('poloFilter').value, church=$('churchFilter').value;
  return FREQ_DATA.filter(r=>{
    const d=isoDate(r.date);
    return (year==='Todos'||String(d.getFullYear())===year) &&
      (month==='Todos'||d.getMonth()+1===Number(month)) &&
      (area==='Todos'||r.area===area) &&
      (polo==='Todos'||r.polo===polo) &&
      (church==='Todos'||r.church===church);
  });
}

function selectedBaptisms(){
  const area=$('areaFilter').value, polo=$('poloFilter').value, church=$('churchFilter').value;
  return BAPTISM_DATA.filter(r=>
    (area==='Todos'||normalize(r.area)===normalize(area)) &&
    (polo==='Todos'||normalize(r.polo)===normalize(polo)) &&
    (church==='Todos'||normalize(r.church)===normalize(church))
  );
}

function destroy(name){ if(charts[name]) charts[name].destroy(); }

function renderGauge(rate){
  destroy('gauge');
  charts.gauge = new Chart($('gaugeChart'),{
    type:'doughnut',
    data:{datasets:[{data:[Math.min(rate,100),Math.max(100-rate,0)],backgroundColor:['#9f0012','#eceeef'],borderWidth:0,circumference:180,rotation:270}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{enabled:false}},animation:{duration:450}}
  });
}

function commonScales(max=80){
  return {
    y:{beginAtZero:true,max,grid:{color:'#e7e9ed',borderDash:[2,3]},ticks:{font:{size:9},callback:v=>v+'%'}},
    x:{grid:{display:false},ticks:{font:{size:9},maxRotation:0,minRotation:0}}
  };
}

const labelPlugin = {
  id:'valueLabels',
  afterDatasetsDraw(chart){
    const {ctx}=chart; ctx.save(); ctx.fillStyle='#151515';ctx.textAlign='center';ctx.font='600 9px Montserrat';
    chart.getDatasetMeta(0).data.forEach((el,i)=>{
      const val=chart.data.datasets[0].data[i];
      if(val==null) return;
      ctx.fillText(pt2.format(val)+'%',el.x,el.y-7);
    }); ctx.restore();
  }
};

function renderMonthly(rows){
  const map = new Map();
  rows.forEach(r=>{
    const d=isoDate(r.date), key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(!map.has(key)) map.set(key,[]);
    map.get(key).push(r);
  });
  const entries=[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const labels=entries.map(([k])=>{const [y,m]=k.split('-');return `${MONTHS[Number(m)].slice(0,3).toLowerCase()}/${y.slice(-2)}`});
  const vals=entries.map(([,v])=>weightedRate(v));
  destroy('monthly');
  charts.monthly=new Chart($('monthlyChart'),{type:'bar',plugins:[labelPlugin],data:{labels,datasets:[{label:'% Participação',data:vals,backgroundColor:'#2869b5',barPercentage:.62,categoryPercentage:.75}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:15}},scales:commonScales(Math.max(80,Math.ceil((Math.max(...vals,0)+10)/10)*10)),plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,font:{size:9}}},tooltip:{callbacks:{label:c=>pt2.format(c.raw)+'%'}}}}});
}

function renderWeekly(rows){
  const map=new Map();
  rows.forEach(r=>{ if(!map.has(r.date))map.set(r.date,[]);map.get(r.date).push(r); });
  const entries=[...map.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
  const labels=entries.map(([k])=>fmtDate(isoDate(k)));
  const vals=entries.map(([,v])=>weightedRate(v));
  destroy('weekly');
  charts.weekly=new Chart($('weeklyChart'),{type:'bar',plugins:[labelPlugin],data:{labels,datasets:[{label:'% Participação',data:vals,backgroundColor:'#28913e',barPercentage:.62,categoryPercentage:.75}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:15}},scales:commonScales(Math.max(80,Math.ceil((Math.max(...vals,0)+10)/10)*10)),plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:9,font:{size:9}}},tooltip:{callbacks:{label:c=>pt2.format(c.raw)+'%'}}}}});
}

function renderLow(rows){
  const byChurch = new Map();

  rows.forEach(r=>{
    const key = [r.area, r.polo, r.church].join('|||');
    if(!byChurch.has(key)) byChurch.set(key, []);
    byChurch.get(key).push(r);
  });

  const allLow = [...byChurch.entries()]
    .map(([key, values])=>{
      const [area, polo, church] = key.split('|||');
      return { area, polo, church, rate: weightedRate(values) };
    })
    .filter(x=>x.rate < 50)
    .sort((a,b)=>a.rate-b.rate || a.church.localeCompare(b.church,'pt-BR'));

  const chartLow = allLow.slice(0,25);

  $('emptyState').hidden = chartLow.length > 0;
  $('lowChart').style.display = chartLow.length ? 'block' : 'none';

  destroy('low');

  if(chartLow.length){
    charts.low = new Chart($('lowChart'),{
      type:'bar',
      plugins:[labelPlugin],
      data:{
        labels:chartLow.map(x=>x.church),
        datasets:[{
          data:chartLow.map(x=>x.rate),
          backgroundColor:'#d90916',
          barPercentage:.54,
          categoryPercentage:.82
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        layout:{padding:{top:15}},
        scales:{
          y:{
            beginAtZero:true,
            max:60,
            grid:{color:'#e7e9ed',borderDash:[2,3]},
            ticks:{font:{size:8},callback:v=>v+'%'}
          },
          x:{
            grid:{display:false},
            ticks:{
              font:{size:8},
              maxRotation:45,
              minRotation:45,
              autoSkip:false,
              callback:function(v){
                const l=this.getLabelForValue(v);
                return l.length>18 ? l.slice(0,17)+'…' : l;
              }
            }
          }
        },
        plugins:{
          legend:{display:false},
          tooltip:{
            callbacks:{
              title:items=>chartLow[items[0].dataIndex].church,
              label:c=>[
                `Frequência: ${pt2.format(c.raw)}%`,
                `Área: ${chartLow[c.dataIndex].area}`,
                `Pólo: ${chartLow[c.dataIndex].polo}`
              ]
            }
          }
        }
      }
    });
  }

  renderLowFrequencyTable(allLow);
}

function renderLowFrequencyTable(rows){
  const tbody = $('lowFrequencyTableBody');
  const empty = $('emptyTableState');

  tbody.innerHTML = '';
  empty.hidden = rows.length > 0;

  rows.forEach(item=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.area}</td>
      <td>${item.polo}</td>
      <td>${item.church}</td>
      <td class="frequency-cell">${pt2.format(item.rate)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function render(){
  const rows=selectedRows(), b=selectedBaptisms();
  const rate=weightedRate(rows);
  const latestDate=rows.length?new Date(Math.max(...rows.map(r=>isoDate(r.date).getTime()))):null;
  const latestISO=latestDate?latestDate.toISOString().slice(0,10):null;
  const latestRows=latestISO?rows.filter(r=>r.date===latestISO):[];
  const members=latestRows.reduce((s,r)=>s+Number(r.members||0),0);
  const b25=b.reduce((s,r)=>s+Number(r.b2025||0),0), b26=b.reduce((s,r)=>s+Number(r.b2026||0),0);
  const growth=b25?((b26/b25)-1)*100:(b26?100:0);
  const elapsed=latestDate?Math.max(1,latestDate.getMonth()+1):1;
  const pace=b25?(((b26/elapsed)/(b25/12))-1)*100:(b26?100:0);

  $('overallFrequency').textContent=pt1.format(rate)+'%';
  $('kpiAreas').textContent=ptNumber.format(unique(rows.map(r=>r.area)).length);
  $('kpiChurches').textContent=ptNumber.format(unique(rows.map(r=>r.church)).length);
  $('kpiPoles').textContent=ptNumber.format(unique(rows.map(r=>r.polo)).length);
  $('kpiEbd').textContent=ptNumber.format(unique(rows.map(r=>r.date)).length);
  $('kpiMembers').textContent=ptNumber.format(members);
  $('kpiB25').textContent=ptNumber.format(b25);
  $('kpiB26').textContent=ptNumber.format(b26);
  $('kpiGrowth').textContent=pt2.format(growth)+'%';
  $('kpiPace').textContent=pt2.format(pace)+'%';
  const dateLabel=latestDate?fmtDate(latestDate):'--/--/----';
  $('kpiUpdate').textContent=dateLabel.length===10?`${dateLabel.slice(0,6)}${dateLabel.slice(-2)}`:dateLabel;
  $('headerUpdate').textContent=dateLabel;
  const area=$('areaFilter').value;
  $('footerArea').textContent=area==='Todos'?'TODAS':area.replace(' - ES','');
  $('lowTitle').textContent=`IGREJAS ${area==='Todos'?'':`DA ÁREA ${area.replace(' - ES','')} `}ABAIXO DE 50% DE FREQUÊNCIA`;

  renderGauge(rate);
  renderMonthly(rows);
  renderWeekly(rows);
  renderLow(rows);
}


window.exportDashboardPDF = async function exportDashboardPDF(){
  const button = $('downloadPdfBtn');
  if(!button) return;

  const originalLabel = button.innerHTML;
  try{
    button.disabled = true;
    button.innerHTML = '<span>⌛</span> Gerando PDF';

    if(typeof html2canvas === 'undefined' || !window.jspdf?.jsPDF){
      console.warn('Bibliotecas de PDF indisponíveis. Abrindo impressão do navegador como alternativa.');
      button.innerHTML = '<span>⌛</span> Abrindo impressão';
      setTimeout(() => window.print(), 100);
      return;
    }
    document.body.classList.add('pdf-exporting');

    // Aguarda a estabilização dos gráficos e das fontes antes da captura.
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 350));

    const captureTarget = document.body;
    const canvas = await html2canvas(captureTarget, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.scrollWidth, 1600),
      windowHeight: document.documentElement.scrollHeight,
      imageTimeout: 15000,
      logging: false
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 3;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = canvas.width / canvas.height;
    const pageRatio = maxWidth / maxHeight;

    let renderWidth, renderHeight;
    if(imageRatio > pageRatio){
      renderWidth = maxWidth;
      renderHeight = renderWidth / imageRatio;
    }else{
      renderHeight = maxHeight;
      renderWidth = renderHeight * imageRatio;
    }

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST');

    const area = $('areaFilter')?.value === 'Todos'
      ? 'Todas-as-Areas'
      : String($('areaFilter')?.value || 'Area').replace(/[^\wÀ-ÿ-]+/g,'-');
    const date = new Date().toISOString().slice(0,10);
    pdf.save(`Relatorio-EBD-${area}-${date}.pdf`);
  }catch(error){
    console.error(error);
    alert('Não foi possível gerar o PDF. Verifique o console do navegador.');
  }finally{
    document.body.classList.remove('pdf-exporting');
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}


function datasetHeaderScore(rows, expectedHeaders){
  if(!Array.isArray(rows) || !rows.length) return 0;
  const headers = Object.keys(rows[0]).map(normalize);
  return expectedHeaders.reduce((score, group)=>{
    return score + (group.some(candidate=>headers.includes(normalize(candidate))) ? 1 : 0);
  }, 0);
}

function detectDatasets(firstRows, secondRows){
  const frequencyHeaders = [
    ['Data'],
    ['Área','Area'],
    ['Pólo','Polo'],
    ['Igreja'],
    ['Memb. Total','Memb Total','Membros Total'],
    ['Presença. Adulto','Presença Adulto','Presenca Adulto'],
    ['Presença. CIAS','Presença CIAS','Presenca CIAS']
  ];

  const baptismHeaders = [
    ['Área','Area'],
    ['Pólo','Polo'],
    ['Igreja'],
    ['B.2025','B2025','Batismos 2025'],
    ['B.2026','B2026','Batismos 2026']
  ];

  const ff = datasetHeaderScore(firstRows, frequencyHeaders);
  const sf = datasetHeaderScore(secondRows, frequencyHeaders);
  const fb = datasetHeaderScore(firstRows, baptismHeaders);
  const sb = datasetHeaderScore(secondRows, baptismHeaders);

  return {
    frequencyRows: ff >= sf ? firstRows : secondRows,
    baptismRows: fb >= sb ? firstRows : secondRows,
    diagnostics:{ff,sf,fb,sb}
  };
}

async function init(){
  try{
    const [firstRows, secondRows] = await Promise.all([
      loadCSV(DATA_URLS.arquivo1),
      loadCSV(DATA_URLS.arquivo2)
    ]);

    const detected = detectDatasets(firstRows, secondRows);
    FREQ_DATA = transformFrequency(detected.frequencyRows);
    BAPTISM_DATA = transformBaptism(detected.baptismRows);

    console.info('Diagnóstico das bases:', detected.diagnostics);
    console.info('Linhas válidas de frequência:', FREQ_DATA.length);
    console.info('Linhas válidas de batismos:', BAPTISM_DATA.length);

    if(!FREQ_DATA.length){
      const h1 = firstRows.length ? Object.keys(firstRows[0]).join(' | ') : 'arquivo vazio';
      const h2 = secondRows.length ? Object.keys(secondRows[0]).join(' | ') : 'arquivo vazio';
      throw new Error(`Nenhuma linha válida de frequência foi encontrada. Cabeçalhos BATISMO.csv: ${h1}. Cabeçalhos FREQUENCIA_EBD.csv: ${h2}.`);
    }

    bootstrapFilters();
    render();
  }catch(error){
    showLoadError(error);
  }
}
document.addEventListener('DOMContentLoaded', init);
