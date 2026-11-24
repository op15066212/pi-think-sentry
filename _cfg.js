const fs = require("fs");
const p = "settings.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
s.prefix = { on: true, min: 0.5 };       // 判据修好了，默认该开
s.run = { on: false, minLen: 12 };        // 真实数据误报 63.8%，保持关闭
s.unified = { on: false, min: 0.6 };      // 真实数据 0 命中，留着观察
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n", "utf8");
console.log("settings.json 已更新");
