const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsImV4cCI6MjA4OTg2NjI4Mn0.PoZYNU7ShemdTA_HCAK3Sp9t2OfswFI9ttmsVeE98T0"
);

let currentUser = null;
let ttype = "expense";
let selectedCat;
let pie, bar;

const defaultCats = {
  income: [
    {name:"工资",icon:"bi-wallet2"},{name:"奖金"},{name:"兼职"},{name:"理财"},{name:"红包"}
  ],
  expense: [
    {name:"餐饮"},{name:"交通"},{name:"购物"},{name:"娱乐"},{name:"医疗"},{name:"教育"},{name:"住房"},{name:"通讯"}
  ]
};

// 页面加载恢复登录
window.onload = function() {
  const u = localStorage.getItem("currentUser");
  if (u) {
    currentUser = JSON.parse(u);
    auth.classList.add("hidden");
    app.classList.remove("hidden");
    userName.innerText = currentUser.username;
    if (currentUser.role === "admin") adminTab.classList.remove("hidden");
    initCats();
    loadAll();
  }
  generateCaptcha();
};

// 登录（带验证码 + 5次错误锁定）
async function login() {
  const user = loginUser.value.trim();
  const pwd = loginPwd.value.trim();
  const code = captchaInput.value.trim().toUpperCase();

  if (code !== correctCaptcha) {
    loginErr.innerText = "验证码错误";
    generateCaptcha();
    return;
  }

  const { data } = await sb.from("users").select("*").eq("username", user);
  if (!data.length) {
    loginErr.innerText = "账号不存在";
    generateCaptcha();
    return;
  }

  let u = data[0];

  // 锁定判断
  if (u.is_locked) {
    loginErr.innerText = "账号已锁定，请联系管理员解锁";
    return;
  }

  if (u.password !== pwd) {
    let err = u.error_count || 0;
    err++;
    await sb.from("users").update({ error_count: err }).eq("username", user);
    if (err >= 5) {
      await sb.from("users").update({ is_locked: true }).eq("username", user);
      loginErr.innerText = "密码错误5次，已锁定";
    } else {
      loginErr.innerText = "密码错误，剩余次数：" + (5 - err);
    }
    generateCaptcha();
    return;
  }

  // 登录成功
  await sb.from("users").update({ error_count: 0 }).eq("username", user);
  currentUser = u;
  localStorage.setItem("currentUser", JSON.stringify(u));
  auth.classList.add("hidden");
  app.classList.remove("hidden");
  userName.innerText = u.username;
  if (u.role === "admin") adminTab.classList.remove("hidden");
  initCats();
  loadAll();
}

// 注册
async function register() {
  const u = regUser.value.trim();
  const p = regPwd.value.trim();
  if (!u || !p) { regErr.innerText = "请填写完整"; return; }
  const { data } = await sb.from("users").select("*").eq("username", u);
  if (data.length) { regErr.innerText = "用户已存在"; return; }
  await sb.from("users").insert([{ 
    username: u, 
    password: p, 
    role: "user", 
    status: "pending", 
    error_count: 0, 
    is_locked: false 
  }]);
  alert("注册成功，等待审核");
  showLogin();
}

// 退出
function logout() {
  localStorage.removeItem("currentUser");
  location.reload();
}

// 页面切换
function switchPage(p) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(p).classList.remove("hidden");
  if (p === "charts") renderCharts();
  if (p === "adminPage") loadAdmin();
}

function showReg() { loginCard.classList.add("hidden"); regCard.classList.remove("hidden"); }
function showLogin() { regCard.classList.add("hidden"); loginCard.classList.remove("hidden"); }

// ------------------------------
// 以下是记账、分类、图表、管理员功能
// ------------------------------
async function initCats() {
  const { data } = await sb.from("categories").select("*").eq("username", currentUser.username);
  if (data.length) return;
  let arr = [];
  defaultCats.income.forEach(c => arr.push({ username: currentUser.username, type: "income", name: c.name }));
  defaultCats.expense.forEach(c => arr.push({ username: currentUser.username, type: "expense", name: c.name }));
  await sb.from("categories").insert(arr);
}

function setType(t) { ttype = t; loadCatSel(); }

async function loadCatSel() {
  const { data } = await sb.from("categories").select("*").eq("username", currentUser.username).eq("type", ttype);
  catSel.innerHTML = data.map(c => `<div class="category-item" onclick="selCat(this,'${c.name}')">${c.name}</div>`).join("");
}

function selCat(el, name) {
  document.querySelectorAll(".category-item").forEach(i => i.classList.remove("selected"));
  el.classList.add("selected");
  selectedCat = name;
}

function openModal() { modal.classList.remove("hidden"); tdate.valueAsDate = new Date(); loadCatSel(); }
function closeModal() { modal.classList.add("hidden"); }

async function saveRecord() {
  const amt = +amount.value;
  const dt = tdate.value;
  const nt = note.value;
  if (!amt || !selectedCat) return;
  await sb.from("transactions").insert([{
    username: currentUser.username, type: ttype, amount: amt, date: dt, note: nt, category: selectedCat
  }]);
  closeModal();
  loadAll();
}

async function loadAll() {
  loadOverview();
  loadRecords();
  loadCategory();
}

async function loadOverview() {
  const { data } = await sb.from("transactions").select("*").eq("username", currentUser.username);
  const inSum = data.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exSum = data.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  totalIncome.innerText = inSum;
  totalExpense.innerText = exSum;
  totalBalance.innerText = inSum - exSum;
}

async function loadRecords() {
  const { data } = await sb.from("transactions").select("*").eq("username", currentUser.username);
  recordList.innerHTML = data.reverse().map(t => `
    <div style="padding:10px;border-bottom:1px solid #eee">
      ${t.date} | ${t.category} | ${t.type==='income'?'+':'-'}${t.amount}
    </div>
  `).join("");
}

async function addCategory() {
  const n = catName.value.trim();
  const t = catType.value;
  if (!n) return;
  await sb.from("categories").insert([{ username: currentUser.username, type: t, name: n }]);
  loadCategory();
  catName.value = "";
}

async function loadCategory() {
  const { data } = await sb.from("categories").select("*").eq("username", currentUser.username);
  catList.innerHTML = data.map(c => `
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${c.name} (${c.type})
    </div>
  `).join("");
}

async function renderCharts() {}

// ------------------------------
// 管理员功能
// ------------------------------
async function loadAdmin() {
  const { data: users } = await sb.from("users").select("*");
  allUsers.innerHTML = users.map(u => `
    <div style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
      <span>${u.username} | ${u.status} | ${u.is_locked?'已锁定':'正常'}</span>
      <div>
        <button class="btn btn-primary" onclick="unlock('${u.username}')">解锁</button>
        <button class="btn btn-primary" onclick="approve('${u.username}')">审核</button>
      </div>
    </div>
  `).join("");
}

async function unlock(user) {
  await sb.from("users").update({ is_locked: false, error_count: 0 }).eq("username", user);
  loadAdmin();
}

async function approve(user) {
  await sb.from("users").update({ status: "approved" }).eq("username", user);
  loadAdmin();
}

async function adminAddUser() {
  const user = newUser.value.trim();
  const pwd = newPwd.value.trim();
  await sb.from("users").insert([{
    username: user, password: pwd, role: "user", status: "approved", error_count:0, is_locked:false
  }]);
  newUser.value = "";
  newPwd.value = "";
  loadAdmin();
}