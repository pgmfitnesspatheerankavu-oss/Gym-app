import { listMembers, getMember, createMember, updateMember } from "./cloud-data.js";
import { auth, resolveRole } from "./firebase-client.js";

const style = document.createElement("style");
style.textContent = `.pgm-cloud-members{position:fixed;inset:0;background:#0008;z-index:8000;display:none;align-items:center;justify-content:center;padding:14px}.pgm-cloud-members.open{display:flex}.pgm-cloud-panel{background:#fff;color:#222;width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:14px;padding:16px}.pgm-cloud-row{padding:11px;border:1px solid #ddd;border-radius:8px;margin:8px 0;display:flex;justify-content:space-between;gap:10px;align-items:center}.pgm-cloud-row button{padding:8px 10px;border:0;border-radius:6px;background:#1976d2;color:white}.pgm-cloud-detail{white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;margin-top:10px;font-size:13px}.pgm-cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.pgm-cloud-actions button{padding:9px 12px;border:0;border-radius:7px;background:#1976d2;color:white}.pgm-cloud-note{font-size:12px;color:#666;margin:8px 0}.pgm-cloud-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.pgm-cloud-field{display:flex;flex-direction:column;gap:4px;font-size:13px}.pgm-cloud-field input,.pgm-cloud-field textarea{width:100%;padding:10px;border:1px solid #ccc;border-radius:7px;font:inherit}.pgm-cloud-field.full{grid-column:1/-1}.pgm-cloud-form-actions{display:flex;gap:8px;grid-column:1/-1}.pgm-cloud-form-actions button{flex:1;padding:11px;border:0;border-radius:7px;background:#1976d2;color:white}.pgm-cloud-form-actions .cancel{background:#666}@media(max-width:420px){.pgm-cloud-form{grid-template-columns:1fr}}`);
document.head.append(style);
const trigger=document.createElement("button");
trigger.type="button"; trigger.textContent="Cloud Members";
trigger.style.cssText="position:fixed;right:12px;bottom:62px;z-index:6000;padding:10px 14px;border:0;border-radius:22px;background:#1976d2;color:white;font-weight:700;box-shadow:0 2px 8px #0003";
const overlay=document.createElement("section"); overlay.className="pgm-cloud-members"; overlay.setAttribute("aria-label","Cloud members");
overlay.innerHTML='<div class="pgm-cloud-panel"><h3>Cloud Members</h3><p class="pgm-cloud-note">Cloud member വിവരങ്ങൾ ഇവിടെ കാണാനും ചേർക്കാനും തിരുത്താനും കഴിയും. Fee മാറ്റം Owner-ന് മാത്രം.</p><div class="pgm-cloud-actions"><button type="button" id="pgmCloudAdd">Add Member</button><button type="button" id="pgmCloudRefresh">Refresh</button><button type="button" id="pgmCloudClose">Close</button></div><div id="pgmCloudStatus" role="status">Load ചെയ്യാൻ Refresh അമർത്തുക.</div><div id="pgmCloudList"></div><div id="pgmCloudDetail"></div></div>';
document.body.append(trigger,overlay);
const status=overlay.querySelector("#pgmCloudStatus"), list=overlay.querySelector("#pgmCloudList"), detail=overlay.querySelector("#pgmCloudDetail");
trigger.addEventListener("click",()=>{overlay.classList.add("open"); load();});
overlay.querySelector("#pgmCloudClose").addEventListener("click",()=>overlay.classList.remove("open"));
overlay.querySelector("#pgmCloudRefresh").addEventListener("click",load);
overlay.querySelector("#pgmCloudAdd").addEventListener("click",()=>editForm(null));
async function load(){status.textContent="Cloud members load ചെയ്യുന്നു…";list.replaceChildren();detail.replaceChildren();try{const rows=await listMembers();status.textContent=rows.length+" Cloud member(s)";for(const m of rows){const row=document.createElement("div");row.className="pgm-cloud-row";const info=document.createElement("div");const name=document.createElement("strong");name.textContent=m.name||"Unnamed";const meta=document.createElement("div");meta.textContent=[m.phone,m.plan,m.expiryDate].filter(Boolean).join(" · ");info.append(name,meta);const actions=document.createElement("div");const btn=document.createElement("button");btn.type="button";btn.textContent="View";btn.addEventListener("click",()=>view(m.id));const edit=document.createElement("button");edit.type="button";edit.textContent="Edit";edit.style.marginLeft="6px";edit.addEventListener("click",()=>editForm(m.id));actions.append(btn,edit);row.append(info,actions);list.append(row);}}catch(e){status.textContent="Cloud data ലഭിച്ചില്ല: "+(e?.message||"Connection error");}}
async function view(id){detail.textContent="Details load ചെയ്യുന്നു…";try{const m=await getMember(id);if(!m){detail.textContent="Member കണ്ടെത്തിയില്ല.";return;}const safe={name:m.name||"",phone:m.phone||"",address:m.address||"",plan:m.plan||"",planFee:m.planFee??"",joinDate:m.joinDate||"",expiryDate:m.expiryDate||"",status:m.status||""};detail.textContent=Object.entries(safe).map(([k,v])=>k+": "+v).join("\n");}catch(e){detail.textContent="Details ലഭിച്ചില്ല: "+(e?.message||"Error");}}

