import { calculateBalanceDue } from "./balance-calculator.js";
import { signIn, signOutUser, watchAuth, auth } from "./firebase-client.js";
import { listMembers, createMember, updateMember, createPayment, listAllPayments, listAllRenewals, saveRenewalWithPayment, recordAttendance, listAttendanceForDate, createExpense, listExpenses, listMyPayments, listMyRenewals, listStaffProfiles, saveStaffProfile } from "./cloud-data.js";
const $=id=>document.getElementById(id), login=$("login"), app=$("app"), status=$("loginStatus");
let members=[], dashboardPayments=[], dashboardRenewals=[], currentRole="owner";
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const PLAN_PRICES={"1 Month":650,"3 Months":1600,"6 Months":2700,"12 Months":4700,"Couple / Duo - 3 Months":3000};
function isDuoPlan(plan){return String(plan||"").startsWith("Couple / Duo");}
function expiryForPlan(start,plan){if(!start||!PLAN_PRICES[plan])return "";const d=new Date(start+"T12:00:00");const months=plan==="1 Month"?1:plan==="3 Months"||isDuoPlan(plan)?3:plan==="6 Months"?6:12;d.setMonth(d.getMonth()+months);d.setDate(d.getDate()-1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function updateMemberPlanFields(){const f=$("memberForm"),plan=f.elements.plan.value,price=PLAN_PRICES[plan];if(price!==undefined){const reg=isDuoPlan(plan)?800:500;f.elements.planFee.value=price;f.elements.registrationFee.value=reg;const start=f.elements.joinDate.value||today();if(!f.elements.expiryDate.dataset.manual)f.elements.expiryDate.value=expiryForPlan(start,plan);$("memberFeeSummary").textContent="Plan ₹"+price.toLocaleString("en-IN")+" + Registration ₹"+reg.toLocaleString("en-IN")+" = Total ₹"+(price+reg).toLocaleString("en-IN");}else{$("memberFeeSummary").textContent="Select a plan to view total fees.";}}

function showAuth(role,user){if(role?.allowed&&(role.role==="owner"||role.role==="staff")){currentRole=role.role;login.hidden=true;app.hidden=false;$("logout").hidden=false;$("roleLabel").textContent=currentRole==="owner"?"OWNER DASHBOARD":"STAFF DASHBOARD";document.querySelectorAll(".owner-only").forEach(x=>x.hidden=currentRole!=="owner");const feeLabel=document.querySelector('#memberForm [name="planFee"]')?.closest("label");if(feeLabel)feeLabel.hidden=currentRole==="staff";$("renewalForm").elements.feeAmount.readOnly=currentRole==="staff";const dueCard=$("dueMembers").closest("article");if(dueCard)dueCard.hidden=currentRole==="staff";document.querySelectorAll(".tab").forEach(x=>x.hidden=currentRole==="staff"&&["reports","staff","expenses"].includes(x.dataset.tab));status.textContent="";refresh();}else{login.hidden=false;app.hidden=true;$("logout").hidden=true;const dueCard=$("dueMembers").closest("article");if(dueCard)dueCard.hidden=false;if(user)status.textContent="ഈ അക്കൗണ്ടിന് പുതിയ App-ൽ പ്രവേശനാനുമതിയില്ല.";}}
watchAuth(showAuth);
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);status.textContent="Signing in…";try{const role=await signIn(f.get("email"),f.get("password"));if(!role.allowed)status.textContent="ഈ അക്കൗണ്ടിന് access ഇല്ല.";else showAuth(role,auth.currentUser);}catch(err){status.textContent=err.message||"Login failed";}});
$("logout").addEventListener("click",signOutUser);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.hidden=x.id!==b.dataset.tab);if(b.dataset.tab==="payments")loadPayments();if(b.dataset.tab==="renewals")loadRenewals();if(b.dataset.tab==="attendance")loadAttendance();if(b.dataset.tab==="expenses"&&currentRole==="owner")loadExpenses();if(b.dataset.tab==="reports"&&currentRole==="owner")loadProfitLoss();if(b.dataset.tab==="staff"&&currentRole==="owner")loadStaff();}));
function money(n){return "₹"+(Number(n)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});}
function dateOffset(date,days){const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function dashboardTotals(payments,expenses){
 const d=today(),day=new Date(d+"T12:00:00"),monday=new Date(day);monday.setDate(day.getDate()-(day.getDay()+6)%7);
 const weekStart=[monday.getFullYear(),String(monday.getMonth()+1).padStart(2,"0"),String(monday.getDate()).padStart(2,"0")].join("-");
 const monthStart=d.slice(0,7)+"-01";
 const sum=(rows,from,to=d)=>rows.filter(x=>typeof x.date==="string"&&x.date>=from&&x.date<=to).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0);
 [["collectionToday",sum(payments,d)],["collectionWeek",sum(payments,weekStart)],["collectionMonth",sum(payments,monthStart)],["collectionTotal",sum(payments,"0000-01-01","9999-12-31")],["expenseToday",sum(expenses,d)],["expenseWeek",sum(expenses,weekStart)],["expenseMonth",sum(expenses,monthStart)],["expenseTotal",sum(expenses,"0000-01-01","9999-12-31")]].forEach(([id,value])=>$(id).textContent=money(value));
}
function renderExpiring(){
 const box=$("expiringList"),d=today(),end=dateOffset(d,7);
 const rows=members.filter(m=>m.expiryDate&&m.expiryDate<=end).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
 box.replaceChildren();
 if(!rows.length){box.textContent="അടുത്ത 7 ദിവസത്തിനുള്ളിൽ expiry ഉള്ള അംഗങ്ങളില്ല.";return;}
 for(const m of rows)cardLine(box,m.name||"Member",(m.expiryDate<d?"Expired":"Expiry "+m.expiryDate)+(m.phone?" · "+m.phone:""));
}
async function refresh(){const box=$("memberList"),cloud=$("cloudStatus");box.textContent="Loading…";if(cloud)cloud.textContent="Cloud connection: loading…";try{members=await listMembers();}catch(e){box.textContent="Members cloud load failed: "+e.message;if(cloud)cloud.textContent="Members load failed. Check Firebase login and Firestore rules: "+e.message;return;}const tasks=currentRole==="owner"?[listAllPayments(),listAllRenewals(),listExpenses()]:[listMyPayments(),listMyRenewals()];const results=await Promise.allSettled(tasks);const pays=results[0].status==="fulfilled"?results[0].value:[];const renews=results[1].status==="fulfilled"?results[1].value:[];const expenses=currentRole==="owner"&&results[2].status==="fulfilled"?results[2].value:[];dashboardPayments=pays;dashboardRenewals=renews;const d=today();$("totalMembers").textContent=members.length;$("activeMembers").textContent=members.filter(m=>(m.status||"active")==="active"&&(!m.expiryDate||m.expiryDate>=d)).length;$("expiredMembers").textContent=members.filter(m=>m.expiryDate&&m.expiryDate<d).length;const transactionsReady=results[0].status==="fulfilled"&&results[1].status==="fulfilled";$("dueMembers").textContent=transactionsReady?money(members.reduce((sum,m)=>sum+calculateBalanceDue(m,pays,renews,d),0)):"—";if(currentRole==="owner"&&results.every(x=>x.status==="fulfilled"))dashboardTotals(pays,expenses);else ["collectionToday","collectionWeek","collectionMonth","collectionTotal","expenseToday","expenseWeek","expenseMonth","expenseTotal"].forEach(id=>$(id).textContent="—");renderExpiring();render();populateMembers();const failures=results.map((x,i)=>x.status==="rejected"?((currentRole==="owner"?["Payments","Renewals","Expenses"]:["Your payments","Your renewals"])[i]+": "+x.reason.message):null).filter(Boolean);if(cloud)cloud.textContent=failures.length?"Some cloud data could not load — "+failures.join(" | "):"Cloud connected. Data loaded successfully."; }
function render(){const q=$("search").value.trim().toLowerCase(),box=$("memberList");box.replaceChildren();const rows=members.filter(m=>(m.name||"").toLowerCase().includes(q)||(m.phone||"").includes(q));if(!rows.length){box.textContent="No members yet. Add your first member.";return;}for(const m of rows){const card=document.createElement("article"),info=document.createElement("div"),name=document.createElement("strong"),meta=document.createElement("p"),actions=document.createElement("div");name.textContent=m.name||"Unnamed";meta.textContent=[m.phone,m.plan,m.expiryDate?"Expiry: "+m.expiryDate:""].filter(Boolean).join(" · ");info.append(name,meta);actions.className="member-actions";const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>openForm(m));actions.append(edit);card.append(info,actions);box.append(card);}}
$("search").addEventListener("input",render);
function openForm(m={}){const form=$("memberForm");form.reset();for(const [k,v] of Object.entries(m))if(form.elements.namedItem(k))form.elements.namedItem(k).value=v??"";$("formTitle").textContent=m.id?"Edit Member":"Add Member";$("memberDialog").showModal();}
$("addMember").addEventListener("click",()=>openForm());$("cancelForm").addEventListener("click",()=>$("memberDialog").close());
$("memberForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,values=Object.fromEntries(new FormData(f));const id=values.id;delete values.id;if(currentRole==="staff")delete values.planFee;else values.planFee=values.planFee===""?undefined:Number(values.planFee);if(!id&&!values.planStartDate)values.planStartDate=values.joinDate||today();try{if(id)await updateMember(id,values);else await createMember(values);$("memberDialog").close();await refresh();}catch(err){alert("Save failed: "+err.message);}});
function populateMembers(){for(const id of ["paymentMember","attendanceMember","renewalMember"]){const sel=$(id),current=sel.value;sel.replaceChildren();for(const m of members){const o=document.createElement("option");o.value=m.id;o.textContent=m.name+(m.phone?" · "+m.phone:"");sel.append(o);}if([...sel.options].some(o=>o.value===current))sel.value=current;}syncRenewalFee();}
function cardLine(parent,title,meta){const el=document.createElement("article"),a=document.createElement("strong"),b=document.createElement("p");a.textContent=title;b.textContent=meta;el.append(a,b);parent.append(el);}

$("renewalForm").elements.date.value=today();
function syncRenewalFee(){const member=members.find(x=>x.id===$("renewalMember").value);if(member&&currentRole==="staff")$("renewalForm").elements.feeAmount.value=Number(member.planFee||0);}
$("renewalMember").addEventListener("change",syncRenewalFee);
$("renewalForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const f=new FormData(e.currentTarget),m=members.find(x=>x.id===f.get("memberId")),out=$("renewalStatus");
 if(!m)return;
 const feeAmount=Number(f.get("feeAmount")),amount=Number(f.get("amount"));
 if(!Number.isFinite(feeAmount)||feeAmount<=0||!Number.isFinite(amount)||amount<0||amount>feeAmount){out.textContent="ഫീസ് / അടച്ച തുക ശരിയല്ല.";return;}
 out.textContent="Saving renewal…";
 try{
  await saveRenewalWithPayment({memberId:m.id,
   renewal:{memberId:m.id,memberName:m.name,phone:m.phone||"",feeAmount,amount,date:f.get("date"),payMode:f.get("payMode"),type:"renewal",plan:f.get("plan"),expiryDate:f.get("expiryDate")},
   memberChanges:{plan:f.get("plan"),...(currentRole==="owner"?{planFee:feeAmount}:{}),planStartDate:f.get("date"),expiryDate:f.get("expiryDate"),status:"active"},
   payment:amount>0?{memberId:m.id,memberName:m.name,phone:m.phone||"",amount,date:f.get("date"),payMode:f.get("payMode"),type:"renewal-payment"}:null
  });
  out.textContent="Renewal saved.";
  e.currentTarget.reset();e.currentTarget.elements.date.value=today();
  await refresh();await loadRenewals();
 }catch(err){out.textContent="Renewal save incomplete/failed: "+err.message+" — രേഖകൾ പരിശോധിച്ച് മാത്രം വീണ്ടും ശ്രമിക്കുക.";}
});
async function loadRenewals(){
 const box=$("renewalList");box.textContent="Loading…";
 try{const rows=currentRole==="owner"?await listAllRenewals():await listMyRenewals();box.replaceChildren();if(!rows.length)box.textContent="No renewals yet.";for(const r of rows)cardLine(box,(r.memberName||"Member")+" — ₹"+Number(r.feeAmount||0).toFixed(2),[r.date,r.plan,"Paid ₹"+Number(r.amount||0).toFixed(2),"Expiry "+(r.expiryDate||"")].filter(Boolean).join(" · "));}
 catch(e){box.textContent="Renewals unavailable: "+e.message;}
}
$("paymentForm").elements.date.value=today();
$("paymentForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),m=members.find(x=>x.id===f.get("memberId"));if(!m)return;const out=$("paymentStatus");out.textContent="Saving…";try{await createPayment({memberId:m.id,memberName:m.name,phone:m.phone||"",amount:Number(f.get("amount")),date:f.get("date"),payMode:f.get("payMode"),type:"payment"});out.textContent="Payment saved.";e.currentTarget.reset();e.currentTarget.elements.date.value=today();await refresh();await loadPayments();}catch(err){out.textContent="Payment failed: "+err.message;}});
async function loadPayments(){const box=$("paymentList");box.textContent="Loading…";try{const rows=currentRole==="owner"?await listAllPayments():await listMyPayments();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No payments yet.";for(const p of rows)cardLine(box,(p.memberName||"Member")+" — ₹"+Number(p.amount||0).toFixed(2),[p.date,p.payMode,p.type].filter(Boolean).join(" · "));}catch(e){box.textContent="Payments unavailable: "+e.message;}}
$("attendanceDate").value=today();
$("attendanceDate").addEventListener("change",loadAttendance);
$("attendanceForm").addEventListener("submit",async e=>{e.preventDefault();const id=new FormData(e.currentTarget).get("memberId"),m=members.find(x=>x.id===id);if(!m)return;const out=$("attendanceStatus");out.textContent="Saving…";try{const existing=await listAttendanceForDate($("attendanceDate").value);if(existing.some(a=>a.memberId===m.id)){out.textContent="ഈ അംഗത്തിന് ഇന്നത്തെ Attendance ഇതിനകം രേഖപ്പെടുത്തിയിട്ടുണ്ട്.";return;}await recordAttendance({date:$("attendanceDate").value,memberId:m.id,memberName:m.name,phone:m.phone||"",time:new Date().toTimeString().slice(0,5)});out.textContent="Attendance marked.";await loadAttendance();}catch(err){out.textContent="Attendance failed: "+err.message;}});
async function loadAttendance(){const box=$("attendanceList");box.textContent="Loading…";try{const rows=await listAttendanceForDate($("attendanceDate").value);box.replaceChildren();if(!rows.length)box.textContent="No attendance for this date.";for(const a of rows)cardLine(box,a.memberName||a.phone||a.memberId,a.date+" · "+(a.time||""));}catch(e){box.textContent="Attendance unavailable: "+e.message;}}
$("expenseForm").elements.date.value=today();
$("expenseForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),out=$("expenseStatus");out.textContent="Saving…";try{await createExpense({title:f.get("title"),amount:Number(f.get("amount")),date:f.get("date"),notes:f.get("notes")});out.textContent="Expense saved.";e.currentTarget.reset();e.currentTarget.elements.date.value=today();await loadExpenses();}catch(err){out.textContent="Expense failed: "+err.message;}});
async function loadExpenses(){const box=$("expenseList");box.textContent="Loading…";try{const rows=await listExpenses();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No expenses yet.";for(const x of rows)cardLine(box,x.title||"Expense","₹"+Number(x.amount||0).toFixed(2)+" · "+x.date);}catch(e){box.textContent="Expenses unavailable: "+e.message;}}

$("reportFrom").value=today().slice(0,7)+"-01";
$("reportTo").value=today();
$("runReport").addEventListener("click",loadProfitLoss);
async function loadProfitLoss(){
 const out=$("reportStatus"),from=$("reportFrom").value,to=$("reportTo").value;
 if(!from||!to||from>to){out.textContent="ദയവായി ശരിയായ തീയതി പരിധി തിരഞ്ഞെടുക്കുക.";return;}
 out.textContent="Report loading…";
 try{
  const [payments,expenses]=await Promise.all([listAllPayments(),listExpenses()]);
  const inRange=x=>typeof x.date==="string"&&x.date>=from&&x.date<=to;
  const income=payments.filter(inRange).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
  const cost=expenses.filter(inRange).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
  $("reportIncome").textContent="₹"+income.toFixed(2);
  $("reportExpenses").textContent="₹"+cost.toFixed(2);
  $("reportNet").textContent=(income-cost<0?"-₹":"₹")+Math.abs(income-cost).toFixed(2);
  out.textContent="കാലയളവ്: "+from+" മുതൽ "+to+" വരെ · "+payments.filter(inRange).length+" payment records · "+expenses.filter(inRange).length+" expense records.";
 }catch(err){out.textContent="P&L report ലഭ്യമല്ല: "+err.message;}
}

// Owner-only staff administration: Firebase Auth user must exist before profile activation.
$("staffForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),out=$("staffStatus");out.textContent="Saving staff access…";try{await saveStaffProfile({uid:f.get("uid"),displayName:f.get("displayName"),active:true});out.textContent="Staff access enabled.";e.currentTarget.reset();await loadStaff();}catch(err){out.textContent="Staff access failed: "+err.message;}});
async function loadStaff(){const box=$("staffList"),out=$("staffStatus");box.textContent="Loading…";try{const rows=await listStaffProfiles();box.replaceChildren();if(!rows.length){box.textContent="No staff profiles yet.";return;}for(const staff of rows){const card=document.createElement("article"),name=document.createElement("strong"),meta=document.createElement("p"),toggle=document.createElement("button");name.textContent=staff.displayName||"Staff";meta.textContent=staff.uid+" · "+(staff.active?"Active":"Inactive");toggle.textContent=staff.active?"Deactivate":"Activate";toggle.addEventListener("click",async()=>{toggle.disabled=true;try{await saveStaffProfile({uid:staff.uid,displayName:staff.displayName||"Staff",active:!staff.active});await loadStaff();}catch(err){out.textContent=err.message;toggle.disabled=false;}});card.append(name,meta,toggle);box.append(card);}}catch(err){box.textContent="Staff list unavailable: "+err.message;}}
