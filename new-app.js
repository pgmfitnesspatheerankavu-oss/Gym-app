import { calculateBalanceDue } from "./balance-calculator.js";
import { STAFF_CAPABILITIES, STAFF_CAPABILITY_LABELS } from "./access-policy.js";
import { signIn, signOutUser, watchAuth, auth } from "./firebase-client.js";
import { uploadMemberPhoto } from "./supabase-storage.js";
import { previewCloudMigration, runOwnerMigration } from "./migration-runner.js";
import { listMembers, createMember, createMemberWithInitialPayment, updateMember, deleteMember, createPayment, deletePayment, deleteRenewal, listAllPayments, listAllRenewals, saveRenewalWithPayment, recordAttendance, listAttendanceForDate, createExpense, updateExpense, deleteExpense, listExpenses, listMyPayments, listMyRenewals, listStaffProfiles, saveStaffProfile, getGymSettings, saveGymSettings } from "./cloud-data.js";
const $=id=>document.getElementById(id), login=$("login"), app=$("app"), status=$("loginStatus");
let members=[], dashboardPayments=[], dashboardRenewals=[], currentRole="owner", currentPermissions=[], editingMemberId=null;
const hasPermission=cap=>currentRole==="owner"||currentPermissions.includes(cap);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const PLAN_PRICES={"1 Month":650,"3 Months":1600,"6 Months":2700,"12 Months":4700,"Couple / Duo - 3 Months":3000};
function isDuoPlan(plan){return String(plan||"").startsWith("Couple / Duo");}
function expiryForPlan(start,plan){if(!start||!PLAN_PRICES[plan])return "";const d=new Date(start+"T12:00:00");const day=d.getDate(),months=plan==="1 Month"?1:plan==="3 Months"||isDuoPlan(plan)?3:plan==="6 Months"?6:12;d.setDate(1);d.setMonth(d.getMonth()+months);const lastDay=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,lastDay));d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function updateMemberPlanFields(){const f=$("memberForm"),plan=f.elements.plan.value,price=PLAN_PRICES[plan];if(price!==undefined){const reg=isDuoPlan(plan)?800:500;f.elements.planFee.value=price;if(!f.elements.id.value&&!f.elements.registrationFee.dataset.manual)f.elements.registrationFee.value=reg;const start=f.elements.joinDate.value||today();if(!f.elements.expiryDate.dataset.manual)f.elements.expiryDate.value=expiryForPlan(start,plan);const registration=Number(f.elements.registrationFee.value||0);$("memberFeeSummary").textContent="Plan ₹"+price.toLocaleString("en-IN")+" + Registration ₹"+registration.toLocaleString("en-IN")+" = Total ₹"+(price+registration).toLocaleString("en-IN");
 if(!f.elements.id.value&&!f.elements.initialPaid.dataset.manual)f.elements.initialPaid.value=price+registration;}else{$("memberFeeSummary").textContent="Select a plan to view total fees.";}}

