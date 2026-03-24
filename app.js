const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsImV4cCI6MjA4OTg2NjI4Mn0.PoZYNU7ShemdTA_HCAK3Sp9t2OfswFI9ttmsVeE98T0"
);

let currentUser = null;
let ttype = "expense";
// 选中的分类链：[一级ID, 一级名, 二级ID, 二级名, 三级ID, 三级名]
let selectedCats = []; 
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
    if (currentUser.role === "admin") {
      document.getElementById("adminTab").classList.remove("hidden");
    }
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

function showReg() { document.getElementById("loginCard").classList.add("hidden"); document.getElementById("regCard").classList.remove("hidden"); }
function showLogin() { document.getElementById("regCard").classList.add("hidden"); document.getElementById("loginCard").classList.remove("hidden"); }

async function login() {
  const user = document.getElementById("loginUser").value.trim();
  const pwd = document.getElementById("loginPwd").value.trim();
  const cap = document.getElementById("captchaInput").value.trim().toUpperCase();
  if (cap !== correctCaptcha) { alert("验证码错误"); generateCaptcha(); return; }
  
  const { data } = await sb.from("users").select("*").eq("username", user);
  if (!data.length) { alert("用户不存在"); generateCaptcha(); return; }
  const u = data[0];
  
  if (u.status !== "approved") { alert("未审核，请联系管理员"); return; }
  if (u.is_locked) { alert("已锁定"); return; }
  if (u.password !== pwd) {
    let err = (u.error_count || 0) + 1;
    await sb.from("users").update({ error_count: err }).eq("username", user);
    if (err >= 5) await sb.from("users").update({ is_locked: true }).eq("username", user);
    alert("密码错误，剩余" + (5 - err));
    generateCaptcha();
    return;
  }
  await sb.from("users").update({ error_count: 0 }).eq("username", user);
  localStorage.setItem("currentUser", JSON.stringify(u));
  location.reload();
}

async function register() {
  const u = document.getElementById("regUser").value.trim();
  const p = document.getElementById("regPwd").value.trim();
  if (!u || !p) { alert("请填写完整"); return; }
  await sb.from("users").insert([{ username: u, password: p, role: "user", status: "pending", error_count: 0, is_locked: false }]);
  alert("注册成功，等待审核");
  showLogin();
}

function logout() { localStorage.removeItem("currentUser"); location.reload(); }

