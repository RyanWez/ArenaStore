import { getDb, products } from "@arena/db";
import { eq } from "drizzle-orm";

export const MYANMAR_PRODUCT_DESCRIPTIONS: Record<number, string> = {
  // 1: Claude $100 API Key 1 Month (Upstream 50)
  50: `💰 $100 API Credits
🗓 ရက် ၃၀ သက်တမ်း
🌐 API Gateway မှတစ်ဆင့် ချိတ်ဆက်ရန်
⚡️ လွယ်ကူလျင်မြန်စွာ စတင်အသုံးပြုနိုင်ပါသည်

🔓 စတင်အသုံးပြုနည်း အဆင့်ဆင့်:
1️⃣ api.mwapi.dev တွင် Sign up လုပ်ပါ
2️⃣ ရရှိသော Code ကို Redeem ပြုလုပ်၍ API Credits ရယူပါ
3️⃣ API Gateway မှတစ်ဆင့် ချိတ်ဆက်ပါ
4️⃣ API ကို ချက်ချင်း စတင် အသုံးပြုနိုင်ပါပြီ

🚨 အရေးကြီးချက်:
ဤပစ္စည်းကို Redeem Code အနေဖြင့် ပေးပို့မည်ဖြစ်ပြီး API အသုံးမပြုမီ သတ်မှတ် Website တွင် Code ကို အရင် Redeem လုပ်ရပါမည်။`,

  // 2: ResearchGate — 6 Months Access (Upstream 48)
  48: `🔬 သုတေသီများနှင့် ကျောင်းသားများအတွက် အထူးသင့်လျော်ပါသည်
🔖 ပညာရေးဆိုင်ရာ သုတေသနနှင့် စာတမ်း အချက်အလက်များ
🌎 ကမ္ဘာတစ်ဝှမ်း မည်သည့်နေရာမှမဆို ဝင်ရောက်အသုံးပြုနိုင်ပါသည်
⚡️ လျင်မြန်လွယ်ကူစွာ Activate ပြုလုပ်နိုင်ပါသည်
✅ ၁ လ အာမခံ ပါဝင်ပါသည်`,

  // 3: Duolingo Super 12 Months (Upstream 47)
  47: `⚡️ Plan: Super
⚡️ သက်တမ်း: 12 လ
⚡️ အသုံးပြုခွင့်: မိမိကိုယ်ပိုင်အကောင့်တွင်
⚡️ Official Coupon Code ဖြစ်ပါသည်
⚡️ Activate ဖြစ်ပြီးပါက Warranty မပါပါ
⚡️ Hold Warranty 5 ရက် ပါဝင်ပါသည်
⚡️ Card မည်သည့်အရာမှ ထည့်ရန်မလိုပါ

💡 လမ်းညွှန်ချက် အကျဉ်း
⚡️ Browser တွင် မိမိအကောင့်ကို Login ဝင်ထားပါ။ Link ကို New Tab တွင်ဖွင့်၍ Claim Offer နှိပ်ပါက အလိုအလျောက် Activate ဖြစ်သွားပါမည်။`,

  // 4: Eleven Reader — 12 Months Ultra Plan (Upstream 46)
  46: `🚀 Ultra လုပ်ဆောင်ချက်များ:
• ♾️ Unlimited Text-to-Audio — စာသားများကို အသံပြောင်း နားဆင်နိုင်ပါသည်
• 🎶 Premium Audiobooks & eBooks ၂၀၀,၀၀၀ ကျော်
• 📥 Offline နားဆင်ခြင်းနှင့် Downloads ရယူနိုင်ခြင်း
• 🗣️ မိမိစိတ်ကြိုက် AI Voices ဖန်တီးနိုင်ခြင်း
• 🌎 သဘာဝကျသော AI အသံ ၁,၀၀၀ ကျော် နှင့် ဘာသာစကား ၃၀ ကျော်
• 🎁 Playback Speed 4× အထိ တင်နိုင်ပြီး Web & Mobile ချိတ်ဆက်နိုင်ပါသည်`,

  // 5: Autodesk Admin Panel — 3 Years (Upstream 45)
  45: `🎓 User ၃,၀၀၀ အထိ Invitations စီမံခန့်ခွဲနိုင်ပါသည်
AutoCAD • Revit • 3ds Max • Maya • Fusion • Inventor စသည့် Education Apps များ ပါဝင်ပါသည်

🎁 အချက်အလက်များ:
✅ ၃ နှစ် သက်တမ်း အသုံးပြုခွင့်
✅ Admin Panel အသုံးပြုခွင့်
✅ User ပေါင်း ၃,၀၀၀ အထိ ဖိတ်ခေါ်စီမံနိုင်ခြင်း
✅ Login Warranty နှင့် After-Sales Support ပါဝင်ပါသည်
📦 Delivery Format: Gmail | Password | Recovery
⚡️ ချက်ချင်း ပို့ဆောင်ပေးပြီး အလွယ်တကူ စတင်နိုင်ပါသည်`,

  // 6: JetBrains Premium (Upstream 44)
  44: `⚡️ Instant Delivery (ချက်ချင်း ပို့ဆောင်ပေးပါသည်)
🔑 အဆင်သင့် အသုံးပြုနိုင်သော အကောင့်
🚀 JetBrains Developer Tools အားလုံး အသုံးပြုနိုင်ပါသည်
👩‍💻 Programmer များနှင့် Developers များအတွက် အထူးသင့်လျော်ပါသည်
🌎 ကမ္ဘာတစ်ဝှမ်း မည်သည့်နေရာမှမဆို အသုံးပြုနိုင်ပါသည်
📦 လျင်မြန်လွယ်ကူစွာ Activate လုပ်နိုင်ပါသည်`,

  // 7: Gmail Account (Upstream 43)
  43: `⚡️ Instant Delivery (ချက်ချင်း ပို့ဆောင်ပေးပါသည်)
✉️ Gmail Account Access အပြည့်အစုံ ရရှိပါမည်
✅ အဆင်သင့် အသုံးပြုနိုင်ပါသည်
🌎 မည်သည့်နေရာမှမဆို အလွယ်တကူ ဝင်ရောက်နိုင်ပါသည်
🚀 လွယ်ကူမြန်ဆန်သော Setup`,

  // 8: Nord vpn 1 month (Upstream 42)
  42: `⚡️ Instant Delivery (ချက်ချင်း ပို့ဆောင်ပေးပါသည်)
📱 စက် ၁ လုံးအတွက်သာ အသုံးပြုရန် ဖြစ်ပါသည်
🛡 Shared Account ဖြစ်ပါသည် — Password ပြောင်းလဲ၍ မရပါ
🛡️ အကောင့်အသုံးပြုမရပါက အသစ်လဲလှယ်ပေးပါသည် (Replacement)
🚫 ပြန်လည်ရောင်းချရန် မဟုတ်ပါ
⚠️ စည်းကမ်းချက်များ ချိုးဖောက်ပါက Warranty ပျက်ပြယ်ပါမည်`,

  // 9: Autodesk All Apps | 3-Year License (Upstream 41)
  41: `🔥 Professional Autodesk Apps ၃၄ မျိုးကျော်ကို Package တစ်ခုတည်းဖြင့် ရရှိပါမည်!
AutoCAD, Revit, 3ds Max, Maya, Civil 3D, Inventor, Fusion စသည်တို့ အားလုံး ပါဝင်ပါသည်

⌛ လိုင်စင်သက်တမ်း: ၃ နှစ်
🎁 အချိန်အကန့်အသတ် အထူးအစီအစဉ်!`,

  // 10: Adobe Express 12 Month (Activation Link) (Upstream 40)
  40: `✅ Adobe အကောင့် (အသစ် သို့မဟုတ် ရှိပြီးသား) လိုအပ်ပါသည်
✅ ငွေပေးချေမှု Card ထည့်ရန် မလိုပါ
✅ လက်ရှိ Adobe Premium သုံးနေသူများလည်း Redeem ပြုလုပ်နိုင်ပါသည်
🔥 Region restriction သို့မဟုတ် ဒေသ မကိုက်ညီသည့် Error တက်ပါက India VPN ချိတ်၍ ထပ်မံ ကြိုးစားပေးပါ။`,

  // 11: Notion Plus – 1year (Upstream 39)
  39: `👥 Premium Productivity လုပ်ဆောင်ချက်များ
🤝 Team Collaboration အပြည့်အဝ လုပ်ဆောင်နိုင်ခြင်း
⚡️ Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)
🔑 အဆင်သင့် အသုံးပြုနိုင်သော အကောင့်ဖြစ်ပါသည်`,

  // 12: XBOX (Upstream 38)
  38: `အဆင်သင့် အသုံးပြုနိုင်သော Xbox အကောင့် (Email + Password) ရရှိပါမည် 🔒
🎁 အကောင့်တစ်ခုချင်းစီတွင် Games • Apps • Gamerscore များ မတူညီဘဲ ပါဝင်နိုင်ပါသည်
⚠️ ပါဝင်သော အကြောင်းအရာများ အကောင့်တစ်ခုနှင့်တစ်ခု ကွဲပြားနိုင်ပါသည်
⚡️ ဝယ်ယူပြီးသည်နှင့် Login အချက်အလက်များကို ချက်ချင်း ရရှိပါမည်`,

  // 13: Windows 11+ 10 Pro (Upstream 37)
  37: `🔑 Activation Key ပါဝင်ပါသည်
⚡️ အသုံးပြုနိုင်သော ဗားရှင်း: Windows 10 Pro နှင့် Windows 11 Pro
📦 License Type: Volume MAK
🚀 Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)
🛡 လွယ်ကူစွာ Activate ပြုလုပ်နိုင်ပါသည်`,

  // 14: ILOVEPDF premium (Upstream 36)
  36: `🛠️ PDF ပြင်ဆင်ခြင်း (Edit PDF)
🔄 Convert PDF (PDF မှ Word / Excel / PowerPoint / JPG သို့ ပြောင်းနိုင်ခြင်း)
📦 Compress PDF (ဖိုင်ဆိုဒ် လျှော့ချနိုင်ခြင်း)
🔗 Merge & Split PDF (ဖိုင်များ ပေါင်းခြင်း/ခွဲခြင်း)
🔒 Protect & Unlock PDF (Password ခတ်ခြင်း/ဖြည်ခြင်း)
💧 Add Watermark & Edit Sign စသည့် Premium လုပ်ဆောင်ချက်များ အပြည့်အစုံ`,

  // 15: Canva Education Panel — 500 Members (Upstream 35)
  35: `👥 Member ၅၀၀ အထိ ထည့်သွင်းနိုင်ပါသည်

📌 စတင်အသုံးပြုပုံ:
1️⃣ Webmail သို့ Login ဝင်ပါ
2️⃣ Canva ထဲသို့ OTP ဖြင့် Login ဝင်ပါ
3️⃣ မိမိစိတ်ကြိုက် Canva Password သတ်မှတ်ပါ
4️⃣ 2FA ဖွင့်ပါ
5️⃣ Webmail တွင် Recovery Email ထည့်သွင်း လုံခြုံအောင်ပြုလုပ်ပါ

🔹 WARRANTY စည်းကမ်းချက်များ:
🚫 မူရင်း Primary Email ကို လုံးဝ မပြောင်းရပါ
🚫 Admin/Team အချက်အလက်များကို မပြောင်းလဲရပါ
⚠️ ချိုးဖောက်ပါက Warranty / အစားထိုးလဲလှယ်ပေးခြင်း မရှိပါ`,

  // 16: Netflix HD 1 Month (Upstream 34)
  34: `1️⃣ Screen • HD အရည်အသွေး
⚡️ Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)
🌟 Full Warranty အပြည့်အစုံ ပါဝင်ပါသည်`,

  // 17: Coursera Plus – 12 Months (Upstream 33)
  33: `✅ Ready-made အဆင်သင့်သုံး အကောင့်
⚡ Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)
🌎 ကမ္ဘာတစ်ဝှမ်း အသုံးပြုနိုင်ပါသည်
• Org+ Premium Access
• Courses များနှင့် Certificates အားလုံး ရယူနိုင်ခြင်း
• Mail | Password | 2FA ပါဝင်ပါသည်
• Warranty ၇ ရက် ပါဝင်ပါသည်
• 2FA Code များ ရယူရန် https://2fa.live/ ကို အသုံးပြုပါ`,

  // 18: CHATGPT PLUS 1 MONTH (Upstream 32)
  32: `⚡ ChatGPT Plus (၁ လ သက်တမ်း)
⚡ မိမိ Mail သို့ ထည့်သွင်းအသုံးပြုနိုင်ပါသည်
⚡ Full Warranty အပြည့်အစုံ ပါဝင်ပါသည်`,

  // 19: Netflix full admin (5 screen) (Upstream 31)
  31: `📺 စက် ၄ လုံး ပြိုင်တူ ကြည့်ရှုနိုင်ပါသည်
4K Ultra HD + HDR အရည်အသွေး
👥 Profiles ၅ ခုအထိ ခွဲသုံးနိုင်ပါသည်
📥 သတ်မှတ်ထားသော စက်များတွင် Download ပြုလုပ်နိုင်ခြင်း
🔒 အကောင့်ကို အပြည့်အဝ စိတ်ကြိုက် စီမံခန့်ခွဲနိုင်ပါသည်
⚡️ Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)`,

  // 20: Spotify Premium – 3 Months (Upstream 30)
  30: `✅ Instant Delivery (ချက်ချင်း ပေးပို့ပါသည်)
🌎 ကမ္ဘာတစ်ဝှမ်း မည်သည့်နေရာမှမဆို သုံးနိုင်ပါသည်
⚡️ လျင်မြန်စွာ Activate ပြုလုပ်နိုင်ပါသည်`,

  // 21: YouTube premium 1 month Family | Plan (Upstream 29)
  29: `✅ မိသားစုဝင် ၅ ယောက်အထိ ထည့်သွင်းနိုင်ပါသည်
✅ ကြော်ငြာလုံးဝမပါသော Videos & Music
✅ Background တွင် ဖွင့်ထားနိုင်ခြင်း
✅ YouTube Music Premium ပါဝင်ပါသည်
✅ မိမိကိုယ်ပိုင် Gmail တွင် တိုက်ရိုက် Activate ပြုလုပ်ပေးပါသည်
✅ လျင်မြန်သော Activation နှင့် Support

📌 Activation အတွက် လိုအပ်ချက်:
ဝယ်ယူပြီးပါက မိမိ၏ Gmail + Password ပို့ပေးရပါမည်။
⚠️ Account ထဲ သွင်းပေးနိုင်ရန် 2-Step Verification (2FA) ကို ခေတ္တ ပိတ်ထားပေးရပါမည်။
🔒 Activate ဖြစ်ပြီးပါက Password ပြောင်းလဲခြင်းနှင့် 2FA ကို ချက်ချင်း ပြန်ဖွင့်နိုင်ပါသည်။`,

  // 22: Canva Pro Admin Pannle Without Leonardo AI (Upstream 28)
  28: `🖥 Canva Pro Admin Panel (Leonardo AI မပါဝင်သေးပါ)
⚡️ Leonardo AI ကို ၁ လပြည့်ပြီးနောက် ရရှိပါမည်
⚡️ ၁ လမှ ၃ လအထိ အသုံးပြုနိုင်ပါသည်
⚡️ ၁ လ Warranty ပါဝင်ပါသည်
⚡️ Member ၁၀၀ အထိ ထည့်သွင်းနိုင်ပါသည်
⚡️ Auto-renewal On ✅
⚡️ Pro Features အားလုံး ပွင့်ပါသည်`,

  // 23: Lovable unlimited (Upstream 27)
  27: `⚡ Lovable Unlimited Credits (Extension အခြေပြု)
⚡ Extension-Based Account ဖြစ်ပါသည်
⚡ အပြည့်အဝ စမ်းသပ်စစ်ဆေးထားပြီး ကောင်းမွန်စွာ အလုပ်လုပ်ပါသည်
⚡ အသုံးပြုပုံ အသေးစိတ်အတွက် Help ကဏ္ဍရှိ "How to Use Loveable" ဗီဒီယိုတွင် ကြည့်ရှုနိုင်ပါသည်။`,

  // 24: GEMINI AI 18 MONTH (Upstream 26)
  26: `⚡️ မိမိကိုယ်ပိုင် Google အကောင့်တွင် ချက်ချင်း Activate ဖြစ်ပါမည်
💳 Card ထည့်ရန်မလိုပါ • 🌐 နိုင်ငံကန့်သတ်ချက် ပြဿနာမရှိပါ
🛡 6 နာရီ Warranty: Activation ပြုလုပ်ချိန်အတွက်သာ အာမခံပါသည်
⚠️ အောင်မြင်စွာ Activate ဖြစ်ပြီးပါက Warranty မပါဝင်ပါ
📌 သက်တမ်းကာလသည် သက်ဆိုင်ရာ ချိတ်ဆက်ထားသော Jio Plan ပေါ်တွင် မူတည်ပါသည်
❗️ သတ်မှတ်ချက်ပြည့်မီသော အကောင့်တစ်ခုလျှင် ၁ ကြိမ်သာ Claim လုပ်နိုင်ပါသည်`,

  // 25: NETFLIX FOR FREE (Upstream 23)
  23: `⚡ Netflix အသုံးပြုခွင့် အစီအစဉ်`,

  // 26: prime video 1 month (Upstream 20)
  20: `🍓 Amazon Prime Video + Prime Gaming + Luna Cloud အကောင့်
✅ ပါဝင်သောအရာများ:
Prime Video
Prime Gaming
Luna Cloud Gaming
ဝန်ဆောင်မှုအားလုံး ကောင်းမွန်စွာ အလုပ်လုပ်ပါသည်
📦 Account Format: EMAIL:PASSWORD:EMAIL_PASSWORD`,

  // 27: STEAM (Upstream 18)
  18: `🎮 Steam အကောင့်
အကောင့်တစ်ခုစီတွင် မတူညီသော ဂိမ်းများ ပါဝင်ပါမည်။ Game Library သည် အကောင့်တစ်ခုနှင့်တစ်ခု ကွဲပြားနိုင်ပါသည်။
Login Credentials ဖြင့် ချက်ချင်း ပို့ဆောင်ပေးပါမည်။`,

  // 28: DEEZER (Upstream 17)
  17: `⚡ Deezer Premium Music အကောင့်
⚡ Mail နှင့် Password ရရှိပါမည်`,

  // 29: CANVA PRO ADMIN (500 INVITATIONS) (Upstream 16)
  16: `✅ Email ဝင်ရောက်ခွင့် အပြည့်အစုံ ရရှိပါမည်
စစ်ဆေးပြီးပါက Email ကို လုံခြုံအောင်ပြုလုပ်ပြီး Password ပြောင်းလဲပါ
စာရွက်စာတမ်းများဖြင့် စစ်ဆေးအတည်ပြုထားသော Full Activated ပစ္စည်းဖြစ်ပါသည်
🤌 Email သို့မဟုတ် Classroom အမည်ကို လုံးဝ မပြောင်းလဲပါနှင့်`,

  // 30: CANVA PRO (Upstream 15)
  15: `⚡️ Canva Pro ရယူပါ ✅
⚡️ မိမိ၏ Gmail ကို ပေးပို့ရုံဖြင့် Team ဖိတ်ခေါ်ချက် (Invite) ကို ချက်ချင်း ရရှိပါမည်`,

  // 31: HIDELY VPN 1 YEAR (Upstream 14)
  14: `💎 Hidely VPN ၁ နှစ် Premium`,

  // 32: ADOBE CREATIVE CLOUD 14-DAY (Upstream 13)
  13: `🙂 Warranty: ၇ ရက်
❗️ အရေးကြီးချက်:
Adobe Subscription ထည့်သွင်းလိုသော Email လိပ်စာကိုသာ ပေးပို့ပေးပါ။`,

  // 33: SUPER GROK 1 MONTH (Upstream 11)
  11: `✏️ SUPER GROK ၁ လ သက်တမ်း
၁၀ ရက် Warranty ပါဝင်ပါသည်
သီးသန့် Private အကောင့် ဖြစ်ပါသည် ✅
100% Secure လုံခြုံစိတ်ချရပါသည် ✅
Mail Access အပြည့်အစုံ ပါဝင်ပါသည် ✅`,

  // 34: Prime Video 6M (Upstream 10)
  10: `Prime Video — ၆ လ သက်တမ်း
၆ လ Subscription
🛡 သီးသန့် Private Profile
✉️ သင်ရရှိမည့်အရာများ:
• Email + Password
📁 အကောင့်အချက်အလက်များနှင့် အကျိုးခံစားခွင့်များ ပါဝင်သော ဖိုင် ရရှိပါမည်
အသုံးပြုနိုင်သော စက်များ: Android / iOS / PC / Browser
🔑 Long Login Access
✅ ၁ လ Warranty ပါဝင်ပါသည်`,

  // 35: NETFLIX 4K 1 MONTH (Upstream 8)
  8: `Netflix – ၁ လ Private Screen
ကမ္ဘာတစ်ဝှမ်း မည်သည့်နေရာမှမဆို အသုံးပြုနိုင်ပါသည်
Warranty သည် Login ပြဿနာများအတွက်သာ သက်ဆိုင်ပါသည်

* သီးသန့် Private Profiles
* Phone, PC, Smart TV နှင့် iPad တို့တွင် ကြည့်ရှုနိုင်ပါသည်

သင်ရရှိမည့်အရာများ:
* Netflix အကောင့် Email နှင့် Password
* သတ်မှတ်ပေးထားသော Profile အမည်နှင့် Profile PIN (လိုအပ်ပါက)`,

  // 36: Emails Outlook/hotmail (Upstream 7)
  7: `Email အပြည့်အစုံ ဝင်ရောက်ခွင့် + OTP ရရှိပါမည်
Format : email|password|token`,

  // 37: SUPER DUOLINGO (Upstream 6)
  6: `✨ Super Duolingo တွင် ရရှိမည့် အကျိုးကျေးဇူးများ:
• No Ads: မည်သည့် ကြော်ငြာအနှောင့်အယှက်မှမပါဘဲ လေ့လာနိုင်ပါသည်
• Unlimited Hearts: အမှားများကြောင့် သင်ယူမှု ရပ်တန့်မသွားစေပါ
• Mistakes Review: မှားခဲ့သည်များကို ပြန်လည်လေ့ကျင့်နိုင်သော Custom Quizzes
• Unlimited Practice Hub: အထူးပြု နားထောင်ခြင်းနှင့် စကားပြော လေ့ကျင့်ခန်းများ
• Legendary Level: Gems များ မလိုဘဲ စိန်ခေါ်မှုများကို ဖြေဆိုနိုင်ပါသည်`,

  // 38: capcut pro 1 year (Upstream 5)
  5: `အကောင့်မဆုံးရှုံးစေရန် ဤစည်းကမ်းချက်များကို လိုက်နာပေးပါ !!! :

အကောင့်မဆုံးရှုံးစေရန် Password သို့မဟုတ် အကောင့်အချက်အလက်များကို မပြောင်းလဲပါနှင့်။
စက် ၂ လုံးထက်ပို၍ Login မဝင်ပါနှင့်။
Login ဝင်ပြီးပါက Settings > Manage Accounts မှတစ်ဆင့် မိမိ၏ Facebook သို့မဟုတ် TikTok ကို ချိတ်ဆက်ပေးပါ။
ဤစည်းကမ်းချက်များကို လိုက်နာပါက အကောင့်ကို ရေရှည် အသုံးပြုနိုင်ပါမည်။`,

  // 39: capcut pro 6 month (Upstream 4)
  4: `❗️ အရေးကြီးချက်: ညွှန်ကြားချက်အားလုံးကို သေချာဖတ်ရှုပြီး လိုက်နာပါ
🔴 မိမိကိုယ်ပိုင် Facebook သို့မဟုတ် TikTok အကောင့်ကို မဖြစ်မနေ ချိတ်ဆက်ပေးရပါမည်
1️⃣ ပေးပို့ထားသော CapCut အကောင့်သို့ Login ဝင်ပါ
2️⃣ Settings → Manage Accounts သို့သွား၍ မိမိ၏ Facebook သို့မဟုတ် TikTok ကို ချိတ်ဆက်ပါ
3️⃣ Password သို့မဟုတ် အကောင့်အချက်အလက်များကို လုံးဝ မပြောင်းလဲပါနှင့်
4️⃣ စက် ၂ လုံးထက်ပို၍ Login မဝင်ပါနှင့်
⚠️ ညွှန်ကြားချက်များကို သေချာစွာ ဖတ်ရှုလိုက်နာရပါမည်
❌ အကောင့်မချိတ်ဆက်ပါက သို့မဟုတ် လိုက်နာမှုမရှိပါက အကောင့်အသုံးပြုခွင့် ဆုံးရှုံးနိုင်ပါသည်`,

  // 40: capcut pro 3 month (Upstream 3)
  3: `❗️ အရေးကြီးချက်: ညွှန်ကြားချက်အားလုံးကို သေချာဖတ်ရှုပြီး လိုက်နာပါ
🔴 မိမိကိုယ်ပိုင် Facebook သို့မဟုတ် TikTok အကောင့်ကို မဖြစ်မနေ ချိတ်ဆက်ပေးရပါမည်
1️⃣ ပေးပို့ထားသော CapCut အကောင့်သို့ Login ဝင်ပါ
2️⃣ Settings → Manage Accounts သို့သွား၍ မိမိ၏ Facebook သို့မဟုတ် TikTok ကို ချိတ်ဆက်ပါ
3️⃣ Password သို့မဟုတ် အကောင့်အချက်အလက်များကို လုံးဝ မပြောင်းလဲပါနှင့်
4️⃣ စက် ၂ လုံးထက်ပို၍ Login မဝင်ပါနှင့်
⚠️ ညွှန်ကြားချက်များကို သေချာစွာ ဖတ်ရှုလိုက်နာရပါမည်
❌ အကောင့်မချိတ်ဆက်ပါက သို့မဟုတ် လိုက်နာမှုမရှိပါက အကောင့်အသုံးပြုခွင့် ဆုံးရှုံးနိုင်ပါသည်`,

  // 41: capcut pro 1 month (Upstream 2)
  2: `❗️ အရေးကြီးချက်: ညွှန်ကြားချက်အားလုံးကို သေချာဖတ်ရှုပြီး လိုက်နာပါ
🔴 မိမိကိုယ်ပိုင် Facebook သို့မဟုတ် TikTok အကောင့်ကို မဖြစ်မနေ ချိတ်ဆက်ပေးရပါမည်
1️⃣ ပေးပို့ထားသော CapCut အကောင့်သို့ Login ဝင်ပါ
2️⃣ Settings → Manage Accounts သို့သွား၍ မိမိ၏ Facebook သို့မဟုတ် TikTok ကို ချိတ်ဆက်ပါ
3️⃣ Password သို့မဟုတ် အကောင့်အချက်အလက်များကို လုံးဝ မပြောင်းလဲပါနှင့်
4️⃣ စက် ၂ လုံးထက်ပို၍ Login မဝင်ပါနှင့်
⚠️ ညွှန်ကြားချက်များကို သေချာစွာ ဖတ်ရှုလိုက်နာရပါမည်
❌ အကောင့်မချိတ်ဆက်ပါက သို့မဟုတ် လိုက်နာမှုမရှိပါက အကောင့်အသုံးပြုခွင့် ဆုံးရှုံးနိုင်ပါသည်`,

  // 42: Microsoft Office 365 plus (Upstream 1)
  1: `Emails Outlook/hotmail
Email အပြည့်အစုံ ဝင်ရောက်ခွင့် + OTP ရရှိပါမည်
Format : email|password|token`,
};

export async function updateMyanmarDescriptions() {
  const db = getDb();
  let updatedCount = 0;

  for (const [upstreamIdStr, desc] of Object.entries(MYANMAR_PRODUCT_DESCRIPTIONS)) {
    const upstreamId = parseInt(upstreamIdStr, 10);
    const res = await db
      .update(products)
      .set({
        descriptionMmk: desc,
        updatedAt: new Date(),
      })
      .where(eq(products.upstreamProductId, upstreamId))
      .returning();
    if (res.length > 0) {
      updatedCount += res.length;
    }
  }

  console.log(`Successfully updated ${updatedCount} products with direct translated Myanmar descriptions!`);
}

if (process.argv[1]?.endsWith("seed-myanmar-descriptions.ts")) {
  updateMyanmarDescriptions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
