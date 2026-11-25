import re,os,shutil
D="/opt/shop-alexkrown/dist/"
s=open(D+"_astro/Order.CSr37ho8fix.js").read()
def one(a,b):
    global s
    assert s.count(a)==1,(s.count(a),a[:90]); s=s.replace(a,b)
# гостю тоже спрашиваем про оплату картой
one("if(!G)return q(!1);let e=!0;return l()","let e=!0;return l()")
# сохранённый итог: только новый вид (заказ принят сервером)
one("e?.no&&s.value.length===0?A(e)","e?.no&&e.sent&&s.value.length===0?A(e)")
# экран «Спасибо»
i=s.index("if(k){let e=()=>navigator.clipboard"); j=s.index("if(!W.length)return h(`div`,{class:`dr__empty`")
s=s[:i]+("if(k)return h(`div`,{class:`done`,\"aria-live\":`polite`,children:[h(`h2`,{class:`h2`,children:`Спасибо за заказ!`}),"
"h(`p`,{children:[`Заказ `,h(`b`,{children:k.no}),` принят`,k.total?[` на сумму `,h(`b`,{children:c(k.total)}),k.freeDelivery?``:` без доставки`]:``,`.`]}),"
"k.payOrderId&&h(`div`,{class:`order__pay`,children:[k.payError&&h(`p`,{class:`field__err`,role:`alert`,children:[`Оплата картой не открылась: `,k.payError]}),h(`p`,{children:h(`button`,{type:`button`,class:`btn btn--solid`,disabled:N,onClick:async()=>{P(!0);let e=await ye(k.payOrderId);e!==null&&(A({...k,payError:e}),P(!1))},children:N?`Открываем оплату…`:`Оплатить картой`})}),h(`p`,{class:`pp__hint`,children:[C(!!k.freeDelivery),`.`]})]}),"
"h(`p`,{children:[`Менеджер свяжется с вами, подтвердит наличие размеров, `,k.freeDelivery?`оформит бесплатную доставку`:`посчитает доставку`,k.payOrderId?`.`:` и пришлёт ссылку на оплату.`]}),"
"k.lk&&h(`p`,{class:`pp__hint`,children:[`Заказ и баллы за него видны в `,h(`a`,{class:`order__lk`,href:u(`account/orders`),children:`личном кабинете`}),`.`]}),"
"h(`p`,{children:h(`a`,{class:`btn`,href:g,children:`Вернуться в каталог`})}),"
"h(`p`,{class:`pp__hint`,children:[`Вопросы по заказу: `,h(`a`,{href:ae.href,children:ae.text}),`.`]})]});")+s[j:]
# отправка
i=s.index("i=[],o=!1,s=!1,u,d=a.value;"); j=s.index("ee(n,W.map(e=>({uid:e.uid")
# имя/ключ: повтор после сбоя сети идёт с тем же ключом и номером
i0=s.index("let t=new Date,n=`AK-")
new=("let y0=JSON.stringify([_e(),ce(D),F,I]),a0=SUB.v&&SUB.v.sig===y0?SUB.v:null;if(!a0){let t=new Date,z=e=>String(e).padStart(2,`0`);"
"a0=SUB.v={sig:y0,no:`AK-${String(t.getFullYear()).slice(2)}${z(t.getMonth()+1)}${z(t.getDate())}-${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}`,rnd:Array.from(crypto.getRandomValues(new Uint8Array(16)),e=>e.toString(16).padStart(2,`0`)).join(``)}}"
"let n=a0.no,o=!1,u,d=a.value;P(!0);Se(``);try{let e=await l(),r;"
"if(G){let t={lines:_e(),usePoints:F,points:I??void 0,meta:{externalNum:n,attribution:ie()},idempotencyKey:`ak:${n}:${a0.rnd}`,recipient:ce(D)};try{r=await e.placeOrder(t)}catch(n){if(!le(n))throw n;r=await e.placeOrder(t)}o=!0}"
"else{let t=await fetch(`/api/guest-orders`,{method:`POST`,credentials:`same-origin`,headers:{\"content-type\":`application/json`,\"idempotency-key\":`guest:${n}:${a0.rnd}`},body:JSON.stringify({lines:_e(),meta:{externalNum:n,attribution:ie()},recipient:ce(D),consent:{pdn:!0}})}),i=await t.json().catch(()=>null);if(!t.ok||!i?.orderId){t.status>=400&&t.status<500&&t.status!==429&&(SUB.v=null);throw Error(t.status===429?`Слишком много попыток – подождите минуту`:t.status<500&&i?.message||``)}r=i}"
"d=r.payRub;J&&(u=r.orderId)}catch(e){if(G&&!le(e))SUB.v=null;Se(e instanceof Error&&!(e instanceof TypeError)&&!le(e)&&e.message||`Не удалось отправить заказ – попробуйте ещё раз. Товары в корзине сохранены.`);P(!1);return}P(!1);SUB.v=null;"
"let f=_(d),p={no:n,sent:!0,total:d,freeDelivery:f,lk:o,...u?{payOrderId:u}:{}};")
s=s[:i0]+new+s[j:]
one("function de({catalogHref:g","var SUB={v:null};function de({catalogHref:g")
one("[B,V]=n(``);","[B,V]=n(``),[Sx,Se]=n(``);")
one("h(`button`,{type:`submit`,class:`btn btn--solid`,disabled:N,children:J?`Оплатить картой`:`Оформить заказ`}),","h(`button`,{type:`submit`,class:`btn btn--solid`,disabled:N,children:N?`Отправляем заказ…`:J?`Оплатить картой`:`Оформить заказ`}),Sx&&h(`p`,{class:`field__err`,role:`alert`,children:[Sx,` Или позвоните: `,h(`a`,{href:ae.href,children:ae.text})]}),")
open(D+"_astro/Order.akfix2.js","w").write(s)
s=open(D+"_astro/OrderPaid.D4uVGNLv.js").read()
one("Order.CSr37ho8fix.js","Order.akfix2.js")
i=s.index("v.s===`paid`&&a(e,"); j=s.index("v.s===`pending`&&a(e,")
s=s[:i]+("v.s===`paid`&&a(e,{children:[a(`h2`,{class:`h2`,children:`Спасибо за заказ!`}),a(`p`,{children:[O?[`Заказ `,a(`b`,{children:O.no}),` оплачен.`]:`Заказ оплачен.`,` Менеджер свяжется с вами, подтвердит детали и доставку.`]}),a(`p`,{children:a(`a`,{class:`btn btn--solid`,href:p,children:`Вернуться в каталог`})})]}),")+s[j:]
one("t?.payOrderId===e&&typeof t.text==`string`&&k({no:String(t.no),text:t.text})","t?.payOrderId===e&&k({no:String(t.no)})")
open(D+"_astro/OrderPaid.akfix2.js","w").write(s)
for f,a,b in (("checkout/index.html","Order.CSr37ho8fix.js","Order.akfix2.js"),("checkout-paid/index.html","OrderPaid.D4uVGNLv.js","OrderPaid.akfix2.js")):
    t=open(D+f).read(); print(f,t.count(a)); assert a in t; open(D+f,"w").write(t.replace(a,b))