function showAuth(role,user){if(role?.allowed&&(role.role==="owner"||role.role==="staff")){currentRole=role.role;currentPermissions=role.permissions||[];login.hidden=true;app.hidden=false;$("logout").hidden=false;$("roleLabel").textContent=currentRole==="owner"?"OWNER DASHBOARD":"STAFF DASHBOARD";document.querySelectorAll(".owner-only").forEach(x=>x.hidden=currentRole!=="owner");$("memberForm").elements.planFee.readOnly=true;$("memberForm").elements.registrationFee.readOnly=false;$("renewalForm").elements.feeAmount.readOnly=true;const dueCard=$("dueMembers").closest("article");if(dueCard)dueCard.hidden=currentRole==="staff";document.querySelectorAll(".tab").forEach(x=>{const tab=x.dataset.tab,needed={members:"members.read",payments:"payments.read.own",renewals:"renewals.read.own",attendance:"attendance.read",expenses:"expenses.read",reports:"reports.read",staff:"staff.manage"}[tab];x.hidden=!(tab==="payments"?(hasPermission("payments.read.own")||hasPermission("payments.read.all")):tab==="renewals"?(hasPermission("renewals.read.own")||hasPermission("renewals.read.all")):tab==="reports"?(hasPermission("reports.read")&&hasPermission("payments.read.all")&&hasPermission("expenses.read")):hasPermission(needed));});status.textContent="";refresh();}else{login.hidden=false;app.hidden=true;$("logout").hidden=true;const dueCard=$("dueMembers").closest("article");if(dueCard)dueCard.hidden=false;if(user)status.textContent="ഈ അക്കൗണ്ടിന് പുതിയ App-ൽ പ്രവേശനാനുമതിയില്ല.";}}
watchAuth(showAuth);
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);status.textContent="Signing in…";try{const role=await signIn(f.get("email"),f.get("password"));if(!role.allowed)status.textContent="ഈ അക്കൗണ്ടിന് access ഇല്ല.";else showAuth(role,auth.currentUser);}catch(err){status.textContent=err.message||"Login failed";}});
$("logout").addEventListener("click",signOutUser);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.hidden=x.id!==b.dataset.tab);if(b.dataset.tab==="payments")loadPayments();if(b.dataset.tab==="renewals")loadRenewals();if(b.dataset.tab==="attendance")loadAttendance();if(b.dataset.tab==="expenses"&&hasPermission("expenses.read"))loadExpenses();if(b.dataset.tab==="reports"&&hasPermission("reports.read"))loadProfitLoss();if(b.dataset.tab==="staff"&&hasPermission("staff.manage"))loadStaff();}));
function money(n){return "₹"+(Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});}
function dateOffset(date,days){const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function dashboardTotals(payments,expenses){
 const d=today(),day=new Date(d+"T12:00:00"),monday=new Date(day);monday.setDate(day.getDate()-(day.getDay()+6)%7);
 const weekStart=[monday.getFullYear(),String(monday.getMonth()+1).padStart(2,"0"),String(monday.getDate()).padStart(2,"0")].join("-");
 const monthStart=d.slice(0,7)+"-01";
 const sum=(rows,from,to=d)=>rows.filter(x=>typeof x.date==="string"&&x.date>=from&&x.date<=to).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0);
 const collectionRows=[["collectionToday",d,d],["collectionWeek",weekStart,d],["collectionMonth",monthStart,d],["collectionTotal","0000-01-01","9999-12-31"]];
 const expenseRows=[["expenseToday",d,d],["expenseWeek",weekStart,d],["expenseMonth",monthStart,d],["expenseTotal","0000-01-01","9999-12-31"]];
 collectionRows.forEach(([id,from,to])=>$(id).textContent=payments?money(sum(payments,from,to)):"—");
 expenseRows.forEach(([id,from,to])=>$(id).textContent=expenses?money(sum(expenses,from,to)):"—");
}
function renderExpiring(){
 const box=$("expiringList"),d=today(),end=dateOffset(d,7);
 const rows=members.filter(m=>m.expiryDate&&m.expiryDate<=end).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
 box.replaceChildren();
 if(!rows.length){box.textContent="അടുത്ത 7 ദിവസത്തിനുള്ളിൽ expiry ഉള്ള അംഗങ്ങളില്ല.";return;}
 for(const m of rows)cardLine(box,m.name||"Member",(m.expiryDate<d?"Expired":"Expiry "+m.expiryDate)+(m.phone?" · "+m.phone:""));
}
async function refresh(){const box=$("memberList"),cloud=$("cloudStatus");box.textContent="Loading…";if(cloud)cloud.textContent="Cloud connection: loading…";try{members=await listMembers();}catch(e){box.textContent="Members cloud load failed: "+e.message;if(cloud)cloud.textContent="Members load failed. Check Firebase login and Firestore rules: "+e.message;return;}const tasks=[hasPermission("payments.read.all")?listAllPayments():hasPermission("payments.read.own")?listMyPayments():Promise.resolve([]),hasPermission("renewals.read.all")?listAllRenewals():hasPermission("renewals.read.own")?listMyRenewals():Promise.resolve([]),hasPermission("expenses.read")?listExpenses():Promise.resolve([])];const results=await Promise.allSettled(tasks);const pays=results[0].status==="fulfilled"?results[0].value:[];const renews=results[1].status==="fulfilled"?results[1].value:[];const expenses=hasPermission("expenses.read")&&results[2].status==="fulfilled"?results[2].value:[];dashboardPayments=pays;dashboardRenewals=renews;if(currentRole==="owner"){try{const settings=await getGymSettings();$("openingBalanceInput").value=Number(settings.openingBalance||0);$("openingBalanceStatus").textContent="Opening balance loaded.";}catch(err){$("openingBalanceStatus").textContent="Opening balance unavailable: "+err.message;}}const d=today();$("totalMembers").textContent=members.length;$("activeMembers").textContent=members.filter(m=>(m.status||"active")==="active"&&(!m.expiryDate||m.expiryDate>=d)).length;$("expiredMembers").textContent=members.filter(m=>m.expiryDate&&m.expiryDate<d).length;const transactionsReady=results[0].status==="fulfilled"&&results[1].status==="fulfilled";$("dueMembers").textContent=transactionsReady?money(members.reduce((sum,m)=>sum+calculateBalanceDue(m,pays,d),0)):"—";if(hasPermission("payments.read.all"))dashboardTotals(results[0].status==="fulfilled"?pays:null,hasPermission("expenses.read")&&results[2].status==="fulfilled"?expenses:null);else ["collectionToday","collectionWeek","collectionMonth","collectionTotal","expenseToday","expenseWeek","expenseMonth","expenseTotal"].forEach(id=>$(id).textContent="—");renderExpiring();render();populateMembers();const failures=results.map((x,i)=>x.status==="rejected"?((currentRole==="owner"?["Payments","Renewals","Expenses"]:["Your payments","Your renewals"])[i]+": "+x.reason.message):null).filter(Boolean);if(cloud)cloud.textContent=failures.length?"Some cloud data could not load — "+failures.join(" | "):"Cloud connected. Data loaded successfully."; }
let activeMemberFilter="live";
function memberExpiryState(m){const d=today(),expiry=m.expiryDate||"";if(expiry&&expiry<d)return "expired";if(expiry&&expiry>=d&&expiry<=dateOffset(d,3))return "soon";if((m.status||"active")!=="active")return "inactive";return "live";}
function updateMemberFilterCounts(){const counts={live:0,expired:0,soon:0,all:members.length};members.forEach(m=>{const s=memberExpiryState(m);if(s==="live")counts.live++;if(s==="expired")counts.expired++;if(s==="soon")counts.soon++;});$("liveCount").textContent=counts.live;$("expiredCount").textContent=counts.expired;$("soonCount").textContent=counts.soon;$("allCount").textContent=counts.all;}
function render(){const q=$("search").value.trim().toLowerCase(),box=$("memberList");box.replaceChildren();updateMemberFilterCounts();const rows=members.filter(m=>{const s=memberExpiryState(m),matches=activeMemberFilter==="all"||(activeMemberFilter==="expired"?s==="expired":activeMemberFilter==="soon"?s==="soon":s==="live");return matches&&((m.name||"").toLowerCase().includes(q)||(m.phone||"").includes(q)||String(m.memberNo||m.memberNumber||"").includes(q));}).sort((a,b)=>(a.name||"").localeCompare(b.name||""));if(!rows.length){box.textContent="ഈ വിഭാഗത്തിൽ അംഗങ്ങളില്ല.";return;}for(const m of rows){const card=document.createElement("article"),avatar=document.createElement("div"),info=document.createElement("div"),name=document.createElement("strong"),meta=document.createElement("p"),details=document.createElement("div"),actions=document.createElement("div"),state=memberExpiryState(m),due=calculateBalanceDue(m,dashboardPayments,today()),total=Number(m.planFee||0)+Number(m.registrationFee||0),paid=Math.max(0,total-due);card.className="member-card";avatar.className="member-avatar-large";if(m.photoURL){const photo=document.createElement("img");photo.src=m.photoURL;photo.alt="";avatar.append(photo);}else avatar.textContent=(m.name||"M").trim().slice(0,1).toUpperCase();name.textContent=m.name||"Unnamed";const id=m.memberNo||m.memberNumber||m.memberId||"";const badge=document.createElement("span");badge.className="member-status "+state;badge.textContent=state==="live"?"Live":state==="soon"?"Expiring soon":state==="expired"?"Expired":"Inactive";const heading=document.createElement("div");heading.className="member-heading";heading.append(name,badge);meta.textContent=[id?"ID: "+id:"",m.phone||""].filter(Boolean).join(" · ")||"Phone not added";info.className="member-main";info.append(heading,meta);details.className="member-details";const detailRows=[["Join Date",m.joinDate||"—"],["Expiry Date",m.expiryDate||"—"],["Plan",m.plan||"—"],["Total Fee",money(total)],["Paid",money(paid)],["Due",money(due)]];detailRows.forEach(([label,value])=>{const item=document.createElement("div"),k=document.createElement("span"),v=document.createElement("strong");item.className="member-detail";k.textContent=label;v.textContent=value;if(label==="Due"&&due>0)v.classList.add("due-value");item.append(k,v);details.append(item);});const top=document.createElement("div");top.className="member-card-top";top.append(avatar,info);const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>openForm(m));const pay=document.createElement("button");pay.textContent="Add Payment";pay.addEventListener("click",()=>{document.querySelector('[data-tab="payments"]').click();$("paymentMember").value=m.id;});const renew=document.createElement("button");renew.textContent="Renew";renew.addEventListener("click",()=>{document.querySelector('[data-tab="renewals"]').click();$("renewalMember").value=m.id;});actions.className="member-actions";actions.append(edit,pay,renew);if(currentRole==="owner"){const del=document.createElement("button");del.textContent="Delete";del.className="danger";del.addEventListener("click",async()=>{if(!confirm("ഈ അംഗത്തെ Delete ചെയ്യണോ? പഴയ Payment/Renewal രേഖകൾ വേറെയായി നിലനിൽക്കും."))return;del.disabled=true;try{await deleteMember(m.id);await refresh();}catch(err){alert("Delete failed: "+err.message);del.disabled=false;}});actions.append(del);}card.append(top,details,actions);box.append(card);}} 
document.querySelectorAll(".member-filter").forEach(b=>b.addEventListener("click",()=>{activeMemberFilter=b.dataset.filter;document.querySelectorAll(".member-filter").forEach(x=>x.classList.toggle("active",x===b));render();}));
$("search").addEventListener("input",render);
function openForm(m={}){const form=$("memberForm");form.reset();editingMemberId=m.id?String(m.id):null;form.elements.id.value=editingMemberId||"";for(const [k,v] of Object.entries(m))if(k!=="id"&&form.elements.namedItem(k))form.elements.namedItem(k).value=v??"";$("formTitle").textContent=m.id?"Edit Member":"Add Member";const preview=$("memberPhotoPreview");preview.src=m.photoURL||"";preview.hidden=!m.photoURL;form.elements.initialPaid.dataset.manual="";form.elements.registrationFee.dataset.manual="";form.elements.initialPaid.value="0";$("memberPhotoFile").value="";$("memberDialog").showModal();}
$("memberForm").elements.initialPaid.addEventListener("input",()=>{$("memberForm").elements.initialPaid.dataset.manual="1";});
$("memberForm").elements.registrationFee.addEventListener("input",()=>{$("memberForm").elements.registrationFee.dataset.manual="1";updateMemberPlanFields();});$("memberForm").elements.plan.addEventListener("change",()=>{$("memberForm").elements.registrationFee.dataset.manual="";updateMemberPlanFields();});$("memberForm").elements.joinDate.addEventListener("change",updateMemberPlanFields);$("addMember").addEventListener("click",()=>openForm());$("cancelForm").addEventListener("click",()=>$("memberDialog").close());
$("memberPhotoFile").addEventListener("change",e=>{const file=e.target.files[0],preview=$("memberPhotoPreview");if(!file){preview.hidden=true;preview.removeAttribute("src");return;}if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size===0||file.size>5*1024*1024){alert("JPG, PNG, WEBP ഫോട്ടോ മാത്രം; 5 MB-ൽ താഴെ തിരഞ്ഞെടുക്കുക.");e.target.value="";return;}preview.src=URL.createObjectURL(file);preview.hidden=false;});
$("memberForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const f=e.currentTarget,values=Object.fromEntries(new FormData(f));
 const id=editingMemberId,photoFile=$("memberPhotoFile").files[0];
 const paidNow=Number(values.initialPaid||0),paymentDate=values.joinDate||today(),payMode=values.initialPayMode||"Cash";
 delete values.id;delete values.initialPaid;delete values.initialPayMode;
 if(!values.joinDate)values.joinDate=today();
 if(!values.planStartDate)values.planStartDate=values.joinDate;
 const planPrice=PLAN_PRICES[values.plan];values.registrationFee=Number(values.registrationFee||0);
 if(planPrice===undefined){alert("Membership plan തിരഞ്ഞെടുക്കുക.");return;}
 if(!id){
  values.planFee=planPrice;
  values.registrationFee=Number(values.registrationFee||0);
  values.expiryDate=values.expiryDate||expiryForPlan(values.planStartDate,values.plan);
 }
 if(!Number.isFinite(values.registrationFee)||values.registrationFee<0||values.registrationFee>100000){alert("Registration fee ₹0 മുതൽ ₹1,00,000 വരെ നൽകാം.");return;}
 if(!Number.isFinite(paidNow)||paidNow<0||paidNow>planPrice+values.registrationFee){alert("Paid amount ശരിയല്ല. പരമാവധി "+money(planPrice+values.registrationFee)+".");return;}
 const saveButton=f.querySelector('button[type="submit"]');saveButton.disabled=true;saveButton.textContent="Saving…";
 try{
  let memberId=id;
  if(id){
   if(currentRole==="staff"){delete values.planFee;if(values.registrationFee!=="")values.registrationFee=Number(values.registrationFee);}
   else {if(values.planFee!=="")values.planFee=Number(values.planFee);if(values.registrationFee!=="")values.registrationFee=Number(values.registrationFee);}
   await updateMember(id,values);
  }else{
   const payment=paidNow>0?{amount:paidNow,date:paymentDate,payMode,type:"registration"}:null;
   const memberData={...values};
   // Staff may edit registration fee; plan fee remains Owner-controlled.
   if(currentRole==="staff"){delete memberData.planFee;}
   memberId=(await createMemberWithInitialPayment(memberData,payment)).id;
  }
  if(photoFile){
   try{
    const uploaded=await uploadMemberPhoto(memberId,photoFile);
    await updateMember(memberId,{photoURL:uploaded.url,photoPath:uploaded.path});
   }catch(photoErr){
    alert("അംഗത്തിന്റെ വിവരങ്ങൾ സേവ് ചെയ്തു. പക്ഷേ Photo upload ആയില്ല: "+photoErr.message);
   }
  }
  $("memberDialog").close();editingMemberId=null;f.reset();$("memberPhotoPreview").hidden=true;$("memberPhotoPreview").removeAttribute("src");await refresh();
 }catch(err){alert("Save failed: "+err.message);}
 finally{saveButton.disabled=false;saveButton.textContent="Save Member";}
});

