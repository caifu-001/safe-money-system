let correctCaptcha = "";
window.onload = generateCaptcha();

function generateCaptcha(){
  const canvas = document.getElementById("captcha");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,120,40);
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  correctCaptcha = code;
  ctx.font = "24px Arial";
  ctx.fillText(code,15,30);
}
document.getElementById("captcha").onclick = generateCaptcha;