async function editForm(id){
  let m={};
  let roleInfo;
  try { roleInfo = await resolveRole(auth.currentUser); } catch(e) { status.textContent="Access check failed."; return; }
  if(!roleInfo?.allowed){status.textContent="Login required.";return;}
  const isOwner = roleInfo.role === "owner";
  if(id){try{m=await getMember(id)||{};}catch(e){status.textContent="Member ലഭിച്ചില്ല: "+(e?.message||"Error");return;}}
  detail.replaceChildren();
  const heading=document.createElement("h4");heading.textContent=id?"Edit Cloud Member":"Add Cloud Member";detail.append(heading);
  const form=document.createElement("form");form.className="pgm-cloud-form";
  const fields=[["name","Name","text",true],["phone","Phone","tel"],["address","Address","text"],["plan","Plan","text"],["planFee","Plan fee","number"],["joinDate","Join date","date"],["expiryDate","Expiry date","date"],["status","Status","text"],["notes","Notes","text"]];
  for(const [key,label,type,required] of fields){
    if(key==="planFee"&&!isOwner)continue;
    const wrap=document.createElement("label");wrap.className="pgm-cloud-field"+(["address","notes"].includes(key)?" full":"");wrap.append(document.createTextNode(label));
    const input=key==="notes"?document.createElement("textarea"):document.createElement("input");
    if(key!=="notes")input.type=type;
    input.name=key;input.value=String(m[key]??"");if(required)input.required=true;
    if(key==="planFee"){input.min="0";input.step="0.01";}
    wrap.append(input);form.append(wrap);
  }
  const actions=document.createElement("div");actions.className="pgm-cloud-form-actions";
  const save=document.createElement("button");save.type="submit";save.textContent=id?"Save changes":"Add member";
  const cancel=document.createElement("button");cancel.type="button";cancel.className="cancel";cancel.textContent="Cancel";cancel.addEventListener("click",()=>form.remove());
  actions.append(save,cancel);form.append(actions);detail.append(form);
  form.addEventListener("submit",async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const values=Object.fromEntries(fields.filter(([key])=>key!=="planFee"||isOwner).map(([key])=>[key,form.elements.namedItem(key).value.trim()]));
    if(values.planFee==="")delete values.planFee;else values.planFee=Number(values.planFee);
    if(values.planFee!==undefined&&(!Number.isFinite(values.planFee)||values.planFee<0)){status.textContent="Plan fee must be a valid non-negative number.";return;}
    save.disabled=true;status.textContent=id?"Updating member…":"Adding member…";
    try{if(id)await updateMember(id,values);else await createMember(values);status.textContent="Cloud member saved.";await load();}
    catch(e){status.textContent="Save failed: "+(e?.message||"Error");save.disabled=false;}
  });
}
