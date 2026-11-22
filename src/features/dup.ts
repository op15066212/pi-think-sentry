import { DUP_MIN } from "../judges.ts";
import { threshold } from "../threshold.ts";
import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 重复行守护：同一行出现够 min 次就判不合格。
// 只管判，不管删。删是 strip 模块的事，两者门槛各自可调。
//
// 2026-11-22 删掉这里原来的 judge 字段：它没有任何调用点（判据入口是 judges.judgeThinking），
// 留着会让形状看起来像「每个模块自带判据」的多态，实际是一处 if 链。
// 配置单元就是配置单元，不兼职判据单元——这叫让形状与实现对齐，不是少写几行。
//
// R8：类型转换交给 values.ts。此前 `r.on === false ? false : true` 让字符串 "false"
// 读成 true——命令写「关」，实际开着，而且返回值看起来是成功。
export default {
  name: "dup",
  defaults: defaultsOf("dup"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const on = asBool(true, r.on, "dup.on");
    const min = threshold(r.min, DUP_MIN, "dup.min");
    // 判据的配置由 index.ts 投影成 JudgeCfg 传下去（2026-11-22）：这里不写全局。
    return { on, min };
  },
};
