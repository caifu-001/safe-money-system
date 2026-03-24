// ==============================================
// 全局数据（本地模拟，无Supabase，不报错）
// ==============================================
let currentUser = { username: "test", role: "admin" };
let ttype = "expense";
let selectedCategories = [];

let pieChart = null;
let barChart = null;

let transactions = JSON.parse(localStorage.getItem("transactions")) || [];
let categories = JSON.parse(localStorage.getItem("categories")) || [];
let budget = JSON.parse(localStorage.getItem("budget")) || { monthly: 0 };
let users = [{ username: "test", password: "123", role: "admin" }];

const iconMap = {
  "餐饮":"bi-cup-hot","交通":"bi-bus-front","购物":"bi-bag-handle",
  "娱乐":"bi-controller","医疗":"bi-hospital","教育":"bi-book",
  "住房":"bi-house","通讯":"bi-phone","工资":"bi-wallet","奖金":"bi-award"
};
function getIcon(name) { return iconMap[name] || "bi-tag"; }

// ==============================================
// 初始化
// ==============================================
window.onload = function () {
  document.getElementById("userName")?.innerText = currentUser.username;
  loadAll();
};

function switchPage(page) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  if (page === "charts") renderCharts();
  if (page === "budget") loadBudget();
  if (page === "category") loadCategoryManager();
  if (page === "adminPage") loadAdmin();
}

function setType(t) { ttype = t; }

// ==============================================
// 5级分类核心
// ==============================================
function getCatsByParent(parentId) {
  return categories.filter(c =>
    c.username === currentUser.username &&
    c.type === ttype &&
    ((c.parent_id === null && parentId == null) || c.parent_id === parentId)
  );
}

function renderCategoryLevel(level, parentId) {
  const list = getCatsByParent(parentId);
  const el = document.getElementById(`level${level}`);
  if (!el) return;
  el.innerHTML = list.map(c => `
    <div class="category-item" onclick="selectCategory(${level},'${c.id}','${c.name}')">
      <i class="${getIcon(c.name)}"></i> ${c.name}
    </div>
  `).join("");

  for (let i = level + 1; i <= 5; i++) {
    const e = document.getElementById(`level${i}`);
    if (e) e.innerHTML = "";
  }
}

function selectCategory(level, id, name) {
  selectedCategories[level] = { id, name };
  for (let i = level + 1; i <= 5; i++) selectedCategories[i] = null;

  document.querySelectorAll(`#level${level} .category-item`).forEach(e => e.classList.remove("active"));
  event.currentTarget.classList.add("active");

  renderCategoryLevel(level + 1, id);
}

function openModal() {
  document.getElementById("modal").style.display = "flex";
  selectedCategories = [];
  for (let i = 2; i <= 5; i++) {
    const e = document.getElementById(`level${i}`);
    if (e) e.innerHTML = "";
  }
  renderCategoryLevel(1, null);
  document.getElementById("tdate").valueAsDate = new Date();
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

// ==============================================
// 保存记账
// ==============================================
function saveRecord() {
  const amount = +document.getElementById("amountEl").value;
  const date = document.getElementById("tdate").value;
  const note = document.getElementById("noteEl").value;

  let finalCat = null;
  for (let i = 5; i >= 1; i--) {
    if (selectedCategories[i]?.name) {
      finalCat = selectedCategories[i].name;
      break;
    }
  }

  if (!amount || !finalCat) {
    alert("请输入金额并选择分类");
    return;
  }

  const record = {
    id: Date.now(),
    username: currentUser.username,
    type: ttype,
    amount,
    category: finalCat,
    date,
    note
  };

  transactions.unshift(record);
  localStorage.setItem("transactions", JSON.stringify(transactions));

  closeModal();
  loadAll();
}

// ==============================================
// 加载数据
// ==============================================
function loadAll() {
  let inSum = 0, outSum = 0;
  transactions.forEach(t => {
    if (t.type === "income") inSum += t.amount;
    else outSum += t.amount;
  });

  document.getElementById("totalIncome").innerText = inSum;
  document.getElementById("totalExpense").innerText = outSum;
  document.getElementById("totalBalance").innerText = inSum - outSum;

  document.getElementById("recentList").innerHTML = transactions.slice(0, 10).map(t => `
    <div>${t.date} | ${t.category} | ${t.note || ""} | ${t.type === "income" ? "+" : "-"}${t.amount}</div>
  `).join("");

  loadRecords();
}

function loadRecords() {
  document.getElementById("recordList").innerHTML = transactions.map(t => `
    <div>${t.date} | ${t.category} | ${t.note || ""} | ${t.type === "income" ? "+" : "-"}${t.amount}</div>
  `).join("");
}

function searchRecord() {
  const k = document.getElementById("searchKey").value.trim().toLowerCase();
  const list = transactions.filter(t =>
    t.category.toLowerCase().includes(k) ||
    (t.note || "").toLowerCase().includes(k)
  );
  document.getElementById("searchResult").innerHTML = list.map(t => `
    <div>${t.date} | ${t.category} | ${t.amount}</div>
  `).join("");
}

// ==============================================
// 预算
// ==============================================
function setBudget() {
  const v = +document.getElementById("budgetVal").value;
  budget.monthly = v;
  localStorage.setItem("budget", JSON.stringify(budget));
  loadBudget();
}

function loadBudget() {
  const now = new Date();
  const month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const used = transactions
    .filter(t => t.type === "expense" && t.date.startsWith(month))
    .reduce((s, t) => s + t.amount, 0);

  document.getElementById("budgetShow").innerText = budget.monthly;
  document.getElementById("usedBudget").innerText = used;
  document.getElementById("leftBudget").innerText = Math.max(0, budget.monthly - used);
}

// ==============================================
// 图表
// ==============================================
function renderCharts() {
  const expense = transactions.filter(t => t.type === "expense");
  const catMap = {};
  const monthMap = {};

  expense.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    const m = t.date.slice(0, 7);
    monthMap[m] = (monthMap[m] || 0) + t.amount;
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pieChartEl"), {
    type: "pie",
    data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap) }] }
  });

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById("barChartEl"), {
    type: "bar",
    data: { labels: Object.keys(monthMap), datasets: [{ data: Object.values(monthMap) }] }
  });
}

