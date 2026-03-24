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
  if (page === "adminPage") loadAdmin();
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

  if (user.status !== "approved") {
    document.getElementById("loginErr").innerText = "账号未审核，请联系管理员";
    return;
  }

  if (user.is_locked) {
    document.getElementById("loginErr").innerText = "账号已锁定";
    return;
  }

  if (user.password !== password) {
    let errCount = user.error_count || 0;
    errCount++;
    await sb.from("users").update({ error_count: errCount }).eq("username", username);
    if (errCount >= 5) {
      await sb.from("users").update({ is_locked: true }).eq("username", username);
      document.getElementById("loginErr").innerText = "密码错误5次已锁定";
    } else {
      document.getElementById("loginErr").innerText = "密码错误，剩余" + (5 - errCount) + "次";
    }
    generateCaptcha();
    return;
  }

  await sb.from("users").update({ error_count: 0 }).eq("username", username);
  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(user));
  location.reload();
}

async function register() {
  const u = document.getElementById("regUser").value.trim();
  const p = document.getElementById("regPwd").value.trim();
  if (!u || !p) {
    document.getElementById("regErr").innerText = "请填写完整";
    return;
  }
  await sb.from("users").insert([{
    username: u, password: p, role: "user", status: "pending", error_count: 0, is_locked: false
  }]);
  alert("注册成功，等待审核");
  showLogin();
}

function logout() {
  localStorage.removeItem("currentUser");
  location.reload();
}

function setType(type) {
  ttype = type;
  if (type === "income") {
    tabIncome.classList.add("active");
    tabExpense.classList.remove("active");
  } else {
    tabExpense.classList.add("active");
    tabIncome.classList.remove("active");
  }
  loadMainCategories();
}

async function loadMainCategories() {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("type", ttype).is("parent_id", null);
  const g = mainCategoryGrid;
  if (!data || data.length === 0) {
    g.innerHTML = "<div style='grid-column:1/-1;padding:10px'>暂无分类</div>";
    return;
  }
  g.innerHTML = data.map((c, i) => `
    <div class="category-item ${i === 0 ? 'active' : ''}" onclick="selectMainCat(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
  selectMainCat(data[0].id, data[0].name);
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
  subCategoryGrid.innerHTML = data.map((c, i) => `
    <div class="category-item ${i === 0 ? 'active' : ''}" onclick="selectSubCat('${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
  selectedSubCategory = data.length ? data[0].name : null;
}

function selectSubCat(name) {
  selectedSubCategory = name;
  document.querySelectorAll("#subCategoryGrid .category-item").forEach(el => el.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

function openModal() {
  modal.classList.remove("hidden");
  modalBox.classList.remove("hidden");
  tdate.valueAsDate = new Date();
  setType("expense");
}

function closeModal() {
  modal.classList.add("hidden");
  modalBox.classList.add("hidden");
}

async function saveRecord() {
  const amount = +amountEl.value;
  const date = tdate.value;
  const note = noteEl.value;
  const cat = selectedSubCategory || selectedMainCategory?.name;
  if (!amount || !cat) {
    alert("请填写金额和分类");
    return;
  }
  await sb.from("transactions").insert([{
    username: currentUser.username, type: ttype, amount, category: cat, date, note
  }]);
  closeModal();
  loadAll();
}

async function loadAll() {
  const { data: r } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });
  let inSum = 0, outSum = 0;
  r.forEach(i => i.type === "income" ? inSum += i.amount : outSum += i.amount);
  totalIncome.innerText = inSum;
  totalExpense.innerText = outSum;
  totalBalance.innerText = inSum - outSum;
  recentList.innerHTML = r.slice(0, 10).map(i => `
    <div style='padding:8px;border-bottom:1px solid #eee'>
      ${i.date} | ${i.category} | ${i.note || ""} | ${i.type === "income" ? "+" : "-"}${i.amount}
    </div>
  `).join("");
  loadRecords();
}

async function loadRecords() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });
  recordList.innerHTML = data.map(i => `
    <div style='padding:8px;border-bottom:1px solid #eee'>
      ${i.date} | ${i.category} | ${i.note || ""} | ${i.type === "income" ? "+" : "-"}${i.amount}
    </div>
  `).join("");
}

async function searchRecord() {
  const k = searchKey.value.trim();
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username)
    .or(`category.ilike.%${k}%,note.ilike.%${k}%`);
  searchResult.innerHTML = data.map(i => `
    <div style='padding:8px;border-bottom:1px solid #eee'>
      ${i.date} | ${i.category} | ${i.note || ""} | ${i.type === "income" ? "+" : "-"}${i.amount}
    </div>
  `).join("");
  let total = 0;
  data.forEach(i => i.type === "expense" && (total += i.amount));
  searchStat.innerText = "搜索总支出：" + total;
}

async function setBudget() {
  const v = budgetVal.value;
  await sb.from("budget").upsert({ username: currentUser.username, monthly: v }, { onConflict: "username" });
  loadBudget();
}

