export async function onRequest({request}){ const u=new URL(request.url); u.pathname="/admin.html"; return Response.redirect(u.toString(),302); }
