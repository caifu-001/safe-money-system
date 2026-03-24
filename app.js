const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsImV4cCI6MjA4OTg2NjI4Mn0.PoZYNU7ShemdTA_HCAK3Sp9t2OfswFI9ttmsVeE98T0"
);

let currentUser = null;
let ttype = "expense";
let selectedMainCategory = null;
let selectedSubCategory = null;
let pieChart = null;
let barChart = null;
let tempParentId = null;

const iconMap = {
  "餐饮":"bi-cup-hot","交通":"bi-bus-front","购物":"bi-bag-handle",
  "娱乐":"bi-controller","医疗":"bi-hospital","教育":"bi-book",
  "住房":"bi-house","通讯":"bi-phone","工资":"bi-wallet","奖金":"bi-award"
};

function getIcon(name) {
  return iconMap[name] || "bi-tag";
}

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
}

function showReg() {
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("regCard").classList.remove("hidden");
}

function showLogin() {
  document.getElementById("regCard").classList.add("hidden");
  document.getElementById("loginCard").classList.remove("hidden");
}

async function login() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPwd").value.trim();
  const captcha = document.getElementById("captchaInput").value.trim().toUpperCase();

  if (captcha !== correctCaptcha) {
    document.getElementById("loginErr").innerText = "验证码错误";
    generateCaptcha();
    return;
  }

  const { data } = await sb.from("users").select("*").eq("username", username);
  if (!data.length) {
    document.getElementById("loginErr").innerText = "用户不存在";
    generateCaptcha();
    return;
  }

  const user = data[0];

  if (user.is_locked) {
    document.getElementById("loginErr").innerText = "账号已锁定，请联系管理员";
    return;
  }

  if (user.password !== password) {
    let errCount = user.error_count || 0;
    errCount++;
    await sb.from("users").update({ error_count: errCount }).eq("username", username);
    if (errCount >= 5) {
      await sb.from("users").update({ is_locked: true }).eq("username", username);
      document.getElementById("loginErr").innerText = "密码错误5次，已锁定";
    } else {
      document.getElementById("loginErr").innerText = "密码错误，剩余 " + (5 - errCount) + " 次";
    }
    generateCaptcha();
    return;
  }

  await sb.from("users").update({ error_count: 0 }).eq("username", username);
  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(user));
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userName").innerText = user.username;
  if (user.role === "admin") document.getElementById("adminTab").classList.remove("hidden");
  loadAll();
}

async function register() {
  const u = document.getElementById("regUser").value.trim();
  const p = document.getElementById("regPwd").value.trim();
  if (!u || !p) {
    document.getElementById("regErr").innerText = "请填写完整";
    return;
  }
  await sb.from("users").insert([{
    username: u,
    password: p,
    role: "user",
    status: "pending",
    error_count: 0,
    is_locked: false
  }]);
  alert("注册成功，等待管理员审核");
  showLogin();
}

function logout() {
  localStorage.removeItem("currentUser");
  location.reload();
}

function setType(type) {
  ttype = type;
  if (type === "income") {
    document.getElementById("tabIncome").classList.add("active");
    document.getElementById("tabExpense").classList.remove("active");
  } else {
    document.getElementById("tabExpense").classList.add("active");
    document.getElementById("tabIncome").classList.remove("active");
  }
  loadMainCategories();
}

async function loadMainCategories() {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("type", ttype).is("parent_id", null);
  const grid = document.getElementById("mainCategoryGrid");
  if (!data || data.length === 0) {
    grid.innerHTML = "<div style='grid-column:1/-1;padding:10px'>暂无主分类</div>";
    return;
  }
  grid.innerHTML = data.map((c, i) => `
    <div class="category-item ${i === 0 ? 'active' : ''}" onclick="selectMainCat(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i>
      <span>${c.name}</span>
    </div>
  `).join("");
  if (data.length > 0) selectMainCat(data[0].id, data[0].name);
}

async function selectMainCat(id, name) {
  selectedMainCategory = { id, name };
  document.querySelectorAll("#mainCategoryGrid .category-item").forEach(el => el.classList.remove("active"));
  event.currentTarget.classList.add("active");
  loadSubCategories();
}

