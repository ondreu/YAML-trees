// Self-contained HTML export. Produces a single .html file with the data
// embedded as JSON (for the inline viewer) plus a pre-serialized YAML string
// (for the YAML download button). The viewer renders the same style of table,
// supports drilling into sub-databases, searching, and downloading CSV/XLSX/YAML
// in the browser. No external requests, no dependencies.

// The viewer script is kept free of backticks and ${...} so it can be embedded
// inside a template literal without escaping headaches.
const VIEWER_SCRIPT = [
	"(function(){",
	"var DATA=window.__YAMLDB_DATA__;var TITLE=window.__YAMLDB_TITLE__;",
	"var root=document.getElementById('app');",
	"var stack=[{label:TITLE,records:asRecords(DATA)}];",
	"function asRecords(v){return Array.isArray(v)&&v.every(function(x){return x&&typeof x==='object'&&!Array.isArray(x);})?v:null;}",
	"function columnsOf(recs){var cols=[];var seen={};recs.forEach(function(r){Object.keys(r).forEach(function(k){if(!seen[k]){seen[k]=1;cols.push(k);}});});return cols;}",
	"function cellText(v){if(v===null||v===undefined)return '';if(Array.isArray(v))return v.every(function(x){return x&&typeof x==='object';})?('['+v.length+' rows]'):v.map(cellText).join(', ');if(typeof v==='object')return JSON.stringify(v);return String(v);}",
	"function current(){return stack[stack.length-1];}",
	"function render(){root.innerHTML='';var lvl=current();var recs=lvl.records;",
	"var bar=el('div','ydb-bar');stack.forEach(function(s,i){if(i>0)bar.appendChild(txt(' / ','ydb-sep'));var a=el('span','ydb-crumb');a.textContent=s.label;a.onclick=function(){stack=stack.slice(0,i+1);render();};bar.appendChild(a);});root.appendChild(bar);",
	"var tools=el('div','ydb-tools');var q=el('input','ydb-search');q.placeholder='Search';q.oninput=function(){draw(q.value);};tools.appendChild(q);",
	"var bcsv=el('button','ydb-btn');bcsv.textContent='CSV';bcsv.onclick=function(){download(TITLE+'.csv','text/csv',csv(recs));};tools.appendChild(bcsv);",
	"var bx=el('button','ydb-btn');bx.textContent='XLSX';bx.onclick=function(){downloadBytes(TITLE+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xlsx(recs));};tools.appendChild(bx);",
	"var by=el('button','ydb-btn');by.textContent='YAML';by.onclick=function(){download(TITLE+'.yaml','text/yaml',window.__YAMLDB_YAML__||'');};tools.appendChild(by);",
	"root.appendChild(tools);",
	"var host=el('div','ydb-tablewrap');root.appendChild(host);",
	"function draw(filter){host.innerHTML='';if(!recs){host.appendChild(txt('This level is not a table.','ydb-empty'));return;}var cols=columnsOf(recs);var t=el('table','ydb-table');var thead=el('thead');var hr=el('tr');hr.appendChild(el('th','ydb-num'));cols.forEach(function(c){var th=el('th');th.textContent=c;hr.appendChild(th);});thead.appendChild(hr);t.appendChild(thead);var tb=el('tbody');recs.forEach(function(rec,ri){var hay=cols.map(function(c){return cellText(rec[c]);}).join(' ').toLowerCase();if(filter&&hay.indexOf(filter.toLowerCase())<0)return;var tr=el('tr');var num=el('td','ydb-num');num.textContent=String(ri+1);tr.appendChild(num);cols.forEach(function(c){var td=el('td');var v=rec[c];var sub=asRecords(v);if(sub){var b=el('button','ydb-drill');b.textContent='Open ('+sub.length+')';b.onclick=(function(rec2,c2,label){return function(){stack.push({label:label,records:asRecords(rec2[c2])});render();};})(rec,c,c+' of row '+(ri+1));td.appendChild(b);}else if(typeof v==='boolean'){td.textContent=v?'yes':'no';}else{td.textContent=cellText(v);}tr.appendChild(td);});tb.appendChild(tr);});t.appendChild(tb);host.appendChild(t);}",
	"draw('');}",
	"function el(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e;}",
	"function txt(s,cls){var e=el('span',cls);e.textContent=s;return e;}",
	"function csv(recs){var cols=columnsOf(recs||[]);function esc(s){s=s==null?'':(typeof s==='object'?JSON.stringify(s):String(s));return /[\",\\r\\n]/.test(s)?('\"'+s.replace(/\"/g,'\"\"')+'\"'):s;}var lines=[cols.map(esc).join(',')];(recs||[]).forEach(function(r){lines.push(cols.map(function(c){return esc(r[c]);}).join(','));});return lines.join('\\r\\n')+'\\r\\n';}",
	"function download(name,type,text){var b=new Blob([text],{type:type});save(name,b);}",
	"function downloadBytes(name,type,bytes){var b=new Blob([bytes],{type:type});save(name,b);}",
	"function save(name,blob){var u=URL.createObjectURL(blob);var a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},1000);}",
	// --- inline zip + xlsx ---
	"var CRC=(function(){var t=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();",
	"function crc32(b){var crc=0xffffffff;for(var i=0;i<b.length;i++)crc=CRC[(crc^b[i])&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}",
	"function u8(s){return new TextEncoder().encode(s);}",
	"function zip(entries){var chunks=[],central=[],offset=0;entries.forEach(function(e){var nb=u8(e.name);var crc=crc32(e.data);var size=e.data.length;var lo=new Uint8Array(30+nb.length);var lv=new DataView(lo.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,nb.length,true);lo.set(nb,30);chunks.push(lo,e.data);var cd=new Uint8Array(46+nb.length);var cv=new DataView(cd.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,nb.length,true);cv.setUint32(42,offset,true);cd.set(nb,46);central.push(cd);offset+=lo.length+e.data.length;});var cs=central.reduce(function(n,c){return n+c.length;},0);var end=new Uint8Array(22);var ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,cs,true);ev.setUint32(16,offset,true);var out=new Uint8Array(offset+cs+22);var p=0;chunks.forEach(function(c){out.set(c,p);p+=c.length;});central.forEach(function(c){out.set(c,p);p+=c.length;});out.set(end,p);return out;}",
	"function xesc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}",
	"function col(i){var n=i,s='';do{s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}",
	"function cx(ref,v){if(v===null||v===undefined||v==='')return '<c r=\"'+ref+'\"/>';if(typeof v==='number'&&isFinite(v))return '<c r=\"'+ref+'\"><v>'+v+'</v></c>';if(typeof v==='boolean')return '<c r=\"'+ref+'\" t=\"b\"><v>'+(v?1:0)+'</v></c>';var s=(typeof v==='object')?JSON.stringify(v):String(v);return '<c r=\"'+ref+'\" t=\"inlineStr\"><is><t xml:space=\"preserve\">'+xesc(s)+'</t></is></c>';}",
	"function xlsx(recs){recs=recs||[];var cols=columnsOf(recs);var rows=[];rows.push('<row r=\"1\">'+cols.map(function(c,i){return cx(col(i)+'1',c);}).join('')+'</row>');recs.forEach(function(r,ri){rows.push('<row r=\"'+(ri+2)+'\">'+cols.map(function(c,i){return cx(col(i)+(ri+2),r[c]);}).join('')+'</row>');});var sheet='<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>'+rows.join('')+'</sheetData></worksheet>';var parts=[{name:'[Content_Types].xml',data:u8('<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>')},{name:'_rels/.rels',data:u8('<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>')},{name:'xl/workbook.xml',data:u8('<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>')},{name:'xl/_rels/workbook.xml.rels',data:u8('<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>')},{name:'xl/worksheets/sheet1.xml',data:u8(sheet)}];return zip(parts);}",
	"render();",
	"})();",
].join("\n");

