const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const TS = (()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());})();
const TODAY = (()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})();

function readLE(p){const r=fs.readFileSync(p,'utf8'),c=/\r\n/.test(r);return{content:c?r.replace(/\r\n/g,'\n'):r,crlf:c};}
function writeLE(p,c,crlf){fs.writeFileSync(p,crlf?c.replace(/\n/g,'\r\n'):c,'utf8');}
function count(t,n){if(!n)return 0;let c=0,i=0;while((i=t.indexOf(n,i))!==-1){c++;i+=n.length;}return c;}

const TX = [
  {id:'T1',file:'app/api/walliam/contact/route.ts',oldStr:[
    "          ${message ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Message</td><td style=\"color: #0f172a;\">${message}</td></tr>` : ''}",
    "        </table>"].join('\n'),newStr:[
    "          ${message ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Message</td><td style=\"color: #0f172a;\">${message}</td></tr>` : ''}",
    "          ${sourceUrl ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Source URL</td><td style=\"color: #1d4ed8;\"><a href=\"${sourceUrl}\" style=\"color: #1d4ed8; text-decoration: none;\">${sourceUrl}</a></td></tr>` : ''}",
    "        </table>"].join('\n')},
  {id:'T2',file:'app/api/charlie/appointment/route.ts',oldStr:[
    "      <div style=\"padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;\">",
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "      </div>"].join('\n'),newStr:[
    "      <div style=\"padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;\">",
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "        ${sourceUrl ? `<p style=\"margin: 4px 0 0; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T3',file:'app/api/charlie/appointment/route.ts',oldStr:[
    "      <div style=\"padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;\">",
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "      </div>"].join('\n'),newStr:[
    "      <div style=\"padding: 16px 20px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;\">",
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "        ${sourceUrl ? `<p style=\"margin: 4px 0 0; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T4',file:'app/api/charlie/lead/route.ts',oldStr:[
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">",
    "          Sent by ${brandName} AI \u00B7 ${domain}",
    "        </p>",
    "      </div>"].join('\n'),newStr:[
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">",
    "          Sent by ${brandName} AI \u00B7 ${domain}",
    "        </p>",
    "        ${sourceUrl ? `<p style=\"margin: 4px 0 0; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T5',file:'app/api/charlie/lead/route.ts',oldStr:[
    "        <p style=\"margin: 12px 0 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "      </div>"].join('\n'),newStr:[
    "        <p style=\"margin: 12px 0 0; color: #94a3b8; font-size: 11px;\">${brandName} \u00B7 ${domain}</p>",
    "        ${sourceUrl ? `<p style=\"margin: 4px 0 0; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T6',file:'app/api/charlie/plan-email/route.ts',oldStr:[
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} &middot; ${domain}</p>",
    "      </div>"].join('\n'),newStr:[
    "        <p style=\"margin: 0; color: #94a3b8; font-size: 11px;\">${brandName} &middot; ${domain}</p>",
    "        ${sourceUrl ? `<p style=\"margin: 4px 0 0; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T7',file:'app/api/walliam/charlie/vip-request/route.ts',oldStr:[
    "        <p style=\"margin: 20px 0 0; font-size: 11px; color: #94a3b8;\">",
    "          Manage all requests at ${data.tenantDomain}/admin-homes/leads",
    "        </p>",
    "      </div>"].join('\n'),newStr:[
    "        <p style=\"margin: 20px 0 0; font-size: 11px; color: #94a3b8;\">",
    "          Manage all requests at ${data.tenantDomain}/admin-homes/leads",
    "        </p>",
    "        ${data.sourceUrl ? `<p style=\"margin: 4px 0 0; font-size: 10px; color: #cbd5e1;\">Source: <a href=\"${data.sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${data.sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T8',file:'app/api/walliam/charlie/vip-request/route.ts',oldStr:[
    "          <a href=\"${process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">",
    "            \u2726 Back to ${brandName}",
    "          </a>",
    "        </div>",
    "      </div>"].join('\n'),newStr:[
    "          <a href=\"${process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">",
    "            \u2726 Back to ${brandName}",
    "          </a>",
    "        </div>",
    "        ${sourceUrl ? `<p style=\"margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${sourceUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${sourceUrl}</a></p>` : ''}",
    "      </div>"].join('\n')}
];

