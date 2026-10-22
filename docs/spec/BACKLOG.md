# BACKLOG

ما اكتُشف أثناء أوامر العمل ولم يُنفَّذ لأنه خارج نطاقها. كل بند: المصدر، الوصف، والاقتراح.

## من WO-00 (2026-10-22)

### قرارات مطلوبة

1. **تغطية اللقطات البصرية مقابل ما ترسمه الملفات.** `CLAUDE.md` القاعدة 23 ووثيقة البناء §4.5 تطلبان لكل شاشة `ar-light` و`en-dark` على 1440 و390. لكن `Raff POS` و`Raff Screens` إطارات بحد أدنى 1280 بلا نسخة 390 (الجوال في ملف منفصل `Raff Mobile`)، و`Storefront` و`Raff Landing` و`Raff Components` بلا ثيم داكن. جدول WO-00 يتبع ما ترسمه الملفات فعلاً. **اقتراح:** تعديل القاعدة 23 لتحيل إلى `design/handoff/reference/manifest.json` كمصدر لقائمة اللقطات، بدل التركيبة الثابتة.
2. **عدد الرموز.** وثيقة البناء §4.2 تقول «19 رمزاً»، وWO-00 و`HANDOFF.md` يضيفان `brand` و`brand-ink` (21). نُفّذت 21، و`brand` يساوي `primary` افتراضياً. **اقتراح:** تحديث §4.2.
3. **اسم الرمز.** ملف `Raff Tokens` يسمّي الرمز `raised`، و`CLAUDE.md` يسمّيه `surface-raised`. نُفّذ باسم `surface-raised` وبقيمة `raised` نفسها.

### مؤجَّل إلى أوامر لاحقة

4. `CLAUDE.md` القاعدة 6 تحيل إلى `backend/apps/inventory/LOCKING.md`، وهو غير موجود بعد → WO-04/WO-05.
5. لقطات مرجعية لحالات موجودة في الملفات وخارج جدول WO-00: درج تفاصيل الصنف بتبويباته الستة (منها تبويب «المتجر») وحوارات الاعتماد في `Raff Screens`؛ حوار إلغاء الطلب وحالتا «النقص» و«مرتبط بفاتورة»؛ التصفية والترتيب في المتجر → تُضاف إلى `generate-reference.mjs` مع WO-03 وWO-08 وWO-09.
6. CSP للواجهة (Next.js) بلا `unsafe-inline` → WO-12. الخلفية لا تخدم HTML الآن.
7. صورة إنتاج للواجهة (Next standalone) وCaddy وGunicorn خلف Caddy، و`install.sh` و`update.sh` و`restore.sh` → WO-10. `backend/Dockerfile` يحوي هدف `prod` بـGunicorn، لكنه لم يُجرَّب.
8. `auth.User` و`auth.Group` مستثناة مؤقتاً في `EXEMPT.md`، ويُستبدلان بنموذج `accounts.User` مقيّد بالمؤسسة في WO-02، ثم تُحذف الاستثناءات.
9. إنشاء أول `Organization` وضبط `SINGLE_ORG_ID` يحتاج أمراً إدارياً (مثل `bootstrap_org`) → WO-02 أو WO-10.

### ملاحظات بيئة

10. جهاز التطوير الحالي بلا Docker، لذا تحقّق `make dev` (Compose) في CI فقط (مهمة `compose`). الاختبارات المحلية جرت على PostgreSQL 16 من Homebrew، وCompose وCI على 17.11.
11. خط الأساس البصري لصفحة placeholder (`tests/e2e/__screenshots__/`) مولَّد على macOS، وCI يقارن على Linux بتسامح 2%. إن تجاوز فرق رسم الخطوط التسامح، يُولَّد خط الأساس على Linux (حاوية Playwright الرسمية) ويُعتمد ذلك في `README`.
12. Prettier حوّل قيم hex في `tokens.css` إلى أحرف صغيرة. القيم نفسها لم تتغير.
