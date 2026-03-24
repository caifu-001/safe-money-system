const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsImV4cCI6MjA4OTg2NjI4Mn0.PoZYNU7ShemdTA_HCAK3Sp9t2OfswFI9ttmsVeE98T0"
);

let currentUser = null;
let ttype = "expense";
let selectedCategory = "";
let pieChart = null;
let barChart = null;

const expenseCategories = [
  { name: "餐饮", icon: "bi-cup-hot" },
  { name: "交通", icon: "bi-bus-front" },
  { name: "购物", icon: "bi-bag-handle" },
  { name: "娱乐", icon: "bi-controller" },
  { name: "医疗", icon: "bi-hospital" },
  { name: "教育", icon: "bi-book" },
  { name: "住房", icon: "bi-house" },
  { name: "通讯", icon: "bi-phone" }
];

const incomeCategories = [
  { name: "工资", icon: "bi-wallet" },
  { name: "奖金", icon: "bi-award" },
  { name: "兼职", icon: "bi-person-workspace" },
  { name: "理财", icon: "bi-graph-up" }
];

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
  renderCategories();
}

function renderCategories() {
  const list = ttype === "expense" ? expenseCategories : incomeCategories;
  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = list.map((c, idx) => `
    <div class="category-item ${idx === 0 ? 'active' : ''}" onclick="selectCategory('${c.name}')">
      <i class="${c.icon}"></i>
      <span>${c.name}</span>
    </div>
  `).join("");
  if (list.length > 0) selectCategory(list[0].name);
}

function selectCategory(name) {
  selectedCategory = name;
  document.querySelectorAll(".category-item").forEach(el => {
    el.classList.remove("active");
    if (el.innerText.trim() === name) el.classList.add("active");
  });
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
  const amount = +document.getElementById("amount").value;
  const date = document.getElementById("tdate").value;
  const note = document.getElementById("note").value;

  if (!amount || !selectedCategory) {
    alert("请填写金额和类目");
    return;
  }

  await sb.from("transactions").insert([{
    username: currentUser.username,
    type: ttype,
    amount: amount,
    category: selectedCategory,
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
  document.getElementById("leftBudget").innerText = left < 0 ? 0 : left;
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

  const ctxPie = document.getElementById("pieChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctxPie, {
    type: "pie",
    data: { labels: Object.keys(cateMap), datasets: [{ data: Object.values(cateMap) }] }
  });

  const ctxBar = document.getElementById("barChart").getContext("2d");
  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: "bar",
    data: { labels: Object.keys(monthMap), datasets: [{ data: Object.values(monthMap) }] }
  });
}

async function loadAdmin() {
  const { data } = await sb.from("users").select("*");
  document.getElementById("allUsers").innerHTML = data.map(u => `
    <div style="padding:8px;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
      <span>${u.username} | ${u.status} | ${u.is_locked ? "锁定" : "正常"}</span>
      <div>
        <button class="btn" onclick="unlockUser('${u.username}')">解锁</button>
        <button class="btn" onclick="approveUser('${u.username}')">审核</button>
      </div>
    </div>
  `).join("");
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
    username: user, password: pwd, role: "user", status: "approved", error_count:0, is_locked:false
  }]);
  document.getElementById("newUser").value = "";
  document.getElementById("newPwd").value = "";
  loadAdmin();
}
