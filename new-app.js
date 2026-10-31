import { signIn, signOutUser, watchAuth, auth } from "./firebase-client.js";
import { listMembers, createMember, updateMember, createPayment, listAllPayments, listAllRenewals, saveRenewalWithPayment, recordAttendance, listAttendanceForDate, createExpense, listExpenses } from "./cloud-data.js";
const $=id=>document.getElementById(id), login=$("login"), app=$("app"), status=$("loginStatus");
let members=[], dashboardPayments=[], dashboardRenewals=[];
const today=()=>new Date().toISOString().slice(0,10);
function calculateBalanceDue(member,payments,renewals,asOf=today()){
 const fee=Number(member.planFee);if(!Number.isFinite(fee)||fee<=0)return 0;
 const ownRenewals=renewals.filter(r=>r.memberId===member.id&&r.date&&r.date<=asOf).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const cycleStart=ownRenewals[0]?.date||member.joinDate||"0000-01-01";
 const paid=payments.filter(p=>p.memberId===member.id&&p.date>=cycleStart&&p.date<=asOf).reduce((s,p)=>s+Math.max(0,Number(p.amount)||0),0);
 return Math.max(0,fee-paid);
}
function showAuth(role,user){if(role?.allowed&&role.role==="owner"){login.hidden=true;app.hidden=false;$("logout").hidden=false;refresh();}else{login.hidden=false;app.hidden=true;$("logout").hidden=true;if(user)status.textContent="ഈ അക്കൗണ്ടിന് പുതിയ App-ൽ പ്രവേശനാനുമതിയില്ല.";}}
watchAuth(showAuth);
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);status.textContent="Signing in…";try{const role=await signIn(f.get("email"),f.get("password"));if(!role.allowed)status.textContent="Owner account required.";else showAuth(role,auth.currentUser);}catch(err){status.textContent=err.message||"Login failed";}});
$("logout").addEventListener("click",signOutUser);
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.hidden=x.id!==b.dataset.tab);if(b.dataset.tab==="payments")loadPayments();if(b.dataset.tab==="renewals")loadRenewals();if(b.dataset.tab==="attendance")loadAttendance();if(b.dataset.tab==="expenses")loadExpenses();}));
async function refresh(){const box=$("memberList");box.textContent="Loading…";try{members=await listMembers();const [pays,renews]=await Promise.all([listAllPayments(),listAllRenewals()]);dashboardPayments=pays;dashboardRenewals=renews;const d=today();$("totalMembers").textContent=members.length;$("activeMembers").textContent=members.filter(m=>(m.status||"active")==="active"&&(!m.expiryDate||m.expiryDate>=d)).length;$("expiredMembers").textContent=members.filter(m=>m.expiryDate&&m.expiryDate<d).length;const due=members.reduce((sum,m)=>sum+calculateBalanceDue(m,dashboardPayments,dashboardRenewals,d),0);$("dueMembers").textContent="₹"+due.toFixed(2);render();populateMembers();}catch(e){box.textContent="Cloud load failed: "+e.message;}}
function render(){const q=$("search").value.trim().toLowerCase(),box=$("memberList");box.replaceChildren();const rows=members.filter(m=>(m.name||"").toLowerCase().includes(q)||(m.phone||"").includes(q));if(!rows.length){box.textContent="No members yet. Add your first member.";return;}for(const m of rows){const card=document.createElement("article"),info=document.createElement("div"),name=document.createElement("strong"),meta=document.createElement("p"),actions=document.createElement("div");name.textContent=m.name||"Unnamed";meta.textContent=[m.phone,m.plan,m.expiryDate?"Expiry: "+m.expiryDate:""].filter(Boolean).join(" · ");info.append(name,meta);actions.className="member-actions";const edit=document.createElement("button");edit.textContent="Edit";edit.addEventListener("click",()=>openForm(m));actions.append(edit);card.append(info,actions);box.append(card);}}
$("search").addEventListener("input",render);
function openForm(m={}){const form=$("memberForm");form.reset();for(const [k,v] of Object.entries(m))if(form.elements.namedItem(k))form.elements.namedItem(k).value=v??"";$("formTitle").textContent=m.id?"Edit Member":"Add Member";$("memberDialog").showModal();}
$("addMember").addEventListener("click",()=>openForm());$("cancelForm").addEventListener("click",()=>$("memberDialog").close());
$("memberForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,values=Object.fromEntries(new FormData(f));const id=values.id;delete values.id;values.planFee=values.planFee===""?undefined:Number(values.planFee);try{if(id)await updateMember(id,values);else await createMember(values);$("memberDialog").close();await refresh();}catch(err){alert("Save failed: "+err.message);}});
function populateMembers(){for(const id of ["paymentMember","attendanceMember","renewalMember"]){const sel=$(id),current=sel.value;sel.replaceChildren();for(const m of members){const o=document.createElement("option");o.value=m.id;o.textContent=m.name+(m.phone?" · "+m.phone:"");sel.append(o);}if([...sel.options].some(o=>o.value===current))sel.value=current;}}
function cardLine(parent,title,meta){const el=document.createElement("article"),a=document.createElement("strong"),b=document.createElement("p");a.textContent=title;b.textContent=meta;el.append(a,b);parent.append(el);}

$("renewalForm").elements.date.value=today();
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
   memberChanges:{plan:f.get("plan"),planFee:feeAmount,expiryDate:f.get("expiryDate"),status:"active"},
   payment:amount>0?{memberId:m.id,memberName:m.name,phone:m.phone||"",amount,date:f.get("date"),payMode:f.get("payMode"),type:"renewal-payment"}:null
  });
  out.textContent="Renewal saved.";
  e.currentTarget.reset();e.currentTarget.elements.date.value=today();
  await refresh();await loadRenewals();
 }catch(err){out.textContent="Renewal save incomplete/failed: "+err.message+" — രേഖകൾ പരിശോധിച്ച് മാത്രം വീണ്ടും ശ്രമിക്കുക.";}
});
async function loadRenewals(){
 const box=$("renewalList");box.textContent="Loading…";
 try{const rows=await listAllRenewals();box.replaceChildren();if(!rows.length)box.textContent="No renewals yet.";for(const r of rows)cardLine(box,(r.memberName||"Member")+" — ₹"+Number(r.feeAmount||0).toFixed(2),[r.date,r.plan,"Paid ₹"+Number(r.amount||0).toFixed(2),"Expiry "+(r.expiryDate||"")].filter(Boolean).join(" · "));}
 catch(e){box.textContent="Renewals unavailable: "+e.message;}
}
$("paymentForm").elements.date.value=today();
$("paymentForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),m=members.find(x=>x.id===f.get("memberId"));if(!m)return;const out=$("paymentStatus");out.textContent="Saving…";try{await createPayment({memberId:m.id,memberName:m.name,phone:m.phone||"",amount:Number(f.get("amount")),date:f.get("date"),payMode:f.get("payMode"),type:"payment"});out.textContent="Payment saved.";e.currentTarget.reset();e.currentTarget.elements.date.value=today();await loadPayments();}catch(err){out.textContent="Payment failed: "+err.message;}});
async function loadPayments(){const box=$("paymentList");box.textContent="Loading…";try{const rows=await listAllPayments();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No payments yet.";for(const p of rows)cardLine(box,(p.memberName||"Member")+" — ₹"+Number(p.amount||0).toFixed(2),[p.date,p.payMode,p.type].filter(Boolean).join(" · "));}catch(e){box.textContent="Payments unavailable: "+e.message;}}
$("attendanceDate").value=today();
$("attendanceDate").addEventListener("change",loadAttendance);
$("attendanceForm").addEventListener("submit",async e=>{e.preventDefault();const id=new FormData(e.currentTarget).get("memberId"),m=members.find(x=>x.id===id);if(!m)return;const out=$("attendanceStatus");out.textContent="Saving…";try{const existing=await listAttendanceForDate($("attendanceDate").value);if(existing.some(a=>a.memberId===m.id)){out.textContent="ഈ അംഗത്തിന് ഇന്നത്തെ Attendance ഇതിനകം രേഖപ്പെടുത്തിയിട്ടുണ്ട്.";return;}await recordAttendance({date:$("attendanceDate").value,memberId:m.id,memberName:m.name,phone:m.phone||"",time:new Date().toTimeString().slice(0,5)});out.textContent="Attendance marked.";await loadAttendance();}catch(err){out.textContent="Attendance failed: "+err.message;}});
async function loadAttendance(){const box=$("attendanceList");box.textContent="Loading…";try{const rows=await listAttendanceForDate($("attendanceDate").value);box.replaceChildren();if(!rows.length)box.textContent="No attendance for this date.";for(const a of rows)cardLine(box,a.memberName||a.phone||a.memberId,a.date+" · "+(a.time||""));}catch(e){box.textContent="Attendance unavailable: "+e.message;}}
$("expenseForm").elements.date.value=today();
$("expenseForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),out=$("expenseStatus");out.textContent="Saving…";try{await createExpense({title:f.get("title"),amount:Number(f.get("amount")),date:f.get("date"),notes:f.get("notes")});out.textContent="Expense saved.";e.currentTarget.reset();e.currentTarget.elements.date.value=today();await loadExpenses();}catch(err){out.textContent="Expense failed: "+err.message;}});
async function loadExpenses(){const box=$("expenseList");box.textContent="Loading…";try{const rows=await listExpenses();box.replaceChildren();rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));if(!rows.length)box.textContent="No expenses yet.";for(const x of rows)cardLine(box,x.title||"Expense","₹"+Number(x.amount||0).toFixed(2)+" · "+x.date);}catch(e){box.textContent="Expenses unavailable: "+e.message;}}