const VIEWER_CSS = [
	":root{--bg:#fff;--bg2:#f2f3f5;--border:#dcdfe4;--text:#202127;--muted:#6b7280;--accent:#6152e3;--hover:rgba(0,0,0,.045)}",
	"@media(prefers-color-scheme:dark){:root{--bg:#1e1e1e;--bg2:#262626;--border:#383838;--text:#dcddde;--muted:#999;--accent:#a89bf5;--hover:rgba(255,255,255,.05)}}",
	"*{box-sizing:border-box}body{margin:0;padding:20px;background:var(--bg);color:var(--text);font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px}",
	"h1{font-size:18px;margin:0 0 12px}",
	".ydb-bar{margin-bottom:10px;color:var(--muted)}.ydb-crumb{cursor:pointer;color:var(--accent)}.ydb-crumb:hover{text-decoration:underline}.ydb-sep{color:var(--muted)}",
	".ydb-tools{display:flex;gap:8px;margin-bottom:10px}.ydb-search{flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)}",
	".ydb-btn,.ydb-drill{padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);cursor:pointer}.ydb-btn:hover,.ydb-drill:hover{background:var(--hover)}",
	".ydb-tablewrap{overflow:auto;border:1px solid var(--border);border-radius:8px}",
	".ydb-table{border-collapse:collapse;width:100%}.ydb-table th,.ydb-table td{border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:6px 10px;text-align:left;white-space:nowrap}",
	".ydb-table thead th{position:sticky;top:0;background:var(--bg2);font-weight:600}",
	".ydb-num{width:3em;color:var(--muted);background:var(--bg2);text-align:center}",
	".ydb-empty{display:block;padding:24px;color:var(--muted);text-align:center}",
].join("\n");

/**
 * Build the full self-contained HTML document for a dataset.
 * `yamlText` is the pre-serialized YAML (frontmatter + body) offered by the
 * viewer's YAML download button; the viewer itself renders from `data` (JSON).
 */
export function exportHtml(data: unknown, title: string, yamlText: string): string {
	const json = JSON.stringify(data).replace(/</g, "\\u003c");
	const yaml = JSON.stringify(yamlText).replace(/</g, "\\u003c");
	const safeTitle = title
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8"/>',
		'<meta name="viewport" content="width=device-width, initial-scale=1"/>',
		"<title>" + safeTitle + "</title>",
		"<style>" + VIEWER_CSS + "</style>",
		"</head>",
		"<body>",
		"<h1>" + safeTitle + "</h1>",
		'<div id="app"></div>',
		"<script>window.__YAMLDB_DATA__=" +
			json +
			";window.__YAMLDB_TITLE__=" +
			JSON.stringify(title) +
			";window.__YAMLDB_YAML__=" +
			yaml +
			";</script>",
		"<script>" + VIEWER_SCRIPT + "</script>",
		"</body>",
		"</html>",
		"",
	].join("\n");
}
