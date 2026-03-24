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

const iconMap = {
  "餐饮":"bi-cup-hot","交通":"bi-bus-front","购物":"bi-bag-handle",
  "娱乐":"bi-controller","医疗":"bi-hospital","教育":"bi-book",
  "住房":"bi-house","通讯":"bi-phone","工资":"bi-wallet","奖金":"bi-award"
};
function getIcon(name) { return iconMap[name] || "bi-tag"; }

// ====================== 初始化 ======================
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

// ====================== 页面切换 ======================
function switchPage(page) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(page).classList.remove("hidden");
  if (page === "charts") renderCharts();
  if (page === "budget") loadBudget();
  if (page === "category") loadCategoryManager();
}

// ====================== 登录/注册 ======================
function showReg(){ loginCard.classList.add("hidden"); regCard.classList.remove("hidden"); }
function showLogin(){ regCard.classList.add("hidden"); loginCard.classList.remove("hidden"); }

async function login() {
  const username = loginUser.value.trim();
  const password = loginPwd.value.trim();
  const captcha = captchaInput.value.trim().toUpperCase();

  if(captcha!==correctCaptcha){loginErr.innerText="验证码错误";generateCaptcha();return;}
  const {data} = await sb.from("users").select("*").eq("username",username);
  if(!data.length){loginErr.innerText="用户不存在";generateCaptcha();return;}
  const u = data[0];
  if(u.is_locked){loginErr.innerText="账号已锁定，请联系管理员";return;}
  if(u.password!==password){
    let e = u.error_count||0; e++;
    await sb.from("users").update({error_count:e}).eq("username",username);
    if(e>=5) await sb.from("users").update({is_locked:true}).eq("username",username);
    loginErr.innerText = e>=5?"密码错误5次已锁定":"密码错误，剩余"+(5-e)+"次";
    generateCaptcha(); return;
  }
  await sb.from("users").update({error_count:0}).eq("username",username);
  currentUser = u; localStorage.setItem("currentUser",JSON.stringify(u));
  auth.classList.add("hidden"); app.classList.remove("hidden");
  userName.innerText = u.username;
  if(u.role==="admin") adminTab.classList.remove("hidden");
  loadAll();
}

async function register(){
  const u=regUser.value.trim(), p=regPwd.value.trim();
  if(!u||!p){regErr.innerText="请填写完整";return;}
  await sb.from("users").insert([{username:u,password:p,role:"user",status:"pending",error_count:0,is_locked:false}]);
  alert("注册成功，等待审核"); showLogin();
}

function logout(){localStorage.removeItem("currentUser");location.reload();}

// ====================== 记账弹窗（主分类 + 子分类） ======================
function setType(type){
  ttype=type;
  if(type==="income"){tabIncome.classList.add("active");tabExpense.classList.remove("active");}
  else{tabExpense.classList.add("active");tabIncome.classList.remove("active");}
  loadMainCategories();
}

