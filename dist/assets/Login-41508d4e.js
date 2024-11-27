import{d as y,r as n,b as p,B as I,G as b,T as L,e as g,f as s,t as M,g as H,_ as C,y as w,A as x,o as V,E as F,F as h,i as d,v}from"./index-da0dfb42.js";import{g as B}from"./index-c3bfaefd.js";const A="/assets/193-4bca21db.png",U={key:0,class:"toast-wrapper"},z={class:"toast-content"},R=y({__name:"index",setup(k,{expose:m}){const o=n(!1),a=n("");return m({show:(r,t=2e3)=>{a.value=r,o.value=!0,setTimeout(()=>{o.value=!1},t)}}),(r,t)=>(p(),I(L,{name:"fade"},{default:b(()=>[o.value?(p(),g("div",U,[s("div",z,M(a.value),1)])):H("",!0)]),_:1}))}});const $=C(R,[["__scopeId","data-v-3569e408"]]),N={class:"page flex-col"},q={class:"box_1 flex-col"},D=s("div",{class:"group_3 flex-row"},[s("img",{class:"image_2",referrerpolicy:"no-referrer",src:A}),s("span",{class:"text_2"},"欢迎使用AI智能客服")],-1),E={class:"block_2 flex-col"},P={class:"box_2"},G={class:"image-text_3"},O=["innerHTML"],j=s("span",{class:"text_3"},"账号",-1),J={class:"box_2"},K={class:"image-text_3"},Q=["innerHTML"],W=s("span",{class:"text_3"},"密码",-1),X={class:"box_2"},Y={class:"image-text_3"},Z=["innerHTML"],ee=s("span",{class:"text_3"},"手机号",-1),se={class:"box_2"},te={class:"image-text_3"},oe=["innerHTML"],ae=s("span",{class:"text_3"},"邀请码",-1),ce=y({__name:"Login",setup(k){const m=w(),o=n();n(0);const a=n(""),l=n(""),r=n(""),t=n(""),u=n(""),S=B();x.shared.config.apiURL=`${S.HOST}/site/imapi?s=/`;const _={user:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512H418.3c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304H178.3z"/></svg>',lock:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M144 144v48H304V144c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192V144C80 64.5 144.5 0 224 0s144 64.5 144 144v48h16c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V256c0-35.3 28.7-64 64-64H80z"/></svg>',key:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0S160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17v80c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V448h40c13.3 0 24-10.7 24-24V384h40c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zM376 96a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>'},f=()=>{if(t.value==="a"){if(!a.value){o.value.show("请输入账号");return}if(!l.value){o.value.show("请输入密码");return}}else if(!/^1[3-9]\d{9}$/.test(u.value)){o.value.show("请输入正确的手机号");return}localStorage.setItem("username",t.value==="a"?a.value:u.value),localStorage.setItem("password",l.value);const c=t.value==="a"?{uid:a.value,token:l.value||"default111111",device_flag:1,device_level:0,loginType:t.value}:{uid:u.value,code:r.value,token:l.value||"default111111",device_flag:1,device_level:0,loginType:t.value};console.log(c),x.shared.post("/user/token",c).then(e=>{if(console.log(e,e.message),e.status==-1){o.value.show(e.message);return}try{e.supcust&&(localStorage.setItem("robot",e.supcust.chat_account),localStorage.setItem("scope",e.user.scope),localStorage.setItem("groupcode",e.user.groupcode)),localStorage.setItem("role",e.user.is_kefu),e.user&&(!e.user.nickname||e.user.nickname.trim()==="")?localStorage.setItem("needUpdateName","true"):e.user&&e.user.nickname&&localStorage.setItem("nickname",e.user.nickname),m.push({path:"/chat",query:{}})}catch{o.value.show("数据错误");return}}).catch(e=>{o.value.show(e.toString())}),localStorage.setItem("loginType",t.value)},T=()=>{const c=localStorage.getItem("username"),e=localStorage.getItem("password");c&&e&&(a.value=c,l.value=e,f())};return V(()=>{var e;const c=w().currentRoute.value;t.value=((e=c.query.type)==null?void 0:e.toString())||localStorage.getItem("loginType")||"a",localStorage.setItem("loginType",t.value),T()}),(c,e)=>(p(),g(h,null,[F($,{ref_key:"toastRef",ref:o},null,512),s("div",N,[s("div",q,[D,s("div",E,[t.value==="a"?(p(),g(h,{key:0},[s("div",P,[s("div",G,[s("span",{class:"icon-wrapper",innerHTML:_.user},null,8,O),j]),d(s("input",{type:"text",class:"login-input",placeholder:"输入客服账号","onUpdate:modelValue":e[0]||(e[0]=i=>a.value=i)},null,512),[[v,a.value]])]),s("div",J,[s("div",K,[s("span",{class:"icon-wrapper",innerHTML:_.lock},null,8,Q),W]),d(s("input",{type:"password",class:"login-input",placeholder:"输入密码","onUpdate:modelValue":e[1]||(e[1]=i=>l.value=i)},null,512),[[v,l.value]])])],64)):(p(),g(h,{key:1},[s("div",X,[s("div",Y,[s("span",{class:"icon-wrapper",innerHTML:_.user},null,8,Z),ee]),d(s("input",{type:"tel",class:"login-input",placeholder:"请输入手机号","onUpdate:modelValue":e[2]||(e[2]=i=>u.value=i)},null,512),[[v,u.value]])]),s("div",se,[s("div",te,[s("span",{class:"icon-wrapper",innerHTML:_.key},null,8,oe),ae]),d(s("input",{type:"text",class:"login-input",placeholder:"请输入邀请码(新账号必填)","onUpdate:modelValue":e[3]||(e[3]=i=>r.value=i),required:""},null,512),[[v,r.value]])])],64)),s("div",{class:"box_4"},[s("div",{class:"text-wrapper flex-col"},[s("button",{class:"login-btn",onClick:f},"登录")])])])])])],64))}});export{ce as default};