// ==============================================
// 分类管理
// ==============================================
function loadCategoryManager() {
  function build(pid, indent) {
    const list = getCatsByParent(pid);
    let html = "";
    list.forEach(c => {
      html += `
        <div style="${indent}padding:6px 0;display:flex;gap:6px;align-items:center">
          <span>${c.name}</span>
          <button class="btn btn-sm" onclick="addSub('${c.id}')">+下级</button>
          <button class="btn btn-sm" onclick="delCat('${c.id}')">删</button>
        </div>
      `;
      html += build(c.id, indent + "margin-left:20px;");
    });
    return html;
  }
  document.getElementById("catList").innerHTML = build(null, "");
}

function addSub(pid) {
  const name = prompt("分类名称：");
  if (!name) return;
  categories.push({
    id: Date.now().toString(),
    username: currentUser.username,
    type: ttype,
    name,
    parent_id: pid
  });
  localStorage.setItem("categories", JSON.stringify(categories));
  loadCategoryManager();
}

function delCat(id) {
  if (!confirm("确定删除？")) return;
  categories = categories.filter(c => c.id !== id);
  localStorage.setItem("categories", JSON.stringify(categories));
  loadCategoryManager();
}

function addCategory() {
  const name = document.getElementById("catName").value.trim();
  if (!name) return;
  categories.push({
    id: Date.now().toString(),
    username: currentUser.username,
    type: ttype,
    name,
    parent_id: null
  });
  document.getElementById("catName").value = "";
  localStorage.setItem("categories", JSON.stringify(categories));
  loadCategoryManager();
}

// ==============================================
// 用户管理
// ==============================================
function loadAdmin() {
  let html = `
    <div style="padding:12px;border:1px solid #eee;border-radius:8px;margin-bottom:16px">
      <input id="newUser" placeholder="用户名" style="margin-bottom:8px">
      <input id="newPwd" type="password" placeholder="密码">
      <button class="btn btn-sm" onclick="adminAddUser()">添加</button>
    </div>
  `;
  html += users.map(u => `
    <div style="padding:12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
      <div>${u.username} ${u.role === "admin" ? "(管理员)" : ""}</div>
      <div>
        <button class="btn btn-sm" onclick="delUser('${u.username}')">删除</button>
      </div>
    </div>
  `).join("");
  document.getElementById("allUsers").innerHTML = html;
}

function adminAddUser() {
  const u = document.getElementById("newUser").value.trim();
  const p = document.getElementById("newPwd").value.trim();
  if (!u || !p) return alert("请填写完整");
  users.push({ username: u, password: p, role: "user" });
  alert("添加成功");
  loadAdmin();
}

function delUser(user) {
  if (user === currentUser.username) return alert("不能删除自己");
  if (!confirm("确定删除？")) return;
  users = users.filter(u => u.username !== user);
  loadAdmin();
}

// ==============================================
// 退出
// ==============================================
function logout() {
  localStorage.clear();
  location.reload();
}
