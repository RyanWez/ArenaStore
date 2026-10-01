import { getDb, products } from "@arena/db";
import { eq } from "drizzle-orm";

export const MYANMAR_PRODUCT_DESCRIPTIONS: Record<number, string> = {
  // 1: Claude $100 API Key 1 Month (Upstream 50)
  50: `⚡ $100 API Credits (ရက် ၃၀ သက်တမ်း)
⚡ api.mwapi.dev တွင် Redeem Code ဖြင့် ချက်ချင်း အသုံးပြုနိုင်ပါသည်
⚡ API Gateway မှတစ်ဆင့် လျင်မြန်ချောမွေ့စွာ ချိတ်ဆက်နိုင်ပါသည်`,

  // 2: ResearchGate — 6 Months Access (Upstream 48)
  48: `⚡ ResearchGate ၆ လ သက်တမ်း အပြည့်
⚡ ပညာရေးနှင့် သုတေသန စာတမ်းများကို အကန့်အသတ်မရှိ ရှာဖွေနိုင်ပါသည်
⚡ Fast & Easy Activation (၁ လ အာမခံ ပါဝင်ပါသည်)`,

  // 3: Duolingo Super 12 Months (Upstream 47)
  47: `⚡ Super Plan (၁၂ လ သက်တမ်း အပြည့်)
⚡ မိမိကိုယ်ပိုင် Duolingo အကောင့်တွင် တိုက်ရိုက် အသုံးပြုနိုင်ပါသည်
⚡ ကြော်ငြာမပါ၊ Unlimited Hearts ဖြင့် အဆင်ပြေစွာ လေ့လာနိုင်ပါသည်
⚡ Link နှိပ်ပြီး Claim Offer ရယူရုံဖြင့် ချက်ချင်း ပွင့်ပါမည်`,

  // 4: Eleven Reader — 12 Months Ultra Plan (Upstream 46)
  46: `⚡ Eleven Reader Ultra Plan (၁၂ လ သက်တမ်း)
⚡ စာအုပ်နှင့် ဖိုင်များကို သဘာဝကျသော AI အသံများဖြင့် နားဆင်နိုင်ပါသည်
⚡ Audiobooks & eBooks ၂၀၀,၀၀၀ ကျော် အခမဲ့ ဒေါင်းလုဒ်ရယူနိုင်ပါသည်`,

  // 5: Autodesk Admin Panel — 3 Years (Upstream 45)
  45: `⚡ Autodesk Admin Panel (၃ နှစ် သက်တမ်း)
⚡ User အယောက် ၃,၀၀၀ အထိ Invite ဖိတ်ခေါ်စီမံနိုင်ပါသည်
⚡ AutoCAD, Revit, 3ds Max, Maya အပါအဝင် Apps အားလုံး သုံးနိုင်ပါသည်
⚡ Gmail | Password အပြည့်အစုံဖြင့် ပို့ဆောင်ပေးပါသည်`,

  // 6: JetBrains Premium (Upstream 44)
  44: `⚡ JetBrains All Products Pack (Developer Tools အပြည့်အစုံ)
⚡ IntelliJ, PyCharm, WebStorm, PhpStorm အားလုံး သုံးနိုင်ပါသည်
⚡ ချက်ချင်း Login ဝင်ရောက်ပြီး အဆင်သင့် အသုံးပြုနိုင်ပါသည်`,

  // 7: Gmail Account (Upstream 43)
  43: `⚡ အသစ် ဖန်တီးထားသော Fresh Gmail အကောင့်
⚡ Recovery & Password အပြည့်အစုံ ပါဝင်ပါသည်
⚡ စိတ်ချယုံကြည်စွာ ချက်ချင်း ဝင်ရောက် အသုံးပြုနိုင်ပါသည်`,

  // 8: Nord vpn 1 month (Upstream 42)
  42: `⚡ NordVPN Premium (၁ လ သက်တမ်း)
⚡ စက် ၁ လုံးအတွက် သီးသန့် အသုံးပြုရန် ဖြစ်ပါသည်
⚡ မြန်ဆန်သော Server များဖြင့် လုံခြုံစွာ ချိတ်ဆက်နိုင်ပါသည် (၁ လ အာမခံ)`,

  // 9: Autodesk All Apps | 3-Year License (Upstream 41)
  41: `⚡ Autodesk Apps အားလုံး (၃ နှစ် သက်တမ်း လိုင်စင်)
⚡ AutoCAD, 3ds Max, Revit, Maya စသည့် Apps ၃၄+ ကျော် ပါဝင်ပါသည်
⚡ ကျောင်းသား/ဒီဇိုင်နာများအတွက် အထူးသင့်လျော်ပါသည်`,

  // 10: Adobe Express 12 Month (Activation Link) (Upstream 40)
  40: `⚡ Adobe Express Premium (၁၂ လ သက်တမ်း)
⚡ မိမိကိုယ်ပိုင် Adobe Account သို့ Activation Link ဖြင့် ထည့်သွင်းနိုင်ပါသည်
⚡ Card ထည့်ရန် မလိုဘဲ Premium Features အားလုံး သုံးနိုင်ပါသည်`,

  // 11: Notion Plus – 1year (Upstream 39)
  39: `⚡ Notion Plus Plan (၁ နှစ် သက်တမ်း)
⚡ အကန့်အသတ်မရှိ စာမျက်နှာနှင့် ဖိုင်များ Upload ပြုလုပ်နိုင်ပါသည်
⚡ Team Collaboration အပြည့်အဝ အသုံးပြုနိုင်ပါသည်`,

  // 12: XBOX (Upstream 38)
  38: `⚡ Ready-to-use Xbox အကောင့် (Email + Password)
⚡ ဂိမ်းများနှင့် Apps အမျိုးမျိုး ပါဝင်နိုင်ပါသည်
⚡ ဝယ်ယူပြီးသည်နှင့် Login အချက်အလက်များ ချက်ချင်း ရရှိပါမည်`,

  // 13: Windows 11+ 10 Pro (Upstream 37)
  37: `⚡ Windows 10 Pro / Windows 11 Pro Activation Key
⚡ Volume MAK License ဖြင့် အလွယ်တကူ Activate လုပ်နိုင်ပါသည်
⚡ Key ကို ချက်ချင်း ပို့ဆောင်ပေးပါသည်`,

  // 14: ILOVEPDF premium (Upstream 36)
  36: `⚡ iLovePDF Premium အကောင့် အပြည့်အစုံ
⚡ PDF ဖိုင်များကို Edit, Convert, Compress, Merge လွတ်လပ်စွာ လုပ်နိုင်ပါသည်
⚡ အကန့်အသတ်မရှိ မြန်ဆန်စွာ လုပ်ဆောင်နိုင်ပါသည်`,

  // 15: Canva Education Panel — 500 Members (Upstream 35)
  35: `⚡ Canva Education Admin Panel (User ၅၀၀ ထည့်သွင်းနိုင်သည်)
⚡ Webmail အပြည့်အစုံ ရရှိမည်ဖြစ်ပြီး OTP ဖြင့် အလွယ်တကူ စတင်နိုင်ပါသည်
⚡ Pro Features အားလုံးကို အကန့်အသတ်မရှိ သုံးနိုင်ပါသည်`,

  // 16: Netflix HD 1 Month (Upstream 34)
  34: `⚡ Netflix HD 1 Month (Screen ၁ ခု သီးသန့် အသုံးပြုရန်)
⚡ ဖုန်း၊ ကွန်ပျူတာ၊ Smart TV အားလုံးတွင် ကြည့်ရှုနိုင်ပါသည်
⚡ ဝယ်ယူပြီးသည်နှင့် အကောင့်ချက်ချင်း ရရှိပါမည် (၁ လ အာမခံ)`,

  // 17: Coursera Plus – 12 Months (Upstream 33)
  33: `⚡ Coursera Plus (၁၂ လ သက်တမ်း အပြည့်)
⚡ Course များနှင့် တရားဝင် Professional Certificates များ အားလုံး အခမဲ့ ယူနိုင်ပါသည်
⚡ Ready-made Account (Mail + Password + 2FA) ဖြင့် ချက်ချင်း သုံးနိုင်ပါသည်`,

  // 18: CHATGPT PLUS 1 MONTH (Upstream 32)
  32: `⚡ ChatGPT Plus (GPT-4o / Canvas / DALL-E 3 အပြည့်အစုံ)
⚡ မိမိ Mail ဖြင့် အသုံးပြုနိုင်ပြီး ၁ လ သက်တမ်း အာမခံ ပါဝင်ပါသည်
⚡ စာရေးခြင်း၊ ကုဒ်ရေးခြင်းနှင့် အလုပ်များအတွက် အထူးသင့်လျော်ပါသည်`,

  // 19: Netflix full admin (5 screen) (Upstream 31)
  31: `⚡ Netflix Full Admin အကောင့် (5 Profiles / 4 Screens ပြိုင်တူ ကြည့်ရှုနိုင်သည်)
⚡ 4K Ultra HD + HDR အကောင်းဆုံး ရုပ်ထွက် အရည်အသွေး
⚡ အကောင့် အချက်အလက် အပြည့်အစုံကို စိတ်ကြိုက် စီမံနိုင်ပါသည်`,

  // 20: Spotify Premium – 3 Months (Upstream 30)
  30: `⚡ Spotify Premium (၃ လ သက်တမ်း)
⚡ ကြော်ငြာလုံးဝမပါဘဲ သီချင်းများကို အကန့်အသတ်မရှိ နားဆင်နိုင်ပါသည်
⚡ Offline နားဆင်ရန် သီချင်းများ Download ပြုလုပ်နိုင်ပါသည်`,

  // 21: YouTube premium 1 month Family | Plan (Upstream 29)
  29: `⚡ YouTube Premium Family Plan (၁ လ သက်တမ်း)
⚡ မိသားစုဝင် ၅ ယောက်အထိ ထည့်သွင်း အသုံးပြုနိုင်ပါသည်
⚡ ကြော်ငြာမပါ၊ Background Play နှင့် YouTube Music အပြည့်အစုံ ပါဝင်ပါသည်`,

  // 22: Canva Pro Admin Pannle Without Leonardo AI (Upstream 28)
  28: `⚡ Canva Pro Admin Panel (User ၁၀၀ ထည့်သွင်းနိုင်သည်)
⚡ Pro Templates နှင့် Graphic Elements အားလုံး သုံးနိုင်ပါသည်
⚡ ၁ လ အာမခံ ပါဝင်ပြီး အဆင်ပြေစွာ စီမံနိုင်ပါသည်`,

  // 23: Lovable unlimited (Upstream 27)
  27: `⚡ Lovable AI Unlimited Credits (Extension အခြေပြု)
⚡ Web Apps များကို AI ဖြင့် အကန့်အသတ်မရှိ ဖန်တီးတည်ဆောက်နိုင်ပါသည်
⚡ အသုံးပြုပုံ လမ်းညွှန်ချက် အပြည့်အစုံ ပါဝင်ပါသည်`,

  // 24: GEMINI AI 18 MONTH (Upstream 26)
  26: `⚡ Google Gemini Advanced (၁၈ လ သက်တမ်း)
⚡ မိမိ ကိုယ်ပိုင် Google Account တွင် တိုက်ရိုက် Activate လုပ်နိုင်ပါသည်
⚡ Card ထည့်ရန် မလိုဘဲ Gemini 1.5 Pro / Ultra Features အားလုံး သုံးနိုင်ပါသည်`,

  // 25: NETFLIX FOR FREE (Upstream 23)
  23: `⚡ Netflix အသုံးပြုခွင့် အစီအစဉ်
⚡ ရုပ်ရှင်နှင့် ဇာတ်လမ်းတွဲများကို အဆင်ပြေစွာ ကြည့်ရှုနိုင်ပါသည်`,

  // 26: prime video 1 month (Upstream 20)
  20: `⚡ Amazon Prime Video (၁ လ သက်တမ်း)
⚡ ရုပ်ရှင်၊ ဇာတ်လမ်းတွဲများနှင့် Prime Gaming ပါဝင်ပါသည်
⚡ ဖုန်း၊ TV၊ ကွန်ပျူတာ အားလုံးတွင် ကြည့်ရှုနိုင်ပါသည်`,

  // 27: STEAM (Upstream 18)
  18: `⚡ Steam Gaming အကောင့်
⚡ အကောင့်တိုင်းတွင် ကွဲပြားသော စိတ်ဝင်စားဖွယ် ဂိမ်းများ ပါဝင်ပါသည်
⚡ Login Credentials ချက်ချင်း ရရှိပြီး ဒေါင်းလုဒ်ဆွဲ ကစားနိုင်ပါသည်`,

  // 28: DEEZER (Upstream 17)
  17: `⚡ Deezer Premium Music အကောင့်
⚡ HiFi သီချင်းများကို အရည်အသွေးမြင့်မားစွာ အကန့်အသတ်မရှိ နားဆင်နိုင်ပါသည်`,

  // 29: CANVA PRO ADMIN (500 INVITATIONS) (Upstream 16)
  16: `⚡ Canva Pro Admin Panel (ဖိတ်ခေါ်ခွင့် ၅၀၀)
⚡ Full Email Access ဖြင့် အကောင့်ကို စိတ်ကြိုက် စီမံခန့်ခွဲနိုင်ပါသည်
⚡ Pro Features အားလုံးကို အပြည့်အဝ အသုံးပြုနိုင်ပါသည်`,

  // 30: CANVA PRO (Upstream 15)
  15: `⚡ Canva Pro တစ်ဦးတည်းသုံး အကောင့်
⚡ မိမိ Gmail သို့ Team Invite ပို့ပေးပြီး ချက်ချင်း စတင် သုံးနိုင်ပါသည်
⚡ Templates, Stock Photos, Pro Graphics အားလုံး သုံးနိုင်ပါသည်`,

  // 31: HIDELY VPN 1 YEAR (Upstream 14)
  14: `⚡ Hidely VPN Premium (၁ နှစ် သက်တမ်း)
⚡ မြန်ဆန်ပြီး လုံခြုံစိတ်ချရသော VPN ချိတ်ဆက်မှု
⚡ ကန့်သတ်ထားသော Websites များကို လွတ်လပ်စွာ ဝင်ရောက်နိုင်ပါသည်`,

  // 32: ADOBE CREATIVE CLOUD 14-DAY (Upstream 13)
  13: `⚡ Adobe Creative Cloud (၁၄ ရက် စမ်းသပ် အသုံးပြုခွင့်)
⚡ Photoshop, Illustrator, Premiere Pro အပါအဝင် Apps အားလုံး သုံးနိုင်ပါသည်
⚡ မိမိ Adobe Account သို့ တိုက်ရိုက် ထည့်သွင်းပေးပါသည်`,

  // 33: SUPER GROK 1 MONTH (Upstream 11)
  11: `⚡ xAI Super Grok (၁ လ သက်တမ်း)
⚡ Fully Private အကောင့် (Mail Access အပြည့်အစုံ ပါဝင်သည်)
⚡ ၁၀ ရက် အာမခံ ပါဝင်ပြီး အဆင့်မြင့် AI Features များ သုံးနိုင်ပါသည်`,

  // 34: Prime Video 6M (Upstream 10)
  10: `⚡ Amazon Prime Video (၆ လ သက်တမ်း)
⚡ Private Profile သီးသန့် ရရှိမည် ဖြစ်ပါသည်
⚡ Android, iOS, PC, Smart TV အားလုံးတွင် ကြည့်ရှုနိုင်ပါသည် (၁ လ အာမခံ)`,

  // 35: NETFLIX 4K 1 MONTH (Upstream 8)
  8: `⚡ Netflix 4K Ultra HD (၁ လ သက်တမ်း)
⚡ Private Profile + PIN Code ဖြင့် သီးသန့် ကြည့်ရှုနိုင်ပါသည်
⚡ ဖုန်း၊ ကွန်ပျူတာ၊ Smart TV တို့တွင် စိတ်တိုင်းကျ ကြည့်နိုင်ပါသည်`,

  // 36: Emails Outlook/hotmail (Upstream 7)
  7: `⚡ Outlook / Hotmail အကောင့် အသစ်
⚡ Full Email Access + OTP ရရှိပါမည်
⚡ Format: email | password | token ဖြင့် ချက်ချင်း ပေးပို့ပါသည်`,

  // 37: SUPER DUOLINGO (Upstream 6)
  6: `⚡ Super Duolingo Plan (ကြော်ငြာလုံးဝမပါ)
⚡ Unlimited Hearts ဖြင့် လေ့လာသင်ယူမှု မပြတ်တောက်စေပါ
⚡ Mistakes Review နှင့် အထူးလေ့ကျင့်ခန်းများ အပြည့်အစုံ ပါဝင်ပါသည်`,

  // 38: capcut pro 1 year (Upstream 5)
  5: `⚡ CapCut Pro (၁ နှစ် သက်တမ်း)
⚡ Pro Transitions, Filters, Effects အားလုံး အပြည့်အစုံ သုံးနိုင်ပါသည်
⚡ Login ဝင်ပြီး မိမိ Facebook သို့မဟုတ် TikTok နှင့် ချိတ်ဆက်အသုံးပြုရပါမည်`,

  // 39: capcut pro 6 month (Upstream 4)
  4: `⚡ CapCut Pro (၆ လ သက်တမ်း)
⚡ Pro Transitions, Auto Captions, Effects အားလုံး အသုံးပြုနိုင်ပါသည်
⚡ Login ဝင်ပြီး မိမိ Facebook/TikTok နှင့် ချိတ်ဆက်အသုံးပြုရပါမည်`,

  // 40: capcut pro 3 month (Upstream 3)
  3: `⚡ CapCut Pro (၃ လ သက်တမ်း)
⚡ Pro Effects, Filters, 4K Export အားလုံး အသုံးပြုနိုင်ပါသည်
⚡ Login ဝင်ပြီး မိမိ Facebook/TikTok နှင့် ချိတ်ဆက်အသုံးပြုရပါမည်`,

  // 41: capcut pro 1 month (Upstream 2)
  2: `⚡ CapCut Pro (၁ လ သက်တမ်း)
⚡ ဗီဒီယို Editing Pro Tools အားလုံး အပြည့်အစုံ သုံးနိုင်ပါသည်
⚡ Login ဝင်ပြီး မိမိ Facebook/TikTok နှင့် ချိတ်ဆက်အသုံးပြုရပါမည်`,

  // 42: Microsoft Office 365 plus (Upstream 1)
  1: `⚡ Microsoft Office 365 Plus အကောင့်
⚡ Word, Excel, PowerPoint, Outlook အပြည့်အစုံ သုံးနိုင်ပါသည်
⚡ 1TB OneDrive Cloud Storage ပါဝင်ပါသည်`,
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

  console.log(`Successfully updated ${updatedCount} products with Myanmar descriptions!`);
}

if (process.argv[1]?.endsWith("seed-myanmar-descriptions.ts")) {
  updateMyanmarDescriptions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