$("syncLocalMembers").addEventListener("click",async()=>{
 if(currentRole!=="owner"){alert("Owner account മാത്രം ഈ sync നടത്താം.");return;}
 let legacy;
 try{legacy=JSON.parse(localStorage.getItem("pgm_fitness_data")||"null");}catch(e){alert("Local backup data വായിക്കാനായില്ല.");return;}
 if(!legacy||!Array.isArray(legacy.members)||!legacy.members.length){alert("ഈ browser-ൽ പഴയ local member records കണ്ടെത്തിയില്ല.");return;}
 const rows=legacy.members;
 if(!confirm(rows.length+" പഴയ local member record(s) പരിശോധിച്ച് Firestore-ൽ ഇല്ലാത്തവ മാത്രം ചേർക്കട്ടേ? ഒന്നും delete ചെയ്യില്ല."))return;
 const btn=$("syncLocalMembers"),oldText=btn.textContent;btn.disabled=true;btn.textContent="Syncing…";
 let linked=0,created=0,skipped=0;const errors=[];
 const keyOf=m=>String(m.name||"").trim().toLowerCase()+"|"+String(m.phone||"").replace(/[^0-9]/g,"");
 try{
  const cloud=await listMembers(),byKey=new Map();
  for(const m of cloud){const k=keyOf(m);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(m);}
  const usedIds=new Set();
  for(const m of rows){
   if(m.cloudMemberId){skipped++;continue;}
   if(!m.cloudSyncKey)m.cloudSyncKey="pgm-"+Date.now()+"-"+Math.random().toString(36).slice(2);
   const matches=byKey.get(keyOf(m))||[];
   if(matches.length===1&&!usedIds.has(matches[0].id)){
    m.cloudMemberId=matches[0].id;usedIds.add(matches[0].id);linked++;continue;
   }
   if(matches.length>0){skipped++;errors.push((m.name||"Member")+": duplicate cloud match; skipped safely");continue;}
   try{
    const joinDate=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(m.date||"")?m.date:today();
    const record={name:String(m.name||"").trim(),phone:String(m.phone||""),address:String(m.address||""),plan:String(m.plan||""),planFee:Number(m.totalFee||0),registrationFee:0,joinDate,planStartDate:joinDate,expiryDate:String(m.expiryDate||""),status:"active",notes:""};
    if(!record.name||!Number.isFinite(record.planFee)||record.planFee<0)throw new Error("Invalid member details");
    const paid=Number(m.amount||0),payment=paid>0?{amount:paid,feeAmount:record.planFee,date:joinDate,payMode:String(m.payMode||"Cash"),type:"registration",plan:record.plan,expiryDate:record.expiryDate}:null;
    const stableId="pgm_"+String(m.cloudSyncKey).replace(/[^a-zA-Z0-9_-]/g,"_");
    const result=await createMemberWithInitialPayment(record,payment,stableId);
    m.cloudMemberId=result.id;created++;
   }catch(err){errors.push((m.name||"Member")+": "+(err.message||"Firestore error"));}
  }
  localStorage.setItem("pgm_fitness_data",JSON.stringify(legacy));
  await refresh();
  alert("Sync complete. Linked: "+linked+", added: "+created+", skipped: "+skipped+(errors.length?" Details: "+errors.join("; "):""));
 }catch(err){alert("Sync failed: "+(err.message||"Firestore error"));}
 finally{btn.disabled=false;btn.textContent=oldText;}
});
function populateMembers(){for(const id of ["paymentMember","attendanceMember","renewalMember"]){const sel=$(id),current=sel.value;sel.replaceChildren();for(const m of members){const o=document.createElement("option");o.value=m.id;o.textContent=m.name+(m.phone?" · "+m.phone:"");sel.append(o);}if([...sel.options].some(o=>o.value===current))sel.value=current;}syncRenewalFee();}
function cardLine(parent,title,meta){const el=document.createElement("article"),a=document.createElement("strong"),b=document.createElement("p");a.textContent=title;b.textContent=meta;el.append(a,b);parent.append(el);}