// ===================== 记账分类逻辑（核心：三级联动） =====================
async function loadMainCategories() {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("type", ttype).is("parent_id", null);
  const g = document.getElementById("mainCategoryGrid");
  if (!data || data.length === 0) { g.innerHTML = "<div>暂无一级分类</div>"; return; }
  g.innerHTML = data.map(c => `
    <div class="category-item" onclick="selectLevel1(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
}

async function selectLevel1(id, name) {
  selectedCats = [id, name, null, null, null, null]; // 清空二三级
  document.querySelectorAll("#mainCategoryGrid .category-item").forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");
  // 加载二级
  const { data: subs } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("parent_id", id);
  subCategoryGrid.innerHTML = subs.map(c => `
    <div class="category-item" onclick="selectLevel2(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
  if (subs.length === 0) selectedCats[2] = selectedCats[3] = null;
}

async function selectLevel2(id, name) {
  selectedCats[2] = id; selectedCats[3] = name; selectedCats[4] = selectedCats[5] = null; // 清空三级
  document.querySelectorAll("#subCategoryGrid .category-item").forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");
  // 加载三级
  const { data: subs } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("parent_id", id);
  subCategoryGrid.innerHTML = subs.map(c => `
    <div class="category-item" onclick="selectLevel3(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
}

async function selectLevel3(id, name) {
  selectedCats[4] = id; selectedCats[5] = name;
  document.querySelectorAll("#subCategoryGrid .category-item").forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

function openModal() {
  modal.classList.remove("hidden"); modalBox.classList.remove("hidden");
  tdate.valueAsDate = new Date();
  loadMainCategories(); // 重新加载一级
}

function closeModal() { modal.classList.add("hidden"); modalBox.classList.add("hidden"); }

async function saveRecord() {
  const amount = +amountEl.value;
  const date = tdate.value;
  const note = noteEl.value;
  // 最终分类：三级优先，二级兜底，一级兜底
  let finalCat = selectedCats[5] || selectedCats[3] || selectedCats[1];
  if (!amount || !finalCat) { alert("请填写金额并选择分类"); return; }
  
  await sb.from("transactions").insert([{
    username: currentUser.username, type: ttype, amount, category: finalCat, date, note
  }]);
  closeModal();
  loadAll();
}

// ===================== 基础数据加载 =====================
async function loadAll() {
  const { data: r } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });
  let inSum = 0, outSum = 0;
  r.forEach(i => { if (i.type === "income") inSum += i.amount; else outSum += i.amount; });
  totalIncome.innerText = inSum; totalExpense.innerText = outSum; totalBalance.innerText = inSum - outSum;
  recentList.innerHTML = r.slice(0, 10).map(i => `
    <div>${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}</div>
  `).join("");
  loadRecords();
}

async function loadRecords() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });
  recordList.innerHTML = data.map(i => `
    <div>${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}</div>
  `).join("");
}

async function searchRecord() {
  const k = searchKey.value.trim();
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username)
    .or(`category.ilike.%${k}%,note.ilike.%${k}%`);
  searchResult.innerHTML = data.map(i => `<div>${i.date}|${i.category}|${i.amount}</div>`).join("");
  let total = data.reduce((s,i)=>i.type==="expense"?s+i.amount:s, 0);
  searchStat.innerText = "总支出：" + total;
}

async function loadBudget() {
  const m = new Date().getFullYear() + "-" + String(new Date().getMonth()+1).padStart(2,"0");
  const { data: b } = await sb.from("budget").select("*").eq("username", currentUser.username);
  const { data: r } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type","expense").like("date",`${m}%`);
  const bud = b.length ? b[0].monthly : 0;
  const used = r.reduce((s,i)=>s+i.amount,0);
  budgetShow.innerText = bud; usedBudget.innerText = used; leftBudget.innerText = Math.max(0, bud-used);
}

async function renderCharts() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type","expense");
  const catMap = {}, monMap = {};
  data.forEach(i => { catMap[i.category] = (catMap[i.category]||0)+i.amount; monMap[i.date.slice(0,7)] = (monMap[i.date.slice(0,7)]||0)+i.amount; });
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(pieChartEl.getContext("2d"), { type:"pie", data:{labels:Object.keys(catMap),datasets:[{data:Object.values(catMap)}]}});
  if (barChart) barChart.destroy();
  barChart = new Chart(barChartEl.getContext("2d"), { type:"bar", data:{labels:Object.keys(monMap),datasets:[{data:Object.values(monMap)}]}});
}

// ===================== 分类管理（管理员/普通用户隔离） =====================
async function loadCategoryManager() {
  let catList = [];
  if (currentUser.role === "admin") {
    const { data } = await sb.from("users").select("username");
    // 管理员看所有用户的分类，这里简化为：只看当前登录用户的分类结构，多用户逻辑需额外表设计
    const { data: main } = await sb.from("categories")
      .select("*").is("parent_id", null);
    catList = main;
  } else {
    const { data: main } = await sb.from("categories")
      .select("*").eq("username", currentUser.username).is("parent_id", null);
    catList = main;
  }

  let html = "";
  for (let m of catList) {
    html += `<div style="margin:10px 0;padding:8px;border:1px solid #eee;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span><i class="${getIcon(m.name)}"></i> <strong>一级：${m.name}</strong></span>
        ${currentUser.role === "admin" ? `<button class="btn btn-sm" onclick="addSubCat(${m.id},null,'${m.name}')">+二级</button>` : ""}
      </div>`;
    
    const { data: subs2 } = await sb.from("categories")
      .select("*").eq("parent_id", m.id);
    for (let s2 of subs2) {
      html += `<div style="margin-left:20px;margin-top:8px;padding:6px;border:1px solid #eee">
        <span>└─ 二级：${s2.name}</span>
        ${currentUser.role === "admin" ? `<button class="btn btn-sm" onclick="addSubCat(${s2.id},${m.id},'${s2.name}')">+三级</button>` : ""}
        
        <div style="margin-left:20px;margin-top:6px">`;
        const { data: subs3 } = await sb.from("categories")
          .select("*").eq("parent_id", s2.id);
        for (let s3 of subs3) {
          html += `<div>└─ 三级：${s3.name} 
            ${currentUser.role === "admin" ? `<button class="btn btn-xs" onclick="delCat(${s3.id})">删</button>` : ""}
          </div>`;
        }
        html += `</div></div>`;
      }
    html += `</div>`;
  }
  document.getElementById("catList").innerHTML = html;
}

async function addSubCat(childId, parentId, parentName) {
  const name = prompt(`为【${parentName}】添加子分类名称：`);
  if (!name) return;
  await sb.from("categories").insert([{
    username: currentUser.username, type: ttype, name, parent_id: childId
  }]);
  loadCategoryManager();
}

async function delCat(id) {
  if (!confirm("确定删除？")) return;
  await sb.from("categories").delete().eq("id", id);
  loadCategoryManager();
}

// ===================== 用户管理（管理员增删改查） =====================
async function loadAdmin() {
  let userList = [];
  if (currentUser.role === "admin") {
    const { data } = await sb.from("users").select("*");
    userList = data;
  } else {
    const { data } = await sb.from("users").select("*").eq("username", currentUser.username);
    userList = data;
  }

  let html = "";
  if (currentUser.role === "admin") {
    html += `
      <div style="margin-bottom:16px;padding:10px;border:1px solid #eee">
        <input class="form-control" id="newUser" placeholder="新用户名" style="margin-bottom:8px">
        <input class="form-control" id="newPwd" placeholder="密码" type="password">
        <button class="btn" onclick="adminAddUser()">添加账号</button>
      </div>
    `;
  }

  html += userList.map(u => `
    <div style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">
      <div>
        <strong>${u.username}</strong> 
        ${u.role === "admin" ? "【管理员】"
