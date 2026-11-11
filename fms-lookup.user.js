// ==UserScript==
// @name         EmailsBots FMS Inventory Lookup
// @namespace    https://github.com/antoleod/EmailsBots
// @version      1.0.0
// @match        https://www.fms.ep.parl.union.eu/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){
  "use strict";
  if(window!==window.top||!window.opener)return;
  const token=new URL(location.href).searchParams.get("snfms");
  if(!/^[a-f0-9]{32}$/i.test(token||""))return;
  const opener=window.opener;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function docs(){
    const result=[],seen=new Set();
    function scan(d,n){
      if(!d||seen.has(d)||n>4)return;
      seen.add(d);result.push(d);
      for(const f of d.querySelectorAll("iframe,frame")){
        try{scan(f.contentDocument,n+1);}catch{}
      }
    }
    scan(document,0);return result;
  }
  const find=selector=>{
    for(const d of docs()){
      const el=d.querySelector(selector);
      if(el&&el.getClientRects().length)return el;
    }
    return null;
  };
  const findText=(text,selector)=>{
    for(const d of docs()){
      const el=[...d.querySelectorAll(selector)].find(e=>e.textContent?.trim()===text&&e.getClientRects().length);
      if(el)return el;
    }
    return null;
  };
  async function wait(get,label){
    const end=Date.now()+30000;
    while(Date.now()<end){
      const el=get();if(el)return el;
      await sleep(250);
    }
    throw Error("FMS control missing: "+label);
  }
  async function click(get,label){
    (await wait(get,label)).click();
    await sleep(400);
  }
  async function lookup(pi){
    if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$/.test(pi))throw Error("Invalid PI");
    if(!find("#ls-inputfieldhelpbutton"))await click(()=>find("#backBtn"),"Back");
    await click(()=>find("#ls-inputfieldhelpbutton"),"Main Asset Number");
    await click(()=>findText("Search and Select","span,button,a,td")||find("#u14E505-text"),"Search and Select");
    await click(()=>find("#btnCRITERIA1"),"Criteria");
    await click(()=>findText("I: Inventory Number","td")||find("#NSHP1_12 > td:nth-of-type(3)"),"Inventory Number");
    const input=await wait(()=>find("#NSHHI1_1-input"),"Inventory input");
    const w=input.ownerDocument.defaultView;
    input.focus();
    const setter=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value")?.set;
    if(setter)setter.call(input,pi);else input.value=pi;
    input.dispatchEvent(new w.Event("input",{bubbles:true}));
    input.dispatchEvent(new w.Event("change",{bubbles:true}));
    if(input.value!==pi)throw Error("PI input did not accept the value");
    input.blur();
    await click(()=>find("#btnGO1"),"Go");
    // Read-only search; never select, update or save an asset automatically.
  }
  const signal=(type,extra={})=>{
    try{opener.postMessage(Object.assign({type,token},extra),"*");}catch{}
  };
  let started=false;
  const ping=setInterval(()=>signal("FMS_READY"),1200);
  const expire=setTimeout(()=>clearInterval(ping),90000);
  window.addEventListener("message",async e=>{
    if(started||e.source!==opener||e.data?.type!=="FMS_LOOKUP"||e.data?.token!==token)return;
    started=true;clearInterval(ping);clearTimeout(expire);
    try{
      await lookup(e.data.pi);
      signal("FMS_DONE",{status:"SEARCH_SUBMITTED"});
    }catch(error){
      console.error("[FMS lookup]",error);
      signal("FMS_DONE",{status:"ERROR",message:String(error.message||error)});
    }finally{
      try{window.opener=null;}catch{}
    }
  });
  signal("FMS_READY");
})();