async function loadBudget() {
  const m = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
  const { data: b } = await sb.from("budget").select("*").eq("username", currentUser.username);
  const { data: r } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type", "expense").like("date", `${m}%`);
  const budget = b.length ? b[0].monthly : 0;
  const used = r.reduce((s, i) => s + i.amount, 0);
  budgetShow.innerText = budget;
  usedBudget.innerText = used;
  leftBudget.innerText = Math.max(0, budget - used);
}

async function renderCharts() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type", "expense");
  const catMap = {}, monMap = {};
  data.forEach(i => {
    catMap[i.category] = (catMap[i.category] || 0) + i.amount;
    const m = i.date.slice(0, 7);
    monMap[m] = (monMap[m] || 0) + i.amount;
  });
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(pieChartEl.getContext("2d"), {
    type: "pie", data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap) }] }
  });
  if (barChart) barChart.destroy();
  barChart = new Chart(barChartEl.getContext("2d"), {
    type: "bar", data: { labels: Object.keys(monMap), datasets: [{ data: Object.values(monMap) }] }
  });
}

async function loadCategoryManager() {
  const { data: main } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).is("parent_id", null);
  let html = "";
  for (let m of main) {
    html += `<div style='margin-bottom:12px'>
      <strong style='display:flex;align-items:center;gap:8px'>
        <i class='${getIcon(m.name)}'></i>${m.name}
        <button class='btn btn-sm' onclick='showAddSub(${m.id})'>+子分类</button>
      </strong>`;
    const { data: subs } = await sb.from("categories")
      .select("*").eq("username", currentUser.username).eq("parent_id", m.id);
    html += `<div style='padding-left:20px;margin-top:4px'>`;
    for (let s of subs) html += `<div style='padding:4px 0'>${s.name} <button class='btn btn-sm' onclick='delCategory(${s.id})'>删</button></div>`;
    html += `</div></div>`;
  }
  catList.innerHTML = html;
}

function showAddSub(pid) {
  tempParentId = pid;
  catName.placeholder = "子分类名称";
}

async function addCategory() {
  const name = catName.value.trim();
  const type = catType.value;
  if (!name) return;
  await sb.from("categories").insert([{
    username: currentUser.username, type, name, parent_id: tempParentId || null
  }]);
  catName.value = "";
  tempParentId = null;
  catName.placeholder = "分类名称";
  loadCategoryManager();
}

async function delCategory(id) {
  if (!confirm("确定删除？")) return;
  await sb.from("categories").delete().eq("id", id);
  loadCategoryManager();
}

// ==============================================
// 账户管理界面（管理员看全部，普通用户只看自己）
// ==============================================
async function loadAdmin() {
  let userList = [];

  // 管理员：看所有用户
  if (currentUser.role === "admin") {
    const { data } = await sb.from("users").select("*");
    userList = data;
  }
  // 普通用户：只看自己
  else {
    userList = [currentUser];
  }

  allUsers.innerHTML = userList.map(u => `
    <div style="padding:10px;border-bottom:1px solid #eee;
      display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      
      <div>
        <strong>${u.username}</strong> 
        ${u.role === "admin" ? "【管理员】" : "【用户】"} 
        ${u.status === "approved" ? "已启用" : "未审核"} 
        ${u.is_locked ? "已锁定" : ""}
      </div>

      <div style="display:flex; align-items:center; gap:8px;">
        <input type="password" id="pwd_${u.username}" placeholder="输入新密码" 
          style="padding:6px; border:1px solid #ddd; border-radius:6px; width:130px;">
        <button class="btn btn-sm" onclick="updatePwd('${u.username}')">保存密码</button>

        ${currentUser.role === "admin" ? `
          <button class="btn btn-sm" onclick="unlockUser('${u.username}')">解锁</button>
          <button class="btn btn-sm" onclick="approveUser('${u.username}')">启用</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

// 统一修改密码（管理员可改所有人，普通用户只能改自己）
async function updatePwd(username) {
  const newPwd = document.getElementById(`pwd_${username}`).value.trim();
  if (!newPwd) {
    alert("请输入新密码！");
    return;
  }
  await sb.from("users").update({ password: newPwd }).eq("username", username);
  alert("密码修改成功！");
  document.getElementById(`pwd_${username}`).value = "";
}

// 管理员专用
async function unlockUser(username) {
  await sb.from("users").update({ is_locked: false, error_count: 0 }).eq("username", username);
  loadAdmin();
}

async function approveUser(username) {
  await sb.from("users").update({ status: "approved" }).eq("username", username);
  loadAdmin();
}

async function adminAddUser() {
  const user = newUser.value.trim();
  const pwd = newPwd.value.trim();
  if (!user || !pwd) return;
  await sb.from("users").insert([{
    username: user, password: pwd, role: "user", status: "approved", error_count: 0, is_locked: false
  }]);
  newUser.value = "";
  newPwd.value = "";
  loadAdmin();
}