async function loadSubCategories() {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("parent_id", selectedMainCategory.id);
  const grid = document.getElementById("subCategoryGrid");
  if (!data || data.length === 0) {
    grid.innerHTML = "<div style='grid-column:1/-1;padding:10px'>暂无子分类</div>";
    selectedSubCategory = null;
    return;
  }
  grid.innerHTML = data.map((c, i) => `
    <div class="category-item ${i === 0 ? 'active' : ''}" onclick="selectSubCat('${c.name}')">
      <i class="${getIcon(c.name)}"></i>
      <span>${c.name}</span>
    </div>
  `).join("");
  selectedSubCategory = data[0].name;
}

function selectSubCat(name) {
  selectedSubCategory = name;
  document.querySelectorAll("#subCategoryGrid .category-item").forEach(el => el.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

function openModal() {
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modalBox").classList.remove("hidden");
  document.getElementById("tdate").valueAsDate = new Date();
  setType("expense");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modalBox").classList.add("hidden");
}

async function saveRecord() {
  const amount = +document.getElementById("amountEl").value;
  const date = document.getElementById("tdate").value;
  const note = document.getElementById("noteEl").value;
  const finalCat = selectedSubCategory || selectedMainCategory?.name;
  if (!amount || !finalCat) {
    alert("请填写金额和分类");
    return;
  }

  await sb.from("transactions").insert([{
    username: currentUser.username,
    type: ttype,
    amount: amount,
    category: finalCat,
    date: date,
    note: note
  }]);
  closeModal();
  loadAll();
}

async function loadAll() {
  const { data: records } = await sb.from("transactions")
    .select("*")
    .eq("username", currentUser.username)
    .order("date", { ascending: false });

  let income = 0, expense = 0;
  records.forEach(r => {
    if (r.type === "income") income += r.amount;
    else expense += r.amount;
  });

  document.getElementById("totalIncome").innerText = income;
  document.getElementById("totalExpense").innerText = expense;
  document.getElementById("totalBalance").innerText = income - expense;

  const recent = records.slice(0, 10);
  document.getElementById("recentList").innerHTML = recent.map(r => `
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${r.date} | ${r.category} | ${r.note || ""} | ${r.type === "income" ? "+" : "-"}${r.amount}
    </div>
  `).join("");
  loadRecords();
}

async function loadRecords() {
  const { data } = await sb.from("transactions")
    .select("*")
    .eq("username", currentUser.username)
    .order("date", { ascending: false });

  document.getElementById("recordList").innerHTML = data.map(r => `
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${r.date} | ${r.category} | ${r.note || ""} | ${r.type === "income" ? "+" : "-"}${r.amount}
    </div>
  `).join("");
}

async function searchRecord() {
  const key = document.getElementById("searchKey").value.trim();
  const { data } = await sb.from("transactions")
    .select("*")
    .eq("username", currentUser.username)
    .or(`category.ilike.%${key}%,note.ilike.%${key}%`);

  document.getElementById("searchResult").innerHTML = data.map(r => `
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${r.date} | ${r.category} | ${r.note || ""} | ${r.type === "income" ? "+" : "-"}${r.amount}
    </div>
  `).join("");

  let total = 0;
  data.forEach(r => {
    if (r.type === "expense") total += r.amount;
  });
  document.getElementById("searchStat").innerText = "搜索结果总支出：" + total;
}

async function setBudget() {
  const val = document.getElementById("budgetVal").value;
  await sb.from("budget").upsert({
    username: currentUser.username,
    monthly: val
  }, { onConflict: "username" });
  loadBudget();
}

async function loadBudget() {
  const now = new Date();
  const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const { data: bgt } = await sb.from("budget").select("*").eq("username", currentUser.username);
  const { data: records } = await sb.from("transactions")
    .select("*")
    .eq("username", currentUser.username)
    .eq("type", "expense")
    .like("date", `${month}%`);

  const budget = bgt.length ? bgt[0].monthly : 0;
  const used = records.reduce((s, r) => s + r.amount, 0);
  const left = budget - used;

  document.getElementById("budgetShow").innerText = budget;
  document.getElementById("usedBudget").innerText = used;
  document.getElementById("leftBudget").innerText = Math.max(0, left);
}

async function renderCharts() {
  const { data } = await sb.from("transactions")
    .select("*")
    .eq("username", currentUser.username)
    .eq("type", "expense");

  const cateMap = {};
  const monthMap = {};

  data.forEach(r => {
    cateMap[r.category] = (cateMap[r.category] || 0) + r.amount;
    const m = r.date.slice(0, 7);
    monthMap[m] = (monthMap[m] || 0) + r.amount;
  });

  const ctxPie = document.getElementById("pieChartEl").getContext("2d");
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctxPie, {
    type: "pie",
    data: { labels: Object.keys(cateMap), datasets: [{ data: Object.values(cateMap) }] }
  });

  const ctxBar = document.getElementById("barChartEl").getContext("2d");
  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: "bar",
    data: { labels: Object.keys(monthMap), datasets: [{ data: Object.values(monthMap) }] }
  });
}

