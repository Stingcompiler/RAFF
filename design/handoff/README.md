> **أرشيف.** منذ WO-15 (2026-10-23) مرجع التصميم هو `docs/design/` (Design Reference v2.2 وملف رَفّ وسجل القرارات). هذا المجلد يبقى للتاريخ، وتبقى مراجعه البصرية هي خط الأساس حتى تحلّ لقطات Playwright محلها في WO-15a.

# حزمة التصميم المعتمدة واللقطات المرجعية

هذا المجلد يحوي حزمة التصميم كما سُلّمت (الحزمة الخامسة، 22 أكتوبر 2026، «Round 4»): ملفات `.dc.html` و`HANDOFF.md` و`screenshots/` و`support.js` و`image-slot.js` و`uploads/`. لا يُعدَّل أي منها. الإضافتان الوحيدتان هما `generate-reference.mjs` وهذا الملف، والناتج `reference/`.

## توليد اللقطات المرجعية

```bash
pnpm install                         # مرة واحدة، من جذر المستودع
pnpm exec playwright install chromium
make reference                       # نسخة macOS المحلية في reference-local/ (خارج Git)
```

المراجع المعتمدة في `reference/` تُولَّد على Linux داخل صورة Playwright نفسها التي تشغّل اختبار `visual` في CI: workflow ‏`.github/workflows/references.yml` (يدوياً، أو بدفع فرع `ci/references`)، ثم يُنزَّل الأثر `reference` ويُثبَّت في المستودع. السبب: رسم الخطوط يختلف بين macOS وLinux، فتصل الفروق إلى 4% في صفحات المتجر الإنجليزية على 390. على Mac يقارن `make visual` مع `reference-local/` إن وُجدت.

خيارات: `--only "Raff POS"` لملف واحد، `--state payment` لحالة واحدة، `--list` لطباعة القائمة دون تشغيل.

الناتج: `reference/{file}/{state}-{locale}-{theme}-{width}.png`، و`reference/manifest.json` يربط كل لقطة بملف التصميم والحالة واللغة والثيم والعرض. أسماء المجلدات: `raff-pos`، `raff-screens`، `raff-mobile`، `storefront`، `raff-components`، `raff-landing`. اللقطات المرجعية تُولَّد بهذا السكربت فقط ولا تُحرَّر يدوياً (`CLAUDE.md` القاعدة 23).

## كيف يعمل

1. **خادم محلي** على منفذ عشوائي يخدم هذا المجلد، ويخدم React 18.3.1 وReact DOM 18.3.1 وBabel standalone 7.29.0 من `node_modules`، وخطوط IBM Plex Sans وIBM Plex Sans Arabic (400–700) من `@fontsource`.
2. **بلا CDN:** `support.js` يبحث عن روابط unpkg في `window.__resources` قبل تحميلها، فيحقن السكربت هذا الكائن بروابط الخادم المحلي. طلبات Google Fonts تُعترض ويُردّ عليها بـCSS يستورد ملفات `@fontsource` المحلية. أي طلب خارجي آخر يُحجب، ووجوده يُفشل اللقطة.
3. **التبديل بالنقر:** كل لقطة تبدأ بصفحة جديدة (سياق متصفح مستقل)، ثم تُنفَّذ خطوات الحالة بالنقر: أزرار شريط النموذج أعلى الملف (`العربية`، `English`، `Light`، `Dark`، وأسماء الحالات كما تظهر)، وعناصر الصفحة نفسها حين لا يكون للحالة زر في الشريط (الشريط الجانبي في `Raff Screens`، وروابط المتجر). الخطوات تُنفَّذ بالعربية (اللغة الافتراضية لكل ملف)، ثم تُبدَّل اللغة والثيم من الشريط، لأن التبديل يحفظ الشاشة الحالية.
4. **الالتقاط:** يُخفى شريط النموذج (ليس جزءاً من الشاشة)، وتُعطَّل الحركة (`reducedMotion` و`animations: disabled`)، ثم لقطة كاملة الصفحة بمقياس 1×.
5. **حالات زمنية في المتجر:** `sending` و`verifying` تُجمَّد بساعة Playwright الوهمية (`clock.install` + `pauseAt`) ثم يُقدَّم الوقت بـ`runFor`، فلا تعتمد اللقطة على التوقيت.
6. **إطار المتجر:** `Storefront` يرسم كل وضع داخل إطار بارتفاع ثابت (1280×900 لسطح المكتب، وهاتف بشاشة 390) يتمرر داخلياً. يُفرد السكربت هذا الإطار إلى كامل ارتفاع محتواه ويلتقط الشاشة وحدها، فتساوي اللقطة لقطة صفحة كاملة بذلك العرض. في وضع 390 لا تظهر روابط الرأس، لذا تُفتح الشاشة في وضع سطح المكتب ثم يُنقر `Mobile 390` (السلة وحدها تُلتقط من شريط السلة السفلي الخاص بالهاتف).

