import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import sharp from 'sharp';
import {getDefaultNamespaceLabels,interpolateUiText} from '../lib/i18n/defaultLabels.js';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const route=fs.readFileSync(path.join(root,'app/api/approve-post/route.js'),'utf8');
const extract=(start,end)=>{const a=route.indexOf(start),b=route.indexOf(end,a);assert(a>=0&&b>a);return route.slice(a,b);};
const labels=getDefaultNamespaceLabels('approvePages');
const t=(key,values={})=>interpolateUiText(labels[key]||key,values);
const ctx=vm.createContext({APP_URL:'https://offline.invalid'});
vm.runInContext(extract('function getApprovalExperienceCss(', 'async function getTikTokApprovalContext(')+'\n'+extract('function createGeneralApprovalPreviewHtml(', 'function createTikTokApprovalHtml('),ctx);
const poster='data:image/png;base64,'+(await sharp({create:{width:90,height:160,channels:3,background:'#7ba28d'}}).png().toBuffer()).toString('base64');
function cssFile(filename){return fs.readFileSync(filename,'utf8').replace(/@import\s+["']([^"']+)["'];/g,(_,relative)=>cssFile(path.resolve(path.dirname(filename),relative)));}
const adminCss=cssFile(path.join(root,'app/globals.css'));
const browser=await puppeteer.launch({args:chromium.args,executablePath:process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),headless:true});
const results=[];
try{
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('data:')?request.continue():request.abort());
 for(const width of [390,1458]){
  await page.setViewport({width,height:1100});
  for(const platform of ['facebook','instagram','linkedin','facebook,instagram']){
   const html=ctx.createGeneralApprovalPreviewHtml({post:{platform,video_url:'https://offline.invalid/video.mp4',image_url:poster,content_format:'animated_video',content:'Product campaign'},token:'offline-token',t});
   await page.goto('about:blank');await page.setContent(html,{waitUntil:'domcontentloaded'});
   const actual=await page.evaluate(()=>({video:getComputedStyle(document.querySelector('video')).backgroundColor,fit:getComputedStyle(document.querySelector('video')).objectFit,chips:[...document.querySelectorAll('.sp-platform')].map(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})),overflow:document.documentElement.scrollWidth>window.innerWidth}));
   assert.equal(actual.video,'rgb(247, 248, 251)');assert.equal(actual.fit,'contain');assert.equal(actual.overflow,false);
   for(const chip of actual.chips){assert.equal(chip.background,'rgb(243, 244, 248)');assert.equal(chip.color,'rgb(38, 49, 73)');}
   results.push({width,platform,...actual});
   if(process.env.UI_SCREENSHOT_DIR && platform==='facebook'){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,`approval-${width}.png`),fullPage:true});}
  }
  // Exercise the real carousel script; a CSS change must not affect navigation.
  await page.goto('about:blank');await page.setContent(ctx.createGeneralApprovalPreviewHtml({post:{platform:'facebook',content_format:'carousel',content:'Carousel'},carouselSlides:[{slide_order:1,image_url:poster},{slide_order:2,image_url:poster}],token:'offline-token',t}),{waitUntil:'domcontentloaded'});
  await page.click('#generalNext');assert.equal(await page.$eval('#generalCounter',el=>el.textContent),'2 / 2');
  assert.equal(await page.$eval('.sp-carousel-stage',el=>getComputedStyle(el).backgroundColor),'rgb(247, 248, 251)');
  // Real stylesheet cascade and the admin credit page's actual element classes.
  await page.goto('about:blank');await page.setContent(`<style>${adminCss}</style><main class="admin-page"><section class="admin-credit-layout"><article class="admin-panel admin-account-card"><h2>Customer</h2><div class="admin-account-balance"><div><strong>850</strong><span>Available credits</span></div></div></article></section></main>`,{waitUntil:'domcontentloaded'});
  const balance=await page.$eval('.admin-account-balance',el=>({background:getComputedStyle(el).backgroundColor,amount:getComputedStyle(el.querySelector('strong')).color,label:getComputedStyle(el.querySelector('span')).color}));
  assert.equal(balance.background,'rgb(25, 26, 30)');assert.equal(balance.amount,'rgb(255, 255, 255)');assert.equal(balance.label,'rgb(200, 201, 206)');
  results.push({width,balance});
  if(process.env.UI_SCREENSHOT_DIR){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,`credits-${width}.png`)});}
 }
 console.log('PASS 144.384: desktop/mobile real approval HTML, four platform combinations, light video/carousel backgrounds, intact navigation, readable credit amount through full stylesheet cascade.');
}finally{await browser.close();}
