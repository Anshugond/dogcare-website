
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  }
});

export async function onRequest({ params, env, request }) {

  const pathname = new URL(request.url).pathname;

  const slug = String(params.slug || '').toLowerCase();

  if (!/^[a-z0-9-]{1,70}$/.test(slug)) {
    return new Response('Not found', { status: 404 });
  }

  if (!env.ORDERS_DB) {
    return new Response('Page service unavailable', { status: 503 });
  }

  const row = await env.ORDERS_DB.prepare(
    "SELECT title,slug,config_json FROM landing_pages WHERE slug=? AND status='published'"
  ).bind(slug).first();

  if (!row) {
    return new Response('Page not found', { status: 404 });
  }

  let c = {};
  try {
    c = JSON.parse(row.config_json || '{}');
  } catch {}

  const title = esc(c.heroTitle || row.title);
  const sub = esc(c.subtitle || '');
  const name = esc(c.productName || row.title);

  const price = Number(c.price || 149);
  const bumpPrice = Number(c.bumpPrice || 49);

  const accent = /^#[0-9a-f]{6}$/i.test(c.accent || '')
    ? c.accent
    : '#2563eb';

  const image = c.heroImage
    ? `<img class="heroimg" src="${esc(c.heroImage)}" alt="">`
    : '';

  const sections = (c.sections || []).map(s => `
    <section class="section">
      <h2>${esc(s.title || '')}</h2>
      ${
        s.type === 'faq'
          ? (s.items || []).map(q => `
              <details>
                <summary>${esc(q)}</summary>
                <p>Digital product. Details are provided on this page.</p>
              </details>
            `).join('')
          : `<ul>${(s.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
      }
    </section>
  `).join('');

  const bump = c.bumpEnabled
    ? `<label class="bump">
        <input type="checkbox" id="bump">
        <span>
          <b>Add ${esc(c.bumpTitle || 'Bonus Ebook')}</b>
          <small>One-time add-on for ₹${bumpPrice}</small>
        </span>
      </label>`
    : '';

  const pixel = c.pixelId
    ? `<script>
      !function(f,b,e,v,n,t,s){
        if(f.fbq)return;
        n=f.fbq=function(){
          n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)
        };
        if(!f._fbq)f._fbq=n;
        n.push=n;
        n.loaded=!0;
        n.version='2.0';
        n.queue=[];
        t=b.createElement(e);
        t.async=!0;
        t.src=v;
        s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)
      }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${esc(c.pixelId)}');
      fbq('track','PageView');
    </script>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(row.title)}</title>
<meta name="description" content="${sub}">
${pixel}

<script src="https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js"></script>

