const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsIsImV4cCI6MjA4OTg2NjI4Mn0.PoZYNU7ShemdTA_HCAK3Sp9t2OfswFI9ttmsVeE98T0"
);

let currentUser = null;
let ttype = "expense";
let selectedCategories = []; // 支持 5 级分类选中
let pieChart = null;
let barChart = null;

const iconMap = {
  "餐饮":"bi-cup-hot","交通":"bi-bus-front","购物":"bi-bag-handle",
  "娱乐":"bi-controller","医疗":"bi-hospital","教育":"bi-book",
  "住房":"bi-house","通讯":"bi-phone","工资":"bi-wallet","奖金":"bi-award"
};
function getIcon(name) { return iconMap[name] || "bi-tag"; }

window.onload = function () {
  const user = localStorage.getItem("currentUser");
  if (user) {
    currentUser = JSON.parse(user);
    document.getElementById("auth").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("userName").innerText = currentUser.username;
    if (currentUser.role === "admin") adminTab.classList.remove("hidden");
    loadAll();
  }
  generateCaptcha();
};

function switchPage(page) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(page).classList.remove("hidden");
  if (page === "charts") renderCharts();
  if (page === "budget") loadBudget();
  if (page === "category") loadCategoryManager();
  if (page === "adminPage") loadAdmin();
}

function showReg(){ loginCard.classList.add("hidden"); regCard.classList.remove("hidden"); }
function showLogin(){ regCard.classList.add("hidden"); loginCard.classList.remove("hidden"); }

async function login() {
  const username = loginUser.value.trim();
  const password = loginPwd.value.trim();
  const captcha = captchaInput.value.trim().toUpperCase();
  if (captcha !== correctCaptcha) { alert("验证码错误"); generateCaptcha(); return; }

  const { data } = await sb.from("users").select("*").eq("username", username);
  if (!data.length) { alert("用户不存在"); return; }
  const u = data[0];
  if (u.status !== "approved") { alert("账号未审核"); return; }
  if (u.is_locked) { alert("账号已锁定"); return; }
  if (u.password !== password) {
    let err = (u.error_count || 0) + 1;
    await sb.from("users").update({ error_count: err }).eq("username", username);
    if (err >= 5) await sb.from("users").update({ is_locked: true });
    alert("密码错误"); generateCaptcha(); return;
  }
  await sb.from("users").update({ error_count: 0 }).eq("username", username);
  localStorage.setItem("currentUser", JSON.stringify(u));
  location.reload();
}

async function register() {
  const u = regUser.value.trim();
  const p = regPwd.value.trim();
  if (!u || !p) { alert("请填写完整"); return; }
  await sb.from("users").insert([{ username: u, password: p, role: "user", status: "pending", error_count:0, is_locked:false }]);
  alert("注册成功，等待审核"); showLogin();
}

function logout(){ localStorage.removeItem("currentUser"); location.reload(); }

// ==============================================
// 核心：5 级无限分类（支持 1~5 级）
// ==============================================
async function loadCategoryByParent(parentId) {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("type", ttype).eq("parent_id", parentId || null);
  return data || [];
}

async function renderCategoryLevel(level, parentId) {
  const list = await loadCategoryByParent(parentId);
  const container = document.getElementById(`level${level}`);
  if (!container) return;

  container.innerHTML = list.map(c => `
    <div class="category-item" onclick="selectCategory(${level},${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");

  for(let i=level+1;i<=5;i++){
    const el = document.getElementById(`level${i}`);
    if(el) el.innerHTML = "";
  }
}

async function selectCategory(level, id, name) {
  selectedCategories[level] = { id, name };
  for(let i=level+1;i<=5;i++) selectedCategories[i] = null;

  document.querySelectorAll(`#level${level} .category-item`).forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");

  await renderCategoryLevel(level+1, id);
}

function openModal() {
  modal.classList.remove("hidden");
  modalBox.classList.remove("hidden");
  tdate.valueAsDate = new Date();
  selectedCategories = [];
  for(let i=2;i<=5;i++){
    const el = document.getElementById(`level${i}`);
    if(el) el.innerHTML = "";
  }
  renderCategoryLevel(1, null);
}

function closeModal(){ modal.classList.add("hidden"); modalBox.classList.add("hidden"); }

async function saveRecord() {
  const amount = +amountEl.value;
  const date = tdate.value;
  const note = noteEl.value;

  let finalName = null;
  for(let i=5;i>=1;i--){
    if(selectedCategories[i]?.name){ finalName = selectedCategories[i].name; break; }
  }
  if(!amount || !finalName){ alert("请填写金额并选择分类"); return; }

  await sb.from("transactions").insert([{
    username: currentUser.username, type: ttype, amount, category: finalName, date, note
  }]);
  closeModal();
  loadAll();
}

// ==============================================
// 基础功能
// ==============================================
async function loadAll() {
  const { data } = await sb.from("transactions").select("*")
    .eq("username", currentUser.username).order("date", { ascending:false });

  let inSum=0, outSum=0;
  data.forEach(i=>i.type==="income"?inSum+=i.amount:outSum+=i.amount);
  totalIncome.innerText = inSum;
  totalExpense.innerText = outSum;
  totalBalance.innerText = inSum - outSum;

  recentList.innerHTML = data.slice(0,10).map(i=>`
    <div style="padding:6px;border-bottom:1px solid #eee">
      ${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}
    </div>
  `).join("");
  loadRecords();
}

async function loadRecords(){
  const { data } = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).order("date",{ascending:false});
  recordList.innerHTML = data.map(i=>`
    <div style="padding:6px;border-bottom:1px solid #eee">
      ${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}
    </div>
  `).join("");
}