async function loadMainCategories(){
  const {data} = await sb.from("categories")
    .select("*").eq("username",currentUser.username).eq("type",ttype).is("parent_id",null);
  const g = document.getElementById("mainCategoryGrid");
  if(!data||data.length===0){g.innerHTML="<div style='grid-column:1/-1;padding:10px'>暂无主分类</div>";return;}
  g.innerHTML = data.map((c,i)=>`
    <div class="category-item ${i===0?'active':''}" onclick="selectMainCat(${c.id},'${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
  if(data.length>0) selectMainCat(data[0].id,data[0].name);
}

async function selectMainCat(id,name){
  selectedMainCategory = {id,name};
  document.querySelectorAll("#mainCategoryGrid .category-item").forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");
  loadSubCategories();
}

async function loadSubCategories(){
  const {data} = await sb.from("categories")
    .select("*").eq("username",currentUser.username).eq("parent_id",selectedMainCategory.id);
  const g = document.getElementById("subCategoryGrid");
  if(!data||data.length===0){
    g.innerHTML="<div style='grid-column:1/-1;padding:10px'>暂无子分类，可直接使用主分类</div>";
    selectedSubCategory=null; return;
  }
  g.innerHTML = data.map((c,i)=>`
    <div class="category-item ${i===0?'active':''}" onclick="selectSubCat('${c.name}')">
      <i class="${getIcon(c.name)}"></i><span>${c.name}</span>
    </div>
  `).join("");
  selectedSubCategory = data[0].name;
}

function selectSubCat(name){
  selectedSubCategory=name;
  document.querySelectorAll("#subCategoryGrid .category-item").forEach(el=>el.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

function openModal(){
  modal.classList.remove("hidden"); modalBox.classList.remove("hidden");
  tdate.valueAsDate = new Date(); setType("expense");
}
function closeModal(){modal.classList.add("hidden"); modalBox.classList.add("hidden");}

// ====================== 保存记账 ======================
async function saveRecord(){
  const amount = +amountEl.value;
  const date = tdate.value;
  const note = noteEl.value;
  const finalCat = selectedSubCategory || selectedMainCategory?.name;
  if(!amount || !finalCat){alert("请填写金额和分类");return;}

  await sb.from("transactions").insert([{
    username:currentUser.username, type:ttype, amount:amount,
    category:finalCat, date:date, note:note
  }]);
  closeModal(); loadAll();
}

// ====================== 数据统计 ======================
async function loadAll(){
  const {data:r} = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).order("date",{ascending:false});
  let inSum=0, outSum=0;
  r.forEach(i=>i.type==="income"?inSum+=i.amount:outSum+=i.amount);
  totalIncome.innerText=inSum; totalExpense.innerText=outSum; totalBalance.innerText=inSum-outSum;

  recentList.innerHTML = r.slice(0,10).map(i=>`
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}
    </div>
  `).join("");
  loadRecords();
}

async function loadRecords(){
  const {data} = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).order("date",{ascending:false});
  recordList.innerHTML = data.map(i=>`
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}
    </div>
  `).join("");
}

// ====================== 搜索统计 ======================
async function searchRecord(){
  const k = searchKey.value.trim();
  const {data} = await sb.from("transactions").select("*")
    .eq("username",currentUser.username)
    .or(`category.ilike.%${k}%,note.ilike.%${k}%`);
  searchResult.innerHTML = data.map(i=>`
    <div style="padding:8px;border-bottom:1px solid #eee">
      ${i.date} | ${i.category} | ${i.note||""} | ${i.type==="income"?"+":"-"}${i.amount}
    </div>
  `).join("");
  let total=0; data.forEach(i=>i.type==="expense"&&(total+=i.amount));
  searchStat.innerText = "搜索结果总支出："+total;
}

// ====================== 预算 ======================
async function setBudget(){
  const v=budgetVal.value;
  await sb.from("budget").upsert({username:currentUser.username,monthly:v},{onConflict:"username"});
  loadBudget();
}
async function loadBudget(){
  const now = new Date();
  const m = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
  const {data:b} = await sb.from("budget").select("*").eq("username",currentUser.username);
  const {data:r} = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).eq("type","expense").like("date",`${m}%`);
  const budget = b.length?b[0].monthly:0;
  const used = r.reduce((s,i)=>s+i.amount,0);
  budgetShow.innerText=budget; usedBudget.innerText=used; leftBudget.innerText=Math.max(0,budget-used);
}

// ====================== 图表 ======================
async function renderCharts(){
  const {data} = await sb.from("transactions").select("*")
    .eq("username",currentUser.username).eq("type","expense");
  const catMap={}, monMap={};
  data.forEach(i=>{
    catMap[i.category]=(catMap[i.category]||0)+i.amount;
    const m=i.date.slice(0,7); monMap[m]=(monMap[m]||0)+i.amount;
  });
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieChartEl.getContext("2d"),{
    type:"pie", data:{labels:Object.keys(catMap),datasets:[{data:Object.values(catMap)}]}
  });
  if(barChart) barChart.destroy();
  barChart = new Chart(barChartEl.getContext("2d"),{
    type:"bar", data:{labels:Object.keys(monMap),datasets:[{data:Object.values(monMap)}]}
  });
}

// ====================== 分类管理（支持添加子分类） ======================
async function loadCategoryManager(){
  const {data:main} = await sb.from("categories")
    .select("*").eq("username",currentUser.username).is("parent_id",null);
  let html="";
  for(let m of main){
    html+=`<div style='margin-bottom:16px'><strong style='display:flex;align-items:center;gap:6px'>
      <i class='${getIcon(m.name)}'></i>${m.name} 
      <button class='btn btn-sm' onclick='showAddSub(${m.id})'>+添加子分类</button>
    </strong>`;
    const {data:subs} = await sb.from("categories")
      .select("*").eq("username",currentUser.username).eq("parent_id",m.id);
    html+=`<div style='padding-left:20px;margin-top:4px'>`;
    for(let s of subs) html+=`
      <div style='padding:4px 0'>
        ${s.name} <button class='btn btn-sm' onclick='delCategory(${s.id})'>删除</button>
      </div>`;
    html+=`</div></div>`;
  }
  catList.innerHTML = html;
}

let tempParentId = null;
function showAddSub(pid){ tempParentId=pid; catName.placeholder="输入子分类名称"; }
async function addCategory(){
  const name = catName.value.trim();
  const type = catType.value;
  if(!name) return;
  await sb.from("categories").insert([{
    username:currentUser.username, type:type, name:name, parent_id:tempParentId||null
  }]);
  catName.value=""; tempParentId=null; catName.placeholder="分类名称";
  loadCategoryManager();
}
async function delCategory(id){
  if(!confirm("确定删除？")) return;
  await sb.from("categories").delete().eq("id",id);
  loadCategoryManager();
}

// ====================== 管理员 ======================
async function loadAdmin(){
  const {data} = await sb.from("users").select("*");
  allUsers.innerHTML = data.map(u=>`
    <div style='padding:8px;border-bottom:1px solid #eee;display:flex;justify-content:space-between'>
      <span>${u.username} | ${u.status} | ${u.is_locked?"锁定":"正常"}</span>
      <div>
        <button class='btn' onclick='unlockUser("${u.username}")'>解锁</button>
        <button class='btn' onclick='approveUser("${u.username}")'>审核</button>
      </div>
    </div>
  `).join("");
}
async function unlockUser(user){
  await sb.from("users").update({is_locked:false,error_count:0}).eq("username",user); loadAdmin();
}
async function approveUser(user){
  await sb.from("users").update({status:"approved"}).eq("username",user); loadAdmin();
}
async function adminAddUser(){
  const user=newUser.value, pwd=newPwd.value;
  await sb.from("users").insert([{username:user,password:pwd,role:"user",status:"approved",error_count:0,is_locked:false}]);
  newUser.value=""; newPwd.value=""; loadAdmin();
}