<style>
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,Arial;color:#17212b;background:#fff}
header{background:linear-gradient(145deg,${accent},#172554);color:white;text-align:center;padding:52px 18px 44px}
header h1{font-size:clamp(30px,5vw,54px);line-height:1.12;max-width:850px;margin:16px auto}
header p{max-width:680px;margin:12px auto 20px}
.heroimg{max-width:min(420px,90%);max-height:330px;object-fit:contain;border-radius:16px}
.wrap{max-width:850px;margin:auto;padding:0 18px}
.price{font-size:30px;font-weight:800;margin:14px}
.btn{background:${accent};color:white;border:0;padding:15px 28px;border-radius:40px;font-weight:800;font-size:17px;cursor:pointer}
.section{padding:30px 0;border-bottom:1px solid #e5e7eb}
.section h2{color:${accent}}
li{margin:9px 0}
details{padding:12px;border:1px solid #e5e7eb;border-radius:10px;margin:9px 0}
.checkout{background:#f8fafc;padding:30px 20px;border-radius:18px;margin:32px auto;max-width:580px}
.checkout input{width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:9px;margin:7px 0 14px;font:inherit}
.bump{display:flex;gap:10px;align-items:center;background:#fff7d6;border:1px dashed #d97706;padding:14px;border-radius:12px;margin:12px 0}
.bump small{display:block}
.err{color:#b91c1c}
.success{display:none;background:#ecfdf5;padding:20px;border-radius:12px}
.success a{display:block;margin:12px 0;color:#047857;font-weight:700}
footer{text-align:center;color:#64748b;padding:28px}
@media(max-width:600px){header{padding:35px 16px}}
</style>
</head>

<body>
<header>
${image}
<h1>${title}</h1>
<p>${sub}</p>
<div class="price">₹${price}</div>
<button class="btn" onclick="document.getElementById('checkout').scrollIntoView({behavior:'smooth'})">
Get instant access
</button>
</header>

<main class="wrap">
${sections}

<div id="checkout" class="checkout">
<h2>Get ${name}</h2>

<form id="order">
<label>Name
<input name="name" required minlength="2">
</label>

<label>Email
<input name="email" type="email" required>
</label>

<label>Phone
<input name="phone" inputmode="numeric" pattern="[0-9]{10}" required>
</label>

${bump}

<p><b>Total: ₹<span id="total">${price}</span></b></p>

<button class="btn" id="pay" type="submit">Pay securely</button>
<p id="err" class="err"></p>
</form>

<div id="success" class="success">
<h2>Payment successful</h2>
<p>Your secure download links:</p>
<div id="links"></div>
</div>
</div>
</main>

<footer>Secure checkout · Digital delivery</footer>

<script>
const PAGE=${JSON.stringify(slug)};
const PRICE=${price};
const BUMP=${bumpPrice};

const bump=document.getElementById('bump');
const total=document.getElementById('total');
const form=document.getElementById('order');
const err=document.getElementById('err');

function amount(){
  return PRICE+(bump&&bump.checked?BUMP:0);
}

if(bump){
  bump.onchange=()=>{
    total.textContent=amount();
    if(window.fbq&&bump.checked){
      fbq('track','AddToCart',{value:BUMP,currency:'INR'});
    }
  };
}

document.querySelectorAll('.btn').forEach(b=>{
  if(b.type!=='submit'){
    b.addEventListener('click',()=>{
      if(window.fbq){
        fbq('track','InitiateCheckout',{
          value:amount(),
          currency:'INR'
        });
      }
    });
  }
});

form.onsubmit=async e=>{
  e.preventDefault();

  err.textContent='';

  const btn=document.getElementById('pay');
  btn.disabled=true;
  btn.textContent='Opening payment...';

  try{
    const fd=new FormData(form);

    const body={
      pageSlug:PAGE,
      name:fd.get('name'),
      email:fd.get('email'),
      phone:fd.get('phone'),
      bump:!!(bump&&bump.checked)
    };

    const resp=await fetch('/api/create-payment',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });

    const d=await resp.json();

    if(!resp.ok||!d.access_key){
      throw Error(d.error||'Payment start nahi hua');
    }

    const checkout=new EasebuzzCheckout(d.key,d.env||'prod');

    checkout.initiatePayment({
      access_key:d.access_key,
      theme:'${accent}',

      onResponse:async r=>{
        if(!r||r.status!=='success'){
          err.textContent='Payment complete nahi hua.';
          btn.disabled=false;
          btn.textContent='Pay securely';
          return;
        }

        try{
          const vr=await fetch('/api/verify-payment',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(r)
          });

          const v=await vr.json();

          if(!vr.ok||!v.ok){
            throw Error(v.error||'Verification failed');
          }

          form.style.display='none';
          document.getElementById('success').style.display='block';

          document.getElementById('links').innerHTML=
            v.files.map(f=>
              '<a href="'+f.url+'">Download '+f.title+'</a>'
            ).join('');

          if(window.fbq&&v.purchase){
            fbq('track','Purchase',{
              value:v.purchase.value,
              currency:'INR',
              content_name:v.purchase.content_name
            },{
              eventID:v.purchase.event_id
            });
          }

        }catch(x){
          err.textContent=
            'Payment ho gaya ho sakta hai, lekin verification pending hai. Support se contact karein. '+x.message;

          btn.disabled=false;
          btn.textContent='Try verification again';
        }
      }
    });

    btn.disabled=false;
    btn.textContent='Pay securely';

  }catch(x){
    err.textContent=x.message;
    btn.disabled=false;
    btn.textContent='Pay securely';
  }
};
</script>
</body>
</html>`;

  return new Response(html,{
    headers:{
      "Content-Type":"text/html; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff"
    }
  });
}