async function searchRecord(){
  const k = searchKey.value.trim();
  const { data } = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).or(`category.ilike.%${k}%,note.ilike.%${k}%`);
  searchResult.innerHTML = data.map(i=>`
    <div style="padding:6px;border-bottom:1px solid #eee">${i.date} | ${i.category} | ${i.amount}</div>
  `).join("");
}

async function setBudget(){
  const v = budgetVal.value;
  await sb.from("budget").upsert({username:currentUser.username,monthly:v},{onConflict:"username"});
  loadBudget();
}

async function loadBudget(){
  const m = new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0");
  const { data:b } = await sb.from("budget").select("*").eq("username",currentUser.username);
  const { data:r } = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).eq("type","expense").like("date",`${m}%`);
  const bud = b.length?b[0].monthly:0;
  const used = r.reduce((s,i)=>s+i.amount,0);
  budgetShow.innerText = bud;
  usedBudget.innerText = used;
  leftBudget.innerText = Math.max(0, bud-used);
}

async function renderCharts(){
  const { data } = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).eq("type","expense");
  const cat = {}, mon={};
  data.forEach(i=>{ cat[i.category]=(cat[i.category]||0)+i.amount; mon[i.date.slice(0,7)]=(mon[i.date.slice(0,7)]||0)+i.amount; });
  if(pieChart)pieChart.destroy();
  pieChart = new Chart(pieChartEl.getContext("2d"),{type:"pie",data:{labels:Object.keys(cat),datasets:[{data:Object.values(cat)}]}});
  if(barChart)barChart.destroy();
  barChart = new Chart(barChartEl.getContext("2d"),{type:"bar",data:{labels:Object.keys(mon),datasets:[{data:Object.values(mon)}]}});
}

// ==============================================
// 分类管理（支持添加 1~5 级）
// ==============================================
async function loadCategoryManager(){
  async function build(parentId,indent){
    const list = await loadCategoryByParent(parentId);
    let html = "";
    for(const c of list){
      html += `
        <div style="${indent}padding:6px 0;display:flex;align-items:center;gap:6px">
          <span>${c.name}</span>
          <button class="btn btn-sm" onclick="addSub(${c.id})">+添加下级</button>
          <button class="btn btn-sm" onclick="delCat(${c.id})">删除</button>
        </div>
      `;
      html += await build(c.id, indent+"margin-left:20px;");
    }
    return html;
  }
  catList.innerHTML = await build(null,"");
}

async function addSub(pid){
  const name = prompt("输入分类名称：");
  if(!name)return;
  await sb.from("categories").insert([{
    username:currentUser.username, type:ttype, name, parent_id:pid
  }]);
  loadCategoryManager();
}

async function delCat(id){
  if(!confirm("确定删除？"))return;
  await sb.from("categories").delete().eq("id",id);
  loadCategoryManager();
}

// ==============================================
// 用户管理（管理员：增删改查）
// ==============================================
async function loadAdmin() {
  let userList = [];
  if (currentUser.role === "admin") {
    const { data } = await sb.from("users").select("*");
    userList = data;
  } else {
    userList = [currentUser];
  }

  let html = "";
  if (currentUser.role === "admin") {
    html += `
      <div style="margin-bottom:16px;padding:12px;border:1px solid #eee;border-radius:8px;">
        <input class="form-control" id="newUser" placeholder="用户名" style="margin-bottom:8px;">
        <input class="form-control" id="newPwd" type="password" placeholder="密码">
        <button class="btn btn-sm" onclick="adminAddUser()">添加账号</button>
      </div>
    `;
  }

  html += userList.map(u => `
    <div style="padding:12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><strong>${u.username}</strong> ${u.role==="admin"?"【管理员】":"【用户】"} ${u.is_locked?"| 已锁定":""}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="password" id="pwd_${u.username}" placeholder="新密码" style="width:120px;padding:6px;">
        <button class="btn btn-sm" onclick="updatePwd('${u.username}')">保存密码</button>
        ${currentUser.role==="admin"?`
          <button class="btn btn-sm" onclick="unlockUser('${u.username}')">解锁</button>
          <button class="btn btn-sm" style="background:#e53935" onclick="deleteUser('${u.username}')">删除</button>
        `:""}
      </div>
    </div>
  `).join("");
  allUsers.innerHTML = html;
}

async function updatePwd(user){
  const p = document.getElementById(`pwd_${user}`).value.trim();
  if(!p){alert("请输入密码");return;}
  await sb.from("users").update({password:p}).eq("username",user);
  alert("修改成功");
}

async function deleteUser(user){
  if(user===currentUser.username){alert("不能删除自己");return;}
  if(!confirm(`确定删除 ${user}？`))return;
  await sb.from("transactions").delete().eq("username",user);
  await sb.from("categories").delete().eq("username",user);
  await sb.from("budget").delete().eq("username",user);
  await sb.from("users").delete().eq("username",user);
  alert("删除成功");
  loadAdmin();
}

async function unlockUser(user){
  await sb.from("users").update({is_locked:false,error_count:0}).eq("username",user);
  loadAdmin();
}

async function adminAddUser(){
  const u = newUser.value.trim();
  const p = newPwd.value.trim();
  if(!u||!p){alert("请填写完整");return;}
  await sb.from("users").insert([{username:u,password:p,role:"user",status:"approved",error_count:0,is_locked:false}]);
  alert("添加成功");
  newUser.value="";
  newPwd.value="";
  loadAdmin();
}
