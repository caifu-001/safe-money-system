const sb = supabase.createClient(
  "https://nvqqfmvtyqzxxcgoeriv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cXFmbXZ0eXF6eHhjZ29lcml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAyODIsImV4cCI6MjA5MDU4MzAyMH0.PoZYNU7qHXfUBmLrI54IFFYQtt92E"
);

let currentUser = null;
let ttype = "expense";
let selected = [];
let pieChart = null;
let barChart = null;

const iconMap = {
  "餐饮":"bi-cup-hot","交通":"bi-bag-front","购物":"bi-bag-handle",
  "娱乐":"bi-controller","医疗":"bi-hospital","教育":"bi-book",
  "住房":"bi-house","通讯":"bi-phone","工资":"bi-wallet","奖金":"bi-award"
};

function getIcon(name) { return iconMap[name] || "bi-tag"; }

window.onload = function () {
  const user = localStorage.getItem("currentUser");
  if (user) {
    currentUser = JSON.parse(user);
    document.getElementById("userName").innerText = currentUser.username;
    if (currentUser.role === "admin") {
      document.getElementById("adminTab").classList.remove("hidden");
    }
    loadAll();
  }
};

function go(page) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById(page).classList.add("active");
  if (page === "charts") renderCharts();
  if (page === "budget") loadBudget();
  if (page === "category") loadCategoryManager();
  if (page === "adminPage") loadAdmin();
}

async function getCats(parentId) {
  const { data } = await sb.from("categories")
    .select("*").eq("username", currentUser.username).eq("type", ttype).eq("parent_id", parentId || null);
  return data || [];
}

async function loadLv(level, parentId) {
  const list = await getCats(parentId);
  const el = document.getElementById(`lv${level}`);
  if (!el) return;
  el.innerHTML = list.map(c => `
    <div class="category-item" onclick="sel(${level},${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i> ${c.name}
    </div>
  `).join("");
  for (let i = level + 1; i <= 5; i++) {
    const e = document.getElementById(`lv${i}`);
    if (e) e.innerHTML = "";
  }
}

async function sel(level, id, name) {
  selected[level] = { id, name };
  for (let i = level + 1; i <= 5; i++) selected[i] = null;
  document.querySelectorAll(`#lv${level} .category-item`).forEach(e => e.classList.remove("active"));
  event.currentTarget.classList.add("active");
  loadLv(level + 1, id);
}

function openModal() {
  document.getElementById("modal").style.display = "flex";
  selected = [];
  for (let i = 2; i <= 5; i++) {
    const e = document.getElementById(`lv${i}`);
    if (e) e.innerHTML = "";
  }
  loadLv(1, null);
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

async function save() {
  const amount = +document.getElementById("amount").value;
  const date = document.getElementById("tdate").value;
  const note = document.getElementById("note").value;
  let catName = null;
  for (let i = 5; i >= 1; i--) {
    if (selected[i]?.name) {
      catName = selected[i].name;
      break;
    }
  }
  if (!amount || !catName) {
    alert("请填写金额并选择分类");
    return;
  }
  await sb.from("transactions").insert([{
    username: currentUser.username, type: ttype, amount, category: catName, date, note
  }]);
  closeModal();
  loadAll();
}

async function loadAll() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });

  let inSum = 0, outSum = 0;
  data.forEach(i => i.type === "income" ? inSum += i.amount : outSum += i.amount);
  document.getElementById("totalIncome").innerText = inSum;
  document.getElementById("totalExpense").innerText = outSum;
  document.getElementById("totalBalance").innerText = inSum - outSum;

  document.getElementById("recentList").innerHTML = data.slice(0, 10).map(i => `
    <div>${i.date} | ${i.category} | ${i.note || ""} | ${i.type === "income" ? "+" : "-"}${i.amount}</div>
  `).join("");
  loadRecords();
}

async function loadRecords() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).order("date", { ascending: false });
  document.getElementById("recordList").innerHTML = data.map(i => `
    <div>${i.date} | ${i.category} | ${i.note || ""} | ${i.type === "income" ? "+" : "-"}${i.amount}</div>
  `).join("");
}

async function searchRecord() {
  const k = event.target.value.trim();
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username)
    .or(`category.ilike.%${k}%,note.ilike.%${k}%`);
  document.getElementById("searchResult").innerHTML = data.map(i => `
    <div>${i.date} | ${i.category} | ${i.amount}</div>
  `).join("");
}

async function setBudget() {
  const v = document.getElementById("budgetVal").value;
  await sb.from("budget").upsert({ username: currentUser.username, monthly: v }, { onConflict: "username" });
  loadBudget();
}

