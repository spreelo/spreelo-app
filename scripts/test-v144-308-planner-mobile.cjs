const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {transformSync} = require('next/dist/build/swc');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const root = path.resolve(__dirname, '..');
const scratch = process.env.SPREELO_TEST_OUTPUT || '/tmp/spreelo-test-308';
fs.mkdirSync(scratch, {recursive:true});
const source = fs.readFileSync(path.join(root,'app/automation/page.jsx'),'utf8');
function extract(name) {
  const start=source.indexOf(`function ${name}(`);
  assert(start>=0,name);
  const end=Math.min(...[source.indexOf('\nfunction ',start+1),source.indexOf('\nconst ',start+1)].filter(x=>x>=0));
  return source.slice(start,end<0?undefined:end);
}
const functions=['padNumber','getDatePartsFromDateString','getMonthStartDateString','getIntlLocaleFromUiLocale','getMonthLabel','moveMonth','buildCalendarDays','DatePickerField','ContentFormatArtwork','ContentFormatCard'].map(extract).join('\n');
const harness=`
const DEFAULT_TIME_ZONE='UTC';
const getDateInputValueInTimeZone=(d)=>d.toISOString().slice(0,10);
const formatStartDateLabel=(value)=>value;
const CalendarDays=()=>React.createElement('span',null,'▦');
const ChevronLeft=()=>React.createElement('span',null,'‹');
const ChevronRight=()=>React.createElement('span',null,'›');
const Info=()=>React.createElement('span',null,'ⓘ');
const ContentFormatIconVisual=()=>React.createElement('span',null,'◇');
function Harness(){
 const [expanded,setExpanded]=useState(false),[openPickerId,setOpenPickerId]=useState(null),[value,setValue]=useState('2026-10-04');
 return <main className="automation-page plan-v70-active"><section className="plan-v70-planned-card"><article id="row" className={'plan-v70-planned-row plan-v86-planned-row'+(expanded?' expanded':'')}>
 <div className="plan-v86-planned-visual"><span>◇</span><small className="plan-v14472-visual-credit"><strong>10</strong><span>Credits</span></small></div>
 <div className="plan-v70-planned-date"><strong>Sunday 4 Oct 2026</strong><span>Evening · exact time chosen by Spreelo</span></div>
 <div className="plan-v70-planned-post"><div><strong>Product post</strong><span>Show relevant products and services from your business.</span></div></div>
 <div className="plan-v70-planned-channel"><strong>Published to</strong><span>Facebook</span><div className="plan-v144177-copy-settings"><button>😊 Emojis</button><button># Hashtags</button></div></div>
 <button id="menu" className="plan-v70-row-menu" aria-expanded={expanded} onClick={()=>{if(expanded)setOpenPickerId(null);setExpanded(!expanded);}}>···</button>
 {expanded&&<div className="plan-v70-row-editor"><DatePickerField value={value} onChange={setValue} pickerId="row" openPickerId={openPickerId} setOpenPickerId={setOpenPickerId} timeZone="UTC" minDate="2026-10-04"/><button>Delete</button></div>}
 </article></section>
 <section id="weekly" style={{position:'relative',zIndex:999,height:180,background:'white'}}>Weekly publishing rhythm</section>
 <div id="examples" style={{display:'flex',gap:10,alignItems:'start'}}>{['product','ad'].map((name,index)=><div key={name} style={{width:180,flexShrink:0}}><ContentFormatCard item={{id:name==='product'?'website_item':'website_item_text_ad',label:name==='product'?'Product post':'Text + ad',image_url:'/content-format-examples/v308/'+name+'.png',description:'A very long old description.',shortDescription:'Portrait image and matching caption.'}} index={index} separatedPreview explanationLabel="About this post type"/></div>)}</div><div id="compact"><ContentFormatCard item={{label:"Product post",image_url:"/content-format-examples/v308/product.png",description:"Full original description."}}/></div></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const entry=path.join(scratch,'entry.js');
const code=transformSync(functions+harness,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}},target:'es2020'}}).code;
fs.writeFileSync(entry,`const React=require(${JSON.stringify(require.resolve('react'))});const {useRef,useState,useEffect}=React;const {createPortal}=require(${JSON.stringify(require.resolve('react-dom'))});const {createRoot}=require(${JSON.stringify(require.resolve('react-dom/client'))});\n${code}`);
(async()=>{
 await new Promise((resolve,reject)=>webpack({mode:'development',entry,output:{path:scratch,filename:'bundle.js'},devtool:false,resolve:{modules:[path.join(root,'node_modules')]}},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString())):resolve()));
 const css=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace(/@import\s+"\.\/([^";]+)";/g,(_,rel)=>fs.readFileSync(path.join(root,'app',rel),'utf8'));
 const puppeteer=require('puppeteer-core');const chromium=require('@sparticuz/chromium');
 const browser=await puppeteer.launch({args:chromium.args,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : await chromium.executablePath()),headless:true,pipe:true});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',request=>{
   const url=request.url();const match=url.match(/\/content-format-examples\/v308\/(product|ad)\.png$/);
   if(match)request.respond({contentType:'image/png',body:fs.readFileSync(path.join(root,'public/content-format-examples/v308',match[1]+'.png'))});else request.abort();
 });
 for(const viewport of [{width:375,height:667},{width:390,height:844},{width:667,height:375},{width:1280,height:900}]){
  await page.setViewport(viewport);
  await page.setContent('<!doctype html><html><head><base href="http://preview.local/"><style>'+css+'</style></head><body><div id="root"></div></body></html>');
  await page.addScriptTag({path:path.join(scratch,'bundle.js')});await page.waitForSelector('#menu');await page.waitForFunction(()=>[...document.querySelectorAll('.plan-v308-social-media img')].every(img=>img.complete&&img.naturalWidth>0));
  const measure=()=>page.$eval('#row',el=>el.getBoundingClientRect().height);
  const before=await measure();await page.click('#menu');await page.waitForSelector('.plan-v70-row-editor');const expanded=await measure();assert(expanded>before+40,'expands');
  await page.click('.custom-picker-button');await page.waitForSelector('.plan-v308-calendar-layer');
  assert.equal(await page.$$eval('.plan-v308-calendar-layer .custom-calendar-day',els=>els.length),42);
  await page.$eval('.custom-calendar-day:last-child',el=>el.scrollIntoView({block:'nearest'}));
  const visible=await page.$eval('.custom-calendar-day:last-child',el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;});assert(visible,'last calendar date remains visible above next section');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.plan-v308-calendar-layer'));
  await page.click('#menu');await page.waitForFunction(()=>!document.querySelector('.plan-v70-row-editor'));assert(Math.abs((await measure())-before)<1,'collapse restores original height');
  assert.equal(await page.$$eval('#compact .plan-v308-social-post',els=>els.length),0,'compact picker stays compact');
  assert.equal(await page.$eval('#compact small',el=>el.textContent),'Full original description.');
  const media=await page.$$eval('.plan-v308-social-media',els=>els.map(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,width:r.width,height:r.height};}));media.forEach(m=>assert(Math.abs(m.ratio-.8)<.001,JSON.stringify(m)));
  const info=await page.$$eval('.plan-v289-format-card > .plan-v72-format-card-copy',els=>els.map(el=>({height:el.getBoundingClientRect().height,text:el.textContent})));info.forEach(i=>{assert(i.height<100);assert(!i.text.includes('old description'));});
  console.log(JSON.stringify({viewport,before,expanded,collapsed:await measure(),media,info}));
  if(viewport.width===390)await page.screenshot({path:path.join(scratch,'mobile-308.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('v144.308 mobile planner: PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