## التغطية (186 لقطة)

| الملف | الحالات | اللغة/الثيم | العرض | العدد |
|---|---|---|---|---|
| `Raff POS` | `pos`، `payment`، `payment-bank`، `payment-credit`، `payment-split`، `from-order`، `reconnecting`، `server-offline`، `approving`، `verifying`، `approved`، `held-sales`، `empty-cart`، `no-results`، `batches`، `approval-failed`، `shift-closed` | ar-light، en-dark | 1440، 1366 | 68 |
| `Raff Screens` | `dashboard`، `orders`، `inventory`، `purchases`، `returns`، `stocktake`، `shifts`، `parties`، `transfers`، `reports`، `settings`، `storefront-settings`، `storefront-catalog`، `login`، `order-new`، `order-needs-contact`، `order-confirmed`، `order-preparing`، `order-ready`، `order-completed`، `order-cancelled` | ar-light، en-dark | 1440 | 42 |
| `Raff Mobile` | `default` (360، 390، 412)، `keyboard`، `camera-denied` | ar-light، en-dark | عرض الهاتف المختار؛ اللوحة كما هي على 1440 | 10 |
| `Storefront` | `home`، `store`، `product`، `product-rx`، `cart`، `checkout-idle`، `checkout-sending`، `checkout-failed`، `checkout-verifying`، `checkout-success`، `order`، `track`، `about`، `contact`، `policy` | ar، en (فاتح فقط) | 1280، 390 | 60 |
| `Raff Components` | `default` | ar، en (فاتح) | 1440 | 2 |
| `Raff Landing` | `default` | ar، en (فاتح) | 1440، 390 | 4 |

ملاحظات على التغطية:

- `payment` هو نموذج الدفع النقدي الافتراضي. أُضيفت الطرق الثلاث الأخرى (`payment-bank`، `payment-credit`، `payment-split`) بالنقر على تبويبها داخل الحوار، لأن §4.4 في وثيقة البناء يطلب «pay (4 طرق)».
- `policy` (سياسة الخصوصية والطلبات) أُضيفت لأن §4.4 يذكر المسار `policies/[slug]`.
- تفاصيل الطلب: كل حالة من الحالات السبع في جدول Round 4 تُلتقط بفتح طلب في تلك الحالة من قائمة الطلبات (`O-1042` جديد، `O-1043` يحتاج تواصلاً، `O-1041` مؤكد، `O-1040` قيد التجهيز، `O-1039` جاهز، `O-1038` مكتمل، `O-1036` ملغى).
- `checkout-success` هي صفحة الطلب بعد الإرسال الناجح (`O-1043`)، و`order` هي صفحة الطلب عبر «تتبّع طلب» (`O-1041` مع رقم الهاتف التجريبي في الملف).
- `Storefront` و`Raff Components` و`Raff Landing` ليس في شريطها زر للثيم، فهي فاتحة فقط ويحمل اسم الملف `light`.
- `Pharmacy Landing` خارج النطاق (§4.1)، و`Raff Screens Orders` جزء مضمَّن غير مرجعي، و`Raff Flows` و`Raff Board` و`Raff Tokens` ليست شاشات. لا تُولَّد لها لقطات.

## حالات غير مولَّدة

لا شيء. كل صف في جدول WO-00 مولَّد بالكامل. أي حالة يتعذّر الوصول إليها بالنقر مستقبلاً تُسجَّل هنا مع السبب، ولا تُختلق لقطة لها.

حالات موجودة في الملفات لكنها خارج جدول WO-00، وتُضاف مع أمر العمل الذي يبني شاشتها (مسجّلة في `docs/spec/BACKLOG.md`): درج تفاصيل الصنف بتبويباته الستة وحوارات الاعتماد في `Raff Screens`؛ حوار الإلغاء وحالتا «النقص» و«مرتبط بفاتورة» في تفاصيل الطلب؛ التصفية والترتيب في المتجر.

## الثبات

في مقارنة تشغيلين كاملين متتاليين (أربعة عمال متوازين): 165 من 186 لقطة متطابقة بكسلاً بكسل، وأكبر فرق 0.11% من البكسلات (`raff-components/default-en-light-1440`)، والتسامح 2%. اللقطات مولَّدة على macOS (Chromium 1248 من Playwright 1.64.1).
