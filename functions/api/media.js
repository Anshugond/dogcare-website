export async function onRequestGet({request,env}){
  if(!env.EBOOKS)return new Response("Storage unavailable",{status:503});
  const key=new URL(request.url).searchParams.get("key")||"";
  if(!/^images\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(key))return new Response("Not found",{status:404});
  const obj=await env.EBOOKS.get(key);if(!obj)return new Response("Not found",{status:404});
  const h=new Headers();obj.writeHttpMetadata(h);h.set("Cache-Control","public, max-age=86400");h.set("X-Content-Type-Options","nosniff");
  return new Response(obj.body,{headers:h});
}