$("renewalForm").elements.date.value=today();
function syncRenewalFee(){const form=$("renewalForm"),member=members.find(x=>x.id===form.elements.memberId.value),plan=form.elements.plan.value||member?.plan,price=PLAN_PRICES[plan];if(price!==undefined){form.elements.plan.value=plan;form.elements.feeAmount.value=price;}syncRenewalExpiry();}
function syncRenewalExpiry(){const form=$("renewalForm");form.elements.expiryDate.value=expiryForPlan(form.elements.date.value,form.elements.plan.value);}
$("renewalForm").elements.date.addEventListener("change",syncRenewalExpiry);
$("renewalForm").elements.plan.addEventListener("change",syncRenewalExpiry);
$("renewalMember").addEventListener("change",syncRenewalFee);$("renewalForm").elements.plan.addEventListener("change",syncRenewalFee);
$("renewalForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget;
 const f=new FormData(form),m=members.find(x=>x.id===f.get("memberId")),out=$("renewalStatus");
 if(!m)return;
 const feeAmount=Number(f.get("feeAmount")),amount=Number(f.get("amount"));
 if(!Number.isFinite(feeAmount)||feeAmount<=0||!Number.isFinite(amount)||amount<0||amount>feeAmount){out.textContent="ഫീസ് / അടച്ച തുക ശരിയല്ല.";return;}
 out.textContent="Saving renewal…";
 try{
  await saveRenewalWithPayment({memberId:m.id,
   renewal:{memberId:m.id,memberName:m.name,phone:m.phone||"",feeAmount,amount,date:f.get("date"),payMode:f.get("payMode"),type:"renewal",plan:f.get("plan"),expiryDate:f.get("expiryDate")},
   memberChanges:{plan:f.get("plan"),...(currentRole==="owner"?{planFee:feeAmount}:{}),...(currentRole==="owner"?{registrationFee:0}:{}),planStartDate:f.get("date"),expiryDate:f.get("expiryDate"),status:"active"},
   payment:amount>0?{memberId:m.id,memberName:m.name,phone:m.phone||"",amount,date:f.get("date"),payMode:f.get("payMode"),type:"renewal-payment"}:null
  });
  out.textContent="Renewal saved.";
  form.reset();form.elements.date.value=today();
  await refresh();await loadRenewals();
 }catch(err){out.textContent="Renewal save incomplete/failed: "+err.message+" — രേഖകൾ പരിശോധിച്ച് മാത്രം വീണ്ടും ശ്രമിക്കുക.";}
});
async function loadRenewals(){
 const box=$("renewalList");box.textContent="Loading…";
 try{const rows=currentRole==="owner"?await listAllRenewals():await listMyRenewals();box.replaceChildren();if(!rows.length)box.textContent="No renewals yet.";for(const r of rows){const card=document.createElement("article");const info=document.createElement("div");const title=document.createElement("strong");const meta=document.createElement("p");title.textContent=(r.memberName||"Member")+" — ₹"+Number(r.feeAmount||0).toFixed(2);meta.textContent=[r.date,r.plan,"Paid ₹"+Number(r.amount||0).toFixed(2),"Expiry "+(r.expiryDate||"")].filter(Boolean).join(" · ");info.append(title,meta);card.append(info);if(currentRole==="owner"){const del=document.createElement("button");del.textContent="Delete";del.className="danger";del.addEventListener("click",async()=>{if(!confirm("ഈ Renewal രേഖ മാത്രം Delete ചെയ്യണോ? ബന്ധപ്പെട്ട Payment രേഖ വേറെയായി നിലനിൽക്കും."))return;del.disabled=true;try{await deleteRenewal(r.id);await refresh();await loadRenewals();}catch(err){alert("Delete failed: "+err.message);del.disabled=false;}});card.append(del);}box.append(card);}}
 catch(e){box.textContent="Renewals unavailable: "+e.message;}
}
$("paymentForm").elements.date.value=today();
$("paymentForm").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form),m=members.find(x=>x.id===f.get("memberId"));if(!m)return;const out=$("paymentStatus");out.textContent="Saving…";try{await createPayment({memberId:m.id,memberName:m.name,phone:m.phone||"",amount:Number(f.get("amount")),date:f.get("date"),payMode:f.get("payMode"),type:"payment"});out.textContent="Payment saved.";form.reset();form.elements.date.value=today();await refresh();await loadPayments();}catch(err){out.textContent="Payment failed: "+err.message;}});
function paymentTypeLabel(type){return ({registration:"New Member Fee", "renewal-payment":"Renewal Payment",payment:"Other Payment"})[type]||type||"Payment";}
async function loadPayments(){const box=$("paymentList");box.textContent="Loading…";try{const rows=currentRole==="owner"?await listAllPayments():await listMyPayments();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No payments yet.";for(const p of rows){const card=document.createElement("article");const info=document.createElement("div");const title=document.createElement("strong");const meta=document.createElement("p");title.textContent=(p.memberName||"Member")+" — ₹"+Number(p.amount||0).toFixed(2);meta.textContent=[paymentTypeLabel(p.type),p.date,p.payMode].filter(Boolean).join(" · ");info.append(title,meta);card.append(info);if(currentRole==="owner"){const del=document.createElement("button");del.textContent="Delete";del.className="danger";del.addEventListener("click",async()=>{if(!confirm("ഈ Payment രേഖ Delete ചെയ്യണോ?"))return;del.disabled=true;try{await deletePayment(p.id);await refresh();await loadPayments();}catch(err){alert("Delete failed: "+err.message);del.disabled=false;}});card.append(del);}box.append(card);}}catch(e){box.textContent="Payments unavailable: "+e.message;}}
$("attendanceDate").value=today();
$("attendanceDate").addEventListener("change",loadAttendance);
$("attendanceForm").addEventListener("submit",async e=>{e.preventDefault();const id=new FormData(e.currentTarget).get("memberId"),m=members.find(x=>x.id===id);if(!m)return;const out=$("attendanceStatus");out.textContent="Saving…";try{const existing=await listAttendanceForDate($("attendanceDate").value);if(existing.some(a=>a.memberId===m.id)){out.textContent="ഈ അംഗത്തിന് ഇന്നത്തെ Attendance ഇതിനകം രേഖപ്പെടുത്തിയിട്ടുണ്ട്.";return;}await recordAttendance({date:$("attendanceDate").value,memberId:m.id,memberName:m.name,phone:m.phone||"",time:new Date().toTimeString().slice(0,5)});out.textContent="Attendance marked.";await loadAttendance();}catch(err){out.textContent="Attendance failed: "+err.message;}});
async function loadAttendance(){const box=$("attendanceList");box.textContent="Loading…";try{const rows=await listAttendanceForDate($("attendanceDate").value);box.replaceChildren();if(!rows.length)box.textContent="No attendance for this date.";for(const a of rows)cardLine(box,a.memberName||a.phone||a.memberId,a.date+" · "+(a.time||""));}catch(e){box.textContent="Attendance unavailable: "+e.message;}}
$("expenseForm").elements.date.value=today();
$("expenseForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),out=$("expenseStatus");out.textContent="Saving…";try{await createExpense({title:f.get("title"),amount:Number(f.get("amount")),date:f.get("date"),notes:f.get("notes")});out.textContent="Expense saved.";e.currentTarget.reset();e.currentTarget.elements.date.value=today();await refresh();await loadExpenses();}catch(err){out.textContent="Expense failed: "+err.message;}});
function openExpenseEdit(x){const f=$("expenseEditForm");f.reset();f.elements.id.value=x.id;f.elements.title.value=x.title||"";f.elements.amount.value=Number(x.amount||0);f.elements.date.value=x.date||today();f.elements.notes.value=x.notes||"";$("expenseDialog").showModal();}
$("cancelExpenseEdit").addEventListener("click",()=>$("expenseDialog").close());
$("expenseEditForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f),out=$("expenseStatus"),btn=f.querySelector('button[type="submit"]');btn.disabled=true;try{await updateExpense(v.get("id"),{title:v.get("title"),amount:Number(v.get("amount")),date:v.get("date"),notes:v.get("notes")});$("expenseDialog").close();out.textContent="Expense updated.";await refresh();await loadExpenses();}catch(err){out.textContent="Expense update failed: "+err.message;}finally{btn.disabled=false;}});
async function loadExpenses(){const box=$("expenseList");box.textContent="Loading…";try{const rows=await listExpenses();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No expenses yet.";for(const x of rows){const card=document.createElement("article"),info=document.createElement("div"),title=document.createElement("strong"),meta=document.createElement("p"),actions=document.createElement("div");title.textContent=x.title||"Expense";meta.textContent="₹"+Number(x.amount||0).toFixed(2)+" · "+x.date+(x.notes?" · "+x.notes:"");info.append(title,meta);actions.className="member-actions";const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>openExpenseEdit(x));const del=document.createElement("button");del.textContent="Delete";del.className="danger";del.addEventListener("click",async()=>{if(!confirm("ഈ Expense രേഖ Delete ചെയ്യണോ?"))return;del.disabled=true;try{await deleteExpense(x.id);await refresh();await loadExpenses();}catch(err){alert("Delete failed: "+err.message);del.disabled=false;}});actions.append(edit,del);card.append(info,actions);box.append(card);}}catch(e){box.textContent="Expenses unavailable: "+e.message;}}

$("reportFrom").value=today().slice(0,7)+"-01";
$("reportTo").value=today();
$("runReport").addEventListener("click",loadProfitLoss);
async function loadProfitLoss(){
 const out=$("reportStatus"),from=$("reportFrom").value,to=$("reportTo").value;
 if(!from||!to||from>to){out.textContent="ദയവായി ശരിയായ തീയതി പരിധി തിരഞ്ഞെടുക്കുക.";return;}
 out.textContent="Report loading…";
 try{
  const [payments,expenses,settings]=await Promise.all([listAllPayments(),listExpenses(),getGymSettings()]);
  const inRange=x=>typeof x.date==="string"&&x.date>=from&&x.date<=to;
  const income=payments.filter(inRange).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
  const cost=expenses.filter(inRange).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
  $("reportIncome").textContent="₹"+income.toFixed(2);
  $("reportExpenses").textContent="₹"+cost.toFixed(2);
  $("reportNet").textContent=(income-cost<0?"-₹":"₹")+Math.abs(income-cost).toFixed(2);
  const opening=Number(settings.openingBalance||0);$("reportOpening").textContent="₹"+opening.toFixed(2);$("reportCashBalance").textContent=(opening+income-cost<0?"-₹":"₹")+Math.abs(opening+income-cost).toFixed(2);
  out.textContent="കാലയളവ്: "+from+" മുതൽ "+to+" വരെ · "+payments.filter(inRange).length+" payment records · "+expenses.filter(inRange).length+" expense records.";
 }catch(err){out.textContent="P&L report ലഭ്യമല്ല: "+err.message;}
}

// Owner-only staff administration: Firebase Auth user must exist before profile activation.
$("staffForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),out=$("staffStatus");out.textContent="Saving staff access…";try{await saveStaffProfile({uid:f.get("uid"),displayName:f.get("displayName"),active:true});out.textContent="Staff access enabled.";e.currentTarget.reset();await loadStaff();}catch(err){out.textContent="Staff access failed: "+err.message;}});
async function loadStaff(){const box=$("staffList"),out=$("staffStatus");box.textContent="Loading…";try{const rows=await listStaffProfiles();box.replaceChildren();if(!rows.length){box.textContent="No staff profiles yet.";return;}for(const staff of rows){const card=document.createElement("article"),name=document.createElement("strong"),meta=document.createElement("p"),toggle=document.createElement("button"),permissionBox=document.createElement("div"),save=document.createElement("button");name.textContent=staff.displayName||"Staff";meta.textContent=staff.uid+" · "+(staff.active?"Active":"Inactive");toggle.textContent=staff.active?"Deactivate":"Activate";toggle.addEventListener("click",async()=>{toggle.disabled=true;try{await saveStaffProfile({uid:staff.uid,displayName:staff.displayName||"Staff",active:!staff.active,permissions:staff.permissions});await loadStaff();}catch(err){out.textContent=err.message;toggle.disabled=false;}});permissionBox.className="staff-permissions";const selected=new Set(Array.isArray(staff.permissions)?staff.permissions:["members.read","members.create","members.update","payments.read.own","payments.create","renewals.read.own","renewals.create","attendance.read","attendance.create"]);for(const capability of STAFF_CAPABILITIES){const label=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.value=capability;input.checked=selected.has(capability);label.append(input,document.createTextNode(" "+STAFF_CAPABILITY_LABELS[capability]));permissionBox.append(label);}save.textContent="Save permissions";save.addEventListener("click",async()=>{save.disabled=true;const permissions=[...permissionBox.querySelectorAll('input:checked')].map(x=>x.value);try{await saveStaffProfile({uid:staff.uid,displayName:staff.displayName||"Staff",active:staff.active!==false,permissions});out.textContent="Permissions saved for "+(staff.displayName||"Staff")+". Changes apply on next login/refresh.";await loadStaff();}catch(err){out.textContent="Permission save failed: "+err.message;save.disabled=false;}});card.append(name,meta,toggle,permissionBox,save);box.append(card);}}catch(err){box.textContent="Staff list unavailable: "+err.message;}}



$("openingBalanceForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(currentRole!=="owner"){ $("openingBalanceStatus").textContent="Owner account മാത്രം."; return; }
 const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
 button.disabled=true;$("openingBalanceStatus").textContent="Saving…";
 try{const result=await saveGymSettings({openingBalance:form.elements.openingBalance.value});$("openingBalanceStatus").textContent="Opening balance saved: ₹"+Number(result.openingBalance).toFixed(2);}
 catch(err){$("openingBalanceStatus").textContent="Save failed: "+err.message;}
 finally{button.disabled=false;}
});

// Owner-only full legacy backup export and collision-safe Firestore migration.
let pendingMigrationData = null;
function unwrapLegacyBackup(value) {
 const parsed = typeof value === "string" ? JSON.parse(value) : value;
 if (parsed && parsed.app !== undefined) {
  if (parsed.app !== "PGM FITNESS" || parsed.backupVersion !== 1 || !parsed.data) {
   throw new Error("Unsupported PGM FITNESS backup format.");
  }
  return parsed.data;
 }
 return parsed;
}
function showMigrationPreview(raw) {
 const preview = previewCloudMigration(raw);
 pendingMigrationData = raw;
 const v = preview.verification;
 const counts = Object.entries(v.collectionCounts).map(([name,count])=>name+": "+count).join("\\n");
 const warnings = preview.plan.warnings.length ? "\\nWarnings:\\n- "+preview.plan.warnings.join("\\n- ") : "\\nWarnings: none";
 $("migrationPreview").textContent =
  "Records to import: "+v.operationCount+"\\n"+counts+
  "\\nPayments total: ₹"+v.paymentLedgerTotal.toFixed(2)+
  "\\nExpenses total: ₹"+v.expenseTotal.toFixed(2)+
  "\\nRenewal paid amount (informational; not added to income): ₹"+v.renewalPaidAmountInformationalOnly.toFixed(2)+warnings;
 $("runMigration").disabled = false;
 $("migrationStatus").textContent = "Preview complete. Source data remains unchanged.";
}
$("exportLocalBackup").addEventListener("click",()=>{
 if(currentRole!=="owner"){alert("Owner account മാത്രം.");return;}
 const raw=localStorage.getItem("pgm_fitness_data");
 if(!raw){$("migrationStatus").textContent="ഈ browser-ൽ പഴയ local backup കണ്ടെത്തിയില്ല. പഴയ app-ൽ നിന്ന് backup JSON export ചെയ്ത് ഇവിടെ select ചെയ്യുക.";return;}
 try{
  const data=unwrapLegacyBackup(raw);
  const envelope={app:"PGM FITNESS",backupVersion:1,exportedAt:new Date().toISOString(),data};
  const blob=new Blob([JSON.stringify(envelope,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="pgm-fitness-backup-"+today()+".json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("migrationStatus").textContent="Backup exported. Keep this file safely before migration.";
 }catch(err){$("migrationStatus").textContent="Backup export failed: "+err.message;}
});
$("loadLocalBackup").addEventListener("click",()=>{
 if(currentRole!=="owner"){alert("Owner account മാത്രം.");return;}
 const raw=localStorage.getItem("pgm_fitness_data");
 if(!raw){$("migrationStatus").textContent="ഈ browser-ൽ pgm_fitness_data കണ്ടെത്തിയില്ല. പഴയ app-ൽ നിന്ന് JSON backup export ചെയ്യുക.";return;}
 try{showMigrationPreview(unwrapLegacyBackup(raw));}
 catch(err){$("migrationStatus").textContent="Local backup preview failed: "+err.message;}
});
$("previewMigration").addEventListener("click",async()=>{
 if(currentRole!=="owner"){alert("Owner account മാത്രം.");return;}
 const file=$("migrationFile").files[0];
 if(!file){$("migrationStatus").textContent="ആദ്യം backup JSON file തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ ഈ device-ലെ പഴയ data load ചെയ്യുക.";return;}
 $("migrationStatus").textContent="Reading backup…";
 try{showMigrationPreview(unwrapLegacyBackup(await file.text()));}
 catch(err){pendingMigrationData=null;$("runMigration").disabled=true;$("migrationPreview").textContent="Preview failed: "+err.message;$("migrationStatus").textContent="Backup പരിശോധിക്കാൻ കഴിഞ്ഞില്ല.";}
});
$("migrationFile").addEventListener("change",()=>{
 pendingMigrationData=null;$("runMigration").disabled=true;$("migrationPreview").textContent="New backup selected. Preview it before importing.";
});
$("runMigration").addEventListener("click",async()=>{
 if(currentRole!=="owner"||!pendingMigrationData){$("migrationStatus").textContent="Owner login-ൽ backup preview ചെയ്യുക.";return;}
 if($("migrationConfirm").value.trim()!=="MIGRATE PGM FITNESS"){$("migrationStatus").textContent="Confirmation text ശരിയല്ല.";return;}
 if(!confirm("Preview-ൽ കാണിച്ച രേഖകൾ മാത്രം Cloud-ലേക്ക് ചേർക്കട്ടേ? പഴയ local data delete ചെയ്യില്ല."))return;
 const button=$("runMigration");button.disabled=true;$("migrationStatus").textContent="Importing and verifying…";
 try{
  const result=await runOwnerMigration(pendingMigrationData,$("migrationConfirm").value.trim());
  $("migrationStatus").textContent="Migration verified. Written: "+result.written+", already imported: "+result.alreadyMigrated+". Local data preserved: "+result.localDataPreserved+". Cloud overwrite: "+result.overwroteExistingCloudData+".";
  await refresh();
 }catch(err){$("migrationStatus").textContent="Migration stopped safely: "+(err.message||"Unknown error");button.disabled=false;}
});
