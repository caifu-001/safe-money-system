// ====================== 用户中心 - 修改密码 ======================
async function updateMyPassword() {
  const oldPwd = document.getElementById("oldPassword").value.trim();
  const newPwd = document.getElementById("newPassword").value.trim();
  if (!oldPwd || !newPwd) {
    alert("请填写原密码和新密码");
    return;
  }
  // 验证原密码
  const { data } = await sb.from("users")
    .select("*")
    .eq("username", currentUser.username)
    .eq("password", oldPwd);
  
  if (!data || data.length === 0) {
    alert("原密码错误");
    return;
  }
  // 更新密码
  await sb.from("users")
    .update({ password: newPwd })
    .eq("username", currentUser.username);
  
  alert("密码修改成功，请重新登录");
  logout();
}

// ====================== 管理员 - 强制重置用户密码 ======================
async function adminResetPassword(username) {
  const newPwd = prompt("请输入新密码（将强制覆盖）：", "123456");
  if (!newPwd) return;
  await sb.from("users").update({ password: newPwd }).eq("username", username);
  alert("已重置该用户密码为：" + newPwd);
  loadAdmin();
}
