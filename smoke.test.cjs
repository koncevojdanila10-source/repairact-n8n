const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, 'RepairAct.json'), 'utf8'));
const params = name => workflow.nodes.find(n => n.name === name).parameters;
const owner = '900000001';
const input = new Function('$input', '$', params('Вход и ограничения').jsCode);
const format = new Function('$', '$input', params('Проверить и собрать акт').jsCode);
const ready = new Function('$', '$input', '$execution', params('Готовый акт').jsCode);
const runInput = message => input({first:()=>({json:{update_id:100,message:{message_id:1,chat:{id:Number(owner),type:'private'},...message}}})},()=>({first:()=>({json:{allowedChatIds:owner}})}))[0]?.json;
const fact = () => ({device:'стиральная машина',model:'Samsung',serial:'',client:'',technician:'Алексей',repairDate:'',fault:'неисправен барабан',currency:'KZT',testResult:'работает',recommendations:'',work:['Заменил барабан'],parts:[{name:'барабан',quantity:1,unitPrice:2300}],laborCost:5000,uncertainties:[],partsStatus:'listed'});
const runFormat = act => format(()=>({first:()=>({json:{chatId:owner,route:0,report:'Вымышленный тест',sourceUpdateId:100}})}),{first:()=>({json:{output:act}})})[0].json;
test('Public template is inactive, credential-free and deny-by-default',()=>{
assert.equal(workflow.active,false);
assert.equal(params('Настройки доступа').assignments.assignments.find(a=>a.name==='allowedChatIds').value,'');
assert.ok(workflow.nodes.every(n=>!n.credentials&&!n.webhookId));
const tables=workflow.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable');
assert.equal(tables.length,6);
assert.ok(tables.every(n=>n.parameters.dataTableId.value==='REPLACE_WITH_DRAFTS_TABLE_ID'));
assert.ok(!workflow.pinData&&!workflow.id&&!workflow.meta);
});
test('Help commands show an example without running report extraction',()=>{
for(const text of ['/start','/help','/example','/пример','/help@ExampleBot']){
const out=runInput({text});assert.equal(out.route,2);assert.match(out.reason,/Пример, что сказать голосом/);
}});
test('Text and voice routes remain correct',()=>{
assert.equal(runInput({text:'Мастер Алексей. Заменил барабан.'}).route,0);
assert.equal(runInput({voice:{file_id:'test',file_size:400}}).route,1);
assert.equal(runInput({audio:{file_id:'test',file_size:400}}).route,1);
assert.equal(runInput({voice:{file_id:'test',file_size:20*1024*1024}}).route,2);
assert.equal(runInput({chat:{id:123,type:'private'},voice:{file_id:'test'}}).route,2);
assert.equal(runInput({chat:{id:Number(owner),type:'group'},voice:{file_id:'test'}}).route,2);
});
test('Amounts are calculated and unknown fields are not fabricated',()=>{
const out=runFormat(fact());assert.equal(out.valid,true);assert.equal(out.partsTotal,2300);assert.equal(out.total,7300);assert.equal(out.act.client,'');
});
test('Missing name and ambiguous currency block document creation',()=>{
const noName=fact();noName.technician='';assert.equal(runFormat(noName).valid,false);
const noCurrency=fact();noCurrency.currency='';assert.equal(runFormat(noCurrency).valid,false);
});
test('Unknown amounts stay unknown, not zero',()=>{
const unknown=fact();unknown.currency='';unknown.parts[0].unitPrice=null;unknown.laborCost=null;unknown.uncertainties=['Уточните валюту цен'];
const out=runFormat(unknown);assert.equal(out.valid,true);assert.equal(out.total,null);assert.equal(out.partsTotal,null);
});
test('Native buttons contain callback_data and no website URL',()=>{
const markup=JSON.stringify(params('Мастер проверяет черновик').inlineKeyboard);
assert.match(markup,/callback_data/);assert.doesNotMatch(markup,/"url"|"web_app"/);
assert.deepEqual(params('Отчёт мастера').updates,['message','callback_query']);
});
test('Claim guard rejects duplicates, wrong owner and stale drafts',()=>{
const origin={chatId:owner,draftToken:'test_token',previewMessageId:'10',callbackAction:'approve'};
const row={id:1,chatId:owner,token:'test_token',telegramMessageId:'10',claimExecutionId:'test-exec',expiresAt:new Date(Date.now()+60000).toISOString(),payload:JSON.stringify({chatId:owner,number:'R-100',docText:'Вымышленный акт',preview:'Вымышленный черновик',valid:true})};
const run=rowData=>ready(()=>({first:()=>({json:origin})}),{first:()=>({json:rowData})},{id:'test-exec'})[0].json;
assert.equal(run(row).valid,true);
assert.equal(run({}).valid,false);
assert.equal(run({...row,chatId:'another-user'}).valid,false);
assert.equal(run({...row,claimExecutionId:'other-exec'}).valid,false);
assert.equal(run({...row,expiresAt:'2000-01-01T00:00:00Z'}).valid,false);
});
