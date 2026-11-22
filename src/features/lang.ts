
import { asBool, asEnum } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 语言守护：非目标语言的行数 > 目标语言的行数就判（使用者的定义，2026-11-19）。
//
// R12：删掉了 ratio 与 blockRatio 两个配置。它们是 R5 引入的「字符比」判据的参数，
// 那条判据已删（实测它比使用者的定义多判红 51%），参数跟着走。
export default {
  name: "lang",
  defaults: defaultsOf("lang"),
  configure(raw: any) {
    // 旧形状：配置里直接写 "zh" 或 "en"。
    if (typeof raw === "string") {
      return { on: true, dir: asEnum("zh", raw, ["zh", "en"] as const, "lang.dir") };
    }
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      on: asBool(true, r.on, "lang.on"),
      dir: asEnum("zh", r.dir, ["zh", "en"] as const, "lang.dir"),
    };
  },
};
