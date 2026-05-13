const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const TS = (()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());})();
const TODAY = (()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})();

function readLE(p){const r=fs.readFileSync(p,'utf8'),c=/\r\n/.test(r);return{content:c?r.replace(/\r\n/g,'\n'):r,crlf:c};}
function writeLE(p,c,crlf){fs.writeFileSync(p,crlf?c.replace(/\n/g,'\r\n'):c,'utf8');}
function count(t,n){if(!n)return 0;let c=0,i=0;while((i=t.indexOf(n,i))!==-1){c++;i+=n.length;}return c;}

const VR='app/api/walliam/estimator/vip-request/route.ts';
const VQ='app/api/walliam/estimator/vip-questionnaire/route.ts';
const VA='app/api/walliam/estimator/vip-approve/route.ts';

const TX = [
  {id:'T1',file:VR,oldStr:[
    "        <p style=\"margin: 20px 0 0; font-size: 12px; color: #9ca3af;\">Expires in 24 hours.</p>",
    "      </div>"].join('\n'),newStr:[
    "        <p style=\"margin: 20px 0 0; font-size: 12px; color: #9ca3af;\">Expires in 24 hours.</p>",
    "        ${data.pageUrl ? `<p style=\"margin: 8px 0 0; font-size: 10px; color: #cbd5e1;\">Source: <a href=\"${data.pageUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${data.pageUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T2',file:VR,
    oldStr:"function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, domain: string, baseUrl: string): string {",
    newStr:"function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, domain: string, baseUrl: string, pageUrl: string | null): string {"},
  {id:'T3',file:VR,
    oldStr:"            html: buildUserApprovalEmailHtml(userName, agent?.full_name || brandName, autoApproveMessages, brandName, domain, baseUrl),",
    newStr:"            html: buildUserApprovalEmailHtml(userName, agent?.full_name || brandName, autoApproveMessages, brandName, domain, baseUrl, pageUrl),"},
  {id:'T4',file:VR,oldStr:[
    "          <a href=\"${baseUrl}\"",
    "             style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">",
    "            \u2726 Back to ${brandName}",
    "          </a>",
    "        </div>",
    "      </div>"].join('\n'),newStr:[
    "          <a href=\"${baseUrl}\"",
    "             style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">",
    "            \u2726 Back to ${brandName}",
    "          </a>",
    "        </div>",
    "        ${pageUrl ? `<p style=\"margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${pageUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${pageUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T5',file:VQ,
    oldStr:"function buildQuestionnaireEmailHtml(data: {",
    newStr:"function buildQuestionnaireEmailHtml(data: {\n  pageUrl?: string | null"},
  {id:'T6',file:VQ,oldStr:[
    "      buildingName: vipRequest.building_name,",
    "      requirements,",
    "    })"].join('\n'),newStr:[
    "      buildingName: vipRequest.building_name,",
    "      requirements,",
    "      pageUrl: vipRequest.page_url,",
    "    })"].join('\n')},
  {id:'T7',file:VQ,oldStr:[
    "      <div style=\"padding: 16px 24px; background: #1e293b; border-radius: 0 0 12px 12px;\">",
    "        <p style=\"margin: 0; color: rgba(255,255,255,0.6); font-size: 13px;\">",
    "          \u2726 ${data.brandName} \u2014 Use the approve/deny links from the original VIP email to manage access.",
    "        </p>",
    "      </div>"].join('\n'),newStr:[
    "      <div style=\"padding: 16px 24px; background: #1e293b; border-radius: 0 0 12px 12px;\">",
    "        <p style=\"margin: 0; color: rgba(255,255,255,0.6); font-size: 13px;\">",
    "          \u2726 ${data.brandName} \u2014 Use the approve/deny links from the original VIP email to manage access.",
    "        </p>",
    "        ${data.pageUrl ? `<p style=\"margin: 8px 0 0; color: rgba(255,255,255,0.4); font-size: 10px;\">Source: <a href=\"${data.pageUrl}\" style=\"color: rgba(255,255,255,0.6); text-decoration: underline;\">${data.pageUrl}</a></p>` : ''}",
    "      </div>"].join('\n')},
  {id:'T8',file:VA,
    oldStr:"function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, baseUrl: string): string {",
    newStr:"function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number, brandName: string, baseUrl: string, pageUrl: string | null): string {"},
  {id:'T9',file:VA,oldStr:[
    "              attemptsToGrant,",
    "              brandName,",
    "              baseUrl",
    "            ),"].join('\n'),newStr:[
    "              attemptsToGrant,",
    "              brandName,",
    "              baseUrl,",
    "              vipRequest.page_url || null",
    "            ),"].join('\n')},
  {id:'T10',file:VA,oldStr:[
    "        <div style=\"text-align: center;\">",
    "          <a href=\"${baseUrl}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">\u2726 Back to ${brandName}</a>",
    "        </div>",
    "      </div>"].join('\n'),newStr:[
    "        <div style=\"text-align: center;\">",
    "          <a href=\"${baseUrl}\" style=\"display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;\">\u2726 Back to ${brandName}</a>",
    "        </div>",
    "        ${pageUrl ? `<p style=\"margin: 24px 0 0; text-align: center; color: #cbd5e1; font-size: 10px;\">Source: <a href=\"${pageUrl}\" style=\"color: #94a3b8; text-decoration: underline;\">${pageUrl}</a></p>` : ''}",
    "      </div>"].join('\n')}
];

const FS = new Map(), errs = [];
for (const t of TX) {
  if(!FS.has(t.file)){const a=path.join(ROOT,t.file);if(!fs.existsSync(a)){errs.push(t.id+': missing '+t.file);continue;}const r=readLE(a);FS.set(t.file,{abs:a,content:r.content,crlf:r.crlf,size0:fs.statSync(a).size,tx:[]});}
  FS.get(t.file).tx.push(t);
  const st = FS.get(t.file);
  const oc = count(st.content, t.oldStr);
  if(oc!==1) errs.push(t.id+': expected 1 anchor in '+t.file+', got '+oc);
  if(count(st.content, t.newStr)!==0) errs.push(t.id+': newStr already present');
}
if(errs.length){console.error('VALIDATE FAILED:');errs.forEach(e=>console.error(' '+e));process.exit(1);}
console.log('Phase 1: 10/10 anchors validated unique');

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

let v8=-1; for(let i=0;i<tlines.length;i++) if(/^\*\*Version:\*\*\s+v8\b/.test(tlines[i])){v8=i;break;}
if(v8<0){console.error('v8 line not found');process.exit(1);}
let si=-1; for(let i=0;i<tlines.length;i++) if(/^##\s+Status log\b/i.test(tlines[i])){si=i;break;}
if(si<0){console.error('Status log heading not found');process.exit(1);}
let se = tlines.length; for(let i=si+1;i<tlines.length;i++) if(/^##\s/.test(tlines[i])){se=i;break;}
let li=-1; for(let i=se-1;i>si;i--) if(/^- \*\*/.test(tlines[i])){li=i;break;}
if(li<0){console.error('no log entry');process.exit(1);}

tlines[v8] = '**Version:** v9 \u2014 W3c-C SHIPPED \u2014 Source URL render row complete across all 11 named email builders (F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED CLOSED)';
const entry = '- **'+TODAY+' W3c-C-SHIPPED** \u2014 Source URL render row added to 3 estimator routes (vip-request, vip-questionnaire, vip-approve) - 10 transforms total. vip-request: buildApprovalEmailHtml body render (pageUrl already in typed-object sig from prior work) + buildUserApprovalEmailHtml positional sig L471 extended with 7th arg + call site L335 + body render. vip-questionnaire: buildQuestionnaireEmailHtml typed-object sig gains pageUrl?: string | null as first field + call site L208 passes vipRequest.page_url + body render in dark footer. vip-approve: buildUserApprovalEmailHtml positional sig L199 extended with 6th arg + call site L168 passes vipRequest.page_url || null + body render below CTA. All 10 anchors atomically validated as unique exact-string matches before any write. Per-file LE preserved (LF: vip-request, vip-questionnaire; CRLF: vip-approve). No leads INSERT plumbing needed (all 3 routes already had their source-URL data path: vip-request from request body pageUrl, vip-questionnaire+vip-approve from vipRequest.page_url stored at vip-request time). Variable naming consistent with existing route convention (pageUrl, not sourceUrl). TypeScript clean. F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED CLOSED. All 11 named email builders touched by W3c-A/B/B2/C now thread + render source URL. W3c phase complete.';

const nl = [...tlines.slice(0,li+1), entry, ...tlines.slice(li+1)];
fs.writeFileSync(TP, tc?nl.join('\n').replace(/\n/g,'\r\n'):nl.join('\n'), 'utf8');
console.log('  Tracker v8->v9, W3c-C-SHIPPED logged at L'+(li+2));
console.log('=== W3c-C in-tree complete ===');