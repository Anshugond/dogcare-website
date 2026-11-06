export async function onRequest({ request }) {
  const url = new URL(request.url);
  url.pathname = "/admin.html";
  return Response.redirect(url.toString(), 302);
}
