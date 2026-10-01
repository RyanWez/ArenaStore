/**
 * Utility to translate upstream supplier descriptions into clean, faithful Myanmar text line-by-line.
 */

const PHRASE_DICTIONARY: [RegExp, string][] = [
  [/^(\s*)Plan\s*:\s*(.+)$/i, "$1⚡️ Plan: $2"],
  [/^(\s*)Duration\s*:\s*(\d+)\s*Months?/i, "$1⚡️ သက်တမ်း: $2 လ"],
  [/^(\s*)Duration\s*:\s*(\d+)\s*Days?/i, "$1⚡️ သက်တမ်း: $2 ရက်"],
  [/^(\s*)Access\s*:\s*On Your Account/i, "$1⚡️ အသုံးပြုခွင့်: မိမိကိုယ်ပိုင်အကောင့်တွင်"],
  [/^(\s*)Official Coupon Code/i, "$1⚡️ Official Coupon Code ဖြစ်ပါသည်"],
  [/^(\s*)No Warranty After Activation/i, "$1⚡️ Activate ဖြစ်ပြီးပါက Warranty မပါပါ"],
  [/^(\s*)Hold Warranty\s*(\d+)\s*days?/i, "$1⚡️ Hold Warranty $2 ရက် ပါဝင်ပါသည်"],
  [/^(\s*)No need any card/i, "$1⚡️ Card မည်သည့်အရာမှ ထည့်ရန်မလိုပါ"],
  [/^(\s*)Instant Delivery/i, "$1⚡️ ချက်ချင်း ပို့ဆောင်ပေးပါသည် (Instant Delivery)"],
  [/^(\s*)Fast & Easy Activation/i, "$1⚡️ လျင်မြန်လွယ်ကူစွာ Activate လုပ်နိုင်ပါသည်"],
  [/^(\s*)Ready to Use/i, "$1✅ အဆင်သင့် အသုံးပြုနိုင်ပါသည်"],
  [/^(\s*)Works Worldwide/i, "$1🌎 ကမ္ဘာတစ်ဝှမ်း မည်သည့်နေရာမှမဆို အသုံးပြုနိုင်ပါသည်"],
  [/^(\s*)full email Access \+ OTP/i, "$1Email အပြည့်အစုံ ဝင်ရောက်ခွင့် + OTP ရရှိပါမည်"],
  [/^(\s*)Format\s*:\s*(.+)$/i, "$1Format : $2"],
  [/^(\s*)(\d+)\s*Months?\s*Warranty/i, "$1✅ $2 လ Warranty ပါဝင်ပါသည်"],
  [/^(\s*)(\d+)\s*Days?\s*Warranty/i, "$1✅ $2 ရက် Warranty ပါဝင်ပါသည်"],
  [/^(\s*)Full Warranty/i, "$1🌟 Full Warranty အပြည့်အစုံ ပါဝင်ပါသည်"],
  [/^(\s*)Quick Guide/i, "💡 လမ်းညွှန်ချက် အကျဉ်း"],
  [/Just keep your account logged in in the browser/i, "Browser တွင် မိမိအကောင့်ကို Login ဝင်ထားပါ"],
  [/Open the link in a new tab and click Claim Offer/i, "Link ကို New Tab တွင်ဖွင့်၍ Claim Offer နှိပ်ပါ"],
  [/it will be activated automatically/i, "အလိုအလျောက် Activate ဖြစ်သွားပါမည်"],
  [/1 Device Only/i, "စက် ၁ လုံးအတွက်သာ အသုံးပြုရန် ဖြစ်ပါသည်"],
  [/Shared Account – Password Cannot Be Changed/i, "Shared Account ဖြစ်ပါသည် — Password ပြောင်းလဲ၍ မရပါ"],
  [/Replacement if the account stops working/i, "အကောင့်အသုံးပြုမရပါက အသစ်လဲလှယ်ပေးပါသည် (Replacement)"],
  [/Not for Reselling/i, "ပြန်လည်ရောင်းချရန် မဟုတ်ပါ"],
  [/Breaking the terms will void the warranty/i, "စည်းကမ်းချက်များ ချိုးဖောက်ပါက Warranty ပျက်ပြယ်ပါမည်"],
];

export function translateSupplierDescription(rawDesc: string): string {
  if (!rawDesc) return "";

  const lines = rawDesc.split("\n");
  const translatedLines = lines.map((line) => {
    let trimmed = line.trim();
    if (!trimmed) return "";

    // Remove any leading custom emoji placeholder tags like {pe:12345678}
    const cleanLine = trimmed.replace(/^\{pe:\d+\}\s*/g, "");

    for (const [pattern, replacement] of PHRASE_DICTIONARY) {
      if (pattern.test(cleanLine)) {
        return cleanLine.replace(pattern, replacement);
      }
    }

    return cleanLine;
  });

  return translatedLines.join("\n");
}
