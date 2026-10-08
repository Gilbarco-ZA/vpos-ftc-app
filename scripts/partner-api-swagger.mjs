// FTC-compatible sandbox Swagger document. Only implemented operations are listed.
const operations = [
  ['GET','/livez','Operations','Liveness'],
  ['GET','/readyz','Operations','Readiness'],
  ['GET','/healthz','Operations','Component health'],
  ['GET','/metrics','Operations','Prometheus metrics'],
  ['GET','/sandbox/coverage','Operations','Simulation coverage'],
  ['POST','/auth/login','Authentication','Sandbox login'],
  ['POST','/auth/logout','Authentication','Logout'],
  ['GET','/auth/session','Authentication','Session'],
  ['GET','/security/csrf','Authentication','CSRF status'],
  ['GET','/customers','Customers','List customers'],
  ['POST','/customers','Customers','Upsert customer'],
  ['GET','/customers/lookup','Customers','Customer by TIN'],
  ['GET','/customers/search','Customers','Legacy customer search'],
  ['GET','/customers/{id}','Customers','Customer details'],
  ['PATCH','/customers/{id}','Customers','Update customer'],
  ['DELETE','/customers/{id}','Customers','Soft-delete or restore customer'],
  ['GET','/transactions','Transactions','List transactions'],
  ['GET','/transactions/{id}','Transactions','Transaction details'],
  ['POST','/transactions/manual','Transactions','Create manual transaction'],
  ['POST','/transactions/allocate','Transactions','Allocate customer to transaction'],
  ['GET','/transactions/{id}/lines','Transactions','Editable transaction lines'],
  ['GET','/transactions/fuel-options','Forecourt','Fuel options'],
  ['GET','/transactions/pre-fuel-customer','Forecourt','Pending pre-fuel allocations'],
  ['POST','/transactions/pre-fuel-customer','Forecourt','Create or cancel pre-fuel allocation'],
  ['GET','/products','Products','List products'],
  ['POST','/products','Products','Create products'],
  ['GET','/product-categories','Products','List categories'],
  ['POST','/product-categories','Products','Create category'],
  ['GET','/product-categories/{categoryId}','Products','Get category'],
  ['PATCH','/product-categories/{categoryId}','Products','Update category'],
  ['DELETE','/product-categories/{categoryId}','Products','Deactivate category'],
  ['GET','/stock','Stock','Stock overview'],
  ['POST','/stock','Stock','Create stock movement'],
  ['GET','/reports','Reports','List reports'],
  ['GET','/reports/transactions.csv','Reports','Export transactions CSV'],
  ['GET','/receipts','Receipts','List receipts (requires list=1)'],
  ['GET','/settings','Settings','Console settings'],
  ['POST','/settings','Settings','Save console settings'],
  ['GET','/admin/settings','Settings','Station settings'],
  ['POST','/admin/settings','Settings','Update station settings'],
  ['GET','/settings/pumps','Settings','Pump settings'],
  ['GET','/settings/tanks','Settings','Tank settings'],
  ['PUT','/settings/tanks/atg-polling','Settings','ATG polling settings'],
  ['GET','/settings/pump-mode','Settings','Pump modes'],
  ['POST','/settings/pump-mode','Settings','Update pump modes'],
  ['GET','/config/yes-no','Dictionaries','Yes/no options'],
  ['GET','/config/user-roles','Dictionaries','Role options'],
  ['GET','/proxy-config','Proxy','Proxy configuration']
]
const requestBodies = {
 '/customers': {tin:'TIN100001',buyerName:'Example Ltd'},
 '/transactions/manual': {pumpNumber:1,lines:[{productId:'33000000-0000-4000-8000-000000000001',quantity:2,unitPrice:2775}]},
 '/transactions/allocate': {transactionId:'20000000-0000-4000-8000-000000000002',customerId:'10000000-0000-4000-8000-000000000001'},
 '/transactions/pre-fuel-customer': {pumpNumber:1,nozzleNumber:1,customerId:'10000000-0000-4000-8000-000000000001'},
 '/stock': {productRecordId:'33000000-0000-4000-8000-000000000001',movementType:'STOCK_IN',reason:'Delivery',quantity:100,effectiveAt:'2026-10-08T08:00:00Z'},
 '/auth/login': {username:'sandbox',password:'sandbox'}
}
export const swaggerDocument = {
 openapi:'3.0.3',
 info:{title:'VPOS FTC Sandbox API',version:'1.1.0-sandbox',description:'FTC-compatible /api simulator. Synthetic state only. Listed methods are implemented simulations, not proof of production parity. Other /api requests return 501 SANDBOX_NOT_IMPLEMENTED. The spec is deliberately limited to implemented methods.'},
 servers:[{url:'/api',description:'Current sandbox API'}],
 tags:[...new Set(operations.map(x=>x[2]))].map(name=>({name})),
 security:[{BearerSandbox:[]}],
 components:{
   securitySchemes:{BearerSandbox:{type:'http',scheme:'bearer',description:'Sandbox bearer token (default localhost only: sandbox-token). Production VPOS authentication differs.'}},
   schemas:{
     Success:{type:'object',required:['ok','success'],properties:{ok:{type:'boolean'},success:{type:'boolean'},data:{description:'Endpoint-specific JSON. Consult the full FTC wire contract manual.'}}},
     Error:{type:'object',properties:{ok:{type:'boolean'},success:{type:'boolean'},error:{type:'object',properties:{code:{type:'string'},message:{type:'string'}}}}}
   }
 },
 paths:{}
}
for (const [method,path,tag,summary] of operations) {
 const item=swaggerDocument.paths[path] ||= {}
 const op={tags:[tag],summary,description:'Simulated FTC-compatible endpoint. No real device, fiscal authority or database is contacted.',responses:{'200':{description:'Successful sandbox response',content:{'application/json':{schema:{$ref:'#/components/schemas/Success'}}}},'401':{description:'Sandbox authorization required',content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}}}}
 if(method==='POST'&&path==='/stock'){op.responses['201']=op.responses['200'];delete op.responses['200']}
 if(path==='/reports/transactions.csv'||path==='/metrics'){
   op.responses['200'].content={ [path==='/metrics'?'text/plain':'text/csv']:{schema:{type:'string'}} }
 }
 if(['/livez','/readyz','/healthz','/metrics','/security/csrf','/auth/login'].includes(path)) op.security=[]
 const params=[]
 for(const m of path.matchAll(/\{([^}]+)\}/g))params.push({name:m[1],in:'path',required:true,schema:{type:'string'}})
 if(path==='/receipts')params.push({name:'list',in:'query',schema:{type:'string',enum:['1']},description:'Set to 1 for receipt listing.'})
 if(path==='/customers'||path==='/transactions'){params.push({name:'page',in:'query',schema:{type:'integer',minimum:1}},{name:'pageSize',in:'query',schema:{type:'integer',minimum:1}})}
 if(path==='/customers/lookup')params.push({name:'tin',in:'query',required:true,schema:{type:'string'}})
 if(path==='/customers/search')params.push({name:'query',in:'query',schema:{type:'string'}})
 if(params.length)op.parameters=params
 if(['POST','PATCH','PUT','DELETE'].includes(method)){
   op.requestBody={required:method!=='DELETE',content:{'application/json':{schema:{type:'object',additionalProperties:true,example:requestBodies[path]||{}}}}}
 }
 item[method.toLowerCase()]=op
}
export const swaggerHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VPOS FTC Sandbox Swagger</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=function(){SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',deepLinking:true,persistAuthorization:false,displayRequestDuration:true})}</script></body></html>`