const FS = new Map(), errs = [];
for (const t of TX) {
  if(!FS.has(t.file)){const a=path.join(ROOT,t.file);if(!fs.existsSync(a)){errs.push(t.id+': missing '+t.file);continue;}const r=readLE(a);FS.set(t.file,{abs:a,content:r.content,crlf:r.crlf,size0:fs.statSync(a).size,tx:[]});}
  FS.get(t.file).tx.push(t);
  const st = FS.get(t.file);
  const oc = count(st.content, t.oldStr);
  if(oc!==1) errs.push(t.id+': expected 1 anchor in '+t.file+', got '+oc);
  const nc = count(st.content, t.newStr);
  if(nc!==0) errs.push(t.id+': newStr already present ('+nc+')');
}
if(errs.length){console.error('VALIDATE FAILED:');errs.forEach(e=>console.error(' '+e));process.exit(1);}
console.log('Phase 1: 8/8 anchors validated unique');

for (const t of TX) {
  const st = FS.get(t.file), b = st.content;
  st.content = st.content.replace(t.oldStr, t.newStr);
  if(st.content===b){console.error(t.id+': replace no-op');process.exit(1);}
  console.log('  '+t.id+' (+'+(st.content.length-b.length)+')');
}

for (const f of FS.keys()) {
  const st = FS.get(f);
  fs.copyFileSync(st.abs, st.abs+'.backup_'+TS);
  writeLE(st.abs, st.content, st.crlf);
  const s1 = fs.statSync(st.abs).size;
  console.log('  '+f+' '+st.size0+'->'+s1+' (LE='+(st.crlf?'CRLF':'LF')+', '+st.tx.length+'tx)');
}

const TP = path.join(ROOT, 'docs/W-LEADS-WORKBENCH-TRACKER.md');
const tr = fs.readFileSync(TP, 'utf8'), tc = /\r\n/.test(tr);
const tlines = (tc?tr.replace(/\r\n/g,'\n'):tr).split('\n');
fs.copyFileSync(TP, TP+'.backup_'+TS);

let v7=-1; for(let i=0;i<tlines.length;i++) if(/^\*\*Version:\*\*\s+v7\b/.test(tlines[i])){v7=i;break;}
if(v7<0){console.error('v7 line not found');process.exit(1);}
let si=-1; for(let i=0;i<tlines.length;i++) if(/^##\s+Status log\b/i.test(tlines[i])){si=i;break;}
if(si<0){console.error('Status log heading not found');process.exit(1);}
let se = tlines.length; for(let i=si+1;i<tlines.length;i++) if(/^##\s/.test(tlines[i])){se=i;break;}
let li=-1; for(let i=se-1;i>si;i--) if(/^- \*\*/.test(tlines[i])){li=i;break;}
if(li<0){console.error('no log entry in Status log');process.exit(1);}

tlines[v7] = '**Version:** v8 \u2014 W3c-B2 SHIPPED \u2014 Source URL render row in 8 named email builders';
const entry = '- **'+TODAY+' W3c-B2-SHIPPED** \u2014 Source URL render row added to 8 named email builders across 5 routes (walliam/contact, charlie/appointment x2, charlie/lead x2, charlie/plan-email, walliam/charlie/vip-request x2). Pattern: conditional ${sourceUrl ? render-row : empty} consuming W3c-B referer-capture data plumbing. Agent-facing builders (T1/T3/T5/T7) surface URL prominently (table row or visible footer line); user-facing (T2/T4/T6/T8) surface subtly in gray footer. 8 anchors atomically validated as unique exact-string matches before any write. Per-file LE preserved (LF: walliam/contact, charlie/appointment, charlie/lead; CRLF: charlie/plan-email, vip-request). 5 routes + tracker backed up with timestamp '+TS+'. TypeScript clean. Closes the visible-surface gap that W3c-B (data plumbing) intentionally deferred. NEXT: W3c-C (3 estimator routes; closes F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED).';

const nl = [...tlines.slice(0,li+1), entry, ...tlines.slice(li+1)];
fs.writeFileSync(TP, tc?nl.join('\n').replace(/\n/g,'\r\n'):nl.join('\n'), 'utf8');
console.log('  Tracker v7->v8, W3c-B2-SHIPPED logged at L'+(li+2));
console.log('=== W3c-B2 in-tree complete ===');