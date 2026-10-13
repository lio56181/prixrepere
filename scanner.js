/* PrixRepère V1.4 · Analyse prudente d'étiquettes et prospectus.
   Les suggestions sont TOUJOURS validées par l'utilisateur. Aucun prix de marché inventé.
   Moteur de lecture pure JavaScript, sans accès réseau. */
(function(global){
'use strict';
const num=s=>Number(String(s).replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));
const tidy=s=>String(s||'').replace(/[\u00a0\u202f]/g,' ').replace(/[‐‑–—]/g,'-').trim();
const round=n=>Math.round(n*10000)/10000;
const normalizeUnit=u=>{u=String(u).toLowerCase();if(u==='kg'||u==='g'||u==='ml'||u==='cl'||u==='l')return u==='l'?'L':u;return 'u'};
const convert=(value,unit)=>{let u=normalizeUnit(unit);if(u==='g')return {quantity:round(value/1000),unit:'kg',display:`${value} g`};if(u==='ml')return {quantity:round(value/1000),unit:'L',display:`${value} ml`};if(u==='cl')return {quantity:round(value/100),unit:'L',display:`${value} cl`};return {quantity:round(value),unit:u,display:`${value} ${u}`}};
const hints=[
  ['sanytol',/sanytol|d[eé]sinfectant.{0,25}linge/i],['poulet',/poulet|filet\s+de\s+volaille/i],['steak',/steak|hach[eé]/i],
  ['jambon',/jambon/i],['lait',/lait\b/i],['beurre',/beurre/i],['oeufs',/oeufs|œufs|\boeuf(s)?\b/i],
  ['pates',/p[aâ]tes|spaghetti|penne|coquillettes/i],['riz',/\briz\b/i],['cafe',/caf[eé]/i],
  ['lessive',/lessive|d[eé]tergent\s+linge/i],['papier',/papier\s+toilette|rouleaux\s+wc/i]
];
function classify(text){for(const [id,re] of hints)if(re.test(text))return id;return null}
function getSizes(text){
 const out=[],seen=new Set(),add=(q,u,start,end,raw,kind)=>{let c=convert(q,u);if(!(q>0&&q<=10000&&c.quantity>0))return;const key=`${c.quantity}:${c.unit}`;if(seen.has(key))return;seen.add(key);out.push({...c,raw,kind,start,end})};
 const multi=/(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/gi;
 let m;const occupied=[];
 while((m=multi.exec(text))){const n=num(m[1]),q=num(m[2]);if(n>0&&n<=48){add(n*q,m[3],m.index,m.index+m[0].length,m[0],'lot');occupied.push([m.index,m.index+m[0].length])}}
 const single=/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/gi;
 while((m=single.exec(text))){if(occupied.some(([a,b])=>m.index>=a&&m.index<b))continue;
   const prefix=text.slice(Math.max(0,m.index-10),m.index).toLowerCase();
   if(/(?:€\s*\/|euros?\s*\/|prix\s+au\s*)$/.test(prefix))continue;
   add(num(m[1]),m[2],m.index,m.index+m[0].length,m[0],'simple')
 }
 return out;
}
function getPrices(text){
 const result=[],seen=new Set(),add=(raw,start,end)=>{const match=raw.match(/\d{1,5}(?:[ .]\d{3})*[,.]\d{2}|\d{1,4}\s*€\s*\d{2}/);if(!match)return;let val=match[0].includes('€')?num(match[0].replace('€',',')):num(match[0]);if(!Number.isFinite(val)||val<=0||val>5000)return;
   const left=text.slice(Math.max(0,start-45),start).split('\n').pop(),right=text.slice(end,Math.min(text.length,end+34)).split('\n')[0];
   const line=text.slice(text.lastIndexOf('\n',start-1)+1,text.indexOf('\n',end)<0?text.length:text.indexOf('\n',end));
   const unitPrice=/^[ \t]*(?:\/|par)[ \t]*(?:kg|kilo|l|litre|u|unit[eé])/i.test(right)||/prix\s*(?:au\s*)?(?:kg|kilo|litre)\s*:?\s*$/i.test(left.slice(-24));
   const wasPrice=/avant|ancien\s*prix|prix\s*barr[eé]|au\s*lieu\s*de/i.test(left.slice(-24)+line);
   const key=round(val)+'|'+start; if(seen.has(key)||result.some(p=>start<p.end&&end>p.start))return;seen.add(key);
   result.push({value:round(val),raw,start,end,line:tidy(line).slice(0,140),unitPrice,wasPrice});
 };
 let m;const pats=[/(?:\d{1,5}(?:[ .]\d{3})*[,.]\d{2})[ \t]*(?:€|eur\b|euros?\b)/gi,/(?:€[ \t]*)(\d{1,5}[,.]\d{2})/gi,/(\d{1,4})[ \t]*€[ \t]*(\d{2})/gi];
 for(const re of pats)while((m=re.exec(text))){if(m[2])add(m[1]+','+m[2]+' €',m.index,m.index+m[0].length);else add(m[0],m.index,m.index+m[0].length)}
 // Certaines étiquettes affichent 10,29 sans symbole €, mais dans ce cas ne suggérer qu'après validation.
 if(!result.length){const lines=text.split('\n');let offset=0;for(const line of lines){if(/prix|promo|total|€|eur|payer|pay[eé]/i.test(line)){let rx=/\b\d{1,4}[,.]\d{2}\b/g;while((m=rx.exec(line)))add(m[0]+' €',offset+m.index,offset+m.index+m[0].length)}offset+=line.length+1}}
 return result.sort((a,b)=>a.start-b.start);
}
function getName(text){
 const lines=text.split('\n').map(s=>tidy(s)).filter(Boolean);
 const candidates=lines.map(l=>({l,score:(classify(l)?12:0)+(l.match(/[a-zéèàûœ]/gi)||[]).length/12-(l.match(/\d/g)||[]).length/5-(/€|prix\s*au\s*kg|code\s*barre|remise|total|fid[eé]lit[eé]/i.test(l)?13:0)})).filter(x=>/[a-zà-ÿ]{3,}/i.test(x.l)&&x.l.length>5).sort((a,b)=>b.score-a.score);
 const best=candidates[0];return best&&best.score>3?best.l.replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|cl|ml|l)\b/ig,'').replace(/\s{2,}/g,' ').trim().slice(0,120):'';
}
function analyze(raw){const text=tidy(raw).replace(/\r/g,'');const prices=getPrices(text),sizes=getSizes(text),name=getName(text),category=classify(name)||classify(text);
 const promo=/(?:2\s*\+\s*1|offert|gratuit|deuxi[eè]me|2[eè]me|\d+\s*%|carte\s*fid[eé]lit[eé]|rembours[eé]|cagnotte|lot|\d+\s*pour\s*\d)/i.test(text);
 const complex=/(?:2\s*\+\s*1|offert|gratuit|deuxi[eè]me|2[eè]me|carte\s*fid[eé]lit[eé]|rembours[eé]|cagnotte|\d+\s*%|\d+\s*pour\s*\d)/i.test(text);
 const usable=prices.filter(p=>!p.unitPrice&&!p.wasPrice);
 // On ne déduit pas le prix payé à partir d'un prix unitaire seul.
 const price=usable[0]||null;
 const bestSize=sizes.find(x=>x.kind==='lot')||sizes[0]||null;
 const code=text.match(/(?:^|\D)(\d{13}|\d{12}|\d{8})(?!\d)/)?.[1]||'';
 const warnings=[];
 if(!price)warnings.push(prices.length?'Seul un prix au kg/litre ou un ancien prix a été reconnu : saisis le prix total de la barquette.':'Aucun prix total certain : saisis-le manuellement.');
 if(!bestSize)warnings.push('Poids / volume non identifié : vérifie le conditionnement.');
 if(complex)warnings.push('Promotion conditionnelle : confirme la quantité et le montant total réellement payé.');
 if(prices.filter(p=>!p.unitPrice).length>1)warnings.push('Plusieurs tarifs détectés : vérifie le prix retenu.');
 return {text,name,category,prices,sizes,price,pack:bestSize,code,promo,complex,warnings,unitPriceHint:prices.find(p=>p.unitPrice)||null};
}
global.PriceScan={analyze,classify,getPrices,getSizes,convert};
})(typeof window==='undefined'?globalThis:window);
