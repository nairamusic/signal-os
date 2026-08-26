function createSunoClient(env) {
  const apiKey=env.SUNO_API_KEY;
  const base=(env.SUNO_API_BASE_URL||'').replace(/\/$/,'');
  const generatePath=env.SUNO_GENERATE_PATH||'/v1/generations';
  const live=Boolean(apiKey&&base);
  return {
    mode:live?'live':'dry-run',
    status:()=>({configured:live,mode:live?'live':'dry-run',provider:'Suno Platform REST API'}),
    async generate(input) {
      if(!live) return {dryRun:true,id:`dry-suno-${Date.now()}`,status:'complete',audioUrl:null,message:'Add SUNO_API_KEY and SUNO_API_BASE_URL to enable live generation.'};
      const response=await fetch(`${base}${generatePath}`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({title:input.title,lyrics:input.lyrics||'',style:input.styles,instrumental:false,metadata:{track_id:input.trackId,artist:input.artist}})});
      if(!response.ok) throw new Error(`Suno API ${response.status}: ${await response.text()}`);
      return {dryRun:false,...await response.json()};
    }
  };
}
module.exports={createSunoClient};
