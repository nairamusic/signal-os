const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSunoClient } = require('./src/suno-client');
const { createWordPressClient } = require('./src/wordpress-client');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT,'data');
const STATE_FILE = path.join(DATA_DIR,'signal-state.json');
const CAMPAIGN_JOBS_FILE = path.join(DATA_DIR,'campaign-jobs.json');
const ASSET_DIR = path.join(DATA_DIR,'assets');
const ASSET_INDEX_FILE = path.join(DATA_DIR,'asset-index.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
fs.mkdirSync(ASSET_DIR,{recursive:true});
const jobs = new Map();
const campaignJobs = new Map();
const clients = {
  suno: createSunoClient(process.env),
  wordpress: createWordPressClient(process.env)
};

const isLoopback=['127.0.0.1','localhost','::1'].includes(HOST);
if(!isLoopback&&!process.env.SIGNAL_ADMIN_PASSWORD) throw new Error('Refusing non-local startup without SIGNAL_ADMIN_PASSWORD');
const authEnabled=Boolean(process.env.SIGNAL_ADMIN_PASSWORD),adminUsername=process.env.SIGNAL_ADMIN_USERNAME||'naira-admin';

function securityHeaders(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn2.suno.ai https://cdn1.suno.ai; media-src 'self' blob: https://cdn2.suno.ai https://cdn1.suno.ai; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")}
function authorised(req){if(!authEnabled)return true;const value=req.headers.authorization||'',encoded=value.startsWith('Basic ')?value.slice(6):'';let supplied='';try{supplied=Buffer.from(encoded,'base64').toString('utf8')}catch{}const expected=`${adminUsername}:${process.env.SIGNAL_ADMIN_PASSWORD}`,a=crypto.createHash('sha256').update(supplied).digest(),b=crypto.createHash('sha256').update(expected).digest();return crypto.timingSafeEqual(a,b)}

function json(res, status, body) {
  securityHeaders(res);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw='';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function publicJob(job) {
  const { request, ...safe } = job;
  return safe;
}

function readJsonFile(file,fallback) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function writeJsonFile(file,value) { const temp=`${file}.tmp`; fs.writeFileSync(temp,JSON.stringify(value,null,2)); fs.renameSync(temp,file); }
for (const job of readJsonFile(CAMPAIGN_JOBS_FILE,[])) campaignJobs.set(job.id,job);
function persistCampaignJobs(){ writeJsonFile(CAMPAIGN_JOBS_FILE,[...campaignJobs.values()]); }
function allowedAsset(name,type){const ext=path.extname(name).toLowerCase(),extensions=new Set(['.wav','.flac','.mp3','.m4a','.mp4','.mov','.png','.jpg','.jpeg','.webp']);return extensions.has(ext)&&/^(audio|video|image)\//.test(type||'application/octet-stream')}
function connectorStatus(){
  const youtubeLive=Boolean(process.env.YOUTUBE_REFRESH_TOKEN),youtubeReady=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
  const metaReady=Boolean(process.env.META_APP_ID&&process.env.META_APP_SECRET),facebookLive=Boolean(process.env.META_PAGE_ACCESS_TOKEN),instagramLive=Boolean(process.env.META_INSTAGRAM_ACCOUNT_ID&&process.env.META_PAGE_ACCESS_TOKEN);
  const tiktokLive=Boolean(process.env.TIKTOK_ACCESS_TOKEN),tiktokReady=Boolean(process.env.TIKTOK_CLIENT_KEY&&process.env.TIKTOK_CLIENT_SECRET);
  return {
    suno:{...clients.suno.status(),setupUrl:'https://suno.com/account',requirements:['SUNO_API_KEY','SUNO_API_BASE_URL']},
    wordpress:{...clients.wordpress.status(),setupUrl:'https://nairamusic.com/wp-admin/edit.php',requirements:['NMC_SIGNAL_KEY']},
    youtube:{configured:youtubeLive,ready:youtubeReady,mode:youtubeLive?'live':'ready',setupUrl:'https://console.cloud.google.com/apis/library/youtube.googleapis.com',requirements:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN']},
    facebook:{configured:facebookLive,ready:metaReady,mode:facebookLive?'live':'ready',setupUrl:'https://developers.facebook.com/apps/',requirements:['META_APP_ID','META_APP_SECRET','META_PAGE_ACCESS_TOKEN']},
    instagram:{configured:instagramLive,ready:metaReady,mode:instagramLive?'live':'ready',setupUrl:'https://developers.facebook.com/apps/',requirements:['META_APP_ID','META_APP_SECRET','META_PAGE_ACCESS_TOKEN','META_INSTAGRAM_ACCOUNT_ID']},
    tiktok:{configured:tiktokLive,ready:tiktokReady,mode:tiktokLive?'live':'ready',setupUrl:'https://developers.tiktok.com/apps/',requirements:['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','TIKTOK_ACCESS_TOKEN','TIKTOK_OPEN_ID']},
    distrokid:{configured:false,ready:true,mode:'handoff',setupUrl:'https://distrokid.com/new/',requirements:['DISTROKID_ACCOUNT_EMAIL']},
    spotify:{configured:false,ready:true,mode:'distributor',setupUrl:'https://artists.spotify.com/',requirements:['SPOTIFY_ARTIST_URL','DistroKid delivery']},
    applemusic:{configured:false,ready:true,mode:'distributor',setupUrl:'https://artists.apple.com/',requirements:['APPLE_MUSIC_ARTIST_URL','DistroKid delivery']},
    youtubemusic:{configured:false,ready:true,mode:'distributor',setupUrl:'https://artists.youtube.com/',requirements:['YOUTUBE_CHANNEL_URL','DistroKid delivery']},
    amazonmusic:{configured:false,ready:true,mode:'distributor',setupUrl:'https://artists.amazonmusic.com/',requirements:['AMAZON_MUSIC_ARTIST_URL','DistroKid delivery']},
    deezer:{configured:false,ready:true,mode:'distributor',setupUrl:'https://creators.deezer.com/',requirements:['DEEZER_ARTIST_URL','DistroKid delivery']},
    tidal:{configured:false,ready:true,mode:'distributor',setupUrl:'https://artists.tidal.com/',requirements:['TIDAL_ARTIST_URL','DistroKid delivery']},
    soundcloud:{configured:false,ready:true,mode:'handoff',setupUrl:'https://artists.soundcloud.com/',requirements:['SOUNDCLOUD_PROFILE_URL','Operator approval']}
  };
}
async function receiveAsset(req,url){const original=decodeURIComponent(url.searchParams.get('name')||'').replace(/[\r\n]/g,''),type=req.headers['content-type']||'',trackId=decodeURIComponent(url.searchParams.get('trackId')||''),artist=decodeURIComponent(url.searchParams.get('artist')||'');if(!original||!trackId||!allowedAsset(original,type))throw new Error('Unsupported or incomplete asset upload');const id=crypto.randomUUID(),ext=path.extname(original).toLowerCase(),stored=`${id}${ext}`,target=path.join(ASSET_DIR,stored),temp=`${target}.tmp`,hash=crypto.createHash('sha256'),limit=250*1024*1024;let size=0;const stream=fs.createWriteStream(temp,{flags:'wx'});try{for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Asset exceeds 250 MB limit');hash.update(chunk);if(!stream.write(chunk))await new Promise(resolve=>stream.once('drain',resolve))}await new Promise((resolve,reject)=>stream.end(err=>err?reject(err):resolve()));fs.renameSync(temp,target);const asset={id,trackId,artist,originalName:original,storedName:stored,mimeType:type,size,sha256:hash.digest('hex'),createdAt:new Date().toISOString()};const index=readJsonFile(ASSET_INDEX_FILE,[]);index.push(asset);writeJsonFile(ASSET_INDEX_FILE,index);return asset}catch(error){stream.destroy();try{fs.unlinkSync(temp)}catch{}throw error}}

async function runAutomation(job) {
  try {
    job.status='GENERATING'; job.updatedAt=new Date().toISOString();
    const generation=await clients.suno.generate(job.request);
    job.suno=generation; job.status='SUNO_COMPLETE'; job.updatedAt=new Date().toISOString();
    const published=await clients.wordpress.publishTrack({...job.request,generation});
    job.wordpress=published; job.status=published.dryRun?'READY_TO_CONNECT':'PUBLISHED';
  } catch (error) {
    job.status='FAILED'; job.error=error.message;
  }
  job.updatedAt=new Date().toISOString();
}

async function api(req,res,url) {
  if (req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true,mode:clients.suno.mode==='live'&&clients.wordpress.mode==='live'?'live':'dry-run',security:{host:HOST,loopback:isLoopback,authenticationRequired:authEnabled||!isLoopback,authenticationConfigured:authEnabled,secureHeaders:true},storage:{configured:true,stateExists:fs.existsSync(STATE_FILE),campaignJobs:campaignJobs.size},connectors:connectorStatus()});
  if (req.method==='GET' && url.pathname==='/api/state') return json(res,200,{state:readJsonFile(STATE_FILE,null),savedAt:fs.existsSync(STATE_FILE)?fs.statSync(STATE_FILE).mtime.toISOString():null});
  if (req.method==='PUT' && url.pathname==='/api/state') { const input=await body(req); if (!input || !Array.isArray(input.artists) || !Array.isArray(input.tracks)) return json(res,422,{error:'Valid artists and tracks are required'}); writeJsonFile(STATE_FILE,input); return json(res,200,{saved:true,savedAt:new Date().toISOString()}); }
  if (req.method==='GET' && url.pathname==='/api/assets') return json(res,200,{assets:readJsonFile(ASSET_INDEX_FILE,[])});
  if (req.method==='PUT' && url.pathname==='/api/assets/upload') { try{return json(res,201,{asset:await receiveAsset(req,url)})}catch(error){return json(res,422,{error:error.message})} }
  if (req.method==='GET' && url.pathname==='/api/jobs') return json(res,200,{jobs:[...jobs.values()].map(publicJob)});
  if (req.method==='POST' && url.pathname==='/api/campaigns/package') {
    const input=await body(req);
    if (!input.trackId || !input.title || !input.artist) return json(res,422,{error:'trackId, title and artist are required'});
    const manifest={id:crypto.randomUUID(),createdAt:new Date().toISOString(),label:'Naira Music',collective:'NMC — Naira Music Cartel',radio:'NMC Signal',release:{trackId:input.trackId,title:input.title,artist:input.artist,explicit:input.explicit||'Unspecified'},platforms:input.platforms||[],assets:input.assets||[],mode:'PACKAGE_ONLY',notice:'No content has been uploaded or published. OAuth, account approval and final human release approval are required.'};
    return json(res,201,{manifest});
  }
  if (req.method==='GET' && url.pathname==='/api/campaigns/jobs') return json(res,200,{jobs:[...campaignJobs.values()]});
  if (req.method==='POST' && url.pathname==='/api/campaigns/queue') {
    const input=await body(req);
    if (!input.trackId || !input.title || !input.artist || !input.releaseAt || !Array.isArray(input.platforms)) return json(res,422,{error:'Complete release, schedule and platforms are required'});
    const now=new Date().toISOString();
    const created=input.platforms.map(platform=>{const id=crypto.randomUUID(),live=platform==='YouTube'?Boolean(process.env.YOUTUBE_REFRESH_TOKEN):platform==='Facebook'?Boolean(process.env.META_PAGE_ACCESS_TOKEN):platform==='Instagram'?Boolean(process.env.META_INSTAGRAM_ACCOUNT_ID&&process.env.META_PAGE_ACCESS_TOKEN):platform==='TikTok'?Boolean(process.env.TIKTOK_ACCESS_TOKEN):platform==='NairaMusic.com'?clients.wordpress.mode==='live':false;const status=['DistroKid','Spotify'].includes(platform)?'DISTRIBUTOR_HANDOFF':['NMC Signal','SoundCloud'].includes(platform)?'MANUAL_APPROVAL':live?'SCHEDULED':'READY_TO_CONNECT';const job={id,trackId:input.trackId,title:input.title,artist:input.artist,platform,releaseAt:input.releaseAt,timezone:input.timezone,launchMode:input.launchMode,status,createdAt:now,updatedAt:now};campaignJobs.set(id,job);return job});
    persistCampaignJobs();
    return json(res,202,{jobs:created,notice:'Jobs are prepared only. READY_TO_CONNECT and handoff jobs cannot publish externally.'});
  }
  if (req.method==='POST' && url.pathname==='/api/publish') {
    // Direct publish: push an approved track to nairamusic.com without Suno generation
    const input=await body(req);
    if (!input.trackId || !input.title || !input.artist) return json(res,422,{error:'trackId, title and artist are required'});
    try {
      const result=await clients.wordpress.publishTrack({...input, generation:{}});
      return json(res, result.dryRun?200:201, {result});
    } catch(error) {
      return json(res,502,{error:error.message});
    }
  }
  // Radio status — proxies nmcsignal/v1/status (radio sync-state + pending queue)
  if (req.method==='GET' && url.pathname==='/api/radio/status') {
    const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');
    const signalKey=process.env.NMC_SIGNAL_KEY||'';
    if(!signalKey) return json(res,200,{dryRun:true,message:'NMC_SIGNAL_KEY not configured'});
    try {
      const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/status`,{headers:{'X-Signal-Key':signalKey}});
      if(!r.ok){const t=await r.text();return json(res,502,{error:`WP ${r.status}: ${t}`});}
      return json(res,200,await r.json());
    } catch(error){return json(res,502,{error:error.message});}
  }
  // Radio publish — changes a draft nmc_track to published, adding it to radio rotation
  if (req.method==='POST' && url.pathname==='/api/radio/publish') {
    const input=await body(req);
    if(!input.post_id) return json(res,422,{error:'post_id is required'});
    const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');
    const signalKey=process.env.NMC_SIGNAL_KEY||'';
    if(!signalKey) return json(res,200,{dryRun:true,message:'NMC_SIGNAL_KEY not configured — cannot publish'});
    try {
      const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/publish`,{method:'POST',headers:{'X-Signal-Key':signalKey,'Content-Type':'application/json'},body:JSON.stringify({post_id:input.post_id})});
      if(!r.ok){const t=await r.text();throw new Error(`WP API ${r.status}: ${t}`);}
      return json(res,200,await r.json());
    } catch(error){return json(res,502,{error:error.message});}
  }
  // ── SITE SYNC ROUTES ─────────────────────────────────────────────────────
  if (req.method==='GET' && url.pathname==='/api/site/artists') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';if(!signalKey)return json(res,200,{dryRun:true,artists:[],message:'NMC_SIGNAL_KEY not configured'});try{const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/artists`,{headers:{'X-Signal-Key':signalKey}});if(!r.ok){const t=await r.text();return json(res,502,{error:`WP ${r.status}: ${t}`});}return json(res,200,await r.json())}catch(error){return json(res,502,{error:error.message})}}
  if (req.method==='POST' && url.pathname==='/api/site/artist-push') {const input=await body(req);const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';if(!signalKey)return json(res,200,{dryRun:true,message:'NMC_SIGNAL_KEY not configured'});try{const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/artist-push`,{method:'POST',headers:{'X-Signal-Key':signalKey,'Content-Type':'application/json'},body:JSON.stringify(input)});if(!r.ok){const t=await r.text();throw new Error(`WP API ${r.status}: ${t}`);}return json(res,200,await r.json())}catch(error){return json(res,502,{error:error.message})}}
  if (req.method==='GET' && url.pathname==='/api/site/catalogue') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';if(!signalKey)return json(res,200,{dryRun:true,tracks:[],total:0,published:0,drafts:0,total_streams:0});try{const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/catalogue`,{headers:{'X-Signal-Key':signalKey}});if(!r.ok){const t=await r.text();return json(res,502,{error:`WP ${r.status}: ${t}`});}return json(res,200,await r.json())}catch(error){return json(res,502,{error:error.message})}}
  if (req.method==='GET' && url.pathname==='/api/site/submissions') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';if(!signalKey)return json(res,200,{dryRun:true,submissions:[],count:0});try{const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/submissions`,{headers:{'X-Signal-Key':signalKey}});if(!r.ok){const t=await r.text();return json(res,502,{error:`WP ${r.status}: ${t}`});}return json(res,200,await r.json())}catch(error){return json(res,502,{error:error.message})}}
  if (req.method==='GET' && url.pathname==='/api/site/shop') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';if(!signalKey)return json(res,200,{dryRun:true,woocommerce:false});try{const r=await fetch(`${wpBase}/wp-json/nmcsignal/v1/shop-stats`,{headers:{'X-Signal-Key':signalKey}});if(!r.ok){const t=await r.text();return json(res,502,{error:`WP ${r.status}: ${t}`});}return json(res,200,await r.json())}catch(error){return json(res,502,{error:error.message})}}
  if (req.method==='GET' && url.pathname==='/api/radio/playlist') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');const signalKey=process.env.NMC_SIGNAL_KEY||'';try{const r=await fetch(`${wpBase}/wp-json/nmc-radio/v1/playlist`,{headers:signalKey?{'X-Signal-Key':signalKey}:{}});if(!r.ok)return json(res,200,{playlist:[],note:`Radio playlist endpoint returned ${r.status}`});const raw=await r.json();const playlist=Array.isArray(raw)?raw:(raw.playlist||[]);return json(res,200,{playlist,count:playlist.length})}catch(error){return json(res,200,{playlist:[],error:error.message})}}
  if (req.method==='GET' && url.pathname==='/api/radio/listeners') {const wpBase=(process.env.WP_BASE_URL||'https://nairamusic.com').replace(/\/$/,'');try{const r=await fetch(`${wpBase}/wp-json/nmc-radio/v1/listeners/count`);if(!r.ok)return json(res,200,{count:0});return json(res,200,await r.json())}catch(error){return json(res,200,{count:0})}}
  if (req.method==='POST' && url.pathname==='/api/jobs/generate') {
    const input=await body(req);
    if (!input.trackId || !input.title || !input.artist || !input.styles) return json(res,422,{error:'trackId, title, artist and styles are required'});
    const id=crypto.randomUUID();
    const now=new Date().toISOString();
    const job={id,trackId:input.trackId,title:input.title,artist:input.artist,status:'QUEUED',attempts:1,createdAt:now,updatedAt:now,request:input};
    jobs.set(id,job); setTimeout(()=>runAutomation(job),25);
    return json(res,202,{job:publicJob(job)});
  }
  const retry=url.pathname.match(/^\/api\/jobs\/([^/]+)\/retry$/);
  if (req.method==='POST' && retry) {
    const job=jobs.get(retry[1]);
    if (!job) return json(res,404,{error:'Job not found'});
    job.status='QUEUED'; job.error=null; job.attempts+=1; setTimeout(()=>runAutomation(job),25);
    return json(res,202,{job:publicJob(job)});
  }
  return json(res,404,{error:'API route not found'});
}

function staticFile(req,res,url) {
  const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const file=path.resolve(ROOT,requested);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res,404,{error:'Not found'});
  const ext=path.extname(file);
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
  securityHeaders(res);
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store, max-age=0'});
  fs.createReadStream(file).pipe(res);
}

http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  try { if(!authorised(req)){securityHeaders(res);res.writeHead(401,{'WWW-Authenticate':'Basic realm="SIGNAL OS", charset="UTF-8"','Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('Authentication required')}if(url.pathname.startsWith('/api/')) return await api(req,res,url); return staticFile(req,res,url); }
  catch(error){ return json(res,500,{error:error.message}); }
}).listen(PORT,HOST,()=>console.log(`SIGNAL//OS listening on http://${HOST}:${PORT}`));