async function loadBudget() {
  const m = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
  const { data: b } = await sb.from("budget").select("*").eq("username", currentUser.username);
  const { data: r } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type", "expense").like("date", `${m}%`);
  const bud = b.length ? b[0].monthly : 0;
  const used = r.reduce((s, i) => s + i.amount, 0);
  document.getElementById("budgetShow").innerText = bud;
  document.getElementById("usedBudget").innerText = used;
  document.getElementById("leftBudget").innerText = Math.max(0, bud - used);
}

async function renderCharts() {
  const { data } = await sb.from("transactions")
    .select("*").eq("username", currentUser.username).eq("type", "expense");
  const cat = {}, mon = {};
  data.forEach(i => {
    cat[i.category] = (cat[i.category] || 0) + i.amount;
    mon[i.date.slice(0, 7)] = (mon[i.date.slice(0, 7)] || 0) + i.amount;
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pie"), {
    type: "pie", data: { labels: Object.keys(cat), datasets: [{ data: Object.values(cat) }] }
  });

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById("bar"), {
    type: "bar", data: { labels: Object.keys(mon), datasets: [{ data: Object.values(mon) }] }
  });
}

async function loadCategoryManager() {
  async function build(pid, indent) {
    const list = await getCats(pid);
    let html = "";
    for (const c of list) {
      html += `
        <div style="${indent}padding:4px 0;display:flex;gap:6px;align-items:center">
          <span>${c.name}</span>
          <button class="btn btn-sm" onclick="addSub(${c.id})">+下级</button>
          <button class="btn btn-sm" onclick="delCat(${c.id})">删</button>
        </div>
      `;
      html += await build(c.id, indent + "margin-left:20px;");
    }
    return html;
  }
  document.getElementById("catList").innerHTML = await build(null, "");
}

async function addSub(pid) {
  const name = prompt("输入分类名称");
  if (!name) return;
  await sb.from("categories").insert([{
    username: currentUser.username, type: ttype, name, parent_id: pid
  }]);
  loadCategoryManager();
}

async function delCat(id) {
  if (!confirm("确定删除？")) return;
  await sb.from("categories").delete().eq("id", id);
  loadCategoryManager();
}

async function addCategory() {
  const name = document.getElementById("catName").value.trim();
  if (!name) return;
  await sb.from("categories").insert([{
    username: currentUser.username, type: ttype, name, parent_id: null
  }]);
  document.getElementById("catName").value = "";
  loadCategoryManager();
}

// ==============================
// 用户管理（管理员：增删改）
// ==============================
async function loadAdmin() {
  let list = [];
  if (currentUser.role === "admin") {
    const { data } = await sb.from("users").select("*");
    list = data;
  } else {
    list = [currentUser];
  }

  let html = "";
  if (currentUser.role === "admin") {
    html += `
      <div style="padding:10px;border:1px solid #eee;border-radius:8px;margin-bottom:10px">
        <input class="form-control" id="newUser" placeholder="用户名"><br>
        <input class="form-control" id="newPwd" type="password" placeholder="密码"><br>
        <button class="btn" onclick="addUser()">添加账号</button>
      </div>
    `;
  }

  html += list.map(u => `
    <div style="padding:10px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">
      <div>${u.username} ${u.role === "admin" ? "【管理员】" : ""}</div>
      <div style="display:flex;gap:6px">
        <input type="password" id="p_${u.username}" placeholder="密码" style="width:100px">
        <button class="btn btn-sm" onclick="updPwd('${u.username}')">改密</button>
        ${currentUser.role === "admin" ? `
          <button class="btn btn-sm" style="background:#e53935" onclick="delUser('${u.username}')">删除</button>
        ` : ""}
      </div>
    </div>
  `).join("");

  document.getElementById("allUsers").innerHTML = html;
}

async function updPwd(username) {
  const p = document.getElementById(`p_${username}`).value.trim();
  if (!p) return alert("请输入密码");
  await sb.from("users").update({ password: p }).eq("username", username);
  alert("修改成功");
}

async function delUser(username) {
  if (username === currentUser.username) return alert("不能删除自己");
  if (!confirm("确定删除该用户及所有数据？")) return;
  await sb.from("transactions").delete().eq("username", username);
  await sb.from("categories").delete().eq("username", username);
  await sb.from("budget").delete().eq("username", username);
  await sb.from("users").delete().eq("username", username);
  alert("删除成功");
  loadAdmin();
}

async function addUser() {
  const u = document.getElementById("newUser").value.trim();
  const p = document.getElementById("newPwd").value.trim();
  if (!u || !p) return alert("请填写完整");
  await sb.from("users").insert([{
    username: u, password: p, role: "user", status: "approved", error_count: 0, is_locked: false
  }]);
  alert("添加成功");
  document.getElementById("newUser").value = "";
  document.getElementById("newPwd").value = "";
  loadAdmin();
}

function logout() {
  localStorage.removeItem("currentUser");
  location.reload();
}
