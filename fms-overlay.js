/* EmailsBots FMS overlay v2: durable button mounting for legacy public bundle.
   Standalone browser script. The source FMS dialog is kept in EmailsBots.
   No SAP write actions. CI always read live; PI may be different.
*/
(function(){
"use strict";
if(window.SNFMSOverlay?.version==="2.0.0"){window.SNFMSOverlay.refresh();return;}
/* Read-only ServiceNow CI -> FMS PI lookup. Never change ServiceNow's CI. */
const FMS_ORIGIN="https://www.fms.ep.parl.union.eu";
const FMS_URL=FMS_ORIGIN+"/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html#FixedAsset-change?sap-ui-tech-hint=GUI&sap-ie=edge&sap-touch=0";
const normalizePi=value=>{
  const v=String(value??"").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$/.test(v)?v:"";
};
function buildFmsUrl(token){
  if(!/^[a-f0-9]{32}$/i.test(token)) throw Error("Invalid handoff token");
  const u=new URL(FMS_URL);
  u.searchParams.set("snfms",token);
  return u.href;
}
function openFmsDialog(doc,rawCi){
  if(!doc?.body)return;
  doc.getElementById("sn-assistant-fms-dialog")?.remove();
  const win=doc.defaultView,ci=String(rawCi??"").trim();
  const el=doc.createElement("dialog");
  el.id="sn-assistant-fms-dialog";
  el.setAttribute("aria-label","Confirm FMS Inventory Number");
  el.style.cssText="position:fixed;inset:0;margin:auto;max-width:min(440px,calc(100vw - 28px));padding:22px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#111827;box-shadow:0 16px 48px #0004;font:14px/1.5 system-ui;z-index:2147483600";
  el.innerHTML=[
    '<form method="dialog" style="display:grid;gap:11px">',
    '<h2 style="margin:0;font-size:20px">Open in FMS</h2>',
    '<div>Always verify the PI before searching FMS.</div>',
    '<label>Configuration Item from ServiceNow</label>',
    '<output data-ci style="padding:9px;background:#f1f5f9;border-radius:8px;overflow-wrap:anywhere;font-weight:600"></output>',
    '<label><input type="radio" name="choice" value="same" checked> PI is the same as CI</label>',
    '<label><input type="radio" name="choice" value="different"> Equipment has a different PI</label>',
    '<label for="sn-assistant-fms-pi">PI / Inventory Number</label>',
    '<input id="sn-assistant-fms-pi" name="pi" autocomplete="off" required style="padding:10px;border:1px solid #94a3b8;border-radius:7px;font:inherit">',
    '<div role="status" aria-live="polite" data-status style="min-height:18px;font-size:12px;color:#475569"></div>',
    '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">',
    '<button type="button" data-copy>Copy PI</button>',
    '<button type="button" data-close>Cancel</button>',
    '<button type="submit" data-submit style="background:#2563eb;color:white;border:0;border-radius:7px;padding:9px 12px">Search FMS</button>',
    '</div></form>'
  ].join("");
  const input=el.querySelector("[name=pi]");
  const status=el.querySelector("[data-status]");
  const same=el.querySelector('[value="same"]');
  const different=el.querySelector('[value="different"]');
  const submit=el.querySelector("[data-submit]");
  const closeButton=el.querySelector("[data-close]");
  el.querySelector("[data-ci]").textContent=ci||"Missing — enter PI manually";
  input.value=ci;
  if(!normalizePi(ci))different.checked=true;
  input.readOnly=!different.checked;
  if(!ci)status.textContent="No CI detected; manual PI required.";
  el.addEventListener("change",event=>{
    if(event.target===same&&same.checked){input.value=ci;input.readOnly=true;}
    if(event.target===different&&different.checked){input.readOnly=false;input.focus();input.select();}
  });
  let cleanup=()=>{};
  const close=()=>{cleanup();if(el.open)el.close();el.remove();};
  closeButton.addEventListener("click",close);
  el.addEventListener("cancel",e=>{e.preventDefault();close();});
  el.querySelector("[data-copy]").addEventListener("click",()=>{
    const pi=normalizePi(input.value);
    if(!pi){status.textContent="Enter a valid PI first.";return;}
    if(!win.navigator.clipboard?.writeText){input.focus();input.select();status.textContent="Select and copy PI manually.";return;}
    win.navigator.clipboard.writeText(pi).then(()=>status.textContent="PI copied.").catch(()=>status.textContent="Copy blocked; copy PI manually.");
  });
  el.querySelector("form").addEventListener("submit",e=>{
    e.preventDefault();
    const pi=normalizePi(input.value);
    if(!pi){status.textContent="Invalid PI (3–80 letters, digits, . _ / -).";input.focus();return;}
    if(same.checked&&pi!==ci){status.textContent="Choose different PI to override the ticket CI.";return;}
    const bytes=new Uint8Array(16);win.crypto.getRandomValues(bytes);
    const token=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    let popup=null,timer=null;
    cleanup();
    const listener=event=>{
      if(event.origin!==FMS_ORIGIN||event.source!==popup||event.data?.token!==token)return;
      if(event.data.type==="FMS_READY"){
        popup.postMessage({type:"FMS_LOOKUP",token,pi},FMS_ORIGIN);
        status.textContent="FMS connected. Running PI search...";
      } else if(event.data.type==="FMS_DONE"){
        cleanup();
        status.textContent=event.data.status==="SEARCH_SUBMITTED"
          ?"Search submitted. Verify the FMS result before opening an asset."
          :"FMS error: "+String(event.data.message||"Unknown error");
      }
    };
    win.addEventListener("message",listener);
    cleanup=()=>{win.removeEventListener("message",listener);if(timer!==null)win.clearTimeout(timer);};
    popup=win.open(buildFmsUrl(token),"_blank");
    if(!popup){cleanup();status.textContent="Popup blocked. Allow FMS popups and retry.";return;}
    submit.disabled=true;
    closeButton.textContent="Close";
    status.textContent="FMS opened. Waiting for companion script; Copy PI remains available.";
    timer=win.setTimeout(()=>{
      cleanup();submit.disabled=false;
      status.textContent="FMS companion not detected. Search manually using Copy PI.";
    },90000);
  });
  doc.body.appendChild(el);
  if(typeof el.showModal==="function")el.showModal();
  else el.setAttribute("open","");
  return el;
}

const installedDocs=new WeakSet();
let timer=null,buttonCount=0,stopped=false;
function allDocs(){
  const docs=[],visited=new Set();
  function walk(doc,depth){
    if(!doc || depth>5 || visited.has(doc))return;
    visited.add(doc);docs.push(doc);
    for(const frame of doc.querySelectorAll("iframe,frame")){
      try {walk(frame.contentDocument,depth+1);} catch {}
    }
  }
  walk(document,0);
  return docs;
}
function readLiveCI(){
  const docs=allDocs();
  for(const doc of docs){
    for(const selector of [
      'input[id="sys_display.sc_task.cmdb_ci"]',
      'input[id="sys_display.incident.cmdb_ci"]',
      'input[id^="sys_display."][id$=".cmdb_ci"]'
    ]){
      const value=String(doc.querySelector(selector)?.value || "").trim();
      if(value)return value;
    }
  }
  for(const doc of docs){
    try {
      const gf=doc.defaultView?.g_form;
      const displayed=gf?.getDisplayValue?.("cmdb_ci") ||
         gf?.getDisplayBox?.("cmdb_ci")?.value || "";
      if(String(displayed).trim())return String(displayed).trim();
    }catch{}
  }
  return "";
}
function onAction(event){
  const button=event.target.closest?.('[data-action="open-fms"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const ci=readLiveCI();
  openFmsDialog(button.ownerDocument,ci);
}
function attach(doc){
  if(!installedDocs.has(doc)){
    doc.addEventListener("click",onAction,true);
    installedDocs.add(doc);
  }
  const native=doc.querySelector('[data-action="open-fms"]');
  if(native)return;
  const anchors=doc.querySelectorAll('.sn-ep__actions button[data-action="open-ep-links"],.sn-ep__actions button[data-action="open-pdf"]');
  const anchor=anchors[0];
  if(!anchor)return;
  const button=anchor.cloneNode(true);
  button.dataset.action="open-fms";
  button.dataset.snFmsOverlay="v2";
  button.setAttribute("type","button");
  button.title="Open in FMS — confirm CI and PI before search";
  button.setAttribute("aria-label","Open in FMS");
  button.removeAttribute("disabled");
  button.removeAttribute("aria-disabled");
  button.removeAttribute("id");
  const label=button.querySelector(".sn-ep__label");
  if(label)label.textContent="Open in FMS";
  else button.textContent="Open in FMS";
  const wrapper=anchor.closest(".sn-ep-editable-wrap");
  if(wrapper){
    const newWrapper=doc.createElement("div");
    newWrapper.className="sn-ep-editable-wrap";
    newWrapper.dataset.buttonId="open-fms";
    newWrapper.appendChild(button);
    wrapper.insertAdjacentElement("afterend",newWrapper);
  }else anchor.insertAdjacentElement("afterend",button);
  buttonCount++;
  console.info("[SN FMS] Open in FMS added", {ci:readLiveCI()||"(not detected)"});
}
function refresh(){
  if(stopped)return;
  for(const doc of allDocs())attach(doc);
}
window.SNFMSOverlay={
  version:"2.0.0",
  refresh,
  open:()=>openFmsDialog(document,readLiveCI()),
  status:()=>({version:"2.0.0",buttonCountMounted:buttonCount,
    visibleButtons:allDocs().reduce((n,d)=>n+d.querySelectorAll('[data-action="open-fms"]').length,0),
    ci:readLiveCI()||"",running:!stopped}),
  stop(){stopped=true;if(timer!==null)clearInterval(timer);}
};
refresh();
timer=setInterval(refresh,800);
console.info("[SN FMS] Overlay v2 installed",window.SNFMSOverlay.status());
})();
