// usage: node fix-titles.js tebiki-<id>.json  -> steps without a real title get the manual title (single step) or "Step n"
const fs=require('fs');const f=process.argv[2];const d=JSON.parse(fs.readFileSync(f,'utf8'));
d.steps.forEach((s,i)=>{ if(/^\d+\. Step \d+$/.test(s.title)) s.title = d.steps.length===1 ? d.title : `Step ${i+1}`; });
fs.writeFileSync(f,JSON.stringify(d,null,2));console.log(d.steps.map(s=>s.title));
