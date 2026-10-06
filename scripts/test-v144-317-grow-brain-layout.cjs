// Local visual QA uses the actual page JSX and full production CSS, with isolated
// React state fixtures. No Supabase/OpenAI calls or auth changes are performed.
const fs=require('fs'),path=require('path'),vm=require('vm'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');const puppeteer=require('puppeteer-core');
const source=fs.readFileSync(path.join(root,'app/grow-brain/page.jsx'),'utf8');
const compile=s=>babel.transformSync(s,{presets:[require.resolve('next/dist/compiled/babel/preset-react')],plugins:[require.resolve('next/dist/compiled/babel/plugin-transform-modules-commonjs')],babelrc:false,configFile:false}).code;
(async()=>{
 const {getDefaultLabelByKey,interpolateUiText}=await import(path.join(root,'lib/i18n/defaultLabels.js'));
 const t=(key,values)=>interpolateUiText(getDefaultLabelByKey(key)||key,values);
 const now=new Date().toISOString();
 const fixtures={currentBrand:{id:'fixture',business_name:'Pressit.se',website_url:'https://pressit.se'},loading:false,websiteConnectionLoaded:true,
  connections:[{platform:'facebook',status:'connected',page_name:'Ghostland'}],performance:[{post_id:'fixture-post',platform:'facebook',published_at:now,captured_at:now,views:0,reach:0,impressions:0,likes:0,comments:0,shares:0,clicks:0}],
  collectionStates:[{platform:'facebook',status:'scope_missing',last_success_at:now}],postsById:{'fixture-post':{id:'fixture-post',idea:'Fira julen med stil',image_url:'/grow-brain/demo-top-1.webp'}},
  learningProfile:{learning_state:'collecting',source_event_count:2,profile_json:{content_types:{website_item_text_ad:{score:29,confidence:.4,observations:1},animated_website_item:{score:29,confidence:.4,observations:1}},content_formats:{single_image:{score:29,confidence:.4,observations:1},animated_video:{score:29,confidence:.4,observations:1}}}},
  performanceLearningState:{learning_state:'collecting',status:'collecting',last_analyzed_at:now},websiteConnection:{status:'setup_pending',provider:'shopify'}};
 const shell=({children})=>React.createElement('main',{className:'app-shell spreelo-shell'},React.createElement('aside',{className:'sidebar spreelo-sidebar'},React.createElement('div',{className:'brand spreelo-brand'},'spreelo'),React.createElement('div',{className:'current-brand-card'},'Pressit.se'),React.createElement('nav',null,...['Home','AI Content Creator','AI Theme Calendar','Brand profile','Social channels','Grow Brain','Plan and billing','Admin','Settings'].map(x=>React.createElement('div',{key:x,style:{padding:'12px 0',color:x==='Grow Brain'?'#ff7754':'#fff'}},x)))),React.createElement('section',{className:'content spreelo-content'},children));
 const mockedReact={...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useMemo:fn=>fn(),useRef:initial=>({current:initial}),useEffect:()=>{}};
 const module={exports:{}};const context=vm.createContext({React,module,exports:module.exports,__qaState:fixtures,console,URLSearchParams,require:id=>{
  if(id==='react')return mockedReact;if(id.includes('AppLayout'))return {__esModule:true,default:shell};if(id.includes('supabaseClient'))return {supabase:{}};if(id.includes('useUiText'))return {useUiText:()=>({t,locale:'en'})};return require(id);
 }});
 const injected=source.replace(/const \[(\w+), (\w+)\] = useState\(([^\n]*)\);/g,(_,name,set,initial)=>`const [${name}, ${set}] = useState(Object.hasOwn(__qaState, '${name}') ? __qaState.${name} : ${initial});`);
 vm.runInContext(compile(injected)+'\nmodule.exports.__demo=buildGrowBrainDemoData;',context);
 let markup='';const render=()=>{markup=renderToStaticMarkup(React.createElement(module.exports.default));};render();
 const server=http.createServer((req,res)=>{
  if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/globals.css"></head><body>'+markup+'</body></html>');return;}
  const url=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,url.startsWith('/app/')?'.'+url:'public'+url);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  const types={'.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const chromium=require('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:process.env.GROW_BRAIN_QA_CHROMIUM||await chromium.executablePath(),args:chromium.args,headless:true});
 const page=await browser.newPage();const out=process.env.GROW_BRAIN_QA_OUTPUT||path.join(root,'qa-grow-brain');fs.mkdirSync(out,{recursive:true});
 const measurements=[];
 try{
  for(const width of [1920,1440,1280,1024,834,768,390,320]){
   await page.setViewport({width,height:1050,deviceScaleFactor:1});await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle0'});
   const geometry=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const root=document.querySelector('.grow-v317-page');const overflow=[...root.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&getComputedStyle(e).position!=='fixed'&&(r.right>innerWidth+1||r.left< -1)}).slice(0,8).map(e=>e.className?.baseVal||e.className);
    return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,overflow,content:rect('.content'),hero:rect('.grow-v216-hero'),chart:rect('.grow-v215-trend-panel'),preference:rect('.grow-v215-learning-panel'),audience:rect('.grow-v227-performance-learning'),channels:rect('.grow-v215-channels-panel'),metricCount:root.querySelectorAll('.grow-v215-metric-card').length,channelCount:root.querySelectorAll('.grow-v215-channel-card').length,headingSize:getComputedStyle(root.querySelector('.grow-v317-title')).fontSize,learningColumns:getComputedStyle(root.querySelector('.grow-v317-learning-grid')).gridTemplateColumns};
   });
   assert.equal(geometry.metricCount,6);assert.equal(geometry.channelCount,6);assert(geometry.documentWidth<=width+1,`document overflow at${width}: ${JSON.stringify(geometry)}`);assert.equal(geometry.overflow.length,0,`content overflow at${width}: ${JSON.stringify(geometry.overflow)}`);
   assert(Math.abs(geometry.chart.x-geometry.hero.x)<1);assert(Math.abs(geometry.chart.width-geometry.hero.width)<1,'Chart and hero must share content width');assert(geometry.preference.y>geometry.chart.y+geometry.chart.height,'Both learning cards belong below chart');
   if(width>=1440){assert(Math.abs(geometry.preference.y-geometry.audience.y)<1,'Desktop learning cards side by side');assert(geometry.hero.x-geometry.content.x>=30,`Desktop left gutter retained: ${JSON.stringify(geometry)}`);assert(geometry.content.right-geometry.hero.right>=30,`Desktop right gutter retained: ${JSON.stringify(geometry)}`);}
   if(width<=390)assert(geometry.audience.y>geometry.preference.y,'Mobile learning cards stacked');
   measurements.push(geometry);
   if([1440,834,390].includes(width))await page.screenshot({path:path.join(out,`grow-brain-${width}.png`),fullPage:true});
  }
  // Exercise the mature data state and all existing website dialog views too.
  const demo=module.exports.__demo();Object.assign(fixtures,demo,{loading:false,demoMode:false,websiteConnectionLoaded:true});
  fixtures.performanceLearningState={learning_state:'established',status:'healthy',insight_count:2,eligible_post_count:12,last_analyzed_at:now};
  fixtures.performanceInsights=[{dimension_type:'content_type',dimension_key:'animated_website_item',platform:'facebook',signal:'positive',confidence:.8,performance_score:35,observation_count:12,relative_engagement:1.4},{dimension_type:'content_type',dimension_key:'website_item',platform:'instagram',signal:'negative',confidence:.8,performance_score:-22,observation_count:12,relative_engagement:.7}];
  for(const width of [1440,390,320]){
   render();await page.setViewport({width,height:1050});await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle0'});
   assert.equal(await page.$eval('.grow-v227-insight-groups',e=>e.children.length),2);
   assert.equal(await page.$eval('.grow-v215-top-list',e=>e.children.length),6);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,`Established learning overflow at${width}`);
   if(width===1440)await page.screenshot({path:path.join(out,'grow-brain-established.png'),fullPage:true});
  }
  for(const view of ['intro','discovering','recommendation','shopify_connected','prepared']){
   fixtures.websiteConnectOpen=true;fixtures.websiteConnectView=view;render();await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle0'});assert(await page.$('[role="dialog"]'),`Website dialog${view} preserved`);
  }
  fs.writeFileSync(path.join(out,'layout-measurements.json'),JSON.stringify(measurements,null,2));
  console.log('v144.317: actual JSX / full CSS passed at eight viewport widths; all six KPIs/channels, desktop margins, chart/learning positions, empty and mature states, top-post links and website dialogs retained.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
