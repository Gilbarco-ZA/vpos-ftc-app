
import { randomUUID } from 'node:crypto'

const date = () => new Date().toISOString()
const snake = (row) => Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/[A-Z]/g, x=>'_'+x.toLowerCase()),value]))
const respond = (res,status,data,contentType='application/json; charset=utf-8') => {
  res.writeHead(status,{'content-type':contentType,'cache-control':'no-store','x-vpos-sandbox':'true'})
  res.end(typeof data === 'string' ? data : JSON.stringify(data))
}
const ok = data=>({ok:true,success:true,data})
const error = (res,status,message,code='BAD_REQUEST')=>respond(res,status,{ok:false,success:false,error:{code,message}})
const payload = async req => {
  let str=''
  for await(const part of req){str+=part;if(str.length>1048576)throw Error('Payload too large')}
  return str?JSON.parse(str):{}
}
const page = (items,params,defaultSize=20,max=200)=>{
  const n=x=>Number.isFinite(+x)&&+x>0?Math.floor(+x):null
  const p=n(params.get('page'))||1
  const sz=Math.min(max,n(params.get('pageSize'))||defaultSize)
  return {items:items.slice((p-1)*sz,p*sz),page:p,pageSize:sz,total:items.length,totalPages:Math.max(1,Math.ceil(items.length/sz))}
}
export const createCompatibilityApi = ({customers,transactions,fuelOptions,allocations,stationId,userId})=>{
  const categories=[{id:'41000000-0000-4000-8000-000000000001',stationId,code:'FUEL',name:'Fuel',description:'Forecourt fuels',icon:null,imagePath:null,sortOrder:1,isActive:true,productCount:2,createdAt:date(),updatedAt:date()}]
  const products=[
    {id:'33000000-0000-4000-8000-000000000001',productId:'PMS',productCode:'PMS',productName:'Premium Motor Spirit',unitPrice:2775,unitCost:2600,currency:'TZS',taxRate:18,productClassCode:'FUEL',productTypeCode:'FUEL',taxCode:'A',lastSyncStatus:'synced',lastSyncAt:date(),sku:null},
    {id:'33000000-0000-4000-8000-000000000002',productId:'AGO',productCode:'AGO',productName:'Automotive Gas Oil',unitPrice:2775,unitCost:2600,currency:'TZS',taxRate:18,productClassCode:'FUEL',productTypeCode:'FUEL',taxCode:'A',lastSyncStatus:'synced',lastSyncAt:date(),sku:null}
  ]
  const tankGroups=[{id:'51000000-0000-4000-8000-000000000001',code:'GROUP1',name:'Main tanks'}]
  const pumps=fuelOptions.map(f=>({id:f.pumpId,code:'P'+f.pumpNumber,name:'Pump '+f.pumpNumber,status:'ACTIVE',hasNozzleSelector:false,pumpNumber:f.pumpNumber,tankGroupId:tankGroups[0].id,tankGroupName:tankGroups[0].name}))
  const tanks=fuelOptions.map(f=>({id:f.tankId,code:'T'+f.pumpNumber,name:f.tankName,status:'ACTIVE',productId:f.productRowId,productExternalId:f.productCode,productName:f.gradeName,productCode:f.productCode,capacityLitres:40000,lowLevelLitres:5000,criticalLevelLitres:2000,tankGroupId:tankGroups[0].id,tankGroupName:tankGroups[0].name,domsTankId:String(f.pumpNumber),liveVolumeLitres:25000,liveTcVolumeLitres:25000,liveTemperatureC:25,liveVolumeUpdatedAt:date(),manualVolumeLitres:null,manualVolumeRecordedAt:null,manualVolumeRecordedBy:'',atgProductLevelMm:null,atgWaterLevelMm:null,atgWaterVolumeLitres:null,atgAvailableRoomLitres:null,atgGaugeOnline:null,atgInventoryDataReady:null,atgGaugeAlarmActive:null,atgGaugeErrorActive:null,atgControllerUpdatedAt:null,atgCapturedAt:null}))
  const receipts=transactions.filter(t=>t.receiptNumber).map(t=>({id:randomUUID(),transaction_id:t.id,station_id:stationId,receipt_number:t.receiptNumber,html_content:'<p>SANDBOX RECEIPT - NOT FISCAL</p>',plain_text_content:'SANDBOX RECEIPT - NOT FISCAL',fiscal_data:{sandbox:true},branding_snapshot:null,generated_at:date(),cloud_receipt_id:null,voided_at:null,voided_by:null,created_at:date(),updated_at:date(),render_version:1}))
  const reports=[{id:randomUUID(),station_id:stationId,report_type:'TRANSACTION_SUMMARY',status:'COMPLETED',payload:{sandbox:true},report_date_time:date(),created_at:date(),updated_at:date()}]
  const stock=[]
  const settings={station_id:stationId,linking_window_seconds:600,unallocated_handling:'anonymous',fiscalization_engine:'mock',fiscalization_transport:'proxy',auto_fiscalize_enabled:false,auto_print_receipts:false,print_receipt_order:'after_fiscalization',tin_capture_order:'before_transaction',sync_enabled:false,sync_time:null,sync_timezone:'Africa/Dar_es_Salaam',money_decimals:2,unit_price_decimals:2,volume_decimals:3,created_at:date(),updated_at:date()}
  let consoleSettings={}
  let atgPolling={enabled:false,intervalMinutes:10}
  let selectedPumps=[]
  const sessionUser={id:userId,stationId,username:'sandbox',email:'sandbox@example.test',role:'administrator',fullName:'Sandbox User',station:{id:stationId,code:'SANDBOX',name:'Sandbox Station',country:'TZ'}}
  const rawCustomer=c=>({...Object.fromEntries(Object.entries(snake(c)).filter(([k])=>!['last_station_id','last_seen_at'].includes(k))),station_id:stationId,last_station_id:stationId,last_seen_at:c.lastSeenAt,is_anonymous:false,cloud_customer_id:null,imported_from_cloud:false,imported_at:null,created_at:date(),updated_at:date(),deleted_at:null})
  const rawTransaction=t=>({...snake(t),station_id:stationId,customer_id:t.customerId,transaction_date_time:t.transactionDateTime,total_amount:t.totalAmount,volume:t.volume,receipt_number:t.receiptNumber,buyer_name:t.buyerName,tin:t.tin,status:t.status,created_at:date(),updated_at:date(),deleted_at:null})
  const run=async(req,res,url)=>{
    const path=url.pathname, method=req.method, query=url.searchParams
    if(method==='GET' && path==='/api/sandbox/coverage'){
      respond(res,200,ok({baseUrl:'/api',mode:'synthetic',fullySimulated:false,
        families:['health','auth','customers','transactions','pre-fuel-customer','fuel-options','products','product-categories','stock','reports','receipts-list','settings','pumps-read','tanks-read','pump-mode','proxy-config-read'],
        unsupportedStatus:501,unsupportedCode:'SANDBOX_NOT_IMPLEMENTED',
        warning:'This is a partial FTC wire simulator. Unsupported operations never forward to production.'}))
      return true
    }
    if(method==='GET' && path==='/api/livez'){respond(res,200,{ok:true,success:true,status:'running'});return true}
    if(method==='GET' && (path==='/api/readyz'||path==='/api/healthz')){
      const health={ok:true,components:{db:{ok:true},jpl:{configured:false,ok:true},ligo:{configured:false,ok:true},namos:{configured:false,ok:true},ppx:{configured:false,ok:true},proxyFiscalization:{configured:false,ok:true},archiveExporters:{configured:false,ok:true,destinations:[]},printer:{configured:false,ok:true},workers:{configured:true,ok:true,required:[],missing:[],stale:[],maxAgeMs:20000}}}
      respond(res,200,ok(path==='/api/healthz'?{health}:health));return true
    }
    if(method==='GET'&&path==='/api/metrics'){respond(res,200,'# HELP vpos_sandbox_up Sandbox is responding\n# TYPE vpos_sandbox_up gauge\nvpos_sandbox_up 1\n','text/plain; version=0.0.4; charset=utf-8');return true}
    if(method==='GET'&&path==='/api/security/csrf'){respond(res,200,{success:true,token:'csrf-disabled'});return true}
    if(method==='GET'&&path==='/api/auth/session'){respond(res,200,ok(sessionUser));return true}
    if(method==='POST'&&path==='/api/auth/logout'){respond(res,200,ok({success:true}));return true}
    if(method==='POST'&&path==='/api/auth/login'){const body=await payload(req);if(!body.username||!body.password)error(res,400,'Username and password are required');else if(body.username!=='sandbox'||body.password!==(process.env.VPOS_PARTNER_SANDBOX_PASSWORD||'sandbox'))error(res,401,'Invalid credentials','UNAUTHORIZED');else{res.setHeader('set-cookie','vpos-sandbox-session=1; Path=/; HttpOnly; SameSite=Lax');respond(res,200,ok({expiresAt:new Date(Date.now()+3600000).toISOString()}))}return true}
    if(method==='GET'&&path==='/api/customers/lookup'){const c=customers.find(x=>x.tin===query.get('tin'));respond(res,200,ok({customer:c||null}));return true}
    if(method==='GET'&&path==='/api/customers/search'){const q=String(query.get('query')||'').toLowerCase();respond(res,200,ok({local:customers.filter(x=>[x.tin,x.buyerName].some(v=>v.toLowerCase().includes(q))).map(rawCustomer),cloud:[]}));return true}
    if(path==='/api/customers'&&method==='GET'){const q=String(query.get('q')||'').toLowerCase();const data=page(customers.filter(x=>[x.tin,x.buyerName].some(v=>v.toLowerCase().includes(q))),query);respond(res,200,ok({rows:data.items,page:data.page,pageSize:data.pageSize,total:data.total}));return true}
    if(path==='/api/customers'&&method==='POST'){const b=await payload(req);if(!b.tin||!b.buyerName){error(res,400,'tin and buyerName are required');return true}const existing=customers.find(x=>x.tin===String(b.tin).toUpperCase());const c=existing||{id:randomUUID()};Object.assign(c,{...b,tin:String(b.tin).trim().toUpperCase(),buyerName:String(b.buyerName).trim(),lastStationId:stationId,lastSeenAt:date()});if(!existing)customers.push(c);respond(res,200,ok(c));return true}
    const cust=path.match(/^\/api\/customers\/([^/]+)$/)
    if(cust){const c=customers.find(x=>x.id===cust[1]);if(!c){error(res,404,'Customer not found','NOT_FOUND');return true}if(method==='GET'){respond(res,200,ok({...c,createdAt:date(),updatedAt:date(),deletedAt:null}));return true}if(method==='PATCH'){Object.assign(c,await payload(req));respond(res,200,ok(rawCustomer(c)));return true}if(method==='DELETE'){const b=await payload(req);c.deletedAt=b.restore?null:date();respond(res,200,ok({success:true,restored:!!b.restore}));return true}}
    if(path==='/api/transactions'&&method==='GET'){const status=query.get('status'),q=String(query.get('search')||query.get('q')||'').toLowerCase();const p=page(transactions.filter(t=>(!status||t.status===status.toUpperCase())&&(!q||[t.id,t.posReference,t.buyerName].some(v=>String(v||'').toLowerCase().includes(q)))).map(rawTransaction),query,50);respond(res,200,ok(p));return true}
    if(path==='/api/transactions/fuel-options'&&method==='GET'){respond(res,200,ok({options:fuelOptions}));return true}
    if(path==='/api/transactions/pre-fuel-customer'&&method==='GET'){respond(res,200,ok({captureOrder:settings.tin_capture_order,allocations:allocations.filter(x=>x.status==='PENDING').map(snake)}));return true}
    if(path==='/api/transactions/pre-fuel-customer'&&method==='POST'){const b=await payload(req);if(b.action==='cancel'){const a=allocations.find(x=>x.id===b.allocationId&&x.status==='PENDING');if(!a){error(res,404,'Pending pre-fuel allocation not found','NOT_FOUND');return true}a.status='CANCELLED';a.cancelledAt=date();respond(res,200,ok(snake(a)));return true}if(b.action==='authorize'){error(res,501,'Forecourt authorization simulation not implemented','SANDBOX_NOT_IMPLEMENTED');return true}const option=fuelOptions.find(x=>x.pumpNumber===Number(b.pumpNumber)&&x.nozzleNumber===Number(b.nozzleNumber));const c=customers.find(x=>x.id===b.customerId);if(!option||!c){error(res,400,'Customer or nozzle not available');return true}let a=allocations.find(x=>x.status==='PENDING'&&x.pumpNumber===option.pumpNumber&&x.nozzleNumber===option.nozzleNumber);if(!a){a={id:randomUUID(),stationId,pumpNumber:option.pumpNumber,nozzleId:option.nozzleId,nozzleNumber:option.nozzleNumber,displayNumber:option.displayNumber,customerId:c.id,allocatedBy:userId,status:'PENDING',transactionId:null,consumedAt:null,cancelledAt:null,createdAt:date(),updatedAt:date(),buyerName:c.buyerName,tin:c.tin};allocations.push(a)}else{a.customerId=c.id;a.buyerName=c.buyerName;a.tin=c.tin}respond(res,200,ok(snake(a)));return true}
    if(path==='/api/transactions/manual'&&method==='POST'){const b=await payload(req);if(!Array.isArray(b.lines)||!b.lines.length){error(res,400,'At least one transaction line is required');return true}const id=randomUUID();const total=b.lines.reduce((v,x)=>v+Number(x.quantity)*Number(x.unitPrice||0),0);transactions.push({id,customerId:null,pumpNumber:Number(b.pumpNumber||1),transactionDateTime:b.transactionDateTime||date(),totalAmount:total,volume:null,fuelType:null,posReference:b.posReference||null,status:'OPEN',receiptNumber:null,buyerName:null,tin:null});respond(res,200,ok({transactionId:id,totalAmount:total,lineCount:b.lines.length,stockMovementIds:[],fuelSelection:null}));return true}
    if(path==='/api/transactions/allocate'&&method==='POST'){const b=await payload(req);const t=transactions.find(x=>x.id===b.transactionId),c=customers.find(x=>x.id===b.customerId);if(!t||!c){error(res,404,'Transaction or customer not found','NOT_FOUND');return true}t.customerId=c.id;t.buyerName=c.buyerName;t.tin=c.tin;t.status='ALLOCATED';respond(res,200,ok(rawTransaction(t)));return true}
    const tx=path.match(/^\/api\/transactions\/([^/]+)$/)
    if(tx&&method==='GET'){const t=transactions.find(x=>x.id===tx[1]);respond(res,200,ok(t?{...rawTransaction(t),lines:[],transactionQueue:null}:null));return true}
    const lines=path.match(/^\/api\/transactions\/([^/]+)\/lines$/)
    if(lines&&method==='GET'){respond(res,200,ok({lines:[],editable:true,fuelItemsLocked:false,lockedProductIds:[],excludeFuelProductsFromCatalog:false,editabilityReason:null,editabilityCode:null,fuelSelection:null}));return true}
    if(path==='/api/products'&&method==='GET'){respond(res,200,ok(products.map(({id,productId,productCode,productName,sku,unitPrice,currency,lastSyncStatus,lastSyncAt})=>({id,productId,productCode,productName,sku,unitPrice,currency,lastSyncStatus,lastSyncAt}))));return true}
    if(path==='/api/products'&&method==='POST'){const b=await payload(req);const list=Array.isArray(b)?b:Array.isArray(b.products)?b.products:Array.isArray(b.data)?b.data:[b.data||b.products||b];if(list.some(x=>!x.productCode||!x.productName)){error(res,400,'Invalid product payload');return true}const added=list.map(p=>({...p,id:randomUUID(),stationId,productId:p.productId||p.productCode,lastSyncStatus:'pending',lastSyncAt:null,lastSyncMessage:'Saved locally, sync queued'}));products.push(...added);respond(res,200,ok({products:added,sync:{ok:false,message:'Saved locally, sync queued'}}));return true}
    if(path==='/api/product-categories'&&method==='GET'){respond(res,200,ok(categories.filter(c=>query.get('includeInactive')==='true'||c.isActive)));return true}
    if(path==='/api/product-categories'&&method==='POST'){const b=await payload(req);if(!b.name){error(res,400,'name is required');return true}const c={id:randomUUID(),stationId,code:b.code||b.name.toUpperCase().replace(/\s+/g,'_'),name:b.name,description:b.description||null,icon:b.icon||null,imagePath:null,sortOrder:Number(b.sortOrder)||0,isActive:b.isActive!==false,productCount:0,createdAt:date(),updatedAt:date()};categories.push(c);respond(res,200,ok(c));return true}
    const cat=path.match(/^\/api\/product-categories\/([^/]+)$/)
    if(cat){const c=categories.find(x=>x.id===cat[1]);if(!c){error(res,404,'Category not found','NOT_FOUND');return true}if(method==='GET'){respond(res,200,ok(c));return true}if(method==='PATCH'){Object.assign(c,await payload(req));respond(res,200,ok(c));return true}if(method==='DELETE'){c.isActive=false;respond(res,200,ok(c));return true}}
    if(path==='/api/stock'&&method==='GET'){respond(res,200,ok({products:products.map(p=>({id:p.id,productId:p.productId,productCode:p.productCode,productName:p.productName,sku:p.sku||null,categoryCode:'FUEL',categoryName:'Fuel',unitOfMeasure:'L',unitCost:p.unitCost||0,currency:p.currency,availableQuantity:10000,lastMovementAt:null,lastMovementType:null,lastProxyStatus:null,proxyPendingCount:0,proxyFailedCount:0})),recentMovements:stock}));return true}
    if(path==='/api/stock'&&method==='POST'){const b0=await payload(req);const b=b0.data||b0;const product=products.find(p=>p.id===b.productRecordId);if(!product||!['STOCK_IN','STOCK_OUT'].includes(b.movementType)||!(Number(b.quantity)>0)){error(res,400,'Invalid stock movement payload.');return true}const movement={id:randomUUID(),productRecordId:product.id,productId:product.productId,productCode:product.productCode,productName:product.productName,sku:product.sku||null,categoryCode:'FUEL',categoryName:'Fuel',unitOfMeasure:'L',movementType:b.movementType,reason:b.reason||'Other',quantity:Number(b.quantity),unitCost:Number(b.unitCost)||null,documentId:randomUUID(),documentReference:b.documentReference||null,remarks:b.remarks||null,supplierName:b.supplierName||null,supplierPin:b.supplierPin||null,supplierInvoiceNumber:b.supplierInvoiceNumber||null,effectiveAt:b.effectiveAt||date(),createdByUserId:userId,createdByName:'Sandbox User',sourceType:'MANUAL',sourceTransactionId:null,sourceAction:'CAPTURE',proxyStatus:'NOT_REQUIRED',proxyResponse:{sandbox:true},proxySentAt:null,proxyError:null,createdAt:date(),updatedAt:date()};stock.unshift(movement);respond(res,201,ok({movement,proxy:{success:true,sandbox:true}}));return true}
    if(path==='/api/reports'&&method==='GET'){respond(res,200,ok({rows:reports.slice(0,Math.min(500,Number(query.get('limit'))||200))}));return true}
    if(path==='/api/reports/transactions.csv'&&method==='GET'){respond(res,200,'id,pump_number,total_amount,status\n'+transactions.map(x=>[x.id,x.pumpNumber,x.totalAmount,x.status].join(',')).join('\n')+'\n','text/csv; charset=utf-8');return true}
    if(path==='/api/receipts'&&method==='GET'&&query.get('list')==='1'){respond(res,200,ok(receipts));return true}
    if(path==='/api/settings'&&method==='GET'){respond(res,200,consoleSettings);return true}
    if(path==='/api/settings'&&method==='POST'){const b=await payload(req);consoleSettings=b.settings||b;respond(res,200,{success:true});return true}
    if(path==='/api/admin/settings'&&method==='GET'){respond(res,200,ok(settings));return true}
    if(path==='/api/admin/settings'&&method==='POST'){const b=await payload(req);for(const [k,v] of Object.entries(b)){const key=k.replace(/[A-Z]/g,x=>'_'+x.toLowerCase());if(key in settings)settings[key]=v}settings.updated_at=date();respond(res,200,ok(settings));return true}
    if(path==='/api/settings/pumps'&&method==='GET'){respond(res,200,ok({pumps,tankGroups}));return true}
    if(path==='/api/settings/tanks'&&method==='GET'){respond(res,200,ok({tanks,products:products.map(p=>({id:p.id,name:p.productName,code:p.productCode})),tankGroups,atgPolling}));return true}
    if(path==='/api/settings/tanks/atg-polling'&&method==='PUT'){const b=await payload(req);atgPolling={enabled:b.enabled===true,intervalMinutes:Number(b.intervalMinutes)||10};respond(res,200,ok(atgPolling));return true}
    if(path==='/api/settings/pump-mode'&&method==='GET'){respond(res,200,ok({availablePumps:pumps.map(p=>p.pumpNumber),selectedPumps}));return true}
    if(path==='/api/settings/pump-mode'&&method==='POST'){const b=await payload(req);selectedPumps=(b.selectedPumps||b.skipAttendantAuthFpIds||[]).map(Number);respond(res,200,ok({availablePumps:pumps.map(p=>p.pumpNumber),selectedPumps}));return true}
    if(path==='/api/config/yes-no'&&method==='GET'){respond(res,200,ok([{value:'yes',label:'Yes'},{value:'no',label:'No'}]));return true}
    if(path==='/api/config/user-roles'&&method==='GET'){respond(res,200,ok(['tenant','manager','administrator','field_engineer'].map(v=>({value:v,label:v}))));return true}
    if(path==='/api/proxy-config'&&method==='GET'){respond(res,200,{});return true}
    // Explicitly reject unsupported operations; no generic 200 responses or hidden live forwarding.
    if(path.startsWith('/api/')){error(res,501,'This FTC API operation is not yet simulated; no production system was contacted.','SANDBOX_NOT_IMPLEMENTED');return true}
    return false
  }
  return {run}
}
