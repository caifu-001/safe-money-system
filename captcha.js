let correctCaptcha = "";
window.onload = generateCaptcha();

function generateCaptcha() {
  const canvas = document.getElementById("captcha");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  correctCaptcha = code;
  
  ctx.font = "24px Arial";
  ctx.fillStyle = "#333";
  ctx.fillText(code, 15, 30);
  
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(Math.random() * 120, Math.random() * 40);
    ctx.lineTo(Math.random() * 120, Math.random() * 40);
    ctx.stroke();
  }
}

document.getElementById("captcha").onclick = generateCaptcha;