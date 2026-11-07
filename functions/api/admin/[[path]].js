const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const enc=s=>new TextEncoder().encode(s);
async function sign(value,secret){
  const key=await crypto.subtle.importKey("raw",enc(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function authenticated(request,env){
  const secret=env.ADMIN_SECRET;
  if(!secret)return false;
  const cookie=request.headers.get("Cookie")||"";
  const match=cookie.match(/(?:^|;\s*)dv_admin=([^;]+)/);
  if(!match)return false;
  const [expires,sig]=decodeURIComponent(match[1]).split(".");
  if(!expires||!sig||Number(expires)<Math.floor(Date.now()/1000))return false;
  return sig===await sign(expires,secret);
}
function slugify(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)}
export async function onRequest({request,env}){
  const url=new URL(request.url), path=url.pathname.replace(/^\/api\/admin\/?/,"");
  if(request.method==="POST"&&path==="login"){
    if(!env.ADMIN_PASSWORD||!env.ADMIN_SECRET)return json({error:"Admin secrets Cloudflare mein configure nahi hain."},503);
    const body=await request.json().catch(()=>({}));
    if(String(body.password||"")!==env.ADMIN_PASSWORD)return json({error:"Password galat hai."},401);
    const expires=String(Math.floor(Date.now()/1000)+60*60*12),sig=await sign(expires,env.ADMIN_SECRET);
    return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store","Set-Cookie":`dv_admin=${expires}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`}});
  }
  if(path==="logout"&&request.method==="POST")return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json","Set-Cookie":"dv_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"}});
  if(!await authenticated(request,env))return json({error:"Admin login required."},401);
  if(!env.ORDERS_DB)return json({error:"D1 binding ORDERS_DB missing."},500);
  if(path==="upload"&&request.method==="POST"){
    if(!env.EBOOKS)return json({error:"R2 binding EBOOKS missing."},500);
    const form=await request.formData(),file=form.get("file"),kind=String(form.get("kind")||"pdf");
    if(!file||typeof file.arrayBuffer!=="function")return json({error:"File select karein."},400);
    const allowed=kind==="image"?["image/jpeg","image/png","image/webp"]:["application/pdf"];
    if(!allowed.includes(file.type))return json({error:"Unsupported file type."},415);
    const max=kind==="image"?8*1024*1024:30*1024*1024;
    if(file.size>max)return json({error:"File size limit exceed. Image 8MB, PDF 30MB."},413);
    const ext=(file.name.split(".").pop()||"file").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8);
    const key=`${kind==="image"?"images":"products"}/${crypto.randomUUID()}.${ext}`;
    await env.EBOOKS.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
    return json({ok:true,key,size:file.size});
  }
  if(path==="orders"&&request.method==="GET"){
    const rows=await env.ORDERS_DB.prepare(`SELECT txnid,customer_name,email,phone,amount,currency,status,created_at,paid_at,page_slug,product_name,bump FROM orders ORDER BY created_at DESC LIMIT 500`).all();
    return json({orders:rows.results||[]});
  }
  if(path==="pages"&&request.method==="GET"){
    const rows=await env.ORDERS_DB.prepare("SELECT id,slug,title,status,created_at,updated_at,published_at FROM landing_pages ORDER BY updated_at DESC").all();
    return json({pages:rows.results||[]});
  }
  if(path==="pages"&&request.method==="POST"){
    const b=await request.json().catch(()=>null);if(!b)return json({error:"Invalid JSON."},400);
    const title=String(b.title||"").trim().slice(0,120),slug=slugify(b.slug||title);
    if(title.length<2||!slug)return json({error:"Page title aur valid URL slug required hai."},400);
    const config=b.config&&typeof b.config==="object"?b.config:{};
    const now=Math.floor(Date.now()/1000),id=crypto.randomUUID();
    try{
      await env.ORDERS_DB.prepare(`INSERT INTO landing_pages(id,slug,title,status,config_json,created_at,updated_at)
        VALUES(?,?,?,'draft',?,?,?)`).bind(id,slug,title,JSON.stringify(config),now,now).run();
      return json({ok:true,id,slug},201);
    }catch(e){return json({error:"Yeh URL slug pehle se use ho raha hai."},409)}
  }
  const match=path.match(/^pages\/([a-f0-9-]+)$/i);
  if(match&&request.method==="GET"){
    const row=await env.ORDERS_DB.prepare("SELECT * FROM landing_pages WHERE id=?").bind(match[1]).first();
    if(!row)return json({error:"Page not found."},404);
    let config={};try{config=JSON.parse(row.config_json)}catch{}
    return json({page:{...row,config}});
  }
  if(match&&request.method==="PUT"){
    const b=await request.json().catch(()=>null);if(!b)return json({error:"Invalid JSON."},400);
    const title=String(b.title||"").trim().slice(0,120),slug=slugify(b.slug||title),config=b.config&&typeof b.config==="object"?b.config:{};
    if(title.length<2||!slug)return json({error:"Title aur slug required hai."},400);
    const status=b.status==="published"?"published":"draft",now=Math.floor(Date.now()/1000);
    try{
      const result=await env.ORDERS_DB.prepare(`UPDATE landing_pages SET title=?,slug=?,config_json=?,status=?,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END WHERE id=?`)
        .bind(title,slug,JSON.stringify(config),status,now,status,now,match[1]).run();
      if(!result.meta?.changes)return json({error:"Page not found."},404);
      return json({ok:true,slug,status});
    }catch(e){return json({error:"URL slug already exists."},409)}
  }
  if(match&&request.method==="DELETE"){
    await env.ORDERS_DB.prepare("DELETE FROM landing_pages WHERE id=?").bind(match[1]).run();
    return json({ok:true});
  }
  return json({error:"Not found."},404);
}
