import { asBool } from "../values.ts";
import { defaultsOf } from "../defaults.ts";

// 块绑定 / 签名检测：判断「改 thinking 块」在这台机器上会不会被后端拒掉或静默丢掉。
//
// 2026-11-21 R7，机制改了三次，最终以 SDK 原文为准：
//   block_binding 的原文（anthropic sdk beta messages.d.ts）：
//     "Controls for block binding: what happens when a thinking block this request sends back
//      fails the conversation check"
//   它挂在 BetaThinkingConfigAdaptive 与 BetaThinkingConfigEnabled 的 block_binding 字段下，
//   绑的就是 thinking 块。（中间有人说绑的是 system prompt 与 tools，那是 bedrock 那份文件的
//   注释，不是这个字段；这一条我在 consensus 里写错过，复核方用 SDK 类型定义纠正了我。）
//
// 真正的边界是两条：
//   Anthropic 家族：改 thinking 块会 400（签名覆盖内容），不是静默
//   OpenAI responses（GPT-6.2 起）：静默移除 reasoning item，原因记作 prefix_mismatch
//   本机之所以没事，真实原因是走 openai-completions，不是「签名是常量」。
//
// 判据必须对称（R7 复核：原来 anthropic 只看 provider、openai 只看 api，两个方向不一致）：
// 三条都要看——provider、api、模型名。因为聚合 provider（openrouter、自建中转）会把
// Anthropic 的模型按 openai-completions 转发出去，只看 api 会漏判。

export type Binding = {
  /** true 表示改写会被后端接受；false 表示只记账不改写。 */
  capture: boolean;
  reason: string;
  provider: string;
  api: string;
  model: string;
};

// 模型名里出现这些族就是 Anthropic 的块，不管前面挂了哪个聚合 provider。
// 网关类 provider：它自己不实现模型，转发到哪由它决定，插件看不见。
const GATEWAY = /(magpie|openrouter|relay|proxy|gateway|oneapi|newapi|litellm)/i;
// 模型名能看出后端族的（说明网关没把名字改掉），那就按族判，不必保守。
const KNOWN_FAMILY = /(anthropic|claude|opus|sonnet|haiku|fable|gpt|deepseek|kimi|qwen|glm|gemini)/i;
const ANTHROPIC_MODEL = /(anthropic\/|claude|opus-4-[78]|opus-5|sonnet-5|haiku-5|fable-5)/i;

export function detectBinding(model: any, opts: { allowGateway?: boolean } = {}): Binding {
  const provider = String(model?.provider || "");
  const api = String(model?.api || "");
  const id = String(model?.id || model?.model || "");
  const p = provider.toLowerCase();
  const a = api.toLowerCase();
  const base = { provider, api, model: id };

  // 一 provider 直连 Anthropic 家族（含 bedrock）
  if (p.includes("anthropic") || p.includes("bedrock")) {
    return { ...base, capture: false, reason: "anthropic-family provider" };
  }
  // 二 api 是 Anthropic 或 bedrock，与第一条对称：接口类型也判
  if (a.includes("anthropic") || a.includes("bedrock")) {
    return { ...base, capture: false, reason: "anthropic-family api" };
  }
  // 三 api 是 responses
  if (a.includes("responses")) {
    return { ...base, capture: false, reason: "openai-responses prefix_mismatch" };
  }
  // 四 网关类 provider 且模型名看不出后端族：后端未知，保守不改写（R7 复核第二轮指出）。
  // 本机用的 magpie 就是这一类：它转发到哪个后端，插件看不见；也许 Claude 也许 deepseek。
  // 默认保守（不改写），配置 allowGateway=true 时放行——这是取舍，不是判据。
  if (GATEWAY.test(p) && !KNOWN_FAMILY.test(id)) {
    return { ...base, capture: opts.allowGateway === true, reason: "backend unknown (gateway)" };
  }
  // 五 聚合 provider 转发 Anthropic 模型：接口看着普通，模型其实是 Claude
  if (ANTHROPIC_MODEL.test(id)) {
    return { ...base, capture: false, reason: "anthropic-family model via relay" };
  }
  return { ...base, capture: true, reason: "no binding check" };
}

export const label = (b: Binding) =>
  (b.capture ? "on" : "off") + " (provider=" + (b.provider || "?") + ", api=" + (b.api || "?") + ", model=" + (b.model || "?") + ", reason=" + b.reason + ")";


// 与其余五个模块同形状：自带 defaults 与 configure，加进来只改一处。
// 默认 allowGateway=false（保守）：网关类 provider 无法看出后端时按「会 400」处理。
// 本机若确实用它跑通，在配置里显式写 binding: { allowGateway: true }——
// 这是取舍（可用性 vs 一个可能的 400），不是判据，所以放配置不放常量。
//
// R8：此前 `r.allowGateway === true` 让字符串 "true" 读成 false——命令说「放开」，实际关着。
export default {
  name: "binding",
  defaults: defaultsOf("binding"),
  configure(raw: any) {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return { allowGateway: asBool(false, r.allowGateway, "binding.allowGateway") };
  },
};