async function loadCategoryManager() {
  const { data: mainList } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).is("parent_id", null);
  let html = "";
  for (let main of mainList) {
    html += `<div style='margin-bottom:16px'>
      <strong style='display:flex;align-items:center;gap:8px'>
        <i class='${getIcon(main.name)}'></i>${main.name}
        <button class='btn btn-sm' onclick='showAddSub(${main.id})'>+添加子分类</button>
      </strong>`;
    const { data: subs } = await sb.from("categories")
      .select("*").eq("username", currentUser.username).eq("parent_id", main.id);
    html += `<div style='padding-left:22px;margin-top:6px'>`;
    for (let s of subs) {
      html += `<div style='padding:4px 0'>${s.name} 
        <button class='btn btn-sm' onclick='delCategory(${s.id})'>删除</button></div>`;
    }
    html += `</div></div>`;
  }
  document.getElementById("catList").innerHTML = html;
}

function showAddSub(pid) {
  tempParentId = pid;
  document.getElementById("catName").placeholder = "输入子分类名称";
}

async function addCategory() {
  const name = document.getElementById("catName").value.trim();
  const type = document.getElementById("catType").value;
  if (!name) return;
  await sb.from("categories").insert([{
    username: currentUser.username,
    type: type,
    name: name,
    parent_id: tempParentId || null
  }]);
  document.getElementById("catName").value = "";
  tempParentId = null;
  document.getElementById("catName").placeholder = "分类名称";
  loadCategoryManager();
}

async function delCategory(id) {
  if (!confirm("确定删除？")) return;
  await sb.from("categories").delete().eq("id", id);
  loadCategoryManager();
}

// ====================== 用户修改密码 ======================
async function updateMyPassword() {
  const oldPwd = document.getElementById("oldPassword").value.trim();
  const newPwd = document.getElementById("newPassword").value.trim();
  if (!oldPwd || !newPwd) {
    alert("请填写原密码和新密码");
    return;
  }
  const { data } = await sb.from("users")
    .select("*")
    .eq("username", currentUser.username)
    .eq("password", oldPwd);
  
  if (!data || data.length === 0) {
    alert("原密码错误");
    return;
  }
  await sb.from("users").update({ password: newPwd }).eq("username", currentUser.username);
  alert("密码修改成功，请重新登录");
  logout();
}

// ====================== 管理员：直接修改任意用户密码 ======================
async function loadAdmin() {
  const { data } = await sb.from("users").select("*");
  document.getElementById("allUsers").innerHTML = data.map(u => `
    <div style="padding:8px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="flex:1;">${u.username} | ${u.status} | ${u.is_locked ? "锁定" : "正常"}</span>
      <input type="password" placeholder="新密码" id="new_pwd_${u.username}" style="width:120px">
      <button class="btn btn-sm" onclick="adminSetPassword('${u.username}')">修改密码</button>
      <button class="btn btn-sm" onclick="unlockUser('${u.username}')">解锁</button>
      <button class="btn btn-sm" onclick="approveUser('${u.username}')">审核</button>
    </div>
  `).join("");
}

// 核心：管理员直接设置密码，不需要原密码
async function adminSetPassword(username) {
  const newPwd = document.getElementById(`new_pwd_${username}`).value.trim();
  if (!newPwd) {
    alert("请输入新密码");
    return;
  }
  await sb.from("users").update({ password: newPwd }).eq("username", username);
  alert("已修改【" + username + "】的密码");
  loadAdmin();
}

async function unlockUser(username) {
  await sb.from("users").update({ is_locked: false, error_count: 0 }).eq("username", username);
  loadAdmin();
}

async function approveUser(username) {
  await sb.from("users").update({ status: "approved" }).eq("username", username);
  loadAdmin();
}

async function adminAddUser() {
  const user = document.getElementById("newUser").value;
  const pwd = document.getElementById("newPwd").value;
  await sb.from("users").insert([{
    username: user, password: pwd, role: "user", status: "approved", error_count: 0, is_locked: false
  }]);
  document.getElementById("newUser").value = "";
  document.getElementById("newPwd").value = "";
  loadAdmin();
}
